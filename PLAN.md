# PLAN — the dsh workstation

## Vision

Two efforts share this repo, because they share a delivery path.

**The port.** Move the workstation config from opencode to DeepSeek Harness. It
ships as the **personal bundle**: skills, subagent rows, MCP rows, guards,
custom tools, and client plugins. The bundle lives here and syncs to
`$DSH_HOME`. The aidos ticket board is a separate, unopinionated bundle with its
own plan at `~/repos/aidos/PLAN.md`. That plan owns the board. This one owns
everything personal.

**The verification gap.** A review of four `soapbox-pub/ditto` merge requests
(!245, !246, !248, !249) against the session records found one failure mode. The
code is good. The claims about the code are not. Confirmed against `origin/main`:
issue #317 named a root cause that does not exist in `src/`; MR !248 was a no-op
and was later closed; the pre-merge verification pass asked 50 existence checks
and 0 effect checks and returned TRUE on 9 of 10 claims; one root session ran 6
days, 5502 messages, 206 subagents, 39 compactions, and $538.50, and wrote the
merge request prose at the end of that; a ticket said "do NOT wire this in" and
479 lines of dead code plus a mandatory build step reached review anyway. Four
of the seven `CONTRIBUTING.md:166` close-without-review triggers were tripped.

The tooling and the models are not the problem. The questions we ask them are. A
$0.0358 DeepSeek pass asked "verify and review these fixes" produced good
skeptical work on the same repo. The same pipeline asked "does X exist" produced
false assurance.

## Checklist

### Phase A: personal bundle, open ports — `in_progress`

- [ ] **W18 subscriptions panel.** IMPLEMENTED + VERIFIED 2026-08-22 (`plugins/subscriptions/`): combined settings panel — go windows, claude/meridian windows + 24h telemetry, go balance via cookie route, weekly pace (+/- pts + run-out date). Folds in and REPLACES ds-api-usage + dsh-opencode-go-usage. PENDING: restart + OPENCODE_SESSION_COOKIE + hands-on (queue).
- [ ] **W21 profiles v2: named chains + quota-aware rung pick + error cache.** IMPLEMENTED + VERIFIED 2026-08-22 (51-harness pass; supersedes W17). PENDING: restart + live check (queue).
- [ ] **W22 line numbers in file views.** Add a line-number gutter to (a)
     the dsh-remote file panel viewer (our fork xyzshantaram/dsh-remote,
     which already carries the highlight.js-in-panel change) and (b) every
     tool call that renders file content — tool-render read rows (the
     HASH│ prefix is stripped for display today) and the write/edit diff
     rows where a gutter adds context. Remote side needs a fork patch +
     pin bump in sync.sh; tool side is a client.cjs change.
     *Evaluate:* a read of a .ts file shows aligned line numbers; the
     remote file panel shows the same; diff +/- colors stay intact.
- [ ] **W23 archived-session management UI.** A settings panel to manage
     archived sessions. GRILLED-IN-SHORT (2026-08-22, user call): build it
     as a settings.section panel like W18's subscriptions, not a sidebar
     widget. RESEARCH GAP: the installed rc.8 dsh source has NO archive
     concept anywhere (zero hits for archive/archived in the client and
     host packages; the workspace session list has no archive notion), so
     "archived" must be defined before UI work starts — options: hide
     sessions from the workspace list behind a flag, a state field on the
     session header, or a separate store. Decide the meaning of archived
     and the storage home first, then build the panel.
     *Evaluate:* the settings panel lists archived sessions, unarchives or
     deletes one, and the workspace session list reflects the state.


### Phase B: decommission opencode — `pending`

- [ ] **W12 decommission the opencode config.** After the personal bundle is
      verified from `$DSH_HOME` alone, delete the opencode content that moved:
      the ported skills, the agent definitions (coder, tester, researcher, see),
      the opencode plugins, the MCP rows, and the provider config. The repo keeps
      the user's own tracked content and the sync source for the bundle. The
      README states the new purpose. `OPENCODE_SETUP.md` goes with it.
      *Evaluate:* the harness works with no opencode config left, and a fresh
      clone of this repo syncs the same personal bundle.

### Phase C: the verification skill and the rules — `done`


### Phase E: rebuild the measurement side — MOVED

Moved 2026-08-22 (user call) to `~/ai-scratch/session-analysis/PLAN.md` as its
own phase (T5.1 outcome puller, T5.2 merge-based completion, T5.3 struck-claim
metric). Still blocked there on the go-ahead.

## Critical context

### Session state 2026-08-21 late — READ ME FIRST

