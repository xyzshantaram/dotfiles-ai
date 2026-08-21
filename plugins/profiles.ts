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
 * along the ACTIVE profile entry's chain when a route faults. A request
 * whose (provider, model) equals ANY level of the active chain fails over
 * from the NEXT level; all other requests pass through untouched. Levels may
 * change the model as well as the provider: the retry pass re-enters the
 * `agent/request` waterfall, where this plugin returns the next level's full
 * {provider, model}.
 *
 * There is NO second config surface: the chains ARE the `profile` namespace
 * entries (see.ts owns the namespace; this plugin reads it live). Flipping
 * `profile.active` swaps heads, chains, and failover order for every future
 * request with no restart.
 *
 *   work     meridian/claude-opus-5 -> sonnet-5 -> zen x-preview-f-free
 *   personal zen/deepseek-v4-flash-free -> opencode-go flash -> (official)
 *
 * Failover semantics:
 * - Stay on the matched level within a step so request prefixes stay
 *   stable; advance only when the current level fails.
 * - Each NEW step starts back at the matched level. During a hard outage
 *   every step pays one failed attempt before failing over; acceptable for
 *   v1 (a cooldown circuit is the known upgrade if it annoys).
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
 * On a `profile.active` flip, push the new active head into
 * `agent-default-model` via its own saveSelection, so sessions created from
 * then on compose on that route (a live session keeps its current model;
 * its requests still fail over per the rules above regardless). There is no
 * harness-native failover for the session's own model — verified against
 * dsh-agent-default-model/lib/index.js; head-sync plus these waterfalls is
 * the closest reachable behavior.
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
 *   `{ kind: 'retry' }`: :653, kind check :662.
 * - `ctx.llm.resolveCallConfig`: dsh-llm/lib/index.js:1351.
 *   `providerRetryPolicy`: dsh-llm/lib/index.js:1260.
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
import type { ContentBlock } from "@deepseek-ai/dsh-llm";
import { settingsNamespace } from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-settings";
import type {} from "@deepseek-ai/dsh-agent";
import { normalizeEntry, type RouteCandidate } from "./profile-routes";

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

/** The active chain right now. Empty when unconfigured — everything dormant. */
function activeChain(ctx: Context): Level[] {
  const settings = service<SettingsService>(ctx, "settings");
  const profile = settings?.get(PROFILE_NS) as ProfileSettings | undefined;
  return normalizeEntry(activeEntry(profile));
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
 * Resolve one role's route HEAD at call time: the pin, else the profile
 * namespace's active entry head, else undefined (inherit
 * agent-default-model). Failover beyond the head is the waterfall's job.
 */
function resolveHead(
  pin: unknown,
  settings: SettingsService | undefined,
): RouteCandidate | undefined {
  const pinned = normalizeEntry(pin);
  if (pinned.length > 0) return pinned[0];
  const profile = settings?.get(PROFILE_NS) as ProfileSettings | undefined;
  return normalizeEntry(activeEntry(profile))[0];
}

/**
 * Push the active chain's head into agent-default-model so future sessions
 * compose on the flipped profile's primary route.
 */
function syncDefaultModel(ctx: Context, profile: ProfileSettings | undefined): void {
  const head = normalizeEntry(activeEntry(profile))[0];
  if (!head) return;
  const agentDefaultModel = service<{
    saveSelection(next: { provider: string; model: string }): Promise<void>;
  }>(ctx, "agentDefaultModel");
  void agentDefaultModel?.saveSelection({ provider: head.provider, model: head.model }).catch(() => {});
}

/** Join the text blocks of a child result into one string (see.ts technique). */
function outputText(output: ContentBlock[]): string {
  return output
    .filter(
      (value): value is { type: "text"; text: string } =>
        typeof value === "object" &&
        value !== null &&
        (value as { type?: unknown }).type === "text" &&
        typeof (value as { text?: unknown }).text === "string",
    )
    .map((value) => value.text)
    .join("");
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
        const settings = service<SettingsService>(ctx, "settings");
        const head = resolveHead(config.roles?.[spec.toolName as keyof NonNullable<ProfilesConfig["roles"]>], settings);
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

    const chain = activeChain(ctx);
    // Failover applies from the matched level onward; unmatched requests
    // (a manual picker choice off-chain, an unrelated provider) pass through.
    const matched = chain.findIndex(
      (level) => level.provider === proposal.provider && level.model === proposal.model,
    );
    if (matched < 0) return proposal;

    const p = payload as { agent?: object; turn?: unknown; step?: unknown; signal?: AbortSignal };
    if (!p.agent) return proposal;

    const stepKey = keyOf(p.turn, p.step);
    let s = state.get(p.agent);
    if (!s || s.stepKey !== stepKey) {
      s = { stepKey, levels: chain, cursor: matched, retries: 0, failures: [] };
      state.set(p.agent, s);
    }

    const llm = service<LlmService>(ctx, "llm");

    // Skip levels that would fail before streaming. An abort during the
    // probe must surface as an abort, not eat every level.
    while (s.cursor < s.levels.length) {
      const candidate = s.levels[s.cursor];
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

    // An "always" adapter retries itself endlessly; cap it, then advance.
    if (p.retryPolicy?.mode === "always") {
      s.retries += 1;
      if (s.retries <= alwaysMaxRetries) return next();
    }
    s.retries = 0;

    s.cursor += 1;
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

export function apply(ctx: Context, config: unknown): void {
  const cfg = (config ?? {}) as ProfilesConfig;

  for (const spec of ROLES) {
    registerRoleTool(ctx, spec, cfg);
  }
  registerFailover(ctx, cfg.alwaysMaxRetries ?? 2);

  // Main-agent sync: only on profile flips, never at boot, never on writes
  // the model picker made to its own namespace.
  ctx.on("settings/updated", (ns, next) => {
    if (ns !== PROFILE_NS) return;
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
