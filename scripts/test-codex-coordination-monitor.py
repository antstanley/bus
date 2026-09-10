#!/usr/bin/env python3
"""Hermetic offline tests for scripts/codex-coordination-monitor.py (task 149).

Run:  python3 scripts/test-codex-coordination-monitor.py

Every test builds synthetic fixtures in a temp directory: a local bare git
origin, a seed working repo pushing a board-data branch, a cloned replica,
a fake queue binary that records argv, and a synthetic legacy inbox. No
network, no live board, no real codex queue. Requires only the Python
standard library plus a local git binary.
"""

import ast
import fcntl
import importlib.util
import json
import os
import plistlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

HERE = Path(__file__).resolve().parent
MONITOR = HERE / "codex-coordination-monitor.py"
REAL_GIT = shutil.which("git")
MARKER_CONTENT = "MARKER-149-TEST-OK"
THREAD = "THREAD-TEST-1"

if REAL_GIT is None:
    raise SystemExit("git binary not found on PATH; tests require local git")


def load_monitor_module():
    spec = importlib.util.spec_from_file_location("ccm_under_test", str(MONITOR))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def git(args, cwd=None, check=True):
    proc = subprocess.run([REAL_GIT] + (["-C", str(cwd)] if cwd else []) + list(args),
                          capture_output=True, text=True)
    if check and proc.returncode != 0:
        raise RuntimeError("git %s failed: %s" % (args, proc.stderr))
    return proc


class Fixture:
    """One isolated board fixture set in a temp directory."""

    def __init__(self):
        self.dir = Path(tempfile.mkdtemp(prefix="ccm-test-"))
        self.origin = self.dir / "origin.git"
        self.seed = self.dir / "seed"
        self.replica = self.dir / "replica"
        self.legacy = self.dir / "legacy-new"
        self.state = self.dir / "state.json"
        self.lock = self.dir / "lockfile"
        self.qlog = self.dir / "queue.log"
        self.queue_rc = 0
        self._build()

    def _build(self):
        subprocess.run([REAL_GIT, "init", "--bare", "-q", str(self.origin)], check=True)
        git(["--git-dir", str(self.origin), "symbolic-ref", "HEAD", "refs/heads/board-data"])
        subprocess.run([REAL_GIT, "init", "-q", str(self.seed)], check=True)
        git(["checkout", "-b", "board-data"], cwd=self.seed)
        git(["config", "user.email", "fixture@test"], cwd=self.seed)
        git(["config", "user.name", "fixture"], cwd=self.seed)
        self.write_post("2026-09-09", "01A", "alice")
        self.commit_posts()
        subprocess.run([REAL_GIT, "clone", "-q", "--branch", "board-data",
                        str(self.origin), str(self.replica)], check=True,
                       capture_output=True)
        git(["config", "board.store", "true"], cwd=self.replica)
        self.marker = self.replica / ".monitor-marker"
        self.marker.write_text(MARKER_CONTENT)
        self.legacy.mkdir()

    def queue_binary(self):
        path = self.dir / "fake_queue.py"
        if not path.exists():
            path.write_text(
                "#!/usr/bin/env python3\n"
                "import os, sys\n"
                "with open(os.environ['CCM_TEST_QUEUE_LOG'], 'a') as fh:\n"
                "    fh.write(repr(sys.argv[1:]) + '\\n')\n"
                "sys.exit(int(os.environ.get('CCM_TEST_QUEUE_RC', '0')))\n")
            path.chmod(0o755)
        return path

    def write_legacy(self, name, body="m"):
        (self.legacy / name).write_text(body)

    def write_post(self, date, ulid, author, body="hello"):
        d = self.seed / "boards/team/posts" / date
        d.mkdir(parents=True, exist_ok=True)
        payload = {"id": ulid, "author": author, "thread": THREAD, "title": "t",
                   "body": body, "ts": "2026-09-10T00:00:00Z", "mentions": [],
                   "instance": "i", "board": "team", "v": 1}
        (d / (ulid + ".json")).write_text(json.dumps(payload))

    def commit_posts(self, message="posts"):
        git(["add", "-A"], cwd=self.seed)
        git(["commit", "-qm", message], cwd=self.seed)
        subprocess.run([REAL_GIT, "-C", str(self.seed), "push", "-q",
                        str(self.origin), "board-data"], check=True, capture_output=True)

    def publish(self, *posts):
        for (date, ulid, author, body) in posts:
            self.write_post(date, ulid, author, body)
        self.commit_posts()

    def rearm_origin(self):
        """Recreate the bare origin after it was broken (fetch recovery test)."""
        if self.origin.exists():
            shutil.rmtree(self.origin)
        subprocess.run([REAL_GIT, "init", "--bare", "-q", str(self.origin)], check=True)
        git(["--git-dir", str(self.origin), "symbolic-ref", "HEAD", "refs/heads/board-data"])
        subprocess.run([REAL_GIT, "-C", str(self.seed), "push", "-q",
                        str(self.origin), "board-data"], check=True, capture_output=True)

    def break_origin(self):
        shutil.rmtree(self.origin)

    def base_argv(self):
        return [
            sys.executable, str(MONITOR),
            "--replica", str(self.replica),
            "--expected-origin", str(self.origin),
            "--expected-branch", "board-data",
            "--marker-path", str(self.marker),
            "--marker-content", MARKER_CONTENT,
            "--git-binary", REAL_GIT,
            "--queue-binary", str(self.queue_binary()),
            "--thread", THREAD,
            "--lock", str(self.lock),
            "--state", str(self.state),
            "--legacy-inbox", str(self.legacy),
            "--lead-author", "codex",
        ]

    def env(self):
        e = dict(os.environ)
        e["CCM_TEST_QUEUE_LOG"] = str(self.qlog)
        e["CCM_TEST_QUEUE_RC"] = str(self.queue_rc)
        return e

    def run(self, extra=None, timeout=120):
        return subprocess.run(self.base_argv() + list(extra or []),
                              capture_output=True, text=True, timeout=timeout,
                              env=self.env())

    def queue_lines(self):
        if not self.qlog.exists():
            return []
        return [ast.literal_eval(line) for line in self.qlog.read_text().splitlines()]

    def read_state(self):
        return json.loads(self.state.read_text())

    def cleanup(self):
        shutil.rmtree(self.dir, ignore_errors=True)


