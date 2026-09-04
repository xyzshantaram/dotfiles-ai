# Effort 1 — harness friction: guards, aidos patches, attachment drop

## Vision

The zai provider work this effort started is shipped and its tickets are gone.
What remains is unrelated harness work: a `warn` verdict for bash-guard and the
two guard rules that need it, a sync step for the aidos dsh patches, our own
attachment-drop plugin, and one dsh-better-edit fix.

## Tickets

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

### History and import (from grilling, 2026-09-03; redesigned 2026-09-03)

- This grilling session originally specified a steer-based design, now
  superseded. It assumed importing a
  historical list required the agent's cooperation, because `todo_write`
  REPLACES the whole list and the agent cannot read a projection on its own.
  That is still true, but T10 no longer imports into the live list at all: it
  inserts the historical list as text into the composer, the same append
  Remind (T7) already does. The owner reviews it, edits it if they want, and
  sends it (or not) like any other message. No steer, no spinner, no risk of a
  merge the agent silently drops on its next write.
- History browsing lives in the EXPANDED panel: two chevron buttons step through
  past lists, with a label showing the timestamp each list was set.
- No edit-mode toggle and no per-item selection. Insert takes the whole shown
  list, not a subset — the owner edits the composer text directly if they only
  want part of it.
- History rides the projection, bounded to the LAST 35 WRITES. Chosen over a
  per-turn bound and over a host route.

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

### Verified API facts (do not re-research)

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

### T10 — client: browse history and insert an old list into the composer

Not started. Depends on T9.

**Redesigned 2026-09-03.** The original design steered the agent directly:
select items, click import, agent merges them, panel shows a spinner until the
next `todo/write`. That needed the `sessions` service, an edit-mode toggle, a
per-item selection model, and a wait state with a real failure mode (the agent
never writes, spinner never clears). None of that is needed once Remind (T7,
changed above) already knows how to put a checkbox list in the composer
without submitting.

T10 now reuses that exact mechanism. Two chevrons in the expanded panel step
through the history T9 publishes, with a label showing when that list was set.
An Insert button renders the list shown — every item, not a selection — as a
markdown checkbox list and appends it to the composer draft through the same
`appendToDraft` helper Remind uses. Nothing steers, nothing waits, nothing can
fail silently: the owner sees the text land in the composer and decides what
to do with it, same as Remind. No new service inject. No edit mode. No
selection state. No spinner.

**Acceptance criteria**

- The chevrons walk back and forward through the retained lists, and stop at
  both ends.
- Each historical view shows the timestamp that list was written.
- Insert appends the shown list, as a markdown checkbox list, to the composer
  draft — same append behavior as Remind, including the blank-line separator
  and the empty-draft case. It never submits.
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
- [x] Remind button: click with an empty draft — the checkbox list appears in
  the composer, nothing submits. Type something first, click Remind — the list
  is appended after a blank line, the typed text is untouched. Confirmed
  2026-09-03: the owner pasted the appended checklist plus their own added
  text (`---` and "Worked?") in one sent message.
- [x] Remind button: click during a running turn — it still works, the button
  is never disabled. Confirmed 2026-09-03.
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

## Critical context

### Verified API facts (do not re-research)

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

### Verified API facts (do not re-research)

The fork clone is `/home/sid/repos/dsh-compaction-instant`, branch
`fix/retention-and-shrink-gate`, based on `f6f300f`. `pnpm test` runs
`node --test`. Peer deps install with plain `pnpm install`. The suite was 99
passing at the base commit and is 103 passing on the branch.


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

All five tickets shipped: the output buffer and poller (T1), replacement
`job_list`/`job_output`/`job_kill` tools plus the `/job-viewer/output` and
`/job-viewer/kill` routes (T2), completion delivery/wakeup (T3), the
replacement dropdown and modal with a kill button (T4), and wire-up —
`tool-jobs`/`ui-jobs` disabled, job-viewer installed (T5). See git log
(`plugins/job-viewer/`, `sync.sh`, `build.mjs`) for the full history.

## Human review queue

- [ ] Start a long background command. Open the dropdown, click the row, and
      watch output arrive in the modal.
- [ ] While that modal is open and polling, have the agent call `job_output` on
      the same job. It must see the full output, not a gap.
- [ ] Confirm the header shows one jobs button and the rows still read the way
      they did before.
- [ ] Open the modal from the phone over dsh-remote and confirm it loads.
- [ ] After the full effort deploys, start a new background bash command and
      confirm it still starts (the attachController regression check).
