/**
 * W10 — bash-guard: gate model bash calls by the commands that ACTUALLY
 * RUN, parsed with unbash + the unbash-walker, with per-command verdicts
 * loaded from DROP-IN rule files.
 *
 * Why unbash: a regex guard matches substrings, so `/path/git-guard.js`,
 * `grep -r git .`, and `echo git` all false-positive. This guard parses the
 * command into an AST, extracts every command that would run — including
 * commands hidden inside wrappers (`sh -c`, `sudo`, `xargs`, `find -exec`),
 * pipelines, subshells, and `$(...)` / backtick substitutions — then matches
 * each command's BASENAME (path-stripped) against a rule set. `echo git
 * status` is a string argument: it never matches. `bash -c "git status"`
 * IS a git command: it matches.
 *
 * Rule drop-ins: one JSON file per guard in
 * `$DSH_HOME/plugins/guards/<name>.json` (the personal bundle syncs a set
 * from the repo). A file carries the commands it covers and a verdict:
 *
 *   {
 *     "commands": ["git", "git-foo"],
 *     "verdict": "deny",            // "deny" | "ask" | "allow"
 *     "reason": "Raw git is denied. Use the mcp__git__* tools or ask the user.",
 *     "subcommands": {              // optional, per-subcommand refinement
 *       "status": "allow",          // read-only verbs run without prompting
 *       "worktree": "ask"           // useful mutations prompt the user
 *     }
 *   }
 *
 * A subcommands entry refines the base verdict by the invoked subcommand
 * (the first non-option argument). Subcommands the map does not name
 * inherit the base verdict, so an allow-list stays closed under every verb
 * it does not name.
 *
 * Files are re-read on every call (they are tiny; no watcher needed).
 * A file that does not parse is logged and skipped (fail-safe: its commands
 * fall through to the default). A command with NO rule file is allowed
 * (default-allow) — only listed commands are gated, which is the personal
 * policy: the guard gates the tools the user chose to gate.
 *
 * Phase profiles: when aidos is mounted, bash-guard loads the base rules plus
 * a `profile-<phase>/` overlay (e.g. profile-planning) chosen by aidos'
 * bashContext(). A profile may set a wildcard ["*"] rule to deny-by-default
 * (read-only planning) and allow-list the few read commands it permits. Scratch
 * writes always pass: any command whose last path argument lands under /tmp/dsh
 * or the aidos durable scratch is allowed in every phase.
 *
 * Verdicts (most-restrictive-wins across the whole command): deny > ask >
 * allow > none. Fail-closed: a command that cannot be parsed (unbash
 * reports errors) is DENIED, never let through unparsed.
 *
 * Seams:
 *   - decision shape { kind: 'allow' } | { kind: 'deny', reason } |
 *     { kind: 'ask', reason? }: DSH/dsh-tools/README.md:49
 *   - event signature (exec, next) => Promise<PreToolDecision>:
 *     DSH/dsh-tools/lib/types/index.d.ts:38
 *   - pass-through via next(): DSH/dsh-tool-jobs/lib/index.js:179-183
 *   - dispatch scope-routed to the exec's agent: DSH/dsh-tools/lib/index.js:3105
 *   - AST parse + command extraction + wrapper expansion + basename:
 *     unbash (webpro) + @cad0p/unbash-walker (MIT; extraction originally
 *     from jdiamond/pi-guard, MIT)
 *
 * Mount on the HOST plane (web profile cordis.patch.yml or personal bundle
 * patch), so every session in every preset is covered:
 *
 *   - id: bash-guard
 *     name: /path/to/plugins/bash-guard.js
 *     config: {}                # rules come from the drop-in files
 */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  parse,
  extractAllCommandsFromAST,
  expandWrapperCommands,
  getBasename,
  getCommandArgs,
} from "@cad0p/unbash-walker";
import type { CommandRef } from "@cad0p/unbash-walker";
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import type { PreToolDecision } from "@deepseek-ai/dsh-tools";

export const name = "bash-guard";

export const inject = [];

export const Config = z.object({
  guardsDir: z.string().default("$DSH_HOME/plugins/guards"),
  denyMessage: z.string(),
  askMessage: z.string(),
});