class MonitorTestBase(unittest.TestCase):
    def setUp(self):
        self.fx = Fixture()
        self.addCleanup(self.fx.cleanup)

    def baseline(self):
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 2, proc.stdout + proc.stderr)
        self.assertEqual(self.fx.queue_lines(), [])
        return proc

    def sleep_git_binary(self):
        path = self.fx.dir / "slow_fetch_git.py"
        if not path.exists():
            path.write_text(
                "#!/usr/bin/env python3\n"
                "import os, sys, time\n"
                "args = sys.argv[1:]\n"
                "rest = args[2:] if args and args[0] == '-C' else args\n"
                "if rest and rest[0] == 'fetch':\n"
                "    time.sleep(60)\n"
                "    sys.exit(1)\n"
                "os.execv(%r, [%r] + args)\n" % (REAL_GIT, REAL_GIT))
            path.chmod(0o755)
        return path


WAKE_TS = r"at \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"


class TestBaseline(MonitorTestBase):
    def test_baseline_records_history_without_wake(self):
        proc = self.baseline()
        self.assertIn("baseline", proc.stdout)
        state = self.fx.read_state()
        self.assertTrue(state["board_baseline_done"])
        self.assertTrue(state["legacy_baseline_done"])
        self.assertIn("boards/team/posts/2026-09-09/01A.json", state["board_seen"])
        # Baselined posts are recorded without content fingerprints (never read).
        self.assertIsNone(state["board_seen"]["boards/team/posts/2026-09-09/01A.json"])
        self.assertEqual(len(state["legacy_seen"]), 0)
        self.assertTrue(state["initialized_at"].endswith("Z"))

    def test_new_post_wakes_with_exact_expected_argv(self):
        self.baseline()
        self.fx.publish(("2026-09-10", "01B", "alice", "new"))
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 0)
        lines = self.fx.queue_lines()
        self.assertEqual(len(lines), 1)
        argv = lines[0]
        self.assertEqual(argv[0], "queue")
        self.assertEqual(argv[1], "--thread")
        self.assertEqual(argv[2], THREAD)
        self.assertEqual(argv[3], "--message")
        self.assertRegex(argv[4],
                         r"^\[codex-coordination-monitor\] new items: board_posts=1 "
                         r"legacy_bus=0 " + WAKE_TS + r"$")
        state = self.fx.read_state()
        fp = state["board_seen"]["boards/team/posts/2026-09-10/01B.json"]
        self.assertIsInstance(fp, str)
        self.assertEqual(len(fp), 64)

    def test_dedup_across_runs(self):
        self.baseline()
        self.fx.publish(("2026-09-10", "01B", "alice", "one"))
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 0)
        proc2 = self.fx.run()
        self.assertEqual(proc2.returncode, 0)
        self.assertIn("quiet", proc2.stdout)
        self.assertEqual(len(self.fx.queue_lines()), 1)


    def test_existing_legacy_is_pending_after_baseline_and_retried_until_ack(self):
        self.fx.write_legacy("already-pending.md", "pending")
        before = (self.fx.legacy / "already-pending.md").read_bytes()
        proc = self.baseline()
        self.assertIn("legacy_pending=1", proc.stdout)
        self.assertEqual(self.fx.read_state()["legacy_seen"], {})
        self.fx.queue_rc = 1
        self.assertEqual(self.fx.run().returncode, 5)
        self.assertEqual(self.fx.read_state()["legacy_seen"], {})
        self.fx.queue_rc = 0
        self.assertEqual(self.fx.run().returncode, 0)
        self.assertIn("already-pending.md", self.fx.read_state()["legacy_seen"])
        self.assertEqual((self.fx.legacy / "already-pending.md").read_bytes(), before)
        self.assertIn("quiet", self.fx.run().stdout)

    def test_initial_board_failure_does_not_swallow_legacy(self):
        self.fx.write_legacy("already-pending.md")
        self.fx.break_origin()
        self.assertEqual(self.fx.run().returncode, 4)
        self.assertEqual(self.fx.read_state()["legacy_seen"], {})
        self.assertEqual(self.fx.run().returncode, 4)
        self.assertIn("already-pending.md", self.fx.read_state()["legacy_seen"])
        self.assertRegex(self.fx.queue_lines()[-1][4], r"legacy_bus=1")


