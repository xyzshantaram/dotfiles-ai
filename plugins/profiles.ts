/**
 * profiles — per-role subagent routing WITH fallback chains, on the host plane.
 *
 * The problem. Delegation tools are agent-plane rows, so per-role model
 * routing would normally mean forking a preset composition. That bakes one
 * route into one preset. The requirement is the opposite: every agent preset
 * gets the role tools, and the work/personal model choice stays a runtime
 * setting, not composition text.
 *
 * The shape. This is a normal host-plane plugin (mounted from the web
 * profile's cordis.patch.yml, like package-tool and see). It registers three
 * thin delegation tools — `coder`, `tester`, `researcher` — over the same
 * `ctx.subagents` seam the shipped `subagent` tool uses. Each tool starts a
 * leaf child (maxDepth 1) whose ROUTE CHAIN resolves AT CALL TIME:
 *
 *   1. a per-role pin from this plugin's Config (single route or a chain), else
 *   2. the active entry of the shared `profile` settings namespace (the same
 *      namespace `see.ts` owns: `active` picks between `work` and `personal`;
 *      each entry is one route or an ordered `routes` chain), else
 *   3. no `agentOptions` at all — the child inherits `agent-default-model`.
 *
 * Failover is DELEGATED. The @visol-456/dsh-llm-fallback plugin (mounted
 * separately by sync.sh) hooks the agent loop's request-error recovery and
 * retries a failed request down its global `fallbacks` list — for main
 * agents, role children, and see alike. This plugin therefore does NOT retry
 * itself; it owns the two things that plugin cannot do:
 *
 *   1. HEAD SELECTION. Which route a request carries in the first place:
 *      a per-role pin, else the active profile entry's head, else inherit
 *      agent-default-model.
 *   2. LIST ALIGNMENT. On a `profile.active` flip, rewrite llm-fallback's
 *      settings namespace with the active entry's TAIL (the chain minus its
 *      head), so the global fallback order always matches the active profile
 *      (work: sonnet then free; personal: opencode-go flash then official
 *      deepseek), and push the new head into agent-default-model so future
 *      main sessions compose on it. A live session keeps its current model.
 *
 * There is no harness-native failover for the session's own model
 * (`agent-default-model` is strictly single-selection, verified against
 * dsh-agent-default-model/lib/index.js); head-sync plus llm-fallback is the
 * closest reachable behavior: one flip, and every new session and every
 * failed request lands on the chosen profile's stack.
 *
 * Settings are read WITHOUT ownership: `ctx.settings.get(ns)` resolves any
 * registered namespace (dsh-settings README); duplicate registration fails
 * loud, so this plugin deliberately does NOT register `profile` — see.ts owns
 * it. The lazy `ctx.get('settings')` lookup (same pattern as
 * dsh-tool-subagent's `ctx.get('jobs')`) keeps this plugin loadable when no
 * settings provider mounts.
 *
 * Personas deliberately stay OUT of this plugin. The bundle already carries
 * the coder/tester/researcher personas as skills; the orchestrator's dispatch
 * prompt names the skill, and the child loads it. One source of truth.
 *
 * Seams (verified against installed rc.8 source):
 * - Request construction mirrors @deepseek-ai/dsh-tool-subagent/lib/index.js
 *   (request object at :222-233; continuable start at :241-248 returning
 *   `{ childId }`; foreground start at :262/:271).
 * - `agentOptions: { provider, model }` is the documented per-child route
 *   override (dsh-subagent README request fields; proven live by see.ts).
 * - Leaf guardrail: maxDepth 1; resolveChildDepth rejects depth 2+
 *   (dsh-subagent/lib/index.js:486-489).
 *
 * Mount (sync.sh writes this row):
 *
 *   - id: profiles
 *     name: /path/to/plugins/profiles.js
 *     # config:
 *     #   provider: spawn     # subagents provider, defaults to spawn
 *     #   roles:
 *     #     coder:                                  # pin overriding the namespace
 *     #       routes:
 *     #         - { provider: opencode-zen, model: big-pickle }
 *     #         - { provider: opencode-go, model: deepseek-v4-flash }
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
const RoutePin = z.union([z.object({ provider: z.string(), model: z.string() }), z.object({ routes: z.array(z.object({ provider: z.string(), model: z.string() })) })]);

export const Config = z.object({
  /** The subagents provider to start children on. The standard preset uses spawn. */
  provider: z.string().default("spawn"),
  /** Per-role route pins. Any role left unset follows the profile namespace. */
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
  roles?: { coder?: unknown; tester?: unknown; researcher?: unknown };
};

