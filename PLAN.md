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

- [ ] **W13 step 1: the keyed-slot shadowing spike.** Answer one question: can a
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

- [ ] **W7 dismissed questions interrupt the loop.** Today, closing a question
      rejects the pending ask with `ASK_CANCELLED` (verified in
      `dsh-host-apiproxy`), the model sees a tool error, and it keeps going. Ship
      a personal `ask_user_question` row that wraps the shipped tool. On
      `ASK_CANCELLED` the wrapper calls
      `exec.agent.cancel('user-dismissed-question', { keepInbox: true })`.
      `keepInbox` preserves queued and steering work for the next prompt, so a
      dismissed question stops the run, not the session. Plan-review dismissal
      already stops via `dsh-plan-mode`; this covers the generic question path.
      *Evaluate:* dismissing a question stops the turn. A queued message still
      runs on the next prompt. The session stays usable.

- [ ] **W8 reject with a comment.** The approval answer payload is exactly
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

- [ ] **W14 the wake-tone client plugin.** Replace the caffeine skill with a web
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

- [ ] **W15 package-tool rework.** The `package` tool invented a project. On
      2026-08-21 it ran `npm install` at the aidos repo root, which carries no
      manifest, and created a `package.json`, a lockfile, and a `node_modules`
      there. The change belonged in `packages/aidos`. Three faults combined:
      `cwd` comes only from `exec.agent.session.header.cwd` (`package-tool.ts`
      line 247), `NODE_MARKERS` lists lockfiles but never `package.json` so
      `detectManager` cannot tell "no project" from "npm project", and npm does
      not walk up for an install target.
      **Agreed scope, settled 2026-08-21. No more discussion needed.**
      - Fail closed. Detect a real manifest for the ecosystem, and refuse with a
        message naming the directory when none exists. This is the fault that
        matters. A `cwd` argument alone does not fix it.
      - Add a `cwd` argument, resolved against the session cwd. Confine it inside
        the tool, because no seam below does it (see Critical context).
      - Add a dev flag for nodejs. Default to production, matching npm.
      - REMOVE the `version` parameter. Agents hallucinate versions from stale
        training data. A pin is a request to the user, not a tool argument.
      - Refuse a downgrade instead. Compare the resolved version against any
        installed version with `semver.lt` and refuse, naming the command to run
        by hand. `semver@7.8.5` is a devDependency here now.
      - Fix the dead `pip install pkg==` branch, and either make `update`
        distinct from `add` or say in the description that it means
        install-latest.
      *Evaluate:* an add with no manifest in the target directory refuses and
      names the directory. An add with a `cwd` naming `packages/aidos` writes
      that manifest and nothing else. A dev add lands in `devDependencies`. An
      add that would downgrade an installed package refuses and prints the manual
      command. No tool path can name a version.

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

### Phase C: the verification skill and the rules — `in_progress`

- [ ] **T1.1 Write the `verification` skill.** Create
      `skills/verification/SKILL.md`. The skill must force three questions for
      any change under review, and must forbid a TRUE verdict without an evidence
      line:
      1. If this diff is reverted, what observable behaviour changes. Name the
         file and the mechanism. A change with no answer is a no-op.
      2. For every factual claim in the description, the issue, and the commit
         message, paste the `rg` or `file:line` that proves it. Strike any claim
         with no evidence line.
      3. For every new test, name a code change that makes it fail. A test with
         no such change is tautological.
      The skill must also state that an existence check is not a verification,
      and that a hedge in a subagent report must survive into the final prose.
      *Evaluate:* run the skill against MR !248's original diff and description.
      It must independently reach "this is a no-op" and "the #317 root cause is
      false" without being told either. Both checks are reproducible from
      `origin/main`.
      *Open design question, still to settle.* The !248 test has a weakness. We
      already know both answers, so we could write a skill that passes only this
      one case. That is the same error the old verification pass made. The user
      agrees the !248 result is worth having anyway, and wants to think about the
      wider question. Candidate second test: point the skill at a `nostr-canvas`
      merge request that nobody has analysed yet, and judge the output blind.
      Settle this before closing T1.1.

- [ ] **T1.2 Wire the skill into the reviewer and the orchestrator.** Reference
      the `verification` skill from the `researcher` subagent persona and from
      `AGENTS.md`, so both the review path and the primary session reach for it.
      *Evaluate:* both files name the skill. Restart `dsh web` and confirm the
      skill appears in the session skill catalog.

- [ ] **T3.1 Orphan rule in the `plan` skill.** A ticket that builds something
      without wiring it must create a paired wire-up ticket. No ticket closes
      while a new exported symbol has no non-test caller.
      *Evaluate:* the rule text names the check command. Run that command against
      the `useLuaLintSandbox` commit and confirm it flags the orphan.

- [ ] **T3.2 Claim-evidence rule in the `review` skill.** A review must separate
      what the reviewer read from what it inferred, and must carry hedges forward
      verbatim.
      *Evaluate:* the `review` skill body references the `verification` skill.

- [ ] **T3.4 Plan-artifact rule.** No `PLAN.md`, ticket file, or `Plan:` commit
      may enter a product repo. `AGENTS.md` already says this. Restate it as a
      pre-push check.
      *Evaluate:* the rule names the check. Confirm it would have caught the 26
      `Plan:` commits and `AI_CHAT_TILES_PLAN.md` on `ai-chat-tlc`.

### Phase D: `working-with-soapbox` skill — `pending`

