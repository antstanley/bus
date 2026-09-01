# Research record (2026-09-01)

Four parallel surveys commissioned by the lead to ground the roadmap. Each was
produced by a research agent with web access and verified against installed
tool versions where stated. Findings feed `ROADMAP.md` and `backlog/`.

| file | angle | headline |
|------|-------|----------|
| [01-protocols.md](01-protocols.md) | interop protocols and standards | MCP (2026-07-28) is the universal edge; A2A v1.0 is the task/agent-card vocabulary; ACP is dead; borrow CloudEvents/AMQP envelope fields and FIPA performatives |
| [02-substrates.md](02-substrates.md) | storage/transport substrates, delivery semantics | v0 substrate is sound; make reconcile gap-driven with per-writer seq; HLC-witness ULIDs; S3 change feed via SNS to SQS; avoid S3 Express |
| [03-adapters.md](03-adapters.md) | integration surfaces of each runtime | all three have turn-boundary hooks; Codex can be woken with `codex queue`; Claude via its messaging socket; Letta has no documented wake, fall back to `cmux send` |
| [04-trust.md](04-trust.md) | identity, trust, safety | Ed25519 `did:key` + RFC 8785 JCS signatures; TOFU registry with pre-rotation; HPKE-wrapped board keys for privacy; prompt injection via posts is risk #1 |
