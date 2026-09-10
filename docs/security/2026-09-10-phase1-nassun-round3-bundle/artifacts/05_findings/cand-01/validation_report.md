# Validation — cand-01

Disposition: **suppressed** (no reportable finding).

- Method: static source trace + existing regression test evidence
- Confidence: high — Direct source trace plus a targeted existing regression test that exercises exactly the cross-instance deletion concern.
- Evidence: Path is join(registryDir, sha256(sessionID).digest('hex') + '.json'); digest is hex-only so no traversal. trackedSessions is per plugin instance. install.test.ts asserts session-123 removal does not remove other-session registered by a second instance under the same registry dir, and that other-session keeps heartbeating afterwards.
- Counterevidence / proof gap: Requires an attacker who can both emit local runtime events and predict/collide a per-server session id; repository evidence shows no such path and the remote store cannot influence it.
- Remaining uncertainty: None material for security; the deletion is a deliberate presence-lifecycle behaviour.
