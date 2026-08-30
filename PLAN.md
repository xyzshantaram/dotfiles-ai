# Plan — profiles plugin audit and hardening, plus sync-models.mjs hardening

## Vision

Make the profiles plugin correct under concurrency and honest about failure.
Every fallback path must pick the right chain, isolate its state per agent, and
degrade to a working route instead of failing the turn.

This plan also tracks a second, unrelated effort found in the same session:
hardening `sync-models.mjs`'s model-seeding pipeline (real YAML parsing,
marker-region regeneration, and a one-time reseed of `command-code` and
`opencode-zen`). The two efforts share this file only because T6 below cannot
be verified until this second effort lands; they are otherwise independent.

## Verified harness facts

These facts were read from the installed dsh packages in this session. Treat
them as settled. Do not re-research them.

- `agentEvents` fuses the agent into every payload. A listener of
  `agent/request` receives `{ turn, step, signal, agent }`. A listener of
  `agent/request-error` receives `{ turn, step, provider, failure, retryPolicy,
signal, agent }`. Source: `dsh-agent/lib/index.js`, function `agentEvents`.
- `turn` and `step` are per-agent counters on `this.phase`. Two live agents may
  hold the same pair at the same time. Source: `dsh-agent-loop/lib/index.js`
  lines 521, 533, 603.
- Depth reads as `Math.max(agent.session.header.delegationDepth ?? 0,
agent.options.subagentDepth ?? 0)`. Source: `dsh-subagent/lib/index.js`
  lines 43-47.
- `agent/request-error` must return `{ kind: "retry" }` to retry. Any other
  value throws `LlmError`. Source: `dsh-agent-loop/lib/index.js` line 662.
- An empty provider or model in the returned proposal throws
  `agent "<id>" has no provider/model`. Source: `dsh-agent-loop/lib/index.js`
  line 722.
- `resolveCallConfig` throws `LlmError` with a `code` field. Known codes
  include `NO_ADAPTER`, `INVALID_MODEL_INFO`, and
  `UNSUPPORTED_REASONING_EFFORT`. Source: `dsh-llm/lib/index.js` lines 1394,
  1403, 1412, 1415.
- The harness default retryable codes are `EMPTY_RESPONSE`, `RATE_LIMIT`,
  `SERVER`, `TIMEOUT`, and `TRANSPORT`. Source: `dsh-llm/lib/index.js`
  lines 360-367.
- `settings/updated` calls a listener with `(ns, next, prev, source)`.
  Source: `dsh-settings/lib/index.js` lines 561-569.

## Settled decisions

- An off-chain manual pick becomes the head of the level list and then fails
  over along the depth-correct chain.
- The down-cache classifies on structured codes first. Auth, no-credits, and
  model-unavailable hold for 10 minutes. Rate limit holds for 30 seconds. A
  generic 400 is never cached.
- Scope covers the host plugin, the shared route model, and the client panel.
- Cleanup items land in the same pass.

## Tickets

### T1 — route model safety (`plugins/profile-routes.ts`)

**Status:** done
**Fixes:** A11, plus the `routesEqual` effort gap.
**Acceptance criteria:**

- `isRouteCandidate` rejects an empty `provider` or an empty `model`.
- `routesEqual` compares `reasoningEffort` as well as provider and model.
- The module doc states that a blank route row is dropped, and why.
- `pnpm exec tsc --noEmit` reports no new error.

### T2 — down-cache retune (`plugins/profiles.ts`)

**Status:** done
**Fixes:** A4.
**Acceptance criteria:**

- Classification reads `failure.code` against an explicit code table first.
- Message matching survives only as a narrow fallback for auth and no-credits
  wording. No bare `model`, `400`, or `404` substring test remains.
- Each class carries its own time to live. Rate limit uses 30 seconds. The
  other three use 10 minutes.
- `isCachedDown` honors the per-class time to live.