class TestWakeRules(MonitorTestBase):
    def test_one_batched_wake_per_poll_with_counts(self):
        self.baseline()
        self.fx.publish(("2026-09-10", "01B", "alice", "one"),
                        ("2026-09-10", "01C", "bob", "two"))
        self.fx.write_legacy("20260910T090000Z-bob-bbbb.md")
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 0)
        lines = self.fx.queue_lines()
        self.assertEqual(len(lines), 1)
        self.assertRegex(lines[0][4], r"board_posts=2 legacy_bus=1 " + WAKE_TS + r"$")

    def test_own_posts_excluded_but_recorded(self):
        self.baseline()
        self.fx.publish(("2026-09-10", "01B", "codex", "own"),
                        ("2026-09-10", "01C", "alice", "real"))
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 0)
        lines = self.fx.queue_lines()
        self.assertEqual(len(lines), 1)
        self.assertRegex(lines[0][4], r"board_posts=1 legacy_bus=0")
        state = self.fx.read_state()
        self.assertIn("boards/team/posts/2026-09-10/01B.json", state["board_seen"])
        proc2 = self.fx.run()
        self.assertEqual(proc2.returncode, 0)
        self.assertEqual(len(self.fx.queue_lines()), 1)

    def test_own_post_only_poll_is_quiet_and_records_without_queue(self):
        self.baseline()
        self.fx.publish(("2026-09-10", "01B", "codex", "own only"))
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(self.fx.queue_lines(), [])
        self.assertIn("boards/team/posts/2026-09-10/01B.json", self.fx.read_state()["board_seen"])

    def test_working_tree_untouched_tracking_ref_advanced(self):
        self.baseline()
        self.fx.publish(("2026-09-10", "01B", "alice", "fetch-only read"))
        head_before = git(["rev-parse", "HEAD"], cwd=self.fx.replica).stdout.strip()
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 0)
        residue = [line for line in
                   git(["status", "--porcelain"], cwd=self.fx.replica).stdout.splitlines()
                   if ".monitor-marker" not in line]  # the lead-placed marker stays
        self.assertEqual(residue, [])
        self.assertEqual(git(["rev-parse", "HEAD"], cwd=self.fx.replica).stdout.strip(),
                         head_before)
        self.assertNotEqual(head_before,
                            git(["rev-parse", "refs/remotes/origin/board-data"],
                                cwd=self.fx.replica).stdout.strip())


