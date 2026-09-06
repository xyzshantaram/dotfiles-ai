# PLAN.md — ElectronHub provider plus chip failover indicator

## Vision

Add ElectronHub DevPass as a seeded provider, repair the orchestrator and subagent chains around the Spark responses wire split, and show failover state as a UI-only segment of the profiles chip.

## Checklist

- [ ] Ticket 1 — ElectronHub provider plus seed: new provider block, `sync-models.mjs` seeding with `:dev` filter, dry-run clean. Closes when `node sync-models.mjs --dry-run` seeds the 6 dev ids with zero chain warnings for the new refs.
- [ ] Ticket 2 — chain surgery: Spark levels repointed at a responses provider, DevPass glm placed, longcat plus dead spark levels dropped. Closes when the dry-run chain check reports zero warnings for every kept ref.
- [ ] Ticket 3 — failover status endpoint plus chip segment: rung count, waterfall icon, hide rules, tooltip, middle-click reset. Closes when `node build.mjs` passes and the segment renders in a live dsh session (human check below).
- [ ] Ticket 4 — review and commit: researcher review pass on the chip work, independent diff read, grouped commits with user approval. Closes when the tree is clean.

## Critical context

- `cordis.patch.yml` mounts `plugins/profiles.js` straight from the repo, so a service restart picks up builds with no reinstall step. Web client bundles resolve through symlinks in `~/.dsh/profiles/web/node_modules`, also live after restart.
- Spark 500 root cause 2026-09-06: Go serves Spark over `openai-responses`, not `openai-completions`; minimal `/responses` probe returned 200. Fix is a separate responses provider entry, not a key change.
- ElectronHub DevPass 2026-09-06: live `/v1/models` serves 594 ids, 6 with `:dev` (`deepseek-v4-flash:dev`, `deepseek-v4-flash-0731:dev`, `mimo-v2.5:dev`, `minimax-m2.7:dev`, `glm-5.3:dev`, `glm-5.3-flash:dev`), each advertising `/v1/chat/completions` plus `/v1/responses`. models.dev has no electronhub provider, so metadata lookups miss and entries seed name-only.
- `-free` verdict 2026-09-06: `longcat-2.0-free`, `muse-spark-1.3-contributor-free`, `muse-spark-1.3` all exist in live models.dev opencode catalog but NOT in the installed pi-ai catalog, so resolve fails. Installed catalog is stale; chain refs to them stay broken until pi-ai updates or the route is seeded explicitly.
- `sync-models.mjs` is manual: dry-run first, review diff, commit, then `sync.sh`. It never touches `scripts/rank-chains.mjs`.
- Uncommitted under this effort: steer fix in `plugins/profiles.ts` plus built `plugins/profiles.js` plus this file. Nothing commits without explicit approval.
- Slice 1 done 2026-09-06: `parseRetryAfterMs` in the vendored fork plus colocated tests, 6/6 green, verified in main session. Parser is unwired until the adapter patch lands.
- Slice 2 done 2026-09-06: `advanceChain` plus `recordFailure` extracted, 8/8 green, verified in main session. First extraction attempt used a stateful no-arg `isDown` that desynced check index from cursor in production; caught on independent diff read, fixed to level-indexed predicate. Uncommitted: `plugins/profiles.ts`, built `plugins/profiles.js`, `plugins/profiles-failover.test.ts`.
- Slice 3 done 2026-09-06: down-cache exports plus `clearDownCache`, 16/16 green, verified in main session. Diff is three `export` keywords plus the reset helper; no behavior change.
- Slice 4 done 2026-09-06: status endpoint exports plus mock-ctx tests, 21/21 green, full suite 349 passed, verified in main session. One deliberate change: newest-event scan uses `>=` so same-millisecond ties resolve to the later write. Incident: first implementation dispatch deleted the new test block from the file; caught on verification (16 tests instead of 21), block rewritten, green again.

## User preferences and special rules

- Testing stays in a fresh user-created session; no more log surgery on working sessions.
- Build subagents only; never touch `scripts/rank-chains.mjs`; no commits without explicit approval.
- Failover indicator lives in the profiles chip only, never in agent context.

## Human review queue

- [ ] Chip segment: force a failover, confirm rung count, tooltip, hide rules, and middle-click reset in live dsh.
- [ ] After restart, confirm the fresh test session serves Spark over the responses provider.
