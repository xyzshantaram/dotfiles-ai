# dotfiles-ai personal bundle: open work plan

The remaining open work for the dsh personal bundle, for aidos. This file
replaces PLAN.md, which is deleted in the same commit that writes this file.
Every ticket below is verified open against the tree as of 2026-09-05.

## Vision

Finish the bundle's open tickets: guard and sync friction, the remaining
tool-render cards, the attachment-drop transport, the pending browser-polish
fixes, the screenshot gallery, a fork-side fix, a full audit of the
bash-guard client-side surface (H6), and unifying error handling across
every tool-render row, now grilled and settled into two tickets: an audit
(C6a) followed by the actual build and a strict-mode retrofit (C6b). Two
more strands came out of the same session: moving approval actions out of
the composer and onto the tool call card (H7 then H8, both gated behind
H6), and a two-badge header for the todo panel with the chevron layout
shift it exposed (B5, B6).

## Critical context

- The repo is a personal dsh bundle. `sync.sh` installs plugins, guards,
  skills, and the web profile patch. Client plugins live under `plugins/`
  and build via `node build.mjs`; typecheck is `npx tsc --noEmit`; tests run
  with `pnpm exec vitest run plugins/<name>/`.
- `node build.mjs` rebuilds EVERY bundle. Run it once, sequentially, after
  all source edits land. Parallel subagent dispatches that each ran it have
  raced and corrupted intermediate state. Do not put it in a fan-out.
- Log level convention for this bundle's call sites, settled with the owner
  on 2026-09-05 to live here and not in `home/AGENTS.md`: `error` = the
  operation failed and the caller is affected; `warn` = a fallback fired or
  something was refused; `info` = a state change a person would want in a
  normal-volume log; `debug` = per-call trace and payload detail. The test
  for `info` is volume: anything that fires on every model step is `debug`,
  which is why the profile-failover lines were demoted in `06e43a9`. This
  governs what a call site EMITS. It is separate from
  `plugins/log-exporter.ts`, which only decides what gets PRINTED, and which
  already documents its own cordis-filtering trap in a code comment at
  lines 32-35 — read that before touching `levels`.
- **Correction, 2026-09-05, do not repeat this mistake.** bash-guard
  identifies itself with the plain-text prefix `bash-guard:` — for example
  `bash-guard: the following command needs approval:\n\n  <command>\n\n
  Matched rule(s): ...`. Checked directly against the session log: zero real
  asks anywhere use a YAML payload with a string `summary` field. An earlier
  version of this file said the opposite, which is exactly backwards, and
  that wrong belief caused a real shipped bug (see H6 below).
- Two independent, unsynced copies of the bash-guard reason test exist:
  `isBashGuardReason` in `plugins/tool-render/src/guard.ts` and
  `isBashGuardReason` in `plugins/approval-comment/src/client.tsx` (a second
  function of the same name, not an import — the two plugins are separate
  packages with no shared-code path today). Both must change together if
  the real reason format ever changes again. `plugins/approval-comment/src
  /client.tsx`'s `parseGuardReason` is a THIRD, different function: it
  parses the YAML shape only, returns null for the plain-text form on
  purpose, and drives which fields the approval card can show structured —
  it must not be made to return non-null for the plain-text form, because
  its caller renders `guardReason.summary` unconditionally once it is
  non-null, and the plain-text form has no such field (this exact mistake
  shipped once today and was caught in review, not before).
- Two session projections already exist in `plugins/tool-render/src/`
  (`projection.ts`, `guarded-approvals.ts`) as the pattern for any new fold.
  `guarded-approvals.ts` bumped `stateVersion` to 2 on 2026-09-05 after the
  matcher fix above, so it replays the whole log instead of keeping a stale
  empty fold — bump it again if its matching logic ever changes.
- A compaction chat-node row (`CompactionRow` in tool-render) receives
  `props.node`, not `props.block` — it sits on `conversation.chat.node`, not
  `tool.call.toolview`. Two keys reach it: `compaction` hands the summary
  node as `node.data` directly, `manual-compaction` wraps it as
  `{ command, compaction }` where `compaction` is null both while still
  running AND on a failure. The failure signal lives on
  `command.outcome` (`{ kind: 'success' | 'error', text? }`), a completely
  separate field from `compaction` — a row that only reads `compaction`
  cannot tell "still running" from "failed" apart.
- `plugins/context-meter` and `plugins/composer-menu` both reorder items on
  the same shipped composer row (`.trailing`) by walking the DOM from their
  own element up to the row's direct child and setting `style.order`
  directly, NOT with a CSS `:has()` rule: a comma-joined selector list with
  an unsupported or non-matching `:has()` branch voids the WHOLE rule, not
  just that branch. The two plugins share one order-tier contract so they
  do not fight over the send button's order style: context-meter is 1,
  composer-menu's attach-picker reorder is 2, and the send-button bump
  either may assert is 3. Change one, change all three together.
- `/tmp/dsh` is the sanctioned scratch root and is inside the sandbox and
  the file panel roots. The spill store now pins its root there.
