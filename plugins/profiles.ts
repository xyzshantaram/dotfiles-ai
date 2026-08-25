/**
 * profiles — per-role subagent routing AND profile-driven LLM failover, on
 * the host plane. One plugin because both halves serve one feature: the
 * model route is a property of the active profile, not of any preset.
 *
 * The problem. Delegation tools are agent-plane rows, so per-role model
 * routing would normally mean forking a preset composition. That bakes one
 * route into one preset. The requirement is the opposite: every agent preset
 * gets the role tools, and the work/personal model choice stays a runtime
 * setting, not composition text.
 *
 * ── Half 1: role delegation tools ──────────────────────────────────────
 *
 * Registers three thin delegation tools — `coder`, `tester`, `researcher` —
 * over the same `ctx.subagents` seam the shipped `subagent` tool uses. Each
 * tool starts a leaf child (maxDepth 1) whose route HEAD resolves AT CALL
 * TIME: a per-role pin from Config, else the active `profile` entry's head,
 * else no agentOptions (the child inherits agent-default-model).
 *
 * Personas deliberately stay OUT of this plugin: the coder/tester/researcher
 * skills are the one source of truth; the dispatch prompt names the skill.
 *
 * ── Half 2: LLM failover along the active chain ─────────────────────────
 *
 * Hooks `agent/request` and `agent/request-error` (design stolen MIT from
 * CanGeng/llm-fallback; dormancy idea from @visol-456/dsh-llm-fallback) so
 * EVERY agent — main sessions, role children, see children — fails over
 * along the active profile entry's chain when a route faults. A request
 * whose (provider, model) equals ANY level of the active chain fails over
 * from the NEXT level; all other requests pass through untouched. Levels may
 * change the model as well as the provider: the retry pass re-enters the
 * `agent/request` waterfall, where this plugin returns the next level's full
 * {provider, model}.
 *
 * W21 named chains: each profile entry holds TWO chains, one per agent
 * depth. Depth-0 agents ride the orchestrator chain; any spawned child
 * (depth >= 1) rides the subagent chain. The chains are ordered failover
 * lists. A persistent fault (no-credits / model-unavailable / auth /
 * bad-request) marks the rung down in a host-side cache for >= 10 minutes;
 * selections inside the window skip the dead rung. Any `profile` namespace
 * update clears the cache: a manual switch or save allows immediate retry.
 *
 * There is NO second config surface: the chains ARE the `profile` namespace
 * entries (see.ts owns the namespace; this plugin reads it live). Flipping
 * `profile.active` swaps heads, chains, and failover order for every future
 * request with no restart.
 *
 * Failover semantics:
 * - Stay on the matched level within a step so request prefixes stay
 *   stable; advance only when the current level fails.
 * - Each NEW step starts back at the matched level. During a hard outage
 *   every step pays one failed attempt before failing over; the error cache
 *   skips the dead rung on later selections.
 * - Before proposing a level, probe it with ctx.llm.resolveCallConfig and
 *   skip levels that would fail before streaming (unregistered route,
 *   unknown model). An abort during the probe surfaces as an abort.
 * - An adapter whose retryPolicy.mode is "always" retries forever by
 *   itself; non-last always-levels are capped at alwaysMaxRetries
 *   same-provider retries before failing over, and an always level may not
 *   be last (it can never terminate).
 * - A user abort is never a failover trigger.
 * - Composition with the shipped dsh-llm-retry: both listen on
 *   `agent/request-error`; the host-base retry layer runs first, so
 *   same-provider retries exhaust before this plugin advances a level.
 *
 * ── Flip propagation ────────────────────────────────────────────────────
 *
 * On a `profile.active` flip, clear the error cache and push the new active
 * head into `agent-default-model` via its own saveSelection, so sessions
 * created from then on compose on that route (a live session keeps its
 * current model; its requests still fail over per the rules above
 * regardless). There is no harness-native failover for the session's own
 * model — verified against dsh-agent-default-model/lib/index.js; head-sync
 * plus these waterfalls is the closest reachable behavior.
 *
 * Settings are read WITHOUT ownership (`ctx.settings.get(ns)` resolves any
 * registered namespace; duplicate registration fails loud — see.ts owns
 * `profile`). Lazy `ctx.get(...)` lookups keep this plugin loadable when no
 * settings provider mounts.
 *
 * Seams (verified against installed rc.8 source):
 * - Request construction mirrors @deepseek-ai/dsh-tool-subagent/lib/index.js
 *   (:222-233 request; :241-248 continuable `{childId}`; :262/:271 start).
 * - Leaf guardrail: maxDepth 1; resolveChildDepth rejects depth 2+
 *   (dsh-subagent/lib/index.js:486-489).
 * - `agent/request`: dsh-agent-loop/lib/index.js:708; proposal needs
 *   non-empty provider and model (:714). `agent/request-error` returning
 *   `{ kind: 'retry' }`: :653, kind check :662. The dispatcher emits both
 *   waterfalls with only {turn, step, signal} (and provider/failure/retryPolicy
 *   on the error path) — `agent` is NOT in the payload (it lives in the
 *   agent-scoped context). Failover keys its per-step state on turn:step.
 * - `ctx.llm.resolveCallConfig`: dsh-llm/lib/index.js:1351.
 *   `providerRetryPolicy`: dsh-llm/lib/index.js:1260.
 * - Depth: dsh-subagent/lib/types/depth.js delegationDepthOf —
 *   `Math.max(agent.session.header.delegationDepth ?? 0,
 *   agent.options.subagentDepth ?? 0)`.
 *
 * NOT-VERIFIED until live: end-to-end failover under a real 429, and that
 * the retry pass re-enters `agent/request` (it must, for the rewrite).
 *
 * Mount (sync.sh writes this row):
 *
 *   - id: profiles
 *     name: /path/to/plugins/profiles.js
 *     # config:
 *     #   provider: spawn        # subagents provider, defaults to spawn
 *     #   alwaysMaxRetries: 2
 *     #   roles:
 *     #     coder: { provider: opencode-zen, model: big-pickle }   # head pin
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type { LlmCallConfig } from "@deepseek-ai/dsh-llm";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import type { RequestErrorAction } from "@deepseek-ai/dsh-agent";
import { chainOf, type RouteCandidate } from "./profile-routes";
import type { IncomingMessage, ServerResponse } from "node:http";

export const name = "profiles";

export const inject = ["tools", "subagents", "systemPrompt"] as const;

export const Config = z.object({
  /** The subagents provider to start children on. The standard preset uses spawn. */
  provider: z.string().default("spawn"),
  /** Same-provider retry cap for retryPolicy.mode="always" adapters. */
  alwaysMaxRetries: z.number().step(1).min(1).default(2),
});

