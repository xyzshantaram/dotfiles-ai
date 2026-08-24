/**
 * The `see` tool for the personal preset (SPEC-W W2).
 *
 * A vision-capable delegation helper. The caller hands it an image path and a
 * concrete question. The tool resolves the model route from the active
 * `profile` settings namespace, spawns a fresh one-shot child with that route
 * and a vision-only tool set, and returns the child's factual description.
 *
 * Seams:
 * - Tool shape: `defineTool` from `@deepseek-ai/dsh-tools`
 *   (DSH/dsh-tools/README.md:65-97, the "Typed tool parameter schemas"
 *   section; the B1 aidos tools at src/tools/aidos-tools.ts in the aidos repo
 *   are the reference implementation).
 * - Settings namespace: `installSettingsSection` and `settingsNamespace`
 *   from `@deepseek-ai/dsh-settings`
 *   (DSH/dsh-settings/README.md:11-14; the exact call shape is
 *   DSH/dsh-agent-default-model/lib/index.js:45-50). The read falls back to
 *   defaults when no settings provider is mounted.
 * - Delegation: `ctx.subagents.start` with `agentOptions { provider, model }`,
 *   `persona`, `toolFilter`, and `maxDepth`
 *   (DSH/dsh-tool-subagent/lib/index.js:222-233 and 269-272 show the request
 *   construction; DSH/dsh-subagent/README.md:29 documents the request
 *   fields). `stopReason === "completed"` is the only success terminal state
 *   (DSH/dsh-subagent/lib/index.js:232).
 * - Child tool filter: computed from the visible registry at call time, the
 *   same technique as the B1 mask (src/tools/mask.ts:96-105 in the aidos repo),
 *   so it never names a tool the registry does not hold.
 *
 * NOT-VERIFIED: the `profile` settings namespace contract.
 * No shipped dsh source defines it. The field names and the "x-preview-f-free"
 * personal route are authored from SPEC-W W2 only. TODO: confirm the final
 * settings.yaml shape and the personal provider/model route with the
 * orchestrator, then adjust PROFILE_SCHEMA and the defaults below.
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { scopeOf } from "@deepseek-ai/dsh-scope";
import type { SubagentStartRequest } from "@deepseek-ai/dsh-subagent";
import { chainOf } from "./profile-routes";
import { outputText } from "./shared/output-text";
export const name = "see";

export const inject = ["tools", "subagents", "systemPrompt"] as const;

export const Config = z.object({});

/** The `profile` settings namespace (NOT-VERIFIED). */
const PROFILE_NS = settingsNamespace("profile");

/**
 * Schema of the profile settings section. Fields are optional at runtime.
 * Since W21 each work/personal entry is either a legacy route/chain or a
 * nested pair of named chains (orchestrator for depth-0 agents, subagent
 * for spawned children). The see child is a spawned child, but its head
 * comes from the ORCHESTRATOR chain: that chain is byte-identical to the
 * pre-W21 flat chain for both profiles, so the vision route does not move.
 * Since W24 either field may be a STRING naming a key in the `chains` map.
 * The `chains` map is preserved by listing it in PROFILE_SCHEMA as z.any()
 * (schematry strips unknown object keys, so the earlier "passes through
 * untouched" assumption dropped the map from the normalized namespace).
 */
const ROUTE_ENTRY = z.object({ provider: z.string(), model: z.string() });
const CHAIN_ENTRY = z.object({ routes: z.array(ROUTE_ENTRY) });
const CHAIN_OR_ROUTE = z.union([ROUTE_ENTRY, CHAIN_ENTRY, z.string()]);
const PROFILE_ENTRY = z.union([
  ROUTE_ENTRY,
  CHAIN_ENTRY,
  z.object({
    orchestrator: CHAIN_OR_ROUTE.default(void 0),
    subagent: CHAIN_OR_ROUTE.default(void 0),
  }),
]);
const PROFILE_SCHEMA = z.object({
  active: z.string().default("work"),
  // Named-chain library: name -> { routes: [...] } or a chain-ref string.
  // Listed explicitly: schematry strips unknown object keys, and without it
  // chainOf() inside readProfile() could never resolve the `see`/`see-work` chains.
  chains: z.any().default(void 0),
  work: PROFILE_ENTRY,
  personal: PROFILE_ENTRY,
});

/** One resolved model route. */
interface ProfileRoute {
  provider: string;
  model: string;
}

/** The resolved profile settings value. Entries stay raw; normalizeEntry parses. */
interface ProfileSettings {
  active?: string;
  /** Named-chain library: name -> { routes: [...] }; string refs resolve here. */
  chains?: Record<string, unknown>;
  work?: unknown;
  personal?: unknown;
}

/** Default route when no settings value resolves. */
const DEFAULT_ROUTES: Record<string, ProfileRoute> = {
  work: { provider: "meridian", model: "claude-haiku-4-5" },
  personal: { provider: "opencode-zen", model: "x-preview-f-free" },
};

/** The vision-only tools the see child may use. */
const SEE_CHILD_KEEP = new Set(["read", "read_image", "glob", "grep"]);

/**
 * The child's STE-flavored vision persona. The original see.md body, kept
 * verbatim in substance.
 */
const SEE_PERSONA = `You are a narrow, vision-only subagent. Look at the image or images you are given and answer the specific question about them. If no question was given, describe what is relevant to the task the orchestrator described. You do not edit files, run commands, or dispatch further subagents.

Write all your prose (the report back to the orchestrator) in STE-flavored Simplified Technical English. Use short common words, active voice, one instruction per sentence, no contractions, no semicolons, no marketing adjectives.

- Describe only what is visibly in the image. If part of it is unclear or cut off, say so explicitly instead of guessing.
- Answer the question you were asked first, then add any detail in the image the orchestrator likely needs but did not think to ask about (visible error text, an obviously broken layout, a mismatched value). No padding beyond that.
- If you were given a file path or URL and cannot read it, report that as a blocker rather than describing a different image or inventing content.`;

