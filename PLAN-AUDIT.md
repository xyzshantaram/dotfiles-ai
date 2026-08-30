# Plan — dotfiles-ai audit and fix sweep

## Vision

One pass over the dotfiles-ai source to close real bugs, add leveled logging so
a person can see what each plugin does at runtime, add a test runner, and add a
settings panel that shows the dsh web server log. This file is temporary. It is
deleted when the sweep lands.

This sweep is interleaved with the matching sweep in `~/repos/aidos`
(`PLAN-AUDIT.md` there). This repo pins an aidos revision; the pin now points
at `6115526` (aidos's `A-BASH1` fix, `dotfiles-ai@6e0265d`).

## Checklist





- [x] All six tickets (D-LOG2, D-LOG3, D-HYG1, D-FEAT1, D-TEST1, D-SYNC2) implemented and closed.
## Critical context

- `ctx.logger.*` calls do not reach the journal or console on their own:
  cordis's `LoggerService` registers exactly one default exporter (its own
  constructor), which only pushes messages into an in-memory ring buffer
  nothing reads. Fixed by a first-party plugin, `plugins/log-exporter.ts`
  (bundled by `build.mjs`, first entry; installed as the first row of
  `sync.sh`'s `insert:` plugin list, before `mcp-nostrbook`, so every later
  plugin's `ctx.logger` calls are captured from their own `apply()` onward).
  Committed (`73aa7fc`). `~/repos/dsh-remote` hit the same gap and worked
  around it with raw `console.*` calls instead of fixing it (its own comment
  says as much, `lib/index.js:1483`).
- **Gotcha for anyone touching `log-exporter.ts`:** cordis's exporter dispatch
  filters by level before calling `export()` —
  `exporter.levels?.default ?? this.level ?? 1` is the threshold, and only
  messages whose numeric level (`error=0, info=1, warn=2, debug=3`) is `<=`
  that threshold reach the exporter. An exporter registered with no `levels`
  field defaults to threshold `1`, which silently drops every `warn` and
  `debug` call. `log-exporter.ts` sets `levels: { default: 3 }` explicitly —
  do not remove it.
- `approval-comment`'s client-side (`client.tsx`) has `console.*` logging
  (mount/unmount, answer click, `commandOf` parse failure, `apply` entry),
  committed (`3accb9c`). Browser-devtools-console only — the plugin's host
  side (`src/index.ts`) is an empty stub with no `ctx` access, so nothing here
  reaches the journal.
- All "do not touch" file exclusions from earlier in this sweep (`see.ts` in
  D-LOG2, `approval-comment` in D-LOG3) are dropped per user instruction: only
  this session works on `dotfiles-ai`, so the cross-agent coordination concern
  that motivated them no longer applies.
- Bundle outputs under `plugins/*.js`, `plugins/*/dist`, and `plugins/*/lib` are
  committed. `build.mjs` regenerates them. Rebuild after every TypeScript change.
  `sync.sh` no longer runs a build-drift check (removed: `step_build_plugins`
  already rebuilds bundles for real before anything is copied to `$DSH_HOME`,
  so a stale committed bundle never reaches the deployed output regardless).
- `see.ts`, `plugins/see.js`, and `plugins/approval-comment/*` already had
  their bug fixes committed earlier today (`2ddd22f`, `b86a3ff`) under a
  separate `PLAN.md` effort (T1-T6, unrelated to this sweep). That effort is
  finished, so its findings are historical context only, not a constraint on
  this sweep's scope.
- `sync-models.mjs`'s hand-rolled YAML parser has already been replaced with
  the `yaml` package, committed (`635fd78`) and independently re-verified via
  a `tester` subagent dispatch (all 6 evaluation criteria pass). Only D-SYNC2
  (the one-time reseed) is still open.
- `tsconfig.json` sets `strict: false`, so a passing `tsc --noEmit` is a weak
  check. Do not treat it as proof a change works.
- The inline Python YAML patcher at `sync.sh:475-565` preserves comments on
  purpose. Leave it alone.
- Logging level convention for both repos:
  `error` = the operation failed and the caller is affected.
  `warn` = a fallback fired or a refusal happened.
  `info` = a state change a person would want in a normal-volume log.
  `debug` = per-call trace and payload detail.

- Build note: `node build.mjs` rebuilds EVERY bundle and must run once, sequentially, after all source edits land. Parallel subagent dispatches that each ran it raced and corrupted intermediate state, so rebuild and typecheck only after edits settle.

## User preferences and special rules

- Never commit without explicit approval.
- Fine to add well-scoped, actively maintained libraries. Ask before adding one.

## Human review queue

- [ ] D-LOG3 — open each settings panel with the console at `debug`, confirm the
      log is readable and not flooded.
- [ ] D-HYG1 — exercise the settings panels in the browser, confirm the shared
      `request` helper changed no behavior.
- [ ] D-LOG2 — trigger an archived-session delete and confirm the new `deleted archived session <id>` journal line; force one profile failover and confirm the log names both models and the session.
- [ ] D-FEAT1 — open the log panel from a phone over the LAN, confirm the dsh-web
      log is readable there.