type ProfilesConfig = {
  provider?: string;
  alwaysMaxRetries?: number;
};

/** Shape of the `profile` settings namespace owned by see.ts. */
interface ProfileSettings {
  active?: string;
  /** Named-chain library: name -> { routes: [...] }; string refs resolve here. */
  chains?: Record<string, unknown>;
  work?: unknown;
  personal?: unknown;
}

/** Minimal structural views of services, looked up lazily. */
interface SettingsService {
  get(ns: string): unknown;
}
interface LlmService {
  resolveCallConfig(config: unknown, signal?: AbortSignal): Promise<unknown>;
  providerRetryPolicy(provider: string): { mode?: string } | undefined;
}

/** The shared namespace, registered by plugins/see.ts. */
const PROFILE_NS = settingsNamespace("profile");

/** One failover level. */
type Level = RouteCandidate;

/** Per-agent failover state for the current step. */
interface StepState {
  stepKey: string;
  levels: Level[];
  cursor: number;
  retries: number;
  failures: Array<{ level: Level; code: string; message: string }>;
}

function service<T>(ctx: Context, name: string): T | undefined {
  return (ctx as { get(name: string): unknown }).get(name) as T | undefined;
}

function activeEntry(profile: ProfileSettings | undefined): unknown {
  return (profile?.active ?? "work") === "personal" ? profile?.personal : profile?.work;
}