### T3 — failover rewrite (`plugins/profiles.ts`, `registerFailover`)

**Status:** done
**Fixes:** A1, A2, A3, A5, A6, A7, A10.
**Acceptance criteria:**

- Per-step state lives in a `WeakMap` keyed by the agent object. The stored
  `stepKey` still guards a stale step.
- A payload with no agent passes through untouched and logs one warning.
- Depth comes from `depthOf(payload.agent)`. The both-chains guess is gone.
- The level list is the proposal followed by the depth chain minus that route.
  The `agentDefaultModel.currentSelection()` prefix is gone.
- A level whose route differs from the proposal drops the inherited
  `reasoningEffort` unless the level supplies one. The probe builds the same
  config it would return.
- When every level is cached down, the walk retries while ignoring the cache
  and logs a warning. It never throws for cache reasons alone.
- The unreachable `!s` branch and its `"(no levels)"` string are gone.
- `STATE_CAP`, `stateOrder`, and the linear eviction are gone.

### T4 — host routes and flip detection (`plugins/profiles.ts`)

**Status:** done
**Fixes:** A8, A9, A12.
**Acceptance criteria:**

- The local `sendJson`, `readBody`, `isPlainObject`, and `MAX_BODY_BYTES`
  copies are gone. The module imports them from `plugins/shared/http.ts`.
  The `TODO(dedup)` comment is gone.
- `GET` and `PUT` return the raw entry fields plus a `resolved` view, and
  `chains` is always an object.
- The `settings/updated` listener uses `prev`. It clears the cache on any
  profile write. It calls `syncDefaultModel` only when the resolved
  orchestrator head of the active entry changed.
- The module header no longer claims that `agent` is absent from the payload.

### T5 — panel correctness (`plugins/profiles-client/src/client.tsx`)

**Status:** done
**Fixes:** B1, B2, B3, B4, B5, B6.
**Acceptance criteria:**

- The entry chain select renders an option for the current inline or
  composition value, so a populated field never displays as `— none —`.
- The panel edits the raw entry fields served by T4 and never recovers a chain
  name by guessing.
- `cloneRoutes` preserves `reasoningEffort`.
- The save state initializes to a real object, not `null`.
- `useSyncExternalStore` receives stable `subscribe` and `getSnapshot`
  references.
- `addChain` creates an empty chain, not a blank placeholder rung.
- Dead code is gone: the unused `exports` binding, `addChainRung`, and the
  unused `field` parameter of `setChainField`.

### T6 — verification

**Status:** todo
**Acceptance criteria:**

- `node build.mjs` passes and rebuilds every bundle that embeds
  `profile-routes`: `profiles.js`, `see.js`, `profiles-client/dist/client.js`,
  and `subscriptions/lib/client.js`.
- `pnpm exec tsc --noEmit` reports only the known pre-existing errors.
- `pnpm exec prettier --check .` passes.
- The orchestrator independently verifies at least one concrete behavior claim
  per ticket before closing it.

The tickets below are a THIRD, unrelated effort: make `bash-guard` translate
`grep` and `find` into `rg` and `fd` instead of denying them. A weaker model
does not learn from a denial. It retries another denied form and burns tokens.
This effort does not close T6.

**Settled decisions for this effort.** `find` translation is best effort. Keep
`rg` and `fd` default behavior, so do not add flags to reproduce POSIX
traversal. Warn the model every time a translation fires, with one short line.
A mutating `find` predicate translates and then returns `ask`. An
untranslatable expression denies and names the exact blocking token.

**Verified facts for this effort.** Read from the installed dsh packages,
`node_modules`, and the installed tools in this session. Treat them as settled.

- `PreToolDecision` is `{ kind: 'allow' } | { kind: 'deny', reason } |
{ kind: 'ask', reason? }`. An allow carries no message field, so a warning
  cannot ride a pre-execute allow. Source: `dsh-tools` types, lines 418 to 426.
