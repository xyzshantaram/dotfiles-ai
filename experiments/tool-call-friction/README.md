# Experiment: does fixing dsh-better-edit reduce edit friction?

**Started:** 2026-08-31
**Check back:** 2026-09-07 (or after a few days of normal work)
**Owner:** sid

## Why this exists

Edits through `dsh-better-edit` failed often. I scanned every dsh session log to
find out why. One bug caused most of the failures. This experiment runs a patched
fork for a week and measures whether the failure rate drops.

## What the scan found

The scan covered 371 session files in `~/.dsh/sessions`, which held about 12,100
`read`, `edit`, `batch_edit`, and `undo_last_edit` calls and about 750 failures.

| Cause | Count | Verdict |
| --- | --- | --- |
| Served mirror wiped after an edit | 414 | Real bug. Fixed. |
| `offset` / `limit` sent as a string | 83 | Real bug. Fixed. |
| Sandbox denial, missing file, real drift | ~215 | Correct behavior. Left alone. |
| Anchor the model invented | 94 | Correct rejection. Left alone. |

### The main bug

`read` records which lines it showed the model. That record is the "served
mirror", and it is indexed by line position. After an edit, `mutation.ts` called
`recordServedTruncated(...)` with `clearFrom = range.startLine - 1`, and
`_mergeServedRows` nulled every entry from that line to the end of the file.

So an edit near the top of a file erased the served record for every line below
it, even though those lines never changed. The next edit lower in the same file
then failed with `E_RANGE_UNVERIFIED`, and the model had to re-read the whole
file to recover.

Of 465 `E_RANGE_UNVERIFIED` anchor checks, 433 named an anchor that had been
served for that exact file. Of those, 414 had an edit to the same file in
between. The other buckets were small: 94 anchors were never served at all, and
76 were served for a different file.

### Live reproduction

Confirmed by hand on 2026-08-31 against the installed 0.5.1, and the same code
path exists in 0.6.0:

1. Write a 30-line file. Every line gets served.
2. Edit line 3 and add two lines.
3. Edit line 27 with the anchor from step 1. It fails with `E_RANGE_UNVERIFIED`.
4. Send the byte-identical call again. It succeeds.

Step 3 and step 4 are the same call. The error echo in step 3 re-served the row,
which is the only thing that changed. The anchor was always valid and the content
never moved. That proves the rejection was bookkeeping, not a safety check.

## The fix

Fork: <https://github.com/xyzshantaram/dsh-better-edit>
Branch: `fix/served-mirror-rebase`
Pinned commit: `873b9fd53e71a8bbe587297944dbf4542ce7d64a`
Base: upstream `ab62103`, version 0.6.0

Three commits:

1. `fix(test): stub DSH_HOME so the suite stops writing to the real store`
   `resolveDshHome()` reads `DSH_HOME` before `HOME`. The temp-home test helpers
   stubbed only `HOME`, so the suite resolved the store to the real `~/.dsh` and
   wrote test rows into the live hash store. This cleared 30 pre-existing test
   failures. Upstream still has this bug.
2. `fix(served): re-base the served mirror after an edit instead of clearing the tail`
   The main fix. New `recordServedRebased()` maps served entries onto their new
   line positions instead of nulling the tail.
3. `fix(read): accept a numeric string for offset and limit`
   The schema now accepts a number or a string, and `assertReadRequest` coerces a
   whole-number string. A bad string still fails, with a message that names the
   field.

### Why the re-base is safe

A hash is a content address. `mapStableHashes` carries an old hash onto a new
line only when the canonical content matches, and it seeds its allocator with
every old hash, so a new line can never receive one. A hash that was served and
still appears in `resultHashes` therefore marks a line whose content the model
has already seen. Moving its served entry to the new index keeps that claim true.
Only the position changes.

A line the model never saw holds a hash that was never served, so it stays unset
and still needs an explicit serve. A line the edit removed drops out.

This does not soften the rejection policy. Upstream removed an auto-fix in
ADR-0007 because it silently corrupted content, and the project rule is
"rejected, never fuzzy-matched". This fix guesses nothing.

