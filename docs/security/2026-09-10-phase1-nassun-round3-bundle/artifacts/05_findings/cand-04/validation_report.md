# Validation — cand-04 (suppressed, report-only)

Disposition: **suppressed**. Not a delta-introduced control failure.

- The sink line (`packages/cli/src/install.ts:602`, `output.system.push(context)`) is
  byte-identical at the reviewed baseline `f37b83b`, so the delta did not introduce it.
- The provenance-labelling control on the same path
  (`packages/hooks/src/board-hook.ts:438-475`) is unchanged and present.
- The delta's only contribution is that long-idle sessions keep fresh presence and
  therefore remain wakeable, which restores the designed delivery behaviour.
- Report-only recommendation for a future ordinary task: on the OpenCode path, carry
  board context in a tool result or user-role message instead of the system channel.