class TestCaps(MonitorTestBase):
    def test_cap_bounds_reads_and_preserves_pending(self):
        self.baseline()
        self.fx.publish(*[("2026-09-10", "C%d" % i, "alice", "m%d" % i) for i in range(5)])
        proc = self.fx.run(["--cap", "3"])
        self.assertEqual(proc.returncode, 0)
        self.assertRegex(self.fx.queue_lines()[-1][4], r"board_posts=3 legacy_bus=0")
        self.assertEqual(len(self.fx.read_state()["board_seen"]), 1 + 3)
        proc2 = self.fx.run(["--cap", "3"])
        self.assertEqual(proc2.returncode, 0)
        self.assertRegex(self.fx.queue_lines()[-1][4], r"board_posts=2 legacy_bus=0")
        proc3 = self.fx.run(["--cap", "3"])
        self.assertIn("quiet", proc3.stdout)
        self.assertEqual(len(self.fx.queue_lines()), 2)

    def test_budget_is_shared_with_deferred_legacy_priority(self):
        self.baseline()
        self.fx.publish(*[("2026-09-10", "D%d" % i, "alice", "m") for i in range(3)])
        self.fx.write_legacy("20260910T090100Z-bob-bbb1.md")
        self.fx.write_legacy("20260910T090200Z-bob-bbb2.md")
        proc = self.fx.run(["--cap", "2"])
        self.assertEqual(proc.returncode, 0)
        self.assertRegex(self.fx.queue_lines()[-1][4], r"board_posts=2 legacy_bus=0")
        proc = self.fx.run(["--cap", "2"])
        self.assertRegex(self.fx.queue_lines()[-1][4], r"board_posts=0 legacy_bus=2")
        proc = self.fx.run(["--cap", "2"])
        self.assertRegex(self.fx.queue_lines()[-1][4], r"board_posts=1 legacy_bus=0")
        proc = self.fx.run(["--cap", "2"])
        self.assertIn("quiet", proc.stdout)

    def test_malformed_first_cap_one_drains_valid_board_and_pending_legacy(self):
        self.fx.write_legacy("pending.md")
        self.baseline()
        bad_path = "boards/team/posts/2026-09-10/00BAD.json"
        good_path = "boards/team/posts/2026-09-10/01GOOD.json"
        self.fx.write_post("2026-09-10", "01GOOD", "alice")
        (self.fx.seed / bad_path).write_text("{not json")
        self.fx.commit_posts()
        first = self.fx.run(["--cap", "1"])
        self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
        self.assertIn("board_corrupt=1", first.stdout)
        self.assertEqual(self.fx.queue_lines(), [])
        state = self.fx.read_state()
        self.assertEqual(state["board_after"], bad_path)
        self.assertTrue(state["legacy_first"])
        self.assertNotIn(bad_path, state["board_seen"])
        # Noop plans the same next source but must not consume its turn.
        before = self.fx.state.read_bytes()
        plan = self.fx.run(["--noop", "--cap", "1"])
        self.assertEqual(plan.returncode, 0)
        self.assertIn("board_posts=0 legacy_bus=1", plan.stdout)
        self.assertEqual(self.fx.state.read_bytes(), before)
        second = self.fx.run(["--cap", "1"])
        self.assertEqual(second.returncode, 0, second.stdout + second.stderr)
        self.assertIn("pending.md", self.fx.read_state()["legacy_seen"])
        self.assertNotIn(good_path, self.fx.read_state()["board_seen"])
        third = self.fx.run(["--cap", "1"])
        self.assertEqual(third.returncode, 0, third.stdout + third.stderr)
        self.assertIn(good_path, self.fx.read_state()["board_seen"])
        self.assertNotIn(bad_path, self.fx.read_state()["board_seen"])
        self.assertEqual(len(self.fx.queue_lines()), 2)
        self.assertIn("board_posts=0 legacy_bus=1", self.fx.queue_lines()[0][4])
        self.assertIn("board_posts=1 legacy_bus=0", self.fx.queue_lines()[1][4])
        # Wraparound retries the skipped path; repair does not need a state reset.
        self.fx.write_post("2026-09-10", "00BAD", "alice", "repaired")
        self.fx.commit_posts()
        self.assertEqual(self.fx.run(["--cap", "1"]).returncode, 0)
        self.assertIn(bad_path, self.fx.read_state()["board_seen"])
        self.assertIn("quiet", self.fx.run(["--cap", "1"]).stdout)

    def test_full_malformed_or_failed_read_batch_cannot_starve_other_items(self):
        self.baseline()
        self.fx.write_legacy("pending.md")
        mod = load_monitor_module()
        cfg = mod.build_config(self.fx.base_argv()[2:])
        candidates = ["boards/team/posts/%03d.json" % i for i in range(201)]
        initial = self.fx.state.read_bytes()
        for fail_reads in (False, True):
            with self.subTest(fail_reads=fail_reads):
                self.fx.state.write_bytes(initial)
                def read_blob(cfg, ref, path):
                    if path == candidates[-1]:
                        return b'{"author": "alice"}'
                    if fail_reads:
                        raise mod.FetchError("fixture blob read failed")
                    return b"{not json"
                with mock.patch.object(mod, "verify_replica"), \
                        mock.patch.object(mod, "fetch_pinned"), \
                        mock.patch.object(mod, "list_post_paths", return_value=candidates), \
                        mock.patch.object(mod, "blob_size", return_value=20), \
                        mock.patch.object(mod, "blob_bytes", side_effect=read_blob) as reads, \
                        mock.patch.object(mod, "queue_wake", return_value=True) as queue:
                    for turn in range(2):
                        state, fresh = mod.load_state(self.fx.state)
                        previous = reads.call_count
                        result = mod.poll_once(cfg, state, fresh)
                        self.assertEqual(result.exit_code, 0)
                        self.assertLessEqual(reads.call_count - previous +
                                             state["last_poll"]["legacy_new"], 200)
                        mod.save_state_atomic(self.fx.state, state)
                        if turn == 0:
                            self.assertEqual(state["last_poll"]["board_corrupt"], 200)
                            self.assertEqual(queue.call_count, 0)
                    state = self.fx.read_state()
                    self.assertIn(candidates[-1], state["board_seen"])
                    self.assertIn("pending.md", state["legacy_seen"])
                    self.assertEqual(len(state["board_seen"]), 2)
                    self.assertEqual(queue.call_count, 1)
                    self.assertIn("board_posts=1 legacy_bus=1", queue.call_args.args[1])

    def test_progress_and_source_priority_retry_unchanged_after_queue_failure(self):
        self.baseline()
        self.fx.write_post("2026-09-10", "01GOOD", "alice")
        bad_path = "boards/team/posts/2026-09-10/00BAD.json"
        good_path = "boards/team/posts/2026-09-10/01GOOD.json"
        (self.fx.seed / bad_path).write_text("{bad")
        self.fx.commit_posts()
        self.fx.write_legacy("pending.md")
        self.assertEqual(self.fx.run(["--cap", "1"]).returncode, 0)
        self.fx.queue_rc = 1
        self.assertEqual(self.fx.run(["--cap", "1"]).returncode, 5)
        state = self.fx.read_state()
        self.assertEqual(state["board_after"], bad_path)
        self.assertTrue(state["legacy_first"])
        self.assertEqual(state["legacy_seen"], {})
        self.fx.queue_rc = 0
        self.assertEqual(self.fx.run(["--cap", "1"]).returncode, 0)
        self.assertIn("pending.md", self.fx.read_state()["legacy_seen"])
        self.fx.queue_rc = 1
        self.assertEqual(self.fx.run(["--cap", "1"]).returncode, 5)
        state = self.fx.read_state()
        self.assertEqual(state["board_after"], bad_path)
        self.assertFalse(state["legacy_first"])
        self.assertNotIn(good_path, state["board_seen"])
        self.fx.queue_rc = 0
        self.assertEqual(self.fx.run(["--cap", "1"]).returncode, 0)
        self.assertIn(good_path, self.fx.read_state()["board_seen"])
        self.assertEqual(self.fx.read_state()["board_after"], good_path)

    def test_version_one_state_without_progress_fields_keeps_baseline(self):
        self.baseline()
        state = self.fx.read_state()
        del state["board_after"]
        del state["legacy_first"]
        self.fx.state.write_text(json.dumps(state))
        self.fx.publish(("2026-09-10", "NEW", "alice", "new"))
        self.assertEqual(self.fx.run(["--cap", "1"]).returncode, 0)
        self.assertIn("board_posts=1 legacy_bus=0", self.fx.queue_lines()[-1][4])
        self.assertEqual(self.fx.read_state()["version"], 1)
        self.assertEqual(len(self.fx.read_state()["board_seen"]), 2)

    def test_oversize_post_detected_but_skipped_and_pending(self):
        self.baseline()
        big = "x" * (64 * 1024 + 1)
        self.fx.publish(("2026-09-10", "BIG1", "alice", big))
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(self.fx.queue_lines(), [])  # skipped => no wake
        self.assertIn("board_oversize=1", proc.stdout)
        self.assertNotIn("boards/team/posts/2026-09-10/BIG1.json",
                         self.fx.read_state()["board_seen"])
        # Still pending on the next poll; a small post wakes without it.
        self.fx.publish(("2026-09-10", "SML1", "alice", "small"))
        proc2 = self.fx.run()
        self.assertEqual(proc2.returncode, 0)
        self.assertRegex(self.fx.queue_lines()[-1][4], r"board_posts=1 legacy_bus=0")
        self.assertIn("board_oversize=1", proc2.stdout)
        self.assertNotIn("boards/team/posts/2026-09-10/BIG1.json",
                         self.fx.read_state()["board_seen"])

    def test_corrupt_post_json_skipped_and_pending(self):
        self.baseline()
        broken = self.fx.seed / "boards/team/posts/2026-09-10/BROKEN.json"
        broken.parent.mkdir(parents=True, exist_ok=True)
        broken.write_text("{not json at all")
        self.fx.commit_posts()
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 0)
        self.assertIn("board_corrupt=1", proc.stdout)
        self.assertEqual(self.fx.queue_lines(), [])
        self.assertNotIn("boards/team/posts/2026-09-10/BROKEN.json",
                         self.fx.read_state()["board_seen"])

    def test_deeply_nested_post_json_is_corrupt_not_internal_error(self):
        # A hostile nested-JSON post must count as corrupt (cursor advances,
        # poll completes, later posts still drain), never wedge the monitor.
        self.baseline()
        deep_path = self.fx.seed / "boards/team/posts/2026-09-10/00DEEP.json"
        deep_path.parent.mkdir(parents=True, exist_ok=True)
        deep_path.write_text("[" * 20000 + "]" * 20000)  # < max-body-bytes
        self.fx.commit_posts()
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 0, proc.stdout + proc.stderr)
        self.assertIn("board_corrupt=1", proc.stdout)
        self.assertEqual(self.fx.queue_lines(), [])
        self.assertEqual(self.fx.read_state()["board_after"],
                         "boards/team/posts/2026-09-10/00DEEP.json")
        self.assertNotIn("boards/team/posts/2026-09-10/00DEEP.json",
                         self.fx.read_state()["board_seen"])
        self.fx.write_post("2026-09-10", "01GOOD", "alice")
        self.fx.commit_posts()
        proc2 = self.fx.run()
        self.assertEqual(proc2.returncode, 0, proc2.stdout + proc2.stderr)
        self.assertRegex(self.fx.queue_lines()[-1][4], r"board_posts=1 legacy_bus=0")


