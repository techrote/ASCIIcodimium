# Threat model and preview capability policy

ASCIIcodimium is unusually sensitive because its host application can ask a coding agent to read/write files and run tools. A browser page in the workspace **must never inherit that authority**.

## Principal trust boundaries

1. **OpenCode 2 service:** privileged local coding-agent process; its own permission policy remains authoritative. It is password protected. Only the loopback bridge possesses its temporary Basic password (or an explicitly configured alternative).
2. **ASCIIcodimium bridge and shell:** locally served frontend with a random per-process UI token and strict origin/host checks; exposes only an explicit API allowlist rather than all OpenCode routes. Do not serve it on a LAN address.
3. **Preview iframe:** a distinct sandboxed opaque origin without `allow-same-origin`, navigation or form privileges. Allows inline JS/CSS/DOM but no network connection. Preview is served from a temporary unguessable path with separate CSP and without the UI token.
4. **ASCIIomium CEF:** experimental browser engine. Current upstream prototype expressly sets `no_sandbox=true` and should be treated as **development-only, trusted-local-content only** until its sandbox architecture is corrected.
5. **Real web browsing:** not implemented. Authenticated arbitrary websites, file/media access, external network and device APIs require separate hardened contexts rather than a permissive iframe in the privileged app shell.

## Current mitigations

- Node server binds to `127.0.0.1` only.
- OpenCode target is validated as a noncredentialed HTTP loopback origin with no path/query to avoid SSRF or forwarding arbitrary remote URLs.
- Every `/api/*` route requires `X-ASCIIcodimium-Token`. It is generated at process start with cryptographic entropy, disclosed only in bootstrap HTML and not logged.
- Host, Origin and Sec-Fetch-Site checks enforce same-site local access. There is no wildcard CORS response.
- API verbs, resource names, identifier syntax and request sizes are allowlisted/bounded. Tool-run endpoints are not exposed.
- Permission replies are limited to `once` or `reject`; `always` and bulk approval are deliberately withheld.
- HTML preview documents remain in memory for the lifetime of the bridge; old previews are evicted; no user JS is inserted into the top-level shell.
- Parent CSP disallows inline script and object embedding; preview CSP allows inline scripting but denies fetch/WebSocket, navigation, forms, network content and external script loading.
- The Windows launcher generates a per-run OpenCode password and stops only the processes it started. Password must not enter terminal output or Git history.
- No persistent agent/API auth tokens in localStorage, no externally exposed debugging API, no automatic remote models/network in the preview.

## Non-goals and residual risks

This is **not a security certification**. Loopback is not a general process boundary against malicious software executing locally. The bootstrap token can be read by software with filesystem/process/debug privileges or a compromised parent page. CEF's current disabled sandbox is a major blocker for visiting untrusted webpages or shipping to general users. A hostile renderer exploit may cross the process boundary regardless of HTML iframe sandbox. Ensure the OpenCode service requires its own password; the bridge token does not replace it.

Preview scripts execute within Chromium and can perform CPU/memory-intensive computations; future work should bound process CPU, memory, lifetime and crash recovery. Some CSP/sandbox semantics can differ between CEF versions and require real-browser tests. When implementing external pages or WebSerial, require owner-visible per-capability permission grants and browser profile isolation. Never grant preview pages implicit access to the agent's file/tool APIs or to network-connected devices.

## Incident response / release bar

Before distributing beyond a trusted local evaluator: configure real CEF sandboxing, secure process isolation, pin/download-verification for CEF and OpenCode, review dependency licenses, test browser origin + protocol handling, and instrument error logs without secrets. Do not enable shell commands through a generic HTTP endpoint. Any security-sensitive feature should remain Draft/HOLD until audited.

References: upstream ASCIIomium `docs/LIVE_PIPELINE.md`, official OpenCode 2 Web authentication documentation, and the scoped routes in `src/server.mjs`.