// ── Error cache (W21) ───────────────────────────────────────────────────────
// A persistent fault marks one (provider, model, error-class) key down for
// ERROR_WINDOW_MS. Selections skip the dead rung at proposal time and when
// the waterfall walks the chain. Any `profile` namespace update clears the
// whole cache: a manual active flip rewrites every chain anyway.
const ERROR_WINDOW_MS = 600_000; // >= 10 minutes
const ERROR_CLASSES = ["no-credits", "model-unavailable", "auth", "bad-request"] as const;
type ErrorClass = (typeof ERROR_CLASSES)[number];
const downCache = new Map<string, number>();

function errorKey(level: Level, cls: ErrorClass): string {
  return `${level.provider}:${level.model}:${cls}`;
}

/**
 * Classify a provider failure code/message into a cacheable error class.
 * Matches code constants and message substrings; anything else is transient
 * and is NOT cached.
 */
function normalizeErrorClass(code: string | undefined, message: string): ErrorClass | undefined {
  const c = String(code ?? "").toLowerCase();
  const m = String(message ?? "").toLowerCase();
  const hit = (...needles: string[]) => needles.some((n) => c.includes(n) || m.includes(n));
  if (hit("401", "unauthorized", "authentication", "invalid api key")) return "auth";
  if (hit("400", "bad request", "bad_request", "invalid request")) return "bad-request";
  if (
    hit("quota", "balance", "insufficient", "credit", "usage limit", "billing", "429", "rate limit")
  )
    return "no-credits";
  if (hit("model", "not found", "unavailable", "404", "no such model")) return "model-unavailable";
  return undefined;
}

function markDown(level: Level, code: string | undefined, message: string): void {
  const cls = normalizeErrorClass(code, message);
  if (!cls) return;
  downCache.set(errorKey(level, cls), Date.now());
}

/** True when ANY class key of the level is inside the window. */
function isCachedDown(level: Level): boolean {
  const now = Date.now();
  for (const cls of ERROR_CLASSES) {
    const at = downCache.get(errorKey(level, cls));
    if (at !== undefined && now - at < ERROR_WINDOW_MS) return true;
  }
  return false;
}

// ── Depth resolution (W21) ─────────────────────────────────────────────────
// Mirrors dsh-subagent delegationDepthOf: the persisted header depth is the
// floor; options.subagentDepth may deepen it. Depth-0 rides the orchestrator
// chain; any spawned child (depth >= 1) rides the subagent chain.
function depthOf(agent: unknown): number {
  const a = agent as
    | { session?: { header?: { delegationDepth?: number } }; options?: { subagentDepth?: number } }
    | null
    | undefined;
  const header = a?.session?.header?.delegationDepth ?? 0;
  const options = a?.options?.subagentDepth ?? 0;
  return Math.max(header, options);
}

/**
 * The active profile entry's chain for one agent depth. Depth-0 rides the
 * orchestrator chain; any spawned child (depth >= 1) rides the subagent
 * chain. Falls back to the other named chain, then to the legacy single
 * `routes` shape, then to []. String fields resolve through the profile's
 * `chains` map.
 */
function chainForDepth(ctx: Context, depth: number): Level[] {
  const settings = service<SettingsService>(ctx, "settings");
  const profile = settings?.get(PROFILE_NS) as ProfileSettings | undefined;
  return chainOf(activeEntry(profile), depth >= 1 ? "subagent" : "orchestrator", profile?.chains);
}