class TestQueueFailure(MonitorTestBase):
    def test_queue_failure_persists_nothing_notifiable_and_retry_succeeds(self):
        self.baseline()
        self.fx.publish(("2026-09-10", "01B", "alice", "retry me"))
        self.fx.write_legacy("20260910T090300Z-bob-bbb3.md")
        self.fx.queue_rc = 3
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 5, proc.stdout + proc.stderr)
        state = self.fx.read_state()
        self.assertNotIn("boards/team/posts/2026-09-10/01B.json", state["board_seen"])
        self.assertNotIn("20260910T090300Z-bob-bbb3.md", state["legacy_seen"])
        self.assertIsNotNone(state["errors"]["last_queue_error"])
        # Retry with a working queue: everything wakes and persists.
        self.fx.queue_rc = 0
        proc2 = self.fx.run()
        self.assertEqual(proc2.returncode, 0)
        self.assertRegex(self.fx.queue_lines()[-1][4], r"board_posts=1 legacy_bus=1")
        state2 = self.fx.read_state()
        self.assertIn("boards/team/posts/2026-09-10/01B.json", state2["board_seen"])
        self.assertIn("20260910T090300Z-bob-bbb3.md", state2["legacy_seen"])


class TestAtomicStateWrite(unittest.TestCase):
    def setUp(self):
        self.mod = load_monitor_module()
        self.dir = Path(tempfile.mkdtemp(prefix="ccm-atomic-"))
        self.addCleanup(shutil.rmtree, self.dir, ignore_errors=True)

    def test_failed_replace_leaves_original_intact_and_no_temp(self):
        state_path = self.dir / "state.json"
        self.mod.save_state_atomic(state_path, {"version": 1, "marker": "original"})
        original = state_path.read_bytes()

        real_replace = os.replace

        def exploding_replace(src, dst):
            raise OSError("simulated crash between temp write and replace")

        try:
            os.replace = exploding_replace
            with self.assertRaises(OSError):
                self.mod.save_state_atomic(state_path, {"version": 1, "marker": "new"})
        finally:
            os.replace = real_replace
        self.assertEqual(state_path.read_bytes(), original)
        leftovers = [p.name for p in self.dir.iterdir() if p.name != "state.json"]
        self.assertEqual(leftovers, [])

    def test_successful_write_is_complete_and_leaves_no_temp(self):
        state_path = self.dir / "state.json"
        payload = {"version": 1, "board_seen": {"a.json": None}, "n": 3}
        self.mod.save_state_atomic(state_path, payload)
        self.assertEqual(json.loads(state_path.read_text()), payload)
        leftovers = [p.name for p in self.dir.iterdir() if p.name != "state.json"]
        self.assertEqual(leftovers, [])


