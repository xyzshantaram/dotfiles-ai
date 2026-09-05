# Experiment: is improving bash-guard worth the effort?

**Started and concluded:** 2026-09-05 (single-pass measurement, no deploy window)
**Owner:** sid

## Why this exists

bash-guard intercepts every `bash` tool call. Its translate layer rewrites
non-preferred commands (`find` → `fd`, `grep` → `rg`) and auto-runs the
replacement; when it cannot translate, it refuses and the agent rewrites the
command itself, costing a round-trip. This experiment measures, from all dsh
session logs to date, how often each outcome occurs and what causes the
refusals — then decides whether targeted work on the guard pays for itself.

## Method

`scan-bash-guard-friction.mjs` streams every `session.jsonl.zstd` under
`~/.dsh/sessions/` (639 files, 2,062,582 JSONL lines, 0 parse failures),
captures every bash tool result carrying a guard marker, and classifies it.
Token cost comes from the logs' own `usage` events. Raw aggregates are
committed beside this file as `scan-output.json`; every number below is
measured, none estimated.

## Findings

33,212 bash calls total. 853 guard interventions (2.57%):

| Guard action | Count | % of calls |
|---|---:|---:|
| Silent successful translation | 219 | 0.66% |
| `not_run_directly` (replacement computed but not run) | 284 | 0.86% |
| `denied_by_rule` | 248 | 0.75% |
| `could_not_translate` | 53 | 0.16% |
| `parse_fail` / `could_not_apply` | 13 | 0.04% |
| `user_rejected` (working as intended) | 36 | 0.11% |

Wasted round-trips: 598 (1.8% of all bash calls). Refused steps consumed
70.0M input / 533.7k output tokens — ~869 output tokens per failed call,
~1.7k per refusal including the rewrite. ~400 wasted round-trips in the
latest week; the failure rate is flat week-over-week, not falling. Agents
resubmitted the guard's suggested command verbatim only 6 times in 516
refusals — the payoff is eliminating the round-trip, not the suggestion text.

Top refusal classes and causes:

1. **284 compound commands** (`cd X && grep …`): the guard already computes
   the correct rewrite but `rewriteOutcome()` (bash-guard.ts:677) auto-runs
   only single readOnly matches; the compound falls to an `ask` that dies
   under auto-rejected approval in subagents.
2. **248 rule denials**, mostly `D=…; find $D/…` — unbash cannot resolve
   `$VAR` paths, so the rules deny rather than translate.
3. **53 `find -o` / `!` booleans** — fd genuinely lacks these
   (`FIND_OPERATORS`, bash-guard-translate.ts:269).

## Verdict

**Worth it, narrowly.** ~2–2.5 days of work recovers ~370 round-trips/week
(~90% of refusals) at current volume:

1. Auto-run readOnly compound translations (~0.5–1d) — fixes class 1 and most
   of class 2.
2. Resolve simple leading `VAR=path` assignments before rule matching (~1d).
3. Map `find` booleans to fd forms: `-e a -e b`, two runs for `-o`, `!` to
   `--exclude` (~0.5d).

Skip: parse-fail hardening (9 events total) and more grep/ls rules (already
effective — 120 cd-compounds and the grep→rg / find→fd paths translate
cleanly). The machinery is sound; the gaps are scope, not correctness.

## Reproduce

    node experiments/bash-guard-friction/scan-bash-guard-friction.mjs

Comparison point: `../tool-call-friction/` is the same method applied to the
edit tool, which ended in that tool's retirement. bash-guard's post-fix
ceiling is different in kind — its interventions are 2.57% of calls against
the editor's 19.2% failure rate — so the fix-not-retire verdict there does
not transfer here by analogy; the numbers stand on their own.