/** Install the two agent waterfalls that provide chain failover. */
function registerFailover(ctx: Context, alwaysMaxRetries: number): void {
  // Keyed by the request coordinate (turn:step). The harness bubbles agent/request
  // and agent/request-error to the host plane with only {turn, step, signal} in the
  // payload — `agent` is NOT present here (it lives in the agent-scoped context, not
  // the payload). turn:step is stable across one step's retries, so a retry resumes
  // at the advanced cursor.
  // Bounded per-step failover state. A WeakMap would auto-collect, but the key
  // is now turn:step (not the agent), so we evict explicitly: an entry lives
  // only for one step's retry sequence, then is dropped on abort/exhaustion.
  // STATE_CAP bounds memory for long-lived sessions that never hit those paths.
  const STATE_CAP = 1024;
  const state = new Map<string, StepState>();
  const stateOrder: string[] = [];
  const setState = (key: string, value: StepState): void => {
    if (!state.has(key)) {
      stateOrder.push(key);
      if (stateOrder.length > STATE_CAP) {
        const oldest = stateOrder.shift();
        if (oldest) state.delete(oldest);
      }
    }
    state.set(key, value);
  };
  const clearState = (key: string): void => {
    if (state.delete(key)) {
      const idx = stateOrder.indexOf(key);
      if (idx >= 0) stateOrder.splice(idx, 1);
    }
  };
  const keyOf = (turn: unknown, step: unknown): string => `${String(turn)}:${String(step)}`;

  ctx.on("agent/request", async (payload: unknown, next: () => Promise<unknown>) => {
    const proposal = (await next()) as LlmCallConfig;
    if (!proposal?.provider || !proposal.model) return proposal;

    const p = payload as { turn?: unknown; step?: unknown; signal?: AbortSignal };
    const stepKey = keyOf(p.turn, p.step);

    // W21: the chain is chosen by depth (0 -> orchestrator, child ->
    // subagent). The depth is not in the payload (the agent lives in the
    // agent-scoped context, not here), so match the proposal against BOTH
    // chains and prefer the subagent chain when the proposal is in it: a
    // subagent on the worker head matches the subagent chain and fails over
    // along it, a main-agent request on an orchestrator rung matches the
    // orchestrator chain. A model present in both chains routes on the
    // subagent chain (the worker fallback set is a superset that includes
    // the orchestrator tail). The error cache is honored while walking.
    const orchestrator = chainForDepth(ctx, 0);
    const subagentChain = chainForDepth(ctx, 1);
    const chain = subagentChain.some(
      (l) => l.provider === proposal.provider && l.model === proposal.model,
    )
      ? subagentChain
      : orchestrator;
    // chain's remaining rungs. The choice may be the chain head (the list
    // keeps every rung once) or off-chain (it prefixes the chain).
    const agentDefaultModel = service<{
      currentSelection(): { provider: string; model: string } | undefined;
    }>(ctx, "agentDefaultModel");
    const selection = agentDefaultModel?.currentSelection?.();
    const levels = selection
      ? [
          selection,
          ...chain.filter(
            (level) => !(level.provider === selection.provider && level.model === selection.model),
          ),
        ]
      : chain;
    // Failover applies from the matched level onward; unmatched requests
    // (a pick for another rung, an unrelated provider) pass through.
    const matched = levels.findIndex(
      (level) => level.provider === proposal.provider && level.model === proposal.model,
    );
    if (matched < 0) return proposal;

    let s = state.get(stepKey);
    if (!s || s.stepKey !== stepKey) {
      s = { stepKey, levels, cursor: matched, retries: 0, failures: [] };
      setState(stepKey, s);
    }

    const llm = service<LlmService>(ctx, "llm");

    // Skip rungs the error cache has down, then levels that would fail
    // before streaming. An abort during the probe must surface as an abort.
    while (s.cursor < s.levels.length) {
      const candidate = s.levels[s.cursor];
      if (isCachedDown(candidate)) {
        s.cursor += 1;
        continue;
      }
      try {
        await llm?.resolveCallConfig(
          { ...proposal, provider: candidate.provider, model: candidate.model },
          p.signal,
        );
        break;
      } catch (error) {
        if (p.signal?.aborted) throw error;
        const err = error as { code?: string; message?: string };
        s.failures.push({
          level: candidate,
          code: err?.code ?? "UNKNOWN",
          message: err?.message ?? String(error),
        });
        markDown(candidate, err?.code, err?.message ?? String(error));
        s.cursor += 1;
      }
    }

    if (!s || s.cursor >= s.levels.length) {
      const tried = s
        ? s.failures
            .map((f) => `  - ${f.level.provider}/${f.level.model}: ${f.code} — ${f.message}`)
            .join("\n")
        : "(no levels)";
      throw new Error(`profiles: no level can serve the active chain:\n${tried}`);
    }

    const level = s.levels[s.cursor];
    return {
      ...proposal,
      provider: level.provider,
      model: level.model,
      ...(level.reasoningEffort
        ? { reasoningEffort: level.reasoningEffort as LlmCallConfig["reasoningEffort"] }
        : {}),
    };
  });

  ctx.on("agent/request-error", (payload: unknown, next: () => Promise<RequestErrorAction>) => {
    const p = payload as {
      turn?: unknown;
      step?: unknown;
      signal?: AbortSignal;
      failure?: { code?: string; message?: string };
      retryPolicy?: { mode?: string };
    };
    const s = state.get(keyOf(p.turn, p.step));
    if (!s || s.stepKey !== keyOf(p.turn, p.step)) return next();

    const cur = s.levels[s.cursor];
    if (!cur) return next();

    // A user abort is never a failover trigger.
    if (p.signal?.aborted) {
      clearState(keyOf(p.turn, p.step));
      return next();
    }

    const failure = p.failure ?? {};
    const last = s.failures[s.failures.length - 1];
    if (last && last.level.provider === cur.provider && last.level.model === cur.model) {
      last.code = failure.code ?? "UNKNOWN";
      last.message = failure.message ?? "";
    } else {
      s.failures.push({
        level: cur,
        code: failure.code ?? "UNKNOWN",
        message: failure.message ?? "",
      });
    }

    // W21: a persistent fault marks the rung down so later selections skip it.
    markDown(cur, failure.code, failure.message ?? "");

    // An "always" adapter retries itself endlessly; cap it, then advance.
    if (p.retryPolicy?.mode === "always") {
      s.retries += 1;
      if (s.retries <= alwaysMaxRetries) return next();
    }
    s.retries = 0;

    s.cursor += 1;
    // Skip rungs the error cache has down while walking the chain.
    while (s.cursor < s.levels.length && isCachedDown(s.levels[s.cursor])) s.cursor += 1;

    if (s.cursor < s.levels.length) {
      const nxt = s.levels[s.cursor];
      ctx.logger.warn(
        "profiles: %s/%s failed (%s) -> failing over to %s/%s",
        cur.provider,
        cur.model,
        failure.code ?? "UNKNOWN",
        nxt.provider,
        nxt.model,
      );
      return { kind: "retry" } as unknown as Promise<RequestErrorAction>;
    }

    const tried = s.failures
      .map((f) => `  - ${f.level.provider}/${f.level.model}: ${f.code} — ${f.message}`)
      .join("\n");
    clearState(keyOf(p.turn, p.step));
    throw new Error(`profiles: all levels exhausted for the active chain:\n${tried}`);
  });
}

