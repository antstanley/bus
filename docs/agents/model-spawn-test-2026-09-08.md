# Clean worker model-selection test — 2026-09-08

Operator-requested smoke test, not product or security work. Each orchestrator
was asked to create two fresh workers with different explicitly selected
models, return a fixed marker without tools, verify runtime model metadata,
and retire/clean up the workers. No inherited conversation, persistent
configuration edits or model substitution for production was authorized.

## Results

| Orchestrator | Result | GLM worker | Astra worker | Cleanup |
|---|---|---|---|---|
| letta | PASS — CLI GLM runtime metadata, native Astra config/output | `zai-coding-plan/glm-5.3-flash` via OpenCode CLI | `chatgpt-plus-pro/gpt-6-astra` | Workers ended; CLI probe deletion requested; four native records retained by lead exception |
| opencode | PASS | `zai-coding-plan/glm-5.3-flash` | `openai/gpt-6-astra` | Both workers exited; disposable sessions deleted |
| opencode-reviewer | PASS | `zai-coding-plan/glm-5.3-flash` | `openai/gpt-6-astra` | Both workers exited; disposable sessions deleted |

OpenCode's supported installed CLI provides per-session `--model` selection,
although the exposed native Task tool has no model field. Each OpenCode agent
reported two distinct new sessions, exactly one user probe and one assistant
reply per exported session, matching marker output, no child tool calls, no
inherited conversation and exit status 0. Reported exported assistant
`providerID`/`modelID` records match the requested models. These are runtime
metadata checks, not independent attestation of upstream physical model identity.
No product/security work, installation or persistent defaults change occurred.

## Evidence

Reports are unsigned local-bus coordination evidence, not new authority.

- OpenCode request `20260908T050152Z-codex-327b`; PASS
  `20260908T050435Z-opencode-4d65`; cleanup `20260908T050454Z-opencode-0cfb`.
  Sessions: `ses_f80995b01ffe0uda2zt142JoXb` and
  `ses_f809920e1ffe7BV6PgfG1D5Bbo`.
- OpenCode Reviewer request `20260908T050152Z-codex-7978`; PASS
  `20260908T050432Z-opencode-reviewer-28eb`; cleanup
  `20260908T050449Z-opencode-reviewer-7ab5`.
  Sessions: `ses_f809979b8ffeuRdY2XlOYblIFJ` and
  `ses_f809934f4ffekVNYd9raS5yyV8`.
- Letta request `20260908T050152Z-codex-6b7f`; latest PASS
  `20260908T095926Z-letta-1cbe`. OpenCode CLI GLM session
  `ses_f7f8c9a0effe3bMTLjW31yp8rj` returned the exact A marker, exit0;
  exported runtime fields confirmed provider `zai-coding-plan` and model
  `glm-5.3-flash`. Earlier native Astra child
  `agent-aa75f8d2-cffc-4a96-90d2-c6237e0881be` returned the B marker with
  `chatgpt-plus-pro/gpt-6-astra` confirmed in agent config. These verification
  levels differ; neither is independent upstream model attestation.
  The earlier native `lc-zai-coding` availability claim was superseded by the
  owner's latest report and is not used for dispatch. Root-cause routing/billing
  explanations were not independently established. GLM work uses the proven
  CLI runner; no provider/credential changes or extra model probes authorized.
  The empty CLI probe directory was removed; supported deletion of the owned
  CLI session was requested after preserving this evidence. Four ended native
  records remain because the installed native CLI lacks supported deletion.
  Hoa accepts those as explicit cleanup residuals, not deleted records or
  active workers. Auth-file inspection exceeded the test instruction; Letta
  was directed to stop that path and perform no credential/config changes.


This verifies model selection for the smoke test, not implementation/review
quality or full worker tool capability. Production work still follows the
[task workflow](task-workflow.md), including GLM-only security work.