- The same declaration states at line 415 that input rewriting is excluded from
  the pre-execute contract because arguments are already logged and presented.
  The guard mutates `exec.arguments.command` anyway, so the transcript shows the
  ORIGINAL command while the rewritten one runs. That is why the note exists.
- `PostToolDecision` accept may replace `content` OR `value`, never both. The
  runtime throws `TypeError` when a decision carries both. Source: same file,
  lines 431 to 445.
- `ToolExecutionInput.callId` exists and `ToolExecution` extends it. It is the
  pre-execute to post-execute correlation key. Source: same file, lines 196 and 260.
- Both result variants carry `content: ContentBlock[]`. A text block is
  `{ type: 'text', text: string }`.
- unbash `Command` is `{ type, pos, end, name: Word | undefined, prefix,
suffix: Word[], redirects }`. `Word` carries absolute `pos` and `end`.
- The existing `RewriteRule` only deletes byte ranges. It cannot rename the
  command word, so translation is new machinery.
- ripgrep 15.2.0 has NO `--include` and NO `--exclude`. Use `-g GLOB` and
  `-g !GLOB`. `rg -I` is `--no-filename`, not `-h`. `rg -z` is `--search-zip`,
  which is not `grep -z`. `grep -z` maps to `rg --null-data`.
- fd 10.4.2 has `--search-path`, `-d/--max-depth`, `--min-depth`, `-g/--glob`,
  `-t/--type`, `-p/--full-path`, `-S/--size`, `-0/--print0`, `-x/--exec`, and
  `-X/--exec-batch`. `-t e` means empty.
- `build.mjs` bundles `plugins/bash-guard.ts` with `bundle: true`, so a sibling
  source file costs nothing at runtime.

### T7 — translator plumbing (`plugins/bash-guard.ts`)

**Status:** done
**Acceptance criteria:**

- `GuardEntry` gains an optional `translate` field. `loadRules` accepts only a
  known translator name and skips the rule file otherwise, with the existing
  warning log.
- The two near-identical `rules.set` branches collapse into one object build.
  A third copy is not added.
- A translation pass runs in `evaluate` after the rewrite pass, only at
  `depth === 0`.
- `ok` splices the new argv in and re-enters `evaluate` at `depth + 1`, so the
  result is re-checked against `guards/rg.json`, the profile overlay, and the
  scratch escape.
- `ask` splices, re-enters, and forces the final decision to `ask` even when the
  re-entry would allow.
- `blocked` returns `deny` whose reason names the exact blocking token.
- A redirect inside the splice range returns `deny` rather than a re-emission
  attempt.
- A failed mutation of `exec.arguments.command` returns `deny`. The original
  `grep` or `find` never runs. This is the safety fix and it must ship in the
  same pass.
- `shellQuote` round trips a word with a space, a single quote, and a glob.

### T8 — grep translator (`plugins/bash-guard-translate.ts`)

**Status:** done
**Acceptance criteria:**

- `grep`, `egrep`, `fgrep`, `zgrep` map to `rg`. `fgrep` adds `-F`. `zgrep`
  adds `-z`. `egrep` adds nothing and carries a note.
- `-r` and `-R` drop, because `rg` recurses by default.
- `--include=GLOB` maps to `-g GLOB`. `--exclude=GLOB` maps to `-g !GLOB`.
- `-h` maps to `--no-filename`, not to a short `-h`.
- `-z` maps to `--null-data`, not to `-z`.
- An unmapped flag returns `blocked` naming that flag.
- The first non-flag argument is the pattern unless `-e` or `-f` supplied one.
  Every later positional is a path.

### T9 — find translator (`plugins/bash-guard-translate.ts`)

**Status:** done
**Acceptance criteria:**

- `find` maps to `fd`. Leading path arguments become `--search-path` entries.
- `-name`, `-iname`, `-path`, `-type`, `-maxdepth`, `-mindepth`, `-size`,
  `-newer`, `-empty`, `-print0`, `-print`, and `-follow` map to their confirmed
  fd equivalents.