/** Shape of the `profile` settings namespace owned by see.ts. */
interface ProfileSettings {
  active?: string;
  work?: unknown;
  personal?: unknown;
}

/** Minimal structural view of the settings service, looked up lazily. */
interface SettingsService {
  get(ns: string): unknown;
}

/** The shared namespace, registered by plugins/see.ts. */
const PROFILE_NS = settingsNamespace("profile");

/**
 * The @visol-456/dsh-llm-fallback settings namespace. The string is
 * duplicated rather than imported: mounting that plugin is a deployment
 * choice, and a write to an unregistered namespace rejects, which the
 * best-effort catch below absorbs.
 */
const FALLBACK_NS = "llm-fallback";
/** Every role child is a leaf worker: depth 0 parent + 1, no grandchildren. */
const ROLE_MAX_DEPTH = 1;

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
 * Resolve one role's candidate chain at call time: the pin, else the profile
 * namespace's active entry, else [] (a single no-agentOptions attempt that
 * inherits agent-default-model).
 */
function resolveChain(
  pin: unknown,
  settings: SettingsService | undefined,
): RouteCandidate[] {
  const pinned = normalizeEntry(pin);
  if (pinned.length > 0) return pinned;
  const profile = settings?.get(PROFILE_NS) as ProfileSettings | undefined;
  const active = profile?.active ?? "work";
  const entry = active === "personal" ? profile?.personal : profile?.work;
  return normalizeEntry(entry);
}

/**
 * Push the active chain's head into agent-default-model so future sessions
 * compose on the flipped profile's primary route.
 */
function syncDefaultModel(ctx: Context, profile: ProfileSettings | undefined): void {
  const active = profile?.active ?? "work";
  const entry = active === "personal" ? profile?.personal : profile?.work;
  const head = normalizeEntry(entry)[0];
  if (!head) return;
  const service = (ctx as { get(name: string): unknown }).get("agentDefaultModel") as
    | { saveSelection(next: { provider: string; model: string }): Promise<void> }
    | undefined;
  void service?.saveSelection({ provider: head.provider, model: head.model }).catch(() => {});
}

/**
 * Align llm-fallback's global list with the active profile's tail (the chain
 * minus its head). That plugin owns failover EXECUTION for every request,
 * but its list is global, so a static list could not honor different tails
 * per profile. An empty tail resets the namespace to its base (dormant).
 * Best-effort: never break the settings commit that triggered this.
 */
function syncFallbackList(ctx: Context, profile: ProfileSettings | undefined): void {
  const active = profile?.active ?? "work";
  const entry = active === "personal" ? profile?.personal : profile?.work;
  const tail = normalizeEntry(entry).slice(1);
  const settings = (ctx as { get(name: string): unknown }).get("settings") as
    | { replace(ns: string, section: Record<string, unknown>): Promise<void> }
    | undefined;
  if (!settings) return;
  const section = tail.length > 0 ? { fallbacks: tail } : {};
  void settings.replace(FALLBACK_NS, section).catch(() => {});
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

        // Lazy lookup at call time: the chain must reflect the CURRENT
        // settings value, and the plugin must load with no provider mounted.
        const settings = (ctx as { get(name: string): unknown }).get("settings") as
          | SettingsService
          | undefined;
        const chain = resolveChain(config.roles?.[spec.toolName as keyof NonNullable<ProfilesConfig["roles"]>], settings);
        const head = chain[0];
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

export function apply(ctx: Context, config: unknown): void {
  const cfg = (config ?? {}) as ProfilesConfig;

  for (const spec of ROLES) {
    registerRoleTool(ctx, spec, cfg);
  }

  // Main-agent sync: only on profile flips, never at boot, never on writes
  // the model picker made to its own namespace.
  ctx.on("settings/updated", (ns, next) => {
    if (ns !== PROFILE_NS) return;
    const profile = next as ProfileSettings;
    syncDefaultModel(ctx, profile);
    syncFallbackList(ctx, profile);
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