/**
 * Push the active chain's head into agent-default-model so future sessions
 * compose on the flipped profile's primary route. The orchestrator chain
 * head IS the profile head (the orchestrator chain matches the pre-W21 flat
 * chain for both profiles).
 */
function syncDefaultModel(ctx: Context, profile: ProfileSettings | undefined): void {
  const head = chainOf(activeEntry(profile), "orchestrator", profile?.chains)[0];
  if (!head) return;
  const agentDefaultModel = service<{
    saveSelection(next: {
      provider: string;
      model: string;
      reasoningEffort?: string;
    }): Promise<void>;
  }>(ctx, "agentDefaultModel");
  void agentDefaultModel
    ?.saveSelection({
      provider: head.provider,
      model: head.model,
      ...(head.reasoningEffort ? { reasoningEffort: head.reasoningEffort } : {}),
    })
    .catch(() => {});
}

// ── W24: settings panel routes ────────────────────────────────────────────
// GET /profiles/config returns the resolved `profile` namespace: string chain
// refs resolve through profile.chains, then the entry normalizes to the
// canonical nested shape plus error-cache info. PUT validates
// strictly and writes through the SAME settings service this plugin reads
// (settings.replace on the registered namespace), so the write hot-applies:
// the settings/updated listener below clears the error cache and re-syncs the
// default model, and every selection reads the namespace live.