- **The tool-pipeline outage is SOLVED.** Every tool call failed with `cannot read properties of undefined (reading 'prepare')` after the evening restart; bisection proved the `dsh-worktree` mount row was the poison (its rc.6-built tool registration breaks the rc.8 scheduler — see Seams and gotchas). The row is gated out of sync.sh. An earlier same-evening "unbash parser" error was the same fault, not unbash. The ORIGINAL subagent-dispatch fault from before that restart had a different, still-unconfirmed cause; if reruns die the same way again, suspect free-tier concurrency on opencode zen first.
- **Everything is committed and the tree is clean.** Commit chain for this effort: a61e899 → 7ee7102 → 92e54f1 → 92016f8 → 2ecdf6a (profiles v1) → 8094c55 (worktree/llm-fallback gates) → f13d122 (combined profiles + guard tiers + pins). Push when you like.
- **Restart DONE; live verification is the next action.** W16's evaluation steps are in its ticket: role tools in catalog, background `coder` dispatch settles on deepseek-v4-flash-free, forced failure falls over to opencode-go flash (watch for the `profiles: ... failing over` warn), `profile.active` flip moves new sessions' default model.
- **Restart cycle staged 2026-08-22 (3rd).** Everything implemented is installed-pending-restart: tool-render (H2/H3), profiles-client (W6), approval-comment (W8), skill-gate (E5/E6 + subagent lockdown), paste-to-path, tmp-dsh-shared (shared /tmp/dsh bind), subscriptions panel (W18: go + claude + deepseek + cookie balance + pace), profiles v2 (W21). ds-api-usage + dsh-opencode-go-usage are REMOVED from the sync.sh install set — step_report_extra_plugins prints their removal commands on the next sync run (or run `dsh plugin --profile web remove dsh-opencode-go-usage dsh-plugin-ds-api-usage`). The Human review queue holds every hands-on item.
- **Open user input:** official DeepSeek provider block (baseURL, apiKeyEnv, exact model id) for the personal chain's third rung — settings.yaml has no such provider yet.
- **dsh-input-history now pinned** to `github:sunshaobei/dsh-input-history#9b5b7a494a5c` (no npm publish, no git tag); the DSH_INPUT_HISTORY_PATH override gate is gone. First mount attempt happens on the current boot — if it fails to load like llm-fallback did, drop it and bisect.

### Verification skill

- **T1.1's blind-test question is settled.** The `verification` skill's three questions were run against MR !248 (known answer) and, blind, against MR !257 ("Upgrade Blobbi Kit to 0.5.0", picked from the open MR list with no prior read of its outcome). The !248 run correctly found the current diff is NOT a no-op (the plan's own phrasing described an earlier, superseded revision of that same MR, not its current head) and confirmed the #317 root cause was invented. The !257 blind run found the version bump and override removal are real, but struck the MR's central justifying claim — that `@blobbi-kit/core@0.5.0` itself drops the `@nostrify/nostrify` peer dependency — as unproven, since neither a web search nor the API-returned lockfile diff (returned collapsed/empty) could confirm it. The skill worked blind: it did not just confirm what was already expected, and it produced a real, unresolved hedge instead of a false pass.


### Deployment

- The bundle lives here and syncs to `$DSH_HOME`. `sync.sh` is the
  idempotent installer for a fresh machine. `node build.mjs` rebuilds the plugin
  bundles, and the live patch rows point at the repo copies, so a rebuild updates
  a live plugin with no sync run.
- **Host-plane patch rows are static per boot.** Adding or removing one needs a
  `dsh web` restart. Client-plugin code reloads without a page refresh only while
  `pnpm run dev:web` runs from the dsh checkout.
- `build.mjs` bundles every non-`@deepseek-ai` dependency in, so a plugin may
  take an npm dependency freely.

### Model profiles

| Profile | Orchestrator | coder, tester, researcher | see |
|---|---|---|---|
| Work | Meridian Claude proxy (localhost:9000) | OpenCode Go `deepseek-v4-flash` | Claude Haiku 4.5 via meridian |
| Personal | OpenCode Go `deepseek-v4-pro` | OpenCode Go `deepseek-v4-flash` | Qwen3.7 Plus (OpenCode Go) |

- Both profiles use the same flash tier for the three work subagents, so their
  `agentOptions: { provider, model }` rows never change between profiles. Only
  the orchestrator and `see` move.
- Profiles live in a `profile` settings namespace, schema-validated and
  revision-gated. The plugin reads the resolved value per selection and per call.
- **The meridian route** is settled and live. Declared `api: anthropic-messages`,
  `baseURL: http://localhost:9000` (no `/v1` suffix; the SDK appends it), six
  hand-declared Claude models, `defaultInput: [text, image]`. Prompt caching
  works and token counts display correctly (Phase G). A dummy `apiKeyEnv`
  value satisfies the credential check. Live rows are the source of truth:
  `$DSH_HOME/settings.yaml` under `llm-pi-ai.providers.meridian`. The old
  w0-providers research doc was deleted by user call 2026-08-22.
- **The Go subscription route** is pinned: base URL `https://opencode.ai/zen/go/v1`
  (the adapter appends `/chat/completions`), key `OPENCODE_GO_API_KEY` in
  `$DSH_HOME/.credentials.yaml` or the env var, which wins.
- **A route must declare image input or `see` fails.** The pi-ai adapter only
  accepts images when the model or route declares it. The meridian route carries
  `defaultInput: [text, image]`, written by `sync.sh` step 9. Whether the
  opencode-go route declares it for `qwen3.7-plus` is unconfirmed, so the
  personal-profile `see` path is unverified.

### Seams and gotchas

- **Every dependency is pinned exact (2026-08-21 late).** Repo deps: the six ranged specs (`^`) are now exact; `@deepseek-ai/*` were already exact rc.8 pins. sync.sh E4 install specs are pinned too (npm exact versions or 12-char commit SHAs; dsh-at-file was already tag-pinned), so a re-run can never silently move a plugin forward. Upgrade = deliberately bump a pin, then re-run. Gotcha discovered while pinning: this repo's node_modules had been linked against a throwaway store at `/tmp/dotfiles-pnpm-store/v11` (likely an investigative subagent's override), which made every `pnpm add` fail with `ERR_PNPM_UNEXPECTED_STORE`; `rm -rf node_modules && pnpm install` relinked to the real store. Also: `pnpm add -E pkg@version` short-circuits when the version is already installed and never rewrites an existing caret spec — use `pnpm pkg set` (plain names only; `@` breaks its path parser) or the node-fs route.

