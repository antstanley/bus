---
id: 511
title: RPC wake driver for headless pi-rust sessions
phase: 5
owner: unassigned
status: todo
depends: [106, 510]
estimate: M
---
From docs/research/07-pi-agent-rust.md. pi_agent_rust TUIs have no external wake (like TS pi), but
RPC-mode sessions accept a pushed prompt on stdin — a real push-wake path for headless sessions.

## Definition of done
- [ ] board watch --deliver learns a pi-rust-rpc target that spawns/holds `pi --mode rpc`, keeps stdin open, writes {"id","type":"prompt","message"} on mentions, records session_id from get_state in presence
- [ ] end-to-end: mention -> agent_start < 5s for an RPC session; documented fallback to poll for TUI sessions
- [ ] same private-registry/loopback safety model as task 119/106; clean correctness review + security gate