### Verification done so far

- All 1223 tests pass. Typecheck and lint are clean. Clean `main` had 30 failures.
- 8 new regression tests cover the re-base and the coercion.
- The fork installs from GitHub and builds. Both fixes are present in `lib/`.

## Confound: 0.5.1 to 0.6.0

The baseline below was measured while running 0.5.1. The fork is based on 0.6.0,
which is a breaking change: `batch_edit` is gone, and `edit` now takes
`{path, edits: [[remove_from, remove_to, replacement_text], ...]}`.

So the retest changes two things at once. Accepted on purpose, because the bug is
byte-identical in 0.6.0, so waiting would not have avoided it.

`drifted_after_edit` is still a clean signal. Nothing in the 0.5.1 to 0.6.0 range
touches the served-mirror code path. That number should go to roughly zero. Treat
the other numbers as softer evidence.

## Baseline (2026-08-31, all 371 sessions, dsh-better-edit 0.5.1)

```
failures per 100 mutating calls:            25.17
E_RANGE_UNVERIFIED per 100 mutating calls:   8.67
drifted_after_edit per 100 mutating calls:  12.11
```

Raw counts: 8727 `read`, 2742 `edit`, 666 `batch_edit`, 10 `undo_last_edit`.

Bucket counts are per anchor, and one failure can name two anchors. That is why
`drifted_after_edit` can exceed the `E_RANGE_UNVERIFIED` rate. Compare like for
like against a rerun of the same script.

## How to deploy

```sh
cd ~/repos/dotfiles-ai
./sync.sh
```

`sync.sh` pins the fork in `step_install_plugins`. Confirm it took:

```sh
rg -n "better-edit" ~/.dsh/profiles/web/package.json
```

You want the GitHub pin, not `^0.5.1`. Restart dsh so the new tools load.

## How to retest

Set `SINCE` to the deploy date. Without it the scan reads every session ever
recorded, and the old data hides the effect.

```sh
cd ~/repos/dotfiles-ai/experiments/tool-call-friction
SINCE=2026-08-31 node scan-hashline-friction.mjs ~/.dsh/sessions /tmp/dsh/retest
cat /tmp/dsh/retest/summary.txt
```

Compare the three headline numbers against the baseline above.

## How to read the result

- `drifted_after_edit` at or near zero: the main fix works. This is the number
  that matters.
- `drifted_after_edit` unchanged: the fix did not deploy, or the diagnosis is
  wrong. Check the pin first, then rerun the live reproduction in this document.
- Total failure rate down but `drifted_after_edit` still high: something else
  improved. Do not credit this fix.

Collect at least a few hundred mutating calls before drawing a conclusion. The
summary prints the count.

## If it works

File upstream at <https://github.com/Rianico/dsh-better-edit/issues>. Send the
three commits as separate pull requests, because they are independent:

- The test-home fix is small and self-contained. Send it first.
- The served-mirror fix is the valuable one. Include the live reproduction, the
  before and after numbers, and the safety argument above.
- The read coercion is independent and easy to review.

Upstream cares about the anchor philosophy. Lead with the fact that the fix
guesses nothing and only corrects position bookkeeping.

## Not fixed, on purpose

- `E_BAD_SHAPE` from `read` called with bash-shaped arguments (`command`,
  `description`), or with `sandbox_permissions` and `justification`. `edit`
  accepts those two, `read` does not, which is an upstream inconsistency. Low
  volume. Stripping unknown fields would be easy but hides a real model mistake.
- A whole `HASH│content` row pasted into `remove_from`. About 5 cases. Stripping
  to the leading hash is unambiguous and would be safe.
- Line numbers passed as anchors. Not safely healable. Mapping a number to a hash
  is exactly the guessing the tool refuses to do.

## Files

Everything for both experiments lives in this folder.

- `scan-hashline-friction.mjs` — the hashline scanner. Supports `SINCE`.
- `scan-sandbox-friction.mjs` — the sandbox scanner. Supports `SINCE`.
- `../../sync.sh` — carries the fork pin. Not committed with this work.
- `../../home/AGENTS.md` — carries the two sandbox nudges.
- `~/repos/dsh-better-edit` — the fork clone. `origin` is your fork, `upstream`
  is Rianico.

