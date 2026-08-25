// plugins/see.ts
import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { scopeOf } from "@deepseek-ai/dsh-scope";

// plugins/profile-routes.ts
function isRouteCandidate(value) {
  return typeof value === "object" && value !== null && typeof value.provider === "string" && value.provider.length > 0 && typeof value.model === "string" && value.model.length > 0;
}
function normalizeEntry(entry, chains, seen) {
  if (isRouteCandidate(entry)) return [entry];
  if (typeof entry === "string") {
    if (entry.startsWith("chain:")) {
      const name2 = entry.slice("chain:".length);
      if (chains?.[name2] === void 0) return [];
      const guard = new Set(seen ?? []);
      if (guard.has(name2)) return [];
      guard.add(name2);
      return normalizeEntry(chains[name2], chains, guard);
    }
    const slash = entry.indexOf("/");
    if (slash > 0) {
      return [{ provider: entry.slice(0, slash), model: entry.slice(slash + 1) }];
    }
    if (chains?.[entry] !== void 0) {
      const guard = new Set(seen ?? []);
      if (guard.has(entry)) return [];
      guard.add(entry);
      return normalizeEntry(chains[entry], chains, guard);
    }
    return [];
  }
  if (typeof entry === "object" && entry !== null) {
    if (Array.isArray(entry.routes)) {
      return entry.routes.filter(isRouteCandidate);
    }
    if (Array.isArray(entry)) {
      const out = [];
      for (const step of entry) {
        if (typeof step === "string") {
          if (step.startsWith("chain:")) {
            const name2 = step.slice("chain:".length);
            if (chains?.[name2] !== void 0) {
              const guard = new Set(seen ?? []);
              if (!guard.has(name2)) {
                guard.add(name2);
                out.push(...normalizeEntry(chains[name2], chains, guard));
              }
            }
          } else if (chains?.[step] !== void 0) {
            const guard = new Set(seen ?? []);
            if (!guard.has(step)) {
              guard.add(step);
              out.push(...normalizeEntry(chains[step], chains, guard));
            }
          } else if (step.indexOf("/") > 0) {
            const slash = step.indexOf("/");
            out.push({ provider: step.slice(0, slash), model: step.slice(slash + 1) });
          }
        } else {
          out.push(...normalizeEntry(step, chains, seen));
        }
      }
      return out;
    }
  }
  return [];
}
function chainOf(entry, chainName, chains) {
  if (typeof entry === "object" && entry !== null) {
    const obj = entry;
    if ("orchestrator" in obj || "subagent" in obj) {
      const own = normalizeEntry(
        chainName === "orchestrator" ? obj.orchestrator : obj.subagent,
        chains
      );
      if (own.length > 0) return own;
      const other = normalizeEntry(
        chainName === "orchestrator" ? obj.subagent : obj.orchestrator,
        chains
      );
      if (other.length > 0) return other;
      return [];
    }
  }
  return normalizeEntry(entry, chains);
}

// plugins/shared/output-text.ts
function outputText(output) {
  return output.filter(
    (value) => typeof value === "object" && value !== null && value.type === "text" && typeof value.text === "string"
  ).map((value) => value.text).join("");
}

