# Effort 1 — harness friction: guards, aidos patches, attachment drop

## Vision

The zai provider work this effort started is shipped and its tickets are gone.
What remains is unrelated harness work: a `warn` verdict for bash-guard and the
two guard rules that need it, a sync step for the aidos dsh patches, our own
attachment-drop plugin, and one dsh-better-edit fix.

## Tickets

### T5 — bash-guard: add a `warn` verdict and additive rewrites

**Status:** open
**Why:** `experiments/tool-call-friction/README.md` measured 118 sandbox
failures that carry no `[sandbox: ...]` marker, plus 248 calls that escalated to
the mode the session already held. Guard rules cannot help yet. `GuardEntry` in
`plugins/bash-guard.ts` matches on command and subcommand name only, `reason`
reaches the model only on `deny`, and `rewrites` can only drop a flag.
**Change:** `plugins/bash-guard.ts` — add a `warn` verdict that runs the command
and still surfaces `reason` to the model, and add `rewrites[].add` that inserts
a flag only when it is absent.
**Acceptance criteria:**
- `pnpm exec tsc --noEmit` reports no new errors and `node build.mjs` rebuilds
  `plugins/bash-guard.js`.
- New cases in `plugins/bash-guard.test.ts`: a `warn` rule allows the command
  and returns the reason text; an additive rewrite inserts the flag when absent
  and does not duplicate it when already present.
- `pnpm test` passes.

### T6 — guard rules for podman and the npm/pnpm cache

**Status:** open. Blocked on T5.
**Change:** add `guards/podman.json` and `guards/npm.json`.
**Acceptance criteria:**
- The podman rule uses `warn`, names `/run/user/1000` and
  `sandbox_permissions: danger-full-access`, and still lets `podman ps` run. A
  `deny` here is wrong: it would break podman when the session already holds
  `danger-full-access`, because the guard gates bash calls independently of the
  sandbox mode.
- The npm rule adds `--cache /tmp/dsh/npm-cache` to `install` and `ci` when the
  flag is absent, and leaves an explicit `--cache` untouched.
- After `./sync.sh`, both files exist in `$DSH_HOME/plugins/guards`.
- Manual check: run `podman ps` under `workspace-write` and confirm the note
  reaches the model instead of a bare read-only error.
- Re-run `SINCE=<deploy-date> node experiments/tool-call-friction/scan-sandbox-friction.mjs`
  and confirm the opaque-failure count for podman and npm drops.

**Note:** these criteria are a proposal, not settled with the user yet. Grill
them before dispatching T5.



### T7 — sync.sh applies the aidos dsh patches

