#!/usr/bin/env python3
"""codex-coordination-monitor: one-shot board + legacy-bus wake monitor.

One process run equals one poll. launchd invokes it every 120 seconds
(StartInterval=120). Phase A verifies a lead-provisioned private board replica
(marker file, branch, origin URL, board.store git marker), fetches only the
pinned board-data branch, and reads new posts from the fetched ref without
touching the working tree. Phase B lists the legacy bus inbox without marking
anything read. Any new non-lead items queue one fixed-text wake to the lead's
Codex thread. Message bodies are untrusted data: they are never executed,
logged, or placed into queue text.

Contract and operational guide: docs/guides/codex-coordination-monitor.md
(task 149). Python 3.9+ standard library only; no third-party imports; no
credentials, environment-based secrets, or other config files are read.
"""

import argparse
import fcntl
import hashlib
import json
import math
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

# --- Exit codes -----------------------------------------------------------

EXIT_OK = 0            # poll completed (quiet, or wake queued and acked); successful --noop/--status
EXIT_INTERNAL = 1      # unexpected internal error (bug, permission surprise)
EXIT_BASELINE = 2      # first-run baseline initialized this run; no history replayed
EXIT_VERIFY = 3        # replica identity verification failed (fetch NOT attempted)
EXIT_FETCH = 4         # fetch/enumeration of the pinned branch failed or timed out
EXIT_QUEUE = 5         # queue call failed; nothing notified is persisted; next run retries
EXIT_LOCKED = 10       # another run holds the lock; exits quietly
EXIT_CONFIG = 11       # bad/missing configuration, unreadable/unsupported state file

STATE_VERSION = 1
DEFAULT_POSTS_PREFIX = "boards/team/posts"
DEFAULT_CAP = 200                  # examined notify candidates per poll (board reads + legacy items)
DEFAULT_MAX_BODY_BYTES = 64 * 1024  # board bodies larger than this are detected but not read
DEFAULT_FETCH_TIMEOUT = 30.0
DEFAULT_QUEUE_TIMEOUT = 30.0
DEFAULT_GIT_TIMEOUT = 15.0
DEFAULT_ERROR_NOTIFY_INTERVAL = 30  # remind about a persisting failure every Nth consecutive poll

DATA_TEXT = "[codex-coordination-monitor] new items: board_posts={board} legacy_bus={legacy} at {ts}"
FAIL_TEXT = ("[codex-coordination-monitor] board check FAILED kind={kind} "
             "consecutive_failures={failures} at {ts}; "
             "new items: board_posts=0 legacy_bus={legacy}")

MAX_DETAIL_CHARS = 200


# --- Errors ----------------------------------------------------------------

class ConfigError(Exception):
    """Bad or missing configuration, or unusable state file."""


class VerifyError(Exception):
    """Replica identity verification failed."""


class FetchError(Exception):
    """Fetch or enumeration of the pinned branch failed."""


class QueueError(Exception):
    """Wake queue call failed or timed out."""


class LockHeld(Exception):
    """Another monitor run holds the lock."""


# --- Configuration ----------------------------------------------------------

@dataclass(frozen=True)
class Config:
    replica: Path
    expected_origin: str
    expected_branch: str
    marker_path: Path
    marker_content: str
    git_binary: str
    queue_binary: str
    thread: str
    lock_path: Path
    state_path: Path
    legacy_inbox: Path
    lead_author: str
    posts_prefix: str
    cap: int
    max_body_bytes: int
    fetch_timeout: float
    queue_timeout: float
    git_timeout: float
    error_notify_interval: int
    mode: str  # "poll" | "noop" | "status"

    @property
    def remote_ref(self) -> str:
        return "refs/remotes/origin/" + self.expected_branch


class Parser(argparse.ArgumentParser):
    def error(self, message):  # argparse defaults to exit code 2, which collides with EXIT_BASELINE
        raise ConfigError(message)