// plugins/see.ts
var name = "see";
var inject = ["tools", "subagents", "systemPrompt"];
var Config = z.object({});
var PROFILE_NS = settingsNamespace("profile");
var ROUTE_ENTRY = z.object({ provider: z.string(), model: z.string() });
var CHAIN_ENTRY = z.object({ routes: z.array(ROUTE_ENTRY) });
var CHAIN_OR_ROUTE = z.union([ROUTE_ENTRY, CHAIN_ENTRY, z.string()]);
var PROFILE_ENTRY = z.union([
  ROUTE_ENTRY,
  CHAIN_ENTRY,
  z.object({
    orchestrator: CHAIN_OR_ROUTE.default(void 0),
    subagent: CHAIN_OR_ROUTE.default(void 0)
  })
]);
var PROFILE_SCHEMA = z.object({
  active: z.string().default("work"),
  // Named-chain library: name -> { routes: [...] } or a chain-ref string.
  // Listed explicitly: schematry strips unknown object keys, and without it
  // chainOf() inside readProfile() could never resolve the `see`/`see-work` chains.
  chains: z.any().default(void 0),
  work: PROFILE_ENTRY,
  personal: PROFILE_ENTRY
});
var DEFAULT_ROUTES = {
  work: { provider: "meridian", model: "claude-haiku-4-5" },
  personal: { provider: "opencode-zen", model: "x-preview-f-free" }
};
var SEE_CHILD_KEEP = /* @__PURE__ */ new Set(["read", "read_image", "glob", "grep"]);
var SEE_PERSONA = `You are a narrow, vision-only subagent. Look at the image or images you are given and answer the specific question about them. If no question was given, describe what is relevant to the task the orchestrator described. You do not edit files, run commands, or dispatch further subagents.

Write all your prose (the report back to the orchestrator) in STE-flavored Simplified Technical English. Use short common words, active voice, one instruction per sentence, no contractions, no semicolons, no marketing adjectives.

- Describe only what is visibly in the image. If part of it is unclear or cut off, say so explicitly instead of guessing.
- Answer the question you were asked first, then add any detail in the image the orchestrator likely needs but did not think to ask about (visible error text, an obviously broken layout, a mismatched value). No padding beyond that.
- If you were given a file path or URL and cannot read it, report that as a blocker rather than describing a different image or inventing content.`;
function readProfile(source) {
  const settings = source();
  const active = settings?.active ?? "work";
  const seeChainKey = active === "personal" ? "see" : "see-" + active;
  const seeRoutes = chainOf({ orchestrator: seeChainKey }, "orchestrator", settings?.chains);
  if (seeRoutes.length > 0) return seeRoutes;
  const entry = active === "personal" ? settings?.personal : settings?.work;
  const chain = chainOf(entry, "orchestrator", settings?.chains);
  if (chain.length > 0) return chain;
  return active === "personal" ? [DEFAULT_ROUTES.personal] : [DEFAULT_ROUTES.work];
}
function registerSeeTool(ctx, source) {
  ctx.tools.register(
    defineTool({
      name: "see",
      description: "Look at an image and answer a concrete question about it. Use this when the routed model has no vision and the task needs eyes on a screenshot, photo, or diagram. Give a file path and a specific question.",
      parameters: {
        image: {
          type: "string",
          required: true,
          description: "Path to a local image file (PNG, JPEG, WebP, or GIF)."
        },
        question: {
          type: "string",
          required: true,
          description: "The concrete question about the image."
        }
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }]
      },
      async execute(args, exec) {
        const parent = exec.agent;
        if (!parent) throw new Error("see requires a calling agent (exec.agent was undefined)");
        const routes = readProfile(source);
        if (routes.length === 0) throw new Error("see: no vision route resolved");
        const schemas = ctx.tools.schemas(scopeOf(ctx));
        const deny = schemas.map((schema) => schema.name).filter((toolName) => toolName !== "run_code" && !SEE_CHILD_KEEP.has(toolName));
        let lastError = null;
        for (const route of routes) {
          const request = {
            label: "see",
            prompt: [
              {
                type: "text",
                text: [
                  `Image: ${args.image}`,
                  `Question: ${args.question}`,
                  "",
                  "Read the image and answer the question. Describe only what is visible."
                ].join("\n")
              }
            ],
            parent,
            agentOptions: { provider: route.provider, model: route.model },
            persona: SEE_PERSONA,
            toolFilter: { deny },
            maxDepth: 1,
            signal: exec.signal
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
              diagnostic
            );
            lastError = new Error(
              `see: child ended with stop reason "${result.stopReason}"${diagnostic}`
            );
          } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
          } finally {
            await run.dispose().catch(() => {
            });
          }
        }
        throw lastError ?? new Error("see: all vision routes failed");
      },
      presentCall: (args) => ({
        card: "generic",
        title: "Look at an image",
        kind: "read",
        rawInput: args.image
      })
    })
  );
}
function apply(ctx, config) {
  let source = () => void 0;
  installSettingsSection(ctx, PROFILE_NS, PROFILE_SCHEMA, config ?? {}, {
    setSource: (current) => {
      source = current;
    },
    onChange: () => {
    }
  });
  ctx.systemPrompt.section({
    name: "tool:see",
    order: 117,
    text: "Use the see tool when the task needs vision and the routed model has none. Give it a local image path and one concrete question. It returns a factual description from the profile-routed vision model. It does not edit files or run commands."
  });
  const settings = ctx.get("settings");
  const getProfile = () => {
    const live = settings?.get(PROFILE_NS);
    return live ?? source();
  };
  const llm = ctx.get("llm");
  if (llm !== void 0) {
    ctx.on("agent/created", async ({ agent }) => {
      const opts = agent.options;
      const routed = agent.session?.requestHeader?.()?.config;
      const provider = routed?.provider ?? opts?.provider;
      const model = routed?.model ?? opts?.model;
      if (provider === void 0 || model === void 0) return;
      let hasVision = false;
      try {
        const info = await llm.resolveModelInfo(provider, model);
        const mods = info?.input?.inputModalities ?? info?.inputModalities;
        if (Array.isArray(mods)) hasVision = mods.includes("image");
      } catch {
      }
      const deny = hasVision ? ["see"] : ["read_image"];
      try {
        agent.ctx.tools.restrict({ deny });
      } catch {
      }
    });
  }
  registerSeeTool(ctx, getProfile);
  void config;
}
export {
  Config,
  apply,
  inject,
  name
};