- A sync.sh step existing and being correct is not proof it has actually
  run on a given machine. `set -euo pipefail` means one failing earlier step
  silently blocks every step after it. Verify a step's actual effect against
  the live install before trusting that sync.sh already applied it.
- **Rejecting an approval cancels the running turn. That is upstream and
  hard-coded, not our bug.** Recorded 2026-09-03 after a live test, and
  restored here on 2026-09-05 after the PLAN.md rewrite dropped it.
  `@deepseek-ai/dsh-user-approval/lib/index.js:215-226` calls
  `agent.cancel({ kind: "user", reason: "approval-rejected" }, ...)` and
  then delivers the fixed text "The user rejected your approval request.
  Stop and explain what happened. Do not retry the rejected action." That
  cancel plus the injected followup is why the agent appears to stop and
  restart. There is no setting: `ApprovalPolicy` is only `'ask' | 'never'`,
  and the early return at line 216 fires only under `'never'`, which
  auto-rejects everything. Changing it means shadowing that row, the same
  pattern as the compaction fork, which the owner deferred on 2026-09-03.
  H8 must design around this, not assume an inline reject behaves better.
- The web profile patch points STRAIGHT at `plugins/bash-guard.js`, so the
  built artifact IS the deployed plugin. There is no separate install step
  for it, and a `dsh` restart alone deploys whatever `node build.mjs` last
  wrote. Run the build before the restart, not after.
- One ticket (TypeScript and tests across the WHOLE repo, old Effort 11 T9)
  is deliberately absent: it is unscoped and needs a design pass before it
  can carry criteria. C6b's strict-mode retrofit is a DIFFERENT, narrower
  thing — scoped to one file, `plugins/tool-render/src/client.tsx` — settled
  with the owner on 2026-09-05. Do not conflate the two or treat C6b as
  having settled T9's own repo-wide question.
- **Tooltip opt-in rules, restored 2026-09-05 from the old plan, so nobody
  has to rediscover them.** Add `data-dsh-tip=""` to a DOM element that
  already carries a `title`. The text always comes from `title`, so there is
  only ever one copy of the string and nothing can drift. NEVER opt in an
  `<option>`: a native select popup is drawn by the operating system, so a
  page tooltip cannot appear over it and the page does not reliably receive
  hover events while it is open. Opting in there removes the native tooltip
  that already works and puts nothing in its place. Three of these were
  added and reverted once. A capitalized tag is a React component, and its
  `title` is a prop, so skip it — `SettingsSection title={...}` appears in
  four plugins. `plugins/tooltips` has no test today.
- **The compaction fork's install and maintenance facts, restored
  2026-09-05.** The fork installs under the alias
  `@deepseek-ai/dsh-compaction-basic`. A direct install under the real
  package name activates the package's own bundle patch, which inserts rows
  the web patch already inserts, and boot dies on a duplicate loader entry
  id. `main` HEAD of the fork is unusable here: commit `28107e6` imports
  `@deepseek-ai/dsh-util-values`, which dsh 0.1.0-rc.7 does not ship.
  Revisit when dsh reaches 0.1.2. Edit the fork from the primary session —
  the clone at `/home/sid/repos/dsh-compaction-instant` sits outside the
  session workspace, and a dispatched coder's escalation was refused
  outright. `scripts/unshadow-compactions.py` rewrites a stored checkpoint's
  `surfaceOp` from `replace` to `"append"`, so a log showing that was
  almost certainly rewritten by the script and is not evidence of a
  compaction bug. Two hours were lost to that confusion once.
  `@deepseek-ai/dsh-compaction-tool-result-pruner` was considered and
  REJECTED: `compilableTokens` now does that job at the gate. Do not install
  it without new evidence.
- **Patch roster traps in sync.sh, both boot-breaking, restored 2026-09-05.**
  A patch row id must be unique across every bundle layer. `dsh-base`
  already mounts `command-compact`, and `dsh-web-app` then disables it,
  because the web app moves the compaction backend into the preset plane. An
  `insert:` row that reused that id killed boot with "duplicate loader entry
  id: command-compact" and blocked login. To re-enable an existing row,
  write a top-level override (`- id: <id>` plus `disabled: false`), never an
  insert. The `remote` row carries the same warning. Separately,
  `step_write_web_patch` writes an UNQUOTED heredoc, so `$var` and backticks
  expand inside it. Never put backticks in a comment there.
- easyeda exposes no project-list tool, and the bridge advertises no
  `project.list` capability. Every tool reads the document EasyEDA Pro has
  focused, so a project must be open in the editor first.
- Public MCP tool names stay `mcp__<name>__*`. This is a hard constraint:
  the expense-split skill names `mcp__blinkit__*`, `mcp__swiggy-food__*`,
  and `mcp__zepto__*` directly, so a roster rename breaks that skill.

## Phase 1: Harness and guard friction — `pending`

## Tickets