class TestLock(MonitorTestBase):
    def test_second_concurrent_run_exits_quietly(self):
        self.baseline()
        lock_fd = os.open(str(self.fx.lock), os.O_CREAT | os.O_RDWR, 0o600)
        try:
            fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.fx.publish(("2026-09-10", "01B", "alice", "while locked"))
            proc = self.fx.run()
            self.assertEqual(proc.returncode, 10)
            self.assertEqual(proc.stdout, "")
            self.assertEqual(proc.stderr, "")
            self.assertEqual(self.fx.queue_lines(), [])
        finally:
            os.close(lock_fd)
        proc2 = self.fx.run()
        self.assertEqual(proc2.returncode, 0)
        self.assertEqual(len(self.fx.queue_lines()), 1)


class TestBoardFailures(MonitorTestBase):
    def test_marker_mismatch_is_distinct_and_legacy_still_runs(self):
        self.baseline()
        self.fx.marker.write_text("TAMPERED")
        self.fx.write_legacy("20260910T090400Z-bob-bbb4.md")
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 3)
        self.assertIn("verify-failed", proc.stdout)
        state = self.fx.read_state()
        self.assertEqual(state["errors"]["last_error_kind"], "verify")
        self.assertEqual(state["errors"]["failure_count"], 1)
        self.assertIn("20260910T090400Z-bob-bbb4.md", state["legacy_seen"])
        self.assertRegex(self.fx.queue_lines()[-1][4],
                         r"board check FAILED kind=verify consecutive_failures=1 "
                         r".*legacy_bus=1")

    def test_origin_mismatch_fails_closed(self):
        self.baseline()
        proc = self.fx.run(["--expected-origin", "https://git.example/wrong.git"])
        self.assertEqual(proc.returncode, 3)

    def test_branch_mismatch_fails_closed(self):
        self.baseline()
        proc = self.fx.run(["--expected-branch", "main"])
        self.assertEqual(proc.returncode, 3)

    def test_missing_board_store_marker_fails_closed(self):
        self.baseline()
        git(["config", "--unset", "board.store"], cwd=self.fx.replica)
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 3)

    def test_fetch_failure_legacy_checked_and_backoff_suppresses(self):
        self.baseline()
        self.fx.break_origin()
        self.fx.write_legacy("20260910T090500Z-bob-bbb5.md")
        proc1 = self.fx.run()
        self.assertEqual(proc1.returncode, 4)
        self.assertIn("fetch-failed", proc1.stdout)
        self.assertEqual(self.fx.read_state()["errors"]["failure_count"], 1)
        # First failure wakes (FAILED text); legacy items persisted after ack.
        self.assertEqual(len(self.fx.queue_lines()), 1)
        self.assertIn("20260910T090500Z-bob-bbb5.md", self.fx.read_state()["legacy_seen"])
        # Second consecutive failure, default interval: no repeat error wake.
        proc2 = self.fx.run()
        self.assertEqual(proc2.returncode, 4)
        self.assertEqual(len(self.fx.queue_lines()), 1)
        self.assertEqual(self.fx.read_state()["errors"]["failure_count"], 2)
        # interval=1 reminds on every consecutive failure.
        proc3 = self.fx.run(["--error-notify-interval", "1"])
        self.assertEqual(proc3.returncode, 4)
        self.assertEqual(len(self.fx.queue_lines()), 2)
        self.assertRegex(self.fx.queue_lines()[-1][4],
                         r"board check FAILED kind=fetch consecutive_failures=3")
        # Recovery: rebuild the origin; next poll succeeds and resets failures.
        self.fx.rearm_origin()
        proc4 = self.fx.run()
        self.assertEqual(proc4.returncode, 0)
        self.assertIn("quiet", proc4.stdout)
        self.assertEqual(self.fx.read_state()["errors"]["failure_count"], 0)

    def test_fetch_timeout_is_distinct_and_legacy_still_checked(self):
        self.baseline()
        slow = self.sleep_git_binary()
        self.fx.write_legacy("20260910T090600Z-bob-bbb6.md")
        proc = self.fx.run(["--git-binary", slow, "--fetch-timeout", "1",
                            "--git-timeout", "10"])
        self.assertEqual(proc.returncode, 4)
        self.assertIn("fetch-failed", proc.stdout)
        self.assertEqual(self.fx.read_state()["errors"]["last_error_kind"], "fetch")
        self.assertIn("20260910T090600Z-bob-bbb6.md", self.fx.read_state()["legacy_seen"])


    def test_non_fast_forward_refused_without_promoting_tracking_ref(self):
        self.baseline()
        self.fx.publish(("2026-09-10", "01B", "alice", "one"))
        self.assertEqual(self.fx.run().returncode, 0)
        ref = "refs/remotes/origin/board-data"
        before = git(["rev-parse", ref], cwd=self.fx.replica).stdout
        git(["reset", "--hard", "HEAD~1"], cwd=self.fx.seed)
        git(["push", "--force", str(self.fx.origin), "board-data"], cwd=self.fx.seed)
        self.fx.write_legacy("during-rewind.md")
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 4, proc.stdout + proc.stderr)
        self.assertEqual(git(["rev-parse", ref], cwd=self.fx.replica).stdout, before)
        self.assertIn("during-rewind.md", self.fx.read_state()["legacy_seen"])
        self.assertIn("not a fast-forward", self.fx.read_state()["errors"]["last_error_detail"])

    def test_fetch_does_not_follow_tags_or_other_configured_refs(self):
        self.baseline()
        self.fx.publish(("2026-09-10", "01B", "alice", "one"))
        git(["tag", "new-tag"], cwd=self.fx.seed)
        git(["branch", "other"], cwd=self.fx.seed)
        git(["push", str(self.fx.origin), "refs/tags/new-tag", "refs/heads/other"], cwd=self.fx.seed)
        self.assertEqual(self.fx.run().returncode, 0)
        self.assertEqual(git(["tag", "--list"], cwd=self.fx.replica).stdout, "")
        self.assertNotEqual(git(["rev-parse", "--verify", "refs/remotes/origin/other"],
                                cwd=self.fx.replica, check=False).returncode, 0)

    def test_failed_error_wake_retries_next_poll_then_backs_off(self):
        self.baseline()
        self.fx.break_origin()
        self.fx.queue_rc = 1
        self.assertEqual(self.fx.run().returncode, 4)
        self.assertTrue(self.fx.read_state()["errors"]["error_wake_pending"])
        self.fx.queue_rc = 0
        self.assertEqual(self.fx.run().returncode, 4)
        self.assertEqual(len(self.fx.queue_lines()), 2)
        self.assertFalse(self.fx.read_state()["errors"]["error_wake_pending"])
        self.assertIsNone(self.fx.read_state()["errors"]["last_queue_error"])
        self.assertEqual(self.fx.run().returncode, 4)
        self.assertEqual(len(self.fx.queue_lines()), 2)


