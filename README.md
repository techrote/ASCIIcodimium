# ASCIIcodimium

**OpenCode 2 × ASCIIomium: a graphical coding-agent workbench rendered inside a terminal.**

ASCIIcodimium is a new application repository, not a fork of ASCIIomium's browser code or a vendored OpenCode distribution. Its initial implementation uses OpenCode **2** as the authoritative agent/session/tool runtime and [ASCIIomium](https://github.com/techrote/ASCIIomium) as a separate, reusable Chromium-to-terminal display/input adapter.

## Mission

Make a responsive, visually ergonomic terminal-resident application with sub-character colour detail and a first-class HTML/CSS/JavaScript workspace alongside the coding agent. The web workspace is not constrained to OpenCode widgets: it will host custom tools, dashboards, live previews, and eventually independently managed browser surfaces.

## Architectural rules

- OpenCode 2 owns sessions, model configuration, agent execution, tool/permission policy, context and persisted conversation state. Do **not** fork or duplicate the agent runtime as the default architecture.
- ASCIIomium owns browser frame capture, cell encoding, colour quantisation, keyboard/pointer forwarding, and terminal output; preserve its independence.
- ASCIIcodimium owns the UX, local control bridge, panel compositor, preview/workspace modules, safety boundaries and launch experience.
- Prefer the OpenCode 2 HTTP/SDK contract, with a version-compatibility gate; **never silently send v1 API payloads to v2**.
- Keep code/text legible: sub-character graphics are for surfaces, icons and decoration; measure fidelity before replacing native text rendering.
- Browser previews and untrusted web content must not gain OpenCode API authority. Bind local services to loopback and require explicit authorization for actions.
- Default to bounded refresh and inexpensive, local validation. No heavyweight CI program or automatic merge.
- Development occurs on feature branches and Draft PRs until tested on Windows.

## Status

Repository initialized 2026-11-23. Implementation and comprehensive design live on the first work branch / Draft PR, not on `main` until owner acceptance.

Source projects: [OpenCode](https://github.com/anomalyco/opencode) · [ASCIIomium](https://github.com/techrote/ASCIIomium).
