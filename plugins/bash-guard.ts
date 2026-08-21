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
 *     "reason": "Raw git is denied. Use the mcp__git__* tools or ask the user."
 *   }
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
 * Seams (cited in VERIFY.md W10):
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
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parse, extractAllCommandsFromAST, expandWrapperCommands, getBasename } from '@cad0p/unbash-walker'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-tools'

export const name = 'bash-guard'

export const inject = []

export const Config = z.object({
  guardsDir: z.string().default('$DSH_HOME/plugins/guards'),
})

type BashGuardConfig = {
  guardsDir?: string
}

type Verdict = 'deny' | 'ask' | 'allow' | 'none'

interface GuardEntry {
  commands: string[]
  verdict: 'deny' | 'ask' | 'allow'
  reason?: string
}

/** Resolve $DSH_HOME in a configured path. */
function resolveHome(path: string): string {
  if (!path.includes('$DSH_HOME')) return path
  const home = process.env.DSH_HOME ?? join(process.env.HOME ?? '', '.dsh')
  return path.replaceAll('$DSH_HOME', home)
}

/**
 * Load every rule drop-in in the guards dir. Returns a map of command
 * basename -> { verdict, reason }. A malformed file is logged and skipped.
 */
async function loadRules(ctx: Context, dir: string): Promise<Map<string, GuardEntry>> {
  const rules = new Map<string, GuardEntry>()
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return rules // no dir yet => no rules => everything allowed
  }
  for (const name of names) {
    if (!name.endsWith('.json')) continue
    try {
      const text = await readFile(join(dir, name), 'utf8')
      const parsed: unknown = JSON.parse(text)
      if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
      const entry = parsed as Partial<GuardEntry>
      if (!Array.isArray(entry.commands) || entry.commands.length === 0) throw new Error('missing commands[]')
      if (entry.verdict !== 'deny' && entry.verdict !== 'ask' && entry.verdict !== 'allow') {
        throw new Error(`bad verdict: ${String(entry.verdict)}`)
      }
      const clean = entry.commands.filter((c) => typeof c === 'string' && c.length > 0)
      for (const cmd of clean) rules.set(cmd, { commands: entry.commands, verdict: entry.verdict, reason: entry.reason })
    } catch (error) {
      ctx.logger.warn(`bash-guard: skipping malformed rule file ${name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return rules
}

/** The default deny reason for a listed command without its own. */
const DEFAULT_DENY = (name: string): string =>
  `The command "${name}" is denied in the personal bundle. ` +
  'Use the sanctioned tool or ask the user to run it.'

/** The default ask reason for a listed command. */
const DEFAULT_ASK = (name: string): string =>
  `The command "${name}" needs approval. Confirm or reject.`

/** Most restrictive wins: deny > ask > allow > none. */
function mostRestrictive(verdicts: Verdict[]): Verdict {
  if (verdicts.includes('deny')) return 'deny'
  if (verdicts.includes('ask')) return 'ask'
  if (verdicts.includes('allow')) return 'allow'
  return 'none'
}

export function apply(ctx: Context, config: BashGuardConfig): void {
  const dir = resolveHome(config.guardsDir ?? '$DSH_HOME/plugins/guards')

  ctx.on('tools/pre-execute', async (exec, next) => {
    if (exec.name !== 'bash') return next()
    const command = (exec.arguments as { command?: string } | undefined)?.command
    if (typeof command !== 'string' || command.trim().length === 0) return next()

    let script
    try {
      script = parse(command)
    } catch (error) {
      // Parse threw outright: fail closed.
      return {
        kind: 'deny',
        reason: `bash-guard: could not parse the command; refusing to run it unparsed. ${
          error instanceof Error ? error.message : String(error)
        }`,
      }
    }
    // unbash returns a best-effort partial AST with errors for malformed
    // input; a partial tree is not trustworthy for gating.
    if (script.errors && script.errors.length > 0) {
      const messages = script.errors.map((e) => e.message).join('; ')
      return { kind: 'deny', reason: `bash-guard: parse errors in command; refusing to run it unparsed. ${messages}` }
    }

    const refs = extractAllCommandsFromAST(script, command)
    const { commands } = expandWrapperCommands(refs)
    const all = [...refs, ...commands]
    if (all.length === 0) return next()

    const rules = await loadRules(ctx, dir)
    const hits = all
      .map((ref) => {
        const name = getBasename(ref)
        const rule = rules.get(name)
        return { name, rule }
      })
      .filter((h): h is { name: string; rule: GuardEntry } => h.rule !== undefined)

    if (hits.length === 0) return next()
    const verdicts = hits.map((h) => h.rule.verdict)
    const overall = mostRestrictive(verdicts)
    switch (overall) {
      case 'deny': {
        const hit = hits.find((h) => h.rule.verdict === 'deny')
        const reason = hit?.rule.reason ?? DEFAULT_DENY(hit?.name ?? 'unknown')
        return { kind: 'deny', reason }
      }
      case 'ask': {
        const hit = hits.find((h) => h.rule.verdict === 'ask')
        return { kind: 'ask', reason: hit?.rule.reason ?? DEFAULT_ASK(hit?.name ?? 'unknown') }
      }
      case 'allow':
      case 'none':
      default:
        return next()
    }
  })
}