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

- [ ] **W13 step 1: the keyed-slot shadowing spike.** **STATUS 2026-08-21 evening: dispatched twice, killed both times by the subagent-infrastructure fault (see Critical context, "Session state"). No findings recorded. RERUN after the profiles plugin lands.** Answer one question: can a
      client plugin claim a key that a shipped plugin already registered on a
      KEYED slot, and win? The slot system documents the rule only for the `root`
      SINGLE slot, where a dynamically registered entry takes a lower priority
      than the shipped one, which makes it the winner. Whether keyed slots
      resolve the same way is unverified. `dsh-client-ui-slots` ships no readable
      `index.d.ts` in the installed tree, so the answer comes from a real plugin
      in a real browser, not from a type. **W6 needs the same answer, so one
      spike closes two tickets.**
      *Evaluate:* a throwaway plugin registers a component under a key an
      installed plugin already owns, and the browser renders the new component
      instead of the shipped one. A negative result is equally valid and closes
      W13 step 2 as impossible.

- [ ] **W6 profiles client.** Gated on the W13 spike. One client plugin carries
      the Profile submenu in the model seat, the match badge, the per-session
      override, the cost display, and the title rewriter. The patch disables the
      shipped `ui-model-selection` and registers the replacement seat. Selecting
      a profile calls `sessions.models(...)`, the same call the shipped selector
      uses, and changes providers only. The badge comparison runs client-side
      against the profile config and drops when the selection no longer matches.
      The cost display sums per-model tokens from `assistant/chunk` usage records
      times a price-table settings namespace.
      *Evaluate:* the submenu switches both profiles and the session answers on
      the new model. The badge appears on a match and drops after a manual
      override. The tab title reads `dsh | <session title>`. The cost figure
      tracks a real session.

- [ ] **W8 reject with a comment.** **STATUS 2026-08-21 evening: dispatched twice, killed both times by the subagent-infrastructure fault. Unknown whether partial edits exist; inventory plugins/, build.mjs, sync.sh before rerunning. RERUN after the profiles plugin lands.** The approval answer payload is exactly
      `{ sessionId, approvalId, outcome: 'allowed-once' | 'rejected' }` (verified
      in `dsh-host-apiproxy/api/approvals.schema`). There is no comment channel.
      Extend the permission card with an optional Comment field. Reject with a
      comment answers the approval normally as `'rejected'` and injects a
      steering message through `sessions.send(sessionId, { mode: 'steer',
      content })`, which submits at the nearest step boundary. The message reads
      "The user rejected the <tool> call. Comment: <text> Adjust your next
      action." Upstream end state is an optional rejection-reason field on the
      outcome, after which this is deleted.
      *Evaluate:* a rejection with a comment reaches the agent as text and
      changes its next action. A rejection with no comment behaves as it does
      today.

- [ ] **W14 caffeine inhibitor-leak fix.** **DECIDED 2026-08-21: the wake-tone client plugin idea below is DROPPED (user call: "the silent tone idea is not great"). Only the inhibitor-leak bug fix remains. The fix was dispatched twice and killed both times by the infrastructure fault; check skills/caffeine/ for half-applied edits before rerunning. The stale wake-tone body below is kept only for provenance and can be deleted at the next plan compaction.** ~~Replace the caffeine skill with a web
      client plugin that plays a near-silent tone while the agent works. KDE
      PowerDevil blocks automatic sleep while audio plays, so the tone holds the
      machine awake with no manual toggle and no logind inhibitor to leak.
      **Why it looks possible.** `dsh-client-connection/lib/client.js` carries
      `isRunning` (lines 67, 72, 113) and consumes `turn/start` at many points,
      so a client plugin can read the busy state. A browser tab already holds an
      uncorked PipeWire stream in this exact setup: `pactl` showed sink-input
      #215 owned by Firefox with `Corked: no` for the harness tab itself.
      **Both research passes FAILED on 2026-08-21 and must be re-dispatched.**
      One subagent errored before it finished. The other went idle and delivered
      no report. Nothing from either is recorded, so treat every question below
      as unanswered.
      *Browser facts to settle.* Whether Firefox on Linux needs a user gesture
      before an `AudioContext` produces output, and whether `127.0.0.1` differs
      from a remote origin. Whether a gain-zero graph still registers an uncorked
      PipeWire sink input, and whether a very low non-zero gain behaves
      differently. Whether a background or minimized tab throttles the context.
      Whether PowerDevil takes a `systemd-logind` lock or polls the audio server
      with no lock — the inhibitor list showed no audio entry while a Firefox
      stream ran, so the list may be the wrong place to look.
      *Seam facts to settle.* The client plugin manifest shape and its `./client`
      export. The exact public export a third-party bundle imports to read
      `isRunning`. The idle signal, including the error, abort, and
      approval-prompt paths. What `sync.sh` and `build.mjs` must add for a
      browser build target.
      A user-gesture requirement turns this from automatic into one click per
      session, which changes the design.
      **Carry over one bug.** `caffeine.sh` leaks an inhibitor. The `on` path
      spawns `systemd-inhibit` and then writes the PID file, so a failure between
      the two steps leaves an unowned process that `off` cannot kill. This
      happened on 2026-08-21 and left pid 280505 holding the machine awake. Fix
      the script or delete it together with the skill.
      *Evaluate:* the tone starts when a turn starts and stops when the agent
      goes idle, including after an error, an abort, and an approval prompt. The
      machine stays awake through a long turn with no key press. The machine
      suspends on its normal timeout after the turn ends. Two tabs open on the
      same harness do not produce two tones. Closing the tab stops the tone.


