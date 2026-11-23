# Delivery programme and acceptance gates

**Owner directive:** ambitious functionality, but no automation/CI apparatus that becomes a project of its own. Make the interactive application work and remain maintainable.

## M0 — Mission, repository and source ownership [implemented in candidate]
Record product intent, version contracts, architectural boundaries, SDK preference, threat model, launch instructions, and concrete acceptance gates. Keep upstream provenance and no accidental OpenCode 1 dependencies.

## M1 — Real OpenCode 2 vertical slice [candidate implemented; needs runtime acceptance]
An operator can launch a loopback OpenCode 2 server, open ASCIIcodimium in a standard browser or inside ASCIIomium's terminal renderer, select/create sessions, see agent and tool output, prompt the agent, interrupt it, and review pending permissions with allow-once/reject. Live updates via SSE and bounded refresh; simple session metrics. Workspace contains a functioning isolated inline-JavaScript HTML preview, scratchpad, and metrics tab.

**M1 acceptance:** Run tests locally; launch actual OpenCode 2 v2.3.x, verify API handshake; configure a model/provider and send a prompt producing an assistant message and a tool call; approve/reject an explicit permission; navigate/resize the workspace; confirm prompt/session survive a frontend reload; exercise HTML preview JS button; then repeat inside actual Windows Terminal + ASCIIomium executable. Record screenshot/video, source commits, versions and text readability. Nothing in this repository can substitute for the owner Windows run.

## M2 — Terminal display quality and performance
- Quantify effective sample resolution and mouse input precision at 80×25, 120×40, 160×50 and wider terminals.
- Compare U+2580 baseline to quarter blocks/braille and native-text selective recovery; legible punctuation, line numbers, syntax highlighting, copy/select.
- Make viewport mapping authoritative for browser surface *and* hit testing; test popups and mouse wheel.
- Improve CEF/terminal publication with bounded diff updates (upstream ASCIIomium), idle frame suppression, no unbounded event/render queues.
- Make keyboard capture, Ctrl+C, Ctrl+Alt+Q, paste/clipboard, selection, IME and accessibility reliable.
- Emit human-sized performance summaries: p50/p95 input-to-paint, frame-encoding duration, bytes/frame, dropped frames, idle CPU.
- **Gate:** representative Windows hands-on acceptance; no degrading typical code readability for a modest decorative gain.

## M3 — Multi-surface web application host
- Workspaces/panels: user-defined tabs, dock/split, fullscreen, history/layout presets, explicit capability manifests.
- Browser handling: multiple isolated CEF contexts, popup and permission policy, navigation/address bar, client-side network failures, independent reload.
- Tool library: documentation/Git explorer, diff review, hierarchical project map, process dashboard, model/provider monitor, graph/node UI, live visual output.
- Preview port and origin isolation for applications that need local networking; forbid wildcard proxy to OpenCode. Safe app sandbox/recovery after crashes.
- Canvas/SVG/WebGL quality modes and full physical-pixel renderer discussion; retain ASCIIomium's normal terminal compatibility.
- Plugin protocol: narrowly scoped `postMessage` API with explicit user grants. Keep untrusted webpages unable to prompt or run commands.

## M4 — Distribution/security
- Replace ASCIIomium prototype's explicit `no_sandbox` CEF posture before general distribution, including process/bootstrap architecture.
- Audit navigation, loopback, DNS rebinding, iframe isolation, CSRF, upload/path controls, shell execution boundaries, command approval, secrets and log redaction.
- Package portable Windows evaluation artifact with reproducible hashes, version manifest and rollback path.
- Ensure library/renderer interoperability tests, upgraded OpenCode API contract tests and compatibility matrix.
- Packaging must not secretly introduce auto-updaters, scheduled tasks, firewall/network exposure or high-cost CI.

## M5 — Future optional exploration
- OpenCode-2-derived UX branch if server/API limitations justify it; otherwise keep UI in this downstream repo.
- Native/HTML hybrid text compositor; semantically recovered text, proportional UI graphics, richer input/selection.
- Built-in visual experiments including real-time model statistics and local external-device integrations, with explicit separate capability grants.
- Multimodal previews, persistent mini apps, user-designed dashboard templates and mini interactive IDE environments.

## Scope boundaries / avoid premature complexity
Do not duplicate OpenCode agent logic. Do not integrate directly into ASCIIomium's browser internals before the UI works through its existing `--url` input. Do not implement indiscriminate test matrices/CI; a small locally runnable harness plus manual Windows evaluator suffices at first. Do not claim success from CSS screenshots, syntax parsing, or a mock backend: only real OpenCode and terminal runs prove the end-to-end behavior.

## Outstanding risks for M1
1. OpenCode server start/password handling differs between versions: verify `OPENCODE_PASSWORD`, Basic auth and v2 API shape on Windows.
2. ASCIIomium currently uses sandbox-disabled CEF and terminal-cell precision for pointer input. Do not browse arbitrary hostile websites in this configuration.
3. Terminal rasterisation may make 11–13px UI text hard to read. The CSS is a first candidate, not a settled design.
4. Stored messages contain tool outputs that may be large. The UI caps visible tool input but session history pagination and virtualization need follow-on work.
5. SSE reconnects and the bounded poll path need long-session tests; do not promise efficient updates from mock results.
