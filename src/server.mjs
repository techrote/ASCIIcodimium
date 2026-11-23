import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const maxRequestBytes = 256 * 1024;
const maxUpstreamBytes = 5 * 1024 * 1024;
const previewLimit = 12;
const assets = new Map([
  ['/', ['web/index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['web/app.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['web/styles.css', 'text/css; charset=utf-8']],
]);

function json(res, status, value) {
  const content = JSON.stringify(value);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(content);
}

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function loopbackUpstream(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('AC_OPENCODE_URL must be an uncredentialed HTTP loopback origin');
  }
  return url.origin;
}

function validID(value) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) fail(400, 'Invalid identifier');
  return value;
}

async function readJsonBody(req, limit = maxRequestBytes) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
    fail(415, 'Expected application/json');
  }
  let size = 0;
  const chunks = [];
  for await (const part of req) {
    size += part.length;
    if (size > limit) fail(413, 'Request too large');
    chunks.push(part);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || Array.isArray(value) || typeof value !== 'object') fail(400, 'Expected JSON object');
    return value;
  } catch (error) {
    if (error.status) throw error;
    fail(400, 'Malformed JSON');
  }
}

async function readLimited(response) {
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = [];
  let count = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      count += value.byteLength;
      if (count > maxUpstreamBytes) fail(502, 'OpenCode response exceeds safety limit');
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString('utf8');
}

