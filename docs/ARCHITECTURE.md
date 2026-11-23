# Architecture — ASCIIcodimium

**Status:** living design, first implementation candidate on Draft/HOLD. **Runtime:** OpenCode 2.x. **Display:** ASCIIomium / Chromium Embedded Framework (CEF) in Windows Terminal. **Date:** 2026-11-23.

## 1. Product definition

ASCIIcodimium is an **application host** with a powerful coding agent, not merely a reskin of a conventional terminal UI. Its operator-facing window contains OpenCode tools and sessions, but also independent web workspaces built with HTML/CSS/JavaScript. The same project may ultimately support interactive diagrams, live websites, canvas editors, model telemetry, Git exploration, hardware controls, diagrams and previews that do not originate from OpenCode at all.

**Key choice:** use OpenCode **2** rather than rehabilitate the 1.x runtime. Keep its authoritative session and tool state. Avoid an invasive fork until a specific missing upstream capability is demonstrated. A GUI client can be downstream from OpenCode without owning a copy of all its source. The project could become a conventional fork later, but that is a deliberate, optional decision.

## 2. Processes and trust boundaries

~~~text
Windows Terminal — one VT/ANSI output surface
  └─ ASCIIomium (independent techrote/ASCIIomium build)
      ├─ terminal input: keys, SGR mouse, resize
      ├─ CEF off-screen browser surface, popup compositing
      └─ half-block sampling, 1024 colours, VT frame output
          ↑ Chromium loads http://127.0.0.1:4768/
          │
ASCIIcodimium Node.js loopback bridge (this repository)
  ├─ public local UI assets: app.js / styles.css / index.html
  ├─ temporary per-process UI bearer token; fixed API whitelist
  ├─ isolated HTML preview documents (/preview/<random-id>)
  ├─ /api/events SSE streaming relay, no transcription
  └─ OpenCode 2-only proxy
          │ HTTP + optional Basic password
          ↓
OpenCode 2 serve (separate process, 127.0.0.1:4096)
  ├─ sessions, messages, prompts, agent runtime, providers, models
  ├─ durable project state, tool calls, approval rules
  └─ /api/info version handshake, /api/session..., /api/event
~~~

The browser is *presentation and local input only*. An OpenCode session must continue independently if the CEF process crashes, the terminal resizes, the web workspace reloads, or the user changes panel layout. No local UI database is authoritative for sessions or approvals.

ASCIIomium and ASCIIcodimium remain **separate repositories**. The former develops useful generic rendering and viewport plumbing; the latter owns OpenCode-specific product behavior.

## 3. Confirmed OpenCode 2 interface

The initial bridge routes are mapped against `anomalyco/opencode/packages/client/src/promise/generated/client.ts` and `generated/types.ts` on the v2 development branch as read on 2026-11-23. The package was marked v2.3.2 when inspected. This is a development compatibility snapshot, not a promise that all future 2.x versions preserve the same schema.

| UI request | OpenCode 2 request | Response/semantics |
|---|---|---|
| GET /api/status | GET /api/info | Requires major version 2; returns version |
| GET /api/sessions | GET /api/session?limit=100 | { data: SessionInfo[], cursor } |
| POST /api/sessions | POST /api/session | { data: SessionInfo }; project directory optional |
| GET /api/sessions/:id/messages | GET /api/session/:id/message?limit=100 | { data: SessionMessageInfo[], cursor } |
| POST /api/sessions/:id/prompt | POST /api/session/:id/prompt | { text }, returns inbox admission |
| POST /api/sessions/:id/interrupt | POST /api/session/:id/interrupt | interruption result |
| GET /api/sessions/:id/permissions | GET /api/session/:id/permission | { data: PermissionRequest[] } |
| POST /api/sessions/:id/permissions/:rid/reply | POST /api/session/:id/permission/:rid/reply | { decision: once / reject }, 204 |
| GET /api/models/default | GET /api/model/default | { location, data: ModelInfo or null } |
| GET /api/models | GET /api/model | { location, data: ModelInfo[] } |
| POST /api/sessions/:id/model | POST /api/session/:id/model | { model: { id, providerID, variant? } }, 204 |
| GET /api/agents | GET /api/agent | { location, data: AgentInfo[] } |
| GET /api/events | GET /api/event | streamed SSE |

Only this finite set of endpoints is exposed; this is **not** a wildcard reverse proxy into OpenCode. If the upstream contract changes, fail clearly and adapt deliberately. Do not infer v2 behavior from the old `@opencode-ai/sdk` v1 API. The longer-term preferred integration point is the official v2 `@opencode/client` and optionally in-process `@opencode/sdk` where its lifecycle and packaging benefits outweigh the current simple HTTP bridge.

**Model availability:** free hosted model access is an upstream property, not something ASCIIcodimium manufactures. Do not silently change auth, rates or provider selection.

## 4. Rendering model and ergonomics

