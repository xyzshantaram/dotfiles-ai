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
