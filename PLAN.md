# Plan — fix all review bugs/slop

## Vision
Land every bug fix the review identified, without regressions, as a set of small focused commits.

## Checklist
- [x] T1 bash-guard rewrite accumulation + wrapper handling (`plugins/bash-guard.ts`)
- [x] T2a package-tool add_task injection/arg-splitting (`plugins/package-tool.ts`)
- [x] T2b package-tool semver-range + ecosystem downgrade handling (`plugins/package-tool.ts`)
- [x] T3 grant "/" root safety (`plugins/grant.ts`)
- [x] T4 resume documented layers 3/4 (`plugins/resume.ts`)
- [x] T5 profile-routes composition bare-name fallback (`plugins/profile-routes.ts` + client copy)
- [x] T6 harden sync-models hand-rolled YAML indent parser (`sync-models.mjs`)
- [x] T7 dead-code / empty-type-import cleanup (manifest-guard, grant, skill-gate, etc.)
- [x] T8 deduplicate shared helpers (fetchJson/sendJson/readBody/shortId/fmt chain) via `plugins/shared/*`
- [x] T9 small nits (build wrapClientBundle temp race, sync.sh expected drift, ts strict hygiene)
- [x] T10 sync.sh aidos preset: copy installed composition instead of single-row heredoc (`sync.sh:step_register_aidos_preset`)
- [x] Verify: `node build.mjs` pass, `npx tsc --noEmit` 3 pre-existing errors only, `prettier --check` pass, `bash -n sync.sh` pass, `node --check sync-models.mjs` pass
## Critical context
- Bundle outputs (`plugins/*.js`, `plugins/*/dist`, `plugins/*/lib`) are committed; `build.mjs` regenerates them — rebuild after each TS fix.
- Do not add new runtime deps without confirming with the user; prefer stdlib or already-installed deps.

## User preferences and special rules
- (none yet)

## Human review queue
- (empty)