- [ ] **W13 step 2: the markdown renderer.** Only if the spike passes. The
      shipped markdown renderer is a hand-rolled `switch` over mdast node kinds
      inside `@deepseek-ai/dsh-web-frontend`, the prebuilt shell, not a plugin
      (verified 2026-08-21). Two consequences hit daily. Its URL filter hardcodes
      `http:`, `https:`, and `mailto:` and returns `""` for anything else, so a
      custom scheme renders as bare text and a RELATIVE link is stripped too,
      because `new URL("/x")` throws with no base. Its `inlineMath` arm sits
      beside `case "link"`, so single-dollar LaTeX is on by construction with no
      toggle. The replacement claims the `assistant` key on
      `conversation.chat.node`, brings a real parser and a real sanitizer
      library, and registers no math arm.
      **The cost, stated up front.** The row is not a markdown widget. A
      replacement must render everything `AssistantChatData` carries: the
      `running`/`settled`/`interrupted` status, the whole `blocks` array, code
      blocks, file mentions, tool-call blocks, and `finalNode`. That is a copy of
      a shipped component tracking a contract that moves between releases. The
      build also needs `@deepseek-ai/dsh-client-ui-primitives` and
      `@deepseek-ai/dsh-client-ui-slots` from npm at `0.0.1-rc.1`, both absent
      from the installed tree.
      **Upstream end state.** dsh exposes a pluggable markdown pipeline, a URL
      transform hook, and a math toggle. Then this plugin is deleted.
      *Evaluate:* `$5 and $7` renders as literal text. A relative markdown link
      resolves against the app origin instead of vanishing. A `javascript:` URL
      is still refused. Streaming, interrupted, and settled assistant rows all
      render, and a tool call inside an assistant row is unchanged.

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


### Phase E: rebuild the measurement side — `blocked`

**What this means.** "Dashboard" here means the scripts in
`~/ai-scratch/session-analysis/` that produced `REPORT.md` and
`WORKFLOW_COST_REPORT.md`. Those scripts count cost, task time, commits, and
frustration. They do not count whether the work landed or whether the claims held
up. The old numbers said the workflow got 4 times faster. The outside numbers
moved the other way: merge rate fell from 72.8% to 28.6%, median time to merge
rose from 0.04 days to 10.5 days, and median merge request size grew from 3 files
to 64. The old scripts counted a `git commit` as "finished". A commit only
records that the AI decided it was done.

**Blocked on two answers from the user.**

1. Confirm the user wants these scripts changed at all. Skip this phase if the
   measurement side does not matter.
2. `~/ai-scratch/session-analysis/PLAN.md` already exists. The `plan` skill
   forbids overwriting a planning file it did not create. Add a phase to that
   file, or make a separate one?

- [ ] **T5.1 GitLab outcome puller.** Pull merge rate, time-to-merge, merge
      request size, review findings split blocking and non-blocking, and
      struck-claim count.