- [ ] Let a background job finish while idle and confirm you get woken up
      with a notice, without having to ask about it.
- [ ] Try the modal's stop-job button on a real running job: confirm the
      two-step confirm, and that the job actually stops.


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

### Verified API facts (do not re-research)

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
- `.tool-render-markdown-body` (renamed from `.tool-render-subagent-prompt` in
  T11, 2026-09-04) is the existing capped, scrollable markdown block:
  `max-height: 16rem; overflow-y: auto` plus full typography for headings,
  paragraphs, lists, `pre` and inline code. It now backs three rows (subagent,
  context injection, `send_message`), not one -- reuse it, do not add a fourth
  copy.
- Routes register through `ctx.inject(["webServer"], ...)`, the pattern
  `plugins/log-viewer/src/index.ts:75-77` already uses.


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

## Tickets

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

# Retired — context meter (Effort 8). Live notes only.

Shipped. The meter is a tracked plugin at `plugins/context-meter`, wired into
`build.mjs` and `sync.sh`, and confirmed working after a sync and restart.

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

### Verified API facts (do not re-research)

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

# Retired — resume and recall rework (Effort 9). Live notes only.

All three tickets shipped: skill-gate's `alwaysDeny`, `resume_search`/
`resume_read` replacing `/resume`, the `skills/resume` skill, and the
`/recall` slash command's mount row dropped from `sync.sh`. See git log for
the four commits.

## Human review queue

- [ ] Restart `dsh web`, then in a FRESH session send a natural-language
      prompt matching the resume skill's `whenToUse` phrasing (no literal
      `/resume`), and confirm it loads the skill on its own, searches, and
      expands a real hit from that session's own history.
- [ ] Confirm `search`, `recall`, and `/recall` are all gone from a fresh
      session — not just hidden-until-a-skill-unlocks-them.

---

# Effort 10 — screenshot every UI difference from stock

## Vision

This bundle changes a lot of the DSH interface and none of it is shown anywhere.
Capture every visible difference from stock DeepSeek Harness, collect them in a
`screenshots/` gallery, and promote the best few into the main README so the
repository shows what it actually does.

## Critical context

- "UI change" means any visible difference from stock DSH, whether this repo
  wrote it or only installs it. A third-party plugin we install counts.
- `sync.sh` is the audit point. Its `pnpm_ins` calls and the roster array in
  `step_report_extra_plugins` together name every installed plugin, so the
  screenshot list is derived from there rather than from memory.
- Not every installed plugin has a UI. The pass must state which ones were
  checked and found to have none, so a later reader does not redo that work.
- The repository has no image files today and `.gitignore` has no image rules,
  so adding binaries is a deliberate first. The owner approved committing them.
- Shots are WebP, scaled to 720p. This command is verified on this machine and
  turned a 2560x1440 PNG of 50,027 bytes into a 1280x720 WebP of 6,182 bytes:

  ```
  magick <in>.png -resize x720 -quality 82 -define webp:method=6 <out>.webp
  ```

  ImageMagick carries libwebp 1.6.0 here, so nothing needs installing. `cwebp`,
  `oxipng`, and `pngquant` are all absent and none of them are needed.
- `-resize x720` fixes the height and keeps the aspect ratio, so a wide shot
  stays wide. Do not force both dimensions.

## Tickets

### T1 — derive the shot list from sync.sh

Not started.

Walk the `pnpm_ins` calls and the roster array in `sync.sh`. Produce a table of
every installed plugin with one of three verdicts: has UI and needs a shot, has
UI but is already covered by another shot, or has no UI. Put the table in
`screenshots/README.md` as the gallery's skeleton.

**Acceptance criteria**

- Every `pnpm_ins` spec in `sync.sh` appears in the table exactly once.
- Each row carries a verdict and, for a no-UI verdict, one line saying why.

### T2 — capture the shots

Blocked on T1.

Take one screenshot per row that needs one. Store them under `screenshots/` with
names that match the plugin id, for example `context-meter.png`. Prefer a shot
that shows the feature in use over an empty state. Use one theme throughout so
the gallery reads consistently, and say in the README which theme it is.

**Acceptance criteria**

- Every row marked "needs a shot" has a `.webp` file, and no file is orphaned.
- `magick identify` reports a height of 720 for every shot.
- No shot exceeds 150 KB. The verified command lands far under that, so a file
  above it means the source was captured wrong.
