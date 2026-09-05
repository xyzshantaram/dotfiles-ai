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
 *   `{ kind: 'retry' }`: :653, kind check :662. The dispatcher fuses agent into
 *   every payload (dsh-agent/lib/index.js agentEvents) — `agent` IS present
 *   with turn/step/signal. Failover keys its per-step state on agent + turn:step.
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
import { sendJson, readBody, isPlainObject } from "./shared/http";
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
// its class time to live. Selections skip the dead rung at proposal time and
// when the waterfall walks the chain. Any `profile` namespace update clears
// the whole cache: a manual active flip rewrites every chain anyway.
const ERROR_CLASSES = ["auth", "no-credits", "model-unavailable", "rate-limit"] as const;
type ErrorClass = (typeof ERROR_CLASSES)[number];
const ERROR_TTL_MS: Record<ErrorClass, number> = {
  auth: 600_000,
  "no-credits": 600_000,
  "model-unavailable": 600_000,
  // Rate limits do not use this base directly. See rateLimitTtlMs below:
  // a fixed window shorter than the same-provider retry loop expires before
  // the next request, so the chain walks back into the limited model and
  // pays the full retry cost again. The window therefore doubles per
  // consecutive strike instead.
  "rate-limit": 60_000,
};
/** Ceiling for the doubling rate-limit window. */
const RATE_LIMIT_MAX_TTL_MS = 900_000;
const downCache = new Map<string, number>();
/** Consecutive rate-limit strikes per level key; drives the doubling window. */
const rateLimitStrikes = new Map<string, number>();

function errorKey(level: Level, cls: ErrorClass): string {
  return `${level.provider}:${level.model}:${cls}`;
}

/** Effective down-window for one cache entry. Rate limits double per strike,
 * capped; every other class uses its fixed table value. */
function effectiveTtlMs(key: string, cls: ErrorClass): number {
  if (cls !== "rate-limit") return ERROR_TTL_MS[cls];
  const strikes = rateLimitStrikes.get(key) ?? 1;
  return Math.min(ERROR_TTL_MS[cls] * 2 ** (strikes - 1), RATE_LIMIT_MAX_TTL_MS);
}

/**
 * Structured failure codes mapped to a cacheable class. The code table is
 * read first, so classification never depends on message wording.
 */
const ERROR_CODE_CLASS: Record<string, ErrorClass> = {
  NO_ADAPTER: "model-unavailable",
  INVALID_MODEL_INFO: "model-unavailable",
  MODEL_NOT_FOUND: "model-unavailable",
  UNKNOWN_MODEL: "model-unavailable",
  HTTP_404: "model-unavailable",
  QUOTA: "rate-limit",
  RATE_LIMIT: "rate-limit",
  HTTP_429: "rate-limit",
  TOO_MANY_REQUESTS: "rate-limit",
  AUTH: "auth",
  UNAUTHORIZED: "auth",
  FORBIDDEN: "auth",
  INVALID_API_KEY: "auth",
  HTTP_401: "auth",
  HTTP_403: "auth",
  NO_CREDITS: "no-credits",
  INSUFFICIENT_QUOTA: "no-credits",
  QUOTA_EXCEEDED: "no-credits",
  PAYMENT_REQUIRED: "no-credits",
  HTTP_402: "no-credits",
};

/**
 * Classify a provider failure into a cacheable class. The no-credits message
 * test runs first, then the structured code table, then the remaining message
 * tests. Anything else is transient and is NOT cached.
 */
export function normalizeErrorClass(
  code: string | undefined,
  message: string,
): ErrorClass | undefined {
  const m = String(message ?? "").toLowerCase();
  // Order matters: a QUOTA code with an insufficient-credits message must
  // stay no-credits, so the no-credits message test runs before the code
  // table; the remaining message tests run after it.
  if (
    /insufficient\s+(funds|balance|credits?|quota)|quota exceeded|billing|payment required|out of credits?/.test(
      m,
    )
  ) {
    return "no-credits";
  }
  const codeClass = code ? ERROR_CODE_CLASS[code.trim().toUpperCase()] : undefined;
  if (codeClass !== undefined) return codeClass;
  if (
    /invalid api key|unauthorized|authentication fail|invalid authentication|permission denied/.test(
      m,
    )
  ) {
    return "auth";
  }
  if (/rate limit|too many requests|usage limit|usage_limit/.test(m)) {
    return "rate-limit";
  }
  if (
    /unknown model|no such model|has no configured model|no configured model|model .{0,40}(not found|does not exist|is not available|is not supported)/.test(
      m,
    )
  ) {
    return "model-unavailable";
  }
  return undefined;
}