def build_config(argv: Optional[List[str]] = None) -> Config:
    p = Parser(prog="codex-coordination-monitor", description=__doc__.splitlines()[0],
               allow_abbrev=False)
    req = p.add_argument_group("required configuration")
    req.add_argument("--replica", required=True, help="path to the dedicated board replica checkout")
    req.add_argument("--expected-origin", required=True,
                     help="exact expected git origin URL of the replica")
    req.add_argument("--expected-branch", required=True, help="expected checked-out branch (e.g. board-data)")
    req.add_argument("--marker-path", required=True,
                     help="path (inside the replica) of the lead-placed marker file")
    req.add_argument("--marker-content", required=True,
                     help="exact expected content of the marker file (byte-exact UTF-8)")
    req.add_argument("--git-binary", required=True, help="path to the git binary")
    req.add_argument("--queue-binary", required=True, help="path to the codex queue binary")
    req.add_argument("--thread", required=True, help="explicit lead Codex thread id for queue wake")
    req.add_argument("--lock", required=True, help="path of the exclusive flock lock file")
    req.add_argument("--state", required=True, help="path of the JSON state file")
    req.add_argument("--legacy-inbox", required=True, help="path of the legacy bus inbox directory (read-only)")
    req.add_argument("--lead-author", required=True, help="board author name of the lead (own-post exclusion)")
    opt = p.add_argument_group("optional knobs (defaults shown)")
    opt.add_argument("--posts-prefix", default=DEFAULT_POSTS_PREFIX,
                     help="board tree prefix holding posts (default: %(default)s)")
    opt.add_argument("--cap", type=int, default=DEFAULT_CAP,
                     help="max examined notify candidates per poll, with legacy priority after a full board batch "
                          "(default: %(default)s)")
    opt.add_argument("--max-body-bytes", type=int, default=DEFAULT_MAX_BODY_BYTES,
                     help="skip board bodies larger than this many bytes (default: %(default)s)")
    opt.add_argument("--fetch-timeout", type=float, default=DEFAULT_FETCH_TIMEOUT,
                     help="seconds allowed for git fetch (default: %(default)s)")
    opt.add_argument("--queue-timeout", type=float, default=DEFAULT_QUEUE_TIMEOUT,
                     help="seconds allowed for the queue call (default: %(default)s)")
    opt.add_argument("--git-timeout", type=float, default=DEFAULT_GIT_TIMEOUT,
                     help="seconds allowed for each non-fetch git call (default: %(default)s)")
    opt.add_argument("--error-notify-interval", type=int, default=DEFAULT_ERROR_NOTIFY_INTERVAL,
                     help="standalone error reminder every Nth consecutive failed poll, >=1 "
                          "(default: %(default)s)")
    mode = p.add_mutually_exclusive_group()
    mode.add_argument("--noop", action="store_true",
                      help="dry-run: verify, fetch, print the plan; no lock, queue, or state writes")
    mode.add_argument("--status", action="store_true",
                      help="print the persisted state summary and exit; touches nothing else")
    ns = p.parse_args(argv)
    if not 1 <= ns.cap <= DEFAULT_CAP:
        raise ConfigError("--cap must be between 1 and 200")
    if not 0 <= ns.max_body_bytes <= DEFAULT_MAX_BODY_BYTES:
        raise ConfigError("--max-body-bytes must be between 0 and 65536")
    if ns.error_notify_interval < 1:
        raise ConfigError("--error-notify-interval must be >= 1")
    for name in ("fetch_timeout", "queue_timeout", "git_timeout"):
        value = getattr(ns, name)
        if not math.isfinite(value) or value <= 0:
            raise ConfigError("--%s must be finite and > 0" % name.replace("_", "-"))
    return Config(
        replica=Path(ns.replica), expected_origin=ns.expected_origin,
        expected_branch=ns.expected_branch, marker_path=Path(ns.marker_path),
        marker_content=ns.marker_content, git_binary=ns.git_binary,
        queue_binary=ns.queue_binary, thread=ns.thread, lock_path=Path(ns.lock),
        state_path=Path(ns.state), legacy_inbox=Path(ns.legacy_inbox),
        lead_author=ns.lead_author, posts_prefix=ns.posts_prefix, cap=ns.cap,
        max_body_bytes=ns.max_body_bytes, fetch_timeout=ns.fetch_timeout,
        queue_timeout=ns.queue_timeout, git_timeout=ns.git_timeout,
        error_notify_interval=ns.error_notify_interval,
        mode="noop" if ns.noop else "status" if ns.status else "poll",
    )