- Each image is legible at the width GitHub renders it in the README.
- The owner agrees each shot shows the feature rather than an empty panel.

### T3 — write the gallery and promote the best to the main README

Blocked on T2.

Fill in `screenshots/README.md`: one section per shot with the image, the plugin
name, and one or two sentences saying what changed against stock. Then pick the
few that best show the bundle off and add them to the main `README.md`, linking
through to the full gallery.

**Acceptance criteria**

- Every image renders on GitHub from both READMEs, with no broken links.
- The main README carries a small selection, not the whole gallery.
- Each caption says what is different from stock, not just what the thing is.

## Human review queue

- [ ] Screenshot gallery — the owner picks which shots reach the main README,
      because that is a taste call and not a checkable one.

# Effort 11 — retire hashline edit, gate the MCP roster, grow bash-guard into our bash tool

## Vision

Three costs that every session pays on every step. Measured over 121 session
files since the 2026-08-31 fork deploy: the hashline editor fails 19.2% of edit
calls where the builtin str_replace editor fails 1.8%, and the blinkit and
nostrbook MCP servers put 33 of 64 tools in front of every model step. Retire
the first, gate the second. Then grow bash-guard from a veto-only pre-execute
listener into the bash tool itself, which is the only way it can run the rewrite
it already computes.

## Critical context

- Effort 1 ticket T10 (dsh-better-edit advertises sandbox escalation and drops
  it) is moot once T2 lands. Drop it rather than fixing the fork.
- `plugins/manifest-guard.ts` and `plugins/package-tool.ts` name dsh-better-edit
  only in comments. Both hook `fs/write-intent`, which the builtin edit
  dispatches too. Comments only, no code change.
- Keep `experiments/tool-call-friction/` as the record of why the fork existed.
  The served-mirror fix worked: `E_RANGE_UNVERIFIED` and `drifted_after_edit`
  both reached 0 over 1,593 mutating calls. Retiring hashline is a cost verdict,
  not a verdict on that fix.
- Remaining hashline failure after the fix was `E_BATCH_ABORT`, 183 cases, 89% of
  them `E_STALE_ANCHOR`, and 197 of them on `edits[0]`. Mean batch size was 1.36,
  so the batch API was almost never used.

### Verified API facts (do not re-research)

Builtin fs tools, from `@deepseek-ai/dsh-tool-fs/README.md` in the installed dsh
(`.../node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-tool-fs/`):

- `read` args: `file_path`, `offset?` (1-based), `limit?` (default and cap 2000).
- `read` result: `<path>..</path>`, `<type>file</type>`, `<content>`, lines as
  `<lineNumber>: <text>`, a blank line, one footer, `</content>`. The footers are
  `(End of file - total <total> lines)`,
  `(Showing lines <s>-<e> of <total>. Use offset=<n> to continue.)`, and
  `(Output capped. Showing lines <s>-<e>. Use offset=<n> to continue.)`.
  A truncated line ends `... (line truncated to <max> chars)`.
- `edit` args: `file_path`, non-empty `old_string`, `new_string`, `replace_all?`.
  A unique match is required unless `replace_all` is true.
- `edit` result: `The file <displayPath> has been updated successfully.` or
  `The file <displayPath> has been updated. All occurrences were successfully replaced.`
- `write` args: `file_path`, `content`. The result envelope ends `Created file`
  or `Updated file`.
- Guarded-mutation errors: `FS_STALE_VERSION` appends `— re-read the file, then
  retry`, `FS_NOT_OBSERVED` appends `— read the file, then retry`.
- `read` derives a replayable read card `{ path, offset, lines, totalLines,
  lang? }`. `write` and `edit` derive diff-card metadata. Only the derived card
  metadata is persisted to `tool/result`.

bash-guard rewrite blocker, from `plugins/bash-guard.ts:41-49`: dsh-tools
deep-freezes `exec.arguments`, and `PreToolDecision` is only
`allow | deny | ask`. A pre-execute listener cannot rewrite a command. An
earlier version assigned to `exec.arguments.command` and was a silent no-op.


## Tickets

### T4 — clear stale dsh-better-edit references from comments and docs

**Status:** open, and now unblocked. The editor retirement it waited on shipped
in commit 5af0670.
**Change:** update the comment blocks in `plugins/manifest-guard.ts` (~line 23)
and `plugins/package-tool.ts` (~lines 25, 5), the `README.md` line about
guidance overrides, and `skills/customize-setup/SKILL.md` plus its
`template.md` (both line ~55). Leave `experiments/tool-call-friction/` alone.
**Acceptance criteria:**
- `rg -n 'better-edit' --glob '!experiments' --glob '!node_modules' .` returns
  nothing outside `experiments/`.
