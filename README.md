# ASCIIcodimium

**OpenCode 2 × ASCIIomium — a full-featured coding-agent workbench inside a terminal.**

ASCIIcodimium is an ambitious experiment in graphical-quality terminal ergonomics: an interactive OpenCode 2 client plus a first-class HTML/CSS/JavaScript workspace, displayed through [ASCIIomium](https://github.com/techrote/ASCIIomium)'s Chromium-to-terminal renderer. The terminal window becomes a flexible graphical application host rather than just a command prompt.

**Status: first vertical-slice implementation on a Draft/HOLD branch. Not yet qualified against a real OpenCode 2 server and Windows/CEF build.**

## What the candidate already implements

- A modern, resizable three-panel UI for OpenCode sessions, agent conversation, tools and auxiliary web workspaces.
- Correct **OpenCode 2** route mapping and explicit major-version handshake (`/api/info`, `/api/session`, `/api/event`). No OpenCode 1 SDK dependency.
- Real session listing/creation; message transcript with tool summaries and reasoning folds; prompt admission, interrupt and limited human permission controls.
- A local Node 22 bridge with crypto-random UI token, strict same-origin checks, loopback-only upstream, password-aware Basic authentication, request limits and a finite route allowlist.
- SSE event relay with bounded refresh and fallback polling; session-model indicator and lightweight metrics.
- A separate HTML editor/preview that executes JavaScript inside a restricted, opaque-origin Chromium iframe **without** authority over the coding agent; additional Notes and Metrics workspace tabs.
- A Windows PowerShell launcher that starts an isolated temporary-password OpenCode 2 server, starts the bridge, and launches `asciiomium_live.exe --url` when available (ordinary-browser fallback otherwise).
- Local Node built-in regression tests; no dependencies, expensive CI or automatic merges.

## Run it

Requirements: **Node.js 22+**, **OpenCode 2.x** on PATH, and Windows PowerShell. For terminal rendering, separately build the ASCIIomium `asciiomium_live.exe` from its own repository. These tools are not bundled here.

~~~powershell
git clone https://github.com/techrote/ASCIIcodimium.git
cd ASCIIcodimium
git switch feat/opencode2-workbench-vertical-slice

npm test
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1 -Project C:\YourProject -AsciiomiumExe C:\Path\To\ASCIIomium\build\bin\RELEASE\asciiomium_live.exe
~~~

If ASCIIomium is in a sibling `../ASCIIomium` checkout with its normal Release build, the launcher attempts to find it automatically. Without that executable it opens the workbench in your default browser; use `-BrowserOnly` to select browser mode explicitly.

**Manual separate-process setup:**

~~~powershell
# Terminal A: start your own OpenCode 2 service with a password
$env:OPENCODE_PASSWORD = "choose-a-long-secret"
opencode serve --hostname 127.0.0.1 --port 4096

# Terminal B: same password for bridge requests, in a separate shell
$env:AC_OPENCODE_PASSWORD = "choose-a-long-secret"
$env:AC_OPENCODE_URL = "http://127.0.0.1:4096"
$env:AC_PROJECT_DIR = "C:\YourProject"
node src/server.mjs

# Terminal C, once the bridge is running
C:\Path\To\asciiomium_live.exe --url http://127.0.0.1:4768/ --fps 15 --colors 1024
~~~

The bridge binds only to `127.0.0.1:4768` by default. `AC_PORT` changes its port. Do not run it exposed to the internet or reuse the local preview sandbox for untrusted browsing.

## Program and engineering documentation

- [Architecture & design decisions](docs/ARCHITECTURE.md) — ownership, confirmed OpenCode 2 contracts, CEF/cell rendering, workspace plugin direction.
- [Ambitious milestone roadmap](docs/ROADMAP.md) — M0–M5, terminal fidelity, multi-surface web host, distribution and acceptance gates.
- [Threat model](docs/SECURITY.md) — browser isolation, local credentials, CEF sandbox blockers and release requirements.
- [Windows acceptance procedure](docs/ACCEPTANCE.md) — executable/source-exact real-world test and concise report template.
- [Programme issue #1](https://github.com/techrote/ASCIIcodimium/issues/1) — objective, requirements, gates.

## Important constraints

ASCIIomium currently uses half-block cells: 120×40 character cells offer about 120×80 independent **colour samples**, **not** full-resolution pixels or sub-cell mouse targeting. Actual browser text may be less legible than native terminal glyphs, so hybrid text-rendering quality is a core future research strand.

This first preview supports self-contained HTML/CSS/inline JS only. Arbitrary external webpages, persistent browser tabs, WebSerial, WebGL performance guarantees and live app networking need hardened **separate CEF browser contexts**. The current ASCIIomium bootstrap disables CEF sandboxing; **do not browse hostile webpages or treat this as production-ready**. Release depends on sandbox hardening and hands-on Windows qualification.

The project intentionally does **not** vendor or fork OpenCode 2's agent runtime at this stage. OpenCode is authoritative for sessions and providers; ASCIIomium remains a reusable independent renderer. ASCIIcodimium supplies the UI and local integration. If an upstream OpenCode 2 change later forces a full fork, that is a separate evidenced architecture decision.

Sources: [OpenCode 2](https://github.com/anomalyco/opencode) · [ASCIIomium](https://github.com/techrote/ASCIIomium). Development is Draft/HOLD until owner acceptance.