class TestNoopAndStatus(MonitorTestBase):
    def test_noop_has_zero_side_effects(self):
        self.baseline()
        state_before = self.fx.state.read_bytes()
        lock_before = self.fx.lock.exists()
        self.fx.publish(("2026-09-10", "01B", "alice", "noop see me"))
        self.fx.write_legacy("20260910T090700Z-bob-bbb7.md")
        proc = self.fx.run(["--noop"])
        self.assertEqual(proc.returncode, 0)
        self.assertIn("would queue", proc.stdout)
        self.assertRegex(proc.stdout, r"board_posts=1 legacy_bus=1")
        self.assertEqual(self.fx.state.read_bytes(), state_before)
        self.assertEqual(self.fx.queue_lines(), [])
        self.assertEqual(self.fx.lock.exists(), lock_before)
        residue = [line for line in
                   git(["status", "--porcelain"], cwd=self.fx.replica).stdout.splitlines()
                   if ".monitor-marker" not in line]
        self.assertEqual(residue, [])

    def test_noop_reports_planned_baseline_without_creating_state(self):
        proc = self.fx.run(["--noop"])
        self.assertEqual(proc.returncode, 0)
        self.assertIn("would baseline", proc.stdout)
        self.assertFalse(self.fx.state.exists())
        self.assertFalse(self.fx.lock.exists())
        self.assertEqual(self.fx.queue_lines(), [])

    def test_noop_reports_verification_failure_distinctly(self):
        self.fx.marker.write_text("NOPE")
        proc = self.fx.run(["--noop"])
        self.assertEqual(proc.returncode, 3)
        self.assertIn("kind=verify", proc.stdout)

    def test_status_reports_accurately(self):
        self.baseline()
        proc = self.fx.run(["--status"])
        self.assertEqual(proc.returncode, 0)
        self.assertIn("board_seen=1", proc.stdout)
        self.assertIn("legacy_seen=0", proc.stdout)
        self.assertIn("failure_count=0", proc.stdout)
        self.assertIn("outcome=baseline", proc.stdout)

    def test_status_without_state_is_quiet_ok(self):
        proc = self.fx.run(["--status"])
        self.assertEqual(proc.returncode, 0)
        self.assertIn("no state", proc.stdout)


    def test_noop_own_posts_use_same_budget_as_poll(self):
        self.baseline()
        self.fx.publish(("2026-09-10", "01B", "codex", "own"))
        self.fx.write_legacy("pending.md")
        proc = self.fx.run(["--noop", "--cap", "1"])
        self.assertEqual(proc.returncode, 0)
        self.assertIn("would stay quiet", proc.stdout)
        self.assertIn("legacy=1", proc.stdout)
        self.assertEqual(self.fx.queue_lines(), [])
        self.assertIn("quiet", self.fx.run(["--cap", "1"]).stdout)

    def test_noop_failure_still_plans_legacy_and_backoff(self):
        self.baseline()
        self.fx.break_origin()
        self.fx.write_legacy("pending.md")
        before = self.fx.state.read_bytes()
        proc = self.fx.run(["--noop"])
        self.assertEqual(proc.returncode, 4)
        self.assertIn("legacy_bus=1", proc.stdout)
        self.assertEqual(self.fx.state.read_bytes(), before)
        self.assertEqual(self.fx.queue_lines(), [])
        self.fx.run()
        proc = self.fx.run(["--noop"])
        self.assertEqual(proc.returncode, 4)
        self.assertIn("would stay quiet", proc.stdout)