ASCIIomium's current baseline is an off-screen BGRA source, U+2580 upper-half-block foreground/background mapping, optional 1024-colour 3/4/3 quantisation, a 20 FPS default output cap, and newest-frame scheduling. One terminal cell represents two vertically stacked colour samples. It is **not** true full-pixel terminal output. For example 120 x 40 terminal cells yield a 120 x 80 colour lattice; pointer reports still arrive at character-cell precision.

For coding text this matters. A pixel-rendered Chromium glyph resampled into upper/lower-half colour samples can be much less readable than native terminal characters. We therefore adopt a **hybrid-quality research agenda**:

1. Keep high-contrast, large, monospaced HTML text for first-slice usability, with crisp typography in a regular browser fallback.
2. Benchmark ASCIIomium half-block rendering against native terminal text for code, paths, small labels, punctuation, ANSI escape volume, idle CPU and latency.
3. Explore selective native glyph recovery/overlay using semantic information *without* implementing a second independent layout authority.
4. Evaluate quarter blocks, braille, sextants, terminal graphics extensions and per-region quality modes only after measuring the concrete terminal target.
5. Prioritize text fidelity and stable input over decorative gradients or theoretical pixel resolution.

All UI controls must be usable with coarse terminal-cell pointer mapping and keyboard tab/focus navigation. Avoid tiny click targets, excessive animation or scrolling that causes full-frame VT churn. Terminal resize and CEF viewport size remain decoupled until proven safe to synchronize.

## 5. Web workspace model

The workspace is a first-class area of the application shell; it is not part of a prompt transcript. Modes include Preview (implemented), Notes (ephemeral), and Metrics (implemented). The long-term goal includes independently managed tabs, local documents, browser previews, custom apps, charts, SVG, Canvas, WebGL and optional device-bound controls.

**Today:** a local HTML editor posts its document to the bridge; a random, non-enumerable local URL serves it into an iframe with `sandbox="allow-scripts"`, no `allow-same-origin`, no navigation permissions, no top-level access, no external connections and a restrictive per-document CSP. This allows self-contained inline JavaScript, DOM and CSS without granting the preview any OpenCode authority. HTML is never injected into the parent workbench document.

**Not yet:** full arbitrary external website embedding, cookie-authenticated sites, WebSerial/WebUSB, unrestricted network, top-level popup windows, persistent extensions, shared clipboard, full DOM-aware text recovery or GPU/WebGL in CEF. Generic websites frequently prohibit iframe embedding via `X-Frame-Options` and `frame-ancestors`; real arbitrary-site support requires a separate, isolated CEF browser instance/profile with explicit navigation and permission handling. The workstation should not attempt to bypass site embedding protections.

Future workspace plugin protocol: versioned manifest with requested capabilities, `postMessage` handshakes and user prompts for each privileged category (files, network, session read, session write, tool invocation, serial device). Default capability set is empty. Device/serial grants are distinct from coding-agent permissions.

## 6. Interaction, events and lifecycle

- UI boots with a per-process random token placed only into its served bootstrap HTML. API calls carry `X-ASCIIcodimium-Token`.
- Loopback Host/Origin/Sec-Fetch-Site checks defend against remote origins and cross-site writes; APIs additionally require the token.
- The bridge checks `GET /api/info` before using v2 routes and caches the successful major-version check briefly.
- Session list and transcript read from OpenCode; ephemeral local selection and display metrics derive from the response.
- SSE streams are relayed, not stored. The browser schedules a bounded coalesced refresh; a slow periodic poll recovers after SSE failure.
- Prompt submission is non-blocking admission. The UI never declares an agent job finished solely because prompt submission succeeded.
- Permission controls present exact action/resources, allow **once** or reject, and require an explicit human click (and confirm on allow). No implicit global persistent allow.
- On process exit, the launcher stops only the OpenCode and bridge instances it started. The canonical OpenCode session store is unaffected.

## 7. Ownership and supply chain

OpenCode 2 owns the agent and has its own license/updates. ASCIIomium owns the C++/CEF renderer. This repository owns its Node bridge, JS workbench and launcher. No copied OpenCode runtime or bundled proprietary browser DLLs in the initial PR. Pin/record tested OpenCode and CEF versions in Windows acceptance reports before release.

Source references:
- https://github.com/anomalyco/opencode/tree/dev/packages/client
- https://opencode.ai/docs/build/sdk/
- https://opencode.ai/docs/cli/web
- https://github.com/techrote/ASCIIomium/blob/main/docs/LIVE_PIPELINE.md

## 8. Architecture decision log

- ADR-001: OpenCode **2** rather than maintaining 1.x; external upstream authoritative.
- ADR-002: HTML/CSS/JS compositor rendered by **ASCIIomium**, not replacing its glyph encoder.
- ADR-003: One visible terminal surface; no competing independent ANSI writers.
- ADR-004: All privileged operations through a small, strict loopback bridge, no arbitrary proxy.
- ADR-005: Explicit untrusted-preview isolation and independent browser contexts for arbitrary websites.
- ADR-006: Human-readable code/text fidelity takes precedence over visual density.
- ADR-007: Local tests and Windows manual acceptance before expanding CI; Draft/HOLD ownership.