- [ ] **T5.2 Replace commit-based completion with merge-based completion.**
- [ ] **T5.3 Add the struck-claim metric.** Count claims a reviewer rejected as
      unsupported. That is the actual defect class, and it was never counted.

## Critical context

### Session state 2026-08-21 evening — READ ME FIRST

- **Subagent dispatch is broken.** Since the user switched AI providers mid-session (`agent-default-model` is now `opencode-zen / x-preview-f-free`), every `subagent` dispatch fails within seconds with no closing message, while the orchestrator session works fine. Diagnosis so far: (a) the first wave of failures was explained by a `dsh web` crash loop — sync.sh's rewritten aidos step added the bundle row but the git install failed (the systemd user service has no SSH agent for `git@github.com`), leaving an unresolvable bundle that killed composition at boot; the user installed the aidos package manually and dropped it from the profile bundles list, which ended the crash loop. (b) A fresh probe dispatched on the now-stable server ALSO died instantly, so the crash loop is not the whole story. Verified NOT the cause: missing built plugin files (all `plugins/*.js` referenced by the live patch exist). Unverified suspicion: free-tier concurrency limits on opencode zen rejecting parallel child streams. The `subagent` tool exposes no per-call model override, so children inherit `agent-default-model`; there is no way to route them differently today.
- **Decision: build the profiles plugin in the MAIN session first** (proper per-role model routing, the W6-adjacent seam), then rerun the failed jobs once routing works. Failed jobs to rerun: W13 spike, W8 reject-with-comment, W14 caffeine fix, and E4 completion (add `@xgone/dsh-remote`, see below).
- **Completed and verified this session (staged, not committed):** W7 ask-interrupt wrapper (`plugins/ask-interrupt.ts` + build.mjs entry + sync.sh row); W15 package-tool rework (fail-closed manifest, confined cwd, dev flag, version param removed, downgrade refusal via semver.lt, add_task intact); Phase C verification skill (+ wiring into researcher/AGENTS/plan/review; !248 run plus blind !257 run both real); Phase D working-with-soapbox skill (several CONTRIBUTING.md citations marked UNCONFIRMED inside the skill because GitLab MCP tools died mid-run — verify before trusting); E5 reapplyDeny fix coded (`restrictKnown` retry, build-verified only). All of this survived the user's stash/unstash cycle intact.
- **dsh-remote approved for E4 (user decision: instance is LAN-only behind Caddy TLS, never internet-exposed).** Add `dsh plugin --profile web add @xgone/dsh-remote` to sync.sh's install step plus a config row `- id: remote, config: { enabled: true, session: { secure: true } }` in the cordis.patch.yml heredoc. No bootstrap section: potato has a local browser, the user creates the admin account via loopback first-run. Source: https://github.com/xgone/dsh-remote
- **aidos bundle state:** the package IS installed in `~/.dsh/profiles/web/node_modules/aidos`, but its bundle row is currently ABSENT from the profile's `package.json` bundles list (dropped during the crash-loop recovery). Without the row the host-plane aidos-core service does not mount. sync.sh's aidos step re-registers it idempotently on the next run; make sure the git install actually succeeds this time (needs SSH auth available to whatever shell runs sync.sh).
- **Nothing from this session is committed.** Working tree carries all of it as modifications + untracked files. Commit groups, after user review: (1) aidos git-install rework (sync.sh, plugins/see.ts, PLAN.md path fixes), (2) W7+W15+E5 plugin fixes, (3) Phase C+D skills and wiring, (4) E4 staging (sync.sh installs, util/session-search skills, conflict-table doc).

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
- **The meridian route** is settled and live. Meridian exposes OpenAI-compatible
  `/v1/chat/completions` and `/v1/models` on port 9000. The route is declared
  with `api: openai-completions`, which also enables `/models` auto-detection in
  the Models page that `anthropic-messages` cannot do. A dummy `apiKeyEnv` value
  satisfies the credential check. Exact rows are in `~/repos/aidos/docs/w0-providers.md`.
- **The Go subscription route** is pinned: base URL `https://opencode.ai/zen/go/v1`
  (the adapter appends `/chat/completions`), key `OPENCODE_GO_API_KEY` in
  `$DSH_HOME/.credentials.yaml` or the env var, which wins.
- **A route must declare image input or `see` fails.** The pi-ai adapter only
  accepts images when the model or route declares it. The meridian route carries
  `defaultInput: [text, image]`, written by `sync.sh` step 9. Whether the
  opencode-go route declares it for `qwen3.7-plus` is unconfirmed, so the
  personal-profile `see` path is unverified.

