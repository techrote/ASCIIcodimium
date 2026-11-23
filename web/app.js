const el = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="ac-token"]').content;
const state = {
  session: null, sessions: [], messages: [], permissions: [], current: null,
  events: 0, working: false, requestVersion: 0, toastTimer: 0, refreshTimer: 0,
};
const headers = { 'X-ASCIIcodimium-Token': token };

function toast(message) {
  const node = el('toast');
  node.textContent = String(message);
  node.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => node.hidden = true, 6500);
}

async function api(path, method = 'GET', body) {
  const response = await fetch('/api/' + path, {
    method,
    headers: body === undefined ? headers : { ...headers, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error || 'Request failed: HTTP ' + response.status);
  return result;
}

function connect(online, label) {
  el('connection-led').className = 'led ' + (online ? 'online' : 'offline');
  el('connection-text').textContent = label;
}

function dataOf(value) {
  return value && Array.isArray(value.data) ? value.data : (Array.isArray(value) ? value : []);
}

function formatDate(ts) {
  if (!Number.isFinite(ts)) return '';
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function append(parent, tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  parent.append(node);
  return node;
}

function showSessions() {
  const list = el('sessions');
  list.replaceChildren();
  if (!state.sessions.length) return append(list, 'p', 'placeholder', 'No sessions found. Create one to start.');
  for (const session of state.sessions) {
    const button = append(list, 'button', 'session-card' + (session.id === state.session ? ' selected' : ''));
    button.type = 'button';
    append(button, 'span', 'session-name', session.title || 'Untitled session');
    append(button, 'span', 'session-date', formatDate(session.time?.updated));
    button.title = session.id;
    button.addEventListener('click', () => selectSession(session.id));
  }
}

async function refreshSessions(autoSelect = true) {
  const value = await api('sessions');
  state.sessions = dataOf(value);
  showSessions();
  if (autoSelect && !state.session && state.sessions.length) await selectSession(state.sessions[0].id);
}

function setCurrent(session) {
  state.current = session;
  el('session-title').textContent = session?.title || (session ? 'Untitled session' : 'Select a session');
  el('prompt').disabled = !session;
  el('send').disabled = !session || state.working;
  el('interrupt').disabled = !session;
  el('session-state').textContent = session ? (session.time?.busy ? 'RUNNING' : 'READY') : 'IDLE';
  el('prompt-feedback').textContent = session ? 'OpenCode 2 session connected' : 'Awaiting session';
  const cost = typeof session?.cost === 'number' ? '$' + session.cost.toFixed(4) : '—';
  el('metric-cost').textContent = cost;
}

async function selectSession(id) {
  if (state.session !== id) {
    state.session = id;
    state.messages = [];
    state.permissions = [];
    renderMessages();
    renderPermissions();
  }
  setCurrent(state.sessions.find((s) => s.id === id));
  showSessions();
  await refreshConversation();
}

function summaryOf(content) {
  if (!Array.isArray(content)) return '';
  return content.filter((item) => item.type === 'text').map((item) => item.text || '').join('\n');
}

function renderMessages() {
  const viewport = el('messages');
  const pinned = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 90;
  viewport.replaceChildren();
  if (!state.session) {
    const empty = append(viewport, 'div', 'empty-state');
    append(empty, 'span', 'empty-symbol', '⌘');
    append(empty, 'h3', '', 'Agent runtime, uninterrupted.');
    append(empty, 'p', '', 'Select or create an OpenCode session.');
    return;
  }
  if (!state.messages.length) {
    const empty = append(viewport, 'div', 'empty-state');
    append(empty, 'span', 'empty-symbol', '▤');
    append(empty, 'h3', '', 'Ready for your first prompt.');
    append(empty, 'p', '', 'The agent, model, permissions and persistent history are managed by OpenCode 2.');
  }
  let toolCount = 0;
  for (const message of state.messages) {
    if (!['user', 'assistant'].includes(message.type)) continue;
    const card = append(viewport, 'article', 'message ' + message.type);
    const head = append(card, 'div', 'message-heading');
    append(head, 'strong', '', message.type === 'user' ? 'You' : 'OpenCode · ' + (message.agent || 'assistant'));
    append(head, 'span', '', formatDate(message.time?.created));
    if (message.type === 'user') append(card, 'div', 'message-content', message.text || '');
    else {
      if (message.error) append(card, 'div', 'message-content', 'Error: ' + (message.error.message || message.error.type));
      for (const part of message.content || []) {
        if (part.type === 'text') append(card, 'div', 'message-content', part.text || '');
        if (part.type === 'reasoning') {
          const details = append(card, 'details', 'reasoning');
          append(details, 'summary', '', 'Reasoning');
          append(details, 'div', 'message-content', (part.text || '').slice(0, 12000));
        }
        if (part.type === 'tool') {
          toolCount++;
          const details = append(card, 'details', 'tool');
          append(details, 'summary', '', (part.name || 'Tool') + '  ·  ' + (part.state?.status || 'pending'));
          const pre = append(details, 'pre', '', JSON.stringify(part.state?.input || {}, null, 2).slice(0, 1600));
          pre.title = 'Truncated to 1600 characters for terminal readability';
        }
      }
      if (!summaryOf(message.content) && !(message.content || []).length && !message.error) {
        append(card, 'div', 'dim tiny', 'Awaiting response…');
      }
    }
  }
  el('metric-messages').textContent = String(state.messages.length);
  el('metric-tools').textContent = String(toolCount);
  if (pinned) viewport.scrollTop = viewport.scrollHeight;
}

function renderPermissions() {
  const box = el('permissions');
  box.replaceChildren();
  box.hidden = !state.permissions.length;
  for (const permission of state.permissions) {
    const row = append(box, 'div', 'permission-row');
    const info = append(row, 'p');
    append(info, 'strong', '', 'Permission requested: ');
    append(info, 'span', '', (permission.action || 'action') + ' · ' + (permission.resources || []).join(', ').slice(0, 250));
    const actions = append(row, 'div', 'permission-actions');
    for (const [label, decision] of [['Allow once', 'once'], ['Reject', 'reject']]) {
      const button = append(actions, 'button', decision === 'once' ? 'primary compact' : 'compact', label);
      button.addEventListener('click', async () => {
        if (decision === 'once' && !confirm('Allow this OpenCode permission ONE TIME?\n' + permission.action + '\n' + (permission.resources || []).join(', '))) return;
        button.disabled = true;
        try {
          await api('sessions/' + encodeURIComponent(state.session) + '/permissions/' + encodeURIComponent(permission.id) + '/reply', 'POST', { decision });
          await refreshConversation();
        } catch (error) { toast(error.message); button.disabled = false; }
      });
    }
  }
}

async function refreshConversation() {
  const session = state.session;
  if (!session) return;
  const version = ++state.requestVersion;
  try {
    const [messages, permissions] = await Promise.all([
      api('sessions/' + encodeURIComponent(session) + '/messages'),
      api('sessions/' + encodeURIComponent(session) + '/permissions'),
    ]);
    if (version !== state.requestVersion || session !== state.session) return;
    state.messages = dataOf(messages);
    state.permissions = dataOf(permissions);
    renderMessages();
    renderPermissions();
  } catch (error) {
    if (version === state.requestVersion) toast(error.message);
  }
}

function scheduleRefresh() {
  if (state.refreshTimer) return;
  state.refreshTimer = setTimeout(async () => {
    state.refreshTimer = 0;
    try { await refreshConversation(); } catch (error) { toast(error.message); }
  }, 500);
}

async function refreshAll() {
  try {
    const status = await api('status');
    connect(true, 'OpenCode 2 connected');
    el('runtime-version').textContent = 'OpenCode ' + status.version;
    await refreshSessions();
    const chosen = state.sessions.find((s) => s.id === state.session);
    if (chosen) setCurrent(chosen);
    try {
      const model = await api('models/default');
      el('model-name').textContent = model.data?.name || 'MODEL: not configured';
    } catch { el('model-name').textContent = 'MODEL: unavailable'; }
    if (state.session) await refreshConversation();
  } catch (error) {
    connect(false, 'OpenCode unavailable');
    el('runtime-version').textContent = 'Not connected';
    toast(error.message);
  }
}

async function sendPrompt(event) {
  event.preventDefault();
  const text = el('prompt').value.trim();
  if (!state.session || !text || state.working) return;
  state.working = true;
  el('send').disabled = true;
  el('prompt-feedback').textContent = 'Submitting prompt…';
  try {
    await api('sessions/' + encodeURIComponent(state.session) + '/prompt', 'POST', { text });
    el('prompt').value = '';
    el('prompt-feedback').textContent = 'Accepted by OpenCode; awaiting events';
    scheduleRefresh();
  } catch (error) {
    toast(error.message);
    el('prompt-feedback').textContent = 'Prompt not accepted';
  } finally {
    state.working = false;
    el('send').disabled = !state.session;
  }
}

async function listenEvents() {
  let delayMs = 1000;
  while (true) {
    try {
      const response = await fetch('/api/events', { headers, cache: 'no-store' });
      if (!response.ok || !response.body) throw new Error('Event stream unavailable');
      delayMs = 1000;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 1024 * 1024) throw new Error('Oversize event stream segment');
        const lines = buffer.split(/\r?\n\r?\n/);
        buffer = lines.pop() || '';
        for (const block of lines) {
          const data = block.split(/\r?\n/).filter((s) => s.startsWith('data:')).map((s) => s.slice(5).trimStart()).join('\n');
          if (!data) continue;
          let event;
          try { event = JSON.parse(data); } catch { continue; }
          state.events++;
          el('metric-events').textContent = String(state.events);
          if (event.type?.startsWith('session.') || event.type?.startsWith('permission.') || event.type?.startsWith('form.')) scheduleRefresh();
          if (event.type === 'session.created' || event.type === 'session.deleted' || event.type === 'session.renamed') refreshSessions(false).catch(() => {});
        }
      }
    } catch { /* reconnect and keep periodic refresh available */ }
    await new Promise((done) => setTimeout(done, delayMs));
    delayMs = Math.min(delayMs * 2, 10000);
  }
}

function setTab(tab) {
  for (const button of document.querySelectorAll('[data-tab]')) {
    const selected = button.dataset.tab === tab;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-selected', String(selected));
  }
  for (const section of document.querySelectorAll('[data-view]')) section.hidden = section.dataset.view !== tab;
}

async function renderPreview() {
  const button = el('render-preview');
  button.disabled = true;
  el('preview-status').textContent = 'Rendering…';
  try {
    const response = await api('preview', 'POST', { html: el('html-editor').value });
    el('preview').src = response.url;
    el('preview-status').textContent = 'Isolated, local JavaScript enabled';
  } catch (error) {
    toast(error.message);
    el('preview-status').textContent = 'Could not render';
  } finally { button.disabled = false; }
}

el('new-session').addEventListener('click', async () => {
  const button = el('new-session');
  button.disabled = true;
  try {
    const session = await api('sessions', 'POST');
    await refreshSessions(false);
    await selectSession((session.data || session).id);
    el('prompt').focus();
  } catch (error) { toast(error.message); }
  finally { button.disabled = false; }
});
el('refresh-button').addEventListener('click', refreshAll);
el('prompt-form').addEventListener('submit', sendPrompt);
el('prompt').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && event.ctrlKey) { event.preventDefault(); el('prompt-form').requestSubmit(); }
});
el('interrupt').addEventListener('click', async () => {
  if (!state.session) return;
  try {
    await api('sessions/' + encodeURIComponent(state.session) + '/interrupt', 'POST');
    scheduleRefresh();
  } catch (error) { toast(error.message); }
});
el('render-preview').addEventListener('click', renderPreview);
el('workspace-width').addEventListener('input', (event) => {
  el('workbench').style.setProperty('--workspace-width', event.target.value + 'px');
});
for (const button of document.querySelectorAll('[data-tab]')) button.addEventListener('click', () => setTab(button.dataset.tab));
refreshAll();
renderPreview();
listenEvents();
setInterval(() => { if (state.session) refreshConversation(); }, 8000);
setInterval(refreshAll, 60000);