/** Write-side of the settings service this plugin already reads. */
interface SettingsWriteService extends SettingsService {
  replace(ns: string, section: unknown): Promise<void>;
}

/** One canonical W21 entry: both named chains, each an ordered routes list. */
interface CanonicalEntry {
  orchestrator: { routes: RouteCandidate[] };
  subagent: { routes: RouteCandidate[] };
}

function canonicalEntry(entry: unknown, chains?: Record<string, unknown>): CanonicalEntry {
  return {
    orchestrator: { routes: chainOf(entry, "orchestrator", chains) },
    subagent: { routes: chainOf(entry, "subagent", chains) },
  };
}

function canonicalConfig(profile: ProfileSettings | undefined) {
  return {
    active: profile?.active ?? "work",
    chains: profile?.chains,
    work: canonicalEntry(profile?.work, profile?.chains),
    personal: canonicalEntry(profile?.personal, profile?.chains),
  };
}

// TODO(dedup): use plugins/shared/http.ts sendJson/readBody
const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  const declared = req.headers["content-length"];
  if (declared !== undefined && Number(declared) > MAX_BODY_BYTES) {
    throw new Error("request body too large");
  }
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.byteLength;
    if (received > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("body is not valid JSON");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function validateRouteRow(value: unknown, path: string): Validated<RouteCandidate> {
  if (!isPlainObject(value)) return { ok: false, error: `${path} must be an object` };
  for (const key of Object.keys(value)) {
    if (key !== "provider" && key !== "model" && key !== "reasoningEffort") {
      return { ok: false, error: `${path} has unknown key "${key}"` };
    }
  }
  const provider = value.provider;
  const model = value.model;
  if (typeof provider !== "string" || provider.length === 0) {
    return { ok: false, error: `${path}.provider must be a non-empty string` };
  }
  if (typeof model !== "string" || model.length === 0) {
    return { ok: false, error: `${path}.model must be a non-empty string` };
  }
  const rawEffort = value.reasoningEffort;
  let reasoningEffort: string | undefined;
  if (rawEffort !== undefined) {
    if (typeof rawEffort !== "string" || rawEffort.length === 0) {
      return { ok: false, error: `${path}.reasoningEffort must be a non-empty string` };
    }
    reasoningEffort = rawEffort;
  }
  return {
    ok: true,
    value: {
      provider,
      model,
      ...(reasoningEffort !== undefined ? { reasoningEffort } : {}),
    },
  };
}

function validateChain(value: unknown, path: string): Validated<unknown> {
  if (isPlainObject(value)) {
    // {routes: [...]} form — validate each route pair.
    for (const key of Object.keys(value)) {
      if (key !== "routes") return { ok: false, error: `${path} has unknown key "${key}"` };
    }
    if (!Array.isArray(value.routes))
      return { ok: false, error: `${path}.routes must be an array` };
    for (let i = 0; i < value.routes.length; i++) {
      const row = validateRouteRow(value.routes[i], `${path}.routes[${i}]`);
      if (row.ok === false) return row;
    }
    return { ok: true, value };
  }
  if (Array.isArray(value)) {
    // Composition array: each step is a string ("provider/model" or "chain:<name>")
    // or a route pair object.
    for (let i = 0; i < value.length; i++) {
      const step = value[i];
      if (typeof step === "string") {
        if (step.length === 0)
          return { ok: false, error: `${path}[${i}] must be a non-empty string` };
      } else if (isPlainObject(step)) {
        const row = validateRouteRow(step, `${path}[${i}]`);
        if (row.ok === false) return row;
      } else {
        return { ok: false, error: `${path}[${i}] must be a string or route pair` };
      }
    }
    return { ok: true, value };
  }
  return { ok: false, error: `${path} must be an object ({routes}) or array (composition)` };
}

/** Like validateChain, but a non-empty string (naming a `chains` key) is also valid. W24 field-level refs; see plugins/profile-routes.ts normalizeEntry. */
function validateEntryField(value: unknown, path: string): Validated<unknown> {
  if (typeof value === "string") {
    if (value.length === 0) return { ok: false, error: `${path} must be a non-empty string` };
    return { ok: true, value };
  }
  return validateChain(value, path);
}

function validateEntry(
  value: unknown,
  path: string,
): Validated<{ orchestrator: unknown; subagent: unknown }> {
  if (!isPlainObject(value)) return { ok: false, error: `${path} must be an object` };
  for (const key of Object.keys(value)) {
    if (key !== "orchestrator" && key !== "subagent") {
      return { ok: false, error: `${path} has unknown key "${key}"` };
    }
  }
  const orchestrator = validateEntryField(value.orchestrator, `${path}.orchestrator`);
  if (orchestrator.ok === false) return orchestrator;
  const subagent = validateEntryField(value.subagent, `${path}.subagent`);
  if (subagent.ok === false) return subagent;
  return { ok: true, value: { orchestrator: orchestrator.value, subagent: subagent.value } };
}

type ChainLibrary = Record<string, unknown>;

function validateChains(value: unknown, path: string): Validated<ChainLibrary> {
  if (!isPlainObject(value)) return { ok: false, error: `${path} must be an object` };
  const result: ChainLibrary = {};
  for (const key of Object.keys(value)) {
    const chain = validateChain(value[key], `${path}.${key}`);
    if (chain.ok === false) return chain;
    result[key] = chain.value;
  }
  return { ok: true, value: result };
}

function validateSection(value: unknown): Validated<{
  active: string;
  work: unknown;
  personal: unknown;
  chains?: ChainLibrary;
}> {
  if (!isPlainObject(value)) return { ok: false, error: "config must be an object" };
  for (const key of Object.keys(value)) {
    if (key !== "active" && key !== "work" && key !== "personal" && key !== "chains") {
      return { ok: false, error: `unknown key "${key}"` };
    }
  }
  const active = value.active;
  if (typeof active !== "string" || (active !== "work" && active !== "personal")) {
    return { ok: false, error: 'active must be "work" or "personal"' };
  }
  const work = validateEntry(value.work, "work");
  if (work.ok === false) return work;
  const personal = validateEntry(value.personal, "personal");
  if (personal.ok === false) return personal;
  let chains: ChainLibrary | undefined;
  if (value.chains !== undefined) {
    const validatedChains = validateChains(value.chains, "chains");
    if (validatedChains.ok === false) return validatedChains;
    chains = validatedChains.value;
  }
  return { ok: true, value: { active, work: work.value, personal: personal.value, chains } };
}

function makeConfigHandler(ctx: Context) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method === "GET") {
      const settings = service<SettingsService>(ctx, "settings");
      const profile = settings?.get(PROFILE_NS) as ProfileSettings | undefined;
      sendJson(res, 200, {
        ok: true,
        config: canonicalConfig(profile),
        errorCache: { ttlMs: ERROR_WINDOW_MS, down: [...downCache.keys()] },
      });
      return;
    }
    if (req.method === "PUT") {
      const settings = service<SettingsWriteService>(ctx, "settings");
      if (settings === undefined) {
        sendJson(res, 503, { ok: false, error: "settings service unavailable" });
        return;
      }
      let body: unknown;
      try {
        body = await readBody(req);
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      const validated = validateSection(body);
      if (validated.ok === false) {
        sendJson(res, 400, { ok: false, error: validated.error });
        return;
      }
      try {
        await settings.replace(PROFILE_NS, validated.value);
      } catch (error) {
        sendJson(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      const profile = settings.get(PROFILE_NS) as ProfileSettings | undefined;
      sendJson(res, 200, {
        ok: true,
        config: canonicalConfig(profile),
        errorCache: { ttlMs: ERROR_WINDOW_MS, down: [...downCache.keys()] },
      });
      return;
    }
    sendJson(res, 405, { ok: false, error: `method ${req.method} not allowed` });
  };
}

function makeSwitchHandler(ctx: Context) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "PUT") {
      sendJson(res, 405, { ok: false, error: `method ${req.method} not allowed` });
      return;
    }
    const settings = service<SettingsWriteService>(ctx, "settings");
    if (settings === undefined) {
      sendJson(res, 503, { ok: false, error: "settings service unavailable" });
      return;
    }
    let body: unknown;
    try {
      body = await readBody(req);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const rawActive = isPlainObject(body) ? body.active : undefined;
    if (typeof rawActive !== "string" || (rawActive !== "work" && rawActive !== "personal")) {
      sendJson(res, 400, { ok: false, error: 'active must be "work" or "personal"' });
      return;
    }
    const profile = settings.get(PROFILE_NS) as ProfileSettings | undefined;
    const next = { ...(profile ?? {}), active: rawActive };
    try {
      await settings.replace(PROFILE_NS, next);
    } catch (error) {
      sendJson(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      return;
    }
    const after = settings.get(PROFILE_NS) as ProfileSettings | undefined;
    sendJson(res, 200, {
      ok: true,
      config: canonicalConfig(after),
      errorCache: { ttlMs: ERROR_WINDOW_MS, down: [...downCache.keys()] },
    });
  };
}

