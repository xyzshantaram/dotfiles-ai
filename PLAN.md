# Plan — profiles plugin audit and hardening, plus sync-models.mjs hardening

## Vision

Make the profiles plugin correct under concurrency and honest about failure.
Every fallback path must pick the right chain, isolate its state per agent, and
degrade to a working route instead of failing the turn.

This plan also tracks a second, unrelated effort found in the same session:
hardening `sync-models.mjs`'s model-seeding pipeline (real YAML parsing,
marker-region regeneration, and a one-time reseed of `command-code` and
`opencode-zen`). The two efforts share this file only because T6 below cannot
be verified until this second effort lands; they are otherwise independent.

## Verified harness facts

These facts were read from the installed dsh packages in this session. Treat
them as settled. Do not re-research them.

- `agentEvents` fuses the agent into every payload. A listener of
  `agent/request` receives `{ turn, step, signal, agent }`. A listener of
  `agent/request-error` receives `{ turn, step, provider, failure, retryPolicy,
signal, agent }`. Source: `dsh-agent/lib/index.js`, function `agentEvents`.
- `turn` and `step` are per-agent counters on `this.phase`. Two live agents may
  hold the same pair at the same time. Source: `dsh-agent-loop/lib/index.js`
  lines 521, 533, 603.
- Depth reads as `Math.max(agent.session.header.delegationDepth ?? 0,
agent.options.subagentDepth ?? 0)`. Source: `dsh-subagent/lib/index.js`
  lines 43-47.
- `agent/request-error` must return `{ kind: "retry" }` to retry. Any other
  value throws `LlmError`. Source: `dsh-agent-loop/lib/index.js` line 662.
- An empty provider or model in the returned proposal throws
  `agent "<id>" has no provider/model`. Source: `dsh-agent-loop/lib/index.js`
  line 722.
- `resolveCallConfig` throws `LlmError` with a `code` field. Known codes
  include `NO_ADAPTER`, `INVALID_MODEL_INFO`, and
  `UNSUPPORTED_REASONING_EFFORT`. Source: `dsh-llm/lib/index.js` lines 1394,
  1403, 1412, 1415.
- The harness default retryable codes are `EMPTY_RESPONSE`, `RATE_LIMIT`,
  `SERVER`, `TIMEOUT`, and `TRANSPORT`. Source: `dsh-llm/lib/index.js`
  lines 360-367.
- `settings/updated` calls a listener with `(ns, next, prev, source)`.
  Source: `dsh-settings/lib/index.js` lines 561-569.

## Settled decisions

- An off-chain manual pick becomes the head of the level list and then fails
  over along the depth-correct chain.
- The down-cache classifies on structured codes first. Auth, no-credits, and
  model-unavailable hold for 10 minutes. Rate limit holds for 30 seconds. A
  generic 400 is never cached.
- Scope covers the host plugin, the shared route model, and the client panel.
- Cleanup items land in the same pass.

## Tickets

### T1 — route model safety (`plugins/profile-routes.ts`)

**Status:** done
**Fixes:** A11, plus the `routesEqual` effort gap.
**Acceptance criteria:**

- `isRouteCandidate` rejects an empty `provider` or an empty `model`.
- `routesEqual` compares `reasoningEffort` as well as provider and model.
- The module doc states that a blank route row is dropped, and why.
- `pnpm exec tsc --noEmit` reports no new error.

### T2 — down-cache retune (`plugins/profiles.ts`)

**Status:** done
**Fixes:** A4.
**Acceptance criteria:**

- Classification reads `failure.code` against an explicit code table first.
- Message matching survives only as a narrow fallback for auth and no-credits
  wording. No bare `model`, `400`, or `404` substring test remains.
- Each class carries its own time to live. Rate limit uses 30 seconds. The
  other three use 10 minutes.
- `isCachedDown` honors the per-class time to live.

### T3 — failover rewrite (`plugins/profiles.ts`, `registerFailover`)

**Status:** done
**Fixes:** A1, A2, A3, A5, A6, A7, A10.
**Acceptance criteria:**

- Per-step state lives in a `WeakMap` keyed by the agent object. The stored
  `stepKey` still guards a stale step.
- A payload with no agent passes through untouched and logs one warning.
- Depth comes from `depthOf(payload.agent)`. The both-chains guess is gone.
- The level list is the proposal followed by the depth chain minus that route.
  The `agentDefaultModel.currentSelection()` prefix is gone.
- A level whose route differs from the proposal drops the inherited
  `reasoningEffort` unless the level supplies one. The probe builds the same
  config it would return.
- When every level is cached down, the walk retries while ignoring the cache
  and logs a warning. It never throws for cache reasons alone.
- The unreachable `!s` branch and its `"(no levels)"` string are gone.
- `STATE_CAP`, `stateOrder`, and the linear eviction are gone.

### T4 — host routes and flip detection (`plugins/profiles.ts`)

**Status:** done
**Fixes:** A8, A9, A12.
**Acceptance criteria:**

- The local `sendJson`, `readBody`, `isPlainObject`, and `MAX_BODY_BYTES`
  copies are gone. The module imports them from `plugins/shared/http.ts`.
  The `TODO(dedup)` comment is gone.
- `GET` and `PUT` return the raw entry fields plus a `resolved` view, and
  `chains` is always an object.
- The `settings/updated` listener uses `prev`. It clears the cache on any
  profile write. It calls `syncDefaultModel` only when the resolved
  orchestrator head of the active entry changed.
- The module header no longer claims that `agent` is absent from the payload.

### T5 — panel correctness (`plugins/profiles-client/src/client.tsx`)

**Status:** done
**Fixes:** B1, B2, B3, B4, B5, B6.
**Acceptance criteria:**

- The entry chain select renders an option for the current inline or
  composition value, so a populated field never displays as `— none —`.
- The panel edits the raw entry fields served by T4 and never recovers a chain
  name by guessing.
- `cloneRoutes` preserves `reasoningEffort`.
- The save state initializes to a real object, not `null`.
- `useSyncExternalStore` receives stable `subscribe` and `getSnapshot`
  references.
- `addChain` creates an empty chain, not a blank placeholder rung.
- Dead code is gone: the unused `exports` binding, `addChainRung`, and the
  unused `field` parameter of `setChainField`.

### T6 — verification

**Status:** todo
**Acceptance criteria:**

- `node build.mjs` passes and rebuilds every bundle that embeds
  `profile-routes`: `profiles.js`, `see.js`, `profiles-client/dist/client.js`,
  and `subscriptions/lib/client.js`.
- `pnpm exec tsc --noEmit` reports only the known pre-existing errors.
- `pnpm exec prettier --check .` passes.
- The orchestrator independently verifies at least one concrete behavior claim
  per ticket before closing it.

## Critical context

- Bundle outputs under `plugins/*.js`, `plugins/*/dist`, and `plugins/*/lib`
  are committed. `build.mjs` regenerates them. Rebuild after every TypeScript
  change.
- `see.ts` and `plugins/subscriptions/src/client.tsx` also import from
  `profile-routes`. A change there reaches both bundles.
- Do not add a runtime dependency without asking the user.

## Human review queue

- Confirm in the running web GUI that the profiles panel shows the correct
  chain name for each entry field, that a reasoning effort survives a save,
  and that the model seat still applies a profile.

## User preferences and special rules

- Never commit without explicit approval.