### Seams and gotchas

- **GitLab MCP tools can drop out mid-session.** During T4.1 research, `glab_issue_view`, `glab_mr_view`, `glab_issue_list`, and `glab_api` stopped responding partway through a research pass in a delegated subagent session, while `glab_repo_view` kept working. This looked like a permission denial at first but was a tool-availability fault instead, so retrying did not help. If this recurs, fall back to whatever `glab_*` tool still answers and flag any unconfirmed fact in the output rather than blocking on full research.

- **Keyed-slot shadowing is unverified and two tickets depend on it.** W6's
  Profile seat and W13's renderer both assume a plugin can claim a key a shipped
  plugin already owns. The documented rule covers the `root` single slot only.
- **The markdown renderer lives in the prebuilt shell.** No slot in the
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
- **bash-guard gates only the `bash` tool.** Verified in `bash-guard.ts` (it returns `next()` unless `exec.name === 'bash'`). So the "raw git denied, use mcp__git__*" rule binds only model bash calls. Plugin git via `ctx.subprocess` (dsh-worktree, dsh-git-plugin) and the git MCP both bypass it. The E6 `guards/git.json` reason update should point at the `git` skill AND note these bypass paths.
- **E4 install commands and the full conflict table are in `docs/plugins-conflict-table.md`** (durable handoff; temporary — delete it once E4 is wired into `sync.sh` and verified). Summary: deferred until a `dsh web` restart (the live GUI holds the profile and the plugin CLI errors with a SQLite lock). `dsh plugin --profile web add` for `dsh-any-background` (THEMING, verify intent), `dsh-ui-file-browser` (reversible), `dsh-input-history` (local path), `dsh-tool-calculator`, `dsh-tool-diff`, and `dsh-at-file` v0.6.7 tarball; analysis set: `dsh-worktree` (manual `- insert` patch row; `dsh.bundle` false; pins `@deepseek-ai/* 0.1.0-rc.6` vs rc.7), `dsh-session-search` (gate behind session-search skill). Skip `dsh-git-plugin`. All need a restart.

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

### Pickup point

The live web patch carries 9 rows and no session-hygiene row. A `dsh web`
restart is needed before that removal takes effect.

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
- [ ] W14 — re-dispatch both research passes. Both failed on 2026-08-21 and
      produced no report.
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

