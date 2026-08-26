// plugins/skill-gate.ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import z from "@deepseek-ai/schemastery";
var name = "skill-gate";
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
  subagentDeny: z.array(z.string()).default(DEFAULT_SUBAGENT_DENY)
});
function readFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return "";
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end < 0) return "";
  return lines.slice(1, end).join("\n");
}
function parseToolsGated(frontmatter) {
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
    console.warn(
      "[skill-gate] tools-gated key with no value and no block list; gating nothing for this skill"
    );
  }
  return block.filter((e) => e.length > 0);
}
function discoverGates(skillDirs) {
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
      const parsed = parseToolsGated(readFrontmatter(text));
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
  ctx.on("skills/change", () => {
    gatesCache = void 0;
  });
  ctx.on("agent/pre-step", (payload, next) => {
    try {
      enforce(payload.agent);
    } catch (err) {
      console.error("[skill-gate] pre-step enforcement failed:", err);
    }
    return next();
  });
  ctx.on("system-prompt/assemble", (assembly, context, next) => {
    const agent = context.agent;
    if (!agent) return next();
    const patterns = gatedPatterns();
    const lockdown = isSubagent(agent) ? subagentDeny : [];
    if (patterns.length === 0 && lockdown.length === 0) return next();
    const active = activeById.get(agent.id) ?? /* @__PURE__ */ new Set();
    const deny = expandDeny(agent, patterns, active);
    for (const name2 of lockdown) if (!deny.includes(name2)) deny.push(name2);
    if (deny.length === 0) return next();
    const blocked = new Set(deny);
    assembly.tools = assembly.tools.filter((t) => !blocked.has(t.name));
    return next();
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
    clearAll();
  });
  function gatedPatterns() {
    if (!gatesCache) gatesCache = discoverGates(skillDirs);
    const out = /* @__PURE__ */ new Set();
    for (const toolList of gatesCache.values()) {
      for (const tool of toolList) out.add(tool);
    }
    return [...out];
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
  function enforce(agent) {
    if (!agent || !agent.ctx || !agent.ctx.tools) return;
    const patterns = gatedPatterns();
    const lockdown = isSubagent(agent) ? subagentDeny : [];
    if (patterns.length === 0 && lockdown.length === 0) return;
    const active = activeById.get(agent.id) ?? /* @__PURE__ */ new Set();
    const deny = expandDeny(agent, patterns, active);
    for (const name2 of lockdown) if (!deny.includes(name2)) deny.push(name2);
    deny.sort();
    const mark = deny.join(",");
    if (appliedById.get(agent.id) === mark) return;
    disposerById.get(agent.id)?.();
    disposerById.delete(agent.id);
    if (deny.length === 0) {
      appliedById.set(agent.id, mark);
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
    disposerById.set(agent.id, disposer);
  }
  function clearAll() {
    activeById.clear();
    appliedById.clear();
    for (const dispose of disposerById.values()) {
      try {
        dispose();
      } catch {
      }
    }
    disposerById.clear();
  }
  function notifySkillLoaded(exec, result) {
    const agent = exec.agent;
    if (!agent) return;
    const args = exec.arguments;
    const skillName = args?.name;
    if (!skillName) return;
    const isError = result?.isError === true;
    if (isError) return;
    if (!gatesCache) gatesCache = discoverGates(skillDirs);
    const gated = gatesCache.get(skillName);
    if (!gated || gated.length === 0) return;
    const active = activeById.get(agent.id) ?? /* @__PURE__ */ new Set();
    for (const tool of gated) active.add(tool);
    activeById.set(agent.id, active);
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
  name
};