- **bash-guard now refines verdicts per git subcommand (2026-08-21 late).** Rule files gained an optional `subcommands` map (`verb -> allow|ask|deny`); the matched verb is the first non-option argument of the parsed command, and unnamed verbs inherit the base verdict, so allow-lists stay closed. guards/git.json allows the read-only verbs outright, puts useful mutations (worktree, stash, branch, tag, fetch, pull, checkout, switch, restore) behind approval prompts, and keeps everything else (commit, push, reset, rebase, clean) denied — mcp__git__* stays the sanctioned commit path. Conservative edge: `git -C <path> status` reads the path as the verb and falls back to deny. Plugin-code changes need a restart to take effect; rule JSON re-reads live on every call.

- **A stale-peer tool registrar can poison the WHOLE tool scheduler (2026-08-21 late incident).** Mounting `dsh-worktree` (peerDependencies pin `@deepseek-ai/* 0.1.0-rc.6`) on the rc.8 web profile made EVERY tool call fail with `cannot read properties of undefined (reading 'prepare')` — the rc.8 scheduler (`dsh-tools/lib/types/index.d.ts:338`, the prepare/dispatch/finalize stages) never builds a schedule, so chat streams but no tool executes, with nothing in journalctl and nothing in the browser console. Diagnosed by bisection (ask-interrupt and profiles rows were innocent and restored). The worktree mount row and install line are gated out of sync.sh with re-add notes; revisit only when it ships rc.8 peers. The same failure had been misread earlier the same evening as an "unbash parser" breakage — same root cause, not unbash. Audit of all 11 profile packages carrying non-rc.8 peers found only two misbehavers (worktree above; llm-fallback below); the rest, including session-search with rc.6 tools peers, are proven healthy by the post-fix boot.
- **`@visol-456/dsh-llm-fallback` v0.1.2 cannot load on rc.8 (client half) — SUPERSEDED, keep it gated.** Its built client bundle requires `@deepseek-ai/dsh-client-web-react`, which rc.8 does not serve ("client-modules: require(...) missed the module table"), so the loader refuses the whole entry at boot. Its function is replaced by the first-party failover waterfalls inside `plugins/profiles.ts` (chains read live from the `profile` namespace; no client bundle). The `llm-fallback` settings seed in settings.yaml is inert. Revisit only if visol ships an rc.8 build AND offers something the first-party waterfalls lack (its web UI page and cooldown circuit are the candidates).
- **GitLab MCP tools can drop out mid-session.** During T4.1 research, `glab_issue_view`, `glab_mr_view`, `glab_issue_list`, and `glab_api` stopped responding partway through a research pass in a delegated subagent session, while `glab_repo_view` kept working. This looked like a permission denial at first but was a tool-availability fault instead, so retrying did not help. If this recurs, fall back to whatever `glab_*` tool still answers and flag any unconfirmed fact in the output rather than blocking on full research.

- **Keyed-slot shadowing VERIFIED 2026-08-22 (W13 spike, answer: YES).** Keyed
  slots sort ascending by priority; the LOWEST live entry renders; the same key
  at a DIFFERENT priority never throws; the runtime injects no origin privilege
  for shipped entries (dsh-client-ui-slots lib/index.js :68, :76-80, :122,
  :168-191; pass-through verified at dsh-client-runtime lib/client.js :243-258).
  Live proof: dsh-better-markdown owns `conversation.chat.node` /
  `assistant-step` at priority -100 against the shipped 0. MOUNTING CAVEAT: a
  client half ships through exports["./client"] discovered from the
  package.json `dshClient` declaration — a bare file-path patch row mounts only
  an empty host half; use package installs (pattern:
  plugins/approval-comment).

  conversation contract touches markdown or links, and no `urlTransform` hook
  exists. The only reachable route is owning the whole assistant row. `aidos://`
  deeplinking was dropped for this reason on 2026-08-21.
