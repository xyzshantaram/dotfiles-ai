// plugins/context-guard.ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import { defineTool, jsonSchemaToTs, RUN_CODE_NAME } from "@deepseek-ai/dsh-tools";
import z from "@deepseek-ai/schemastery";
var name = "context-guard";
var inject = ["tools"];
var DEFAULT_SUBAGENT_DENY = [
  "cordis_inspect_self",
  "cordis_define",
  "cordis_run",
  "cordis_stop",
  "cordis_undefine"
];
var Config = z.object({
  /** Extra skill roots to scan for `tools-gated` declarations, in addition to `$DSH_HOME/skills`. */
  skillDirs: z.array(z.string()).default([]),
  /**
   * Global tool names a SUBAGENT (delegation depth > 0) may never call,
   * even when a skill that gates them is loaded. Depth-0 sessions are
   * unaffected. Defaults to the cordis session-mutation set, so children
   * can inspect the environment (inspect_list / inspect_query) but cannot
   * define, run, or delete plugins, and cannot read a session's own
   * plugin registry.
   */
  subagentDeny: z.array(z.string()).default(DEFAULT_SUBAGENT_DENY),
  /**
   * Global tool names NO agent may call, at any delegation depth, whether
   * or not a skill that gates them is loaded. `alwaysDeny` wins over a
   * skill unlock. Defaults to empty; configured values land separately.
   */
  alwaysDeny: z.array(z.string()).default([])
});
var SDK_SECTION_NAME = "tools:sdk";
var SDK_SECTION_ORDER = 150;
var LOOKUP_TOOL_NAME = "schema_lookup";
var SDK_CALLING_CONVENTION = `## Writing code for run_code

\`run_code\` takes two required arguments: \`code\` \u2014 the body of an async TypeScript function (erasable syntax only \u2014 no \`enum\` or namespaces; type annotations are advisory, the code runs type-stripped) \u2014 and \`description\`, a short summary of what the program does. Inside the program:

- Call tools as \`await tools.name(args)\` \u2014 quoted access for exotic names: \`tools["my-tool"](args)\`. Every call resolves to the tool's typed canonical JSON value. Tool arguments must be lossless JSON.
- A FAILED tool call rejects with \`ToolCallError\`, whose \`toolName\` identifies the failed tool and whose \`message\` is human-readable \u2014 \`try/catch\` it to handle and continue.
- Independent read-only calls MAY overlap under \`Promise.all\` (safe calls run concurrently; mutating calls run alone, in submission order). Sequence dependent work with \`await\`.
- Emit results with \`return\` and/or \`console.log(...)\`. Only what you print or return is program output. A successful tool result containing an image is attached after the run so you can inspect it on the next step; every other intermediate result stays out of the conversation, so extract just what you need.

The available tools:`;
var ARGS_DERIVATION_RULE = `Argument types are not repeated here: for \`tools.NAME(args)\`, the argument type IS the native \`NAME\` tool schema already in this prompt \u2014 same fields, same required list, same descriptions. For exotic names use quoted access: \`tools["my-tool"](args)\`.`;
var LOOKUP_HINT = `Full per-tool declarations \u2014 argument fields, nested types, descriptions, exact output shapes \u2014 are one call away: \`schema_lookup({ name: "NAME" })\`. Deep output shapes below collapse to a \`...Output\` reference; the lookup expands it.`;
function isBareIdentifier(name2) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name2);
}
function outputAliasFor(name2) {
  const pascal = name2.split(/[^a-zA-Z0-9]+/).filter((part) => part.length > 0).map((part) => part[0].toUpperCase() + part.slice(1)).join("") || "Tool";
  return `${pascal}Output`;
}
function renderCompactSdk(schemas) {
  const sorted = [...schemas].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const members = [];
  const aliases = [];
  for (const schema of sorted) {
    const rendered = jsonSchemaToTs(schema.output, 1);
    if (rendered.includes("\n")) {
      const alias = outputAliasFor(schema.name);
      members.push(`  ${schema.name}: ${alias};`);
      aliases.push(`type ${alias} = unknown; // full shape: ${LOOKUP_TOOL_NAME}({ name: "${schema.name}" })`);
    } else {
      members.push(`  ${schema.name}: ${rendered};`);
    }
  }
  const map = `interface ToolOutputMap {
${members.join("\n")}
}`;
  return `${SDK_CALLING_CONVENTION}

\`\`\`ts
type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

${map}` + (aliases.length > 0 ? `

${aliases.join("\n")}` : "") + `

type ToolName = keyof ToolOutputMap

declare class ToolCallError extends Error {
  readonly name: "ToolCallError";
  readonly toolName: ToolName;
}
\`\`\`

${ARGS_DERIVATION_RULE}

${LOOKUP_HINT}`;
}
function isDuplicateSdkSection(err) {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes(`prompt section "${SDK_SECTION_NAME}" is already registered`);
}
var sdkShadowById = /* @__PURE__ */ new Set();
function commentLines(text) {
  return String(text ?? "").split("\n").map((line) => `// ${line}`.trimEnd()).join("\n");
}
function firstLine(text) {
  return String(text ?? "").split("\n")[0] ?? "";
}
function readFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return "";
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end < 0) return "";
  return lines.slice(1, end).join("\n");
}
function parseToolsGated(frontmatter, ctx) {
  const lines = frontmatter.split("\n");
  const idx = lines.findIndex((l) => /^tools-gated\s*:/.test(l));
  if (idx < 0) return [];
  const rawLine = lines[idx];
  let afterColon = rawLine.slice(rawLine.indexOf(":") + 1).trim();
  const peek = [];
  if (afterColon.length === 0 || afterColon.startsWith("[") && !afterColon.includes("]")) {
    for (let i = idx + 1; i < lines.length; i++) {
      peek.push(lines[i].trim());
      if (lines[i].includes("]")) break;
    }
  }
  if (peek.length > 0 && peek[0].startsWith("[")) {
    afterColon = `${afterColon} ${peek.join(" ")}`.trim();
  }
  if (afterColon.startsWith("[")) {
    const inner = afterColon.slice(1, afterColon.lastIndexOf("]"));
    if (inner.trim() === "") return [];
    return inner.split(",").map((e) => e.trim().replace(/^["']|["']$/g, "")).filter((e) => e.length > 0);
  }
  if (afterColon.length > 0) {
    const bare = afterColon.replace(/^["']|["']$/g, "").trim();
    return bare ? [bare] : [];
  }
  const block = [];
  for (let i = idx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\S/.test(line)) break;
    const m = line.match(/^\s*-\s*(.+?)\s*$/);
    if (m) block.push(m[1].trim().replace(/^["']|["']$/g, ""));
    else if (line.trim() === "" || /^\s*#/.test(line)) continue;
    else break;
  }
  if (block.length === 0) {
    ctx.logger.warn(
      "[context-guard] tools-gated key with no value and no block list; gating nothing for this skill"
    );
  }
  return block.filter((e) => e.length > 0);
}
function discoverGates(skillDirs, ctx) {
  const dirs = [join(resolveDshHome(), "skills"), ...skillDirs];
  const gates = /* @__PURE__ */ new Map();
  const seek = (skillName, dir) => {
    const bundle = join(dir, skillName, "SKILL.md");
    const flat = join(dir, `${skillName}.md`);
    for (const file of [bundle, flat]) {
      if (!existsSync(file)) continue;
      let text = "";
      try {
        text = readFileSync(file, "utf8");
      } catch {
        continue;
      }
      const parsed = parseToolsGated(readFrontmatter(text), ctx);
      if (parsed.length > 0) return parsed;
    }
    return void 0;
  };
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const skillName = entry.endsWith(".md") ? entry.slice(0, -3) : entry;
      if (!/^[a-z0-9-]+$/.test(skillName)) continue;
      const gated = seek(skillName, dir);
      if (gated) gates.set(skillName, gated);
    }
  }
  return gates;
}
var activeById = /* @__PURE__ */ new Map();
var appliedById = /* @__PURE__ */ new Map();
var disposerById = /* @__PURE__ */ new Map();
var fingerprintById = /* @__PURE__ */ new Map();
function delegationDepth(agent) {
  try {
    const header = agent.session?.header?.delegationDepth;
    const runtime = agent.options?.subagentDepth;
    const h = typeof header === "number" && Number.isSafeInteger(header) && header >= 0 ? header : 0;
    const r = typeof runtime === "number" && Number.isSafeInteger(runtime) && runtime >= 0 ? runtime : 0;
    return Math.max(h, r);
  } catch {
    return 0;
  }
}
function isSubagent(agent) {
  return delegationDepth(agent) > 0;
}
var gatesCache;
function apply(ctx, config) {
  const cfg = config ?? {};
  const skillDirs = cfg.skillDirs ?? [];
  const subagentDeny = cfg.subagentDeny ?? DEFAULT_SUBAGENT_DENY;
  const alwaysDeny = cfg.alwaysDeny ?? [];
  ctx.on("skills/change", () => {
    gatesCache = void 0;
  });
  ctx.on("agent/session-start", (payload) => {
    try {
      enforce(payload.agent);
      ensureCompactSdk(payload.agent);
    } catch (err) {
      ctx.logger.error(
        `[context-guard] session-start enforcement failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  });
  ctx.on("agent/pre-step", (payload, next) => {
    try {
      enforce(payload.agent);
      ensureCompactSdk(payload.agent);
    } catch (err) {
      ctx.logger.error(
        `[context-guard] pre-step enforcement failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
    const proceed = async () => {
      const decision = await next();
      try {
        claimSlashInvokedSkills(payload.agent, decision);
      } catch {
      }
      return decision;
    };
    return proceed();
  });
  ctx.on("tools/post-execute", (exec, result, next) => {
    const proceed = async () => {
      const outcome = await next();
      if (exec.name === "skill") {
        try {
          notifySkillLoaded(exec, result);
        } catch {
        }
      }
      return outcome;
    };
    return proceed();
  });
  ctx.on("compaction/start", () => {
    dropReconcileSnapshots();
  });
  ctx.tools.register(
    defineTool({
      name: LOOKUP_TOOL_NAME,
      description: "Resolve one tool to its TypeScript declaration. Visible tools return the full declaration; gated tools return name, description and the unlocking skill \u2014 load that skill for full types.",
      parameters: {
        name: {
          type: "string",
          required: true,
          description: "The exact global tool name to resolve."
        }
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }]
      },
      execute: async (args, exec) => resolveToolSchema(args.name, exec?.agent)
    })
  );
  function gatedPatterns() {
    if (!gatesCache) gatesCache = discoverGates(skillDirs, ctx);
    const out = /* @__PURE__ */ new Set();
    for (const toolList of gatesCache.values()) {
      for (const tool of toolList) out.add(tool);
    }
    return [...out];
  }
  function ownerSkills(toolName) {
    if (!gatesCache) gatesCache = discoverGates(skillDirs, ctx);
    const owners = [];
    for (const [skillName, gated] of gatesCache) {
      for (const entry of gated) {
        const hit = entry.endsWith("*") ? toolName.startsWith(entry.slice(0, -1)) : entry === toolName;
        if (hit && !owners.includes(skillName)) owners.push(skillName);
      }
    }
    return owners;
  }
  function resolveToolSchema(name2, agent) {
    const registry = ctx.tools;
    const trimmed = String(name2 ?? "").trim();
    if (trimmed === "") return `Unknown tool ${JSON.stringify(String(name2))}: no global tool by that name is registered.`;
    if (trimmed === RUN_CODE_NAME) {
      return [
        `// ${RUN_CODE_NAME} is the batching transport itself, not a lookup subject.`,
        `// See the calling convention in the tools:sdk section.`
      ].join("\n");
    }
    const visible = registry.get(trimmed, agent);
    if (visible) {
      const alias = outputAliasFor(trimmed);
      const key = isBareIdentifier(trimmed) ? trimmed : JSON.stringify(trimmed);
      const argsTs = jsonSchemaToTs(visible.parameters, 1);
      const outputTs = jsonSchemaToTs(visible.output?.schema, 1);
      return [
        commentLines(visible.description),
        `type ${alias} = ${outputTs};`,
        `declare const tools: { ${key}: (args: ${argsTs}) => Promise<${alias}>; };`
      ].join("\n");
    }
    const global = registry.get(trimmed);
    if (!global) return `Unknown tool "${trimmed}": no global tool by that name is registered.`;
    const locked = alwaysDeny.includes(trimmed) || agent !== void 0 && isSubagent(agent) && subagentDeny.includes(trimmed);
    if (locked) {
      return [
        firstLine(global.description) === "" ? `// ${trimmed}` : `// ${firstLine(global.description)}`,
        `// Tool "${trimmed}" is locked by configuration for this agent; no skill unlocks it.`
      ].join("\n");
    }
    const owners = ownerSkills(trimmed);
    const skillNote = owners.length > 0 ? owners.map((skillName) => `"${skillName}"`).join(", ") : "(no skill declares it \u2014 masked by configuration)";
    return [
      firstLine(global.description) === "" ? `// ${trimmed}` : `// ${firstLine(global.description)}`,
      `// Tool "${trimmed}" is gated behind skill ${skillNote}.`,
      `// Load that skill first for argument and output types.`
    ].join("\n");
  }
  function ensureCompactSdk(agent) {
    if (!agent || !agent.ctx) return;
    if (sdkShadowById.has(agent.id)) return;
    if (!agent.ctx.systemPrompt) return;
    sdkShadowById.add(agent.id);
    try {
      agent.ctx.systemPrompt.section({
        name: SDK_SECTION_NAME,
        order: SDK_SECTION_ORDER,
        text: (context) => {
          try {
            const projection = agent.ctx.tools;
            if (typeof projection.modeFor !== "function" || typeof projection.sdkSchemas !== "function") {
              return "";
            }
            if (projection.modeFor(context.scope) !== "both") return "";
            return renderCompactSdk(projection.sdkSchemas(context.scope));
          } catch (err) {
            ctx.logger.error(
              `[context-guard] compact sdk render failed: ${err instanceof Error ? err.message : String(err)}`
            );
            return "";
          }
        }
      });
    } catch (err) {
      if (isDuplicateSdkSection(err)) return;
      sdkShadowById.delete(agent.id);
      ctx.logger.error(
        `[context-guard] compact sdk shadow failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }
  function covered(active, name2) {
    if (active.has(name2)) return true;
    for (const entry of active) {
      if (entry.endsWith("*") && name2.startsWith(entry.slice(0, -1))) return true;
    }
    return false;
  }
  function expandDeny(agent, patterns, active) {
    const exact = [];
    const prefixes = [];
    for (const pattern of patterns) {
      if (pattern.endsWith("*")) prefixes.push(pattern.slice(0, -1));
      else exact.push(pattern);
    }
    const deny = /* @__PURE__ */ new Set();
    for (const name2 of exact) {
      if (!covered(active, name2)) deny.add(name2);
    }
    if (prefixes.length > 0) {
      let names;
      try {
        const schemas = agent.ctx.tools.schemas?.();
        names = Array.isArray(schemas) ? schemas.map((s) => s.name) : void 0;
      } catch {
        names = void 0;
      }
      if (names) {
        for (const name2 of names) {
          if (!covered(active, name2) && prefixes.some((p) => name2.startsWith(p))) {
            deny.add(name2);
          }
        }
      }
    }
    return [...deny].sort();
  }
  function registryFingerprint(agent) {
    try {
      const schemas = agent.ctx.tools.schemas?.();
      if (!Array.isArray(schemas)) return void 0;
      return schemas.map((s) => s.name).sort().join(",");
    } catch {
      return void 0;
    }
  }
  function enforce(agent) {
    if (!agent || !agent.ctx || !agent.ctx.tools) return;
    const patterns = gatedPatterns();
    const lockdown = [...alwaysDeny, ...isSubagent(agent) ? subagentDeny : []];
    if (patterns.length === 0 && lockdown.length === 0) return;
    const active = activeById.get(agent.id) ?? /* @__PURE__ */ new Set();
    const deny = expandDeny(agent, patterns, active);
    for (const name2 of lockdown) if (!deny.includes(name2)) deny.push(name2);
    deny.sort();
    const mark = deny.join(",");
    const fingerprint = registryFingerprint(agent);
    if (appliedById.get(agent.id) === mark && fingerprintById.get(agent.id) === fingerprint) return;
    disposerById.get(agent.id)?.();
    disposerById.delete(agent.id);
    if (deny.length === 0) {
      appliedById.set(agent.id, mark);
      fingerprintById.set(agent.id, fingerprint);
      return;
    }
    let disposer;
    try {
      disposer = restrictKnown(agent, deny);
    } catch (err) {
      appliedById.delete(agent.id);
      throw err;
    }
    if (!disposer) {
      appliedById.delete(agent.id);
      return;
    }
    appliedById.set(agent.id, mark);
    fingerprintById.set(agent.id, fingerprint);
    disposerById.set(agent.id, disposer);
  }
  function dropReconcileSnapshots() {
    appliedById.clear();
    fingerprintById.clear();
  }
  function notifySkillLoaded(exec, result) {
    const agent = exec.agent;
    if (!agent) return;
    const args = exec.arguments;
    const skillName = args?.name;
    if (!skillName) return;
    const isError = result?.isError === true;
    if (isError) return;
    activateSkill(agent, skillName);
  }
  function activateSkill(agent, skillName) {
    if (!gatesCache) gatesCache = discoverGates(skillDirs, ctx);
    const gated = gatesCache.get(skillName);
    if (!gated || gated.length === 0) return;
    const active = activeById.get(agent.id) ?? /* @__PURE__ */ new Set();
    for (const tool of gated) active.add(tool);
    activeById.set(agent.id, active);
  }
  function claimSlashInvokedSkills(agent, decision) {
    if (!agent) return;
    const messages = decision.messages;
    if (!Array.isArray(messages)) return;
    for (const message of messages) {
      const source = message?.source;
      if (source === void 0 || source === null) continue;
      if (source.kind !== "skill-invocation") continue;
      if (typeof source.name !== "string" || source.name === "") continue;
      activateSkill(agent, source.name);
    }
  }
  function parseKnownTools(message) {
    const match = message.match(/known global tools: (.*)$/);
    if (!match) return void 0;
    const list = match[1].trim();
    if (list === "(none)") return /* @__PURE__ */ new Set();
    const names = list.split(",").map((name2) => name2.trim()).filter((name2) => name2.length > 0);
    return new Set(names);
  }
  function restrictKnown(agent, deny) {
    let candidate = deny;
    for (let attempt = 0; attempt < candidate.length + 1; attempt++) {
      if (candidate.length === 0) return void 0;
      try {
        return agent.ctx.tools.restrict({ deny: candidate });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const known = parseKnownTools(message);
        if (!known) throw err;
        const filtered = candidate.filter((tool) => known.has(tool));
        if (filtered.length === candidate.length) throw err;
        candidate = filtered;
      }
    }
    return void 0;
  }
}
export {
  Config,
  apply,
  inject,
  name,
  renderCompactSdk
};