---

# Companion experiment: sandbox escalation nudges

Same start date. Same check-back date. Measure this at the same time.

## Why

The sandbox wastes about as many calls as the hashline bug did. The scan counts
a real failure as a tool error, or a bash call whose `[exit code: N]` is not
zero.

| Class | Count | What happens |
| --- | --- | --- |
| Escalated to the mode already held | 248 | The model hits a denial and asks for `workspace-write` while already holding it. Every sample requested `workspace-write`. The call always fails. |
| Denial with the `[sandbox: ...]` marker | 120 | The model escalates 79% of the time, so the marker works. Only 48 of 94 escalations succeed. The rest become the row above. |
| Permission failure with no marker | 118 | The model escalates 54% of the time, and only 14 of 64 succeed. 46% invent a workaround instead. |
| Escalation refused by the user | 10 | Correct behavior. |

That is roughly 485 wasted calls against 414 for the hashline bug.

The unmarked class is almost all `/run/user/1000` and cache directories:

- `podman: mkdir /run/user/1000/libpod: read-only file system`, many repeats
- `caffeine.sh: /run/user/1000/caffeine.pid: Read-only file system`
- `npm error EROFS ... /home/sid/.npm/_cacache`
- `touch: ~/.local/share/containers/storage/.writetest: Read-only file system`

These are the sandbox. They arrive as raw operating system errors with no
marker, so the model reads them as a broken machine instead of a gate.

## The nudges

Two rules in `home/AGENTS.md`, near the `/tmp/dsh` scratch rule:

1. Escalate to the next mode up, never to the mode already held. The runtime
   context states the current policy. Under `workspace-write` the only wider
   mode is `danger-full-access`.
2. Treat `EROFS`, `read-only file system`, `EACCES`, and `Permission denied` on
   a path outside the workspace as the sandbox. Retry once with
   `danger-full-access`, or redirect the write into `/tmp/dsh`.

Run `./sync.sh` to copy them to `$DSH_HOME/AGENTS.md`.

## Why there are no guard rules for this

The bash guard cannot express these nudges. `GuardEntry` in
`plugins/bash-guard.ts` supports `commands`, `verdict`, `reason`,
`subcommands` by name, `rewrites` that only drop a flag, and `translate`. It
cannot match on argv content.

- A `podman` rule would have to deny every subcommand, because all of them fail
  under `workspace-write`. That would also break `podman` when the session
  already holds `danger-full-access`, because the guard gates bash calls
  independently of the sandbox mode.
- An `npm` rule would need "deny only when `--cache` is absent". The schema
  cannot express that, and `rewrites` cannot add a flag.

Also note that `reason` reaches the model only on `deny`. On `ask` it goes to
the human approval prompt, and the command still fails after approval unless
the model escalates.

If the prompt rules do not move these numbers, the next option is a plugin that
appends the escalation hint to bash output when it matches the permission
patterns. That is real code, so try the prose first.

## Baseline (2026-08-31, all 372 sessions)

```
marked denials (with hint):        120
opaque permission failures:        118
escalated to mode already held:    248
escalation refused by user:         10

after a MARKED denial:  79% escalate, 48/94 succeed
after an OPAQUE failure: 54% escalate, 14/64 succeed
```

## Retest

```sh
cd ~/repos/dotfiles-ai/experiments/tool-call-friction
SINCE=2026-08-31 node scan-sandbox-friction.mjs ~/.dsh/sessions /tmp/dsh/sandbox-retest
```

## How to read the result

- "Escalated to the mode already held" near zero: rule 1 works. This is the
  clearest signal, because the rule maps to exactly one error string.
- Opaque escalation success rate climbing from 22% toward the marked rate of
  51%: rule 2 works.
- Both flat: prose alone does not carry it. Build the bash output wrapper.

Watch for the opposite failure too. If escalation requests rise sharply and the
user starts refusing them, the rules are too eager. The "escalation refused by
user" count should stay near its baseline of 10.

