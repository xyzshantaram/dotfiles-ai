# Handoff — in-flight work from session 6e00b631

This note hands over work that was running when session
`6e00b631-5e04-476e-86bd-c0d8854fa294` stopped being usable. The session died
because automatic compaction entered a loop and consumed its own output. That
compaction defect is fixed. The rest of the work is not.

Read `PLAN.md` in `/home/sid/repos/dotfiles-ai` next to this file. It holds six
efforts with their settled decisions and verified API facts. This note records
only what `PLAN.md` does not: the uncommitted state, one finding that
invalidates a written ticket, and one request that was never recorded.

## 1. Repository state, nothing committed

`/home/sid/repos/dotfiles-ai`

| File | State |
| --- | --- |
| `PLAN.md` | Modified. Effort 6 was added for the job viewer. |
| `build.mjs` | Modified. Adds a `createRequire` banner to the mcp-servers bundle. |
| `plugins/mcp-servers/lib/index.js` | Modified. Rebuilt output from that banner. |

`/home/sid/repos/dsh-compaction-instant`, branch `fix/retention-and-shrink-gate`

| File | State |
| --- | --- |
| the four defect fixes and the six new tests | Committed and pushed as `73c0d5c`. |
| `pnpm-lock.yaml` | Untracked. Decide whether to ignore it or commit it. |

`sync.sh` pins that commit, so a `./sync.sh` run installs the fix.

Ask the owner before you commit anything. That rule is in `AGENTS.md`.

## 2. Blocking finding that changes ticket T6

The dead session was verifying one fact when it stopped. Here is the answer.

**`TodoDock` cannot be imported.** It is a local function at
`@deepseek-ai/dsh-client-ui-conversation/lib/client.js:6554`, used for slot
registration at line 6577. It is absent from the package export surface. The
client type surface at `lib/types/client/index.d.ts:16-23` exports only `apply`,
`inject`, `ConversationController`, and types.

Ticket T6 in `PLAN.md` says "Render the imported `TodoDock` from
`@deepseek-ai/dsh-client-ui-conversation`". That instruction cannot be carried
out. Do not spend time trying. Revise T6 before you start it.

The owner resolved this on 2026-09-03. The panel stays hand-rolled. We style it
properly and hide the shipped one, rather than feeding and wrapping the built-in
panel. Owning the panel keeps the Remind button and the carried-over label with
no compromise, at the cost of more front-end work, which the owner accepted.

The host does NOT take over `todo_write`. The existing `durable-todos/todos`
mirror projection stays as it is. This is front-end work only.

The shipped panel is hidden with one CSS rule on its stable hook,
`[data-testid="todo-panel"]`. The two cleaner routes are both blocked:

- Starving the `todos` projection needs the `tool-todo` row disabled. That row
  lives in the agent preset, and `editing-cordis-compositions` forbids forking a
  shipped preset.
- Same-id displacement is unverified for list slots. The SlotCore note in
  `plugins/tool-render/src/client.tsx` proves shadowing works for KEYED slots by
  priority, but `conversation.input.dock` is a list slot keyed by `id`/`order`.
  That is exactly why both panels render today.

The live specification is ticket T7 in `PLAN.md`. T5 and T6 are marked
SUPERSEDED there.

## 3. Work item — todo plugin rework

Effort 2 in `PLAN.md`, lines 193 to 368. The plugin is `durable-todos`.

Why it is being reworked: the shipped panel was hand-rolled. It rendered in
addition to the built-in panel rather than replacing it, and it did not
collapse. The fix is to feed the built-in panel durable data instead of
restyling a copy of it.

**T5, host, not started.** Disable the `tool-todo` row. Register `todo_write`
with the same parameter schema and description as `@deepseek-ai/dsh-tool-todo`.
That file is 195 lines. Copy the wording faithfully, because model behaviour
depends on it. Register two projections:

- `todos`, holding `TodoItem[] | null`, never cleared on `turn/start`, so the
  built-in panel reads it.
- `durable-todos/carried`, a boolean, set true by `turn/start` and cleared by
  the next `todo/write`.

Replace the old `durable-todos/todos` projection with that pair.

Acceptance criteria for T5:

- `todo_write` accepts the same arguments as before.
- It still rejects a call that marks several items in progress when
  `allowParallelInProgress` is false.
- After an interrupt and a new message, the built-in panel still lists the items.
- No duplicate registration of the `todos` projection key at boot.

**T6, client. SUPERSEDED.** Replaced by T7, which is being implemented now.
See section 2.

Acceptance criteria for T6:

- Exactly one todo panel renders, and it collapses.
- Remind fills the composer with the unfinished items and submits.
- The `carried over` badge appears after a turn boundary and clears on the next
  write.

