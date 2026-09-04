# Outcome: the hashline editor was retired on 2026-09-04

This closes the experiment in `README.md` next to this file. It records what the
fork fixed, what it did not, the numbers that decided the retirement, how to
reproduce them, and two tests that are still owed.

It also carries the root-cause note that used to live as ticket T10 in
`PLAN.md`. That ticket is gone, because the plugin it targeted is gone. The
analysis is kept because its closing question now applies to the tool we
actually run.

## 1. The fork fix worked

The served-mirror re-base was correct and is not in question.

| Metric, per 100 mutating calls | Baseline 0.5.1 | After the fork |
| --- | ---: | ---: |
| total failures | 25.17 | 20.4 |
| `E_RANGE_UNVERIFIED` | 8.67 | **0** |
| `drifted_after_edit` | 12.11 | **0** |

Measured over 121 session files and 1,593 mutating calls since the deploy at
2026-08-31T20:36. The README asked for "at least a few hundred mutating calls"
before drawing a conclusion, so that bar is met. Both target numbers went to
zero and stayed there.

## 2. Why we retired it anyway

The fork removed the bug. It did not make the tool cheap.

**Failure rate by model, post-fix, per edit call:**

| Model | calls | failure |
| --- | ---: | ---: |
| claude-opus-5 | 371 | 6.2% |
| glm-5.3-flash | 272 | 20.2% |
| z-ai/glm-5.3-flash | 725 | 25.0% |
| all | 1,375 | 19.2% |

Against opencode's builtin `str_replace` editor over 13,523 calls: **1.8%**.

So on a strong model the hashline editor failed about 3.4 times as often. On the
cheap models that run most of the work it failed 11 to 14 times as often. The
anchor state machine costs more than it returns.

**The batch API did not justify itself either.** Mean batch size was 1.36,
median 1. The multi-edit contract that the anchor bookkeeping exists to support
was almost never used.

**What was still failing after the fix**, from the scanner:

```
E_BATCH_ABORT: 219   E_BAD_SHAPE: 30   NO_CODE: 30
FS_SANDBOX_DENIED: 15   E_RANGE_STALE: 13   E_NOT_OBSERVED: 8
E_NOT_FOUND: 6   E_NOT_TEXT: 2   INVALID_ARGS: 2
```

`E_BATCH_ABORT` was 67% of the remainder. Breaking down 183 genuine aborts:

- Inner cause: `E_STALE_ANCHOR` 163 (89%), then `E_BAD_REF` 8,
  `E_RANGE_STALE` 4, `E_RANGE_UNVERIFIED` 4, `E_EDIT_HASH_ECHO` 3,
  `E_RANGE_UNSERVED` 1.
- Failing item index: `edits[0]` 197, `edits[1]` 31, `edits[2]` 12, `edits[3]` 3.
  So the first anchor was already stale. This was not later items being
  invalidated by earlier ones in the same batch.
- 125 of 183 reported "2 stale anchors" naming the same hash twice, which is a
  single-line edit where `remove_from` equals `remove_to`.
- Recovery cost: 172 of 183 reached a successful edit, median 2 model steps, and
  **78% needed a full re-read first**. The rejection text told the model to
  re-read even though the tool held the fresh anchors already.

## 3. What the switch bought

Measured from request headers either side of the restart on 2026-09-04:

| | before | after |
| --- | ---: | ---: |
| tools in the prefix | 64 | 30 |
| tool schema | 45,298 chars | 31,897 chars |
| system prompt | 18,674 chars | 17,066 chars |

About 15,000 characters, near 4,300 tokens, off the fixed prefix of every
request. Most of that is the MCP gating that landed at the same time, not the
editor. The prefix caches, so the direct saving is small. The edit failure rate
is the real prize.

## 4. Methodology, to reproduce or to re-run

The scanner in this folder produced the headline table:

```sh
cd ~/repos/dotfiles-ai/experiments/tool-call-friction
SINCE=2026-08-31T20:36 node scan-hashline-friction.mjs ~/.dsh/sessions /tmp/dsh/retest
cat /tmp/dsh/retest/summary.txt
```

