/**
 * The `skill-gate` plugin: gate a set of tools behind skills.
 *
 * The model sees a gated tool only while the skill that declares it is loaded.
 * The skill's `SKILL.md` frontmatter is the single source of truth: it carries
 * a top-level `tools-gated` key naming the GLOBAL tool names the skill makes
 * visible. Example:
 *
 *   ---
 *   name: util
 *   description: Utilities for regex, time, markdown, and encoding.
 *   tools-gated: [time, regex, markdown, encoding]
 *   ---
 *
 * Mechanism (verified against dsh-tools/dsh-agent source AND exercised live
 * through a dynamic probe plugin against the util gate):
 *   - The gated tools are registered GLOBALLY by their own plugins and stay
 *     always online at the registry level.
 *   - This plugin hides them per-agent with `tools.restrict({ deny })`, called
 *     on the AGENT's scoped handle (`agent.ctx.tools`). `restrict` validates
 *     that every named tool is a global tool and applies an agent-scoped
 *     visibility mask. A deny mask removes a tool; the tool returns when the
 *     deny mask no longer names it.
 *   - Enforcement runs on `agent/pre-step`, before every model step of every
 *     agent: the mask is reconciled with the agent's loaded-skill state and
 *     only rewritten when it actually changed. This covers fresh agents
 *     (hidden until their first skill load) and agents that existed before
 *     this plugin mounted.
 *   - On a successful `skill` tool call (`tools/post-execute`), this plugin
 *     adds the loaded skill's gated tools to that agent's active set; the next
 *     step's reconciliation unmasks them.
 *   - On `compaction/start`, active state for every agent is cleared and the
 *     masks are lifted; the next pre-step re-applies the full deny, so gated
 *     tools return to hidden after a compaction instead of leaking open.
 *   - SUBAGENT LOCKDOWN: agents with delegation depth > 0 are hard-denied a
 *     configurable tool list (`subagentDeny`, default the cordis mutation
 *     set) regardless of loaded skills. Children keep read-only inspection
 *     (cordis_inspect_list / cordis_inspect_query) but cannot define, run,
 *     or delete dynamic plugins, and cannot read a session's own registry.
 *     Depth is read like dsh-subagent's `delegationDepthOf` — the persisted
 *     header count or the runtime AgentOptions override, whichever is deeper.
 *
 * The complete gated-tool list is read at runtime from the user skill root
 * (`$DSH_HOME/skills`), so the frontmatter is the only place a gate is
 * declared; no second list lives in this file. Frontmatter must name the
 * GLOBAL tool names exactly as registered (e.g. `time`, not the package id
 * `tool-time`) — unknown names are filtered out of the deny list, which would
 * leave those tools permanently visible. An entry MAY end with `*` as a
 * prefix pattern (`mcp__gitlab__*`); patterns expand at enforcement time
 * against the live tool schemas, so tool sets that shift between releases
 * (MCP servers) stay fully gated without maintaining a literal list.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import type { Context, Events } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import type { AssembleContext, PromptAssembly } from "@deepseek-ai/dsh-system-prompt";
import z from "@deepseek-ai/schemastery";

export const name = "skill-gate";

export const inject = ["tools"] as const;
/**
 * Tools every child agent is hard-denied, matching the deployed cordis
 * toolset. Keep in sync with the registered cordis_* names (dsh-tool-cordis).
 */
const DEFAULT_SUBAGENT_DENY = [
  "cordis_inspect_self",
  "cordis_define",
  "cordis_run",
  "cordis_stop",
  "cordis_undefine",
];

export const Config = z.object({
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
});

/** Read the frontmatter between the first two `---` lines. */
function readFrontmatter(text: string): string {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return "";
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
  if (end < 0) return "";
  return lines.slice(1, end).join("\n");
}

/**
 * Parse a `tools-gated` declaration from a frontmatter body. Accepts a
 * YAML list (`[a, b]`) or a single bare scalar (`a`). Anything else yields
 * an empty list so a malformed value never gates a tool.
 */