- **A guard refuses by THROWING, and `{ prepend: true }` is load-bearing.**
  `manifest-guard.ts` throws `FsError(msg, 'FS_PERMISSION_DENIED')` on the
  `fs/write-intent` and `fs/edit-intent` waterfalls. The observation policy
  occupies the single decision slot and returns an intent without calling
  `next()`, which vetoes the rest of the chain, so a guard registered without
  `prepend` is dead code. Order between two prepended guards does not matter,
  because both refuse by throwing and only the refusal text changes.
- **The shell seam confines nothing.** `ctx.shell.resolve` and
  `dsh-subprocess-local` pass `workdir` straight through to the spawn with no
  check. Only `dsh-tool-bash` rewrites a relative workdir to be session-relative.
  Any confinement must be ours. This is why W15 must confine `cwd` inside the
  tool.
- **The `latest` dist-tag is stale on this registry.** `@deepseek-ai/dsh-fs` and
  `@deepseek-ai/dsh-api-gateway` both point `latest` at `0.0.1-rc.1` while `next`
  is `0.1.0-rc.8`. `resolveLatest` runs `npm view <pkg> version`, which reads
  `latest`, so an unpinned add of `dsh-fs` installs rc.1 and reports success.
  W15's downgrade check does NOT catch this, because the package is not installed
  yet.
- **The `git` PATH stub is not deliverable through dsh seams.** `shellEnv`
  carries only `DSH_*` keys. `bash-guard.js` denies raw git structurally instead,
  via an unbash AST walker that matches commands in COMMAND POSITION, so
  `bash -c "git status"` and `$(git ...)` catch while `echo git` and a path
  containing `git-` do not. Rules are drop-ins at `$DSH_HOME/plugins/guards/*.json`,
  re-read per call, fail-closed on a parse error. The deny reason carries the
  `mcp__git__*` redirect.
- **The MCP git server cannot push, fetch, manage remotes, stash, rebase, merge,
  touch submodules, or handle credentials.** Those always route to the user.
- **hashline drops a `.dsh_better_edit/` directory** into whatever repo a session
  edits. `sync.sh` step 9b ignores it machine-wide through git's global excludes
  file. The step is machine-local by design, so a fresh clone gets it only after
  sync runs. hashline self-shadows the builtin `read`/`edit` on each agent's own
  scope layer at `agent/session-start`, so no preset `restrict` row is needed.
- **`requirements.txt` is exempt from the manifest guard** by user decision: it
  is a hand-editable bare dependency list. Every other manifest and lockfile is
  denied to `write`/`edit`. The read-deny was never implemented, because read is
  read-only.
- **Quote any YAML description that holds a colon.** An unquoted `agent: plan` in
  a `preset.yml` description made the whole file fail to parse, and dsh still
  discovered the preset by directory name, so tools and tier masks worked with
  zero display metadata. The symptom looked like a missing bundle.
- **Direct edits to `package.json` are denied by the harness; reads are allowed.** The `edit`/`write`/`batch_edit` tools refuse package.json (E_ACCESS / manifest denial). The `package` tool now (2026-08-21) has an `add_task` action that registers a `scripts` entry from validated argv via a node one-liner — this is the sanctioned way to change a script. Direct `write`/`edit` of package.json is still banned; only the tool (its `ctx.shell` calls are exempt from the manifest guard) may do it. pnpm's `pkg set` dotted-path parser rejects `:` and `-` in keys, so the tool must use the node route, not `pnpm pkg set`.
- **bash-guard gates only the `bash` tool.** Verified in `bash-guard.ts` (it returns `next()` unless `exec.name === 'bash'`). So the "raw git denied, use mcp__git__*" rule binds only model bash calls. Plugin git via `ctx.subprocess` (dsh-worktree, dsh-git-plugin) and the git MCP both bypass it. The E6 `guards/git.json` reason notes these bypass paths and points at the mcp__git__* tools (the `git` skill was dropped 2026-08-22 — it only ever existed for the removed dsh-worktree workflow).
- **skill-gate subagent lockdown (2026-08-22 2nd).** Agents with delegation depth > 0 are hard-denied the cordis mutation tools (cordis_define / cordis_run / cordis_stop / cordis_undefine / cordis_inspect_self) regardless of loaded skills, via Config `subagentDeny` (default = that list). Children keep cordis_inspect_list / cordis_inspect_query. Depth mirrors dsh-subagent's `delegationDepthOf` (header delegationDepth vs runtime subagentDepth). Enforced, not prompted — the deny mask removes the tools from the catalog. Restart needed to load; hands-on item in the review queue.

### Retired and reverted

