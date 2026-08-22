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
 * (depth >= 1) rides the subagent chain. The go/ds tail is reordered
 * live-first at selection time by quota (opencode-go monthly usage, then
 * deepseek balance, then opencode-go usage billing). A persistent fault
 * (no-credits / model-unavailable / auth / bad-request) marks the rung down
 * in a host-side cache for >= 10 minutes; selections inside the window skip
 * the dead rung. The cache clears on a `profile` namespace update.
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
 *   `{ kind: 'retry' }`: :653, kind check :662. The fused dispatcher
 *   (dsh-agent/lib/index.js agentEvents) injects `agent` into both payloads.
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
import { defineTool } from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-tools";
import type { SubagentStartRequest } from "@deepseek-ai/dsh-subagent";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-agent";
import { normalizeEntry, chainOf, type RouteCandidate } from "./profile-routes";
import { outputText } from "./shared/output-text";

export const name = "profiles";

export const inject = ["tools", "subagents", "systemPrompt"] as const;

/** One routable pair, or an ordered chain of them. */
const RoutePin = z.union([
  z.object({ provider: z.string(), model: z.string() }),
  z.object({ routes: z.array(z.object({ provider: z.string(), model: z.string() })) }),
]);

export const Config = z.object({
  /** The subagents provider to start children on. The standard preset uses spawn. */
  provider: z.string().default("spawn"),
  /** Same-provider retry cap for retryPolicy.mode="always" adapters. */
  alwaysMaxRetries: z.number().step(1).min(1).default(2),
  /** Per-role head pins. Any role left unset follows the profile namespace. */
  roles: z
    .object({
      coder: RoutePin.default(void 0),
      tester: RoutePin.default(void 0),
      researcher: RoutePin.default(void 0),
    })
    .default(void 0),
});

type ProfilesConfig = {
  provider?: string;
  alwaysMaxRetries?: number;
  roles?: { coder?: unknown; tester?: unknown; researcher?: unknown };
};