### Tickets
- [ ] **E4 curate plugins.** Conflict table settled 2026-08-21 (researcher, read-only); full table in `docs/plugins-conflict-table.md`. **Staged, not yet live.** `sync.sh` step 8 now runs `dsh plugin --profile web add` for all eight approved plugins: `dsh-any-background`, `dsh-ui-file-browser`, `dsh-input-history` (behind an empty-by-default `DSH_INPUT_HISTORY_PATH` override — it ships no git-tagged publish and no local checkout exists yet, so the install is skipped with a warning until that variable is set), `dsh-tool-calculator`, `dsh-tool-diff`, `dsh-at-file` v0.6.7 tarball, `dsh-worktree`, and `dsh-session-search`. `dsh-git-plugin` is skipped, as settled. `dsh-worktree`'s manual `- insert: {id: worktree, name: 'dsh-worktree'}` patch row is in step 7's `cordis.patch.yml` heredoc. `skills/util/SKILL.md` gates `tool-time`/`tool-regex`/`tool-markdown`/`tool-encoding`, sourced from the `omdsh-dev/dsh-toolkit` collection (confirmed real via its README; `dsh-tool-calculator`/`dsh-tool-diff` stay always-on and ungated, per conflict row C10). `skills/session-search/SKILL.md` gates `agent_session_search`/`agent_session_read`, the real tool names from the plugin's README. `bash -n sync.sh` and `node build.mjs` both pass. **Remaining, blocked on the single end-of-session `dsh web` restart:** run `sync.sh` (may still hit the SQLite profile lock if a live `dsh web` process holds it — do not kill that process to work around it; wait for the orchestrator's restart); after the restart, confirm the eight plugins load with no error, confirm the `worktree` tools appear (watch for the `dsh-worktree` peer pinned to `@deepseek-ai/* 0.1.0-rc.6` vs this install's rc.7 — report a load failure instead of pinning a workaround), confirm `util` and `session-search` skills appear in the session catalog and their gated tools stay hidden until loaded, then delete `docs/plugins-conflict-table.md`. *Evaluate:* web profile gains only the approved plugins; `util` skill gates the four toolkit tools and leaves calculator/diff ungated; `session-search` skill gates the two real session-search tool names; conflict table deleted only after live verification.
- [ ] **E5 build the shared skill-gating plugin.** Implemented, not yet runtime-verified. `plugins/skill-gate.ts` written and wired into `build.mjs` (bundles to `skill-gate.js`). Reads `tools-gated` from skill frontmatter at runtime, gates per-agent via `agent.ctx.tools.restrict({ deny })`, observes `skill` calls on `tools/post-execute`, clears on `compaction/start`. **The reapplyDeny MCP fix is now coded (2026-08-21): `restrictKnown` retries `restrict()` on its "unknown global tool" error, filtering the deny list down to the known-tool set the error itself reports, so one not-yet-registered MCP tool name (for example a Swiggy MCP tool before its server connects) no longer breaks gating for every other skill. This fix is build-verified only — `node build.mjs` passes — and still needs the runtime check below.** *Remaining:* mount it in a live `dsh web` session and confirm: loading a gated skill unmasks its tools that session; a fresh session without the skill cannot call them; compaction re-hides them; and specifically that an ecommerce-style skill naming a not-yet-registered MCP tool does not break gating for other skills (see human review queue). *Evaluate:* loading a gated skill makes its tools callable that session; a skill-less session cannot call them; compaction clears the gate.

- [ ] **E6 cordis import + util + git skills + bash-guard.** Import the two cordis
      skills with `tool-cordis` gated behind the skill; `whenToUse` tells the agent
      to load `customize-setup` first. Write `util` and `git` skills. Update
      `guards/git.json` reason to point at the git skill. *Evaluate:* gated tools
      hidden until load; `guards/git.json` names the git skill; customize-setup is
      a prerequisite in cordis `whenToUse`.
- [ ] **E7 fold attachment-vision into `see.ts`.** Settlement decided 2026-08-21 from a read of `endlass/dsh-attachment-vision` and `FSMargoo/dsh-at-file`. dsh ships a native `read_image` tool (`dsh-tool-fs`) but it is **route-gated to image-capable models**, so a visionless parent cannot call it directly. The bundle's `see.ts` already implements the image→path-for-no-vision pattern: a visionless model is handed an image path, calls `see`, which dispatches a vision subagent whose keep-set includes `read_image`/`read`, routing on the profile whose image input `sync.sh` has declared. The `@` file-mention is **not native to dsh** (dsh-session-reference handles cross-session mentions only); it comes from `dsh-at-file`, which emits a `<workspace-reference path=... kind=file>` marker and does NOT inline content, so a `@`-ed image gives the model the path (not base64). **Verdict: do NOT modify `see.ts`; drop `dsh-attachment-vision` (it is for GUI drag-and-drop image blocks, a different path than `@`); install `dsh-at-file` so `@ image` yields a path the model can feed to `see`.** *Evaluate:* no new vision plugin installed; `@ image.png` gives the visionless model a path; `see` with that path returns a description; overlap documented above.

### Ordering

E1 → E2 (and E3 in parallel) → E4/E7 independent → E5 needs E4's tool list →
E6 needs E3+E4+E5.

### Risks

- Compaction-clear hook: resolved — the event is `compaction/start` (verified in `dsh-compaction`).
- Frontmatter key: resolved — top-level `tools-gated: [...]`.
- Gating plugin runtime: `exec.agent.ctx.tools.restrict` and the host-context `tools/post-execute` listener are implemented from verified source but NOT runtime-tested. This is now a human-review-queue item, not an open design risk.
- `dsh plugin` vs package-tool install path: run the `dsh plugin` commands directly; do not hand-edit manifests.
- **Direct edits to `package.json` are denied by the harness; reads are allowed.** Resolved 2026-08-21: the `package` tool now has an `add_task` action (registers a `scripts` entry from validated argv via a node one-liner, since pnpm `pkg set` rejects `:`/`-` in keys), which is the sanctioned write path. Direct `write`/`edit` of package.json is still banned; only the tool (its exempt `ctx.shell`) may do it.