class TestConfigAndStateHardening(MonitorTestBase):
    def test_limits_and_timeouts_reject_out_of_contract_values(self):
        for args in (["--cap", "201"], ["--max-body-bytes", "65537"],
                     ["--fetch-timeout", "inf"], ["--queue-timeout", "nan"],
                     ["--git-timeout", "-inf"]):
            with self.subTest(args=args):
                self.assertEqual(self.fx.run(args).returncode, 11)
                self.assertFalse(self.fx.state.exists())
                self.assertEqual(self.fx.queue_lines(), [])

    def test_unusable_state_fields_are_config_errors(self):
        self.baseline()
        valid = self.fx.state.read_bytes()
        for field, value in (("board_baseline_done", "false"),
                             ("last_poll", "not-an-object"),
                             ("board_after", 42),
                             ("legacy_first", "false"),
                             ("errors", {"failure_count": "bad"}),
                             ("errors", {"last_queue_error": "bad"})):
            with self.subTest(field=field, value=value):
                state = json.loads(valid)
                state[field] = value
                self.fx.state.write_text(json.dumps(state))
                self.assertEqual(self.fx.run().returncode, 11)
                self.assertEqual(self.fx.run(["--status"]).returncode, 11)
                self.assertEqual(self.fx.queue_lines(), [])

    def test_guide_plist_is_valid_and_flags_match_argparse(self):
        guide = (HERE.parent / "docs/guides/codex-coordination-monitor.md").read_text()
        xml = guide.split("```xml\n", 1)[1].split("```", 1)[0]
        plist = plistlib.loads(xml.encode())
        self.assertEqual(plist["StartInterval"], 120)
        self.assertFalse(plist["RunAtLoad"])
        mod = load_monitor_module()
        cfg = mod.build_config(plist["ProgramArguments"][2:])
        self.assertEqual(cfg.mode, "poll")
        self.assertEqual(mod.build_config(plist["ProgramArguments"][2:] + ["--status"]).mode, "status")
        self.assertEqual(cfg.expected_branch, "board-data")
        self.assertEqual(cfg.expected_origin, "https://github.com/antstanley/bus-board.git")

    def test_queue_timeout_is_bounded_and_reported(self):
        mod = load_monitor_module()
        cfg = mod.build_config(self.fx.base_argv()[2:])
        with mock.patch.object(mod.subprocess, "run", side_effect=subprocess.TimeoutExpired("queue", 30)) as run:
            with self.assertRaises(mod.QueueError):
                mod.queue_wake(cfg, mod.build_wake_text(None, 0, 1, 0, "test-time"))
            self.assertEqual(run.call_args.kwargs["timeout"], cfg.queue_timeout)
            self.assertIsInstance(run.call_args.args[0], list)

    def test_missing_required_flag_is_config_error_not_exit_2(self):
        argv = self.fx.base_argv()
        argv.remove("--thread")
        argv.remove(THREAD)
        proc = subprocess.run(argv, capture_output=True, text=True, env=self.fx.env())
        self.assertEqual(proc.returncode, 11)
        self.assertIn("config-error", proc.stderr)

    def test_noop_and_status_are_mutually_exclusive(self):
        proc = self.fx.run(["--noop", "--status"])
        self.assertEqual(proc.returncode, 11)

    def test_missing_legacy_inbox_is_config_error(self):
        shutil.rmtree(self.fx.legacy)
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 11)

    def test_corrupt_state_fails_closed(self):
        self.fx.state.write_text("{ this is not json")
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 11)
        self.assertEqual(self.fx.queue_lines(), [])

    def test_deeply_nested_state_json_fails_closed_as_config_error(self):
        self.baseline()
        self.fx.state.write_text(
            '{"version": 1, "deep": ' + "[" * 5000 + "]" * 5000 + "}")
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 11)
        self.assertEqual(self.fx.queue_lines(), [])

    def test_unknown_state_version_fails_closed(self):
        self.fx.state.write_text(json.dumps({"version": 99, "board_seen": {}}))
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 11)

    def test_legacy_subdirs_and_symlinks_ignored(self):
        self.baseline()
        (self.fx.legacy / "subdir").mkdir()
        (self.fx.legacy / "subdir" / "nested.md").write_text("n")
        os.symlink("20260910T080000Z-alice-aaaa.md", str(self.fx.legacy / "link.md"))
        proc = self.fx.run()
        self.assertEqual(proc.returncode, 0)
        self.assertIn("quiet", proc.stdout)
        self.assertEqual(self.fx.queue_lines(), [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