function parseToolsGated(frontmatter: string): string[] {
  // tools-gated may be inline ([a,b] or scalar), bare block (- a), or [I!] block.
  const lines = frontmatter.split("\n");
  const idx = lines.findIndex((l) => /^tools-gated\s*:/.test(l));
  if (idx < 0) return [];
  const rawLine = lines[idx];
  const afterColon = rawLine.slice(rawLine.indexOf(":") + 1).trim();
  if (afterColon.startsWith("[")) {
    const inner = afterColon.slice(1, afterColon.lastIndexOf("]"));
    if (inner.trim() === "") return [];
    return inner
      .split(",")
      .map((e) => e.trim().replace(/^["']|["']$/g, ""))
      .filter((e) => e.length > 0);
  }
  if (afterColon.length > 0) {
    const bare = afterColon.replace(/^["']|["']$/g, "").trim();
    return bare ? [bare] : [];
  }
  const block: string[] = [];
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
      "[skill-gate] tools-gated key with no value and no block list; gating nothing for this skill",
    );
  }
  return block.filter((e) => e.length > 0);
}

/** Discover the complete skill-name → gated-tools map from the skill roots. */
function discoverGates(skillDirs: string[]): Map<string, string[]> {
  const dirs = [join(resolveDshHome(), "skills"), ...skillDirs];
  const gates = new Map<string, string[]>();
  const seek = (skillName: string, dir: string): string[] | undefined => {
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
    return undefined;
  };
  for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      // A name may be a directory bundle (`util/`) or a flat `util.md`.
      const skillName = entry.endsWith(".md") ? entry.slice(0, -3) : entry;
      if (!/^[a-z0-9-]+$/.test(skillName)) continue;
      const gated = seek(skillName, dir);
      if (gated) gates.set(skillName, gated);
    }
  }
  return gates;
}

/**
 * Per-agent gating state, keyed by agent id:
 *   - activeById:  gated tools this agent has unlocked by loading skills.
 *   - appliedById: serialized deny snapshot last pushed for this agent, so the
 *                  per-step reconciliation can skip work when nothing changed.
 *   - disposerById: the live restriction disposer for this agent.
 */
const activeById = new Map<string, Set<string>>();
const appliedById = new Map<string, string>();
const disposerById = new Map<string, () => void>();

/**
 * An agent's delegation depth: the persisted header count, or the runtime
 * AgentOptions override, whichever is deeper. Mirrors dsh-subagent's
 * `delegationDepthOf` (agent.session.header.delegationDepth ?? 0 vs
 * agent.options.subagentDepth ?? 0). Depth 0 is the primary session;
 * every spawned child is deeper.
 */
function delegationDepth(agent: Agent): number {
  try {
    const header = (agent as { session?: { header?: { delegationDepth?: unknown } } }).session
      ?.header?.delegationDepth;
    const runtime = (agent as { options?: { subagentDepth?: unknown } }).options?.subagentDepth;
    const h =
      typeof header === "number" && Number.isSafeInteger(header) && header >= 0 ? header : 0;
    const r =
      typeof runtime === "number" && Number.isSafeInteger(runtime) && runtime >= 0 ? runtime : 0;
    return Math.max(h, r);
  } catch {
    return 0;
  }
}

function isSubagent(agent: Agent): boolean {
  return delegationDepth(agent) > 0;
}

/** Cached skill-name → gated-tools map; invalidated on `skills/change`. */
let gatesCache: Map<string, string[]> | undefined;

export function apply(ctx: Context, config: unknown): void {
  const cfg = (config ?? {}) as { skillDirs?: string[]; subagentDeny?: string[] };
  const skillDirs = cfg.skillDirs ?? [];
  const subagentDeny = cfg.subagentDeny ?? DEFAULT_SUBAGENT_DENY;

  ctx.on("skills/change" as keyof Events, () => {
    gatesCache = undefined;
  });

  // Enforcement point: before EVERY model step of EVERY agent — fresh agents,
  // agents that predate this mount, and post-compaction states all reconcile
  // here. Never break stepping over a gating fault.
  ctx.on("agent/pre-step", (payload, next) => {
    try {
      enforce(payload.agent);
    } catch (err) {
      // Observe only: never break stepping, but surface the fault in the journal.
      console.error("[skill-gate] pre-step enforcement failed:", err);
    }
    return next();
  });
  // Prompt filter: strip gated schemas from the system prompt's tool list
  // during assembly, so the model never receives them on ANY step — not just
  // steps after the first. The pre-step restrict() below blocks calls but runs
  // after assemble(), so the first (often only) step would otherwise ship every
  // gated tool and waste context. This runs inside assemble() for every step,
  // including the first, and removes schemas from the prompt the request is built from.
  ctx.on("system-prompt/assemble", (assembly: PromptAssembly, context: AssembleContext, next) => {
    const agent = context.agent;
    if (!agent) return next();
    const patterns = gatedPatterns();
    const lockdown = isSubagent(agent) ? subagentDeny : [];
    if (patterns.length === 0 && lockdown.length === 0) return next();
    const active = activeById.get(agent.id) ?? new Set<string>();
    const deny = expandDeny(agent, patterns, active);
    for (const name of lockdown) if (!deny.includes(name)) deny.push(name);
    if (deny.length === 0) return next();
    const blocked = new Set(deny);
    assembly.tools = assembly.tools.filter((t) => !blocked.has(t.name));
    return next();
  });
  ctx.on("tools/post-execute", (exec, result, next) => {
    const proceed = async () => {
      const outcome = await next();
      // Observe only. Never rewrite the skill call's outcome.
      if ((exec as { name?: string }).name === "skill") {
        try {
          notifySkillLoaded(exec, result);
        } catch {
          // Observe only.
        }
      }
      return outcome;
    };
    return proceed();
  });

  ctx.on("compaction/start" as keyof Events, () => {
    clearAll();
  });

  /** Every `tools-gated` declaration, exact names and `*` patterns alike. */
  function gatedPatterns(): string[] {
    if (!gatesCache) gatesCache = discoverGates(skillDirs);
    const out = new Set<string>();
    for (const toolList of gatesCache.values()) {
      for (const tool of toolList) out.add(tool);
    }
    return [...out];
  }

  /**
   * True when the agent's active (skill-unlocked) set covers `name`, either
   * as an exact entry or through a loaded `prefix*` pattern.
   */
  function covered(active: Set<string>, name: string): boolean {
    if (active.has(name)) return true;
    for (const entry of active) {
      if (entry.endsWith("*") && name.startsWith(entry.slice(0, -1))) return true;
    }
    return false;
  }

  /**
   * Build the concrete deny list for one agent: exact gated names plus every
   * live-registered tool matching a `*` pattern, minus anything unlocked.
   * Pattern expansion reads the runtime schema list; when that surface is
   * unavailable the pattern contributes nothing this round, and a later
   * reconcile picks it up once schemas are readable (the snapshot mark then
   * differs, forcing the rewrite).
   */
  function expandDeny(agent: Agent, patterns: string[], active: Set<string>): string[] {
    const exact: string[] = [];
    const prefixes: string[] = [];
    for (const pattern of patterns) {
      if (pattern.endsWith("*")) prefixes.push(pattern.slice(0, -1));
      else exact.push(pattern);
    }
    const deny = new Set<string>();
    for (const name of exact) {
      if (!covered(active, name)) deny.add(name);
    }
    if (prefixes.length > 0) {
      let names: string[] | undefined;
      try {
        const schemas = (
          agent.ctx.tools as { schemas?: () => Array<{ name: string }> }
        ).schemas?.();
        names = Array.isArray(schemas) ? schemas.map((s) => s.name) : undefined;
      } catch {
        names = undefined;
      }
      if (names) {
        for (const name of names) {
          if (!covered(active, name) && prefixes.some((p) => name.startsWith(p))) {
            deny.add(name);
          }
        }
      }
    }
    return [...deny].sort();
  }

  /**
   * Reconcile one agent's deny mask with its loaded-skill state. Cheap when
   * nothing changed: the snapshot comparison skips the restrict() round trip.
   */
  function enforce(agent: Agent | undefined): void {
    if (!agent || !agent.ctx || !agent.ctx.tools) return;
    const patterns = gatedPatterns();
    const lockdown = isSubagent(agent) ? subagentDeny : [];
    if (patterns.length === 0 && lockdown.length === 0) return;
    const active = activeById.get(agent.id) ?? new Set<string>();
    const deny = expandDeny(agent, patterns, active);
    for (const name of lockdown) if (!deny.includes(name)) deny.push(name);
    deny.sort();
    const mark = deny.join(",");
    if (appliedById.get(agent.id) === mark) return;
    disposerById.get(agent.id)?.();
    disposerById.delete(agent.id);
    if (deny.length === 0) {
      appliedById.set(agent.id, mark);
      return;
    }
    let disposer: (() => void) | undefined;
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

  function clearAll(): void {
    // Compaction wipes which skills each conversation had loaded. Drop the
    // active sets and lift the masks; the next pre-step reconciles every
    // agent back to the full deny, so gated tools return to hidden instead
    // of leaking open into post-compaction prompts.
    activeById.clear();
    appliedById.clear();
    for (const dispose of disposerById.values()) {
      try {
        dispose();
      } catch {
        // A stale agent may already be gone; nothing to unwind.
      }
    }
    disposerById.clear();
  }

  function notifySkillLoaded(exec: unknown, result: unknown): void {
    const agent = (exec as { agent?: Agent }).agent;
    if (!agent) return;
    const args = (exec as { arguments?: unknown }).arguments as { name?: string } | undefined;
    const skillName = args?.name;
    if (!skillName) return;
    // Only treat a successful load as activation.
    const isError = (result as { isError?: boolean })?.isError === true;
    if (isError) return;
    if (!gatesCache) gatesCache = discoverGates(skillDirs);
    const gated = gatesCache.get(skillName);
    if (!gated || gated.length === 0) return;
    const active = activeById.get(agent.id) ?? new Set<string>();
    for (const tool of gated) active.add(tool);
    activeById.set(agent.id, active);
    // The next pre-step reconciles the mask; no restrict() call here.
  }

  /**
   * Parse the known-global-tools list from a `restrict()` "unknown global
   * tool" error message, so a retry can drop exactly the rejected names.
   *
   * There is no public introspection method for the live tool registry
   * (confirmed against the installed `@deepseek-ai/dsh-tools` source: `view()`
   * is private, and the exported `ToolsService` surface has no `list`,
   * `knownNames`, or `restrictableNames` accessor). `restrict()` itself is
   * the only path, and its own validation error is the one place the
   * registry publishes the current known-tool set:
   * `@deepseek-ai/dsh-tools/lib/types/index.js:507` —
   * `` `tools.restrict() names unknown global tool... known global tools: ${[...known].sort().join(', ') || '(none)'}` ``.
   */
  function parseKnownTools(message: string): Set<string> | undefined {
    const match = message.match(/known global tools: (.*)$/);
    if (!match) return undefined;
    const list = match[1].trim();
    if (list === "(none)") return new Set();
    const names = list
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name.length > 0);
    return new Set(names);
  }

  /**
   * Call `tools.restrict({ deny })`, filtering out any name the registry does
   * not currently know. `restrict()` validates every name against the live
   * global tool registry and throws on an unknown name (source cited above),
   * so a gated tool declared by a skill but not yet registered — for example
   * an MCP tool whose server has not finished connecting, or is offline —
   * would otherwise break gating for every agent and every skill, not just
   * the one that named it.
   *
   * No direct "list current tools" API exists, so this retries on the
   * specific "unknown global tool" error, parsing the rejected/known names
   * out of its message and filtering the deny list down before retrying.
   * Bounded by the deny list's own length: each retry removes at least one
   * name, so the loop cannot spin longer than the initial list is long.
   */
  function restrictKnown(agent: Agent, deny: string[]): (() => void) | undefined {
    let candidate = deny;
    for (let attempt = 0; attempt < candidate.length + 1; attempt++) {
      if (candidate.length === 0) return undefined;
      try {
        return agent.ctx.tools.restrict({ deny: candidate });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const known = parseKnownTools(message);
        // Not the "unknown global tool" error, or nothing left to remove:
        // this is a real failure, not a stale-name issue. Propagate it.
        if (!known) throw err;
        const filtered = candidate.filter((tool) => known.has(tool));
        if (filtered.length === candidate.length) throw err;
        candidate = filtered;
      }
    }
    return undefined;
  }
}
