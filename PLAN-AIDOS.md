# dotfiles-ai personal bundle: open work plan

The remaining open work for the dsh personal bundle, for aidos. This file
replaces PLAN.md, which is deleted in the same commit that writes this file.
Every ticket below is verified open against the tree as of 2026-09-05.

## Vision

Finish the bundle's open tickets: guard and sync friction, the remaining
tool-render cards, the attachment-drop transport, the pending browser-polish
fixes, the screenshot gallery, a fork-side fix, and two new tickets from a
live session today: a full audit of the bash-guard client-side surface, and
a design pass to unify error handling across every tool-render row.

## Critical context

- The repo is a personal dsh bundle. `sync.sh` installs plugins, guards,
  skills, and the web profile patch. Client plugins live under `plugins/`
  and build via `node build.mjs`; typecheck is `npx tsc --noEmit`; tests run
  with `pnpm exec vitest run plugins/<name>/`.
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
- One ticket (TypeScript and tests across the whole repo, old Effort 11 T9)
  is deliberately absent: it is unscoped and needs a design pass before it
  can carry criteria.

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
  model stops retrying the blocked write.

  **Evaluate:**

  - a blocked package.json write returns a message that names the script route
  - the message text lives in one place in plugins/manifest-guard.ts
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

  **Evaluate:**

  - grill the owner on the audit's exact deliverable (a written finding
    report, a fix list, or both) before dispatching any part of this
    ticket — it states the investigation's scope, not yet its own
    acceptance criteria

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
- [ ] **Ticket C6: Unify error handling across every tool-render row.**
  Asked for 2026-09-05: every registered card should have a properly wired
  error path and a properly wired body, and the contract should be strong
  enough that a new row missing either one fails loudly at typecheck time
  rather than silently shipping a blank or wordless card on failure — which
  is exactly what happened with the compaction card twice in one session
  before it was caught.

  **UNSCOPED, like the old Effort 11 T9. Grill the owner before planning
  it.** Open questions a grilling pass needs to settle:

  - What counts as "properly wired": every row must call `rowStateOf` (or
    an equivalent) and pass `state`/`errorSummary`/`errorText` to
    `toolRenderRow`, even when its own tool can never realistically error?
  - What does "unify" mean concretely: one shared row-building helper every
    row must go through, a lint rule, a TypeScript type that makes the
    error fields required on the options object, or something else?
  - "Loudly fail in the type system" needs a concrete mechanism proposal
    before it can be scoped: this file is currently loose JS-in-TS (`var`,
    no annotations, `tsconfig.json` has `strict: false` per the retired
    audit sweep), so enforcing this at the type level may require touching
    that convention, which is its own decision.
  - Does this ticket also require auditing every EXISTING row (there are
    upwards of twenty registered keys in `plugins/tool-render/src/client.tsx`)
    to find which ones are already missing a wired error path today, before
    designing the unification? That audit itself could be its own ticket.

  **Evaluate:**

  - not settled yet — grill the owner on the open questions above before
    this ticket carries real acceptance criteria

## Phase 3: Attachment transport — `pending`

- [ ] **Ticket A1: An attachment-drop plugin.** Replace dsh-paste-to-path with
  our own drop plugin that lands files under `/tmp/dsh`.

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
