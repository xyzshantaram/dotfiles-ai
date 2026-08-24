# PLAN — the dsh workstation

## Vision

Two efforts share this repo because they share a delivery path.

**The port.** Move the workstation config from opencode to DeepSeek Harness. It ships as the **personal bundle**: skills, subagent rows, MCP rows, guards, custom tools, and client plugins. The bundle lives here and syncs to `$DSH_HOME`. The aidos ticket board is separate (its own plan at `~/repos/aidos/PLAN.md`).

**The verification gap.** A review of four `soapbox-pub/ditto` MRs found the claims about the code were untrustworthy (invented root cause, a no-op MR marked TRUE, 50 existence checks / 0 effect checks). The tooling and models are not the problem — the questions we ask them are. This drives the verification skill, the review contract, and the grilling→plan→dispatch→verify workflow.

## Checklist

### Phase A: personal bundle — in progress

- [ ] **W18 subscriptions panel.** All routes + DeepSeek dashboard are coded, and the host half is REPAIRED this session: the file was two glued plugin bodies (first closed at line 495, an orphan second copy sat at module level and would have thrown `ctx is not defined`), the duplicated sqlite `execFile` line caused the boot crash, the token extractor unwraps the appKit envelope, and the usage handlers read a Bearer header first then the credential. Also fixed: `cachedOnce` dropped its args (DeepSeek usage routes always fetched `?month=undefined`). ORPHAN: the plugin is REMOVED from the live web profile (user uninstalled it during crash triage) — re-mount it, restart, verify.
  *Evaluate:* after re-mount + restart, GO windows, DeepSeek balance, the usage dashboard (monthly cost + token cards), and the Firefox cookie/token flows render real numbers.

