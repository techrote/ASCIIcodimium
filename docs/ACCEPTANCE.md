# Windows operator acceptance — M1

The code candidate is not accepted until tested against a real installed **OpenCode 2** backend, an actual ASCIIomium executable and Windows Terminal.

## Environment

- Windows 11 x64; PowerShell; Node.js 22+; `opencode` command installed at **2.x**.
- C++/CEF build of [ASCIIomium](https://github.com/techrote/ASCIIomium) with `asciiomium_live.exe` accepting `--url`.
- Real model/provider access configured in OpenCode 2 if testing generation/tool execution. Provider costs and rate limits remain upstream.

## Simple launch

From the ASCIIcodimium repository:

~~~powershell
node --version
opencode --version
npm test
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1 -Project C:\YourProject -AsciiomiumExe C:\Path\To\ASCIIomium\build\bin\RELEASE\asciiomium_live.exe
~~~

The script starts two **owned** loopback processes (OpenCode `serve` and the ASCIIcodimium Node bridge), performs an authenticated v2 handshake, and uses ASCIIomium's existing `--url http://127.0.0.1:4768/` path to display the UI. When ASCIIomium exits, the launcher stops the processes it created. Choose unoccupied ports with `-OpenCodePort` and `-BridgePort`.

Browser-only fallback: `powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1 -BrowserOnly -Project C:\YourProject`. This tests the UI/API, **not** ASCIIomium's terminal rendering.

## Acceptance sequence

1. Confirm OpenCode 2 is explicitly reported online. Confirm an OpenCode 1 service is refused with a visible mismatch, not silently used.
2. Create session. Verify in original OpenCode CLI/service separately that the session exists and retains the specified project directory.
3. Submit a genuine prompt that causes model output. Verify assistant content appears, then refresh the UI and ensure that session and messages persist.
4. Prompt a file/tool operation that requests human permission. Verify **Allow once** and **Reject** present the actual action/resources. Grant once, then verify the downstream tool result. There must be no broad automatic-approval mode.
5. Click Stop while the agent is active. Verify the outcome belongs to OpenCode, not only the UI spinner.
6. In Preview, press Render, then click the preview's Randomise button. Verify inline JavaScript changes the width of the gradient bar. Verify the preview cannot read the parent token or call the agent bridge.
7. Switch Preview → Notes → Metrics, resize the workspace width, test tab focus and Ctrl+Enter. Test terminal resize, pointer mapping, popups and wheel input.
8. Compare the same UI in a normal browser vs ASCIIomium. Specifically record code/paths/punctuation readability at 120×40 and 160×50, legible tool output, mouse hit area correctness and flicker.
9. Close ASCIIomium. Verify the temporary local processes terminate without killing other OpenCode instances or destroying persisted sessions.
10. Record PASS/FAIL/UNKNOWN with exact OpenCode version, ASCIIomium source SHA, ASCIIcodimium SHA, Windows Terminal build, selected colours/FPS, console output, and screenshots or evidence where useful.

## Real blockers (do not paper over)

- Project/API behavior incompatible with the pinned OpenCode 2 version.
- Inability to read prompts or permission requests.
- Controls smaller than usable character-cell pointer input.
- Raster text unreadable for normal source code.
- Unexpected terminal ownership conflicts or unbounded redraw.
- Browser sandbox/permission assumptions violated.
- Incorrect process cleanup or hidden credentials.

## Qualification report template

~~~text
Date:
Windows and terminal build:
OpenCode 2 version and backend port:
ASCIIomium executable/source SHA:
ASCIIcodimium commit SHA:
Node version:
Real provider/model:
Browser fallback: PASS / FAIL
OpenCode v2 handshake: PASS / FAIL
Session create/list/history: PASS / FAIL
Prompt and tool result: PASS / FAIL
Approval allow-once/reject: PASS / FAIL
Interrupt: PASS / FAIL
Sandboxed JS preview: PASS / FAIL
Terminal input/resize: PASS / FAIL
Readability: PASS / FAIL (notes)
CEF sandbox posture: DEVELOPMENT-ONLY / HARDENED
Frames/VT output notes:
Release decision: HOLD / ACCEPT
~~~