- **The session-hygiene plugin is REMOVED (2026-08-21).** It measured wall-clock
  age since `session.header.createdAt` and nothing else, so any resumed session
  tripped it regardless of real staleness. The row is gone from `sync.sh` and
  from the live web patch. The source stays in the repo and `build.mjs` still
  builds it, so restoring it is one patch row.
- **The `/btw` command idea is dropped.** The dsh composer already steers a
  running agent: a message sent while a turn is in flight submits in `steer` mode
  at the nearest step boundary.
- **Live and confirmed 2026-08-21:** the meridian route answers and lists in the
  picker; a second LAN device reaches `https://potato.local:1337` and works
  normally; the `see` tool returns a factual image description on the work
  profile.

### Pickup point 2026-08-22

- **R2 CLOSED, verified end to end.** Remote settings work over the proxy:
  Models UI loads, config writes stick (user-verified), trace shows the handle
  born isLoopback:true. Full story in the Phase F R2 entry; root-cause evidence
  block above stays for reference. Fork head after today's gate-hardening
  commit is the pin target — sync.sh currently pins `ab821d79e33e`, STALE by
  one commit until pushed and re-bumped.
- **Gate hardening came out of R2's live testing:** manifest.webmanifest +
  favicon.svg are public paths (Chromium fetches manifests with NO credentials);
  every other extension path gets 401 instead of login HTML (kills the whole
  class of "static asset parses auth page" console errors).
- **sync.sh rewritten 2026-08-22:** steps are functions driven by a STEPS array;
  banners auto-number (`[n/total]`); no manual renumbering ever again. The
  remote `files.roots` now includes /tmp/dsh (agent scratch space, also
  documented in AGENTS.md — deployed live). User cleanup folded in: dsh-remote
  pin bump, llm-fallback install + seed removed, personal waterfall gained
  x-preview-f-free as head.
- **Meridian route switched to anthropic-messages by the user** — prompt
  caching way better, token counts correct. Residual doc alignment is G3.
- **W14 caffeine leak fix landed + live-verified** (on/idempotent/orphan-detect/
  off-without-pidfile cycle passed). W13 spike answered YES (see Seams). W8
  built, unmounted. E4/E5/E6 audits recorded gaps in their tickets.
- **NEXT ACTIONS:** one restart+sync cycle stages everything wired today:
      four omdsh toolkit tools (E4), dsh-paste-input + manual mount row (E7),
      ds-api-usage + opencode-go-usage (H4), worker-tier pins in the profiles
      row (zen flash-free → go flash → official deepseek). After that cycle:
      mount plugins/tool-render + approval-comment, then the hands-on queue.
      W6 profiles-client coder still in flight; its entry lands in build.mjs
      when it reports.


## User preferences and special rules

- Never commit without asking first. This holds for every repo.
- Never install a dependency by hand-editing a manifest. Use the `package` tool.
- Raw git is denied to the model. Use the `mcp__git__*` tools, and ask the user
  for anything outside their coverage.
- All non-code prose follows the `ste-writing` skill's STE-flavored rules,
  including subagent prompts and reports.
- This repo is 10 commits ahead of `origin/main` and was so before this effort
  started.

## Human review queue

- [x] Remote auth — DONE 2026-08-22: admin login over the proxy works, settings
      cards read AND write remotely, theme plugin confirmed gone.
- [ ] H2 — an edit or batch_edit call renders as a readable diff in the chat; a write call shows diff + syntax highlight.
- [ ] H3 — a read of a .ts file renders syntax-highlighted; bash output stays plain but styled.
- [ ] H4 — after restart, the ds-api-usage settings panel (balance + 24h/14d) and the opencode-go sidebar widget show plausible numbers.
- [ ] E6 — after restart, the cordis_* tools are hidden until a cordis skill loads; the deny reason no longer names a git skill.
- [ ] E7/paste-to-path — paste an image in the composer; confirm the file lands under <workspace>/.dsh/pastes/ and the model receives a path it can feed to see.
- [ ] skill-gate subagent lockdown — after restart, a coder/tester/researcher subagent cannot call cordis_define/run/stop/undefine or cordis_inspect_self (hard-denied, no prompt), while cordis_inspect_list/query stay available.
- [ ] W19 follow-up — run git rm --cached -r on the four tracked artifact dirs (tool-render/dist, profiles-client/dist, profiles-client/lib) to untrack built files; raw git rm is guard-denied to the model.
- [ ] W18 subscriptions panel — after restart + OPENCODE_SESSION_COOKIE credential: settings page shows all four sections, balance renders from the cookie, pace lines show +/- points and run-out dates.
- [ ] tmp-dsh-shared — after restart: drop a file into /tmp/dsh on the host, ask the agent to cat it; agent writes land in the same dir; survives across bash calls.
- [ ] Removed usage plugins — after next sync: step_report_extra_plugins prints removal commands for dsh-opencode-go-usage and dsh-plugin-ds-api-usage (or run them by hand); settings page no longer shows their panels.
- [ ] profiles settings panel — QUESTION (unanswered): the profiles-client plugin has NO settings panel (seat + badge + cost chip + title rewriter only). Decide whether to add one.
- [ ] Phase C (verification skill) — run it yourself against a real MR
      description and judge whether it would have caught the invented root cause
      without hints.