**Status:** open
**Why:** aidos needs one behavioral patch in the INSTALLED dsh tree: the fs sandbox
must exempt the aidos durable scratch root (`~/.dsh/aidos/scratch/<workspace-key>/`),
which the harness policy already allows in every phase but the sandbox layer still
denies (aidos ticket #60). Without it every scratch write that reaches the sandboxed
fs tools refuses with `FS_SANDBOX_DENIED`, including `scratch_edit`'s delegation to
`edit`. aidos now ships the patch as `patches/apply-dsh-patches.sh` (script
`patch:dsh`), idempotent and failing loudly on upstream drift — but nothing runs it,
and a dsh upgrade or an aidos reinstall wipes it.
**Change:** `sync.sh` runs the aidos patch script after installing or updating aidos,
AND after any dsh version change, since both wipe it. Resolve the dsh package root the
same way the script does (it defaults to the root behind the `dsh` binary), and treat a
non-zero exit as a hard failure of the sync, not a warning: a silent skip reproduces the
exact FS_SANDBOX_DENIED confusion the script exists to end.
**Acceptance criteria:**
- After a clean `./sync.sh`, `rg -c scratchRootForWorkspace` in the installed
  `@deepseek-ai/dsh-sandbox/lib/index.js` returns 1.
- Running `./sync.sh` twice in a row is a no-op for the patch (the script reports
  "already applied") and never fails on the second run.
- If upstream dsh changes the patched `writableRoots` block, `./sync.sh` fails with the
  script's own message naming the mismatch, rather than continuing.
- A scratch write from an aidos session succeeds after sync + restart, with no
  `FS_SANDBOX_DENIED`.

### T8 — our own attachment-drop plugin (replaces dsh-paste-to-path)

**Status:** open
**Why:** `dsh-paste-to-path` does the storage half well but owns the conversation half
in a way the user does not want: it injects a dock above the composer and its reference
codec expands each chip into path-instruction PROSE in the sent message. We want the
storage and the composer affordance without the prose, and we want the transport reusable
by other plugins — aidos's evidence modals (aidos #53) need exactly this to attach a
pasted screenshot and store the returned host path in an evidence payload.
**Verified facts (from reading the installed dsh-paste-to-path source; do not re-research):**
- Its host half is one route: `POST /paste-to-path` with `x-session-id`, `x-file-name`,
  `x-workspace` headers plus a binary body; it canonicalizes the workspace with
  `realpath`, writes under `<workspace>/.dsh/pastes/<category>/<timestamp>-<rand>-<name>`
  with mode `0600` and the `wx` flag, and answers
  `{id, sessionId, path, name, category, mediaType, bytes, editable}`.
- Its client half registers a composer dock Slot, listens on document `paste`/`drop`, and
  inserts a reference chip; the prose comes from DSH's reference codec at send time.
**Change:** a new plugin in `plugins/` with:
- Host: one route that writes under `<workspace>/.dsh/<drops-dir>/` and answers the path
  plus real metadata. Metadata should include image dimensions and a type description —
  derive them the cheap way (`file`, or an image-header read) rather than adding an image
  dependency.
- Client: composer paste/drop support WITH a preview card (the preview is for the human),
  but the text that actually enters the message is ONE minimal line, e.g.
  `attachment: /home/sid/repos/proj/.dsh/<uuid>.png image/png 1920x1080`.
- An exported client helper (e.g. `dropUpload(sessionId, workspace, blob) -> {path, ...}`)
  so another plugin can use the transport directly with no composer involvement at all.
**Acceptance criteria:**
- Pasting an image into the composer shows a preview card and, on send, the message
  carries exactly the one-line attachment reference — no dock prose, no codec expansion.
- The file lands under the workspace's `.dsh/` drops directory with a unique name, mode
  0600, and the response path resolves to it.
- A non-image file (pdf, log) works through the same path with its own metadata line.
- The exported helper uploads a Blob and returns the path with NO composer side effects,
  proving the transport is reusable.
- A workspace that does not exist, or a path escaping it, is refused with a named error.
- `node build.mjs`, `pnpm exec tsc --noEmit`, and `pnpm test` pass.

### T9 — retire dsh-paste-to-path and wire aidos to the drop transport

**Status:** open. Blocked on T8.
**Change:** drop the `dsh-paste-to-path` install and plugin-list entries from `sync.sh`
once T8 covers the same ground, and add the new plugin to both. aidos's README gains a
required-plugin note (it already has a "Required dsh patches" section for T7's script),
and aidos ticket #53 consumes the exported helper for its Verify-modal screenshot paste,
storing the returned host path in the evidence payload.
**Acceptance criteria:**
- After `./sync.sh`, `dsh-paste-to-path` is absent from the profile's node_modules and
  the plugin list, and the new plugin is present in both.
- Existing files already written under `.dsh/pastes/` are untouched — retiring the plugin
  is not a data migration.
- An aidos evidence modal attaches a pasted screenshot and the evidence payload carries
  the host path returned by the drop route.
- The aidos README names the plugin as required for evidence image attachment.


### T10 — dsh-better-edit: `edit` advertises sandbox escalation and silently drops it

**Status:** open
**Why:** hit live 2026-09-01 trying to edit a file outside the session workspace. The
`edit` tool answered `[sandbox: file access denied under workspace-write mode]` plus the
hint to retry with `sandbox_permissions`; retrying with
`sandbox_permissions: danger-full-access` and a justification produced the IDENTICAL
denial, with no approval prompt. That is an infinite loop by construction: the tool tells
the model to escalate and then ignores the escalation.
**Root cause (read in the installed fork build, `lib/`):**
- `tool-edit.js:84` calls
  `sandbox.resolvePolicy("edit", { path: resolvedPath, edits: req.edits }, exec)` —
  a FRESHLY BUILT object carrying only `path` and `edits`. The call's
  `sandbox_permissions` / `justification` are dropped on the floor.
- `sandbox.js` `resolvePolicy` opens with
  `if (args.sandbox_permissions === undefined || args.justification === undefined) return standingPolicy`,
  so `approveEscalation` is never reached, `ctx.approval` is never asked, and the standing
  `workspace-write` policy is stamped on the mutation.
- `mapError` then reports the denial with `policy.mode` — hence the message naming
  `workspace-write` even on the escalated retry, which is the tell.
- `tool-edit.js:58` DOES spread `sandbox.schemaFields()` into the parameters, so both
  fields are advertised to the model. They are inert.
- `tool-undo.js:54` passes `canonical` instead, and `contract.js` `normalizeRequest`
  explicitly re-attaches `sandbox_permissions`/`justification` after narrowing — so
  `undo_last_edit` escalates correctly. Only `edit` is broken; the working sibling is
  three lines away.
- `contract.js` `prepareEditArguments` has the same narrowing defect
  (`return { path: valid.path, edits: args.edits }`) and is a second way to lose the
  fields; check its callers while fixing.
**Change:** in our fork (`github:xyzshantaram/dsh-better-edit`, currently pinned at
`873b9fd53e71a8bbe587297944dbf4542ce7d64a`), pass the escalation fields through — the
minimal fix is to hand `resolvePolicy` the canonical request with the resolved path
(`{ ...req, path: resolvedPath }`) rather than a rebuilt pair. Then bump the pin in
`sync.sh` (`BUILD_SPECS` and the `pnpm_ins` line both carry it).
**Acceptance criteria:**
- A unit test asserts `resolvePolicy` receives `sandbox_permissions` and `justification`
  for an `edit` call that carries them — the regression is a dropped field, so the test
  must assert on the ARGUMENT, not only on the outcome.
- An `edit` outside the sandbox root with `sandbox_permissions` + `justification` reaches
  the approval path; approving it performs the write, and rejecting it fails the call with
  the rejection, never with the original denial marker.
- The unescalated denial message is unchanged for a call that carries no escalation.
- `undo_last_edit` behaviour is unchanged (it is already correct).
- The pin is bumped in `sync.sh` and `./sync.sh` installs the fixed build.

**Note:** this bug also silently punishes the model for doing the right thing — the harness
instructions say a denial should be retried once with `sandbox_permissions`, so the model
burns a call, gets the same denial, and has no way to tell a policy refusal from a dropped
argument. Worth checking whether upstream `@deepseek-ai/dsh-tool-fs` has the same shape.


### Known cause — rejecting an approval cancels the turn

NOT a defect in our `approval-comment` plugin. Recorded 2026-09-03 after a live
test, so nobody re-diagnoses it.

Rejecting an approval cancels the running turn and injects a fixed instruction.
The shipped `@deepseek-ai/dsh-user-approval/lib/index.js`, lines 215-226, calls
`agent.cancel({ kind: "user", reason: "approval-rejected" }, ...)` and delivers
the text `"The user rejected your approval request. Stop and explain what
happened. Do not retry the rejected action."` That cancel plus injected followup
is what makes the agent appear to stop and then restart.

There is no setting for it. `ApprovalPolicy` is only `'ask' | 'never'`, and the
early return at line 216 fires only under `'never'`, which auto-rejects every
request. The behaviour is hard-coded.

Changing it means shadowing that row, the same pattern as the compaction fork.
The owner deferred that on 2026-09-03.

Our `approval-comment` fix is unrelated and stands on its own: the steer used to
fire after the rejection resolved, so it reached an idle agent and started a new
turn, and the user's comment was wrapped in a generated instruction. The steer
now goes first and carries the comment verbatim.

## User preferences and special rules

- Never commit without explicit approval.

---

# Effort 2 — durable-todos plugin (concepts imported from dsh-todo-guard)

## Vision

A small dsh plugin, `durable-todos`, that keeps the session todo list visible and
usable across dsh restarts and across interrupts. The official `todos`
projection clears to `null` on `turn/start` and on nothing else (verified in
`dsh-tool-todo/lib/index.js:85-87`). An interrupted turn therefore keeps its
list only until the next message goes out, and the panel then blanks with items
still unfinished. A mirror that ignores `turn/start` fixes the restart case and
the interrupt case with the same mechanism. The official todo panel data path
stays untouched.
Upstream dsh-todo-guard solves persistence with a mirror projection that follows
official `todo/write` events but never clears at `turn/start`; we reuse that
concept with our own code, minus its evidence-verification half.

## Settled decisions (from grilling, 2026-09-01)

- Scope: minimal — persistence + panel + Remind button. No evidence badges, no
  strictMode, no settings card, no finalize flow.
- Storage: mirror projection `durable-todos/todos` via sessionProjections
  (last-wins on todo/write, never cleared on turn/start), riding the session
  projection cache so it restores with the session after restart.
- Panel: client dock at `conversation.input.dock`, order 10. ALWAYS visible:
  compact "no todos" state when the list is empty; buttons live in the dock
  header, so always-visible is what makes Remind reachable at any time.
- Remind: one button. When the list has pending/in-progress items, clicking it
  fills the composer with a verbatim list ("Reminder — unfinished todos:" +
  items) via `inputActions.setDraft` and submits immediately via
  `inputActions.submit()`. Disabled while the agent is mid-turn (submit is
  refused during a running turn). Hidden when the list has no unfinished items.
- Panel durability: host warms the projection snapshot on `session/created` and
  `agent/session-start` with 300ms/1500ms delayed re-warms, so the panel renders
  right after reopen/restart instead of waiting for the next todo write.
- Plugin name: durable-todos.
- REWORKED 2026-09-03. The hand-rolled panel was ugly, it rendered in ADDITION
  to the built-in one rather than replacing it, and it did not collapse. The
  fix was to feed the built-in panel durable data and wrap it.
- REVERSED 2026-09-03, later the same day. Wrapping the built-in panel cannot
  be done. `TodoDock` is a local function at
  `dsh-client-ui-conversation/lib/client.js:6554` and is absent from the package
  export surface (`lib/types/client/index.d.ts:16-23` exports only `apply`,
  `inject`, `ConversationController`, and types). So the panel stays
  hand-rolled. We style it properly and hide the shipped one with a CSS rule on
  its stable `data-testid="todo-panel"` hook. Owning the panel keeps the Remind
  button and the carried-over label with no compromise, at the cost of more
  front-end work, which the owner accepted.
- Disabling the shipped panel any other way is blocked. Starving the `todos`
  projection needs the `tool-todo` row disabled, but that row lives in the agent
  preset, and `editing-cordis-compositions` forbids forking a shipped preset.
  Same-id displacement is unverified for list slots: the SlotCore note in
  `plugins/tool-render/src/client.tsx` proves shadowing works for KEYED slots by
  priority, but `conversation.input.dock` is a list slot keyed by `id`/`order`,
  which is why both panels render today.
- The carried-over label SURVIVES the rework. The `todos` projection type is
  `TodoItem[] | null` with no room for a flag, so the flag moves to its own
  tiny projection key, `durable-todos/carried`, holding a boolean. Our wrapper
  reads both keys: it passes `todos` through to the built-in `TodoDock` and
  renders the badge itself.
- Carried-over marking (decided 2026-09-03, when the interrupt case was
  raised). A list that outlived the turn that wrote it gets a `carried over`
  label in the panel header. The alternative offered was to show the list
  plainly with no marker. Marking won because after an interrupt the mirror can
  still hold items the agent finished but never recorded, so an unlabelled list
  invites trust it has not earned. The projection carries the flag as
  `carriedOver`, set true by `turn/start` and cleared by the next `todo/write`.

### History and import (from grilling, 2026-09-03)

- WHY a steer is mandatory, not a design preference: the agent cannot read a
  projection, and `todo_write` REPLACES the whole list. An import the agent does
  not know about would be silently dropped by its very next write.
- History browsing lives in the EXPANDED panel: two chevron buttons step through
  past lists, with a label showing the timestamp each list was set.
- An edit-mode toggle. In edit mode you select items, which highlight, then
  press import.
- Only `pending` and `in_progress` items may be imported. Completed items are
  not selectable.
- Import sends a steer and nothing else. The panel does not change until the
  agent writes. It shows a spinner meanwhile.
- The spinner clears ONLY on the next `todo/write`. RISK, accepted by the owner:
  if the agent ignores the steer or the turn errors, the spinner never clears
  and the human must reload or re-import.
- The steer carries the selected items and tells the agent to use its best
  judgment merging them with the existing list. It does not prescribe statuses
  or duplicate handling.
- History rides the projection, bounded to the LAST 35 WRITES. Chosen over a
  per-turn bound and over a host route.
- CONFLICT to expect: `todo_write` rejects more than one `in_progress` item when
  `allowParallelInProgress` is false. Importing an `in_progress` item into a list
  that already has one is a conflict the agent's judgment has to resolve.

## Critical context

- The host bundle is about 708 KB because zod bundles into it. build.mjs marks
  only `@deepseek-ai/*` and `node:*` external. That matches `mcp-servers` at
  689 KB, so it is in line with this repo. The alternative, if it ever matters,
  is to mark `zod` external in the build entry and declare it as a real
  dependency of `plugins/durable-todos/package.json`, the way `subscriptions`
  handles `lz4`.
- The client half imports `TodoItem` and `DurableTodosView` from
  `./projection.js` with `import type`, so esbuild erases it and zod stays out
  of the 7 KB browser bundle. Verified by grepping the emitted client bundle.

## Verified API facts (do not re-research)

- Projection contract, re-verified 2026-09-03 against the installed packages.
  The earlier note here was WRONG: there is no `stateSchema` and no
  `wire: { viewSchema, view }` wrapper. The definition object is flat and every
  field is required:
  `register({ key, schema, init(): S, apply(state, event): S, view(state): V, stateVersion })`,
  returning a disposer (`dsh-session-projection/lib/types/index.d.ts:41-95,176`).
  `apply` is a synchronous pure function. `schema` is a zod `ZodType` and the
  engine calls `schema.parse(view(state))`
  (`dsh-session-projection/lib/index.js:109,183,221,267`). Acquire the service
  with `ctx.inject(['sessionProjections'], (pctx) => ...)`, exact service name
  `sessionProjections` (`dsh-tool-todo/lib/types/index.js:98-101`).
  `snapshot(session)` exists and returns `{ asOfSeq, values }`
  (`index.d.ts:199`).
- The agent CANNOT see the todo list except through its own transcript.
  `dsh-tool-todo` never touches `systemPrompt`. The only channel is the
  `todo_write` return value, which echoes the list plus counts back as the tool
  result (`dsh-tool-todo/lib/index.js:174-183`). Once compaction elides those
  entries the agent cannot recover the list, and tool results never occupy a
  checkpoint entry.
- A client plugin CANNOT read `todo/write` events. The client `Session` keeps
  `private events`, and only a windowed log slice
  (`dsh-client-runtime/lib/types/client/sessions/session.d.ts:47-49`). A
  projection is the only channel to the panel.
- A client plugin steers by injecting the `sessions` service and calling
  `sessions.binding(sessionId).session.prompt([{ type: "text", text }], "steer")`,
  the pattern `plugins/approval-comment/src/client.tsx` already uses.
- Dependencies: neither `zod` nor `@deepseek-ai/dsh-session-projection` was a
  repo dependency, contrary to the earlier note here. Both were added on
  2026-09-03: `zod` 4.5.4 as a runtime dependency (the host half bundles it,
  since build.mjs marks only `@deepseek-ai/*` and `node:*` external), and
  `@deepseek-ai/dsh-session-projection` as a devDependency for types.
- Version skew, deliberate: the registry `latest` tag for
  `@deepseek-ai/dsh-session-projection` is `0.0.1-rc.1`, while the dsh install
  runs `0.1.0-rc.8` and every other dsh devDependency here is `0.1.0-rc.8`. The
  package tool resolves `latest`, so the repo holds `0.0.1-rc.1`. The
  `ProjectionDefinition` type block is byte-identical between the two, checked
  with diff, so it typechecks against the runtime.
- Custom projection keys need declaration merging. `SessionProjectionMap` is an
  empty merge-extensible interface
  (`dsh-session-projection/lib/types/types.d.ts:16`). Follow the pattern in
  `dsh-tool-todo/lib/types/types.d.ts:12-20`:
  `declare module '@deepseek-ai/dsh-session-projection/types' { interface SessionProjectionMap { 'durable-todos/todos': View | null } }`.
  `TodoItem` imports from `@deepseek-ai/dsh-session/types`.
- `apply` MUST return the same state reference for events it ignores. An
  unchanged reference produces zero downstream work
  (`dsh-session-projection/lib/types/index.d.ts:51-53`).
- Event shapes: `todo/write` data is `{ todos: TodoItem[] }` where `TodoItem` is
  `{ content: string, status: 'pending' | 'in_progress' | 'completed' }`.
  `turn/start` data is `{ turn: number }`
  (`dsh-session/lib/types/types.d.ts:180-184,230-232,320`). The official `todos`
  projection returns `null` on `turn/start` and on nothing else
  (`dsh-tool-todo/lib/index.js:85-87`), so ignoring that one event is the whole
  of the persistence fix.
- Sessions warm events: `session/created` (session) and `agent/session-start`
  (payload.agent.session) both exist (todo-guard uses them with delayed re-warms
  at 300ms and 1500ms to cover log loading). `ctx.setTimeout` exists on host.
- Dock slot: `conversation.input.dock`, kind list, scope session, owner
  `InputZone { session, input }` (point-in-time snapshots, no subscription
  needed). Upstream registers `{ name, id: 'todo-guard-review', order: 10 }` —
  official todo panel keeps order 0, queue sits above at order 20.
- Standard session kit props for dock entries: `sessionId`, `useSession`,
  `useInput`, `inputActions`. `InputActions` = `{ setDraft(text), submit(),
  addImages, removeImage, pruneImages }`. submit() is refused by the input
  machine while a turn is running; `useInput` snapshot exposes the busy state.
- Client module shape (upstream, works on this host): `window.__ModuleLoader__
  .load({ id, factory: (require) => { ...; exports.inject=['slots']; exports
  .apply(ctx) } })`, plain JS, `react.createElement` only, styles injected with
  an id'd `<style>` tag, dsw tokens for all colors, kebab-case class names.
- Host module shape: ESM with `export const name/inject/apply` (same as our
  other host plugins). Inject `['sessionProjections']` (optional-safe via
  ctx.get) and `['sessions']` only if needed.
- Build: repo build.mjs bundles client halves with esbuild; add a build entry
  and a sync.sh copy/row for the new plugin. Client must NOT import packages
  unavailable in the browser bundle (upstream inlines its own react require via
  the module loader's `require('react')`).

## Tickets

### T5 — host: take over the todo tool and the `todos` projection

**SUPERSEDED 2026-09-03.** Dropped with the reversal above. The host keeps its
existing `durable-todos/todos` mirror projection and does not take over
`todo_write`. Kept here because the acceptance criteria still describe the
behaviour the mirror must preserve.

Disable the `tool-todo` row. Our host plugin registers `todo_write` with the
same parameter schema and description as `@deepseek-ai/dsh-tool-todo` (195
lines, worth copying faithfully because the model's behaviour depends on the
wording), plus TWO projections. First, `todos` under that exact key, holding
`TodoItem[] | null` and never clearing on `turn/start`, so the built-in panel
reads it. Second, `durable-todos/carried`, a boolean set true by `turn/start`
and cleared by the next `todo/write`, which carries the flag the `todos` type
has no room for. Replace the old `durable-todos/todos` projection with this
pair.

The built-in `TodoDock` then renders durable todos with no client work, so the
styling, the chevron, the progress line and the collapse all come for free.

**Acceptance criteria**

- `todo_write` accepts the same arguments as before and still rejects a call
  that marks several items in progress when `allowParallelInProgress` is false.
- After an interrupt and a new message, the built-in panel still lists the
  items.
- No duplicate registration of the `todos` projection key at boot.

### T6 — client: displace the built-in dock entry and keep Remind

**SUPERSEDED 2026-09-03.** Replaced by T7 below. The import this ticket depends
on does not exist.

Register at `conversation.input.dock` with id `todo` and order 0, the same id
the built-in uses, to displace it. Render the imported `TodoDock` from
`@deepseek-ai/dsh-client-ui-conversation`, passing the standard props through
untouched, and add two things of our own around it: the Remind button, and the
`carried over` badge driven by `useProjection("durable-todos/carried")`.
Delete the hand-rolled list markup and most of `client.module.css`.

RISK, unverified: this assumes a second registration at the same slot id
replaces the built-in rather than rendering both. The shipped types do not say.
Test it on the first restart. If both render, move Remind to
`conversation.input.left` or `.right` instead, which is what the dock's own
catalog doc says clickable elements are for, and drop the wrapper.

**Acceptance criteria**

- Exactly one todo panel renders, and it collapses.
- Remind still fills the composer with the unfinished items and submits.
- The `carried over` badge appears after a turn boundary and clears on the next
  write, which keeps the existing review-queue check valid.

### T7 — client: style the hand-rolled panel and hide the shipped one

The panel stays ours. Restyle it and make it collapsible. Registration does not
change: list slot `conversation.input.dock`, id `durable-todos`, order 10. The
host side does not change.

- Collapsible, and it starts collapsed. It never auto-hides. With no todos it
  still renders, collapsed, showing the compact `No todos` text.
- Remind and the `carried over` badge stay in the header at all times, collapsed
  or expanded. Remind still hides with nothing unfinished and stays disabled
  mid-turn.
- The collapsed header carries a counts summary: the total, then the non-zero
  status counts, for example `5 todos · 1 in progress · 3 pending · 1 done`.
- While a turn runs AND an item is in_progress, one extra line under the header
  shows that item's content, truncated to one line. It never shows when idle.
- Body markup mirrors `tool-render`, so the two read the same: a CSS-drawn
  checkbox plus content, with the status on a `data-done` / `data-active` /
  `data-pending` attribute. No text glyphs. No strikethrough on completed items,
  which use `--dsw-alias-label-tertiary` instead.
- The card mirrors the composer width: `width: 100%` with
  `max-width: var(--dsh-composer-card-max-width)`. No media queries, because the
  shipped panel uses none.
- One CSS rule hides the shipped panel: `[data-testid="todo-panel"]`.

**Acceptance criteria**

- Exactly one todo panel renders, and it collapses and expands.
- Remind fills the composer with the unfinished items and submits.
- The `carried over` badge appears after a turn boundary and clears on the next
  write.
- The panel body is visually indistinguishable from a `todo_write` tool card.
- The active-item line appears only while a turn is running.

**Risk.** The hide rule depends on the shipped `data-testid`. If an upgrade
renames it, the shipped panel returns. That failure is visible, not silent.

### T8 — an empty panel says "No work items"

DONE 2026-09-03, pending the owner's visual check.

The collapsed header rendered its counts summary only when the list had items,
so an empty panel read as a bare `To-do` title with nothing beside it. The
summary is now always rendered, and it reads `No work items` when the list is
empty.

**Acceptance criteria**

- With no todos, the collapsed header reads `To-do` then `No work items`.
- With todos, the counts summary is unchanged.

NOTE: the expanded body still reads `No todos` for its empty state. Align the
two if that reads oddly side by side.

### T9 — host: keep a bounded todo history in the projection

Not started. The mirror projection keeps the last 35 `todo/write` lists in its
state, each with the timestamp it was written, and publishes them in its view.
The current list stays exactly as it is today, so the panel keeps working
unchanged while T10 is unbuilt.

**Acceptance criteria**

- The projection publishes the current list plus up to 35 previous lists, newest
  first, each carrying its write timestamp.
- The 36th write evicts the oldest.
- The history survives a restart, the way the current list already does.
- No change to what the panel renders until T10 lands.

### T10 — client: browse history, select items, and import them

Not started. Depends on T9.

Two chevrons in the expanded panel step through history, with a label showing
when that list was set. An edit-mode toggle turns items selectable; selected
items highlight. Completed items are never selectable. An import button steers
the agent with the selected items, asking it to merge them using its own
judgment, and the panel shows a spinner until the next `todo/write` arrives.

Steering needs the `sessions` service added to this plugin's `inject`.

**Acceptance criteria**

- The chevrons walk back and forward through the retained lists, and stop at
  both ends.
- Each historical view shows the timestamp that list was written.
- Edit mode allows selecting pending and in-progress items only.
- Import sends one steer carrying the selected items, and changes nothing else.
- The spinner shows until the next `todo/write` lands, then clears.
- Leaving history returns to the live current list.

## Human review queue (shared, both efforts)

- [ ] After deploy restart: open a fresh session — durable-todos panel shows
  "no todos" state; run a todo write — items render; restart dsh-web and reopen
  the session — list survives.
- [ ] Interrupt: with unfinished todos on screen, interrupt the agent and send
  another message — the durable panel still lists the items after the new turn
  starts, while the official panel blanks as it does today.
- [ ] Carried-over label: after the interrupt check above, confirm the header
  reads `carried over`. Then let the agent write the list again in the new turn
  and confirm the label clears. This is the marking you chose over showing the
  list plainly.
- [ ] Remind button: click while idle — reminder message appears in the
  session; click during a running turn — button disabled.
- [ ] `/compact` appears in the slash autocomplete after the restart and runs
  on a long session.
- [ ] `rg -rln foo /tmp/dsh/file` gets a deny suggesting `rg foo /tmp/dsh/file`;
  `rg --replace x y file` runs untouched. Observed once on 2026-09-03: a
  `rg -rn --hidden -l` call was denied with the ambiguous-`-r` explanation and
  the suggested rewrite. The `--replace` half is still unchecked.
- [ ] Approval prompt: trigger one and confirm the card shows a 3px orange
  outline and no 1px warn border.
- [ ] After the next sync and restart: log in normally, and confirm `/compact`
  still appears in the slash autocomplete.

# Retired — MCP roster (Effort 3). Live notes only.

The effort is gone: commit `c7b9734` removed `dsh-mcp-manager`, `sync-mcp.py`
and the static `dsh-mcp-client` rows. These four facts still describe live
behaviour, so they outlive it.

- A patch row id must be unique across every bundle layer. `dsh-base` already
  mounts `command-compact`, and `dsh-web-app` then disables it, because the web
  app moves the compaction backend into the preset plane. An `insert:` row that
  reused that id killed boot with "duplicate loader entry id: command-compact"
  and blocked login. To re-enable an existing row, write a top-level override
  (`- id: <id>` plus `disabled: false`), never an insert. The `remote` row
  carries the same warning.
- `step_write_web_patch` writes an UNQUOTED heredoc, so `$var` and backticks
  expand. Never put backticks in a comment inside it.
- sync.sh has no restart step. It prints a "Restart dsh web" reminder at the end.
- easyeda exposes no project-list tool, and the bridge advertises no
  `project.list` capability. Every tool reads the document EasyEDA Pro has
  focused, so a project must be open in the editor first.

# Effort 4 — our own MCP manager plugin

## Vision

One plugin owns every MCP server. It replaces both the static `dsh-mcp-client`
rows and the vendored hyqhyq3 manager. The official MCP SDK supplies both
transports and the whole OAuth flow, so the plugin stays small. The SDK follows
the `resource_metadata` pointer that hyqhyq3 ignores, which gives zepto a real
chance to authenticate for the first time.

## Settled decisions (from grilling, 2026-09-02)

- The plugin owns all seven servers and both transports. stdio: nostrbook,
  gitlab, easyeda, blinkit, and zepto through `npx -y mcp-remote`. http with
  OAuth: swiggy-food and swiggy-instamart. zepto tried the direct http path
  first, and its own auth server refused our dynamic client registration.
- Config is `mcp-servers.json` in this repo, in the Claude and Codex
  `mcpServers` shape. sync.sh copies it to `$DSH_HOME` on every run. Git owns
  the file. The panel never writes it.
- The panel is one English Settings section. It lists every server with status
  and tool count and offers Authenticate on OAuth servers. No add, edit or
  delete.
- OAuth tokens live in their own `$DSH_HOME` file, never in git and never in
  the roster file.
- Public tool names stay `mcp__<name>__*`. This is a hard constraint: the
  expense-split skill names `mcp__blinkit__*`, `mcp__swiggy-food__*` and
  `mcp__zepto__*` directly.
- Rejected: vendoring and translating hyqhyq3. Rejected: Js2Hou, dsh-toolkit,
  dsh-skill-mcp-panel, dsh-mcphub and EricXu20266/dsh-mcpmanager. All five are
  visual editors for `cordis.patch.yml` that delegate to `dsh-mcp-client`, so
  none can perform a browser login, and all of them write the file sync.sh
  regenerates.

## Verified API facts (do not re-research)

@modelcontextprotocol/sdk 1.30.0 ships with the dsh install.

- `StdioServerParameters` = `{ command, args?, env?, cwd?, stderr?, maxBufferSize? }`.
- `StdioClientTransport` spawns with `{ ...getDefaultEnvironment(), ...params.env }`,
  so passing an empty `env` is safe. On POSIX the inherited allowlist is only
  HOME, LOGNAME, PATH, SHELL, TERM and USER. That is enough for npx, and for
  glab, which reads its token from `~/.config/glab-cli/config.yml` and so needs
  only HOME. A server needing anything else, for example XDG_CONFIG_HOME, must
  name it explicitly in the roster `env` block.
- Testing note: a smoke test that spawns an `npx` server fails inside the agent
  sandbox, because `~/.npm/_cacache` is read only there, and the child dies with
  "MCP error -32000: Connection closed". This is not a code fault. dsh web runs
  unsandboxed and npx works there. Use a local binary such as `glab` for smoke
  tests, or set `npm_config_cache`.
- `StreamableHTTPClientTransport.finishAuth(authorizationCode)` exchanges the
  code for tokens. Keep the transport instance alive to call it after the
  browser redirect, then reconnect.
- `OAuthClientMetadata` requires only `redirect_uris`. Everything else,
  including `client_name`, `grant_types`, `response_types` and
  `token_endpoint_auth_method`, is optional.
- The OAuth `redirect_uri` must carry the browser's exact origin, port included.
  A guessed default such as `http://127.0.0.1` produces a callback on port 80
  that no browser can reach. The host therefore keeps the origin empty until a
  request arrives, and defers any http login until then. Covered by
  `connect.test.ts`.
- The callback must compare the OAuth `state` against a value this host stored
  when it started the login. Without it, another page can steer the browser to
  the callback with a foreign code and bind that account here. Covered by
  `callback.test.ts`.
- The token store loads the file once at apply time and writes the whole object
  back. Nothing else may edit `mcp-oauth.json` while dsh web runs.
- `StreamableHTTPClientTransport` options include `authProvider`, `requestInit`,
  `fetch`, `reconnectionOptions`, `sessionId`. With `authProvider` set it tries
  the stored token, refreshes it when expired, and calls
  `redirectToAuthorization` then throws `UnauthorizedError` when a login is
  needed.
- `auth(provider, { serverUrl, authorizationCode?, scope?, resourceMetadataUrl?, fetchFn? })`.
- `OAuthClientProvider` members: `redirectUrl`, `clientMetadata`,
  `clientInformation()`, `saveClientInformation?()`, `tokens()`,
  `saveTokens()`, `redirectToAuthorization()`, `saveCodeVerifier()`,
  `codeVerifier()`, optional `state()` and `clientMetadataUrl`.
- Discovery helpers: `extractResourceMetadataUrl(res)`,
  `discoverOAuthProtectedResourceMetadata`, `discoverAuthorizationServerMetadata`,
  `registerClient`, `startAuthorization`, `exchangeAuthorization`,
  `refreshAuthorization`.

DSH host plane:

- `inject = ['tools', 'webServer']`.
- `ctx.tools.register(definition)` returns a disposer. Definition shape, taken
  from dsh-mcp-client `createDefinition`: `{ name, description, parameters,
  output: { schema, render(args, value) }, execute, finalizeContent? }`.
- `ctx.webServer.register({ kind: 'prefix', path: '/<prefix>', async handler(req, res) })`.
  Derive the browser origin from `req.headers.host`, never hardcode it.
- A local plugin package needs three separate wiring points, or it builds and
  never mounts: a `build.mjs` entry, a `pnpm_ins "$HERE/plugins/<name>"` line in
  `step_install_plugins`, and a matching entry in the `expected` array. The
  package's own `cordis.patch.yml` alone does nothing until the package is
  installed into the profile.

DSH client plane:

- `inject = ['slots']`, then
  `ctx.slots.inject('settings.section', () => ctx.slots.register({ name: 'settings.section', id, order, label }, Component))`.
- build.mjs `wrapClientBundle(src, out, id)` wraps a client half, so our source
  may use TSX. See the approval-comment and profiles-client entries.

## Tickets

### Closed — the zepto verdict, kept for the roster choice it explains

The OAuth work is done. The zepto measurement stays here, because it explains a
roster choice that would otherwise look arbitrary.

**Verdict, measured 2026-09-02 against the live endpoints.** swiggy-food reaches
`needs-auth` and produces a complete authorization URL: PKCE `S256`,
`client_id=swiggy-mcp`, and the correct redirect back to this host. zepto fails
earlier, at dynamic client registration on `https://auth.zepto.co.in`, with a
plain nginx `403 Forbidden` page. The SDK does follow the `resource_metadata`
pointer and does find the right authorization server, so discovery is not the
problem: registration itself is refused. curl was refused the same way, with and
without a browser user agent, so this is not a user-agent filter.

Decision, 2026-09-02: zepto goes back to the `npx -y mcp-remote` stdio hop it
used before. mcp-remote carries its own client registration, so it never needs
the registration our SDK is refused. Its OAuth callback still binds to the server
loopback, so that login must be finished from a browser on the server itself, not
from a remote browser.

### T1 — remove the stale mcp-manager state file

Every code change for T4 and T5 is done. One host-side leftover is not: delete
`~/.dsh/mcp-manager.json` after the next sync. sync.sh does not remove it,
because the file holds the OAuth tokens of a plugin that is now uninstalled, and
deleting a secrets file behind the user's back is worse than leaving it.

**Eval:** after the next sync and restart, the journal shows no `mcp-manager`
row, and no tool name is registered twice.

---

# Effort 5 — dsh-compaction-instant fork

## Vision

Fork `dsh-compaction-instant` and fix the defects that make automatic compaction
fail on this machine. Today the engine compiles a checkpoint, refuses it because
it is not smaller than the span it would replace, and repeats that on every
pre-step. The context never shrinks. The fork lives at
`github.com/xyzshantaram/dsh-compaction-instant` and sync.sh pins it by commit,
the same pattern as dsh-better-edit and dsh-remote.

## Settled decisions (from grilling, 2026-09-02)

- Fork base is `f6f300f`, the commit npm published as 0.1.4. The `v0.1.4` git
  tag is stale: it points at `03a5346`, three commits earlier, and its source
  does not match the published tarball.
- `main` HEAD is unusable here. Commit `28107e6` imports
  `@deepseek-ai/dsh-util-values`, which dsh 0.1.0-rc.7 does not ship. Revisit it
  when dsh reaches 0.1.2.
- The two Chinese checkpoint lines become English.
- The shrink gate keeps a bounded retry at a tighter cap before it throws.
- The install stays under the alias `@deepseek-ai/dsh-compaction-basic`. A
  direct install under the real package name activates the package's own bundle
  patch, which inserts rows the web patch already inserts, and boot dies on a
  duplicate loader entry id.

## Verified API facts (do not re-research)

The fork clone is `/home/sid/repos/dsh-compaction-instant`, branch
`fix/retention-and-shrink-gate`, based on `f6f300f`. `pnpm test` runs
`node --test`. Peer deps install with plain `pnpm install`. The suite was 99
passing at the base commit and is 103 passing on the branch.

## Critical context

- Measured from the journal, every failure has a constant delta of about 164
  tokens between the framed checkpoint and the span. That is the fixed framing
  cost: preamble, `RECALL:` guide, header, tags. The compiled body was the same
  size as its source, so the compiler saved nothing on those spans.
- Root cause of the tiny spans: in 0.1.3 the retention loop stops as soon as the
  accumulated tail reaches `retainTokens`, so one oversized node satisfies the
  whole budget by itself and is retained verbatim. Everything before it becomes
  the compactable head, which can be a few hundred tokens while the session sits
  above the pressure threshold. The tokens causing the pressure are exempt.
- The compiler counts tokens with its own regex tokenizer, but the gate prices
  with `ctx.tokenMeter.estimateMessage`. A cap expressed in compiler tokens is
  not a guarantee at the gate. That is why the retry exists.
- Automatic failures are soft: `agent/pre-step` catches and logs `step
  compaction failed: ...; continuing the turn`. A manual `/compact` surfaces the
  same fault as a `summary` failure.
- Edit this fork from the primary session. The clone at
  `/home/sid/repos/dsh-compaction-instant` sits outside the session workspace,
  and subagents cannot write there. A dispatched coder was denied, and its one
  sanctioned escalation retry was refused outright, so it could only hand back
  code for the parent to apply. Two faults compound here. The `edit` tool also
  drops its own escalation (see Effort 1, T10), so only `bash` escalation
  reaches that path, and every source change in this fork went through a
  `python3` exact-string replacement instead of the edit tool.
- The four defects from the 2026-09-03 checkpoint-destruction report are fixed and
  pinned at `9525c72`: a checkpoint entry is now elided last, the worth gate
  counts `compilableTokens` (span minus checkpoint nodes minus tool-result
  nodes), and `effectiveMaxTokens` floors the cap at the incoming checkpoint's
  own size.
- `@deepseek-ai/dsh-compaction-tool-result-pruner` was considered and REJECTED.
  Its purpose was to stop tool results dominating a span, and `compilableTokens`
  now does that at the gate instead. The retained tail cannot hoard a giant tool
  result either, because the selection loop only keeps nodes that fit under
  `retainTokens`, so an oversized node falls into the compactable span. Pruning
  would rewrite the middle of tool results still on the live surface, which the
  model is actively reading, and DSH already truncates long tool output at the
  tool layer. Do not install it without new evidence.
- `scripts/unshadow-compactions.py` rewrites a stored checkpoint's `surfaceOp`
  from `replace` to `"append"`, which un-shadows a compaction and restores the
  original conversation. A session log that shows a compaction checkpoint with
  `surfaceOp: "append"` was almost certainly rewritten by that script and is not
  evidence of a compaction bug. Two hours were lost to that confusion once.

## Tickets

### T1 — translate the settings card in `src/client.js`

The Settings and Plugins card for this engine still renders in Chinese
(`title: "即时压缩"` and its field labels). The checkpoint framing is already
English. This is upstream text, not a regression, and it was deliberately left
out of the first commit.

**Eval:** the card reads in English in Settings and Plugins, `pnpm test` stays
green, and the pin in sync.sh moves to the new commit.

## Human review queue

- [ ] Compaction on a real long session — run sync.sh, restart dsh-web, then
      watch `journalctl --user -u dsh-web.service -f | rg compaction` across a
      working session. Expect `compaction (step pressure): shadowed N surface
      nodes` lines that commit, and no repeating `step compaction failed` line.
- [ ] Checkpoint readability — expand one compacted checkpoint row in the web UI
      and confirm the English framing reads correctly and the entries are useful.
- [ ] MCP panel after sync and restart: open Settings and find the MCP section.
      It must list all seven servers. nostrbook, gitlab, easyeda, blinkit and
      zepto should reach connected with a tool count. swiggy-food and
      swiggy-instamart should show needs-auth with an Authenticate button.
- [ ] Click Authenticate on swiggy-food, finish the browser login, and confirm
      the row reaches connected. Then restart dsh web and confirm it reconnects
      with no second login.
- [ ] Call one `mcp__easyeda__*` tool after the cutover. The static patch row is
      gone, so this proves the new plugin replaced it with no loss.
- [ ] Check the journal for a duplicate tool registration. Two registrars for
      one server name was the risk the cutover removed.
- [ ] zepto only: its mcp-remote login opens a callback on the server loopback,
      so finish that one from a browser on the server itself.

# Effort 6 — job viewer: clickable job rows and an output modal

## Vision

The session header lists background jobs but the rows do nothing. Reading a
job means asking the agent to call `job_output`. This effort makes each row
clickable and shows that job's output in a modal, so a long command can be
watched from any device, including a phone over dsh-remote.

## Settled decisions (from grilling, 2026-09-03)

- No tmux. It re-parents the command onto the tmux server, outside the argv
  that `ctx.sandbox` wraps, and the workspace-write policy is doing real work.
  The attach-from-a-laptop-terminal case is dropped on purpose. The modal
  replaces it and also works from a phone, which tmux never would have.
- For an interactive command the agent must drive, use the shipped
  `dsh-tool-bash-persistent` over the PTY seam. That is a separate one-row
  change, not part of this effort.
- A host plugin becomes the SOLE consumer of job output. It polls each running
  job and buffers the deltas.
- The plugin replaces the three model tools so they read from that buffer.
  Side effect worth keeping: `job_output` stops being one-shot and the agent
  can re-read a job.
- The client half replaces the shipped dropdown rather than adding a second
  button next to it.

## Verified API facts (do not re-research)

Paths are relative to the dsh install at
`.../lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/`.

- Service name `jobs`, type `JobRegistry` (`dsh-jobs/lib/types/index.d.ts:8`).
  Methods `start`, `list`, `get`, `read`, `kill`, `wait`, `onJobDone`,
  `onJobsChanged`, `attachController` (`index.d.ts:47-118`).
- `JobSnapshot`: `id` (`<kind>-N`), `kind`, `label`, `status`
  (`running | stopping | completed | killed | failed`), `detail?`, `startedAt`,
  `finishedAt?`, `reported`, `ownerSession?`, `outputLimitBytes?`
  (`dsh-jobs/lib/types/types.d.ts:46-81`).
- THE CONSTRAINT: `JobRead` is `{ text, snapshot }` and `text` is the consuming
  delta since the previous read, with ONE cursor, not one per caller
  (`types.d.ts:121-130`). Whoever reads first takes it. This is the whole
  reason the plugin must own consumption.
- The client cannot read output today. The wire frame is `session/jobs` with
  `jobs: JobView[]` (`dsh-host-apiproxy/lib/types/api/events.d.ts:124-127`),
  mirrored last-wins into `jobsBySession`
  (`dsh-client-runtime/lib/types/client/sessions/service.d.ts:82`), read with
  `useSessions((s) => s.jobsBySession[sessionId])`. `JobView` carries `id`,
  `kind`, `label`, `status`, `detail?`, `startedAt`, `finishedAt` and NO output
  field. "The live records never cross the wire"
  (`dsh-host-apiproxy/lib/types/api/jobs.d.ts:3-5`).
- The dropdown is `JobListAction`
  (`dsh-client-ui-jobs/lib/types/client/JobListAction.d.ts:12`), registered at
  `conversation.session.header.actions`, entry id `job-list`, order 20
  (`dsh-client-ui-jobs/lib/client.js:266-272`). Rows are `<li>` with no
  `onClick` (`client.js:264-286`). The slot is `kind: list`, `scope: session`
  (`dsh-client-ui-conversation/lib/types/client/contract/slots.d.ts:86-90`).
- `Modal` comes from `@deepseek-ai/dsh-client-ui-primitives`, which the web
  boot injects as a static module into every dynamic client package. Props:
  `{ open, onClose, title, closeLabel, description, children, footer,
  className, contentClassName, headless }`. It portals to `document.body` with
  a mask, `role="dialog"` and Escape handling.
- The model-facing tools live in `dsh-tool-jobs`, mounted as row `tool-jobs` in
  `config/agent-presets/standard/agent.cordis.yml:73-74`.
- The host route pattern already used in this bundle is
  `ctx.inject(["webServer"], ...)`, see `plugins/log-viewer/src/index.ts:75`.
- `JobKindMap` is merge-extensible by declaration merging
  (`dsh-jobs/lib/types/types.d.ts:19-24`), the same shape as
  `SessionProjectionMap`.
- The subprocess layer keeps a bounded tail in memory and spills past
  64 MiB per stream (`dsh-subprocess-local/lib/types/index.d.ts:88-90`).

## Tickets

### T1 — host: the output buffer and its poller

A per-job append buffer with a byte cap and a retention window for finished
jobs. A poller reads every running job on a timer and appends the delta.

**Acceptance criteria**

- Vitest covers: deltas accumulate in order, the cap drops the oldest bytes,
  and a finished job keeps its output for the retention window.
- The poller stops for a job once it reaches a terminal status.

### T2 — host: replacement tools and the output route

Replacement `job_list`, `job_output` and `job_kill` reading from the buffer,
plus an HTTP route serving one job's buffer to the browser.

**Acceptance criteria**

- The three tools return what the agent expects, including a job that finishes
  between two reads.
- With the modal open and polling, an agent `job_output` call on the same job
  still returns the full output with no gap. This is the regression that
  matters, so it gets its own test.

### T3 — client: the replacement dropdown and the modal

Own entry at `conversation.session.header.actions`, rows clickable, click opens
`Modal` showing that job's buffer.

**Acceptance criteria**

- The header shows one jobs button, not two.
- Rows render dot, kind, label, status and duration as before.
- The modal fetches and displays output, and refreshes while the job runs.

### T4 — wire-up and deploy

Disable the `tool-jobs` row and the `dsh-client-ui-jobs` row. Add the build
entries and the sync.sh install.

**Acceptance criteria**

- `./sync.sh` exits 0 and the journal shows no duplicate tool registration for
  `job_output`, `job_list` or `job_kill`.

## Human review queue

- [ ] Start a long background command. Open the dropdown, click the row, and
      watch output arrive in the modal.
- [ ] While that modal is open and polling, have the agent call `job_output` on
      the same job. It must see the full output, not a gap.
- [ ] Confirm the header shows one jobs button and the rows still read the way
      they did before.
- [ ] Open the modal from the phone over dsh-remote and confirm it loads.


# Effort 7 — tool-render: error styling and image tool cards

## Vision

`read_image` and `see` tool calls render as generic cards today. The image
itself never appears, and the `see` description comes back as plain dumped text.
Make both cards show the image and present their text well.

## Requested scope (verbatim, 2026-09-03)

> add tool-render ticket: make read_image and see tool calls embed the image,
> click to open enlarged preview modal, and make see also show the description
> that the subagent returned in a pretty way, and make read_image display
> metadata in a pretty way too

## Critical context

- A bash-guard approval outlines the bash card and the approval card in electric
  blue (`#00b7ff`), against orange for a sandbox escalation. The bash card mark
  is DELIBERATELY temporary and the owner accepted that. `ConversationSnapshot`
  carries no approval history, `ToolCallOwnerProps` has no approval field, and
  `approval/asked` is host-side log-only, so the only reachable signal is
  `snapshot.pending`. Once the approval is answered the record leaves `pending`
  and the card looks ordinary again. Making it permanent needs a host mirror
  projection, the pattern `durable-todos` uses. Do not file this as a bug.
- bash-guard is identified by its reason text starting with `bash-guard:`. Both
  approval kinds arrive through the same frame, so there is no structural field
  to test. Changing `DEFAULT_ASK_TEMPLATE` in `plugins/bash-guard.ts` breaks
  both outlines.
- The plugin is `plugins/tool-render`. It shadows shipped per-tool rows by
  registering the same key of `tool.call.toolview` at priority -100. Keyed slots
  sort ascending and the lowest live entry renders. A same key at a different
  priority never throws. See the header comment in `src/client.tsx`.
- `SlotCore.register()` DOES throw when a second entry declares the same child
  slot name, so shadow rows, never slot declarations.
- Effort 6 needs an output modal for background jobs. This effort needs NO modal
  at all, because clicking opens a new tab. Nothing is shared between them, and
  nothing here blocks Effort 6.

## Settled decisions (from grilling, 2026-09-03)

- BOTH cards embed from the T2 route, by file path. REVISED 2026-09-03, after
  the attachment path proved closed to plugins: `previewUrl` is only
  `URL.createObjectURL(file)` for composer picks
  (`dsh-client-ui-conversation/lib/client.js`), `dsh-client-ui-attachment`
  exports no React components on purpose, and `ImageAttachmentRef.attachmentId`
  is documented "never a filesystem path or bearer URL". A plugin therefore
  cannot turn a stored attachment into an image source. Both tools carry a path
  in their arguments, so one route serves both.
- COST, accepted: if the file moved or was deleted since the call, the route
  404s where the attachment would still hold the bytes. The card MUST show a
  broken-image state, not an empty box. Screenshots under `/tmp/dsh` are the
  realistic case.
- `see` needs a host route. It returns only text, and its image exists solely as
  a path on the call. REJECTED: reusing the child's own `read_image` attachment.
  `see` returns no child session id and no attachment ref, and it disposes the
  child run immediately in a `finally` block, so nothing survives to reference.
- The route allows ANY path, deliberately. It validates that the target really
  is an image, and does nothing else. RESIDUAL RISK, accepted by the owner: the
  route is a separate surface from the tool gate, so any local process that can
  reach the dsh web server can read any image on the machine.
- The image shows in the EXPANDED body only. Collapsed rows stay one line, so a
  transcript full of image calls stays compact.
- `read_image` row reads filename, dimensions, size. Its body reads filename,
  mimetype, full path. Filename therefore appears twice, because the summary row
  stays visible while expanded. Accepted.
- `see` row reads the QUESTION, not the image path. Its body is ordered
  description, then image, then path.
- The description renders through `MarkdownText`, reusing the existing
  `.tool-render-subagent-prompt` typography, and carries a see-more clamp. The
  clamp exists so a long answer cannot bury the image below the fold.
- Card height is bounded and the card interior is ONE scrolling area. No nested
  scrollers. The whole image need not be visible at once.
- Image sizing: capped to the card width, natural aspect, NEVER upscaled past
  natural size, and centred when it is narrower than the card.
- NO modal. Clicking the image opens its route URL in a NEW BROWSER TAB, which
  is why the route must serve a real `http` URL. This replaced a fitted preview
  with a 1:1 toggle, and it removes the only reason this effort needed a modal.
  The shipped `ImageLightbox` in `dsh-client-ui-attachment` could not have been
  reused in any case: it is not exported from either entry point.

OPEN, a detail rather than a decision: the see-more clamp height. Proposed 8rem,
about six lines. Change it if it reads wrong.

## Verified API facts (do not re-research)

- `read_image` returns TWO content blocks: a text block holding
  `<path>...</path>` and `"<mediaType> image, <width>x<height> px, <bytes>
  bytes"`, plus the image block itself
  (`dsh-tool-fs/lib/index.js:854-856,918-935`). The attachment ref carries
  `mediaType`, `width`, `height`, `bytes`, and an optional `name`.
- `see` takes `{ image, question }` and returns the child's prose only. It
  already declares
  `presentCall: { card: "generic", title: "Look at an image", kind: "read", rawInput: args.image }`
  (`plugins/see.ts:141-152,222-227`), so the path ALREADY reaches the client. The
  card needs the bytes, nothing more, and `see.ts` needs no change.
- `MarkdownText` comes from `@deepseek-ai/dsh-client-ui-primitives`, already in
  use at `plugins/tool-render/src/client.tsx:156`.
- `.tool-render-subagent-prompt` is the existing capped, scrollable markdown
  block: `max-height: 16rem; overflow-y: auto` plus full typography for
  headings, paragraphs, lists, `pre` and inline code
  (`plugins/tool-render/src/client.module.css:475-512`).
- Routes register through `ctx.inject(["webServer"], ...)`, the pattern
  `plugins/log-viewer/src/index.ts:75-77` already uses.

## Tickets

### T2 — host: an image route

Not started. Ships nothing visible on its own, which the owner accepted when
choosing to split by layer.

A host route in `plugins/tool-render` that takes a local path and streams the
image bytes, registered through `ctx.inject(["webServer"], ...)`. It serves BOTH
`read_image` and `see`, and it accepts any path. It must return a real `http`
URL that a browser tab can open directly. It must confirm the target is a real image rather than serving arbitrary
bytes, and it must fail cleanly on a missing or unreadable file so the card can
show a broken-image state instead of hanging.

**Acceptance criteria**

- The route returns the bytes and a correct content type for a real image.
- It refuses a path that is not an image, and it does not leak file contents in
  the refusal.
- A missing or unreadable file produces a clean error, not a hang.

### T3 — client: the read_image and see cards

Not started. HARD dependency on T2: both halves embed from the route.

Both cards shadow their tool key on `tool.call.toolview` at priority -100, the
way every other row in this bundle does.

`read_image`: row reads filename, dimensions, size. Body embeds the image from
the T2 route, then filename, mimetype and full path.

`see`: row reads the question. Body renders the description through
`MarkdownText` with the see-more clamp, then the image from the T2 route, then
the path.

Shared: bounded card height with one interior scroll area, image capped to card
width at natural aspect, never upscaled, centred when narrower. Clicking the
image opens its route URL in a new browser tab. A path the route cannot serve
renders as a broken-image state, never as an empty box.

**Acceptance criteria**

- A `read_image` call shows the image, and the row reads filename, dimensions
  and size.
- A `see` call shows the question on the row, and the description above the
  image in the body.
- A long description is clamped, and see-more reveals the rest in place.
- A tall image scrolls within the bounded card, and never stretches.
- An image narrower than the card is centred, not upscaled.
- Clicking the image opens it in a new tab at its route URL.
- A moved or deleted file renders as a broken-image state, not an empty box.

## Human review queue

- [x] Errored tool calls — 2px red outline, no fill, no bar, enlarged red dot
      while collapsed, click expands and collapses, collapsed row reads tool
      name plus error message. Confirmed 2026-09-03.
- [x] bash-guard approvals — the approval card and the bash call card both
      outline electric blue, and the bash card returns to normal once the
      approval is answered, as designed. Confirmed 2026-09-03.

---

# Effort 8 — context meter: a heuristic ring with provider meta on hover

## Vision

The composer's context ring reports a number that only ever grows, so it cannot
be used to decide when to compact. Replace it with a ring driven by what DSH is
about to send, and move the provider's own claims into the hover panel where
they can be read as provider claims rather than as truth.

## Critical context

- The `meridian` provider returns `cache_read_input_tokens` as a session
  cumulative value, not a per-request value. Verified over 70 consecutive calls
  in session `67464291-...-4b5ec7`: `cache_read` on request N equals the
  cumulative total of request N-1, exactly, with zero mismatches, and the totals
  never fall.
- `@earendil-works/pi-ai` 0.82.1 does not accumulate. `dist/api/anthropic-messages.js`
  builds a fresh zeroed `usage` per `stream()` call and only ever assigns, never
  adds. The fault is the provider's, not the adapter's.
- Compaction itself is correct and reaches the wire. Measured at the `llm/stream`
  waterfall across one `/compact`: 153 messages and 468,921 bytes fell to 16
  messages and 73,162 bytes.
- The compaction trigger is already immune. `dsh-compaction-instant/src/index.js`
  compares `measurement.surfaceTokens` at lines 806, 811 and 818, which is the
  heuristic surface fold, not provider usage. Do not change it.
- Still unresolved, and it decides money rather than pixels: either Meridian's
  bookkeeping is wrong, or Meridian keeps its own server-side history and really
  is sending the model the full transcript. Compare a Meridian invoice against
  these numbers to tell them apart.

## Settled decisions (from grilling, 2026-09-03)

- Ring numerator is the heuristic prompt size, so it stays provider agnostic.
- Ring denominator is the route's context window.
- The hover panel has two titled halves, the true prompt size first and the
  provider's claims second, each with its own total.
- The shipped meter is hidden with injected CSS. The owner accepted that this
  couples us to shipped markup.
- If hiding fails, still render ours and log a warning. Two rings is the
  acceptable failure, a missing fix is not.
- Build it as a dynamic Cordis client package first, iterate on it live, then
  port the same code to a tracked plugin.

## Verified API facts (do not re-research)

- `useProjection("contextBreakdown")` returns
  `{ systemTokens, toolsTokens, messageTokens }`. `messageTokens` rides the
  surface fold, equals `measure().surfaceTokens`, and shrinks on compaction by
  the logged shadow price. `systemTokens` and `toolsTokens` are re-estimated on
  each `request/header`. Source: `dsh-token-meter/lib/index.js:153-190`.
- `useProjection("contextPressure")` returns `{ contextWindow?, pressureTokens?, projectedTokens? }`.
  `pressureTokens` is the contaminated provider figure. `contextWindow` comes
  from `request/context` and is independent of usage.
  Source: `dsh-token-meter/lib/index.js:273-340`.
- `useProjection("tokenUsage")` returns
  `{ uncachedInputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }`.
  Source: `dsh-token-meter/lib/index.js:216-266`.
- The shipped `ContextMeter` is hardcoded inside `InputBar` at
  `dsh-client-ui-conversation/lib/client.js:4000`, between the model seat and
  the send button. It is not in a slot and cannot be displaced.
- Its ring percent is `projectedTokens / contextWindow` and its bar segments are
  scaled by that same percent, so the segment proportions are right and the
  magnitude is wrong. Source: same file, lines 3053-3100.
- Its CSS arrives in `<style data-plugin-css="@deepseek-ai/dsh-client-ui-conversation/ContextMeter.module.css">`,
  and the text begins `.JObwrW_root{display:inline-flex;position:relative}`.
  The hash changes per DSH build, so read the class out of that tag at runtime.
  Source: same file, lines 2996-3005.
- `conversation.input.right` is a `list` slot, scope `session`, replaceRisk
  `none`, registration key `id` (required) plus optional `order` and `label`.
  It renders before the model seat, so the meter needs reordering to sit right
  of the model picker.
- Reordering the meter works ONLY by setting `order` on every element from our
  root up to the tool row's direct child, plus a higher order on the row's last
  child (always the send button, since the stop button is conditional). Verified
  by A/B: setting `order` on the row's direct child alone did nothing, and the
  chain walk fixed it. The likely reason is that the slot wrapper is
  `display: contents`, which is not a flex item, so order on it is inert. That
  explanation is deduced from the A/B result, not observed. A pure CSS rule
  cannot do this either: one unsupported `:has()` selector voids the whole rule
  group.
- Do not debug a dynamic client package with `console.log`. Package-tagged
  logging did not reach the browser console at all, so its silence proves
  nothing. Put a diagnostic in the rendered UI instead.

## Tickets

### T2 — port the package to a tracked plugin

Currently live as dynamic package `ctxmtr-2/pkg-6`, which dies on restart.

Move the same client code into a new plugin under `plugins/`, wire it into
`sync.sh`, and remove the dynamic package.

**Acceptance criteria**

- The meter survives a restart with no dynamic package running.
- `./sync.sh` installs it without manual steps.

## Human review queue

- [x] Context meter — ring reads 82k against the probe's 62k of messages plus
      4.6k system and 13k tools, and `/compact` moves it. Confirmed 2026-09-03.
- [ ] Context meter panel — check both light and dark themes, and confirm the
      panel is readable at its new height without clipping the composer.
- [ ] Meridian billing — compare an invoice against the session totals in the
      panel. If Meridian bills what it reports, this session cost roughly two to
      three times what the measured prompts justify. This is the only open
      question that decides money rather than pixels.

---

# Effort 9 — resume and recall rework

## Vision

`/resume` is a built-in command and recall is a default plugin. Neither lets the
agent search its own history on demand. Rebuild `/resume` as a skill, give the
agent keyword search and history lookup as real tools, and demote the default
recall plugin once those tools cover its job.

## Critical context

- Carried over from the compaction work, not yet started. Nothing is designed.
- Scope is not settled. Grill before writing any ticket.

## Tickets

### T1 — settle scope

Not started. Decide what `/resume` as a skill should do, what the search and
lookup tools take and return, and what "demote the default recall plugin" means
concretely. Produce tickets from that.

**Acceptance criteria**

- Effort 9 has real tickets with evaluation criteria the owner agreed to.

