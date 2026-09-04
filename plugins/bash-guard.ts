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
 *     "reason": "Raw git is denied. Useful mutations prompt first.",
 *     "subcommands": {              // optional, per-subcommand refinement
 *       "status": "allow",          // read-only verbs run without prompting
 *       "worktree": "ask"           // useful mutations prompt the user
 *     },
 *     "translate": "grep"           // optional, built-in command translator
 *   }
 *
 * A subcommands entry refines the base verdict by the invoked subcommand
 * (the first non-option argument). Subcommands the map does not name
 * inherit the base verdict, so an allow-list stays closed under every verb
 * it does not name.
 *
 * A translate entry names a built-in translator that maps the whole matched
 * command onto a preferred tool. The value must be a key of TRANSLATORS in
 * ./bash-guard-translate. The translator turns `grep` into `rg` and `find` into
 * `fd`. A translator that cannot map the command reports a blocker, and the
 * guard denies the call with that blocker in the reason.
 *
 * The guard NEVER rewrites the model's command. The harness deep-freezes
 * exec.arguments before a pre-execute listener sees it: dsh-tools builds the
 * execution with `arguments: deepFreeze(snapshotJsonValue(...))`. The
 * PreToolDecision contract also excludes input rewriting, because arguments are
 * already logged and presented. An earlier version of this plugin assigned to
 * exec.arguments.command anyway. That assignment always threw, so the older
 * `rg -r` rewrite was a silent no-op for its whole life.
 *
 * So a rewrite or a translation becomes a DENY whose message carries the exact
 * replacement command. The model runs that command verbatim on its next turn.
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
import { join, resolve, sep, isAbsolute } from "node:path";
import {
  parse,
  extractAllCommandsFromAST,
  expandWrapperCommands,
  getBasename,
  getCommandArgs,
  isStaticallyResolvable,
} from "@cad0p/unbash-walker";
import type { CommandRef } from "@cad0p/unbash-walker";
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { TRANSLATORS, shellQuote } from "./bash-guard-translate";

export const name = "bash-guard";

export const inject = [];