- [ ] **Ticket H1: Guard rules for podman and the npm/pnpm cache.** Add
  `guards/podman.json` and `guards/npm.json` so podman runs and npm installs
  stop paying avoidable approval friction.

  Design detail restored on 2026-09-05 from the old plan, because losing it
  would produce the wrong rule:

  - The podman rule must use `warn`, NOT `deny`. A deny breaks podman
    outright when the session already holds `danger-full-access`, because
    the guard gates bash calls independently of the sandbox mode. The rule
    should name `/run/user/1000` and `sandbox_permissions:
    danger-full-access` in its note, so the model reads a usable
    instruction instead of a bare read-only error.
  - The npm rule covers `install` AND `ci`, not `install` alone.
  - These criteria were written as a proposal and were never settled with
    the owner. Grill them before dispatching this ticket.
  - There is a measurement tool for the result:
    `experiments/tool-call-friction/scan-sandbox-friction.mjs`, run with a
    `SINCE=<deploy-date>` env var.

  **Evaluate:**

  - `podman ps` under the default workspace policy runs without an approval
    prompt, and still runs under `danger-full-access`
  - `npm install`, `npm ci`, and `pnpm install` without an explicit cache
    flag gain `--cache /tmp/dsh/npm-cache`, and an explicit `--cache` call
    is untouched
  - after `./sync.sh` both files exist under `~/.dsh/plugins/guards`
  - a re-run of the friction scan shows the opaque-failure count for podman
    and npm drop
  - a manual check: run `podman ps` under `workspace-write` and confirm the
    rule's note reaches the model instead of a bare read-only error