- [ ] Phase D (soapbox skill) — ask the agent what to work on and check the
      answer against what you actually think is most urgent.
- [ ] W6 — the Profile seat shadowing and the badge comparison against the live
      session selection.
- [ ] W6 — the title rewriter race against the renderer's `DocumentTitle` effect.
      A `MutationObserver` on `document.title` wins in practice.
- [ ] W6 — the cost display seat next to the shipped stats strip.
- [ ] W7 — dismiss-interrupt semantics: `keepInbox: true` (preserve queued work
      for the next prompt) versus a hard stop.
- [ ] W7 — the ask-user wrapper's shadowing order against the shipped tool row.
- [ ] W8 — comment delivery: a steering message versus an upstream
      rejection-reason field on the approval outcome.
- [ ] W8 — the permission-card seat for the Comment field.
- [ ] W9 — the hashline tools appear in a personal session (read/edit are the
      hash-anchored variants, builtin pair shadowed out), and the guidance
      override files render (tool:read/edit at orders 130-131).
- [ ] W10 — the bash-guard structural matching: `bash -c "git status"` denied,
      `echo git status` allowed, `ls` a dir listing paths containing `git`
      allowed, parse-error commands denied (fail-closed).
- [ ] W10 — the git-MCP coverage list (push, remotes, stash, rebase, submodules
      always go to the user) — confirm the notice reads correctly.
- [ ] W11 — the package tool resolves the latest version and runs the change;
      manifest-guard denies a direct package.json write but allows
      requirements.txt.
- [ ] W12 — the harness runs with zero opencode config left in this repo, and a
      fresh clone syncs the same bundle.
- [ ] Personal-bundle orphan — `~/.dsh/plugins/personal/` holds five stale plugin
      builds stamped 2026-08-20 08:42. Nothing mounts it: neither `sync.sh` nor
      `build.mjs` names that path, and the live patch points at the repo copies.
      One file, `git-guard.js`, no longer exists in the repo at all, because
      `bash-guard.js` replaced it. Decide whether to delete the directory.
- [ ] Fresh session — default model: `settings.yaml` now says
      `opencode-go/deepseek-v4-flash` (was `deepseek-v4-pro`). Confirm the picker
      lists opencode-go and meridian (including claude-fable-5) and that a fresh
      session opens on the flash default.
- [ ] Fresh session — after a `dsh web` restart, confirm no session-hygiene text
      reaches the model.
- [ ] bash-guard — add a drop-in rule for a new command (for example `curl`) and
      confirm it takes effect without a restart, because rules are re-read per
      call.
- [ ] see tool — personal profile route: it resolves to
      `opencode-go/qwen3.7-plus`, which the gateway does serve (verified via
      `/v1/models`, 28 models) and the route is wired. Open: whether that route
      declares image input for the model. If not, add `defaultInput` as meridian
      has, then verify.
- [ ] E5 skill-gate plugin runtime — mount `skill-gate` in a live `dsh web`
      session and confirm: loading a `tools-gated` skill makes its named tools
      callable that session, a fresh session without the skill cannot call them,
      and a compaction re-hides them. Also confirm the host-context
      `tools/post-execute` listener actually observes `skill` calls and that
      `exec.agent.ctx.tools.restrict({ deny })` applies per-agent (both written
      from source, neither runtime-tested).
- [ ] E7 attachment-vision settlement — after installing `dsh-at-file`, `@` an
      image file in the composer and confirm the visionless model receives a
      usable path (not base64 or a denied image block), then that `see` with
      that path returns a description. This is the hands-on proof that
      attachment-vision can be dropped.
---

## Phase E: customize-setup + plugin curation + bundle restructure — `in_progress`

### Vision

Drop the opencode era and flatten the bundle to the repo root — done (E1/E2/E3). The opencode-era content is deleted and the `dsh/` tree now lives at the repo root. Remaining: the customize-setup skill exists (template-generated from the installed dsh version via a pnpm task), curate third-party dsh plugins, and build a shared **skill-gating plugin** so tools mount only while a skill that declares them is active.

PLAN.md is a living migration document. Delete it once the remaining phase work is imported into aidos.

### Settled decisions

- Skill frontmatter declares the tool gate. One shared gating plugin watches the
  `skill` tool result, unmasks named tools per-agent via `ctx.tools.restrict`,
  and clears the gate on compaction. Gated skills: `util`, `git`,
  `session-search`, cordis, ecommerce.
