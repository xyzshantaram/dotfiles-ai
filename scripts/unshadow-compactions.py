#!/usr/bin/env python3
"""
Undo compaction shadowing in a stored dsh session log.

A compaction does not delete anything. It appends a checkpoint `user/message`
carrying `surfaceOp: {"op":"replace","start":S,"end":E}`, and the surface fold
then hides every node in that positional range behind the checkpoint. The
shadowed events stay in the log untouched.

This script rewrites that one field to the string `"append"`. The checkpoint
message becomes an ordinary appended message, nothing is shadowed, and the
original conversation returns to the surface. Sequence numbers, event order,
and every other byte are left exactly as they were, so recall pointers, tool
call pairings and `sourceEventSeqs` references all keep working.

Verified against the reader in @deepseek-ai/dsh-session:

  - `surfaceOpOf` accepts the bare string "append" (lib/index.js:314).
  - `isReplaceOp` demands exactly the three keys op/start/end, so only a
    genuine replace matches the detector (lib/index.js:300).
  - `sourceEventSeqs` survives on an appended surface event: the general
    checks require a non-empty, duplicate-free, strictly earlier list, and the
    "must include every shadowed surface node" rule applies to replace only
    (lib/index.js:321-336).
  - `header.seedLength` counts seed EVENTS, not bytes (lib/index.js:1853), so
    re-serialising a line cannot invalidate it.

ZSTD FRAMING, THE PART THAT BREAKS NAIVE REPAIRS
The on-disk artifact is a concatenation of independent Zstandard frames. The
backend's startup session-list scan decompresses only the FIRST frame and
requires it to decode to exactly one newline-terminated line: the header.
Recompressing the whole rewritten log as a single frame merges the header with
every event and makes dsh refuse to start with "corrupt Zstandard session log:
first frame is not exactly one header line". This script compresses the header
alone as frame 1 and the events as frame 2, then concatenates.

BEFORE YOU APPLY
  1. Stop dsh. A running host holds the session and will overwrite the file.
  2. Install the fixed compaction build first (./sync.sh). Restoring a large
     surface under the old build simply re-destroys it on the next step.

Usage:
  unshadow-compactions.py SESSION_DIR_OR_FILE...            # dry run, default
  unshadow-compactions.py --apply SESSION_DIR_OR_FILE...    # rewrite in place
  unshadow-compactions.py --apply --from-seq 186000 PATH    # only later ones
  unshadow-compactions.py --list SESSION_ROOT               # find candidates
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

ZSTD = shutil.which("zstd") or "/usr/bin/zstd"
DEFAULT_ROOT = os.path.expanduser("~/.dsh/sessions")


def decompress(path):
    return subprocess.run([ZSTD, "-d", "-c", path], check=True, capture_output=True).stdout


def compress_frame(data):
    """Compress one independently decodable Zstandard frame."""
    return subprocess.run([ZSTD, "-q", "-c"], input=data, check=True, capture_output=True).stdout


def session_file(path):
    """Accept a session directory, a workspace directory, or the file itself."""
    if os.path.isfile(path):
        return [path]
    candidate = os.path.join(path, "session.jsonl.zstd")
    if os.path.isfile(candidate):
        return [candidate]
    found = []
    for dirpath, _dirs, names in os.walk(path):
        if "session.jsonl.zstd" in names:
            found.append(os.path.join(dirpath, "session.jsonl.zstd"))
    return sorted(found)


def is_replace_op(op):
    """Mirror of isReplaceOp: exactly the three keys, op == replace."""
    return (
        isinstance(op, dict)
        and len(op) == 3
        and op.get("op") == "replace"
        and isinstance(op.get("start"), int)
        and isinstance(op.get("end"), int)
    )


def is_checkpoint(event):
    """A compaction checkpoint: a compact-plugin user message that replaces."""
    if event.get("type") != "user/message":
        return False
    if not is_replace_op(event.get("surfaceOp")):
        return False
    source = (event.get("data") or {}).get("source") or {}
    return source.get("kind") == "plugin" and source.get("plugin") == "compact"


def scan(path, from_seq):
    """Return (header_line, lines, targets) without modifying anything."""
    raw = decompress(path)
    lines = raw.split(b"\n")
    if lines and lines[-1] == b"":
        lines = lines[:-1]
    if not lines:
        raise SystemExit(f"{path}: empty log")
    targets = []
    for index, line in enumerate(lines[1:], start=1):
        if b'"op":"replace"' not in line:
            continue
        try:
            event = json.loads(line.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            continue
        if not isinstance(event, dict) or not is_checkpoint(event):
            continue
        if from_seq is not None and event.get("seq", -1) < from_seq:
            continue
        targets.append((index, event))
    return lines[0], lines, targets


def rewrite_line(line, event):
    """Replace only the surfaceOp value, preserving the rest of the line."""
    text = line.decode("utf-8")
    op = event["surfaceOp"]
    # The stored encoding has no spaces; try the exact token first so the line
    # stays byte-identical apart from this value.
    exact = '"surfaceOp":{"op":"replace","start":%d,"end":%d}' % (op["start"], op["end"])
    if text.count(exact) == 1:
        return text.replace(exact, '"surfaceOp":"append"', 1).encode("utf-8")
    # Fall back to re-serialising this one line. Key order may change; the
    # reader parses JSON, and seedLength counts events, so this is safe.
    event = dict(event)
    event["surfaceOp"] = "append"
    return json.dumps(event, ensure_ascii=False, separators=(",", ":")).encode("utf-8")


def verify(path, expected_lines, expected_changes):
    """Re-read the written file and assert the framing and content survived."""
    first = subprocess.run([ZSTD, "-d", "-c", path], check=True, capture_output=True).stdout
    lines = [l for l in first.split(b"\n") if l != b""]
    if len(lines) != expected_lines:
        raise SystemExit(f"{path}: VERIFY FAILED line count {len(lines)} != {expected_lines}")
    appended = sum(1 for l in lines if b'"surfaceOp":"append"' in l)
    if appended < expected_changes:
        raise SystemExit(f"{path}: VERIFY FAILED only {appended} appended ops, expected >= {expected_changes}")
    json.loads(lines[0].decode("utf-8"))
    for line in lines[1:]:
        try:
            json.loads(line.decode("utf-8"))
        except json.JSONDecodeError as error:
            raise SystemExit(f"{path}: VERIFY FAILED unparseable line: {error}")
    return True


def process(path, apply_changes, from_seq):
    header, lines, targets = scan(path, from_seq)
    name = os.path.basename(os.path.dirname(path))
    if not targets:
        print(f"{name}: no compaction checkpoints to undo")
        return 0
    print(f"{name}: {len(targets)} compaction checkpoint(s)")
    for _index, event in targets:
        op = event["surfaceOp"]
        shadowed = len(event.get("sourceEventSeqs") or [])
        print(f"    seq {event['seq']:>7}  replaces surface {op['start']}-{op['end']}  ({shadowed} shadowed nodes)")
    if not apply_changes:
        print(f"    dry run, nothing written (pass --apply to rewrite)")
        return len(targets)

    out = list(lines)
    for index, event in targets:
        out[index] = rewrite_line(lines[index], event)

    backup = f"{path}.bak.{time.strftime('%Y%m%d-%H%M%S')}"
    shutil.copy2(path, backup)

    blob = compress_frame(out[0] + b"\n") + compress_frame(b"".join(l + b"\n" for l in out[1:]))
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), suffix=".tmp")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(blob)
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

    verify(path, len(out), len(targets))
    print(f"    rewrote {len(targets)} checkpoint(s); backup at {os.path.basename(backup)}")
    return len(targets)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("paths", nargs="*", help="session dir, session file, or a tree to walk")
    parser.add_argument("--apply", action="store_true", help="rewrite in place (default is a dry run)")
    parser.add_argument("--from-seq", type=int, default=None, help="only undo checkpoints at or after this seq")
    parser.add_argument("--list", action="store_true", help="report every session holding a checkpoint")
    args = parser.parse_args()

    paths = args.paths or [DEFAULT_ROOT]
    files = []
    for path in paths:
        files.extend(session_file(path))
    if not files:
        raise SystemExit("no session.jsonl.zstd found")

    total = 0
    for path in files:
        try:
            found = process(path, args.apply and not args.list, args.from_seq)
        except subprocess.CalledProcessError as error:
            print(f"{path}: zstd failed: {error}", file=sys.stderr)
            continue
        total += found
    verb = "undone" if (args.apply and not args.list) else "found"
    print(f"--- {total} checkpoint(s) {verb} across {len(files)} session(s) ---")
    return 0


if __name__ == "__main__":
    sys.exit(main())