- `pnpm test` passes.

### Post-restart checklist

Run in order. Stop at the first failure and roll back.

**Before restarting**
1. `pnpm test` is green and `node build.mjs` has run since the last source edit.
   The web patch points straight at `plugins/bash-guard.js`, so the built
   artifact IS the deployed plugin. There is no separate install step, and a
   restart alone deploys it.
2. `./sync.sh` completes. Its last step, `step_verify_preset_tool_disabled`,
   must pass. If it fails, `tool-bash` is still enabled somewhere and starting
   dsh would put two plugins on the name `bash`.
3. Keep a rollback ready:
   `cp /tmp/dsh/rollback/bash-guard.js plugins/bash-guard.js`. That artifact
   carries the old pre-execute listener and registers no tool, so it boots
   safely against an enabled `tool-bash`.

**If dsh does not boot**
Restore the rollback artifact and restart. If it still fails, delete the
four-line `- id: bash-guard` block from
`$DSH_HOME/profiles/web/cordis.patch.yml`. That drops the plugin entirely and
needs no build.

**After the restart**
4. The session starts at all. This is the real test of the name collision.
5. `bash` appears in the tool list exactly once. `create_goal`, `get_goal`, and
   `update_goal` are gone.
6. Foreground works: `echo hello` returns `hello`.
7. Exit codes survive: a command that exits non-zero reports `[exit code: N]`.
8. Deny still denies: a command matching a `deny` rule returns a denial and
   does not run.
9. Rewrite path: `grep -rn foo .` returns an ASK whose prompt shows BOTH the
   command written and the `rg` replacement. Approving runs the REPLACEMENT.
   Confirm the output is rg-shaped, not grep-shaped.
10. The model-visible result carries the rule's reason on that rewritten call.
11. Nested substitution is not corrupted. Run
    `cd /tmp && echo A; for s in $(rg --stats foo . 2>/dev/null); do echo $s; done`
    and confirm any suggested command is byte-identical, never `eo`.
12. Background: `run_in_background: true` returns a job id, `job_list` shows it,
    `job_output` returns only new bytes on each read, and `job_kill` stops it.
13. Sandbox escalation: a write outside the workspace denies, and the same call
    with `sandbox_permissions` plus a justification prompts ONCE and succeeds on
    approval. The prompt must name the command that will run.
14. Escalation is not wasted: a command a guard rule denies must NOT prompt for
    escalation first.

**What must NOT happen yet**
No rule carries `readOnly`, so NOTHING auto-runs. Every rewrite still arrives as
an ask or a deny. A rewritten command running with no prompt means a rule gained
`readOnly` by accident, and that is a bug.

**Only after all of the above passes**
Add `readOnly: true` to `guards/rg.json` and `guards/find.json`, re-run
`./sync.sh`, and confirm `grep -rn foo .` now runs straight through as rg with
no prompt. Keep this a separate, deliberate change so any regression is
attributable to it.

### T10 — tool-render: three more cards

**Status:** open. Owned by whoever holds `tool-render`. Three independent cards,
so they can land separately.

Counts below come from a scan of 500 session logs and 54,684 tool calls. The
rendered tools already cover 83% of calls, so these are chosen for how much
SCREEN they take, not how often they fire.

**`skill` — render the body as markdown, and show its size.**
352 calls, 8,946 chars average, and 353 of them exceed 2k. Today the whole body
lands in a generic card as raw text. The owner wants it readable and NOT
collapsed, because seeing what enters the model is the point.
- Render the markdown.
- Show the size in KB on the row.
- MEASURE THE RESULT STRING, not the file on disk. The client cannot `stat`
  anything, and the two differ because the loader wraps the body.
  `output.length` is simpler and more honest, since it is exactly what reached
  the model.
- Motivation, measured 2026-09-04: 36 skills, 216 KB of bodies, 6 KB mean, and
  `cordis-plugin-development` alone is 23.7 KB, near 6,800 tokens in one call.
  Loading `software-engineering`, `plan`, and `verification` in one session cost
  33.4 KB. A KB badge makes that visible as it happens.

**`list_agents` — a real card.**
537 calls, 391 chars average. Small output, so this is a readability win rather
than a noise win. Rows of id, label, and status beat a JSON dump.

