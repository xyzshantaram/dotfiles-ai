# Plan — zai provider: sync-models seeding + subscriptions usage panel

## Vision

The user added a `zai` provider block (Zhipu AI, `https://api.z.ai/api/coding/paas/v4`,
`ZAI_API_KEY`) to `home/settings.yaml` and wants:

1. `sync-models.mjs` to seed its `models:` list like the other seeded providers,
   so chains can reference `zai/<model>` routes.
2. The subscriptions plugin to show Z.ai Coding Plan usage (quota windows +
   call/token totals) in the settings panel, like DeepSeek/Command Code.

## Verified API facts (do not re-research)

- `GET https://api.z.ai/api/coding/paas/v4/models` with `Authorization: Bearer <key>`
  returns a plain OpenAI list: `{"object":"list","data":[{"id":"glm-4.5","object":"model",...}]}`.
  10 ids on this account: glm-4.5, glm-4.5-air, glm-4.6, glm-4.7, glm-5,
  glm-5-turbo, glm-5.1, glm-5.2, glm-5.3, glm-5.3-flash. `fetchModelIds` already
  handles this shape.
- `GET https://api.z.ai/api/monitor/usage/quota/limit` (Bearer accepted) returns
  `{"code":200,"msg":"Operation successful","success":true,"data":{"limits":[...],"level":"lite"}}`.
  Live limits on this account: `{"type":"CREDIT_LIMIT","unit":3,"number":5,
  "usage":2000,"currentValue":0,"remaining":2000,"percentage":0}` and the same
  type with `unit:6,"number":1,"usage":10000,...,"nextResetTime":1788776603998`
  (epoch ms, ~weekly out).
- Unit semantics (from pi-zai-usage, which cites z.ai frontend source):
  unit 3 = 5-hour rolling window, unit 6 = weekly quota, TIME_LIMIT (unit 5) =
  monthly tool/search quota. Type strings can be TOKENS_LIMIT or CREDIT_LIMIT
  depending on plan — filter on `unit`, never on `type`.
- `GET .../api/monitor/usage/model-usage?startTime=YYYY-MM-DD HH:mm:ss&endTime=...`
  returns envelope `data` = `{x_time[], modelCallCount[], tokensUsage[],
  totalUsage:{totalModelCallCount,totalTokensUsage,modelSummaryList[]},
  modelDataList[], modelSummaryList[], granularity:"hourly"}`. Local-time
  `YYYY-MM-DD HH:mm:ss` query params, URL-encode the space.
- Auth failures return HTTP 200 with `{"code":1001,...,"success":false}` (no
  header) or `{"code":401,"msg":"token expired or incorrect","success":false}`
  (bad key). ALWAYS check the envelope, never `res.ok` alone.
- models.dev has a `zai` provider: exact keys `glm-5.3-flash` (name GLM-5.3-Flash,
  ctx 1M, out 131072, input text/image/video/pdf, efforts low/high/max) and the
  other ids. `TIER2_PREFIX` already routes `^z-ai/` and `^zai-org/` to it, and
  bare ids hit tier-3 union fallback; `glm-4.5` style ids also match the zai
  provider's exact keys through `matchId` normalization.

## Design decisions

- sync-models: `SEEDED_PROVIDERS` is an explicit allowlist on purpose; add
  `zai` there and nowhere else. No CATALOG_EXCLUDED/TIER1_ROUTE entry (its
  models.dev metadata flows through tier-2/3).
- subscriptions host: two routes, `/subscriptions/zai-quota` (30s cache) and
  `/subscriptions/zai-usage` (60s cache), fetch `ZAI_API_KEY` through the
  credentials service like every other provider, return
  `{ok:true,...}` / `{ok:false,error}` at HTTP 200 like the other handlers.
- Quota parsing maps limits by unit: unit 3 -> fiveHour {used: currentValue,
  cap: usage, percent: percentage, resetsAt}, unit 6 -> weekly (same shape).
- Usage route returns `{ok:true, level, totalCalls, totalTokens, modelSummary}`
  from a 7-day window ending at `now` (never end-of-today: the API accepts
  future-ending windows and pads with zeros).
- Client: a "Z.ai (GLM)" section — provider toggle key `zai` — with two window
  meters via the existing `buildRows`, a plan-level line, and a 7-day calls +
  tokens line. `PROVIDER_TOGGLES`, the fetch list, snap keys, and dataKeys gain
  matching entries.

## Tickets

### T1 — sync-models seeds zai

