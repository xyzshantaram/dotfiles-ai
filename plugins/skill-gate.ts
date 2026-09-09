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
 *   - Enforcement runs FIRST on `agent/session-start`, which the agent factory
 *     emits after creation announcements and BEFORE the loop starts, hence
 *     before the agent's first prompt assembly (@deepseek-ai/dsh-agent
 *     AgentFactory.createAgent). Both model-facing surfaces render from the
 *     calling scope's restricted view — the native list via `wireSchemas(scope)`
 *     and the Code Mode `tools:sdk` block via `sdkSchemas(scope)`, both reading
 *     `view(scope).visible` (@deepseek-ai/dsh-tools lib/index.js: sdkSection,
 *     wireSchemas, sdkSchemas, view) — so one mask hides a tool from BOTH
 *     surfaces at once, including the very first prompt. There is deliberately
 *     NO `system-prompt/assemble` listener in this plugin: filtering
 *     `assembly.tools` covers only the native list and drifts out of sync with
 *     the SDK block (#98), while the restriction covers both through the seam
 *     the registry itself owns.
 *   - Enforcement RECONCILES on `agent/pre-step`, before every model step of
 *     every agent: the mask is reconciled with the agent's loaded-skill state
 *     and only rewritten when it actually changed. This covers agents that
 *     existed before this plugin mounted, tools that register late (MCP servers
 *     connecting after session start), and post-compaction re-application.
 *     Never break stepping over a gating fault.
 *   - On a successful `skill` tool call (`tools/post-execute`), this plugin
 *     adds the loaded skill's gated tools to that agent's active set; the next
 *     step's reconciliation unmasks them.
 *   - On `compaction/start`, only the applied masks and their disposers are
 *     dropped; each agent's active (skill-unlocked) set SURVIVES, and the
 *     next pre-step re-applies the deny from the preserved actives — so a
 *     skill loaded before compaction keeps its tools, while an agent that
 *     never loaded one still gets the full deny. (#89: activations are
 *     intent, not context; wiping them silently revoked capabilities.)
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
 * `tool-time`) — names the registry does not know yet are dropped from the
 * applied mask (restrict() rejects unknown globals), and a registry
 * fingerprint re-arms the rewrite when they register. An entry MAY end with
 * `*` as a prefix pattern (`mcp__gitlab__*`); patterns expand at enforcement
 * time against the live tool schemas, so tool sets that shift between releases
 * (MCP servers) stay fully gated without maintaining a literal list.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveDshHome } from "@deepseek-ai/dsh-home-paths";
import type { Context, Events } from "@deepseek-ai/cordis";
import type { Agent } from "@deepseek-ai/dsh-agent";
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
  /**
   * Global tool names NO agent may call, at any delegation depth, whether
   * or not a skill that gates them is loaded. `alwaysDeny` wins over a
   * skill unlock. Defaults to empty; configured values land separately.
   */
  alwaysDeny: z.array(z.string()).default([]),
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
 * YAML list (`[a, b]`, single-line or multi-line), a bare block list
 * (`- a` lines under the key), or a single bare scalar (`a`). Anything
 * else yields an empty list so a malformed value never gates a tool.
 */
function parseToolsGated(frontmatter: string, ctx: Context): string[] {
  // tools-gated may be an inline array ([a,b], single-line or joined
  // multi-line), a bare block list (- a), or a single bare scalar.
  const lines = frontmatter.split("\n");
  const idx = lines.findIndex((l) => /^tools-gated\s*:/.test(l));
  if (idx < 0) return [];
  const rawLine = lines[idx];
  let afterColon = rawLine.slice(rawLine.indexOf(":") + 1).trim();
  // A multi-line flow array opens with "[" on the key line or the next
  // one and closes on a later line. Join those continuation lines so the
  // inline branch sees one line — but only when they really open a "[":
  // a bare key followed by "- x" block entries must stay untouched for
  // the block branch below. The shipped cordis-plugin-development skill
  // is formatted exactly this way.
  const peek: string[] = [];
  if (afterColon.length === 0 || (afterColon.startsWith("[") && !afterColon.includes("]"))) {
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
    ctx.logger.warn(
      "[skill-gate] tools-gated key with no value and no block list; gating nothing for this skill",
    );
  }
  return block.filter((e) => e.length > 0);
}