- [ ] **T4.1 Write `skills/working-with-soapbox/SKILL.md`.** Let the agent answer
      "what should I work on" from the tracker instead of from whatever it
      noticed while reading code. !249 fixed a cosmetic gap the AI found itself,
      in the same function as #229, which the DevRel lead reported in April from
      a real iPhone 12.
      Cover: the `soapbox-pub` group on gitlab.com, the stacked-MR and
      squash-merge workflow, the 11-step `CONTRIBUTING.md:67` contribution
      workflow, the seven close-without-review triggers at
      `CONTRIBUTING.md:166`, the `Regression-of:` trailer convention, and the
      one-bug-one-MR rule. State where to pull work from, in priority order:
      unassigned P1 issues, then human-reported bug clusters, then everything
      else. Self-discovered work ranks last. Name the reviewer bot `dirkrost` and
      the colleagues whose lanes need a heads-up.
      Also carry the checkbox rule. Never edit, reword, or negate a checklist
      item in the merge request template to make it checkable. Leave the box
      unchecked. Say why in the description. Point at the open issue that asks to
      change the rule. Use `CONTRIBUTING.md:63` and issue #320 as the worked
      example, and state that #320 is already open so nobody opens a duplicate.
      *Evaluate:* ask a fresh session "what should I work on in ditto" and
      confirm it returns tracker issues in priority order, and that it names the
      open P1s and the iOS cluster ahead of anything self-discovered.

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
- **E4 install commands (deferred until a `dsh web` restart; the live GUI holds the profile and the plugin CLI errors with a SQLite lock).** `dsh plugin --profile web add` for: `github:Tkingxiao/dsh-any-background` (THEMING plugin, not background jobs — verify intent), `github:xiyue718/dsh-ui-file-browser` (reversible), `/path/to/dsh-input-history` (local-path), `github:omdsh-dev/dsh-tool-calculator`, `github:omdsh-dev/dsh-tool-diff`, `https://github.com/omdsh-dev/dsh-at-file/archive/refs/tags/v0.6.7.tar.gz`. Analysis set: `dsh-worktree` (needs a manual `- insert` patch row; `dsh.bundle` is false; deps pin `@deepseek-ai/* 0.1.0-rc.6` vs installed 0.1.0-rc.7), `github:Tieboyh/dsh-session-search` (gate behind the session-search skill). Skip `dsh-git-plugin` unless a slash-command UI is wanted. All need a restart.

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
- [ ] W15 — the package tool refuses an add in a directory with no manifest, and
      a `cwd` argument reaches `packages/aidos`.
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
- **ecommerce gates the Swiggy MCP tools.** New `ecommerce` skill with `tools-gated: [mcp__swiggy-food__get_addresses, mcp__swiggy-food__get_food_orders, mcp__swiggy-food__get_food_order_details, mcp__swiggy-instamart__get_orders]`. **Prerequisite (researched 2026-08-21): `skill-gate.ts` `reapplyDeny` must tolerate not-yet-registered MCP tool names before adding these.** `tools.restrict({ deny })` THROWS on a name absent from the live `restrictableNames` set, and MCP tools register asynchronously after the server connects, so an offline server would break ALL skill gating. Fix: in `reapplyDeny`, filter the deny list to names currently known (or try/catch + retry with the filtered set). Do NOT add `mcp__swiggy-*` to any `tools-gated` before that fix lands. `expense-split` must load `ecommerce` first (or list the same tool names) after gating.
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
- [ ] **E4 curate plugins.** Install-now set + conflict table settled 2026-08-21 (researcher, read-only). **Recommended resolution:** install `dsh-worktree` (winner for the worktree case — the git MCP has no worktree lifecycle/workspace-registration; needs a manual `- insert` patch row since its `dsh.bundle` is false), `dsh-at-file` v0.6.7 (confirms E7), + the client/appearance/always-on set (`dsh-any-background` = THEMING plugin, verify intent; `dsh-ui-file-browser` reversible; `dsh-input-history`; `dsh-tool-calculator`; `dsh-tool-diff`). **Skip `dsh-git-plugin`** (read-only tools duplicate git MCP + worktree; its `/commit` auto-committer conflicts with the git-authority policy — install only if a slash-command UI is wanted, gated behind the `git` skill). **Gate `dsh-session-search`** behind the `session-search` skill (native `session.search` may suffice). Install commands + restart notes are in Critical context. **Not installed yet:** all installs are `dsh plugin --profile web add ...` and are DEFERRED until a `dsh web` restart (the live GUI holds the profile and the plugin CLI errors with a SQLite lock). "Util" skill (wrapping time/regex/markdown/encoding) still to write. *Evaluate:* web profile gains only approved plugins; `util` skill gates the four tools; conflict table written (done).
- [ ] **E5 build the shared skill-gating plugin.** Implemented, not yet runtime-verified. `plugins/skill-gate.ts` written and wired into `build.mjs` (bundles to `skill-gate.js`). Reads `tools-gated` from skill frontmatter at runtime, gates per-agent via `agent.ctx.tools.restrict({ deny })`, observes `skill` calls on `tools/post-execute`, clears on `compaction/start`. *Remaining:* mount it in a live `dsh web` session and confirm the gate flips (see human review queue). Also needs the reapplyDeny MCP fix before `mcp__swiggy-*` tools can be gated (see ecommerce skill). *Evaluate:* loading a gated skill makes its tools callable that session; a skill-less session cannot call them; compaction clears the gate.
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
- **Direct edits to `package.json` are denied by the harness.** The `edit`/`write`/`batch_edit` tools refuse it with E_ACCESS / a manifest denial. The `package` tool handles dependency changes only, so a project-script task (pnpm `scripts` entry) cannot be registered through any tool. Confirmed 2026-08-21 when E3 could not add its `gen:customize-setup` script. Fix belongs in the package tool: add an add-task action (e.g. `pnpm pkg set scripts.<name>=...`), and allow read-only inspection of manifests so the model can see them without triggering the denial.