**Status:** done
**Change:** `sync-models.mjs` header comment + `SEEDED_PROVIDERS` gains `zai`.
**Acceptance criteria:**
- `node sync-models.mjs` runs with ZAI_API_KEY present, reports the zai fetch,
  and writes a marker-wrapped `models:` block into the zai provider in
  `home/settings.yaml`; non-zai regions byte-identical except modelSync.lastRun.
- Chain check passes for a test `zai/glm-5.3-flash` chain ref.

### T2 — subscriptions host: zai routes

**Status:** done
**Change:** `plugins/subscriptions/src/index.ts` gains the quota/usage fetchers,
handlers, two route registrations, and header-doc lines.
**Acceptance criteria:**
- `node build.mjs` rebuilds `plugins/subscriptions/lib/index.js` cleanly.
- `curl localhost:<port>/subscriptions/zai-quota` returns `ok:true` with the
  lite plan, two windows, and nextResetTime; missing key returns
  `ok:false,error:"ZAI_API_KEY credential not configured"`.

### T3 — subscriptions client: Z.ai section

**Status:** done
**Change:** `plugins/subscriptions/src/client.tsx` gains the section, toggle,
fetch, snap fields.
**Acceptance criteria:**
- Build passes; section renders under the "Show sections" toggle `zai`.
- Hidden by default-config toggle behaves like other providers.

### T4 — verify

**Status:** done
**Acceptance criteria:** build.mjs, `pnpm exec tsc --noEmit` (no new errors
beyond pre-existing), `pnpm test`, prettier on touched files; real-route curl
for both zai endpoints; sync-models dry-run + real run reviewed.

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


## Human review queue

- Run `pnpm run sync-models` yourself (needs ZAI_API_KEY in env), review the
  settings.yaml diff, then run `sync.sh` and restart the session before chains
  pick the zai routes up.
- Check the panel section in the web GUI: meters render, reset countdown shows.
- Decide whether to add `zai/<model>` routes to `profile.chains` now.
## Follow-ups (done after initial implementation)

- sync.sh aidos pin bumped to `6721bb90734bb9c1cf88d4fa0d506959346cb182`.
- `zai/glm-5.3-flash` added to the top of the `personal-orchestrator` and
  `subagent` chains. sync-models dry run reports zero chain warnings.

## Ticket: session-archive batch delete + loading states

**Status:** done — implemented, reviewed, fixed, verified (72/72 tests, build, format clean). Uncommitted.

The panel deletes one session per `POST /sessions/archived/delete` call, so
clearing many archives costs one network roundtrip each. Settled with the user:
checkboxes on every non-live row, a header select-all checkbox, and a
"Delete selected (n)" button that sends one batch request.

**Contract**

- New host route `POST /sessions/archived/delete-batch`, body `{ ids: string[] }`,
  same 16 KiB cap. Answer `{ ok: true, results: [{ id, ok, error? }] }` with one
  entry per requested id; per-item failures never abort the batch.
- Refactor the single-delete route so the per-id logic (live check, archived
  check, locate, path-mismatch guard, rm) lives in one helper both routes use.
- Client: one batch request for all selected ids, then reload and clear
  selection. Loading states: existing "Loading…" on first load, a busy state on
  the batch button while the request runs ("Deleting n…"), and the existing
  per-row "…" on single deletes.

**Acceptance criteria**

- Batch route covered by a vitest module (validation, per-id results, live and
  non-archived ids reported as failures without aborting the rest). `pnpm test`
  passes; `pnpm run build` and `pnpm run format:check` pass.

## User preferences and special rules

- Never commit without explicit approval.

---

# Effort 2 — durable-todos plugin (concepts imported from dsh-todo-guard)

## Vision

A small dsh plugin, `durable-todos`, that keeps the session todo list visible and
usable across dsh restarts. The official todo panel data path stays untouched.
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

## Verified API facts (do not re-research)

- Projection contract (0.1.1-rc.1+): `ctx.inject(['sessionProjections'], ...)`;
  `sessionProjections.register({ key, init, apply(state, event), stateVersion,
  stateSchema, wire: { viewSchema, view } })`. Schema must be zod (`.parse`),
  NOT schemastery — the projection engine calls `.parse`. Event types:
  `todo/write` carries `{ todos }` (last-wins whole list). The official todos
  unit is cleared to null at `turn/start`; a mirror that ignores that event
  keeps the last list. `sessionProjections.snapshot(session)` forces a snapshot
  so the client gets data on connect. zod 4.4.3 is already a repo dependency.
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

### T1 — host half: mirror projection + warm listeners