/** Discover the complete skill-name → gated-tools map from the skill roots. */
function discoverGates(skillDirs: string[], ctx: Context): Map<string, string[]> {
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
      const parsed = parseToolsGated(readFrontmatter(text), ctx);
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
 * Last-seen registry fingerprint per agent (see enforce()). A change in tool
 * registration re-arms the restrict() rewrite even when the deny list itself
 * is unchanged.
 */
const fingerprintById = new Map<string, string | undefined>();

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
  const cfg = (config ?? {}) as {
    skillDirs?: string[];
    subagentDeny?: string[];
    alwaysDeny?: string[];
  };
  const skillDirs = cfg.skillDirs ?? [];
  const subagentDeny = cfg.subagentDeny ?? DEFAULT_SUBAGENT_DENY;
  const alwaysDeny = cfg.alwaysDeny ?? [];

  ctx.on("skills/change" as keyof Events, () => {
    gatesCache = undefined;
  });

  // Enforcement point, FIRST: at session start, before the agent's first
  // prompt assembly. The factory emits `agent/session-start` after creation
  // and before the loop starts, so the deny mask is already in force when the
  // first prompt renders — the native `assembly.tools` list AND the Code Mode
  // `tools:sdk` block both read the scope's restricted view, so both are clean
  // from step one. Without this, the first (often only) assembly ships every
  // gated tool and only the CALL is refused (#98). Synchronous notification:
  // enforce() is sync. Never break startup over a gating fault.
  ctx.on("agent/session-start" as keyof Events, (payload) => {
    try {
      enforce((payload as { agent?: Agent }).agent);
    } catch (err) {
      ctx.logger.error(
        `[skill-gate] session-start enforcement failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
  // Enforcement point, ONGOING: before EVERY model step of EVERY agent — fresh
  // agents, agents that predate this mount, and post-compaction states all
  // reconcile here. Never break stepping over a gating fault.
  ctx.on("agent/pre-step", (payload, next) => {
    try {
      enforce(payload.agent);
    } catch (err) {
      // Observe only: never break stepping, but surface the fault in the journal.
      ctx.logger.error(
        `[skill-gate] pre-step enforcement failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    // A skill loads through TWO paths, not one. The `skill` TOOL path is
    // caught by the tools/post-execute listener below. The user-explicit
    // slash-command path never calls that tool at all: dsh-tool-skill's own
    // pre-step listener appends the rendered skill body as extra decision
    // messages, each stamped `source.kind === "skill-invocation"` carrying
    // the skill name (@deepseek-ai/dsh-skill declares that MessageSource
    // kind for exactly this). Without this branch a slash-invoked skill
    // showed its instructions to the model while its gated tools stayed
    // masked, so the model read about tools it could not call.
    //
    // next() runs first so the decision already carries dsh-tool-skill's
    // injections. The unmask lands on the FOLLOWING step, because
    // assemble() runs before this waterfall -- the same one-step delay the
    // tool path already has.
    const proceed = async () => {
      const decision = await next();
      try {
        claimSlashInvokedSkills(payload.agent, decision);
      } catch {
        // Observe only: a malformed decision must not break stepping.
      }
      return decision;
    };
    return proceed();
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
    if (!gatesCache) gatesCache = discoverGates(skillDirs, ctx);
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
   * Fingerprint the live tool registry for one agent: the sorted global tool
   * names joined, or undefined when the schema surface is unavailable. Used
   * only as a change detector beside the deny mark, never as policy input.
   */
  function registryFingerprint(agent: Agent): string | undefined {
    try {
      const schemas = (agent.ctx.tools as { schemas?: () => Array<{ name: string }> }).schemas?.();
      if (!Array.isArray(schemas)) return undefined;
      return schemas
        .map((s) => s.name)
        .sort()
        .join(",");
    } catch {
      return undefined;
    }
  }

  /**
   * Reconcile one agent's deny mask with its loaded-skill state. Cheap when
   * nothing changed: the snapshot comparison skips the restrict() round trip.
   */
  function enforce(agent: Agent | undefined): void {
    if (!agent || !agent.ctx || !agent.ctx.tools) return;
    const patterns = gatedPatterns();
    const lockdown = [...alwaysDeny, ...(isSubagent(agent) ? subagentDeny : [])];
    if (patterns.length === 0 && lockdown.length === 0) return;
    const active = activeById.get(agent.id) ?? new Set<string>();
    const deny = expandDeny(agent, patterns, active);
    for (const name of lockdown) if (!deny.includes(name)) deny.push(name);
    deny.sort();
    const mark = deny.join(",");
    // The registry fingerprint re-arms the rewrite when tool REGISTRATION
    // changes under a constant deny list (#98): an exact-gated tool that is
    // not yet registered (late plugin mount, HMR reload) is dropped from the
    // applied mask by restrictKnown, and without this the mark would match on
    // every later round while the tool sits visible. `*` patterns self-heal
    // through expandDeny; exact names need this. schemas() with no scope is
    // the global (unrestricted) view, so the fingerprint sees every tool.
    const fingerprint = registryFingerprint(agent);
    if (appliedById.get(agent.id) === mark && fingerprintById.get(agent.id) === fingerprint) return;
    disposerById.get(agent.id)?.();
    disposerById.delete(agent.id);
    if (deny.length === 0) {
      appliedById.set(agent.id, mark);
      fingerprintById.set(agent.id, fingerprint);
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
    fingerprintById.set(agent.id, fingerprint);
    disposerById.set(agent.id, disposer);
  }

  function clearAll(): void {
    // #89. This used to clear activeById as well, on the reasoning that
    // "compaction wipes which skills each conversation had loaded ... so gated
    // tools return to hidden instead of leaking open into post-compaction
    // prompts". That silently REVOKED capabilities: load a skill, compact, and
    // its tools vanish mid-task with nothing said to the model — which is
    // exactly the reported symptom, "the agent loads the skill but the tools
    // never come". In a long session compaction fires repeatedly, so the
    // window is not narrow.
    //
    // An activation is INTENT, not context. The user or the model deliberately
    // loaded that skill; compaction is an implementation detail of context
    // management and has no business withdrawing a granted capability. The
    // original worry does not survive contact either: the tools are
    // self-describing through their own schemas, so a post-compaction prompt
    // carrying them is not "leaking" anything the agent had not already been
    // given.
    //
    // So activeById SURVIVES compaction. Only the applied masks and their
    // disposers are dropped, because those are bound to pre-compaction tool
    // registrations; the next pre-step reconciles each agent from its
    // preserved active set.
    appliedById.clear();
    fingerprintById.clear();
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
    // The next pre-step reconciles the mask; no restrict() call here.
    activateSkill(agent, skillName);
  }

  /** Add one skill's gated tools to an agent's active set. Shared by both
   * load paths. */
  function activateSkill(agent: Agent, skillName: string): void {
    if (!gatesCache) gatesCache = discoverGates(skillDirs, ctx);
    const gated = gatesCache.get(skillName);
    if (!gated || gated.length === 0) return;
    const active = activeById.get(agent.id) ?? new Set<string>();
    for (const tool of gated) active.add(tool);
    activeById.set(agent.id, active);
  }

  /**
   * Unmask every skill the user invoked by slash command on this step.
   * dsh-tool-skill stamps each injected body with
   * `source: { kind: "skill-invocation", name, form: "instructions" }`, so
   * the skill name is read from that metadata rather than by re-parsing the
   * rendered `<skill_content>` text.
   */
  function claimSlashInvokedSkills(agent: Agent | undefined, decision: unknown): void {
    if (!agent) return;
    const messages = (decision as { messages?: unknown }).messages;
    if (!Array.isArray(messages)) return;
    for (const message of messages) {
      const source = (message as { source?: { kind?: unknown; name?: unknown } } | null)?.source;
      if (source === undefined || source === null) continue;
      if (source.kind !== "skill-invocation") continue;
      if (typeof source.name !== "string" || source.name === "") continue;
      activateSkill(agent, source.name);
    }
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
