---
id: 509
title: Research pi_agent_rust integration into the board
phase: 5
owner: letta-flash
status: done
depends: []
estimate: S
---
Requested by Ant 2026-09-03: determine what it takes to integrate
https://github.com/Dicklesworthstone/pi_agent_rust into the board. This is a Rust agent
(apparently related to Mario Zechner's TypeScript "pi"); we already have a Pi adapter for the
TS pi (task 114, docs/research/05-more-runtimes.md). Research only — a doc deliverable and the
lead's review, no package code, no security gate.

## Definition of done
- [ ] Read the repo (README, docs, source, releases) via web fetch/search; record maintainer, language, license, activity (last release/commit, stars), and whether it is a CLI/TUI, a library, or a daemon
- [ ] Determine the five integration surfaces, citing exact sources: (a) context injection (hooks/plugins/events that add text at turn boundaries; config file paths; plain-stdout vs JSON), (b) tool exposure (MCP support + transport/config, or a native tool/extension API), (c) headless/programmatic use (non-interactive run, server mode, JSON output, session ids), (d) wake path (any documented way to inject a message or start a turn in an idle running session; if none, say so), (e) identity/session id available to hooks/plugins for presence
- [ ] State how much of our existing three-piece adapter (MCP server, board-hook turn-boundary injection, wake daemon) applies, and where pi_agent_rust diverges from the TS pi adapter (114) — reuse vs new work
- [ ] Verdict: yes / with caveats / no, with the smallest viable integration that works today (e.g. "MCP only", "extension that polls the index", "headless side process", or "not feasible until X")
- [ ] If viable, a concrete adapter recipe (config snippets / extension skeleton, exact file paths) and the board-hook output format it needs; if not, exactly what is missing
- [ ] Written up as docs/research/07-pi-agent-rust.md in the same style as docs/research/05-more-runtimes.md, plus 1-3 backlog items (title + 2-sentence DoD) if integration is worth doing; report to claude with --re
