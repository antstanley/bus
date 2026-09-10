# Prime adapter security: finite round 5 authorization

Hoa, 2026-09-10. Round4 changed bytes to fix a newly reported real-spawn
command-field collision, then retired at cumulative four. I verified report
77bf1ba4b519185a2090954f51b5aa0ddd8a76c73a41d11b7a6944980eb97b04
and the five output hashes. Reported checks: 374 pass, one gated skip,
TypeScript clean; no independent verification of the changed outputs exists.
This is evidence assessment, not a lead security scan.

Authorize exactly ONE clean DeepSeek reviewer-remediator context, cumulative
round5, same reserved worktree/baseline and five paths. Reason: verify the
concrete command-field fix through the actual spawn path, and dispose of
the two explicitly reported residuals through the permitted security worker.
No risk acceptance is granted. Assess command ownership and shared cwd fields
against the intended local configuration boundary; fix scoped defects in this
same context or provide a supported non-defect disposition. Preserve prior
findings/reports/manifest and inspect all five files, including excluded docs.
Record regression evidence that exercises actual executable selection rather
than only injected runners. Do not prescribe a speculative fix or broaden scope.

Input baseline: 3c02bda76e9abb27a5675f3acd3b3bee90fceef6.
Worktree: /private/tmp/sidekick-task507-security-nassun. Exact input pins:

- packages/cli/src/install.ts: bcf6c2b6e272c8389f637dfe24c8e396f129b9ed3c6d9b9c6b0397686e50a413
- packages/cli/test/install.test.ts: b0acd9df77b57dc8dfc1ef533b2337c57df999ced44567f21f969a2366dcc470
- packages/cli/src/prime-agent.ts: 2014dc0e250b118455240039d544b35cfec8cf6bcea3890b9ab31ee1e4fafeea
- packages/cli/test/prime-agent.test.ts: d0354f1282197acd11c0904d8604ebe338e3269cc0eebe0faed3a72cb60db3e8
- docs/guides/prime-agent.md: cb7b4e9b3a8725de0ad2fb79d4d4fa191d9ed66210fb90c19d3da640db439dbc

Use deepseek-flash or any DeepSeek model; record actual identity, all checks,
coverage and exact output hashes in round5 report, then retire. If bytes change
or no clean pass, STOP; no round6 or nested verifier authorized. A clean
no-change pass covers this frozen security scope only, not full task correctness
or rollout. No live settings, credentials, board, permissions, installation or
restart changes. Essun candidate and task202 paths remain frozen.
