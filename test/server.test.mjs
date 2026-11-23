import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../src/server.mjs';

let fake, bridge, base, token, upstreamPort;
let serverVersion = '2.3.2';
const observed = [];

function reply(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

before(async () => {
  fake = createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    observed.push({ method: req.method, url: req.url, body, auth: req.headers.authorization });
    if (req.url === '/api/info') return reply(res, 200, { version: serverVersion, pid: 1, urls: [], paths: { tmp: '/tmp' } });
    if (req.url?.startsWith('/api/session?')) return reply(res, 200, { data: [{ id: 'ses_demo', title: 'Local test', time: { updated: Date.now() } }], cursor: {} });
    if (req.url === '/api/session' && req.method === 'POST') return reply(res, 200, { data: { id: 'ses_new', title: 'New' } });
    if (req.url === '/api/session/ses_demo/message') return reply(res, 200, { data: [] });
    if (req.url === '/api/session/ses_demo/message?limit=100') return reply(res, 200, { data: [], cursor: {} });
    if (req.url === '/api/session/ses_demo/permission') return reply(res, 200, { data: [] });
    if (req.url === '/api/event') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end('data: {"type":"session.created","data":{"sessionID":"ses_demo"}}' + String.fromCharCode(10, 10));
      return;
    }
    if (req.url === '/api/session/ses_demo/prompt') return reply(res, 200, { data: { id: 'msg_123' } });
    if (req.url === '/api/session/ses_demo/interrupt') return reply(res, 200, { interrupted: true });
    if (req.url === '/api/session/ses_demo/permission/prm_1/reply') { res.writeHead(204); return res.end(); }
    if (req.url === '/api/model/default') return reply(res, 200, { data: { name: 'Local test model' } });
    if (req.url === '/api/model') return reply(res, 200, { data: [{ id: 'test', modelID: 'test', providerID: 'mock', name: 'Local test', enabled: true }] });
    if (req.url === '/api/session/ses_demo/model') { res.writeHead(204); return res.end(); }
    if (req.url === '/api/agent') return reply(res, 200, { data: [] });
    return reply(res, 404, { error: 'Unknown fake endpoint' });
  });
  await new Promise((done) => fake.listen(0, '127.0.0.1', done));
  upstreamPort = fake.address().port;
  bridge = createApp({
    upstream: 'http://127.0.0.1:' + upstreamPort,
    upstreamPassword: 'test-secret',
    projectDirectory: '/tmp/example',
  }).server;
  await new Promise((done) => bridge.listen(0, '127.0.0.1', done));
  base = 'http://127.0.0.1:' + bridge.address().port;
  const html = await (await fetch(base + '/')).text();
  token = html.match(/name="ac-token" content="([^"]+)"/)?.[1];
});

after(async () => {
  await new Promise((done) => bridge.close(done));
  await new Promise((done) => fake.close(done));
});

async function call(path, method = 'GET', body, extra = {}) {
  return fetch(base + path, {
    method,
    headers: { 'X-ASCIIcodimium-Token': token, ...(body ? { 'Content-Type': 'application/json' } : {}), ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('bootstrap uses a random scoped token; JS and CSS are served', async () => {
  assert.ok(token && token.length > 35);
  assert.equal((await fetch(base + '/app.js')).status, 200);
  assert.equal((await fetch(base + '/styles.css')).status, 200);
});

test('origin, host and token checks reject untrusted requests', async () => {
  assert.equal((await fetch(base + '/api/status')).status, 403);
  assert.equal((await call('/api/status', 'GET', undefined, { Origin: 'http://evil.example' })).status, 403);
  assert.equal((await call('/api/status', 'GET', undefined, { Host: 'evil.example' })).status, 403);
});

test('v2 handshake, session listing and creation use actual v2 paths', async () => {
  assert.equal((await call('/api/status')).status, 200);
  const sessions = await (await call('/api/sessions')).json();
  assert.equal(sessions.data[0].id, 'ses_demo');
  const created = await (await call('/api/sessions', 'POST')).json();
  assert.equal(created.data.id, 'ses_new');
  assert.ok(observed.some((x) => x.url === '/api/session' && x.body.includes('/tmp/example')));
  assert.ok(observed.some((x) => x.auth === 'Basic ' + Buffer.from('opencode:test-secret').toString('base64')));
});

test('message, prompt, interrupt and permission bridges are constrained', async () => {
  assert.equal((await call('/api/sessions/ses_demo/messages')).status, 200);
  assert.equal((await call('/api/sessions/ses_demo/prompt', 'POST', { text: 'Review this file' })).status, 200);
  assert.ok(observed.some((x) => x.url === '/api/session/ses_demo/prompt' && x.body.includes('Review this file')));
  assert.equal((await call('/api/sessions/ses_demo/interrupt', 'POST')).status, 200);
  assert.equal((await call('/api/sessions/ses_demo/permissions')).status, 200);
  assert.equal((await call('/api/sessions/ses_demo/permissions/prm_1/reply', 'POST', { decision: 'once' })).status, 204);
  assert.equal((await call('/api/sessions/ses_demo/permissions/prm_1/reply', 'POST', { decision: 'always' })).status, 400);
  assert.equal((await call('/api/sessions/bad%20path/messages')).status, 400);
  assert.equal((await call('/api/system/delete', 'POST', {})).status, 404);
});

test('model picker gateway uses v2 model routes and validates references', async () => {
  const models = await (await call('/api/models')).json();
  assert.equal(models.data[0].providerID, 'mock');
  assert.equal((await call('/api/sessions/ses_demo/model', 'POST', { model: { id: 'test', providerID: 'mock' } })).status, 204);
  assert.ok(observed.some((x) => x.url === '/api/session/ses_demo/model' && x.body.includes('"providerID":"mock"')));
  assert.equal((await call('/api/sessions/ses_demo/model', 'POST', { model: { id: '', providerID: 'mock' } })).status, 400);
});

test('event stream relays the OpenCode 2 SSE payload', async () => {
  const response = await call('/api/events');
  assert.equal(response.status, 200);
  const payload = await response.text();
  assert.match(payload, /session.created/);
});

test('preview is an isolated CSP document and not a bridge token', async () => {
  const created = await (await call('/api/preview', 'POST', { html: '<script>document.title="Preview"</script>' })).json();
  const preview = await fetch(base + created.url);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-security-policy'), /connect-src 'none'/);
  assert.match(await preview.text(), /document.title/);
  assert.equal((await fetch(base + created.url + '/missing')).status, 404);
  assert.equal((await call('/api/preview', 'POST', { html: 'x'.repeat(160000) })).status, 400);
});

test('incompatible OpenCode v1 is refused explicitly', async () => {
  serverVersion = '1.99.0';
  // Use a distinct bridge instance so its cached positive v2 handshake cannot mask the change.
  const instance = createApp({ upstream: 'http://127.0.0.1:' + upstreamPort, upstreamPassword: 'test-secret' }).server;
  await new Promise((done) => instance.listen(0, '127.0.0.1', done));
  try {
    const url = 'http://127.0.0.1:' + instance.address().port;
    const html = await (await fetch(url)).text();
    const key = html.match(/name="ac-token" content="([^"]+)"/)[1];
    const response = await fetch(url + '/api/status', { headers: { 'X-ASCIIcodimium-Token': key } });
    assert.equal(response.status, 409);
  } finally { await new Promise((done) => instance.close(done)); serverVersion = '2.3.2'; }
});