**One constraint that killed an earlier route.** `tool-todo` lives in the agent
preset, not in the host composition that the profile patch targets. The
`editing-cordis-compositions` skill forbids editing a shipped preset. Changing
`tool-todo` there would mean forking the whole `standard` preset and keeping the
fork current across upgrades. That was rejected as too costly. `sync.sh` does
register a preset through `$DSH_HOME/.agent-presets/`, so preset-plane edits are
possible, but the skill still governs them.

## 4. Work item — compaction fork, done, needs review and deploy

`/home/sid/repos/dsh-compaction-instant`. Effort 5 in `PLAN.md`.

Automatic compaction was not failing loudly. It was succeeding while doing
nothing, and eating its own output. In the dead session, six compactions ran
inside a 420-seq window. The last one compacted exactly one node, its own
previous checkpoint, and freed about 535 tokens out of 1924. Checkpoint nesting
reached five levels, with five copies of the recall preamble.

Four defects, all fixed:

1. **Prior checkpoints were re-absorbed whole.** `compileRegion` copied a
   checkpoint verbatim, so each generation added an envelope. New function
   `unframeCheckpointText` in `src/compiler.js` takes the inner body of the
   three-block frame and drops the leading recall guide. Foreign framing falls
   back to the old projection.
2. **Selection could not tell new content from old.** `selectCompactableRange`
   in `src/region.js` now also returns `newTokens`, the span total minus any
   landed checkpoint nodes. `isWorthCompacting` in `src/index.js` is now
   trigger-aware. Automatic pressure needs 4096 new tokens. Overflow recovery
   and manual compaction keep the old framing floor of 1024, because both must
   still be able to force one reduction.
3. **The shrink gate accepted a one-token cut.** Attempts before the last now
   need the checkpoint to fit inside 75 percent of the span. The final attempt
   keeps the old any-shrink rule, so a stubborn span still lands instead of
   failing the step.
4. **`shadowedRange` was misreported.** Surface order stops matching seq order
   once a checkpoint sits at the head, so `start` could hold a higher seq than
   `end`. The record now also carries true `minSeq` and `maxSeq`, and the
   checkpoint header line uses them.

Tests: 109 pass, up from a 103 baseline. Run them with `node --test`. Run
`pnpm run -s check` for syntax. Every new test was confirmed to fail against the
unfixed source, so none of them is inert.

Remaining: a diff review, an approved commit, and deployment. Deployment needs
the restart in section 7.

## 5. Work item — mcp-servers boot fix, uncommitted

The committed `mcp-servers` bundle throws on import. It was already broken. Boot
only started failing when the `mcp-servers` row went live.

Cause: `cross-spawn`, pulled in by the MCP SDK stdio transport, calls
`require("child_process")` with a bare specifier. The `node:*` external pattern
does not match it, so esbuild inlined its `__require` shim, and that shim throws
in ESM output. The shim checks `typeof require !== "undefined"` first, so a
`createRequire` banner satisfies it.

`build.mjs` now emits that banner. The rebuilt bundle imports and exports
`apply`, `inject`, and `name`. The change is verified but not committed, and it
does not take effect until the restart in section 7.

## 6. Work item — tool-render ticket, never recorded

This request arrived at seq 35808 and the session died before writing it into
`PLAN.md`. It is recorded nowhere else. Verbatim:

> add tool-render ticket: make read_image and see tool calls embed the image,
> click to open enlarged preview modal, and make see also show the description
> that the subagent returned in a pretty way, and make read_image display
> metadata in a pretty way too

Treat this as unscoped. Grill the owner before you plan it.

Effort 6 in `PLAN.md`, lines 643 to 769, is a separate and fully designed
effort for clickable background-job rows and an output modal. It is not started.
Its modal work probably shares components with this ticket. Check that before
you design either one.

## 7. Owed action — the dsh-web restart

The owner asked for build and deploy. The build half is done. The deploy half is
not, because a restart drops the server that runs the live session, and that
timing is the owner's call. `PLAN.md` records this as Effort 2 T4.

Nothing in sections 4 and 5 goes live until that restart happens. After it, the
`PLAN.md` human review queues list the checks to run by hand.

## 8. Environment constraints, learned the hard way

- `/home/sid/repos/dsh-compaction-instant` sits outside the dotfiles workspace.
  Writes there need `danger-full-access`. Subagents cannot write there. A
  dispatched coder was denied, and its one sanctioned escalation was refused,
  so every change to that fork was made from the primary session.
- The `edit` tool drops its own escalation. Only `bash` escalation reaches that
  path. Changes to the fork went through `python3` exact-string replacement.
- Match strings with a newline anchor when you patch by exact text. A pattern
  indented six spaces also matches inside a line indented ten spaces, which
  silently hits the wrong call site.
- `/tmp/dsh` is sanctioned scratch space and needs no approval.