- [ ] **Ticket H2: sync.sh applies the aidos dsh patches.** Run aidos's
  `apply-dsh-patches.sh` after aidos install and after any dsh version change,
  treating a non-zero exit as a sync failure.

  Why, restored from the old plan on 2026-09-05: aidos needs one behavioral
  patch in the INSTALLED dsh tree. The fs sandbox must exempt the aidos
  durable scratch root (`~/.dsh/aidos/scratch/<workspace-key>/`), which the
  harness policy already allows in every phase but the sandbox layer still
  denies (aidos ticket #60). Without it, every scratch write that reaches the
  sandboxed fs tools refuses with `FS_SANDBOX_DENIED`, including
  `scratch_edit`'s delegation to `edit`. The script is idempotent and fails
  loudly on upstream drift. A silent skip reproduces the exact
  `FS_SANDBOX_DENIED` confusion it exists to end. Resolve the dsh package
  root the same way the script does, from the root behind the `dsh` binary.

  **Evaluate:**

  - a clean `./sync.sh` leaves the sandbox patch present in the installed
    dsh-sandbox package
  - a second consecutive `./sync.sh` run reports the patch as already applied
    and exits zero
  - if upstream dsh changes the patched `writableRoots` block, `./sync.sh`
    fails with the script's own message naming the mismatch, rather than
    continuing
  - a scratch write from an aidos session succeeds after sync and restart,
    with no `FS_SANDBOX_DENIED`
- [ ] **Ticket H3: Remove the stale mcp-manager state file.** Delete
  `~/.dsh/mcp-manager.json` and add the removal to sync.sh so old installs
  converge.

  **Evaluate:**

  - the file is gone after sync, and a second sync run does not recreate it
  - the journal shows no `mcp-manager` row, and no tool name is registered
    twice
- [ ] **Ticket H4: Clear stale dsh-better-edit references.** Remove or rewrite
  comments and doc text that still name dsh-better-edit after its retirement.

  Targets, restored from the old plan on 2026-09-05: the comment block in
  `plugins/manifest-guard.ts` (~line 23), `plugins/package-tool.ts`
  (~lines 25, 5), the `README.md` line about guidance overrides, and
  `skills/customize-setup/SKILL.md` plus its `template.md` (both line ~55).
  Leave `experiments/tool-call-friction/` alone. Comments only, no code
  change. Both files hook `fs/write-intent`, which the builtin edit dispatches
  too.

  **Evaluate:**

  - `rg better-edit` across the repo returns no hits outside git history
  - `pnpm test` passes
- [ ] **Ticket H5: manifest-guard documents the supported script route.** The
  deny message should name the sanctioned way to change a manifest, so the
  model stops retrying the blocked write. `DENY_MESSAGE` at
  `plugins/manifest-guard.ts:81-84` currently reads: "Direct edits to <name>
  are denied. Use the package tool for dependency changes. Ask the user to
  run the change when the tool cannot." That is a dead end for a subagent. A
  subagent cannot ask the user, and the package tool cannot scaffold a NEW
  manifest — only change dependencies in an existing one. So a subagent that
  must scaffold a package has no legal move left. On 2026-09-05 one routed
  around the guard with a heredoc and reported that honestly. That was the
  right call, and the message should have said so.

  The work:

  - Rewrite `DENY_MESSAGE`. It must name the supported script route AND
    state its limit: dependency versions still go through the package tool,
    and a version workaround still needs the user.
  - Amend the rule at `home/AGENTS.md:56-57`. It currently reads as an
    absolute ("NEVER EVER install dependencies manually by editing
    Cargo.toml/package.json/... ALWAYS use the relevant command"), which as
    written forbids the supported case. **Settled with the owner,
    2026-09-05: yes, carve out scripted structural edits.** Keep the
    dependency prohibition intact and carve out only the structural,
    scripted case. Word the carve-out tightly — the risk the owner
    acknowledged is an agent reading the exception too broadly and hand
    editing dependencies under cover of it.
  - Put the same note in the `customize-setup` skill. That is what an agent
    reads before adding a plugin, which is exactly when it needs to
    scaffold a manifest.

  **Evaluate:**

  - a blocked package.json write returns a message that names the script route
  - the message text lives in one place in plugins/manifest-guard.ts
  - `home/AGENTS.md` and the deny message agree with each other, and both
    state that dependency versions stay with the package tool unless the
    user says otherwise
  - editing dependencies in an EXISTING manifest through the fs tools is
    still denied — confirm by trying it, not by reading the code
- [ ] **Ticket H6: Audit the entire bash-guard client-side surface.** Asked
  for 2026-09-05, after the third live bug in this same surface in one
  session: the blue durable-approval mark on a tool-call card does not stick
  for a lot of tools even though it does for some, and the separate
  approval-comment card (the one that takes over the composer, not the tool
  call card) had its outline swap to the wrong color for a sandbox
  escalation, for a reason that made no sense until the reason-matcher bug
  was found. That one instance is fixed (see the critical-context entries
  above), but nothing has verified there is not a fourth, fifth, or sixth
  instance of the same class of bug still live. Needs a real audit, not
  another one-off patch:

  - Every card and surface bash-guard's outcome can reach: the tool-call
    card, the approval-comment composer card, and anything else that reads
    `approval/asked`, `approval/decided`, or a bash result's rewrite
    metadata.
  - For each one: does it use `isBashGuardReason`, `parseGuardReason`, or
    its own third copy of similar logic? If a third copy exists anywhere,
    that is itself a finding.
  - Reproduce the "does not stick for a lot of tools" claim concretely:
    which tools show durable blue reliably, which do not, and why, tracing
    the live `snapshot.pending` check, the durable `guarded-approvals`
    projection, and the rewritten-command fallback for each one.
  - Decide whether the two duplicate `isBashGuardReason` copies (tool-render,
    approval-comment) should become one shared function in `plugins/shared/`
    instead of two hand-synced copies, given this exact duplication is what
    let one of them silently drift wrong.

  **Settled with the owner, 2026-09-05: the deliverable is a written report
  first, then a go/no-go from the owner before any fix lands.** This is an
  investigation ticket. It does not fix anything itself.

  **Evaluate:**

  - the report is delivered and reviewed with the owner before any fix from
    it is dispatched
  - the report names every surface bash-guard's outcome reaches, with a
    yes/no on whether each one uses `isBashGuardReason`, `parseGuardReason`,
    or a third copy of similar logic
  - the report states concretely, not just asserts, which tools show
    durable blue reliably and which do not, and traces why for each one
  - the report recommends, with reasoning, whether the two
    `isBashGuardReason` copies should become one shared function
- [ ] **Ticket H7: A pending-approval indicator and modal in the composer.**
  Asked for 2026-09-05. A small yellow warning circle appears near the
  composer overflow trigger whenever the session has one or more pending
  approvals. Clicking it opens a modal that lists every pending approval,
  and each row carries a jump-to-call action that scrolls the conversation
  to the tool call that approval belongs to. Ships on its own. It is also
  the hard prerequisite for H8, because an inline card alone can be scrolled
  off screen, and because some approvals cannot attach to a card at all
  (see the next point).

  Facts already verified on 2026-09-05, do not re-derive them:

  - `snapshot.pending` is `readonly PendingInteraction[]`
    (`dsh-client-runtime/lib/types/client/sessions/conversation.d.ts:385`),
    and those are live `PendingWait` instances, not copies.
  - Only two kinds exist, `approval` and `question`
    (`dsh-client-runtime/lib/types/client/sessions/pending.d.ts:3-12`).
  - `callId` is OPTIONAL on the `approval/requested` frame
    (`dsh-host-apiproxy/lib/types/api/events.d.ts:80`). An approval with no
    `callId` has no card to attach to, so the modal is its only surface.
  - `plugins/composer-menu` already owns the overflow trigger and the
    order-tier contract on that row. The indicator must respect it.

  **Evaluate:**

  - the indicator appears when at least one approval is pending, and
    disappears once every one is answered
  - the modal lists every pending approval, including one with no `callId`
  - jump-to-call scrolls to the right tool call for an approval that has a
    `callId`, and the row for an approval without one says so instead of
    offering a dead action
  - the indicator does not disturb the composer row order that
    context-meter and composer-menu already share
- [ ] **Ticket H8: Inline approval actions on the tool call card.** Asked
  for 2026-09-05. Approve and reject move onto the bash tool call card
  itself, so answering an approval no longer hijacks the composer while the
  owner is typing. Scrollback then records what was approved and where,
  instead of a series of identical composer takeovers.

  **Blocked on H6 and H7.** H6 first, because this builds directly on
  `snapshot.pending` and `isBashGuardReason`, which is exactly the surface
  H6 audits, and three bugs already came out of it in one session. H7
  second, because it is the safety net for a card scrolled off screen.

  Facts already verified on 2026-09-05, do not re-derive them:

  - The routing already exists. `plugins/tool-render/src/client.tsx:736`
    already matches `payload.callId === props.callId` over
    `snapshot.pending` to decide the blue guard mark.
  - The answer wire already exists. `respond(result)` is a method ON the
    pending object (`pending.d.ts:51`), not a composer-only capability, so
    a card holding that object can answer without the composer.
  - `plugins/approval-comment` wins the `conversation.composer` slot by
    registering at priority 0 against the shipped panel's priority 1
    (see its own header comment, lines 5-8). Suppressing the takeover means
    changing that entry, not deleting the plugin: reject-with-comment still
    needs a home.
  - **Question cards are OUT OF SCOPE and cannot be done here.** The
    `question/requested` frame carries only `{ sessionId, questions }`
    (`events.d.ts:88-90`). It has no `callId`, so an `ask_user_question`
    card cannot be routed to its call without an upstream dsh frame change.
    The owner dropped this half on 2026-09-05. Do not reopen it as if it
    were merely unimplemented.

  Open design points for the implementer, not yet settled:

  - Where reject-with-comment lives once the takeover is gone. The comment
    box is the whole reason `approval-comment` exists.
  - Whether the takeover is removed outright or kept as a fallback for an
    approval with no `callId`.

  **Evaluate:**

  - a bash-guard approval renders approve and reject on its own tool call
    card, and answering from there resolves the same approval
  - the composer stays editable, and an in-progress draft survives the
    whole approval
  - reject-with-comment still works, and the steer still rides the same
    step boundary it does today
  - an approval with no `callId` is still answerable, through H7's modal
  - the answered card still shows what was decided after a page reload

## Phase 2: tool-render cards and tooltips — `pending`

- [ ] **Ticket C2: Finish the tooltip rollout.** job-viewer rows carry no
  `data-dsh-tip` tooltips yet.

  `plugins/job-viewer` was skipped on purpose, because another session owned
  it at the time. It has at least one `title`, at
  `plugins/job-viewer/src/client.tsx:333`. Any plugin added later needs the
  same pass.

  **Evaluate:**

  - hovering a truncated row label in the jobs panel shows the full text
- [ ] **Ticket C3a: resume_search gains presentationMeta.** The host half of
  the resume_search card. `plugins/resume.ts:219-249` declares an
  `output.schema` and a `render` for `resume_search`, but no
  `presentationMeta`, so nothing structured reaches the browser. The client
  cannot read a tool's canonical value, so adding the client card without
  this would force it to re-parse rendered text, which is the wrong seam.
  Project the canonical value as is, or close to it:
  `{ hits: [{ source, seq, role, text }], total, page, hasMore }`. A page
  holds at most 15 hits and each `text` is already a one-line teaser, so the
  projection stays bounded. It arrives on the client snapshot as the
  completed block's `meta` field, exactly as bash-guard's does. See `06cee1c`
  for the working example and `guardRewriteOf` for the defensive read
  pattern.

  **Evaluate:**

  - `plugins/resume.ts` declares `presentationMeta` for `resume_search`,
    carrying the projected hit shape
  - the projection stays bounded, at one page of hits per card
- [ ] **Ticket C3b: A resume_search card.** Render resume_search results as a
  structured card with one row per hit instead of raw text. **Blocked on
  C3a**, which puts the structured data on the wire.

  Register a `resume_search` row in `plugins/tool-render/src/client.tsx`.
  Summary line: the header the host already builds, for example
  `12 matches, page 1 of 2`. Body: one bullet per hit, each showing
  `source`, `seq`, `role`, and the teaser `text`. Reuse the existing row
  scaffolding rather than inventing a new card shape.

  **Evaluate:**

  - a resume_search call renders the card with hit source, seq, and teaser
    text, not a text blob
  - a zero-hit search still renders a readable row
  - the card survives a page reload, because the projection is durable
- [ ] **Ticket C4: resume_search excludes what is still in context.** Hits from
  nodes still on the live surface waste the reader's time; filter them.

  The mechanism, restored from the old plan on 2026-09-05. Searching the
  current session is the whole point of the tool (`plugins/resume.ts:17-19`),
  so do NOT exclude the current session outright. Drop only the part the
  agent already sees. A `compaction/summary` event carries `shadowedSeqs`
  (`plugins/resume.ts:89-90` reads its length today). That array is the
  authoritative set of seqs the compaction removed from the model surface.
  For the CURRENT session only, keep a hit when its `seq` appears in the
  union of `shadowedSeqs` across every `compaction/summary` event. Drop it
  otherwise. Confirm this consequence is wanted: in a session that has never
  compacted, the union is empty, so the current session contributes no hits
  at all. Update the tool description at `plugins/resume.ts:198`, which
  currently promises "past compactions included" and would no longer tell
  the whole truth.

  **Evaluate:**

  - a query that matches both compacted and live text returns only compacted
    hits
  - a search in a compacted session still finds pre-compaction content
  - hits from other sessions are unchanged
  - the tool description states the new behavior
- [ ] **Ticket C5: skill-gate posts a notice when a skill loads.** After a
  skill load unmasks gated tools, inject a short notice so the model knows the
  tools land on the next step.

  **Evaluate:**

  - loading a gated skill by slash command produces a notice naming the tools
    that appear next step
  - the notice does not appear when the skill gates no tools
- [ ] **Ticket C6a: Audit tool-render's existing error handling row by row.**
  First half of unifying error handling across every tool-render row
  (asked for 2026-09-05). Blocks C6b. Inventory every registered row in
  `plugins/tool-render/src/client.tsx` (upwards of twenty): does its
  underlying tool have a genuine failure mode (an `isError` result, an
  `outcome`/error field, or similar), and if so, does the row already wire
  `state`/`errorSummary`/`errorText` to `toolRenderRow` correctly today?
  Settled with the owner: a tool with no genuine failure mode (for example
  `ask_user_question`) is out of scope for the contract entirely, not
  forced to wire an unreachable error path.

  **Evaluate:**

  - a written inventory names every registered row, states whether its
    tool can genuinely fail, and states whether it already wires the error
    path correctly
  - the inventory is reviewed with the owner before C6b starts
- [ ] **Ticket C6b: Build the shared row helper and go strict.** Blocked on
  C6a. Settled with the owner, 2026-09-05:

  - Unify via one shared row-building helper. Every row C6a identifies as
    needing the error contract calls this helper instead of hand-rolling
    its own `state`/`errorSummary`/`errorText` reads. The helper's own
    parameters make these fields required, so a caller missing one is a
    real compile error, not a convention someone can forget.
  - `plugins/tool-render/src/client.tsx` — this one file, not the whole
    repo — gets retrofitted to pass `tsc --noEmit` under `strict: true` as
    part of this ticket. This is likely a large undertaking on its own: the
    file is currently consistent `var`, no-annotations style throughout,
    well beyond the error-handling code, and turning on strict mode checks
    the WHOLE file at once. Confirm the actual mechanism for scoping strict
    mode to one file or plugin (a per-package tsconfig, most likely) before
    claiming this is done — do not assume it works without checking.
  - This is separate from the old Effort 11 T9 (TypeScript and tests across
    the WHOLE repo), which stays unscoped and untouched by this ticket.

  **Evaluate:**

  - every row C6a identified as needing the error contract calls the
    shared helper, and no row that needs it still hand-rolls the fields
  - `plugins/tool-render/src/client.tsx` passes `tsc --noEmit` under
    `strict: true`
  - a deliberately broken test case (a row missing a required error field)
    fails at compile time, confirmed live and then reverted — proof the
    contract actually enforces itself, not just that the happy path
    compiles
  - the existing test suite still passes in full

## Phase 3: Attachment transport — `pending`

- [ ] **Ticket A1: An attachment-drop plugin.** Replace dsh-paste-to-path with
  our own drop plugin that lands files under `/tmp/dsh`. **Re-confirmed with
  the owner on 2026-09-05 and it still stands**, even though that same
  session relocated dsh-paste-to-path's picker and the owner verified it
  works. The reason to still replace it: today we fix an upstream plugin's
  placement by reaching into its DOM from outside, which can break on any
  upstream change. Owning the plugin removes that dependency and puts the
  landing path under our control. Do not reopen this on the grounds that
  the current surface works — that was already weighed.

  Spec, restored from the old plan on 2026-09-05:

  - Host: one route that writes under `<workspace>/.dsh/<drops-dir>/` and
    answers the path plus real metadata. Metadata includes image dimensions
    and a type description. Derive them the cheap way (`file`, or an
    image-header read) rather than adding an image dependency.
  - Client: composer paste/drop support WITH a preview card, for the human.
    The text that actually enters the message is ONE minimal line, for
    example `attachment: /home/sid/repos/proj/.dsh/<uuid>.png image/png
    1920x1080`. No dock prose, no codec expansion.
  - An exported client helper, `dropUpload(sessionId, workspace, blob) ->
    { path, ... }`, so another plugin can use the transport directly with no
    composer involvement at all. The owner consumes this helper.
  - **UNRESOLVED, settle before building this ticket.** The landing
    directory conflicts between the two sources merged here. This ticket's
    own summary line says `/tmp/dsh`. The restored host spec says
    `<workspace>/.dsh/<drops-dir>/`. The shipped `dsh-paste-to-path` writes
    under `<workspace>/.dsh/pastes/images/` today, so the workspace path is
    the current behavior, not the scratch root. Pick one and correct the
    other line. A workspace path keeps a drop next to the project it belongs
    to. `/tmp/dsh` keeps dropped files out of the repository and matches the
    sanctioned scratch root.

  **Evaluate:**

  - dragging an image onto the composer attaches it and the file lands under
    `/tmp/dsh`
  - pasting an image shows a preview card, and on send the message carries
    exactly the one-line attachment reference
  - a non-image file (pdf, log) works through the same path with its own
    metadata line
  - the exported helper uploads a Blob and returns the path with NO composer
    side effects, proving the transport is reusable
  - a workspace that does not exist, or a path escaping it, is refused with a
    named error
  - `node build.mjs`, `npx tsc --noEmit`, and `pnpm test` pass
- [ ] **Ticket A2: Retire dsh-paste-to-path.** Remove the old plugin from
  sync.sh once the replacement covers its behavior.

  **Evaluate:**

  - sync.sh no longer installs dsh-paste-to-path
  - image paste and drop both still work on a fresh session

## Phase 4: Browser polish — `pending`

- [ ] **Ticket B2: The profile selector pill alignment.** Pill and model text
  align on their bottoms, not their centers.

  **Evaluate:**

  - pill and label centers match within one pixel in computed geometry
- [ ] **Ticket B4: Browse old todo lists from the composer.** The todo panel
  gains history browsing and an insert action.

  Spec, restored from the old plan on 2026-09-05. Two chevron buttons in the
  EXPANDED panel step through past lists, and stop at both ends. Each
  historical view shows the timestamp that list was written. History rides
  the projection, bounded to the LAST 35 WRITES, chosen over a per-turn
  bound and over a host route. Insert takes the whole shown list, never a
  subset: it appends every item as a markdown checkbox list to the composer
  draft through the same append path the Remind button uses, including the
  blank-line separator and the empty-draft case. It never submits. Nothing
  steers and nothing can fail silently. No edit-mode toggle and no
  per-item selection. Leaving history returns to the live current list.

  **Evaluate:**

  - an older list can be opened and inserted into the composer
  - the chevrons walk back and forward through the retained lists, and stop
    at both ends
  - each historical view shows the timestamp that list was written
  - Insert appends the shown list as a markdown checkbox list to the draft,
    and never submits
  - leaving history returns to the live current list
- [ ] **Ticket B5: The todo panel header becomes two badges.** Asked for and
  fully specced with the owner on 2026-09-05. The
  `plugins/durable-todos` header replaces its title-plus-prose-summary
  (`client.tsx:138-139`, the `buildSummary()` string at lines 110-119) with
  two badges side by side.

  The spec, settled:

  - Badge one reads `To-do list`. It matches the tool call card's name badge
    in size, border, and radius, but NOT its color: it takes one fixed color
    of its own. It does not call tool-render's `toolNameHue`, so the two
    plugins gain no shared-code dependency for this.
  - Badge two is one badge split into four segments, in this order:
    `TOTAL · 10 | DOING · 1 | PENDING · 2 | DONE · 2`. The pipes are the
    split points, drawn as dividers. Each label is bold, grey, and muted.
    Each segment carries an icon before its label.
  - The icons, all from the shipped primitives and all rendered at
    `size={14}`: TOTAL `IconChecklistOutline14`, DOING `IconPlayOutline16`,
    PENDING `IconQueueOutline14`, DONE `IconCheckOutline14`. A 16px icon at
    `size={14}` is the established pattern here, see tool-render's
    `IconAgentPresetOutline16 size={14}`.
  - A segment whose count is zero is hidden. TOTAL is always shown, even at
    zero, so the header never collapses to nothing.
  - The `carried over` tag is removed: the `<span>` at `client.tsx:141` and
    the `.durable-todos-carried` rule at `client.module.css:70`. Remove ONLY
    those two. The `carriedOver` field stays in `projection.ts`, its zod
    schema, and its eight tests. It is persisted state and `apply()` reads
    it at `projection.ts:52`.
  - The Remind button stays where it is, on the right.

  **Evaluate:**

  - the header shows both badges, and the split badge's four segments read
    as specced with their icons
  - a zero count hides its segment, TOTAL survives at zero, and an empty
    list still renders a readable header
  - `rg carried plugins/durable-todos/src` still finds the projection and
    its tests, and finds nothing in `client.tsx` or `client.module.css`
  - the existing durable-todos tests still pass untouched
- [ ] **Ticket B6: A disabled chevron replaces the missing one.** Settled
  with the owner on 2026-09-05. A row that cannot expand currently renders
  no chevron at all, so its title sits at a different x position than an
  expandable row's, and a row that gains a body shifts sideways. Render the
  chevron always, greyed out and non-interactive when there is nothing to
  expand, so the layout never shifts.

  This lands in two places, and both must change together:

  - `plugins/tool-render/src/client.tsx:604`, the shared row builder's
    `interactive ? <IconChevronDownOutline14 .../> : null`. This is the
    shared path, so EVERY non-expandable tool card in the app gains a greyed
    chevron. That breadth is intended, not a side effect.
  - `plugins/durable-todos/src/client.tsx:132`, whose chevron is already
    always rendered but is still live when the list is empty.

  **Evaluate:**

  - a non-expandable tool card shows a greyed chevron, and its title starts
    at the same x position as an expandable card's
  - the greyed chevron does not respond to a click and is hidden from
    assistive technology
  - the todo panel header holds its layout with an empty list

## Phase 5: Screenshot gallery — `pending`

- [ ] **Ticket G1: Derive the shot list from sync.sh.** Enumerate every UI
  surface the bundle changes so the gallery covers them.

  Recipe, restored from the old plan on 2026-09-05. Walk the `pnpm_ins`
  calls and the roster array in `sync.sh`, which together name every
  installed plugin. Produce a table in `screenshots/README.md` with one of
  three verdicts per plugin: has UI and needs a shot, has UI but already
  covered by another shot, or has no UI. A no-UI verdict carries one line
  saying why, so a later reader does not redo the check.

  **Evaluate:**

  - the shot list names one entry per bundle plugin with a visible surface
  - every `pnpm_ins` spec in `sync.sh` appears in the table exactly once
  - each row carries a verdict, and a no-UI verdict says why
- [ ] **Ticket G2: Capture the shots.** Screenshot each surface on a live
  session, before and after where it matters.

  Recipe, restored from the old plan on 2026-09-05. Shots are WebP scaled to
  720p, with this verified command:
  `magick <in>.png -resize x720 -quality 82 -define webp:method=6 <out>.webp`.
  `-resize x720` fixes the height and keeps the aspect ratio. Do not force
  both dimensions. Name files after the plugin id, for example
  `context-meter.webp`. Prefer a shot showing the feature in use over an
  empty state. Use one theme throughout so the gallery reads consistently,
  and say in the README which theme it is.

  **Evaluate:**

  - every row marked "needs a shot" has a `.webp` file, and no file is orphaned
  - `magick identify` reports a height of 720 for every shot
  - no shot exceeds 150 KB
  - each image is legible at the width GitHub renders it in the README
  - the owner agrees each shot shows the feature rather than an empty panel
- [ ] **Ticket G3: Write the gallery README.** A README section shows the
  shots with captions.

  Recipe, restored from the old plan on 2026-09-05. One section per shot
  with the image, the plugin name, and one or two sentences on what changed
  against stock. Then pick the few that best show the bundle and add them to
  the main `README.md`, linking through to the full gallery.

  **Evaluate:**

  - the main README links the gallery and every image renders
  - the main README carries a small selection, not the whole gallery
  - each caption says what is different from stock, not just what the thing
    is

## Phase 6: Fork-side fix — `pending`

- [ ] **Ticket F1: Translate the compaction fork's settings card.**
  dsh-compaction-instant still renders one Chinese settings title.

  **Evaluate:**

  - the compaction settings card renders in English on a live session

## User preferences and special rules

- Worktrees of outside repos go under `/tmp/dsh`; the user lands them.
- Never edit package.json with file tools; manifest-guard requires the script
  route.
- CSS class names are kebab-case. Shared chevron is IconChevronDownOutline14
  rotated by CSS.
- Never commit without explicit approval, except where the user has already
  stated a standing preference to proceed (this session: fix-and-commit on
  a concretely diagnosed, low-risk bug is fine without re-asking each time).

## Human review queue

- [ ] Restart `dsh web`, then confirm a bash-guard ask turns a tool card
      blue, that it survives answering the approval, and that it survives a
      page reload (the reason-matcher fix and the `guarded-approvals`
      `stateVersion` bump both live in the host process and need this
      restart to take effect).
- [ ] After that restart: trigger a real bash-guard ask and confirm the
      approval-comment composer card shows the electric-blue outline, not
      orange, and still shows its full readable reason text (not a blank
      headline).
- [ ] Compaction: run a manual `/compact` that succeeds, confirm the card
      expands into readable markdown (not a monospace code-block wall).
      Then force one to fail and confirm the card shows the red error
      outline with the real failure text, not a blank "Compaction" row.
- [ ] `list_agents` renders as a proper card, not the shipped generic row.
- [ ] Composer: the overflow trigger sits flush in the bottom-left corner,
      the attach pin sits directly left of send/stop, and the web-search
      submenu (Force/Auto/Off) works and defaults to Auto.
- [ ] `ask_user_question` cards render markdown in the prompt/options/note,
      keep their original distinct colors (including the bold, primary-color
      selected label), and stay compact (no extra paragraph gaps).
- [ ] Settings/plugins panels no longer poll in the background while the tab
      is unfocused; watch the browser console and the systemd journal across
      an idle stretch.
- [ ] Profile failover: force one real failover and confirm it still logs at
      info, then leave a session idle on a steady provider and confirm the
      journal does NOT get a repeating "chain selected" line every step.
- [ ] podman skill: ask for a container action and confirm the skill loads,
      the `mcp__podman__*` tools appear, and the model does not try a bare
      `podman` shell command first.
- [ ] Screenshot gallery — the owner picks which shots reach the main
      README, because that is a taste call and not a checkable one.
- [ ] Job viewer wake-up notice, verifying the shipped Effort 6 completion
      delivery: let a background job finish while idle and confirm you get
      woken up with a notice, without having to ask about it.
- [ ] Job viewer modal over dsh-remote, verifying the shipped Effort 6 modal:
      open the modal from the phone and confirm it loads and keeps polling.