type BashGuardConfig = {
  guardsDir?: string;
  denyMessage?: string;
  askMessage?: string;
};

type Verdict = "deny" | "ask" | "allow" | "none";
interface RewriteRule {
  /** Flags to remove when present. Matches exact token, or `flag=value` long form. */
  drop: string[];
  /** If true, also drop the next token after a standalone flag (its value). Only when that next token does NOT start with "-". */
  value?: boolean;
  /** Shown in the log when the rewrite fires. */
  because?: string;
}

interface GuardEntry {
  commands: string[];
  verdict: "deny" | "ask" | "allow";
  reason?: string;
  /** Optional per-subcommand refinement; unnamed subcommands inherit verdict. */
  subcommands?: Record<string, "deny" | "ask" | "allow">;
  /** Optional flag-rewriting pass applied to matching commands before verdicting. */
  rewrites?: RewriteRule[];
}

/** Resolve $DSH_HOME in a configured path. */
function resolveHome(path: string): string {
  if (!path.includes("$DSH_HOME")) return path;
  const home = process.env.DSH_HOME ?? join(process.env.HOME ?? "", ".dsh");
  return path.replaceAll("$DSH_HOME", home);
}

/**
 * Load every rule drop-in in the guards dir. Returns a map of command
 * basename -> { verdict, reason }. A malformed file is logged and skipped.
 */