export function createApp(options = {}) {
  const upstream = loopbackUpstream(options.upstream || process.env.AC_OPENCODE_URL || 'http://127.0.0.1:4096');
  const upstreamToken = options.upstreamToken ?? process.env.AC_OPENCODE_TOKEN;
  const upstreamPassword = options.upstreamPassword ?? process.env.AC_OPENCODE_PASSWORD;
  const projectDirectory = options.projectDirectory ?? process.env.AC_PROJECT_DIR;
  const token = randomBytes(32).toString('base64url');
  const previews = new Map();
  let lastVersion = '';
  let checkedAt = 0;

  async function requestOpenCode(path, method = 'GET', payload, signal) {
    const headers = { Accept: 'application/json' };
    if (payload !== undefined) headers['Content-Type'] = 'application/json';
    if (upstreamPassword) headers.Authorization = 'Basic ' + Buffer.from('opencode:' + upstreamPassword).toString('base64');
    else if (upstreamToken) headers.Authorization = 'Bearer ' + upstreamToken;
    let response;
    try {
      response = await fetch(upstream + path, {
        method,
        headers,
        body: payload === undefined ? undefined : JSON.stringify(payload),
        signal: signal || AbortSignal.timeout(15000),
        redirect: 'error',
      });
    } catch {
      fail(502, 'OpenCode server unavailable at configured loopback address');
    }
    const body = await readLimited(response);
    if (!body) return { status: response.status, value: null };
    try {
      return { status: response.status, value: JSON.parse(body) };
    } catch {
      fail(502, 'OpenCode did not return JSON');
    }
  }

  async function verifyV2() {
    if (Date.now() - checkedAt < 10000 && lastVersion) return lastVersion;
    const info = await requestOpenCode('/api/info');
    if (info.status !== 200 || typeof info.value?.version !== 'string') {
      fail(502, 'OpenCode /api/info handshake failed');
    }
    if (!/^2\./.test(info.value.version)) fail(409, 'OpenCode 2 is required; detected ' + info.value.version);
    lastVersion = info.value.version;
    checkedAt = Date.now();
    return lastVersion;
  }

  const server = createServer(async (req, res) => {
    try {
      const port = server.address()?.port;
      const hosts = ['127.0.0.1:' + port, 'localhost:' + port];
      const origin = req.headers.origin;
      if (!hosts.includes(req.headers.host) ||
          (origin && !hosts.some((host) => origin === 'http://' + host)) ||
          (req.headers['sec-fetch-site'] && !['none', 'same-origin'].includes(req.headers['sec-fetch-site']))) {
        fail(403, 'Loopback origin required');
      }
      const url = new URL(req.url || '/', 'http://127.0.0.1:' + port);
      const pathname = url.pathname;

      if (req.method === 'GET' && assets.has(pathname)) {
        const [file, mime] = assets.get(pathname);
        let content = await readFile(join(root, file), 'utf8');
        if (pathname === '/') content = content.replace('@@BOOTSTRAP_TOKEN@@', token);
        res.writeHead(200, {
          'Content-Type': mime,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'X-Frame-Options': 'DENY',
          'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-src 'self'; base-uri 'none'; form-action 'self'; object-src 'none'",
        });
        return res.end(content);
      }
      if (req.method === 'GET' && /^\/preview\/[A-Za-z0-9_-]{22}$/.test(pathname)) {
        const document = previews.get(pathname.slice('/preview/'.length));
        if (document === undefined) fail(404, 'Preview not found');
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Referrer-Policy': 'no-referrer',
          'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
        });
        return res.end(document);
      }
      if (!pathname.startsWith('/api/')) fail(404, 'Not found');

      const supplied = String(req.headers['x-asciicodimium-token'] || '');
      const expected = Buffer.from(token, 'utf8');
      const actual = Buffer.from(supplied, 'utf8');
      if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
        fail(403, 'UI session token required');
      }
      if (req.method === 'POST' && pathname === '/api/preview') {
        const body = await readJsonBody(req);
        if (typeof body.html !== 'string' || body.html.length > 150000) fail(400, 'Invalid preview document');
        const id = randomBytes(16).toString('base64url');
        previews.set(id, body.html);
        while (previews.size > previewLimit) previews.delete(previews.keys().next().value);
        return json(res, 201, { url: '/preview/' + id });
      }

      if (req.method === 'GET' && pathname === '/api/status') {
        const version = await verifyV2();
        return json(res, 200, { bridge: 'ready', opencode: 'connected', version });
      }
      await verifyV2();

      if (req.method === 'GET' && pathname === '/api/events') {
        const controller = new AbortController();
        res.on('close', () => controller.abort());
        const headers = { Accept: 'text/event-stream' };
        if (upstreamPassword) headers.Authorization = 'Basic ' + Buffer.from('opencode:' + upstreamPassword).toString('base64');
    else if (upstreamToken) headers.Authorization = 'Bearer ' + upstreamToken;
        let stream;
        try {
          stream = await fetch(upstream + '/api/event', { headers, signal: controller.signal, redirect: 'error' });
        } catch {
          if (!controller.signal.aborted) fail(502, 'OpenCode event stream unavailable');
          return;
        }
        if (!stream.ok || !stream.body) fail(502, 'OpenCode refused the event stream');
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'X-Accel-Buffering': 'no',
        });
        try {
          for await (const chunk of stream.body) {
            if (controller.signal.aborted || res.destroyed) break;
            if (!res.write(chunk)) await new Promise((done) => res.once('drain', done));
          }
        } catch (error) {
          if (!controller.signal.aborted) console.error('Event relay closed:', error.message);
        } finally {
          controller.abort();
          res.end();
        }
        return;
      }

      let path, method = req.method, body;
      if (pathname === '/api/sessions' && method === 'GET') path = '/api/session?limit=100';
      else if (pathname === '/api/sessions' && method === 'POST') {
        path = '/api/session';
        body = projectDirectory ? { location: { directory: projectDirectory } } : {};
      } else if (pathname === '/api/agents' && method === 'GET') path = '/api/agent';
      else if (pathname === '/api/models/default' && method === 'GET') path = '/api/model/default';
      else {
        const match = pathname.match(/^\/api\/sessions\/([^/]+)\/(messages|prompt|interrupt|permissions)$/);
        const reply = pathname.match(/^\/api\/sessions\/([^/]+)\/permissions\/([^/]+)\/reply$/);
        if (match) {
          const id = validID(match[1]);
          if (match[2] === 'messages' && method === 'GET') path = '/api/session/' + id + '/message?limit=100';
          if (match[2] === 'permissions' && method === 'GET') path = '/api/session/' + id + '/permission';
          if (match[2] === 'prompt' && method === 'POST') {
            const input = await readJsonBody(req);
            if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > 32000) fail(400, 'Prompt text required (max 32000 chars)');
            path = '/api/session/' + id + '/prompt';
            body = { text: input.text };
          }
          if (match[2] === 'interrupt' && method === 'POST') {
            path = '/api/session/' + id + '/interrupt';
            body = undefined;
          }
        } else if (reply && method === 'POST') {
          const id = validID(reply[1]);
          const requestID = validID(reply[2]);
          const input = await readJsonBody(req);
          if (!['once', 'reject'].includes(input.decision)) fail(400, 'Only once or reject decisions are supported');
          path = '/api/session/' + id + '/permission/' + requestID + '/reply';
          body = { decision: input.decision };
        }
      }
      if (!path) fail(404, 'Unsupported bridge endpoint');
      const result = await requestOpenCode(path, method, body);
      return json(res, result.status, result.value);
    } catch (error) {
      if (res.headersSent) return res.end();
      return json(res, error.status || 500, { error: error.status ? error.message : 'Internal bridge error' });
    }
  });

  return { server, upstream };
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const port = Number(process.env.AC_PORT || '4768');
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('AC_PORT must be 1024..65535');
  const { server, upstream } = createApp();
  server.listen(port, '127.0.0.1', () => {
    console.log('ASCIIcodimium at http://127.0.0.1:' + port + ' (OpenCode 2: ' + upstream + ')');
  });
}