- **ecommerce gates the Swiggy MCP tools.** New `ecommerce` skill with `tools-gated: [mcp__swiggy-food__get_addresses, mcp__swiggy-food__get_food_orders, mcp__swiggy-food__get_food_order_details, mcp__swiggy-instamart__get_orders]`. **Prerequisite fix coded 2026-08-21, runtime-unverified:** `skill-gate.ts` `reapplyDeny` now filters the deny list to names `tools.restrict()` currently accepts, so a not-yet-registered MCP tool name (for example a Swiggy MCP server still connecting, or offline) no longer breaks gating for other skills. `tools.restrict({ deny })` still throws on a name absent from the live `restrictableNames` set; no direct list-current-tools API exists in `@deepseek-ai/dsh-tools` (`view()` is private), so the fix retries `restrict()` on that specific error, parsing the known-tool set out of the error message and filtering the deny list before retrying. Runtime verification is pending the next `dsh web` restart (see E5). `expense-split` must load `ecommerce` first (or list the same tool names) after gating.
- The three personas (`coder`/`tester`/`researcher`) stay in dotfiles-ai and
  become **skills** the orchestrator tells a subagent to load. `agent/see.md` is
  deleted (superseded by `plugins/see.ts`).
- PLAN.md is editable again (the other subagent is done with it).

### Verified dsh facts

- A skill is instruction-only `SKILL.md` (frontmatter `name`/`description`/
  `whenToUse`/`metadata`). No skill frontmatter mounts tools.
- Tools register via `ctx.tools.register()` into the calling scope layer;
  `ctx.tools.restrict(filter)` applies an agent-scoped allow/deny mask over
  global tools.
- Only skill events are `skills/change` and `agent/pre-step`; there is **no**
  `skill-loaded` event. The gate signal is `tools/post-execute` observing a
  `skill` call.
- Presets ship under the global CLI install `config/agent-presets/` (`standard`,
  `code`, `minimal.bak`, `cordis.bak`). `cordis.bak/skills/` holds the two cordis
  skills to import.

### Phase F: the dsh-remote fork — `in_progress`


The user forked `@xgone/dsh-remote` to `github.com/xyzshantaram/dsh-remote`, cloned at
`~/repos/dsh-remote`. The fork now HAS a build step: `src/client.js` is the readable
source and `scripts/build.mjs` bundles it with esbuild into the committed
`lib/client.js` (highlight.js must be inlined, because npm deps do not resolve in the
browser loader). `lib/index.js` stays hand-written. Install uses a pinned git hash of
the fork (R4).

Root causes, verified against installed rc.8 source 2026-08-21:

- **File-panel error dialog** ("expected server-response"): the fetch patch that
  intercepts `/api/host.openPath` fabricates `{rpcId, result}` but the wire schema
  (dsh-client-runtime) demands `{type:"server-response", rpcId, result}`. One-line fix.
- **Settings dead over proxy** — root cause CORRECTED 2026-08-21 late, from a live
  journal trace plus the shipped rc.8 source. The earlier reading in this plan was
  wrong and cost several rounds, so the evidence is recorded in full below.
  - dsh classifies remote purely by `location.hostname`
    (dsh-client-connection/lib/client.js:10247 `isLoopbackHostname`, used at :10279).
  - ui-settings stamps the mode at CONSTRUCTION, in two places:
    `new SettingsDescribeMirror(connection.api, connection.isLoopback ? "host" : "memory")`
    (dsh-client-ui-settings/lib/client.js:1340, inside its own apply) and
    `new SettingsScopeController(..., connection.isLoopback ? "host" : "memory", ...)`
    (:1166, inside `bind(spec)`, once per namespace).
  - A `"memory"` scope is crippled at birth: its constructor (:978-995) seeds the
    snapshot store with `status: "unavailable"` and calls `mirror.subscribe` +
    `derive()` ONLY in the `"host"` branch. So it never hears a later mirror load.
    `derive()` itself (:1087) reads no mode at all — an unsubscribed scope is not
    poisoned, it is merely deaf.
  - The apply-time flip this plan assumed would win the race CANNOT win it. The web
    shell applies every client plugin through one `Promise.all` with no sort, and
    `dsh.client.immediately: true` only PREFETCHES the bundle script. There is no
    ordering knob. The earlier claim that ui-settings injects our `remote` service
    was also wrong: `remote` is `ClientRemoteService` from dsh-api-gateway, not ours.
  - `unpinRemoteSettingsScopes` is a PERMANENT no-op on rc.8, not a fallback.
    `SettingsScopeController` is `var SettingsScopeController = class {` (:951),
    module-local, and the bundle tail exports only `{apply, inject}`. So
    `require(...)` returns no class, the guard fails, and the empty `catch` hides it.
  - Live trace evidence (host `/auth/trace` → journal): on a proxied page the flip
    lands and HOLDS (`isLoopback: true` from post-flip through 8000 ms) on a handle
    that is never replaced (same id at every tick). So the flip was never the fault.
- Flip side effects audited across all four isLoopback consumers: deliverables gains
  working open-path buttons (they route into the viewer anyway); ui-settings-general
  enables the raw settings.yaml document editor remotely — ACCEPTED by user.

