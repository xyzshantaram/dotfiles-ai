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
 *   tools-gated: [tool-time, tool-regex, tool-markdown, tool-encoding]
 *   ---
 *
 * Mechanism (verified against dsh-tools and dsh-agent source):
 *   - The gated tools are registered GLOBALLY by their own plugins and stay
 *     always online at the registry level.
 *   - This plugin hides them per-agent with `tools.restrict({ deny })`, called
 *     on the AGENT's scoped handle (`exec.agent.ctx.tools`). `restrict`
 *     validates that every named tool is a global tool and applies an
 *     agent-scoped visibility mask. A deny mask removes a tool; the tool
 *     returns when the deny mask no longer names it.
 *   - On a successful `skill` tool call, this plugin adds the loaded skill's
 *     gated tools to that agent's active set and recomputes the deny mask.
 *   - On `compaction/start`, active state for every agent is cleared and the
 *     full deny mask is re-applied.
 *
 * The complete gated-tool list is read at runtime from the user skill root
 * (`$DSH_HOME/skills`), so the frontmatter is the only place a gate is
 * declared; no second list lives in this file.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import type { Context } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
import z from "@deepseek-ai/schemastery";

export const name = "skill-gate";

export const inject = ["tools"] as const;

export const Config = z.object({
  /** Extra skill roots to scan for `tools-gated` declarations, in addition to `$DSH_HOME/skills`. */
  skillDirs: z.array(z.string()).default([]),
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
  const match = frontmatter.match(/^tools-gated\s*:\s*(\[[^\]]*\]|[^\n]+)\s*$/m);
  if (!match) return [];
  const raw = match[1].trim();
  if (raw.startsWith("[")) {
    const inner = raw.slice(1, -1);
    if (inner.trim() === "") return [];
    return inner
      .split(",")
      .map((entry) => entry.trim().replace(/^["']|["']$/g, ""))
      .filter((entry) => entry.length > 0);
  }
  const bare = raw.replace(/^["']|["']$/g, "").trim();
  return bare ? [bare] : [];
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

/** Active gated tools per agent id, and the current deny disposer per agent id. */
const activeById = new Map<string, Set<string>>();
const disposerById = new Map<string, () => void>();

export function apply(ctx: Context, config: unknown): void {
  void ctx; // the host context is only the mount point; per-agent work uses exec.agent.ctx
  const cfg = (config ?? {}) as { skillDirs?: string[] };
  const skillDirs = cfg.skillDirs ?? [];

  ctx.on("tools/post-execute", (exec, result, next) => {
    const proceed = async () => {
      const outcome = await next();
      // Observe only. Never rewrite the skill call's outcome.
      if ((exec as { name?: string }).name === "skill") {
        notifySkillLoaded(exec, result);
      }
      return outcome;
    };
    return proceed();
  });

  ctx.on("compaction/start", () => {
    clearAll();
  });

  function clearAll(): void {
    // A full session compaction leaves no reliable per-agent signal here, so
    // clear every tracked agent. The deny masks are disposed, which returns
    // all gated tools to their default (hidden) state until a skill reloads.
    for (const dispose of disposerById.values()) dispose();
    disposerById.clear();
    activeById.clear();
  }

  function notifySkillLoaded(exec: unknown, result: unknown): void {
    const agent = (exec as { agent?: Agent }).agent;
    if (!agent) return;
    const args = (exec as { arguments?: unknown }).arguments as
      | { name?: string }
      | undefined;
    const skillName = args?.name;
    if (!skillName) return;
    // Only treat a successful load as activation.
    const isError = (result as { isError?: boolean })?.isError === true;
    if (isError) return;
    const gates = discoverGates(skillDirs);
    const gated = gates.get(skillName);
    if (!gated || gated.length === 0) return;
    const active = activeById.get(agent.id) ?? new Set<string>();
    for (const tool of gated) active.add(tool);
    activeById.set(agent.id, active);
    reapplyDeny(agent, active);
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
    const names = [...list.matchAll(/"([^"]*)"/g)].map((m) => m[1]);
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

  function reapplyDeny(agent: Agent, active: Set<string>): void {
    const gates = discoverGates(skillDirs);
    const allGated = new Set<string>();
    for (const toolList of gates.values()) {
      for (const tool of toolList) allGated.add(tool);
    }
    // Deny every gated tool that is not active for this agent.
    const deny = [...allGated].filter((tool) => !active.has(tool));
    disposerById.get(agent.id)?.();
    if (deny.length === 0) {
      disposerById.delete(agent.id);
      return;
    }
    const disposer = restrictKnown(agent, deny);
    if (disposer) {
      disposerById.set(agent.id, disposer);
    } else {
      disposerById.delete(agent.id);
    }
  }

}
