# Plan

This file tracks the bundle's implementation. It is a living record, not a promise.

## Status

- Done: bundle scaffold, `sync.sh` installer, plugin build pipeline.
- Done: base guards for git, find, grep (read-only allow, mutation ask, rest deny).
- Done: settings design system (`DESIGN.md`) and restyle of the Settings panels.
- Done: `see.ts` vision gating (mutual exclusion, recursion-safe).
- Done: DeepSeek cost `biz_data` fix in the subscriptions host plugin.
- Done: bash-guard rewrites (guards/rg.json rewrite, git.json ask rules, AGENTS.md rg -r warning removed).
- Next: none; remaining items resolved or dropped (see T7).

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
### T6 — bash-guard rewrites (done)
- Add a `rewrites` field to `GuardEntry`; splice dropped flags from the command string.
- Add `push`, `commit`, `reset`, `merge`, `rebase`, `cherry-pick`, `clean` as `ask` in `guards/git.json`.
- Add `guards/rg.json` to rewrite `rg -r` to `rg`.
- Remove the `rg -r` warning from `AGENTS.md`.
- Check: `rg -r` runs as `rg`; `git push` asks; build exits 0.

### T7 — Retire git MCP (dropped — keeping mcp__git)

- Dropped: we keep the git MCP (mcp__git); recent commits were made through it, so retiring it is no longer desired.
- Update the `guards/git.json` reason text (no longer points at `mcp__git__*`).
- Check: git mutations still ask via bash-guard; no `mcp__git__*` tools load.

### T8 — aidos pin (done)

- `sync.sh` now pins `AIDOS_PLUGIN_SPEC` to a published hash (`4d2dcdb`).
- Check: `./sync.sh` installs aidos without a 404.

## T9 — Slop refactor: dedupe the five converted client bundles (done)

Audit: researcher pass over the five `src/client.tsx` + `.module.css` pairs plus
`design-system.ts`. Verified in main session before work started:
`tsc --noEmit` fails today (12 errors); the css-text plugin inlines any `*.css`
import; no stylesheet consumes any DESIGN_TOKENS property; no bundle markup uses
any CONTROLS_CSS class; subscriptions never imported design-system at all.

### T9a — shared infrastructure
### T9a — shared infrastructure (done)
- `plugins/shared/client-util.ts`: `injectStyle(pluginName, styleId, cssText)`
  (keeps the `data-plugin-css` dedupe guard and `typeof document` guard),
  flattening `mergeCss(...parts: (string|string[])[])` (fixes 4 TS2345s),
  `fetchJson/postJson/putJson`, `escapeHtml`, `registerLocale(ctx, ns, en, zh)`.
- `plugins/shared/settings-panel.tsx`: `SettingsSection({title, onRefresh,
  refreshLabel?, children})`, `dsp-` class prefix.
- `plugins/shared/settings.css`: shared panel vocabulary (root/head/title/
  refresh/err/section/row), kebab-case `dsp-` classes.
- `plugins/shared/design-tokens.css` + `plugins/shared/controls.css`: verbatim
  port of the interpolation-free literals. Reference assets only; NOT injected
  into bundles (proven dead weight).
- `plugins/shared/shims.d.ts`: add `declare module "*.css"` (fixes 5 TS2307s).
- `tsconfig.json`: `jsxFragment` → `jsxFragmentFactory` (fixes TS5023).
- `plugins/profile-routes.ts`: add `entryHead`, `routesEqual`,
  `chainNameForRoutes` beside the canonical model; clients import it instead of
  keeping drifting mirrors.
- Delete `plugins/design-system.ts` when zero imports remain.

### T9b–f — per-plugin rewiring (parallel, done)

Each plugin adopts the shared helpers and deletes its private copies.

- profiles-client: D2 createElement alias, D3 section-label class (restore the
  rule if pre-conversion CSS had one, else drop the dead name), D4 duplicate
  rule blocks (keep cascade-winning values), locale helper, route utils,
  style/http/panel adoption. Audit D1 (unbound useRef) not reproducible in HEAD;
  rebuild re-verifies.
- subscriptions: TS2554 ×2 (`labelOf?` optional), fold `buildCcMeters` into
  `buildRows`, centralize the clamp in `windowPercent`, guard consolidation.
- session-archive: style/http/panel adoption.
- approval-comment: style adoption, shared escapeHtml, locale helper.
- tool-render: style adoption, shared escapeHtml, D8 double-merge fix
  (final CSS = HLJS theme + local CSS, each once).

### T9g — verification
### T9g — verification (done)
- `node build.mjs`; `tsc --noEmit` fully clean (bash-guard.ts:394 fixed in this pass).
- Bundle greps: zero `jsx-runtime`, `react.createElement` present, controls and
  tokens absent, one `data-plugin-css` tag per bundle.
- Prettier check on touched files.

Known trade-offs (for the human UI review): section-card radius/padding differ
per plugin today (12/16, 20/20, 20/24 px) and the shared CSS normalizes them;
dropping the `:root{--bg…}` injection could affect host UI only if the host reads
bare non-dsw custom props — revert by re-adding the tokens import.