Create `plugins/durable-todos.ts` (host): register the `durable-todos/todos`
projection (zod schema, last-wins on todo/write, no clear at turn/start) and
the session warm listeners. Unit test with vitest: feed a todo/write event and
assert apply() keeps the list; feed turn/start and assert it does NOT clear.

**Acceptance criteria**

- `pnpm vitest run plugins/durable-todos.test.ts` passes (projection apply
  semantics + warm listener registration with a stub ctx).
- `pnpm run build` emits `plugins/durable-todos.js`.

### T2 — client half: dock + Remind button

Create `plugins/durable-todos/client.tsx`: module-loader client registering the
`conversation.input.dock` entry. Always-visible card: header ("Todos" + Remind
button), list of items with pending/in-progress/completed glyphs, "no todos"
empty state. Remind: compose verbatim unfinished list, setDraft + submit,
disabled while the input machine is busy, hidden with no unfinished items.
dsw tokens only; kebab-case classes; idempotent style tag.

**Acceptance criteria**

- `pnpm run build` emits the client bundle; `pnpm test` and
  `pnpm run format:check` pass.
- Manual check by the user after deploy: panel visible on a fresh session with
  no todos; after a todo write, items render; after dsh restart + reopen, list
  still shows; Remind sends the reminder message into the session.

### T3 — wire-up: build.mjs entry + sync.sh rows + docs

Add the client build entry to build.mjs (mirroring profiles-client), add the
host row to the sync.sh insert list, copy the client bundle to the profile in
sync.sh (same step pattern as profiles-client), and add a line to the bundle
README listing the plugin.

**Acceptance criteria**

- `grep -n 'durable-todos' sync.sh build.mjs` shows the rows; `./sync.sh`
  completes with the new row installed (run in deploy ticket).

### T4 — deploy: sync + restart + user verification

Run `./sync.sh` (needs danger-full-access for ~/.dsh), schedule the dsh-web
restart, then hand the Human review queue items to the user.

**Acceptance criteria**

- sync.sh exits 0 and the journal shows the durable-todos rows mounting; the
  rg -rln fix and /compact fix from this session also ship in the same restart.

## Human review queue (shared, both efforts)

- [ ] After deploy restart: open a fresh session — durable-todos panel shows
  "no todos" state; run a todo write — items render; restart dsh-web and reopen
  the session — list survives.
- [ ] Remind button: click while idle — reminder message appears in the
  session; click during a running turn — button disabled.
- [ ] `/compact` appears in the slash autocomplete after the restart and runs
  on a long session.
- [ ] `rg -rln foo /tmp/dsh/file` gets a deny suggesting `rg foo /tmp/dsh/file`;
  `rg --replace x y file` runs untouched.
- [ ] MCP roster after sync: Settings → MCP lists swiggy-food, swiggy-instamart,
  zepto, blinkit. Click Authenticate on swiggy-food and swiggy-instamart,
  finish the browser login, and confirm both badges reach `connected (N tools)`.
  zepto stays unauthenticated by decision.
- [ ] Approval prompt: trigger one and confirm the card shows a 3px orange
  outline and no 1px warn border.
- [ ] After the next sync and restart: log in normally, and confirm `/compact`
  still appears in the slash autocomplete.

# Effort 3 — MCP roster: easyeda + move the OAuth servers to dsh-mcp-manager

## Vision

The two swiggy rows fail on every boot. The built-in `@deepseek-ai/dsh-mcp-client`
accepts only a static `headers` map, so it cannot run an OAuth login, and the
journal shows both giving up after 10 reconnect attempts with
`invalid_token / Authentication required`. Install `dsh-mcp-manager`, move every
server that needs a browser login onto it, add easyeda-mcp-pro over stdio, and
declare the mcp-manager roster from a repo script, so a fresh machine needs only
one browser login per server.

## Verified API facts (do not re-research)

Source: `dsh-mcp-manager` at pin `69d5cbc`, `lib/index.js`. Probes run 2026-09-02.

- State file `~/.dsh/mcp-manager.json`, shape
  `{ servers: [...], workspaceTokens: {}, onDemandToolInjection: false }` (`index.js:57-67`).
- `apply()` calls `loadState()` once into memory, and every mutation calls
  `saveState(state)` writing the whole object back. A file edit made under a
  running host is reverted on the next mutation. Offline writes need
  `dsh-web.service` stopped.
- The OAuth client id and tokens live inside the server record at `server.oauth`
  (`index.js:239-240`). A wholesale rewrite wipes them and forces a re-login.
  Any writer must upsert by `name` and preserve `id`, `oauth`, and `enabled`.
