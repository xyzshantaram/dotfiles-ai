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

### T4 — restart and verify

The package is built, installed on the web profile, and smoke-tested against a
real Context: `register` runs with key `durable-todos/todos`, a `todo/write`
sets the list, a following `turn/start` keeps the items and flips
`carriedOver`, and a second `turn/start` returns the same state reference. What
remains is the restart, which drops the running server and so belongs to the
user.

**Acceptance criteria**

- After the restart the journal shows the `durable-todos` row mounting with no
  duplicate loader entry id.
- The human review queue items below pass.

## Human review queue (shared, both efforts)

- [ ] After deploy restart: open a fresh session — durable-todos panel shows
  "no todos" state; run a todo write — items render; restart dsh-web and reopen
  the session — list survives.
- [ ] Interrupt: with unfinished todos on screen, interrupt the agent and send
  another message — the durable panel still lists the items after the new turn
  starts, while the official panel blanks as it does today.
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

# Effort 4 — our own MCP manager plugin

## Vision

One plugin owns every MCP server. It replaces both the static `dsh-mcp-client`
rows and the vendored hyqhyq3 manager. The official MCP SDK supplies both
transports and the whole OAuth flow, so the plugin stays small. The SDK follows
the `resource_metadata` pointer that hyqhyq3 ignores, which gives zepto a real
chance to authenticate for the first time.

## Settled decisions (from grilling, 2026-09-02)

- The plugin owns all seven servers and both transports. stdio: nostrbook,
  gitlab, easyeda, blinkit. http with OAuth: swiggy-food, swiggy-instamart,
  zepto. zepto drops the mcp-remote hop and becomes a direct http server.
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

### T1 — config file, schema and sync step

Create `plugins/mcp-servers` with its host half, add `mcp-servers.json` with all
seven servers, and add a sync.sh step that copies it to
`$DSH_HOME/mcp-servers.json`. Add the reader that parses the file and
normalizes each entry to a server record.

**Eval:** sync.sh copies the file. A malformed file logs one clear error and
leaves the previous config active rather than crashing the host.

### T2 — host: transports and tool registration

Connect each server through the SDK, list its tools, and register them as
`mcp__<name>__*` with per-server disposers. stdio and http both.

**Eval:** `mcp__nostrbook__*`, `mcp__gitlab__*` and `mcp__easyeda__*` appear in
a fresh session and one easyeda call returns real data. Disposal unregisters
every tool.

### Closed — T3 OAuth, with the zepto verdict kept

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

### T5 remainder — remove the stale mcp-manager state file

Every code change for T4 and T5 is done. One host-side leftover is not: delete
`~/.dsh/mcp-manager.json` after the next sync. sync.sh does not remove it,
because the file holds the OAuth tokens of a plugin that is now uninstalled, and
deleting a secrets file behind the user's back is worse than leaving it.

**Eval:** after the next sync and restart, the journal shows no `mcp-manager`
row, and no tool name is registered twice.

---

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

## Tickets

### T5 — translate the settings card in `src/client.js`

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