/** Shape of the `profile` settings namespace owned by see.ts. */
interface ProfileSettings {
  active?: string;
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

/** Every role child is a leaf worker: depth 0 parent + 1, no grandchildren. */
const ROLE_MAX_DEPTH = 1;

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
  if (hit("quota", "balance", "insufficient", "credit", "usage limit", "billing", "429", "rate limit")) return "no-credits";
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

// ── Quota probes (W21) ─────────────────────────────────────────────────────
// The pick reads cached probe results only. A stale cache starts a background
// refresh and the request never waits on a probe: fail-open keeps the
// declared chain order, and the error cache catches real failures. A
// missing/unknown value also fails open (the rung is tried once).
const PROBE_TTL_MS = 30_000;
interface ProbeSlot {
  at: number;
  live: boolean;
  busy: boolean;
}
const probes: { go: ProbeSlot; ds: ProbeSlot } = {
  go: { at: 0, live: true, busy: false },
  ds: { at: 0, live: true, busy: false },
};

/** OpenCode GO subscription quota: live while monthly usage percent < 100. */
async function fetchGoLive(ctx: Context): Promise<boolean> {
  try {
    const credentials = service<{ resolve(name: string): Promise<{ value?: string } | null | undefined> }>(
      ctx,
      "credentials",
    );
    const key = (await credentials?.resolve("OPENCODE_GO_API_KEY"))?.value;
    if (!key) return true; // no key: assume quota remains, the error cache catches
    const res = await fetch("https://opencode.ai/zen/go/v1/usage", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return true;
    const data = (await res.json()) as { usage?: { monthly?: { percent?: unknown } } };
    const percent = data?.usage?.monthly?.percent;
    if (typeof percent !== "number") return true; // unknown window: fail open
    return percent < 100;
  } catch {
    return true; // a probe must never break a request
  }
}

/** DeepSeek balance: live while total_balance > 0 (curl via subprocess). */
async function fetchDsLive(ctx: Context): Promise<boolean> {
  try {
    const credentials = service<{ resolve(name: string): Promise<{ value?: string } | null | undefined> }>(
      ctx,
      "credentials",
    );
    const subprocess = service<{
      spawn(options: unknown): {
        done: Promise<{ exitCode: number }>;
        collected?: { stdout?: { readFrom(offset: number): { text: string } } };
      };
    }>(ctx, "subprocess");
    const cred = await credentials?.resolve("DEEPSEEK_API_KEY");
    if (!cred?.value || !subprocess) return true;
    const sandboxPolicy = service<{ workspaceRoot?: string }>(ctx, "sandboxPolicy");
    const handle = subprocess.spawn({
      argv: [
        "curl", "-sS", "--max-time", "15",
        "-H", `Authorization: Bearer ${cred.value}`,
        "https://api.deepseek.com/user/balance",
      ],
      cwd: sandboxPolicy?.workspaceRoot ?? "/",
      stdio: {
        stdin: "ignore",
        stdout: { maxBytes: 65536 },
        stderr: { maxBytes: 4096 },
      },
      graceMs: 20_000,
    });
    const outcome = await handle.done;
    const out = handle.collected?.stdout ? handle.collected.stdout.readFrom(0).text : "";
    if (outcome.exitCode !== 0 || !out) return true;
    const json = JSON.parse(out) as { balance_infos?: Array<{ total_balance?: unknown }> };
    const total = json?.balance_infos?.[0]?.total_balance;
    if (typeof total !== "number") return true; // unknown: fail open
    return total > 0;
  } catch {
    return true; // a probe must never break a request
  }
}

/** Read one probe slot; refresh it in the background when stale. */
function liveNow(slot: ProbeSlot, fetchLive: () => Promise<boolean>): boolean {
  if (slot.at !== 0 && Date.now() - slot.at < PROBE_TTL_MS) return slot.live;
  if (!slot.busy) {
    slot.busy = true;
    void fetchLive()
      .then((live) => {
        slot.at = Date.now();
        slot.live = live;
      })
      .catch(() => {})
      .finally(() => {
        slot.busy = false;
      });
  }
  return slot.live; // stale or never fetched: fail open
}

function goLiveNow(ctx: Context): boolean {
  return liveNow(probes.go, () => fetchGoLive(ctx));
}

function dsLiveNow(ctx: Context): boolean {
  return liveNow(probes.ds, () => fetchDsLive(ctx));
}

/**
 * Order a chain's go/ds tail live-first at selection time. The opencode-zen
 * free tier and every other rung keep their order. Among the quota-checked
 * rungs (opencode-go, deepseek-official) the live choice is go-sub while
 * monthly usage percent < 100, else deepseek-official while balance > 0,
 * else opencode-go usage billing. A chain with fewer than two quota rungs
 * (or none) passes through unchanged.
 */
function quotaAwareChain(ctx: Context, chain: Level[]): Level[] {
  const goIdx = chain.findIndex((level) => level.provider === "opencode-go");
  const dsIdx = chain.findIndex((level) => level.provider === "deepseek-official");
  if (goIdx < 0 || dsIdx < 0) return chain;
  const goLive = goLiveNow(ctx);
  const dsLive = goLive ? true : dsLiveNow(ctx);
  const liveFirstGo = goLive || !dsLive;
  if (liveFirstGo === goIdx < dsIdx) return chain; // the live choice is already first
  const result = chain.slice();
  result[goIdx] = chain[dsIdx];
  result[dsIdx] = chain[goIdx];
  return result;
}

/**
 * The active profile entry's chain for one agent depth. Depth-0 rides the
 * orchestrator chain; any spawned child (depth >= 1) rides the subagent
 * chain. Falls back to the other named chain, then to the legacy single
 * `routes` shape, then to [].
 */
function chainForDepth(ctx: Context, depth: number): Level[] {
  const settings = service<SettingsService>(ctx, "settings");
  const profile = settings?.get(PROFILE_NS) as ProfileSettings | undefined;
  return chainOf(activeEntry(profile), depth >= 1 ? "subagent" : "orchestrator");
}

/** The quota-ordered chain for one depth. The error cache filters at walk time. */
function effectiveChain(ctx: Context, depth: number): Level[] {
  return quotaAwareChain(ctx, chainForDepth(ctx, depth));
}

interface RoleSpec {
  toolName: string;
  description: string;
}

const ROLES: RoleSpec[] = [
  {
    toolName: "coder",
    description:
      "Delegate ONE well-scoped implementation unit to a coder subagent. Give a self-contained brief: the files involved, the exact change, the constraints, and any test the orchestrator names. It works in its own context and returns a report, not intermediate steps. Leaf worker: it cannot spawn further subagents.",
  },
  {
    toolName: "tester",
    description:
      "Delegate test, lint, or build verification to a tester subagent. Name the exact commands or scope to run. It runs them and reports pass/fail with failure details. It never fixes code or edits files. Leaf worker: it cannot spawn further subagents.",
  },
  {
    toolName: "researcher",
    description:
      "Delegate investigation or a code review to a researcher subagent. Give the specific question or the diff to review. It reads, searches, and fetches, then reports findings with references. It never edits files or runs mutating commands. Leaf worker: it cannot spawn further subagents.",
  },
];

/**
 * Resolve one role's route HEAD at call time: the pin, else the active
 * profile's subagent chain head (role children are depth >= 1, so they ride
 * the subagent chain), else undefined (inherit agent-default-model). The
 * head skips rungs the error cache has down. Failover beyond the head is the
 * waterfall's job.
 */
function resolveHead(ctx: Context, pin: unknown): RouteCandidate | undefined {
  const pinned = normalizeEntry(pin);
  if (pinned.length > 0) return pinned[0];
  const chain = effectiveChain(ctx, 1);
  return chain.find((level) => !isCachedDown(level));
}

/** Human-readable name of the route a dispatch used. */
function via(route: RouteCandidate | undefined): string {
  return route ? ` via ${route.provider}/${route.model}` : "";
}

function registerRoleTool(
  ctx: Context,
  spec: RoleSpec,
  config: ProfilesConfig,
): void {
  ctx.tools.register(
    defineTool({
      name: spec.toolName,
      description:
        spec.description +
        " Runs in the background by default and returns a durable subagent id; send_message continues that conversation. Set run_in_background: false to wait for the result.",
      parameters: {
        description: {
          type: "string",
          required: true,
          description: "A short (3-5 word) description of the delegated task, for display.",
        },
        prompt: {
          type: "string",
          required: true,
          description:
            "The complete, self-contained task for the subagent. It does not share this conversation's context, so include everything it needs.",
        },
        run_in_background: {
          type: "boolean",
          description:
            "Whether to run in the background and return a durable subagent id immediately. Defaults to true. Set false to wait for the result when your next action depends on it.",
        },
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      async execute(args, exec) {
        const parent = exec.agent;
        if (!parent) throw new Error(`${spec.toolName} requires a calling agent (exec.agent was undefined)`);

        // Lazy lookup at call time: the head must reflect the CURRENT
        // settings value, and the plugin must load with no provider mounted.
        const head = resolveHead(ctx, config.roles?.[spec.toolName as keyof NonNullable<ProfilesConfig["roles"]>]);
        const provider = config.provider ?? "spawn";
        const request: SubagentStartRequest = {
          label: args.description,
          prompt: [{ type: "text", text: args.prompt }],
          parent,
          ...(head !== undefined ? { agentOptions: head } : {}),
          maxDepth: ROLE_MAX_DEPTH,
        };

        if (args.run_in_background ?? true) {
          const { childId } = await ctx.subagents.startContinuable({
            provider,
            label: args.description,
            request,
            signal: exec.signal,
          });
          return (
            `started ${spec.toolName} subagent ${childId}${via(head)}. ` +
            "It runs in the background; send_message continues that conversation, " +
            "and the runtime sends a notice when the run settles."
          );
        }

        const run = await ctx.subagents.start(provider, { ...request, signal: exec.signal });
        try {
          const result = await run.result;
          if (result.stopReason !== "completed") {
            const diagnostic = result.diagnostic ? `: ${result.diagnostic}` : "";
            throw new Error(
              `${spec.toolName}: child ended with stop reason "${result.stopReason}"${diagnostic}`,
            );
          }
          return outputText(result.output);
        } finally {
          await run.dispose();
        }
      },
    }),
  );
}

/** Install the two agent waterfalls that provide chain failover. */
function registerFailover(ctx: Context, alwaysMaxRetries: number): void {
  // agent -> state for its current step. WeakMap: agents die, state follows.
  const state = new WeakMap<object, StepState>();
  const keyOf = (turn: unknown, step: unknown): string => `${String(turn)}:${String(step)}`;

  ctx.on("agent/request", async (payload: unknown, next: () => Promise<unknown>) => {
    const proposal = (await next()) as { provider?: string; model?: string } | undefined;
    if (!proposal?.provider || !proposal.model) return proposal;

    const p = payload as { agent?: object; turn?: unknown; step?: unknown; signal?: AbortSignal };
    if (!p.agent) return proposal;

    // W21: the chain rides the agent's DEPTH (0 -> orchestrator, child ->
    // subagent) and the go/ds tail is reordered by quota. The error cache is
    // honored while walking below.
    const chain = effectiveChain(ctx, depthOf(p.agent));
    // Failover applies from the matched level onward; unmatched requests
    // (a manual picker choice off-chain, an unrelated provider) pass through.
    const matched = chain.findIndex(
      (level) => level.provider === proposal.provider && level.model === proposal.model,
    );
    if (matched < 0) return proposal;

    const stepKey = keyOf(p.turn, p.step);
    let s = state.get(p.agent);
    if (!s || s.stepKey !== stepKey) {
      s = { stepKey, levels: chain, cursor: matched, retries: 0, failures: [] };
      state.set(p.agent, s);
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
        ? s.failures.map((f) => `  - ${f.level.provider}/${f.level.model}: ${f.code} — ${f.message}`).join("\n")
        : "(no levels)";
      throw new Error(`profiles: no level can serve the active chain:\n${tried}`);
    }

    const level = s.levels[s.cursor];
    return { ...proposal, provider: level.provider, model: level.model };
  });

  ctx.on("agent/request-error", (payload: unknown, next: () => Promise<unknown>) => {
    const p = payload as {
      agent?: object;
      turn?: unknown;
      step?: unknown;
      signal?: AbortSignal;
      failure?: { code?: string; message?: string };
      retryPolicy?: { mode?: string };
    };
    const s = p.agent ? state.get(p.agent) : undefined;
    if (!s || !p.agent || s.stepKey !== keyOf(p.turn, p.step)) return next();

    const cur = s.levels[s.cursor];
    if (!cur) return next();

    // A user abort is never a failover trigger.
    if (p.signal?.aborted) {
      state.delete(p.agent);
      return next();
    }

    const failure = p.failure ?? {};
    const last = s.failures[s.failures.length - 1];
    if (last && last.level.provider === cur.provider && last.level.model === cur.model) {
      last.code = failure.code ?? "UNKNOWN";
      last.message = failure.message ?? "";
    } else {
      s.failures.push({ level: cur, code: failure.code ?? "UNKNOWN", message: failure.message ?? "" });
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
      return { kind: "retry" };
    }

    const tried = s.failures
      .map((f) => `  - ${f.level.provider}/${f.level.model}: ${f.code} — ${f.message}`)
      .join("\n");
    state.delete(p.agent);
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
  const head = chainOf(activeEntry(profile), "orchestrator")[0];
  if (!head) return;
  const agentDefaultModel = service<{
    saveSelection(next: { provider: string; model: string }): Promise<void>;
  }>(ctx, "agentDefaultModel");
  void agentDefaultModel?.saveSelection({ provider: head.provider, model: head.model }).catch(() => {});
}

export function apply(ctx: Context, config: unknown): void {
  const cfg = (config ?? {}) as ProfilesConfig;

  for (const spec of ROLES) {
    registerRoleTool(ctx, spec, cfg);
  }
  registerFailover(ctx, cfg.alwaysMaxRetries ?? 2);

  // Main-agent sync + error-cache reset: only on profile flips, never at
  // boot, never on writes the model picker made to its own namespace.
  ctx.on("settings/updated", (ns, next) => {
    if (ns !== PROFILE_NS) return;
    downCache.clear();
    syncDefaultModel(ctx, next as ProfileSettings);
  });

  ctx.systemPrompt.section({
    name: "tool:profiles",
    order: 116.4,
    text:
      "Role tools route delegation by job: coder implements one scoped unit, " +
      "tester runs verification, researcher investigates or reviews. " +
      "Prefer them over the generic subagent tool for those jobs; each child " +
      "runs on the profile-routed model with automatic fallback and is a leaf worker. " +
      "Start independent delegations together in one message.",
  });
}