- [ ] **W22 tool-render diffs + read gutters.** LOCAL HALF VERIFIED by the user 2026-08-22: side-by-side diffs with -/+ markers, orange/blue line tints, numbered columns, visible separators, before-text recovery across paged reads; write rows fixed (React #310 from a conditional `props.useSession` hook — the entry abdicated and the shipped renderer silently won); read gutters + highlight working. REMOTE HALF (dsh-remote fork gutter patch, `~/repos/dsh-remote`) still pending — outside this workspace.
  *Evaluate:* an edit/batch_edit row shows a readable side-by-side diff with markers, tints, and both columns numbered; a fresh read+edit recovers the before text. Local half done; remote half still needs the fork patch.

- [ ] **W23 archived-session management UI.** BLOCKED on a definition: the installed rc.8 source has NO archive concept anywhere. Decide what "archived" means (hide flag on the session header / separate store / filter tag / drop the ticket) before building the settings panel.
  *Evaluate:* the panel lists archived sessions, unarchives/deletes one, and the workspace list reflects the state.

- [ ] **W24 profiles panel + chains redesign.** Edit-in-place panel SHIPPED, cost chip dropped, seat crash fixed (`activeFace` guarded), and the MODEL SELECTOR POLISHED 2026-08-22: menu scrolls (`overflow-y`), models grouped by provider with pretty names (the catalog already carries `group.name`/`model.name` — the seat ignored them), the trigger shows the active profile (`work · Meridian/…`), profile rows use pretty names too. Pending: refresh verify, then the CHAINS REDESIGN the user asked for: define a chain once, assign it as work/personal orchestrator/subagent. Schema needs a grill.
  *Evaluate:* editing a chain changes `~/.dsh/settings.yaml` and hot-applies; no seat crash; after redesign, one chain definition feeds multiple roles.

- [ ] **W25 TS conversion — SHIPPED, residuals separate.** All 8 plain-JS plugin sources converted to TypeScript (subscriptions, tool-render, approval-comment, profiles-client host+client). build.mjs now esbuild-compiles every host half — no verbatim copies, so the "syntax error shipped to production" class is dead. tsconfig added (strict false, skipLibCheck), typecheck scoped to the four converted host files. `typescript` devDep added via the package tool.

- [ ] **W26 full-repo typecheck.** The scoped tsc hides real failures in pre-existing files: `profiles.ts` (10 errors, dsh-agent contract types), `skill-gate.ts` (3 errors + a latent TDZ — `DEFAULT_SUBAGENT_DENY` used before its `const` at Config build time, may crash at plugin load), `ask-interrupt.ts` (AgentCancelCause). Needs dsh-API type knowledge; fix so `pnpm exec tsc --noEmit` passes over all of `plugins/`.
  *Evaluate:* full-include `tsc --noEmit` passes.

- [ ] **W27 tool-render diff edge cases.** (a) A tool-call diff with ONLY deletions or ONLY additions must NOT render the side-by-side diff view (one column would be empty); all-removals and all-additions render properly — single-sided view or sequential rows. (b) Diff line numbers must line up with the actual edited lines: gutter numbers reflect the real old/new offsets from the hunk, not a 1-based per-row count.
  *Evaluate:* an edit with only deletions shows a clean single-sided diff; gutter numbers match the file's real line numbers.

- [ ] **W28 subscriptions — command-code support + provider toggles.** API MAPPED 2026-08-23 from the commandcode-desktop-widget repo + the opencodex quota commit: key-based `/alpha` surface (`whoami`, `billing/credits` with monthly/purchased/free pools + 5h/weekly window limits, `billing/subscriptions`, `usage/summary?since=`), Bearer CMD_API_KEY, USD credits (1 = $1); the widget's `/internal/*` cookie surface is secondary. IMPLEMENTATION DISPATCHED: host routes `/subscriptions/commandcode-credits` + `/subscriptions/commandcode-usage`, client section with balance + window meters + monthly cost, and a `providers` visibility map in the plugin config (opencode/deepseek/commandcode, absent = visible).
  *Evaluate:* the panel shows command-code balance/usage with a valid CMD_API_KEY; a config flag hides a provider's section without uninstalling it.
- [ ] **W29 profiles — proactive Command Code quota failover.** The profiles plugin now fetches `/subscriptions/commandcode-credits` (same-origin, cached 5 min, fire-and-forget) and skips all `command-code` chain rungs while either the 5-hour or weekly window is exhausted, before any failure occurs. Fail-open on fetch errors. Error cache, manual selection, and levels build untouched. Note: `plugins/see.ts` needed two pre-existing W24 fixes (stray brace, `readProfile` call site) to make `tsc --noEmit` pass.
  *Evaluate:* with Command Code windows exhausted, requests skip command-code rungs immediately; a fresh window re-enables them without a restart.


### Phase B: decommission opencode — pending

- [ ] **W12 decommission the opencode config.** After the personal bundle is verified from `$DSH_HOME` alone (fresh clone syncs the same bundle), delete the ported opencode content. README states the new purpose; `OPENCODE_SETUP.md` goes with it.
  *Evaluate:* the harness works with no opencode config left and a fresh clone syncs the bundle.

### Phase H: harness ergonomics

- [ ] **H1 /grant — ORPHAN (code done, not wired).** `plugins/grant.ts` (340 lines) is implemented: session-scoped write grants via a WeakMap, SandboxedFileSystem `writeText`/`editText` wrap that bypasses the fence only for granted sessions+roots, `/grant <path>` composer command wired through `ctx.commands.register`. 20/20 scratch suite passes. WIRE-UP: add the esbuild entry to build.mjs, mount the host-plane row (`- id: grant`, name `plugins/grant.js`), then live-test.
  *Evaluate:* `/grant /tmp` then a write under `/tmp` passes with no prompt; a write outside the grant still denies.

- [ ] **H5 monorepo restructure.** DEFERRED until after the aidos MVP. Split into `@shantaram.xyz/dsh-*` packages + a personal meta-bundle.

### Orphans and open decisions (note down for the next session)

- **Approval-rejection runtime patch — applied, EPHEMERAL, no repo copy.** The installed `dsh-user-approval` now cancels the agent loop and follows up a fresh user message on a HUMAN rejection/cancellation (skips policy `never` and already-aborted asks). This is the "cancel the loop and send a fresh message" behavior the user specified — not the builtin next-step steer. ORPHAN: it lives only in the global npm install (`.../node_modules/@deepseek-ai/dsh-user-approval/lib/index.js`); a reinstall wipes it. Decide: keep a patched copy + re-apply step in the repo.
- **subscriptions re-mount** — removed from the live profile during boot-crash triage; re-add before the next restart.
- **see-tool image input — researched, no fix applied.** No route except meridian declares `defaultInput: [text, image]`. The LIVE personal see route is `opencode-zen/x-preview-f-free` (the personal orchestrator head), NOT `opencode-go/qwen3.7-plus` (that is only the code fallback — the plan's assumption was wrong). Decision: add `defaultInput` to the opencode-zen row (live) and/or opencode-go (fallback) in `$DSH_HOME/settings.yaml` + sync.sh step 9.
- **mozLz4 decompress is dead.** `lz4` npm has no `decompress` export in any interop form, so the DeepSeek token extractor's compressed branch always falls back to raw. Works only when the sqlite value is uncompressed. Find a working mozLz4 decoder or document the limitation.
- **subscriptions client dead code** — duplicate `var openLogin` declaration and the first 16 CSS rules repeated in `client.ts`. Cleanup.
- **W22 remote half** — dsh-remote fork gutter patch lives in `~/repos/dsh-remote`, outside this workspace.
- **Orphan dir** — `~/.dsh/plugins/personal/` holds five stale builds (2026-08-20); nothing mounts it (neither sync.sh nor build.mjs names that path). Decision: delete.
- **W19** — `git rm --cached -r` on tracked artifact dirs (tool-render/dist, profiles-client/dist, profiles-client/lib). Raw git rm is guard-denied; the user runs it.
- **Grill decisions pending:** chains schema (W24), W23 archived meaning, W12 timing, DeepSeek third rung for the personal chain (baseURL/apiKeyEnv/model — open input), W8 comment delivery + permission-card seat, approval-patch durability.

## Critical context

- **Runtime layout:** `dsh-web` runs from the global install (`~/.local/share/fnm/.../@deepseek-ai/dsh`, CLI rc.7, subpackages rc.8). The web profile's plugin packages (`~/.dsh/profiles/web/node_modules/*`) are **symlinks to this repo**, so `node build.mjs` + a page refresh updates client bundles; host-plane changes need `systemctl --user restart dsh-web`.
- **Tool-render gotcha:** chat snapshot `nodes.values()` returns an **array** — never call `.next()` on it; iterate with `for...of` or the array/iterator branch in `readsOf`.
- **DeepSeek platform token:** the site stores `userToken` as an appKit envelope `{"value":"<token>","__version":"0"}`; the extractor unwraps it. Usage handlers take `Authorization: Bearer` first, then the `DEEPSEEK_PLATFORM_TOKEN` credential. DeepSeek granted balance = promotional credit; this user's balance is all top-ups.
- **Client plugin loading:** subscriptions/approval-comment/tool-render bundles ship as `window.__ModuleLoader__.load({id, factory})` facades; profiles-client is a plain IIFE that calls the loader itself. `profiles-client/client.ts` keeps `require("react")` inside the factory on purpose — it is the loader's require parameter.
- **Keyed-slot shadowing:** lowest priority wins (`tool-render` -100 beats shipped 0); a crashing entry abdicates (`reportEntryError`) and the shipped occupant takes over — a crash in one row silently falls back, which is why edit rows "showed no diff" for days.
- **Slot entries must not call hooks conditionally** (React error #310 → the row abdicates and the shipped renderer wins silently). tool-render's WriteRow called `props.useSession` inside `if (done && ...)` — running vs settled renders had different hook counts. Hooks go at the top of the component, unconditionally.
- **sync.sh step 9** writes `defaultInput` only for meridian; the `see` tool rides the active profile's orchestrator head, not a fixed route.
- **Typecheck scope:** `tsc --noEmit` passes only with include narrowed to the four converted host files; the legacy failures are tracked in W26.
- **Approval-rejection semantics:** rejection/cancellation of an approval ask now cancels the agent loop and delivers a fresh user message ("The user rejected your approval request. Stop and explain..."). Does NOT fire for policy-`never` auto-rejections or already-aborted asks. Applies to all approval consumers (sandbox escalation + tool ask gates); ask-user questions use a separate service and are unaffected.
- **bash-guard gates only the bash tool**; raw git is denied to the model (use `mcp__git__*`, ask the user for the rest). The `package` tool is the sanctioned manifest write path; every dependency is pinned exact.
- **tmp-dsh-shared** bind fix verified: `ctx.effect` returns a cleanup function, so the instance+prototype `confine` patches persist across bash calls (`/tmp/dsh` shared).
- **LAN:** the machine side is healthy (Caddy `*:1337`, firewall open, bare IP answers fast); the phone hang is the phone→host path (SSID/VLAN/AP isolation) — not fixable here.

## User preferences and special rules

- Never commit without asking first. This holds for every repo.
- Never install a dependency by hand-editing a manifest. Use the `package` tool.
- Raw git is denied to the model. Use the `mcp__git__*` tools and ask for anything outside their coverage.
- All non-code prose follows the `ste-writing` skill's STE-flavored rules, including subagent prompts and reports.
- This repo is ahead of `origin/main`; commit grouping is best-effort, code + its PLAN.md update in one commit.

## Human review queue

Only the user clears items. Still open:

- [ ] profiles model selector — refresh; the picker scrolls, groups models by provider with pretty names, and the trigger shows the active profile
- [ ] W18 subscriptions — re-mount + restart; GO windows, DeepSeek balance + dashboard, Firefox cookie/token fetch buttons work end to end
- [ ] W24 profiles — refresh; the composer seat no longer crashes (profile chip back), the settings panel edits apply to `~/.dsh/settings.yaml`
- [ ] Approval-rejection — restart; reject an escalation and confirm the agent stops and explains instead of continuing
- [ ] DeepSeek token extract — restart; "Fetch token from Firefox" saves a working token (envelope unwrap path)
- [ ] H1 /grant — after wire-up: `/grant /tmp`, write under `/tmp` passes unprompted, a write outside the grant still denies
- [ ] skill-gate subagent lockdown — restart; a coder/tester/researcher cannot call the cordis mutation tools, only inspect list/query
- [ ] W19 — user runs `git rm --cached -r` on the four tracked artifact dirs
- [ ] see-tool — after the image-input decision: `see` on an image in the personal profile returns a description
- [ ] W6 — seat shadowing + badge vs live selection; title rewriter race
- [ ] W7 — dismiss-interrupt `keepInbox` semantics; ask-user shadowing order
- [ ] W8 — comment delivery (steering vs rejection-reason field); the permission-card Comment seat
- [ ] E7 paste-to-path — paste an image in the composer; confirm the file lands under `<workspace>/.dsh/pastes/`
- [ ] Phase C — run the verification skill yourself against a real MR and judge whether it would catch an invented root cause
- [ ] Phase D — ask the soapbox skill what to work on and check the answer against what you actually think is urgent
- [ ] W12 — a fresh clone of this repo syncs the same personal bundle with zero opencode config left

## Pickup point

Next actions for a fresh session, in order:
1. **Wire H1**: add `plugins/grant.ts` to build.mjs entries, add the host-plane row to `cordis.patch.yml` (live + sync.sh), rebuild.
2. **Re-mount subscriptions** to the live web profile (it was uninstalled during crash triage), rebuild.
3. **One restart** (`systemctl --user restart dsh-web`) loads: the approval-rejection patch, fixed+TS'd subscriptions, profiles seat fix, tool-render diffs, grant command.
4. **Verify queue** above; grill the open decisions (chains schema, W23, W12, third rung, W8, approval-patch durability).