def validate_config(cfg: Config, need_lock: bool) -> None:
    """Fail closed on provisioning problems the monitor cannot fix itself."""
    if not cfg.replica.is_dir():
        raise ConfigError("replica is not a directory: %s" % cfg.replica)
    if not cfg.legacy_inbox.is_dir():
        raise ConfigError("legacy inbox is not a directory: %s" % cfg.legacy_inbox)
    for binary, label in ((cfg.git_binary, "git"), (cfg.queue_binary, "queue")):
        if not (os.path.isfile(binary) and os.access(binary, os.X_OK)):
            raise ConfigError("%s binary missing or not executable: %s" % (label, binary))
    for path, label in ((cfg.state_path, "state"), (cfg.lock_path, "lock")):
        parent = path.parent
        if need_lock or label == "state":
            if not parent.is_dir():
                raise ConfigError("%s directory does not exist: %s" % (label, parent))


# --- Small helpers -----------------------------------------------------------

def utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sanitize_detail(raw: bytes) -> str:
    """Bound and label child-process output before it is stored or printed.

    Remote git output is unverified data; it is truncated and never echoed
    whole. Post bodies are never included in any detail string.
    """
    text = raw.decode("utf-8", "replace").strip().splitlines()
    head = text[0] if text else ""
    if len(head) > MAX_DETAIL_CHARS:
        head = head[:MAX_DETAIL_CHARS] + "..."
    return head or "(no output)"


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


# --- State -------------------------------------------------------------------

def default_state() -> dict:
    return {
        "version": STATE_VERSION,
        "initialized_at": None,
        "board_baseline_done": False,
        "legacy_baseline_done": False,
        # board post path -> sha256 of raw JSON at notify time; None = baselined, never read
        "board_seen": {},
        # legacy inbox filename -> byte size from stat at notify time
        "legacy_seen": {},
        # Constant-count progress fields; not notification acknowledgements.
        "board_after": None,        # last examined path; resume after it, wrapping once
        "legacy_first": False,      # give deferred legacy items the next poll's budget
        "errors": {
            "failure_count": 0,
            "last_error_kind": None,
            "last_error_detail": None,
            "last_error_ts": None,
            "last_error_wake_ts": None,
            "last_queue_error": None,
            "error_wake_pending": False,
        },
        "last_poll": None,
    }


def load_state(path: Path) -> Tuple[dict, bool]:
    """Load state; return (state, fresh). Fail closed on corrupt/unknown state.

    A missing state file starts a fresh state (baseline happens this run).
    A corrupt or unknown-version state file halts the monitor (EXIT_CONFIG);
    deleting the file (lead action) forces a clean re-baseline instead.
    """
    if not path.exists():
        return default_state(), True
    try:
        raw = path.read_bytes()
    except OSError as exc:
        raise ConfigError("state file unreadable: %s" % exc)
    try:
        data = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError, RecursionError):
        raise ConfigError("state file is not valid JSON: %s (delete it only as a deliberate lead reset)" % path)
    if not isinstance(data, dict):
        raise ConfigError("state file is not a JSON object")
    if data.get("version") != STATE_VERSION:
        raise ConfigError("unsupported state version %r (expected %d)" % (data.get("version"), STATE_VERSION))
    state = default_state()
    for key in ("board_seen", "legacy_seen"):
        if not isinstance(data.get(key), dict):
            raise ConfigError("state field %r is not an object" % key)
        state[key] = {str(k): v for k, v in data[key].items()}
    for key in ("board_baseline_done", "legacy_baseline_done", "initialized_at", "last_poll"):
        state[key] = data.get(key)
    state["board_after"] = data.get("board_after")
    state["legacy_first"] = data.get("legacy_first", False)
    if state["board_after"] is not None and not isinstance(state["board_after"], str):
        raise ConfigError("state field 'board_after' is not a path string")
    if type(state["legacy_first"]) is not bool:
        raise ConfigError("state field 'legacy_first' is not a boolean")
    errors = data.get("errors")
    if errors is not None:
        if not isinstance(errors, dict):
            raise ConfigError("state field 'errors' is not an object")
        state["errors"].update({k: errors[k] for k in state["errors"] if k in errors})
    for key in ("board_baseline_done", "legacy_baseline_done"):
        if type(state[key]) is not bool:
            raise ConfigError("state field %r is not a boolean" % key)
    if state["initialized_at"] is not None and not isinstance(state["initialized_at"], str):
        raise ConfigError("state field 'initialized_at' is not a timestamp string")
    if state["last_poll"] is not None and not isinstance(state["last_poll"], dict):
        raise ConfigError("state field 'last_poll' is not an object")
    errors = state["errors"]
    if type(errors["failure_count"]) is not int or errors["failure_count"] < 0:
        raise ConfigError("state failure_count must be a non-negative integer")
    if type(errors["error_wake_pending"]) is not bool:
        raise ConfigError("state error_wake_pending must be a boolean")
    if errors["last_queue_error"] is not None and not isinstance(errors["last_queue_error"], dict):
        raise ConfigError("state last_queue_error must be an object")
    return state, False