async function loadRules(ctx: Context, dir: string): Promise<Map<string, GuardEntry>> {
  const rules = new Map<string, GuardEntry>();
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return rules; // no dir yet => no rules => everything allowed
  }
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    try {
      const text = await readFile(join(dir, name), "utf8");
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
      const entry = parsed as Partial<GuardEntry>;
      if (!Array.isArray(entry.commands) || entry.commands.length === 0)
        throw new Error("missing commands[]");
      if (entry.verdict !== "deny" && entry.verdict !== "ask" && entry.verdict !== "allow") {
        throw new Error(`bad verdict: ${String(entry.verdict)}`);
      }
      const clean = entry.commands.filter((c) => typeof c === "string" && c.length > 0);
      let subcommands: Record<string, "deny" | "ask" | "allow"> | undefined;
      if (entry.subcommands !== undefined) {
        if (typeof entry.subcommands !== "object" || entry.subcommands === null)
          throw new Error("bad subcommands");
        subcommands = {};
        for (const [sub, verdict] of Object.entries(entry.subcommands)) {
          if (verdict !== "deny" && verdict !== "ask" && verdict !== "allow") {
            throw new Error(`bad subcommand verdict for "${sub}": ${String(verdict)}`);
          }
          subcommands[sub] = verdict;
        }
      }
      let rewrites: RewriteRule[] | undefined;
      if (entry.rewrites !== undefined) {
        if (!Array.isArray(entry.rewrites)) throw new Error("bad rewrites");
        rewrites = [];
        for (const r of entry.rewrites) {
          if (typeof r !== "object" || r === null) throw new Error("bad rewrite");
          if (!Array.isArray(r.drop) || r.drop.length === 0) throw new Error("bad rewrite drop");
          for (const d of r.drop) {
            if (typeof d !== "string" || d.length === 0) throw new Error("bad rewrite drop entry");
          }
          const cleanRewrite: RewriteRule = {
            drop: r.drop.filter((d) => typeof d === "string" && d.length > 0),
          };
          if (r.value !== undefined) {
            if (typeof r.value !== "boolean") throw new Error("bad rewrite value");
            cleanRewrite.value = r.value;
          }
          if (r.because !== undefined) {
            if (typeof r.because !== "string") throw new Error("bad rewrite because");
            cleanRewrite.because = r.because;
          }
          rewrites.push(cleanRewrite);
        }
      }
      for (const cmd of clean) {
        if (!rewrites) {
          rules.set(cmd, {
            commands: entry.commands,
            verdict: entry.verdict,
            reason: entry.reason,
            subcommands,
          });
        } else {
          rules.set(cmd, {
            commands: entry.commands,
            verdict: entry.verdict,
            reason: entry.reason,
            subcommands,
            rewrites,
          });
        }
      }
    } catch (error) {
      ctx.logger.warn(
        `bash-guard: skipping malformed rule file ${name}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  return rules;
}

/**
 * Merge the rule drop-ins from several dirs (base first, then the phase
 * profile). A later dir overrides an earlier one for the same command, so a
 * profile can tighten or loosen the base. A rule whose command list is ["*"]
 * is the wildcard fallback: it matches any command not named by a specific
 * rule (used by read-only profiles to deny-by-default).
 */
async function loadRulesMulti(ctx: Context, dirs: string[]): Promise<Map<string, GuardEntry>> {
  const merged = new Map<string, GuardEntry>();
  for (const dir of dirs) {
    const rules = await loadRules(ctx, dir);
    for (const [cmd, entry] of rules) merged.set(cmd, entry);
  }
  return merged;
}

/**
 * Default message templates. The formatter substitutes these placeholders:
 *   {command}  - the full bash command that was evaluated
 *   {name}     - the primary matched command basename
 *   {matches}  - a bulleted list of every matched command + subcommand + reason
 *   {reason}   - the primary match's reason
 * A config override (denyMessage / askMessage) replaces the default.
 */
const DEFAULT_DENY_TEMPLATE =
  "bash-guard: the following command was denied:\n\n" +
  "  {command}\n\n" +
  "Matched rule(s):\n{matches}";
const DEFAULT_ASK_TEMPLATE =
  "bash-guard: the following command needs approval:\n\n" +
  "  {command}\n\n" +
  "Matched rule(s):\n{matches}";

interface MatchLine {
  name: string;
  subcommand?: string;
  reason: string;
}
interface MessageContext {
  command: string;
  matches: MatchLine[];
}

/** Substitute {command}, {name}, {matches}, {reason} in a template. */
function formatMessage(template: string, ctx: MessageContext): string {
  const matchesText = ctx.matches
    .map((m) => {
      const sub = m.subcommand ? ` (${m.subcommand})` : "";
      return `  • ${m.name}${sub}: ${m.reason}`;
    })
    .join("\n");
  const primary = ctx.matches[0];
  return template
    .replaceAll("{command}", ctx.command)
    .replaceAll("{matches}", matchesText)
    .replaceAll("{name}", primary?.name ?? "unknown")
    .replaceAll("{reason}", primary?.reason ?? "");
}

/** Build the match lines for a set of hits, deduplicated by (name, subcommand, reason). */
function matchLines(hits: { name: string; rule: GuardEntry; ref: CommandRef }[]): MatchLine[] {
  const seen = new Set<string>();
  const out: MatchLine[] = [];
  for (const h of hits) {
    const line: MatchLine = {
      name: h.name,
      subcommand: firstSubcommand(getCommandArgs(h.ref)),
      reason: h.rule.reason ?? "(no reason supplied by the rule)",
    };
    const key = `${line.name}\0${line.subcommand ?? ""}\0${line.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(line);
  }
  return out;
}
/** Most restrictive wins: deny > ask > allow > none. */
function mostRestrictive(verdicts: Verdict[]): Verdict {
  if (verdicts.includes("deny")) return "deny";
  if (verdicts.includes("ask")) return "ask";
  if (verdicts.includes("allow")) return "allow";
  return "none";
}

/**
 * The subcommand token of a parsed command's argv: the first argument that
 * is not an option. Git globals that take a separate value (`-C <path>`,
 * `--git-dir <path>`, `--work-tree <path>`, `--namespace <path>`) would
 * otherwise make their value read as the subcommand and force the stricter
 * base verdict. Those values are skipped.
 */
const GIT_GLOBALS_WITH_VALUE = new Set(["-C", "--git-dir", "--work-tree", "--namespace"]);

function firstSubcommand(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") break;
    if (GIT_GLOBALS_WITH_VALUE.has(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith("-")) continue;
    return arg;
  }
  return undefined;
}
/**
 * Verdict for one matched command: the rule's per-subcommand verdict when it
 * names the invoked subcommand, else the rule's base verdict.
 */
function verdictFor(rule: GuardEntry, ref: CommandRef): Verdict {
  if (rule.subcommands === undefined) return rule.verdict;
  const sub = firstSubcommand(getCommandArgs(ref));
  const refined = sub !== undefined ? rule.subcommands[sub] : undefined;
  return refined ?? rule.verdict;
}

/** The path-like arguments of a set of command refs (options excluded). */
function pathLikeArgs(refs: CommandRef[]): string[] {
  const out: string[] = [];
  for (const ref of refs) {
    for (const arg of getCommandArgs(ref)) {
      if (arg.startsWith("-")) continue;
      if (
        arg.startsWith("/") ||
        arg.includes("/") ||
        arg.startsWith("./") ||
        arg.startsWith("../") ||
        /\.[A-Za-z0-9]+$/.test(arg)
      ) {
        out.push(arg);
      }
    }
  }
  return out;
}

/**
 * True when the LAST path-like argument of the command lands under one of the
 * safe scratch roots. Used to always allow writes that target scratch, in any
 * phase, while still gating commands whose target is outside scratch.
 */
function scratchAllowed(refs: CommandRef[], safePaths: string[]): boolean {
  const paths = pathLikeArgs(refs);
  if (paths.length === 0) return false;
  const last = paths[paths.length - 1];
  return safePaths.some((sp) => last.startsWith(sp));
}
/** Re-evaluate a command for the pre-execute hook. Returns the (possibly rewritten)
 * command string and a decision: null means allow (caller calls next()).
 * depth guards recursion after a rewrite. */
async function evaluate(
  ctx: Context,
  dirs: string[],
  command: string,
  depth: number,
  safePaths: string[],
  templates: { deny?: string; ask?: string },
): Promise<{ command: string; decision: PreToolDecision | null }> {
  // Parse (fail-closed)
  let script;
  try {
    script = parse(command);
  } catch (error) {
    return {
      command,
      decision: {
        kind: "deny",
        reason: `bash-guard: could not parse the command; refusing to run it unparsed. ${
          error instanceof Error ? error.message : String(error)
        }`,
      },
    };
  }
  if (script.errors && script.errors.length > 0) {
    const messages = script.errors.map((e) => e.message).join("; ");
    return {
      command,
      decision: {
        kind: "deny",
        reason: `bash-guard: parse errors in command; refusing to run it unparsed. ${messages}`,
      },
    };
  }

  const refs = extractAllCommandsFromAST(script, command);
  const { commands } = expandWrapperCommands(refs);
  const all = [...refs, ...commands];

  // Scratch escape: a command whose LAST path-like argument lands under a
  // safe scratch root is always allowed, in every phase. Scratch writes are
  // ephemeral and sandbox-bounded, so bash-guard never gates them — the agent
  // (and especially a subagent) can spool to /tmp/dsh or the aidos durable
  // scratch at any time.
  if (safePaths.length > 0 && scratchAllowed(all, safePaths)) {
    return { command, decision: null };
  }
  const rules = await loadRulesMulti(ctx, dirs);
  const hits = all
    .map((ref) => {
      const name = getBasename(ref);
      const rule = rules.get(name) ?? rules.get("*");
      if (rule === undefined) return undefined;
      return { name, rule, ref, verdict: verdictFor(rule, ref) };
    })
    .filter(
      (h): h is { name: string; rule: GuardEntry; ref: CommandRef; verdict: Verdict } =>
        h !== undefined,
    );

  // Rewrite pass — only at top level (depth 0), top-level commands only
  if (depth === 0 && hits.some((h) => h.rule.rewrites)) {
    // Collect ranges from EVERY hit that carries rewrites, then rebuild the
    // string once. Positions are absolute offsets into the original command,
    // so wrapper-internal refs (e.g. sh -c "rg -r foo") apply too: their
    // suffix words still sit at real offsets inside `command`.
    const ranges: [number, number, string | undefined][] = [];
    for (const hit of hits) {
      if (!hit.rule.rewrites) continue;
      for (const rw of hit.rule.rewrites) {
        for (let i = 0; i < hit.ref.node.suffix.length; i++) {
          const word = hit.ref.node.suffix[i];
          for (const flag of rw.drop) {
            if (word.text === flag) {
              ranges.push([word.pos, word.end, rw.because]);
              if (rw.value && i + 1 < hit.ref.node.suffix.length) {
                const next = hit.ref.node.suffix[i + 1];
                if (!next.text.startsWith("-")) {
                  ranges.push([next.pos, next.end, undefined]);
                }
              }
            } else if (word.text.startsWith(flag + "=")) {
              ranges.push([word.pos, word.end, rw.because]);
            }
          }
        }
      }
    }
    if (ranges.length > 0) {
      ranges.sort((a, b) => a[0] - b[0]);
      let rewritten = "";
      let lastEnd = 0;
      const logBecauses: string[] = [];
      for (const [start, end, because] of ranges) {
        if (start < lastEnd) continue;
        rewritten += command.slice(lastEnd, start);
        lastEnd = end;
        if (because && logBecauses.indexOf(because) === -1) {
          logBecauses.push(because);
        }
      }
      rewritten += command.slice(lastEnd);
      ctx.logger.debug(
        `bash-guard: rewrite (${logBecauses.join("; ")}) ${command} -> ${rewritten}`,
      );
      if (depth < 5) {
        return evaluate(ctx, dirs, rewritten, depth + 1, safePaths, templates);
      }
      command = rewritten;
    }
  }

  if (all.length === 0) {
    return { command, decision: null };
  }

  if (hits.length === 0) {
    return { command, decision: null };
  }

  const verdicts = hits.map((h) => h.verdict);
  const overall = mostRestrictive(verdicts);
  switch (overall) {
    case "deny": {
      const denying = hits.filter((h) => h.verdict === "deny");
      const reason = formatMessage(templates.deny ?? DEFAULT_DENY_TEMPLATE, {
        command,
        matches: matchLines(denying),
      });
      return { command, decision: { kind: "deny", reason } };
    }
    case "ask": {
      const asking = hits.filter((h) => h.verdict === "ask");
      const reason = formatMessage(templates.ask ?? DEFAULT_ASK_TEMPLATE, {
        command,
        matches: matchLines(asking),
      });
      return {
        command,
        decision: { kind: "ask", reason },
      };
    }
    case "allow":
    case "none":
    default:
      return { command, decision: null };
  }
}

export function apply(ctx: Context, config: BashGuardConfig): void {
  const baseDir = resolveHome(config.guardsDir ?? "$DSH_HOME/plugins/guards");
  // aidos exposes the bash policy (profile + scratch roots) for the executing
  // agent. When aidos is not mounted, fall back to the base rules and /tmp/dsh
  // only.
  const aidos = (ctx as unknown as { get(name: string): unknown }).get("aidos") as
    | {
        bashContext(agent: unknown): { profile: string; scratchDir: string; workspaceRoot: string };
      }
    | undefined;

  ctx.on("tools/pre-execute", async (exec, next) => {
    if (exec.name !== "bash") return next();
    const command = (exec.arguments as { command?: string } | undefined)?.command;
    if (typeof command !== "string" || command.trim().length === 0) return next();

    const agent = exec.agent;
    let profile = "none";
    const safePaths: string[] = ["/tmp/dsh"];
    if (aidos && agent) {
      try {
        const bc = aidos.bashContext(agent);
        profile = bc.profile;
        if (bc.scratchDir) safePaths.push(bc.scratchDir);
      } catch {
        // aidos not ready: base policy + /tmp/dsh only.
      }
    }
    const dirs = profile === "none" ? [baseDir] : [baseDir, join(baseDir, `profile-${profile}`)];

    const templates = { deny: config.denyMessage, ask: config.askMessage };
    const result = await evaluate(ctx, dirs, command, 0, safePaths, templates);
    if (result.command !== command) {
      try {
        (exec.arguments as { command: string }).command = result.command;
      } catch {
        ctx.logger.warn("bash-guard: could not apply rewritten command; running original");
      }
    }
    if (result.decision === null) return next();
    return result.decision;
  });
}