export const Config = z.object({
  guardsDir: z.string().default("$DSH_HOME/plugins/guards"),
  // Left unset by default (not defaulted to ""): evaluate() falls back to
  // DEFAULT_DENY_TEMPLATE/DEFAULT_ASK_TEMPLATE with `??`, which only skips a
  // nullish value. A "" default here used to satisfy that check and silently
  // format against an empty template, rendering a bare "Error: " on every
  // deny/ask. Do not add a string default back without also changing the
  // `??` fallback in evaluate().
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
  drop?: string[];
  /** Flags to insert after the command word, each only when it is absent. */
  add?: { flag: string; value?: string }[];
  /** If true, also drop the next token after a standalone flag (its value). Only when that next token does NOT start with "-". */
  value?: boolean;
  /** Shown in the log when the rewrite fires. */
  because?: string;
}

interface GuardEntry {
  commands: string[];
  verdict: "deny" | "ask" | "allow";
  reason?: string;
  /** Rewrites and clean translations auto-run instead of asking. A translator blocker still denies. */
  readOnly?: boolean;
  /** Optional per-subcommand refinement; unnamed subcommands inherit verdict. */
  subcommands?: Record<string, "deny" | "ask" | "allow">;
  /** Optional flag-rewriting pass applied to matching commands before verdicting. */
  rewrites?: RewriteRule[];
  /** Names a built-in translator applied to matching commands before verdicting. */
  translate?: string;
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
    ctx.logger.debug(`bash-guard: rules directory not found at ${dir}; allowing all commands`);
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
      if (entry.readOnly !== undefined && typeof entry.readOnly !== "boolean") {
        throw new Error(`bad readOnly: ${String(entry.readOnly)}`);
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
          if (r.drop === undefined && r.add === undefined)
            throw new Error("bad rewrite: needs drop or add");
          const cleanRewrite: RewriteRule = {};
          if (r.drop !== undefined) {
            if (!Array.isArray(r.drop) || r.drop.length === 0) throw new Error("bad rewrite drop");
            for (const d of r.drop) {
              if (typeof d !== "string" || d.length === 0)
                throw new Error("bad rewrite drop entry");
            }
            cleanRewrite.drop = r.drop.filter((d) => typeof d === "string" && d.length > 0);
          }
          if (r.add !== undefined) {
            if (!Array.isArray(r.add) || r.add.length === 0) throw new Error("bad rewrite add");
            cleanRewrite.add = [];
            for (const a of r.add) {
              if (
                typeof a !== "object" ||
                a === null ||
                typeof a.flag !== "string" ||
                a.flag.length === 0
              ) {
                throw new Error("bad rewrite add entry");
              }
              if (a.value !== undefined && typeof a.value !== "string") {
                throw new Error("bad rewrite add value");
              }
              cleanRewrite.add.push(
                a.value === undefined ? { flag: a.flag } : { flag: a.flag, value: a.value },
              );
            }
          }
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
      let translate: string | undefined;
      if (entry.translate !== undefined) {
        if (typeof entry.translate !== "string" || entry.translate.length === 0) {
          throw new Error(`bad translate: ${String(entry.translate)}`);
        }
        if (!Object.hasOwn(TRANSLATORS, entry.translate)) {
          throw new Error(`unknown translate: ${entry.translate}`);
        }
        translate = entry.translate;
      }
      for (const cmd of clean) {
        const built: GuardEntry = {
          commands: entry.commands,
          verdict: entry.verdict,
          reason: entry.reason,
          subcommands,
        };
        if (rewrites) built.rewrites = rewrites;
        if (translate) built.translate = translate;
        if (entry.readOnly !== undefined) built.readOnly = entry.readOnly;
        rules.set(cmd, built);
      }

      ctx.logger.debug(`bash-guard: loaded ${clean.length} command(s) from rule file ${name}`);
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
 *   {count}    - "1 filter" or "N filters"
 *   {detail}   - a short parenthetical, e.g. "commit is blocked"
 * A config override (denyMessage / askMessage) replaces the default.
 *
 * The two defaults differ on purpose. A DENIAL is read by the model, which
 * needs the full reason to choose a different command, so it keeps the command
 * and the bulleted rules. An APPROVAL is read by a person on a card that
 * already shows the command underneath, so it is one scannable line.
 */
const DEFAULT_DENY_TEMPLATE =
  "bash-guard: {name} denied by {count} ({detail})\n\n" +
  "  {command}\n\n" +
  "Matched rule(s):\n{matches}";
const DEFAULT_ASK_TEMPLATE =
  "bash-guard: {name} blocked by {count} ({detail}) — needs your approval";

interface MatchLine {
  name: string;
  subcommand?: string;
  reason: string;
}
interface MessageContext {
  command: string;
  matches: MatchLine[];
}

/**
 * Shorten one rule reason to something that fits a single scannable line.
 * Prefer the subcommand, which is the concrete thing that was blocked, and fall
 * back to the reason's first sentence.
 */
function shortDetail(match: MatchLine): string {
  if (match.subcommand) return `${match.subcommand} is blocked`;
  const first = match.reason.split(/(?<=[.!?])\s/u)[0] ?? match.reason;
  const trimmed = first.trim().replace(/[.]$/u, "");
  return trimmed.length > 60 ? `${trimmed.slice(0, 59)}…` : trimmed;
}

/** Substitute {command}, {name}, {matches}, {reason}, {count}, {detail}. */
function formatMessage(template: string, ctx: MessageContext): string {
  const matchesText = ctx.matches
    .map((m) => {
      const sub = m.subcommand ? ` (${m.subcommand})` : "";
      return `  • ${m.name}${sub}: ${m.reason}`;
    })
    .join("\n");
  const primary = ctx.matches[0];
  // Two details at most. Past that the line stops being scannable, which is the
  // whole point of the short form.
  const details = ctx.matches.slice(0, 2).map(shortDetail);
  if (ctx.matches.length > 2) details.push(`+${ctx.matches.length - 2} more`);
  return template.replace(
    /(\{command\}|\{matches\}|\{name\}|\{reason\}|\{count\}|\{detail\})/g,
    (token) => {
      if (token === "{command}") return ctx.command;
      if (token === "{matches}") return matchesText;
      if (token === "{name}") return primary?.name ?? "unknown";
      if (token === "{count}")
        return `${ctx.matches.length} filter${ctx.matches.length === 1 ? "" : "s"}`;
      if (token === "{detail}") return details.join(", ") || "no detail";
      return primary?.reason ?? "";
    },
  );
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
function normalizeScratchPath(p: string, workspaceRoot?: string): string {
  if (isAbsolute(p)) return resolve(p);
  if (workspaceRoot) return resolve(join(workspaceRoot, p));
  return p;
}
function isUnderScratch(target: string, root: string): boolean {
  return target === root || target.startsWith(root + sep);
}
function scratchAllowed(refs: CommandRef[], safePaths: string[], workspaceRoot?: string): boolean {
  const paths = pathLikeArgs(refs);
  if (paths.length === 0) return false;
  return paths.every((p) => {
    const n = normalizeScratchPath(p, workspaceRoot);
    return safePaths.some((sp) => isUnderScratch(n, sp));
  });
}

/** Characters the shell expands itself when a word reaches it unquoted. */
const GLOB_CHARS = ["*", "?", "[", "]", "{", "}", "~"];

/**
 * Words that carry a GLOB_CHARS character but that the shell leaves alone.
 * Bash expands a brace only when the braces hold a comma or a range, so a bare
 * `{}` reaches the command as written. `find -exec` uses `{}` as its result
 * placeholder, so treating it as a glob would skip every -exec translation.
 */
const LITERAL_WORDS = new Set(["{}"]);

/**
 * True when one command ref can be spliced back into `command` safely.
 *
 * The splice replaces the byte range that runs from the command word to the
 * last suffix word. Every one of those offsets must address `command` itself,
 * and every word must survive a round trip through shellQuote.
 *
 * A ref that came out of expandWrapperCommands fails the first test.
 * expandWrapperCommands rebuilds the inner command text and parses that as a
 * fresh source, so the ref carries offsets into the rebuilt string and not into
 * the outer command. A top-level ref carries the outer command as its source.
 *
 * A word that is not statically resolvable fails, because only the shell can
 * compute its value.
 *
 * An unquoted glob fails too. getCommandArgs hands back the unquoted value, so
 * shellQuote would put quotes around the glob and stop the shell from expanding
 * it. A quoted glob is safe, because its text still carries the original
 * quotes, which is why the test compares the text against the value.
 */
function translatableRef(
  ref: CommandRef,
  command: string,
): { ok: true } | { ok: false; why: string } {
  if (ref.source !== command) {
    return {
      ok: false,
      why: "it sits inside a wrapper, so its offsets address a rebuilt string",
    };
  }
  if (ref.node.name === undefined) return { ok: false, why: "it has no command word" };
  for (const word of [ref.node.name, ...ref.node.suffix]) {
    if (!isStaticallyResolvable(word)) {
      return { ok: false, why: `\`${word.text}\` depends on a shell expansion` };
    }
    if (
      word.text === (word.value ?? word.text) &&
      !LITERAL_WORDS.has(word.text) &&
      GLOB_CHARS.some((c) => word.text.includes(c))
    ) {
      return { ok: false, why: `the shell expands \`${word.text}\` before the command runs` };
    }
  }
  return { ok: true };
}
/**
 * The decision the guard reaches for one command.
 *
 * `command` is always the string that should execute: the model's own command
 * for a plain allow, the rewritten or translated form otherwise. `rewritten`
 * is true only when `command` differs from the model's input. `reason` is
 * present whenever a matched rule had a non-allow verdict. An `ask` also
 * carries `original`, the model's unmodified command.
 */
export type GuardOutcome =
  | { action: "run"; command: string; rewritten: boolean; reason?: string }
  | { action: "ask"; command: string; original: string; rewritten: boolean; reason?: string }
  | { action: "deny"; reason: string };

/**
 * Build the message that hands the model an exact replacement command.
 *
 * The harness deep-freezes exec.arguments, so the replacement travels in the
 * message instead. The model runs it verbatim on its next turn.
 */
function suggestionMessage(suggested: string, notes: string[], mutatingWhy: string[]): string {
  let reason = `bash-guard: that command is not run directly. Run this instead:\n\n  ${suggested}\n`;
  if (mutatingWhy.length > 0) {
    reason += `\nThis command changes files. Ask the user before you run it.\n`;
    for (const why of mutatingWhy) reason += `  ${why}\n`;
  }
  if (notes.length > 0) {
    reason += `\nWhy: ${notes[0]}\n`;
    for (const note of notes.slice(1)) reason += `     ${note}\n`;
  }
  return reason;
}

/**
 * Outcome for a rewrite or a clean translation. A readOnly rule auto-runs the
 * replacement; any other rule asks with the replacement attached. The reason is
 * the full suggestion message, so the pre-execute listener can map this back
 * onto the same deny it produced under the old contract.
 */
function rewriteOutcome(
  suggested: string,
  original: string,
  notes: string[],
  mutatingWhy: string[],
  readOnly: boolean,
): GuardOutcome {
  const reason = suggestionMessage(suggested, notes, mutatingWhy);
  const rewritten = suggested !== original;
  if (readOnly) return { action: "run", command: suggested, rewritten, reason };
  return { action: "ask", command: suggested, original, rewritten, reason };
}

/** True when a rewrite `add` flag is already present in the command's words. */
function flagPresent(ref: CommandRef, flag: string): boolean {
  return ref.node.suffix.some((w) => w.text === flag || w.text.startsWith(flag + "="));
}

/** The hits whose rules carry rewrites, in match order. */
function rewritingHits(hits: { rule: GuardEntry }[]): { rule: GuardEntry }[] {
  return hits.filter((h) => h.rule.rewrites !== undefined);
}

/** A rewrite or translation auto-runs only when every contributing rule is readOnly. */
function isReadOnly(hits: { rule: GuardEntry }[]): boolean {
  return hits.every((h) => h.rule.readOnly === true);
}

/** Put the matched rule's reason ahead of the rewrite notes. */
function withRuleReason(hits: { rule: GuardEntry }[], notes: string[]): string[] {
  const reason = hits[0]?.rule.reason;
  return reason === undefined ? notes : [reason, ...notes];
}

/** Evaluate a command and return the outcome. The function never returns a
 * null or an undefined result: a plain allow is a `run` outcome that carries
 * the model's own command with `rewritten: false`. Nothing is ever written
 * back to the model's arguments: a rewrite or a translation becomes an outcome
 * whose `command` carries the replacement. */
export async function evaluate(
  ctx: Context,
  dirs: string[],
  command: string,
  safePaths: string[],
  workspaceRoot: string | undefined,
  templates: { deny?: string; ask?: string },
): Promise<GuardOutcome> {
  // Caveats collected by the translation pass. They ride the deny message.
  const notes: string[] = [];
  // Parse (fail-closed)
  let script;
  try {
    script = parse(command);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx.logger.warn(`bash-guard: parse error in command; denying: ${command} (error: ${errorMsg})`);
    return {
      action: "deny",
      reason: `bash-guard: could not parse the command; refusing to run it unparsed. ${errorMsg}`,
    };
  }
  if (script.errors && script.errors.length > 0) {
    const messages = script.errors.map((e) => e.message).join("; ");
    ctx.logger.warn(`bash-guard: script parse errors; denying: ${command} (errors: ${messages})`);
    return {
      action: "deny",
      reason: `bash-guard: parse errors in command; refusing to run it unparsed. ${messages}`,
    };
  }

  const refs = extractAllCommandsFromAST(script, command);
  const { commands } = expandWrapperCommands(refs);
  const all = [...refs, ...commands];
  ctx.logger.debug(`bash-guard: extracted ${all.length} command(s) from: ${command}`);

  // Scratch escape: a command whose LAST path-like argument lands under a
  // safe scratch root is always allowed, in every phase. Scratch writes are
  // ephemeral and sandbox-bounded, so bash-guard never gates them — the agent
  // (and especially a subagent) can spool to /tmp/dsh or the aidos durable
  // scratch at any time.
  if (safePaths.length > 0 && scratchAllowed(all, safePaths, workspaceRoot)) {
    ctx.logger.info(`bash-guard: scratch write allowed: ${command}`);
    return { action: "run", command, rewritten: false };
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

  // Rewrite pass. A translate rule owns the whole command, so it wins: only
  // run the flag-level rewrite when no translator claimed this command.
  if (!hits.some((h) => h.rule.translate) && hits.some((h) => h.rule.rewrites)) {
    // Collect edits from EVERY hit that carries rewrites, then rebuild the
    // string once. Positions are absolute offsets into the original command,
    // so wrapper-internal refs (e.g. sh -c "rg -r foo") apply too: their
    // suffix words still sit at real offsets inside `command`. A drop is an
    // empty replacement over a byte range. An add inserts after the command
    // word and only when its flag is absent, so it is idempotent.
    const edits: { start: number; end: number; text: string; because?: string }[] = [];
    let addMatched = false;
    for (const hit of hits) {
      if (!hit.rule.rewrites) continue;
      for (const rw of hit.rule.rewrites) {
        for (let i = 0; i < hit.ref.node.suffix.length; i++) {
          const word = hit.ref.node.suffix[i];
          for (const flag of rw.drop ?? []) {
            if (word.text === flag) {
              // Standalone flag: drop it, and its next token when that token
              // holds the flag's value.
              edits.push({ start: word.pos, end: word.end, text: "", because: rw.because });
              if (rw.value && i + 1 < hit.ref.node.suffix.length) {
                const next = hit.ref.node.suffix[i + 1];
                if (!next.text.startsWith("-")) {
                  edits.push({ start: next.pos, end: next.end, text: "" });
                }
              }
            } else if (word.text.startsWith(flag + "=")) {
              // Long flag with an inline value: --replace=FOO drops whole.
              edits.push({ start: word.pos, end: word.end, text: "", because: rw.because });
            } else if (
              rw.value &&
              flag.length === 2 &&
              word.text.length > 2 &&
              word.text.startsWith(flag)
            ) {
              // Short-flag cluster with an attached value, e.g. rg -rln: rg
              // parses that as -r plus the value "ln", so the whole word is
              // flag+value and all of it goes. The `rw.value` guard keeps this
              // branch to value-taking drop flags: a bare no-value letter (say
              // -rn where r means recursion) parses as two flags, and rg -n foo
              // stays a plain search. Dropping a no-value letter with its
              // cluster would eat unrelated flags. Multi-flag
              // clusters that end in a value flag, like -xr foo, hit the
              // standalone branch above: the -x survives, -r and foo go.
              edits.push({ start: word.pos, end: word.end, text: "", because: rw.because });
            }
          }
        }
        if (rw.add !== undefined) {
          addMatched = true;
          for (const a of rw.add) {
            if (flagPresent(hit.ref, a.flag)) continue;
            // The leading space separates the flag from the command word, so
            // `jq .` becomes `jq --indent 2 .`.
            let text = ` ${a.flag}`;
            if (a.value !== undefined) text += ` ${shellQuote(a.value)}`;
            const at = hit.ref.node.name.end;
            // extractAllCommandsFromAST and expandWrapperCommands can hand back
            // the same ref twice, so an identical insert at the same offset is
            // a duplicate, not a second flag.
            if (edits.some((e) => e.start === at && e.text === text)) continue;
            edits.push({ start: at, end: at, text, because: rw.because });
          }
        }
      }
    }
    if (edits.length > 0) {
      edits.sort((a, b) => a.start - b.start || a.end - b.end);
      let rewritten = "";
      let lastEnd = 0;
      const logBecauses: string[] = [];
      for (const e of edits) {
        if (e.start < lastEnd) continue;
        // Swallow the space that separated a dropped flag from the word before
        // it. Without this the suggestion carries a doubled space, and the
        // model copies it verbatim. Only the gap between words is touched, so
        // a quoted argument holding two spaces is left alone. Insertions keep
        // their own leading space.
        let from = e.start;
        if (e.text === "" && from > lastEnd && command[from - 1] === " ") from -= 1;
        rewritten += command.slice(lastEnd, from) + e.text;
        lastEnd = e.end;
        if (e.because && !logBecauses.includes(e.because)) {
          logBecauses.push(e.because);
        }
      }
      rewritten += command.slice(lastEnd);
      ctx.logger.debug(
        `bash-guard: rewrite (${logBecauses.join("; ")}) ${command} -> ${rewritten}`,
      );
      return rewriteOutcome(
        rewritten,
        command,
        withRuleReason(rewritingHits(hits), logBecauses),
        [],
        isReadOnly(rewritingHits(hits)),
      );
    }
    // An add whose flag was already present changed nothing, but the rule did
    // match, so the verdict still rides this outcome instead of falling
    // through to the base rule verdict.
    if (addMatched) {
      const rwHits = rewritingHits(hits);
      return rewriteOutcome(command, command, withRuleReason(rwHits, []), [], isReadOnly(rwHits));
    }
  }

  // Translation pass. A rule may name a built-in
  // translator that maps a whole matched command onto a preferred tool, for
  // example `grep` onto `rg`. The splice writes back into the original command
  // string, so only a ref that translatableRef accepts may take part. A ref
  // from a wrapper expansion carries offsets into a rebuilt string, so it is
  // skipped.
  if (hits.some((h) => h.rule.translate)) {
    const ranges: {
      start: number;
      end: number;
      text: string;
      lines: string[];
      why?: string;
    }[] = [];
    for (const hit of hits) {
      const key = hit.rule.translate;
      if (key === undefined) continue;
      const translator = TRANSLATORS[key];
      if (translator === undefined) {
        ctx.logger.warn(`bash-guard: no translator named "${key}"; leaving ${hit.name} as written`);
        continue;
      }
      const node = hit.ref.node;
      // Check the splice BEFORE translating. A hit that fails here must fall
      // through to the rule's own base verdict. It must not raise a deny that
      // names a translator blocker, because the real reason is different.
      const splice = translatableRef(hit.ref, command);
      if (splice.ok === false) {
        ctx.logger.debug(`bash-guard: not translating ${hit.name} in ${command}: ${splice.why}`);
        continue;
      }
      const outcome = translator(getCommandArgs(hit.ref), hit.name);
      if (outcome.kind === "blocked") {
        const text = command.slice(node.pos, node.end);
        ctx.logger.warn(`bash-guard: translation blocked for ${hit.name}: ${outcome.why}`);
        return {
          action: "deny",
          reason: `bash-guard: could not translate \`${text}\`. ${outcome.why} Run the rg or fd equivalent yourself.`,
        };
      }
      const start = node.name.pos;
      const end = node.suffix.length > 0 ? node.suffix[node.suffix.length - 1].end : node.name.end;
      // A redirect parked between the command word and the last argument would
      // have to be re-emitted inside the replacement. That is not worth the bug
      // surface, so deny instead.
      if (node.redirects.some((r) => r.pos >= start && r.pos < end)) {
        return {
          action: "deny",
          reason: `bash-guard: could not translate \`${command.slice(start, end)}\`. A redirect sits between the arguments. Run the rg or fd equivalent yourself.`,
        };
      }
      // suggestionDeny prints the replacement itself, so only the caveats are
      // collected here.
      const lines: string[] = [];
      for (const note of outcome.notes) {
        if (note.length > 0) lines.push(note);
      }
      ranges.push({
        start,
        end,
        text: outcome.argv.map(shellQuote).join(" "),
        lines,
        why: outcome.kind === "ask" ? outcome.why : undefined,
      });
    }
    if (ranges.length > 0) {
      ranges.sort((a, b) => a.start - b.start);
      let translated = "";
      let lastEnd = 0;
      const whys: string[] = [];
      for (const range of ranges) {
        if (range.start < lastEnd) continue;
        translated += command.slice(lastEnd, range.start) + range.text;
        lastEnd = range.end;
        notes.push(...range.lines);
        if (range.why !== undefined) whys.push(range.why);
      }
      translated += command.slice(lastEnd);
      ctx.logger.info(`bash-guard: suggesting \`${translated}\` instead of \`${command}\``);
      // A translator blocker already returned above, so this is a clean
      // translation. The readOnly gate decides run versus ask; the listener
      // maps the ask back onto a deny, because it cannot rewrite the frozen
      // arguments and an approval would run the ORIGINAL command.
      const translateHits = hits.filter((h) => h.rule.translate !== undefined);
      return rewriteOutcome(
        translated,
        command,
        withRuleReason(translateHits, notes),
        whys,
        isReadOnly(translateHits),
      );
    }
  }

  if (all.length === 0) {
    ctx.logger.debug(`bash-guard: no actual commands found in: ${command}`);
    return { action: "run", command, rewritten: false };
  }

  if (hits.length === 0) {
    ctx.logger.debug(`bash-guard: no rules matched for: ${command}`);
    return { action: "run", command, rewritten: false };
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
      const ruleNames = [...new Set(denying.map((h) => h.name))].join(", ");
      ctx.logger.warn(`bash-guard: command denied by rules [${ruleNames}]: ${command}`);
      return { action: "deny", reason };
    }
    case "ask": {
      const asking = hits.filter((h) => h.verdict === "ask");
      const reason = formatMessage(templates.ask ?? DEFAULT_ASK_TEMPLATE, {
        command,
        matches: matchLines(asking),
      });
      const ruleNames = [...new Set(asking.map((h) => h.name))].join(", ");
      ctx.logger.warn(`bash-guard: command asks for approval by rules [${ruleNames}]: ${command}`);
      return { action: "ask", command, original: command, rewritten: false, reason };
    }
    case "allow":
    case "none":
    default:
      ctx.logger.debug(`bash-guard: command allowed: ${command}`);
      return { action: "run", command, rewritten: false };
  }
}

export function apply(ctx: Context, config: BashGuardConfig): void {
  const baseDir = resolveHome(config.guardsDir ?? "$DSH_HOME/plugins/guards");

  ctx.on("tools/pre-execute", async (exec, next) => {
    if (exec.name !== "bash") return next();
    const command = (exec.arguments as { command?: string } | undefined)?.command;
    if (typeof command !== "string" || command.trim().length === 0) return next();

    ctx.logger.debug(`bash-guard: evaluating command: ${command}`);

    const agent = exec.agent;
    let profile = "none";
    const safePaths: string[] = ["/tmp/dsh"];
    let workspaceRoot: string | undefined;
    const aidos = (ctx as unknown as { get(name: string): unknown }).get("aidos") as
      | {
          bashContext(agent: unknown): {
            profile: string;
            scratchDir: string;
            workspaceRoot: string;
          };
        }
      | undefined;
    if (aidos && agent) {
      try {
        const bc = aidos.bashContext(agent);
        profile = bc.profile;
        workspaceRoot = bc.workspaceRoot;
        if (bc.scratchDir) safePaths.push(bc.scratchDir);
        ctx.logger.debug(`bash-guard: resolved aidos profile: ${profile}`);
      } catch (error) {
        ctx.logger.debug(`bash-guard: aidos context not available; using default profile`);
      }
    }
    const dirs = profile === "none" ? [baseDir] : [baseDir, join(baseDir, `profile-${profile}`)];

    const templates = { deny: config.denyMessage, ask: config.askMessage };
    const outcome = await evaluate(ctx, dirs, command, safePaths, workspaceRoot, templates);
    if (outcome.action === "deny") return { kind: "deny", reason: outcome.reason };
    // The listener cannot rewrite frozen arguments, so any outcome that
    // carries a replacement command stays a deny whose message carries that
    // command: an approval would run the ORIGINAL command instead.
    if (outcome.rewritten) return { kind: "deny", reason: outcome.reason };
    if (outcome.action === "ask") return { kind: "ask", reason: outcome.reason };
    return next();
  });
}