/** Resolve the model route from the profile settings. */
function readProfile(source: () => ProfileSettings | undefined): ProfileRoute[] {
  const settings = source();
  const active = settings?.active ?? "work";
  // Work rides the named `see-work` chain (it composes the haiku prefix +
  // the base `see` chain in settings). Personal has no dedicated chain, so
  // it uses the base `see` chain directly. Fall back to the profile's
  // orchestrator chain when absent.
  const seeChainKey = active === "personal" ? "see" : "see-" + active;
  const seeRoutes = chainOf({ orchestrator: seeChainKey }, "orchestrator", settings?.chains);
  if (seeRoutes.length > 0) return seeRoutes;
  const entry = active === "personal" ? settings?.personal : settings?.work;
  const chain = chainOf(entry, "orchestrator", settings?.chains);
  if (chain.length > 0) return chain;
  return active === "personal" ? [DEFAULT_ROUTES.personal] : [DEFAULT_ROUTES.work];
}

/** Register the `see` tool on a context. */
function registerSeeTool(ctx: Context, source: () => ProfileSettings | undefined): void {
  ctx.tools.register(
    defineTool({
      name: "see",
      description:
        "Look at an image and answer a concrete question about it. Use this when the routed model has no vision and the task needs eyes on a screenshot, photo, or diagram. Give a file path and a specific question.",
      parameters: {
        image: {
          type: "string",
          required: true,
          description: "Path to a local image file (PNG, JPEG, WebP, or GIF).",
        },
        question: {
          type: "string",
          required: true,
          description: "The concrete question about the image.",
        },
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      async execute(args, exec) {
        const parent = exec.agent;
        if (!parent) throw new Error("see requires a calling agent (exec.agent was undefined)");
        // Walk the chain: try each route in order; on failure, try the next.
        const routes = readProfile(source);
        if (routes.length === 0) throw new Error("see: no vision route resolved");

        // Deny every tool the visible registry holds except the vision-only
        // keep set. Computed at call time (B1 mask.ts technique) so the
        // filter never names a tool the registry does not hold.
        const schemas = ctx.tools.schemas(scopeOf(ctx));
        const deny = schemas
          .map((schema) => schema.name)
          .filter((toolName) => toolName !== "run_code" && !SEE_CHILD_KEEP.has(toolName));

        let lastError: Error | null = null;
        for (const route of routes) {
          const request: SubagentStartRequest = {
            label: "see",
            prompt: [
              {
                type: "text",
                text: [
                  `Image: ${args.image}`,
                  `Question: ${args.question}`,
                  "",
                  "Read the image and answer the question. Describe only what is visible.",
                ].join("\n"),
              },
            ],
            parent,
            agentOptions: { provider: route.provider, model: route.model },
            persona: SEE_PERSONA,
            toolFilter: { deny },
            maxDepth: 1,
            signal: exec.signal,
          };
          const run = await ctx.subagents.start("spawn", request);
          try {
            const result = await run.result;
            if (result.stopReason === "completed") {
              return outputText(result.output);
            }
            const diagnostic = result.diagnostic ? `: ${result.diagnostic}` : "";
            ctx.logger.warn(
              "see: route %s/%s ended with %s%s",
              route.provider,
              route.model,
              result.stopReason,
              diagnostic,
            );
            lastError = new Error(
              `see: child ended with stop reason "${result.stopReason}"${diagnostic}`,
            );
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
          } finally {
            await run.dispose().catch(() => {});
          }
        }
        throw lastError ?? new Error("see: all vision routes failed");
      },
      presentCall: (args) => ({
        card: "generic",
        title: "Look at an image",
        kind: "read",
        rawInput: args.image,
      }),
    }),
  );
}

/** Apply the plugin. */
export function apply(ctx: Context, config: unknown): void {
  // The canonical optional-settings wiring. `source` resolves the namespace
  // while a settings service exists and falls back to the composition entry
  // otherwise (DSH/dsh-agent-default-model/lib/index.js:45-50).
  let source: () => ProfileSettings | undefined = () => undefined;
  installSettingsSection(ctx, PROFILE_NS, PROFILE_SCHEMA, config ?? {}, {
    setSource: (current) => {
      source = current as () => ProfileSettings | undefined;
    },
    onChange: () => {},
  });

  ctx.systemPrompt.section({
    name: "tool:see",
    order: 117,
    text:
      "Use the see tool when the task needs vision and the routed model has none. " +
      "Give it a local image path and one concrete question. " +
      "It returns a factual description from the profile-routed vision model. " +
      "It does not edit files or run commands.",
  });

  // Read the profile from the LIVE settings store (it carries the full `chains`
  // map and the current `active` selection, and is what profiles.ts uses for
  // role routing). installSettingsSection normalizes the namespace through
  // PROFILE_SCHEMA, which previously stripped `chains` and could lag the live
  // active flip; fall back to that source only if no settings service is mounted.
  const settings = ctx.get("settings") as { get(ns: string): unknown } | undefined;
  const getProfile = (): ProfileSettings | undefined => {
    const live = settings?.get(PROFILE_NS) as ProfileSettings | undefined;
    return live ?? source();
  };
  registerSeeTool(ctx, getProfile);
  void config;
}
