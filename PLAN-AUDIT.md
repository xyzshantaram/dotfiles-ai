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

- [ ] **D-LOG2 — Host-layer logging: gaps and happy paths.**
  Add leveled `ctx.logger` calls across the first-party host plugins
  (`bash-guard.ts`, `grant.ts`, `manifest-guard.ts`, `ask-interrupt.ts`,
  `profiles.ts`, `profile-routes.ts`, `skill-gate.ts`, `package-tool.ts`,
  `resume.ts`, `tmp-dsh-shared.ts`, `session-archive`, `subscriptions`). Cover
  the happy paths, not only the failures, so a working plugin is visible.
  Named gaps to close: manifest denial reason
  (`manifest-guard.ts:99-102`), ask-interrupt cancel (`ask-interrupt.ts:100`),
  archived-session delete (`session-archive/src/index.ts:198`), credential
  writes (`subscriptions/src/index.ts:842,921`), successful grant
  (`grant.ts:350-355`), the exhausted-chain throw (`profiles.ts:453`), and the
  silent catches in `tmp-dsh-shared.ts:65,82`.
  Failover visibility, per the settled decision, is leveled logs only, no panel:
  `profiles.ts` logs which session fails over from which model to which model, and
  when a chain resets, at a level that can be filtered without flooding.
  Also add `echo` lines to the silent `sync.sh` steps: `step_set_defaults`
  (line 584 overwrite), `step_sync_agents_md` (lines 30-32), the preset `sed` at
  line 398, and the successful `profile.active` patch near line 601.
  Follow the level convention in Critical context.
  **Evaluate:** trigger an archived-session delete and observe the new log line.
  Force one profile failover and confirm the log names both models and the
  session. `tsc --noEmit` passes.

- [ ] **D-LOG3 — Client-layer logging.**
  Add the same leveled logging to the first-party client packages
  (`session-archive`, `subscriptions`, `shared/client-util.ts`, and the profiles
  panel client). Cover panel mount, data load, each user action that reaches the
  host, and each response. Keep routine chatter at `debug`.
  **Evaluate:** `node build.mjs` passes. Human review: open each panel with the
  browser console at `debug` and confirm the log reads clearly and does not
  flood.

- [ ] **D-HYG1 — Collapse `fetchJson`/`postJson`/`putJson` into one helper.**
  `plugins/shared/client-util.ts:64-160` holds three near-identical 20-line
  bodies that differ only by method and body. Replace with one
  `request(method, url, body)` and thin wrappers.
  **Evaluate:** `tsc --noEmit` and `node build.mjs` pass. Human review: exercise
  the settings panels in the browser and confirm no behavior change.

- [ ] **D-FEAT1 — Log-viewer plugin.**
  A new first-party plugin with a settings panel that shows the dsh web server
  log, so the log is readable from a remote browser instead of only from a
  terminal on the laptop. The host side runs a configurable command and returns
  its output. Default command: `journalctl --user -u dsh-web.service`. The
  command is a plugin setting so it can be repointed. One-shot fetch, manual
  refresh button only, no streaming and no polling. The panel is a scrolling
  view in a monospace/readable font, not a raw dump. Follow the existing
  plugin shape: a `.ts` host plugin plus a client package, installed from
  `sync.sh`, bundled by `build.mjs`, styled per `src/DESIGN.md`.
  **Evaluate:** the panel loads and shows recent `dsh-web` lines. The refresh
  button fetches newer lines. Changing the configured command changes what the
  panel shows. Human review: open the panel from a phone over the LAN and
  confirm it is readable there.

- [ ] **D-TEST1 — Add a test runner and first tests.**
  No test runner exists. Add vitest, matching aidos, with a `test` script.
  Write tests for what this sweep touched: the `sync.sh:600-604` fix (or the
  logic extracted from it), the `client-util.ts` `request` helper, and the
  log-viewer host handler.
  **Evaluate:** `pnpm test` passes locally and covers the three named areas.

- [ ] **D-SYNC2 — One-time purge and reseed of `command-code` and `opencode-zen`.**
  `sync-models.mjs`'s real-YAML-parsing rewrite (formerly D-SYNC1) has already
  landed (`635fd78`; independently re-verified this session via a `tester`
  subagent dispatch, all 6 evaluation criteria pass), so this ticket is
  unblocked. Clear the `models:` list under
  `command-code` and under `opencode-zen` in `home/settings.yaml`; `meridian`
  and `opencode` are untouched. Run `node sync-models.mjs --with-meta` to
  repopulate both providers under the new markers.
  **Evaluate:** reseeded models that support vision per LiteLLM's
  `supports_vision` field carry `defaultInput: [text, image]`. The script's
  chain-consistency check ends with zero warnings for every chain referencing
  a `command-code` or `opencode-zen` model (`work-orchestrator`,
  `personal-orchestrator`, `see`).

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

## User preferences and special rules

- Never commit without explicit approval.
- Fine to add well-scoped, actively maintained libraries. Ask before adding one.

## Human review queue

- [ ] D-LOG3 — open each settings panel with the console at `debug`, confirm the
      log is readable and not flooded.
- [ ] D-HYG1 — exercise the settings panels in the browser, confirm the shared
      `request` helper changed no behavior.
- [ ] D-FEAT1 — open the log panel from a phone over the LAN, confirm the dsh-web
      log is readable there.