- `-delete`, `-exec`, and `-execdir` style predicates translate and return
  `ask`, or return `blocked` when fd has no safe equivalent.
- `-o`, `-a`, `-not`, `!`, and parentheses return `blocked` naming the operator.
  fd has no general boolean expression language.
- Any other predicate returns `blocked` naming that exact predicate.

### T10 — warning channel (`plugins/bash-guard.ts`)

**Status:** done
**Acceptance criteria:**

- `evaluate` returns the notes it produced.
- `apply` registers a `tools/post-execute` listener that prepends one text block
  to the result content for a bash call carrying a stored note.
- The note map is keyed by `exec.callId`, is deleted on read, is deleted on
  deny, and is capped at 64 entries with oldest-first eviction.
- The listener calls `next()` for a non-bash tool and for a call with no note.
- An accept decision that owns `value` passes through untouched, because the
  runtime rejects a decision carrying both `content` and `value`.
- A failing listener cannot fail the tool call. The body is wrapped in
  try/catch and falls back to `next()`.

### T11 — rules, docs, build, tests

**Status:** done, pending the user's own hands-on check
**Acceptance criteria:**

- `guards/grep.json` gains `"translate": "grep"`. `guards/find.json` gains
  `"translate": "find"`. Both keep `verdict: "deny"` as the fallback, so a
  broken translator cannot open a hole.
- Both `reason` strings change to wording that fits the new behavior, because
  the reason now appears only when translation fails.
- `README.md` line 30 is updated. It currently claims only that the guard
  rewrites `rg -r` to `rg`.
- `skills/customize-setup/SKILL.md` and `template.md` line 52 are updated.
  Check whether `generate-customize-setup.mjs` regenerates one from the other
  before editing by hand.
- The module doc comment in `plugins/bash-guard.ts` documents the `translate`
  field, the recursion, and the post-execute note.
- `plugins/bash-guard-translate.test.ts` covers a plain recursive grep, an
  `fgrep` case, an unmapped grep flag, an include glob, an exclude glob, a
  `find -name` case, a `find -delete` ask case, a `find -o` blocked case, and
  `shellQuote`. Every test must be shown to fail against the pre-change
  behavior.
- `node build.mjs` regenerates `plugins/bash-guard.js`, which is committed.
- `pnpm exec tsc --noEmit` reports only the known pre-existing errors.
- `pnpm exec prettier --check .` passes.
- `pnpm test` passes.

## Critical context

- Bundle outputs under `plugins/*.js`, `plugins/*/dist`, and `plugins/*/lib`
  are committed. `build.mjs` regenerates them. Rebuild after every TypeScript
  change.
- `see.ts` and `plugins/subscriptions/src/client.tsx` also import from
  `profile-routes`. A change there reaches both bundles.
- Do not add a runtime dependency without asking the user.
- `sync.sh` step `step_sync_guard_rules` copies `guards/.` into
  `$DSH_HOME/plugins/guards/`. It copies and never deletes, so a renamed or
  removed rule file leaves a stale copy behind.
- The guard re-reads its rule files on every call, so a rule edit needs only a
  sync. A plugin code change needs a restart of the running session.

## Human review queue

- Confirm in the running web GUI that the profiles panel shows the correct
  chain name for each entry field, that a reasoning effort survives a save,
  and that the model seat still applies a profile.
- Run a real `grep -rn foo src/` and a real `find . -name '*.ts'` in a live
  session. Confirm the translated command runs, the output is correct, and the
  note appears once above the output.
- Run `find . -delete` against scratch and confirm the approval prompt appears.
- Confirm the transcript shows the original command while the translated one
  runs. Decide whether that is acceptable or needs a follow-up ticket.

## User preferences and special rules

- Never commit without explicit approval.
