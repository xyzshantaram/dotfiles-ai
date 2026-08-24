# Plan

This file tracks the bundle's implementation. It is a living record, not a promise.

## Status

- Done: bundle scaffold, `sync.sh` installer, plugin build pipeline.
- Done: base guards for git, find, grep (read-only allow, mutation ask, rest deny).
- Done: settings design system (`DESIGN.md`) and restyle of the Settings panels.
- Done: `see.ts` vision gating (mutual exclusion, recursion-safe).
- Done: DeepSeek cost `biz_data` fix in the subscriptions host plugin.
- In progress: bash-guard rewrites and git mutation ask rules; `rg` rewrite drop-in; `AGENTS.md` cleanup.
- Next: test bash-guard rewrites, then retire the git MCP in favor of bash-guard.

## Tickets

### T1 — Bundle scaffold

- `build.mjs` compiles `plugins/*.ts` to `plugins/*.js`.
- `sync.sh` copies skills, guards, and `home/` into `$DSH_HOME` and writes the web profile patch.
- Check: `./sync.sh` exits 0 on a clean home.

### T2 — bash-guard base

- git, find, grep gated by subcommand through `guards/*.json`.
- Read-only verbs allow; mutations ask; others deny.
- Check: `git status` runs, `git push` asks, `git foo` denies.

### T3 — Settings design system

- `DESIGN.md` defines a dark card, pill, and focus-ring language with `dsw` alias tokens.
- Subscriptions, profiles-client, session-archive, tool-render, approval-comment panels restyled.
- Check: panels build; visual check in Settings.

### T4 — see.ts vision gating

- Per-agent `restrict` hides `see` or `read_image` by the model's image capability.
- The `see` child runs on a vision model, so it cannot call `see` again.
- Check: non-vision model hides `see`; vision model hides `read_image`; no recursion.

### T5 — DeepSeek cost fix

- Subscriptions host reads `biz_data` as an array, not an object.
- Check: the cost dashboard renders without error.

### T6 — bash-guard rewrites (in progress)

- Add a `rewrites` field to `GuardEntry`; splice dropped flags from the command string.
- Add `push`, `commit`, `reset`, `merge`, `rebase`, `cherry-pick`, `clean` as `ask` in `guards/git.json`.
- Add `guards/rg.json` to rewrite `rg -r` to `rg`.
- Remove the `rg -r` warning from `AGENTS.md`.
- Check: `rg -r` runs as `rg`; `git push` asks; build exits 0.

### T7 — Retire git MCP (next)

- After T6 tests pass, remove the git MCP server from the preset and `sync.sh`.
- Update the `guards/git.json` reason text (no longer points at `mcp__git__*`).
- Check: git mutations still ask via bash-guard; no `mcp__git__*` tools load.

### T8 — aidos pin (blocked)

- `sync.sh` pins `AIDOS_PLUGIN_SPEC` to `b6fb6d7...`, but that commit is not on the remote.
- Blocked: push the commit, or pin to a published hash.
- Check: `./sync.sh` installs aidos without a 404.