- `POST /mcp-manager/api/servers` accepts ONLY these fields. It ignores `oauth`.
  - stdio: `{ name, type:'stdio', command, args, env, cwd? }`
  - http: `{ name, type:'http', url, authMode:'oauth'|'static', headers, headerEnv, tokenEnv? }`
  - `name` must match `/^[A-Za-z0-9_-]{1,32}$/`. It becomes the `mcp__<name>__` prefix.
  - Returns 201 `{server}`, or 409 when the name is taken.
    `GET /mcp-manager/api/servers` lists the current set.
- stdio servers spawn `command` + `args` directly, with no shell. Use
  `command: "node"`, never `sh -c`.
- `discoverOauthMetadata` probes only
  `<url-origin>/.well-known/oauth-authorization-server`, then falls back to
  guessed `/oauth/authorize`, `/oauth/token`, `/register`. It does NOT follow the
  `www-authenticate: resource_metadata=...` pointer. `issuerOf()` prefers
  `server.oauth.issuer` when that field is already set.
- swiggy: `https://mcp.swiggy.com/.well-known/oauth-authorization-server` returns
  200 with `registration_endpoint: https://mcp.swiggy.com/auth/register`. A probe
  POST there returned 201 with `client_id: "swiggy-mcp"` and echoed back an
  arbitrary `redirect_uri`. mcp-manager's dynamic registration therefore works.
- zepto: `https://mcp.zepto.co.in/.well-known/oauth-authorization-server` returns
  404. The real authorization server is `https://auth.zepto.co.in`, named in
  `/.well-known/oauth-protected-resource`. Native OAuth would need
  `server.oauth.issuer` pre-seeded, which `POST /servers` cannot do.
- `@deepseek-ai/dsh-mcp-client` `StdioConfig` does accept `env: Record<string,string>`.
- sync.sh has no restart step. It prints a "Restart dsh web" reminder at the end.

## Design decisions

- easyeda stays a static `dsh-mcp-client` row. It runs over stdio (`TRANSPORT`
  defaults to `stdio`) and needs no login. The OAuth settings in its README are
  inbound auth for when you host it over HTTP, and do not apply here.
- zepto goes on mcp-manager as a **stdio** server running
  `npx mcp-remote https://mcp.zepto.co.in/mcp`. This matches the opencode config
  that worked, where mcp-remote ran its own browser login. Rejected: native
  HTTP + OAuth, because mcp-manager cannot discover zepto's authorization server
  and the API cannot seed `oauth.issuer`.
- blinkit goes on mcp-manager as stdio `node ~/installs/blinkit-mcp/dist/index.js`.
  It authenticates by OTP through its own tools, not OAuth.
- The roster lives in `sync-mcp.py`, not inline in sync.sh. It does not go in a
  per-workspace `.dsh/dshmm/mcp.json`, because workspace servers register only
  into sessions whose cwd is that workspace, which is wrong for servers used
  everywhere.

## Critical context

- A patch row id must be unique across every bundle layer. `dsh-base` already
  mounts `command-compact`, and `dsh-web-app` then disables it, because the web
  app moves the compaction backend into the preset plane. An `insert:` row that
  reused that id killed boot with "duplicate loader entry id: command-compact"
  and blocked login. To re-enable an existing row, write a top-level override
  (`- id: <id>` plus `disabled: false`), never an insert. The `remote` row
  carries the same warning.
- `step_write_web_patch` writes an UNQUOTED heredoc, so `$var` and backticks
  expand. Never put backticks in a comment inside it.
- The mcp-manager API sits behind the dsh-remote auth guard. A local
  `GET /mcp-manager/api/servers` returns 403. sync-mcp.py cannot use its online
  path while dsh web runs, and it refuses to touch the state file then. To
  apply a roster edit, stop dsh web and run the script again.
- zepto authenticates through neither path. mcp-remote opens its OAuth callback
  listener on the server loopback, which a remote browser cannot reach, and
  zepto's own auth server returns 403 to dynamic client registration, so
  mcp-manager OAuth cannot replace it. It stays in the roster and stays
  unauthenticated by decision.
- The mcp-manager UI is Chinese only at pin 69d5cbc: 85 hardcoded Chinese
  literals, no locale detection, no translation table.
- easyeda is a static `dsh-mcp-client` row, so it never shows in Settings →
  MCP. That page lists only the servers mcp-manager owns.
- easyeda exposes no project-list tool, and the bridge advertises no
  `project.list` capability. Every tool reads the document EasyEDA Pro has
  focused, so a project must be open in the editor first.