export function apply(ctx: Context, config: unknown): void {
  const cfg = (config ?? {}) as ProfilesConfig;

  registerFailover(ctx, cfg.alwaysMaxRetries ?? 2);

  // W24: the settings panel reads/writes the profile namespace over these
  // routes. Lazy inject so the plugin still loads where no web server mounts.
  ctx.inject(["webServer"], (scope) => {
    const server = (scope as unknown as { webServer: { register(options: unknown): unknown } })
      .webServer;
    server.register({
      kind: "exact",
      path: "/profiles/config",
      handler: makeConfigHandler(ctx),
    });
    server.register({
      kind: "exact",
      path: "/profiles/switch",
      handler: makeSwitchHandler(ctx),
    });
  });

  // Main-agent sync + error-cache reset: only on profile flips, never at
  // boot, never on writes the model picker made to its own namespace.
  ctx.on("settings/updated", (ns, next) => {
    if (ns !== PROFILE_NS) return;
    downCache.clear();
    syncDefaultModel(ctx, next as ProfileSettings);
  });

  // W-new-project: reset the default model to the active profile's head on
  // every new TOP-LEVEL session (role/see children have delegationDepth >= 1
  // and must not trigger this — mirrors depthOf()'s ?? 0 pattern). Undoes a
  // stale manual pick (session.selectModel also saves it as the global
  // default) leaking into new projects/sessions.
  ctx.on("session/created", (session: unknown) => {
    const depth =
      (session as { header?: { delegationDepth?: number } } | null | undefined)?.header
        ?.delegationDepth ?? 0;
    if (depth > 0) return;
    const settings = service<SettingsService>(ctx, "settings");
    const profile = settings?.get(PROFILE_NS) as ProfileSettings | undefined;
    syncDefaultModel(ctx, profile);
  });

  ctx.systemPrompt.section({
    name: "tool:profiles",
    order: 116.4,
    text:
      "Every subagent runs on the profile-routed worker chain with automatic " +
      "failover: the subagent tool is pinned to the worker chain head and a " +
      "fault advances to the next rung (see the profile settings panel). " +
      "Start independent delegations together in one message.",
  });
}