def save_state_atomic(path: Path, state: dict) -> None:
    """Write state atomically: temp file in the same directory, fsync, os.replace."""
    directory = path.parent
    fd, tmp = tempfile.mkstemp(prefix=".codex-monitor-state-", suffix=".tmp", dir=str(directory))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(state, fh, indent=2, sort_keys=True)
            fh.write("\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)
        dir_fd = os.open(str(directory), os.O_RDONLY)
        try:
            os.fsync(dir_fd)
        finally:
            os.close(dir_fd)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


# --- Lock --------------------------------------------------------------------

def acquire_lock(cfg: Config):
    try:
        fd = os.open(str(cfg.lock_path), os.O_CREAT | os.O_RDWR, 0o600)
    except OSError as exc:
        raise ConfigError("cannot open lock file: %s" % exc)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        os.close(fd)
        raise LockHeld()
    return fd


def release_lock(fd) -> None:
    try:
        fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)


# --- Phase A: board ----------------------------------------------------------

def run_git(cfg: Config, args: List[str], timeout: float, check: bool = True):
    argv = [cfg.git_binary, "-C", str(cfg.replica)] + args
    try:
        proc = subprocess.run(argv, capture_output=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise FetchError("git %s timed out after %gs" % (args[0], timeout))
    except OSError as exc:
        raise FetchError("git execution failed: %s" % exc)
    if check and proc.returncode != 0:
        raise FetchError("git %s failed rc=%d: %s" % (args[0], proc.returncode, sanitize_detail(proc.stderr)))
    return proc


def verify_replica(cfg: Config) -> None:
    """Verify replica identity before any state-changing git use. Fail closed."""
    try:
        marker = cfg.marker_path.read_bytes()
    except OSError as exc:
        raise VerifyError("marker file unreadable: %s" % exc)
    if marker != cfg.marker_content.encode("utf-8"):
        raise VerifyError("marker content mismatch (byte-exact comparison failed)")
    try:
        branch = run_git(cfg, ["rev-parse", "--abbrev-ref", "HEAD"],
                         cfg.git_timeout).stdout.decode("utf-8", "replace").strip()
        origin = run_git(cfg, ["config", "--get", "remote.origin.url"],
                         cfg.git_timeout).stdout.decode("utf-8", "replace").strip()
        managed = run_git(cfg, ["config", "--local", "--bool", "--get", "board.store"],
                          cfg.git_timeout).stdout.decode("utf-8", "replace").strip()
    except FetchError as exc:
        # A git failure during identity checks is a verification failure.
        raise VerifyError(str(exc))
    if branch != cfg.expected_branch:
        raise VerifyError("checked-out branch %r != expected %r" % (branch, cfg.expected_branch))
    if origin != cfg.expected_origin:
        raise VerifyError("origin URL mismatch (expected %r)" % cfg.expected_origin)
    if managed != "true":
        raise VerifyError("git config board.store is not true (unmanaged repository)")


def fetch_pinned(cfg: Config) -> None:
    """Fetch the pinned branch, then explicitly enforce ancestry before promotion.

    Git permits non-FF updates under refs/remotes even without '+'. Fetch
    into FETCH_HEAD only, with configured ref mappings and tag following off,
    and promote only a descendant of the previous remote-tracking commit.
    """
    old = run_git(cfg, ["rev-parse", "--verify", cfg.remote_ref], cfg.git_timeout).stdout.strip()
    run_git(cfg, ["fetch", "--quiet", "--no-tags", "--no-recurse-submodules",
                  "--refmap=", "origin", "refs/heads/" + cfg.expected_branch], cfg.fetch_timeout)
    new = run_git(cfg, ["rev-parse", "--verify", "FETCH_HEAD^{commit}"], cfg.git_timeout).stdout.strip()
    ancestor = run_git(cfg, ["merge-base", "--is-ancestor", old.decode("ascii"),
                             new.decode("ascii")], cfg.git_timeout, check=False)
    if ancestor.returncode != 0:
        raise FetchError("pinned branch is not a fast-forward of the previous tracking ref")
    run_git(cfg, ["update-ref", cfg.remote_ref, new.decode("ascii"), old.decode("ascii")],
            cfg.git_timeout)


def list_post_paths(cfg: Config, ref: str) -> List[str]:
    proc = run_git(cfg, ["ls-tree", "-r", "--name-only", "-z", ref, "--", cfg.posts_prefix], cfg.git_timeout)
    names = [n for n in proc.stdout.decode("utf-8", "replace").split("\0") if n]
    prefix = cfg.posts_prefix.rstrip("/") + "/"
    return sorted(n for n in names if n.startswith(prefix))


def blob_size(cfg: Config, ref: str, path: str) -> int:
    proc = run_git(cfg, ["cat-file", "-s", "%s:%s" % (ref, path)], cfg.git_timeout)
    return int(proc.stdout.decode("ascii", "replace").strip())


def blob_bytes(cfg: Config, ref: str, path: str) -> bytes:
    return run_git(cfg, ["cat-file", "blob", "%s:%s" % (ref, path)], cfg.git_timeout).stdout


@dataclass
class BoardPhase:
    updates: Dict[str, Optional[str]] = field(default_factory=dict)  # persisted seen entries
    baseline: bool = False            # this run initialized the board baseline
    notifiable: int = 0               # new non-lead posts worth waking about
    own: int = 0                      # lead-authored posts (excluded, recorded)
    oversize: int = 0                 # >max body: detected, not read, stays pending
    corrupt: int = 0                  # unreadable/unparsable: stays pending
    pending: int = 0                  # beyond the cap: stays pending
    reads: int = 0                    # blob read attempts; these consume the shared cap
    after: Optional[str] = None       # resume point, including malformed candidates


def board_phase(cfg: Config, state: dict, budget: Optional[int] = None) -> BoardPhase:
    ref = cfg.remote_ref
    out = BoardPhase(after=state["board_after"])
    paths = list_post_paths(cfg, ref)
    budget = cfg.cap if budget is None else budget
    seen = state["board_seen"]
    baseline_due = not state["board_baseline_done"]
    if baseline_due:
        # Initialization: record everything current without reading or waking.
        for path in paths:
            out.updates[path] = None
        out.baseline = True
        return out
    # Resume in lexical order even if earlier candidates failed to parse.
    # Wrap at most once per poll; the cursor needs only one path, not a retry set.
    after = state["board_after"]
    if after is not None:
        paths = [p for p in paths if p > after] + [p for p in paths if p <= after]
    for path in paths:
        if path in seen:
            continue
        if budget <= 0:
            out.pending += 1
            continue
        out.after = path
        try:
            size = blob_size(cfg, ref, path)
        except FetchError:
            out.corrupt += 1
            continue
        if size > cfg.max_body_bytes:
            # Detected but not read; stays pending and is re-checked next poll.
            out.oversize += 1
            continue
        budget -= 1
        out.reads += 1
        try:
            raw = blob_bytes(cfg, ref, path)
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("post is not a JSON object")
        except (FetchError, ValueError, UnicodeDecodeError, RecursionError):
            out.corrupt += 1
            continue
        author = payload.get("author")
        author = author if isinstance(author, str) else ""
        out.updates[path] = sha256_hex(raw)
        if author == cfg.lead_author:
            out.own += 1
        else:
            out.notifiable += 1
    return out


# --- Phase B: legacy inbox -----------------------------------------------------

@dataclass
class LegacyPhase:
    updates: Dict[str, int] = field(default_factory=dict)  # name -> size
    baseline: bool = False
    notifiable: int = 0
    pending: int = 0


def legacy_phase(cfg: Config, state: dict, budget: int) -> LegacyPhase:
    out = LegacyPhase()
    try:
        entries = sorted(e.name for e in os.scandir(str(cfg.legacy_inbox))
                         if e.is_file(follow_symlinks=False))
    except OSError as exc:
        raise ConfigError("legacy inbox not listable: %s" % exc)
    seen = state["legacy_seen"]
    if not state["legacy_baseline_done"]:
        # Unlike board history, the unread inbox must not be absorbed as seen.
        # Keep initialization quiet; every existing file is eligible next poll.
        out.pending = len(entries)
        out.baseline = True
        return out
    for name in entries:
        if name in seen:
            continue
        if budget <= 0:
            out.pending += 1
            continue
        try:
            size = os.stat(os.path.join(str(cfg.legacy_inbox), name)).st_size
        except OSError:
            out.pending += 1
            continue
        budget -= 1
        out.updates[name] = size
        out.notifiable += 1
    return out


# --- Wake ----------------------------------------------------------------------

def queue_wake(cfg: Config, text: str) -> bool:
    """Send one fixed-text wake. Ack = exit 0 within the timeout.

    This is transport acknowledgement only, never proof that the lead
    processed the message. The text is monitor-authored (counts/kind/date);
    message content never enters it.
    """
    argv = [cfg.queue_binary, "queue", "--thread", cfg.thread, "--message", text]
    try:
        proc = subprocess.run(argv, capture_output=True, timeout=cfg.queue_timeout)
    except subprocess.TimeoutExpired:
        raise QueueError("queue call timed out after %gs" % cfg.queue_timeout)
    except OSError as exc:
        raise QueueError("queue execution failed: %s" % exc)
    if proc.returncode != 0:
        raise QueueError("queue call failed rc=%d: %s" % (proc.returncode, sanitize_detail(proc.stderr)))
    return True


def build_wake_text(failed_kind: Optional[str], failures: int, board: int, legacy: int, ts: str) -> str:
    if failed_kind:
        return FAIL_TEXT.format(kind=failed_kind, failures=failures, ts=ts, legacy=legacy)
    return DATA_TEXT.format(board=board, legacy=legacy, ts=ts)


# --- Poll -----------------------------------------------------------------------

@dataclass
class PollResult:
    exit_code: int
    line: str


def poll_once(cfg: Config, state: dict, fresh: bool) -> PollResult:
    ts = utc_now()
    errors = state["errors"]
    board = BoardPhase()
    legacy = legacy_phase(cfg, state, cfg.cap) if state["legacy_first"] else LegacyPhase()
    failed_kind: Optional[str] = None
    failed_detail: Optional[str] = None
    baseline_initialized = False

    # Phase A: verify, fetch, enumerate.
    try:
        verify_replica(cfg)
        fetch_pinned(cfg)
        board = board_phase(cfg, state, cfg.cap - legacy.notifiable)
    except VerifyError as exc:
        failed_kind, failed_detail = "verify", str(exc)
    except FetchError as exc:
        failed_kind, failed_detail = "fetch", str(exc)

    # Phase B: legacy inbox always runs, even when phase A failed.
    if not state["legacy_first"]:
        budget_left = cfg.cap - board.reads  # read attempts consume the shared cap
        legacy = legacy_phase(cfg, state, max(budget_left, 0))
    baseline_initialized = board.baseline or legacy.baseline

    # Failure accounting and backoff.
    if failed_kind:
        failures = int(errors.get("failure_count") or 0) + 1
        errors["failure_count"] = failures
        errors["last_error_kind"] = failed_kind
        errors["last_error_detail"] = failed_detail
        errors["last_error_ts"] = ts
    else:
        failures = 0
        errors["failure_count"] = 0
        errors["error_wake_pending"] = False
    error_due = bool(failed_kind) and (
        bool(errors.get("error_wake_pending")) or
        failures == 1 or failures % cfg.error_notify_interval == 0)

    # Wake decision: at most one queue call per poll.
    data_total = board.notifiable + legacy.notifiable
    queue_attempted = False
    queue_failed: Optional[str] = None
    if data_total > 0 or error_due:
        queue_attempted = True
        text = build_wake_text(failed_kind, failures, board.notifiable, legacy.notifiable, ts)
        try:
            queue_wake(cfg, text)
            errors["last_queue_error"] = None
            if failed_kind:
                errors["last_error_wake_ts"] = ts
                errors["error_wake_pending"] = False
        except QueueError as exc:
            queue_failed = str(exc)
            if failed_kind:
                errors["error_wake_pending"] = True
            errors["last_queue_error"] = {"ts": ts, "detail": queue_failed}

    # Persistence rule: baselines and diagnostics persist regardless of queue
    # outcome. Own-post records share the successful-batch update. Notification-driven
    # seen entries persist ONLY after a successful queue acknowledgement, so
    # a queue failure leaves them unseen and the next run retries them.
    if queue_failed is None:
        # Quiet corrupt-only polls also advance. A failed queue keeps both
        # progress fields unchanged so its unacknowledged batch is retried.
        if not failed_kind:
            state["board_after"] = board.after
        state["legacy_first"] = bool(legacy.pending and board.reads >= cfg.cap)
        state["board_seen"].update(board.updates)
        state["legacy_seen"].update(legacy.updates)
        if board.baseline:
            state["board_baseline_done"] = True
        if legacy.baseline:
            state["legacy_baseline_done"] = True
    else:
        baseline_only = {k: v for k, v in board.updates.items() if v is None}
        state["board_seen"].update(baseline_only)
        if board.baseline:
            state["board_baseline_done"] = True
        if legacy.baseline:
            state["legacy_baseline_done"] = True
            state["legacy_seen"].update(legacy.updates)
    if baseline_initialized and not state.get("initialized_at"):
        state["initialized_at"] = ts
    state["last_poll"] = {
        "ts": ts,
        "mode": "poll",
        "outcome": ("verify-failed" if failed_kind == "verify" else
                    "fetch-failed" if failed_kind else
                    "queue-failed" if queue_failed else
                    "wake" if queue_attempted else
                    "baseline" if baseline_initialized else "quiet"),
        "board_new": board.notifiable,
        "board_own": board.own,
        "board_oversize": board.oversize,
        "board_corrupt": board.corrupt,
        "board_pending": board.pending,
        "legacy_new": legacy.notifiable,
        "legacy_pending": legacy.pending,
        "queued": queue_attempted and queue_failed is None,
    }

    # Exit code.
    if failed_kind == "verify":
        code = EXIT_VERIFY
    elif failed_kind:
        code = EXIT_FETCH
    elif queue_failed:
        code = EXIT_QUEUE
    elif baseline_initialized and not queue_attempted:
        code = EXIT_BASELINE
    else:
        code = EXIT_OK
    summary = ("board_new=%d board_own=%d board_oversize=%d board_corrupt=%d "
               "board_pending=%d legacy_new=%d legacy_pending=%d failures=%d") % (
        board.notifiable, board.own, board.oversize, board.corrupt, board.pending,
        legacy.notifiable, legacy.pending, failures)
    line = "poll: %s %s" % (state["last_poll"]["outcome"], summary)
    return PollResult(code, line)


def run_poll(cfg: Config) -> int:
    validate_config(cfg, need_lock=True)
    try:
        lock_fd = acquire_lock(cfg)
    except LockHeld:
        return EXIT_LOCKED  # quiet: no output, no state change
    try:
        state, fresh = load_state(cfg.state_path)
        result = poll_once(cfg, state, fresh)
        save_state_atomic(cfg.state_path, state)
        print(result.line)
        return result.exit_code
    finally:
        release_lock(lock_fd)


# --- Noop and status -------------------------------------------------------------

def run_noop(cfg: Config) -> int:
    validate_config(cfg, need_lock=False)
    state, fresh = load_state(cfg.state_path)
    print("noop: mode=dry-run lock=skipped state_write=skipped queue=skipped")
    board = BoardPhase()
    legacy = legacy_phase(cfg, state, cfg.cap) if state["legacy_first"] else LegacyPhase()
    failed_kind = None
    code = EXIT_OK
    try:
        verify_replica(cfg)
        fetch_pinned(cfg)
        board = board_phase(cfg, state, cfg.cap - legacy.notifiable)
    except VerifyError as exc:
        failed_kind, code = "verify", EXIT_VERIFY
        print("noop: board check would FAIL kind=verify detail=%s (would exit %d)" % (exc, code))
    except FetchError as exc:
        failed_kind, code = "fetch", EXIT_FETCH
        print("noop: board check would FAIL kind=fetch detail=%s (would exit %d)" % (exc, code))
    if not state["legacy_first"]:
        legacy = legacy_phase(cfg, state, max(cfg.cap - board.reads, 0))
    if not failed_kind:
        print("noop: verify=ok fetch=ok branch=%s ref=%s" % (cfg.expected_branch, cfg.remote_ref))
    if board.baseline or legacy.baseline:
        print("noop: would baseline board=%d legacy_pending=%d"
              % (len(board.updates), legacy.pending))
    failures = int(state["errors"].get("failure_count") or 0) + 1 if failed_kind else 0
    error_due = failed_kind and (state["errors"].get("error_wake_pending") or
                                failures == 1 or failures % cfg.error_notify_interval == 0)
    if board.notifiable or legacy.notifiable or error_due:
        print("noop: would queue %r" % build_wake_text(
            failed_kind, failures, board.notifiable, legacy.notifiable, utc_now()))
    else:
        print("noop: would stay quiet (no queue call)")
    print("noop: pending board=%d own=%d oversize=%d corrupt=%d legacy=%d"
          % (board.pending, board.own, board.oversize, board.corrupt, legacy.pending))
    return code


def run_status(cfg: Config) -> int:
    if not cfg.state_path.exists():
        print("status: no state at %s (monitor never ran, or state removed)" % cfg.state_path)
        return EXIT_OK
    state, _ = load_state(cfg.state_path)
    errors = state["errors"]
    print("status: state=%s" % cfg.state_path)
    print("status: initialized_at=%s board_baseline_done=%s legacy_baseline_done=%s"
          % (state["initialized_at"], state["board_baseline_done"], state["legacy_baseline_done"]))
    print("status: board_seen=%d legacy_seen=%d" % (len(state["board_seen"]), len(state["legacy_seen"])))
    last = state["last_poll"]
    if last:
        print("status: last_poll ts=%s outcome=%s board_new=%s legacy_new=%s queued=%s"
              % (last.get("ts"), last.get("outcome"), last.get("board_new"),
                 last.get("legacy_new"), last.get("queued")))
        print("status: board_pending=%s legacy_pending=%s board_oversize=%s board_corrupt=%s"
              % (last.get("board_pending"), last.get("legacy_pending"),
                 last.get("board_oversize"), last.get("board_corrupt")))
    else:
        print("status: last_poll=none")
    print("status: failure_count=%s last_error_kind=%s last_error_ts=%s last_error_wake_ts=%s"
          % (errors.get("failure_count"), errors.get("last_error_kind"),
             errors.get("last_error_ts"), errors.get("last_error_wake_ts")))
    if errors.get("last_queue_error"):
        print("status: last_queue_error=%s %s"
              % (errors["last_queue_error"].get("ts"), errors["last_queue_error"].get("detail")))
    return EXIT_OK


# --- Entry point ------------------------------------------------------------------

def main(argv: Optional[List[str]] = None) -> int:
    try:
        cfg = build_config(argv)
    except ConfigError as exc:
        print("config-error: %s" % exc, file=sys.stderr)
        return EXIT_CONFIG
    try:
        if cfg.mode == "status":
            return run_status(cfg)
        if cfg.mode == "noop":
            return run_noop(cfg)
        return run_poll(cfg)
    except LockHeld:
        return EXIT_LOCKED
    except ConfigError as exc:
        print("config-error: %s" % exc, file=sys.stderr)
        return EXIT_CONFIG
    except Exception as exc:  # unexpected: one bounded line, no content
        print("internal-error: %s: %s" % (type(exc).__name__, sanitize_detail(str(exc).encode())),
              file=sys.stderr)
        return EXIT_INTERNAL


if __name__ == "__main__":
    sys.exit(main())