`SINCE` filters on the **event** timestamp, not the file mtime. Use a time
component. The README explains why an mtime filter reports a false rate.

The per-model and per-abort numbers came from reading the session logs directly,
because the scanner does not break down by model. The shape:

1. `fd -t f 'session.jsonl.zstd' ~/.dsh/sessions` to list logs.
2. Per file, `zstd -dc` piped to `jq`, selecting `assistant/message` for
   `tool-call` blocks (id and name) and `tool/result` for the result text.
   Join them on the tool-call id to attribute a result to a tool.
3. The dominant model per session comes from `.data.message.source.model` on
   `assistant/message`.
4. A successful edit result starts with `Successfully edited`. Anything else is
   a failure.

**Two traps that cost real time here:**

- Do not run per-file extractions with `xargs -P` writing to one shared stdout.
  Partial lines interleave and fabricate impossible values. An early pass this
  way produced a single 34-billion-token request. Write one output file per
  session, then concatenate.
- Do not `sort -u` tool names across every header in a file. A long session
  holds headers from before and after a config change, and merging them reports
  the union as if it were the current state. Compare one header at a time.

## 5. Kept from ticket T10: the escalation-dropping bug

Hit live on 2026-09-01. `edit` answered
`[sandbox: file access denied under workspace-write mode]` with the hint to
retry using `sandbox_permissions`. The escalated retry produced the identical
denial and no approval prompt. The tool told the model to escalate, then ignored
the escalation.

Root cause, read in the installed fork build:

- `tool-edit.js:84` called
  `sandbox.resolvePolicy("edit", { path: resolvedPath, edits: req.edits }, exec)`
  with a freshly built object carrying only `path` and `edits`, so
  `sandbox_permissions` and `justification` were dropped.
- `sandbox.js` `resolvePolicy` returns the standing policy immediately when
  either field is undefined, so `approveEscalation` never ran and `ctx.approval`
  was never asked.
- `mapError` then reported the denial with `policy.mode`, which is why the
  message still named `workspace-write` on the escalated retry. That was the
  tell.
- `tool-edit.js:58` did spread `sandbox.schemaFields()` into the parameters, so
  both fields were advertised to the model and were inert.
- `tool-undo.js:54` passed `canonical` instead, and `contract.js`
  `normalizeRequest` re-attached both fields after narrowing, so
  `undo_last_edit` escalated correctly. The working sibling was three lines
  away.
- `contract.js` `prepareEditArguments` had the same narrowing defect.

This punished the model for following the documented recovery. The harness rule
says to retry a denial once with `sandbox_permissions`. The model burned a call,
got the same denial, and had no way to tell a policy refusal from a dropped
argument.

## 6. Owed tests

Two things are unverified. Neither blocks anything today.

**Test 1: does the builtin editor have the same escalation defect?**

The T10 note ended by asking whether upstream `@deepseek-ai/dsh-tool-fs` shares
the shape. We now run that tool, so this is no longer hypothetical. A second
report agrees: `handoff.md` section 8 states "The `edit` tool drops its own
escalation. Only `bash` escalation reaches that path." That was observed against
the hashline editor and has NOT been re-checked against the builtin.

Check it by hand:

1. Pick a path outside the session workspace, for example under `~/.dsh`.
2. Call `edit` on it with no escalation. Expect a sandbox denial.
3. Call the same `edit` with `sandbox_permissions: danger-full-access` and a
   justification.
4. An approval prompt must appear. If the identical denial returns with no
   prompt, the builtin has the same defect and it is worth reporting upstream.

`dsh-tool-fs` README line 54 claims write and edit "resolve approved retries
through `ctx.approval`" when the executor confines, so the documented behaviour
is correct. The test is whether the code matches the README.

**Test 2: re-measure the edit failure rate on the builtin editor.**

The 1.8% figure comes from opencode, not from this machine. Collect a few
hundred mutating calls, then compare like for like against the 19.2% above.
`scan-hashline-friction.mjs` will not do this, because it keys on hashline error
codes. Either extend it or use the direct log method in section 4, treating a
result that starts with `The file ... has been updated` as success.

Use the restart on 2026-09-04 as the `SINCE` boundary.
