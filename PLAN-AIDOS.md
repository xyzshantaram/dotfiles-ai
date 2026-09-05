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
- One ticket (TypeScript and tests across the WHOLE repo, old Effort 11 T9)
  is deliberately absent: it is unscoped and needs a design pass before it
  can carry criteria. C6b's strict-mode retrofit is a DIFFERENT, narrower
  thing — scoped to one file, `plugins/tool-render/src/client.tsx` — settled
  with the owner on 2026-09-05. Do not conflate the two or treat C6b as
  having settled T9's own repo-wide question.

## Phase 1: Harness and guard friction — `pending`

## Tickets

- [ ] **Ticket H1: Guard rules for podman and the npm/pnpm cache.** Add
  `guards/podman.json` and `guards/npm.json` so podman runs and npm installs
  stop paying avoidable approval friction.

  **Evaluate:**

  - `podman ps` under the default workspace policy runs without an approval
    prompt
  - `npm install` and `pnpm install` without an explicit cache flag gain
    `--cache /tmp/dsh/npm-cache`, and an explicit `--cache` call is untouched
  - after `./sync.sh` both files exist under `~/.dsh/plugins/guards`
- [ ] **Ticket H2: sync.sh applies the aidos dsh patches.** Run aidos's
  `apply-dsh-patches.sh` after aidos install and after any dsh version change,
  treating a non-zero exit as a sync failure.

  **Evaluate:**

  - a clean `./sync.sh` leaves the sandbox patch present in the installed
    dsh-sandbox package
  - a second consecutive `./sync.sh` run reports the patch as already applied
    and exits zero
- [ ] **Ticket H3: Remove the stale mcp-manager state file.** Delete
  `~/.dsh/mcp-manager.json` and add the removal to sync.sh so old installs
  converge.

  **Evaluate:**

  - the file is gone after sync, and a second sync run does not recreate it
- [ ] **Ticket H4: Clear stale dsh-better-edit references.** Remove or rewrite
  comments and doc text that still name dsh-better-edit after its retirement.

  **Evaluate:**

  - `rg better-edit` across the repo returns no hits outside git history
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

  **Evaluate:**

  - hovering a truncated row label in the jobs panel shows the full text
- [ ] **Ticket C3: A resume_search card.** Render resume_search results as a
  structured card with one row per hit instead of raw text.

  **Evaluate:**

  - a resume_search call renders the card with hit source, seq, and teaser text
- [ ] **Ticket C4: resume_search excludes what is still in context.** Hits from
  nodes still on the live surface waste the reader's time; filter them.

  **Evaluate:**

  - a query that matches both compacted and live text returns only compacted
    hits
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

  **Evaluate:**

  - dragging an image onto the composer attaches it and the file lands under
    `/tmp/dsh`
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

  **Evaluate:**

  - an older list can be opened and inserted into the composer
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

  **Evaluate:**

  - the shot list names one entry per bundle plugin with a visible surface
- [ ] **Ticket G2: Capture the shots.** Screenshot each surface on a live
  session, before and after where it matters.

  **Evaluate:**

  - every row marked "needs a shot" has a `.webp` file, and no file is orphaned
  - `magick identify` reports a height of 720 for every shot
  - no shot exceeds 150 KB
- [ ] **Ticket G3: Write the gallery README.** A README section shows the
  shots with captions.

  **Evaluate:**

  - the main README links the gallery and every image renders
  - the main README carries a small selection, not the whole gallery

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