All five R-tickets CLOSED — bodies live in git history up to the commit that
carries this plan update:

- [x] **R1** openPath envelope fix · **R3** viewer highlighting · **R4** pinned
      fork install (pin now `ab821d79e33e`, bump again when the gate-hardening
      commit below is pushed) · **R5** host trace channel. All evaluated live.
- [x] **R2 order-proof isLoopback flip — DONE 2026-08-22, verified end to end.**
      The host half registers a `webServer.tapIndex` that injects one classic
      script before `</head>`. It wraps `window.__ModuleLoader__.create` → wraps
      the created system's `register` → intercepts the dsh-client-connection
      factory → shadows `ctx.provide`, so the connection handle is BORN
      `isLoopback: true` (trace proof: apply-enter true, wrapInstalled true,
      flipCount 1). Session gating is structural (the auth gate already serves
      shell HTML only to valid sessions); the script also checks the JS-readable
      MARKER cookie, not the HttpOnly session cookie document.cookie can never
      see — the first deploy checked the wrong one and silently bailed.
      Gate hardening shipped with it after a live bug report:
      manifest.webmanifest + favicon.svg are PUBLIC paths (Chromium fetches
      manifests WITHOUT credentials, so gating them served login HTML to
      logged-in browsers → console Syntax error), and every other extension
      path now gets a clean 401 instead of login HTML. Loopback unchanged;
      settings writes over LAN verified by the user; Models UI loads.


### Ordering

E4/E5/E6/E7 stand alone; W6 is unblocked; W8 needs only a mount + live check.

Phase F: ALL of R1–R5 closed 2026-08-22. Remote settings work over the proxy.


### Risks

- Compaction-clear hook: resolved — the event is `compaction/start` (verified in `dsh-compaction`).
- Frontmatter key: resolved — top-level `tools-gated: [...]`.
- Gating plugin runtime: `exec.agent.ctx.tools.restrict` and the host-context `tools/post-execute` listener are implemented from verified source but NOT runtime-tested. This is now a human-review-queue item, not an open design risk.
- `dsh plugin` vs package-tool install path: run the `dsh plugin` commands directly; do not hand-edit manifests.

## Phase G: model-route quality — SETTLED 2026-08-22

The suspected common cause was confirmed and fixed by route switch, not code:
meridian's OpenAI-compat surface never sent a cache hint (the adapter only
emits cache_control for openrouter-style compat), so caching drifted 75–80%,
and cache tokens rode on meridian's lossy OpenAI translation. The user switched
the live route to `api: anthropic-messages` (`baseURL` WITHOUT `/v1`; the SDK
appends `/v1/messages`). Result reported by the user: prompt caching way
better, anthropic token counts display correctly. Reasoning-token display stays
absent — `mapUsage` drops `reasoning` for BOTH pi-ai protocols
(dsh-llm-pi-ai/lib/index.js:415-425); accepted for now.

- [x] **G3 align aidos docs — DROPPED 2026-08-22.** The alignment was made,
      then the user deleted `~/repos/aidos/docs/w0-providers.md` as pointless.
      `$DSH_HOME/settings.yaml` under `llm-pi-ai.providers.meridian` is the
      single source of truth for route rows now. Nothing left to evaluate.

## Phase H: harness ergonomics

- [ ] **H1 /grant command.** A composer command `/grant <path>` that grants the
      CURRENT session's model write access to an arbitrary path for the rest of
      the session (cross-repo work without full danger mode). Needs research:
      the session (cross-repo work without full danger mode).
      RESEARCHED 2026-08-22, verdict PARTIAL-feasible: the policy is enforced
      IN-PROCESS (fs fence `checkedTarget`; bash wrap bwrap/Landlock), but rc.8
      has NO per-path allow-list in the policy object. Design: a host plugin
      wraps the shared SandboxedFileSystem writeText/editText and skips the
      fence when the call's sessionId matches a granted session and the target
      sits under a granted root. WeakMap keyed by session; memory-only; dies
      with the session or a restart. Bash writes to granted paths stay
      kernel-denied; child subagent sessions are NOT covered; approval prompts
      disappear only for granted paths.
      *Evaluate:* /grant /some/repo lets a later edit tool write there with no
      prompt, in that session only.
- [ ] **H5 monorepo restructure — DEFERRED until after the aidos MVP.** Split
      this bundle into @shantaram.xyz/dsh-* plugin packages plus
      @shantaram.xyz/dsh-dotfiles as the personal meta-bundle.
      *Evaluate:* each plugin installs standalone; the dotfiles package pulls
      them all.
- **Direct edits to `package.json` are denied by the harness; reads are allowed.** Resolved 2026-08-21: the `package` tool now has an `add_task` action (registers a `scripts` entry from validated argv via a node one-liner, since pnpm `pkg set` rejects `:`/`-` in keys), which is the sanctioned write path. Direct `write`/`edit` of package.json is still banned; only the tool (its exempt `ctx.shell`) may do it.