function markDown(level: Level, code: string | undefined, message: string): void {
  const cls = normalizeErrorClass(code, message);
  if (!cls) return;
  const key = errorKey(level, cls);
  downCache.set(key, Date.now());
  if (cls === "rate-limit") {
    rateLimitStrikes.set(key, (rateLimitStrikes.get(key) ?? 0) + 1);
  }
}

/** True when ANY class key of the level is inside its class window. */
function isCachedDown(level: Level): boolean {
  const now = Date.now();
  for (const cls of ERROR_CLASSES) {
    const key = errorKey(level, cls);
    const at = downCache.get(key);
    if (at === undefined) continue;
    if (now - at < effectiveTtlMs(key, cls)) return true;
    downCache.delete(key);
    rateLimitStrikes.delete(key);
  }
  return false;
}

/** Prune expired entries; return the down keys still inside their class window. */
function liveDownKeys(): string[] {
  const now = Date.now();
  for (const [key, at] of downCache) {
    const cls = key.slice(key.lastIndexOf(":") + 1) as ErrorClass;
    if (now - at >= effectiveTtlMs(key, cls)) {
      downCache.delete(key);
      rateLimitStrikes.delete(key);
    }
  }
  return [...downCache.keys()];
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
 * Human-readable session label for failover log lines, mirroring the session
 * header shape used elsewhere in this codebase (session.header.id).
 */
function sessionLabel(agent: unknown): string {
  const a = agent as { session?: { header?: { id?: unknown }; id?: unknown } } | null | undefined;
  const id = a?.session?.header?.id ?? a?.session?.id;
  return id === undefined ? "unknown" : String(id);
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
  return chainOf(
    activeEntry(profile),
    depth >= 1 ? "subagent" : "orchestrator",
    profile?.chains,
    ctx,
  );
}

/** Install the two agent waterfalls that provide chain failover. */
function registerFailover(ctx: Context, alwaysMaxRetries: number): void {
  // Per-agent failover state. WeakMap keyed by the agent object isolates
  // concurrent agents (turn:step is per-agent, not global). The stored
  // stepKey still guards a stale step within one agent. A plain Map keyed
  // on "turn:step" would collide across agents at the same coordinate.
  const state = new WeakMap<object, Map<string, StepState>>();
  // Last provider/model logged at info for this agent, so a steady chain
  // (the common case) logs once and then stays quiet instead of repeating
  // "chain selected" on every single step. A real change -- an actual
  // failover, or the first request of a session -- still logs at info. A
  // step that lands back on the same level as last time logs at debug
  // instead, matching this bundle's convention: info is a state change a
  // person would want in a normal-volume log, debug is per-call trace.
  const lastSelected = new WeakMap<object, string>();

  function getAgentState(agent: object): Map<string, StepState> {
    let m = state.get(agent);
    if (!m) {
      m = new Map<string, StepState>();
      state.set(agent, m);
    }
    return m;
  }

  const keyOf = (turn: unknown, step: unknown): string => `${String(turn)}:${String(step)}`;

  function buildConfig(proposal: LlmCallConfig, candidate: Level): LlmCallConfig {
    const sameRoute =
      candidate.provider === (proposal as { provider?: string }).provider &&
      candidate.model === (proposal as { model?: string }).model;
    if (candidate.reasoningEffort !== undefined) {
      return {
        ...(proposal as object),
        provider: candidate.provider,
        model: candidate.model,
        reasoningEffort: candidate.reasoningEffort as LlmCallConfig["reasoningEffort"],
      } as LlmCallConfig;
    }
    if (sameRoute) {
      return {
        ...(proposal as object),
        provider: candidate.provider,
        model: candidate.model,
      } as LlmCallConfig;
    }
    const { reasoningEffort: _drop, ...base } = proposal as unknown as Record<string, unknown>;
    return {
      ...(base as object),
      provider: candidate.provider,
      model: candidate.model,
    } as LlmCallConfig;
  }

  ctx.on("agent/request", async (payload: unknown, next: () => Promise<unknown>) => {
    const proposal = (await next()) as LlmCallConfig;
    if (!proposal?.provider || !proposal.model) return proposal;

    const p = payload as { turn?: unknown; step?: unknown; signal?: AbortSignal; agent?: unknown };
    const agent = p.agent as object | undefined;
    if (!agent) {
      ctx.logger.warn(
        "profiles: agent missing from agent/request payload; failing over disabled for this request",
      );
      return proposal;
    }
    const stepKey = keyOf(p.turn, p.step);
    const depth = depthOf(agent);
    const chain = chainForDepth(ctx, depth);
    const proposalRoute: Level = {
      provider: proposal.provider,
      model: proposal.model,
      ...(proposal.reasoningEffort ? { reasoningEffort: proposal.reasoningEffort as string } : {}),
    };
    const levels: Level[] = [
      proposalRoute,
      ...chain.filter(
        (level) =>
          !(level.provider === proposalRoute.provider && level.model === proposalRoute.model),
      ),
    ];

    const agentMap = getAgentState(agent);
    let s = agentMap.get(stepKey);
    if (!s || s.stepKey !== stepKey) {
      s = { stepKey, levels, cursor: 0, retries: 0, failures: [] };
      agentMap.set(stepKey, s);
      // Fresh state for a fresh stepKey happens on EVERY step, not just a
      // real reset, so this is trace detail, not a state change.
      ctx.logger.debug(`failover chain reset for session ${sessionLabel(agent)}`);
    } else {
      s.levels = levels;
      if (s.cursor >= s.levels.length) s.cursor = 0;
    }

    const llm = service<LlmService>(ctx, "llm");

    let ignoredCache = false;
    for (let attempt = 0; attempt < 2; attempt++) {
      while (s.cursor < s.levels.length) {
        const candidate = s.levels[s.cursor];
        if (!ignoredCache && isCachedDown(candidate)) {
          s.cursor += 1;
          continue;
        }
        if (llm) {
          try {
            await llm.resolveCallConfig(buildConfig(proposal, candidate), p.signal);
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
            continue;
          }
        } else {
          break;
        }
      }
      if (s.cursor < s.levels.length) break;
      if (!ignoredCache && s.failures.length === 0) {
        let anyDown = false;
        for (const lv of s.levels)
          if (isCachedDown(lv)) {
            anyDown = true;
            break;
          }
        if (anyDown) {
          ctx.logger.warn(
            "profiles: every level is cached down; retrying while ignoring the cache",
          );
          s.cursor = 0;
          ignoredCache = true;
          continue;
        }
      }
      break;
    }

    if (s.cursor >= s.levels.length) {
      ctx.logger.warn(
        `failover chain exhausted for session ${sessionLabel(agent)}: tried ${s.levels.map((l) => `${l.provider}/${l.model}`).join(", ") || "no levels"}`,
      );
      const tried = s.failures
        .map((f) => `  - ${f.level.provider}/${f.level.model}: ${f.code} — ${f.message}`)
        .join("\n");
      throw new Error(`profiles: no level can serve the active chain:\n${tried}`);
    }

    const level = s.levels[s.cursor];
    const selectionMark = `${level.provider}/${level.model}`;
    if (lastSelected.get(agent) !== selectionMark) {
      lastSelected.set(agent, selectionMark);
      ctx.logger.info(
        `failover chain selected ${level.provider}/${level.model} for session ${sessionLabel(agent)}`,
      );
    } else {
      ctx.logger.debug(
        `failover chain selected ${level.provider}/${level.model} for session ${sessionLabel(agent)}`,
      );
    }
    return buildConfig(proposal, level);
  });

  ctx.on("agent/request-error", (payload: unknown, next: () => Promise<RequestErrorAction>) => {
    const p = payload as {
      turn?: unknown;
      step?: unknown;
      signal?: AbortSignal;
      failure?: { code?: string; message?: string };
      retryPolicy?: { mode?: string };
      agent?: unknown;
    };
    const agent = p.agent as object | undefined;
    if (!agent) return next();
    const agentMap = state.get(agent);
    if (!agentMap) return next();
    const s = agentMap.get(keyOf(p.turn, p.step));
    if (!s || s.stepKey !== keyOf(p.turn, p.step)) return next();

    const cur = s.levels[s.cursor];
    if (!cur) return next();

    if (p.signal?.aborted) {
      agentMap.delete(keyOf(p.turn, p.step));
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

    markDown(cur, failure.code, failure.message ?? "");

    if (p.retryPolicy?.mode === "always") {
      s.retries += 1;
      if (s.retries <= alwaysMaxRetries) return next();
    }
    s.retries = 0;

    s.cursor += 1;
    while (s.cursor < s.levels.length && isCachedDown(s.levels[s.cursor])) s.cursor += 1;

    if (s.cursor < s.levels.length) {
      const nxt = s.levels[s.cursor];
      ctx.logger.info(
        `session ${sessionLabel(agent)} failing over from ${cur.provider}/${cur.model} to ${nxt.provider}/${nxt.model}`,
      );
      return { kind: "retry" } as unknown as Promise<RequestErrorAction>;
    }

    ctx.logger.warn(
      `failover chain exhausted for session ${sessionLabel(agent)}: tried ${s.levels.map((l) => `${l.provider}/${l.model}`).join(", ") || "no levels"}`,
    );
    const tried = s.failures
      .map((f) => `  - ${f.level.provider}/${f.level.model}: ${f.code} — ${f.message}`)
      .join("\n");
    agentMap.delete(keyOf(p.turn, p.step));
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
  const head = chainOf(activeEntry(profile), "orchestrator", profile?.chains, ctx)[0];
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

function rawEntry(entry: unknown): unknown {
  return entry ?? { orchestrator: { routes: [] }, subagent: { routes: [] } };
}

function canonicalConfig(profile: ProfileSettings | undefined) {
  return {
    active: profile?.active ?? "work",
    chains: profile?.chains ?? {},
    work: rawEntry(profile?.work),
    personal: rawEntry(profile?.personal),
    resolved: {
      work: canonicalEntry(profile?.work, profile?.chains),
      personal: canonicalEntry(profile?.personal, profile?.chains),
    },
  };
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
        errorCache: { ttlMs: ERROR_TTL_MS, down: liveDownKeys() },
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
        errorCache: { ttlMs: ERROR_TTL_MS, down: liveDownKeys() },
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
      errorCache: { ttlMs: ERROR_TTL_MS, down: liveDownKeys() },
    });
  };
}

function makeErrorCacheHandler(ctx: Context) {
  void ctx;
  // No auth check, by convention: this server only serves localhost plugin
  // clients, the same trust model as the profile switch endpoint above.
  return async (req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "DELETE") {
      sendJson(res, 405, { ok: false, error: `method ${req.method} not allowed` });
      return;
    }
    downCache.clear();
    rateLimitStrikes.clear();
    sendJson(res, 200, { ok: true, down: liveDownKeys() });
    return;
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
    server.register({
      kind: "exact",
      path: "/profiles/error-cache",
      handler: makeErrorCacheHandler(ctx),
    });
  });

  ctx.on("settings/updated", (ns, next, prev) => {
    if (ns !== PROFILE_NS) return;
    downCache.clear();
    const nextHead = chainOf(
      activeEntry(next as ProfileSettings),
      "orchestrator",
      (next as ProfileSettings)?.chains,
      ctx,
    )[0];
    const prevHead = chainOf(
      activeEntry(prev as ProfileSettings),
      "orchestrator",
      (prev as ProfileSettings)?.chains,
      ctx,
    )[0];
    const flipped =
      (nextHead?.provider ?? "") !== (prevHead?.provider ?? "") ||
      (nextHead?.model ?? "") !== (prevHead?.model ?? "") ||
      (nextHead?.reasoningEffort ?? "") !== (prevHead?.reasoningEffort ?? "");
    if (flipped) syncDefaultModel(ctx, next as ProfileSettings);
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
      "Every subagent runs on the profile-routed subagent chain with automatic " +
      "failover: the subagent tool is pinned to the subagent chain head and a " +
      "fault advances to the next rung (see the profile settings panel). " +
      "Start independent delegations together in one message.",
  });
}