**`job_output` — a real card.**
128 calls, 746 chars average. Effort 6 covers the jobs MODAL and making
`job_output` re-readable, but not the tool-call card itself. Read Effort 6
first: if its buffer work lands, this card should read the same projection
rather than parse the text a second time.

**Acceptance criteria:**
- Each card renders its own shape, and an unknown tool still falls back to the
  generic JSON card.
- `pnpm test` and `node build.mjs` pass.
- Checked by eye in the GUI, because a passing build proves nothing about
  rendering.

### T9 — TypeScript and tests across the whole repo

**Status:** UNSCOPED. Requested 2026-09-04. Grill the owner before planning it.
Do not dispatch anything from this ticket as written.

**Why it is unscoped:** "add typescript" is ambiguous here, because every source
file already is TypeScript. The likely readings are different projects with very
different costs, and the owner has not said which one:
- Turn on strict mode. `tsconfig.json:3` currently sets `"strict": false`.
- Remove the escape hatches. For example `plugins/bash-guard.ts` reaches aidos
  through `(ctx as unknown as { get(name: string): unknown })`, and the client
  bundles use plain `var` with no annotations at all.
- Type the seams we consume from dsh packages rather than casting at each call.

**Measured state, 2026-09-04.** Directory plugins, sources against test files:

| Plugin | sources | tests |
| --- | ---: | ---: |
| llm-pi-ai | 10 | **0** |
| mcp-servers | 12 | 5 |
| shared | 7 | 1 |
| tool-render | 5 | 2 |
| durable-todos | 4 | 1 |
| log-viewer | 4 | 1 |
| session-archive | 3 | 1 |
| approval-comment | 2 | **0** |
| composer-menu | 2 | **0** |
| context-meter | 2 | **0** |
| profiles-client | 2 | **0** |
| subscriptions | 2 | **0** |

Six of twelve directory plugins have no test at all. `llm-pi-ai` is the largest
untested surface at 10 source files. There are also 18 single-file plugins at
the top level of `plugins/`, of which only `bash-guard` and `sync` are covered.

**Questions to settle before this becomes real work:**
- Does "typescript" mean strict mode, removing casts, or both?
- Is the client half in scope? Those bundles are deliberately plain `var` style
  with no annotations, so strict mode there is a rewrite, not a flag flip.
- Is the goal coverage everywhere, or coverage on the parts that break? The
  three bash-guard files caught real defects. A test on a two-file client plugin
  may not pay for itself.
- Does this run as one sweep or as a rule that new code must carry tests?
- What is the bar for done, given `strict: true` will surface errors across
  every file at once?

### T8 — tool-render: mark a rewritten bash call

**Status:** open. TWO HALVES, and the host half comes first.

**T8a, host, ours.** The client cannot see that a call was rewritten. Our tool
returns text, and the card only has the model's `args.command`, which is
precisely the string that is no longer what ran. So the outline cannot be drawn
and the executed command cannot be shown until the host publishes both.

`@deepseek-ai/dsh-tools` `lib/types/index.d.ts:103` offers the channel:

```ts
/** Pure replayable presentation projection, computed only for top-level calls. */
presentationMeta?(args: unknown, value: JsonValue): JsonValue;
```

"Replayable" is the load-bearing word: it is what survives a reload, which is
this ticket's own acceptance criterion. Add `presentationMeta` to the
`defineTool` call in `plugins/bash-guard.ts`, projecting at least
`{ rewritten: boolean, ran: string }`. Keep it small and JSON-only. Do NOT put
the rule reason in it, since that already reaches the model in the result text
and does not belong in a card projection.

**T8b, client, the other session's**, and blocked on T8a.
**Why:** with T5 shipped a rewritten command runs silently. Without a mark you
cannot spot a guard rule that rewrites too aggressively.
**Change:** the card shows ONLY the executed command, with no badge and no
original text. Add a persistent 3px blue outline.
`plugins/tool-render/src/client.module.css:325` already has
`.tool-render-card[data-guard-approval] { outline: 3px solid
var(--dsh-outline-guard); }`. Reuse that colour token with a NEW attribute such
as `data-guard-rewrite`. The existing blue is deliberately transient, per the
comment at line 320, because the client never receives a decided approval's
reason. A rewrite mark must PERSIST, and T5's tool owns its own result so it can
set that flag durably.
**Acceptance criteria:**
- A rewritten call keeps its blue outline after the turn ends and after a reload.
- A normal call has no outline. An escalated call keeps its yellow one.
