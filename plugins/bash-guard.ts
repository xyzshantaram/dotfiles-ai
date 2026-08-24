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
});

type BashGuardConfig = {
  guardsDir?: string;
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
          const cleanRewrite: RewriteRule = { drop: r.drop.filter((d) => typeof d === "string" && d.length > 0) };
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

/** The default deny reason for a listed command without its own. */
const DEFAULT_DENY = (name: string): string =>
  `The command "${name}" is denied in the personal bundle. ` +
  "Use the sanctioned tool or ask the user to run it.";

/** The default ask reason for a listed command. */
const DEFAULT_ASK = (name: string): string =>
  `The command "${name}" needs approval. Confirm or reject.`;

/** Most restrictive wins: deny > ask > allow > none. */
function mostRestrictive(verdicts: Verdict[]): Verdict {
  if (verdicts.includes("deny")) return "deny";
  if (verdicts.includes("ask")) return "ask";
  if (verdicts.includes("allow")) return "allow";
  return "none";
}

/**
 * The subcommand token of a parsed command's argv: the first argument that
 * is not an option. Conservative by construction: a global option that takes
 * a separate value (`git -C <path> status`) makes its value read as the
 * subcommand, which will not sit in the rule map, so the stricter base
 * verdict applies instead of anything looser.
 */
function firstSubcommand(args: string[]): string | undefined {
  for (const arg of args) {
    if (arg === "--") break;
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

/** Re-evaluate a command for the pre-execute hook. Returns the (possibly rewritten)
 * command string and a decision: null means allow (caller calls next()).
 * depth guards recursion after a rewrite. */
async function evaluate(
  ctx: Context,
  dir: string,
  command: string,
  depth: number,
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

  const rules = await loadRules(ctx, dir);
  const hits = all
    .map((ref) => {
      const name = getBasename(ref);
      const rule = rules.get(name);
      if (rule === undefined) return undefined;
      return { name, rule, ref, verdict: verdictFor(rule, ref) };
    })
    .filter((h): h is { name: string; rule: GuardEntry; ref: CommandRef; verdict: Verdict } => h !== undefined);

  // Rewrite pass — only at top level (depth 0), top-level commands only
  if (depth === 0 && hits.some((h) => h.rule.rewrites)) {
    let rewritten = command;
    let changed = false;
    for (const hit of hits) {
      if (!hit.rule.rewrites || hit.ref.source !== command) {
        if (hit.rule.rewrites && hit.ref.source !== command) {
          ctx.logger.debug(`bash-guard: skipping rewrite for wrapper-internal ref to ${hit.name}`);
        }
        continue;
      }
      const ranges: [number, number, string | undefined][] = [];
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
      if (ranges.length > 0) {
        ranges.sort((a, b) => a[0] - b[0]);
        let segment = "";
        let lastEnd = 0;
        const logBecauses: string[] = [];
        for (const [start, end, because] of ranges) {
          if (start < lastEnd) continue;
          segment += command.slice(lastEnd, start);
          lastEnd = end;
          if (because && logBecauses.indexOf(because) === -1) {
            logBecauses.push(because);
          }
        }
        segment += command.slice(lastEnd);
        rewritten = segment;
        changed = true;
        ctx.logger.debug(
          `bash-guard: rewrite (${logBecauses.join("; ")}) ${command} -> ${rewritten}`,
        );
      }
    }
    if (changed) {
      if (depth < 5) {
        return evaluate(ctx, dir, rewritten, depth + 1);
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
      const hit = hits.find((h) => h.verdict === "deny");
      const reason = hit?.rule.reason ?? DEFAULT_DENY(hit?.name ?? "unknown");
      return { command, decision: { kind: "deny", reason } };
    }
    case "ask": {
      const hit = hits.find((h) => h.verdict === "ask");
      return {
        command,
        decision: { kind: "ask", reason: hit?.rule.reason ?? DEFAULT_ASK(hit?.name ?? "unknown") },
      };
    }
    case "allow":
    case "none":
    default:
      return { command, decision: null };
  }
}

export function apply(ctx: Context, config: BashGuardConfig): void {
  const dir = resolveHome(config.guardsDir ?? "$DSH_HOME/plugins/guards");

  ctx.on("tools/pre-execute", async (exec, next) => {
    if (exec.name !== "bash") return next();
    const command = (exec.arguments as { command?: string } | undefined)?.command;
    if (typeof command !== "string" || command.trim().length === 0) return next();

    const result = await evaluate(ctx, dir, command, 0);
    if (result.command !== command) {
      try {
        exec.arguments.command = result.command;
      } catch {
        ctx.logger.warn("bash-guard: could not apply rewritten command; running original");
      }
    }
    if (result.decision === null) return next();
    return result.decision;
  });
}
