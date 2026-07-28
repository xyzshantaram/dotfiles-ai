// Custom shell-execution tool for long-running/slow commands, deliberately
// NOT named "bash" (opencode's TUI has a hardcoded special renderer for
// tools named "bash" that only ever shows "$ <command>" in the collapsed
// view, ignoring whatever text the tool actually returns - so a tmux-attach
// hint never gets shown there).
//
// This tool coexists with the built-in `bash` tool (which is enabled/
// unrestricted) rather than replacing it. The built-in tool is fine - and
// preferred - for quick one-off commands. This tool exists specifically for
// commands that are slow or open-ended: searches over large trees, heavy
// disk I/O, builds/test suites that take a while, or dev servers and other
// long-running background processes. Its description tells the model when
// to reach for it instead of `bash`.
//
// Runs commands inside a dedicated tmux session so the user (and the model,
// via a follow-up call to this same tool) can attach, tail, or send input
// to a long-running command. Output is tee'd to a file under
// /tmp/opencode/bash/, and the model gets a truncated inline copy plus the
// file path and an attach command.
//
// NOTE: `context.metadata()` is NOT used here to stream live updates mid-
// execution, even though the plugin API exposes it. As of opencode 1.17.18,
// this is a no-op for custom/plugin tools: the host's real `metadata()`
// (packages/opencode/src/session/tools.ts) returns an Effect that has to be
// *run* to actually publish a live update, but the plugin-tool adapter
// (packages/opencode/src/tool/registry.ts `fromPlugin`) spreads the host
// context through unchanged instead of bridging it into a Promise the way
// it does for `ask()` - so the Effect is constructed and silently discarded.
// Confirmed by reading the actual opencode source at the exact version
// installed (1.17.18) - not a TUI toggle issue, an upstream bug/gap. Until
// that's fixed, there is no supported way for a custom tool to push partial
// output/metadata to the TUI while still running.
//
// Workaround: keep the tool call itself short. It blocks for only
// DEFAULT_WAIT_MS (5s) by default before returning - fast commands still
// come back with full output immediately, and slow/long-running ones get
// detached early with an attach/tail/send-keys command instead of output.
// Since the tmux session keeps running independently of the tool call, the
// model can check back on a detached command later by simply calling this
// tool again (e.g. `tail -n 200 <outfile>` or `cat <exitfile>`) - no
// separate "check status" tool needed.
//
// Sessions are left running (with `remain-on-exit on`) after the command
// finishes so the printed `tmux attach` command keeps working - you can
// still scroll back through the output after the fact. Old finished
// sessions are garbage-collected on a later invocation (see
// SESSION_GC_AGE_MS) so they don't accumulate forever.
//
// See /tmp/opencode/bash/AGENTS.md (created on first run) for the "don't
// mess with this directory" notice shown to agents.
//
// Set OPENCODE_BASH_ARCHIVE=1 to also copy each command's output/exit files
// to ~/.cache/opencode/bash-logs/, which survives reboots (unlike /tmp).
import { tool } from "@opencode-ai/plugin"
import { randomBytes } from "crypto"
import { mkdir, stat, copyFile } from "fs/promises"
import os from "os"
import path from "path"
import { $ } from "bun"

const RUN_DIR = "/tmp/opencode/bash"
const AGENTS_NOTICE = `Do not create, edit, or delete files in this directory yourself.
It is scratch space owned by the tmux-backed long-running-command tool for
command output and exit-code sentinels. Files are named by session id and
may be cleaned up or overwritten at any time.
`

// /tmp is wiped on reboot. Set OPENCODE_BASH_ARCHIVE=1 to additionally copy
// each command's output/exit files to a persistent cache directory.
const ARCHIVE_ENABLED = /^(1|true)$/i.test(process.env.OPENCODE_BASH_ARCHIVE ?? "")
const ARCHIVE_DIR = path.join(os.homedir(), ".cache", "opencode", "bash-logs")

const MAX_LINES = 200
const MAX_BYTES = 8192
// How long to poll for the tmux session to finish before giving up and
// returning control to the model with the command still running in the
// background. Short by design: fast commands (the vast majority) still
// return their full output immediately, but slow ones no longer block the
// tool call for minutes - the model gets the attach/tail/send-keys commands
// back quickly and can act on them (or check back later, e.g. by calling
// this tool again with a `tail` command against the output file).
const POLL_INTERVAL_MS = 500
const DEFAULT_WAIT_MS = 5 * 1000 // 5 seconds

// --- Session lifecycle / leak prevention -----------------------------------
// Finished sessions are kept around (via remain-on-exit) so the printed
// `tmux attach` command keeps working, but that means they don't clean
// themselves up. Every tool call runs a GC pass first:
//   1. any finished oc-* session older than SESSION_GC_AGE_MS is killed
//   2. if more than SESSION_GC_MAX_FINISHED finished sessions remain, the
//      oldest excess are killed regardless of age
//   3. as a hard backstop, if the total oc-* session count (running +
//      finished) would still be at/above SESSION_MAX_TOTAL after GC, the
//      tool refuses to spawn a new session at all rather than let the
//      count grow without bound.
const SESSION_PREFIX = "oc-"
const SESSION_GC_AGE_MS = Number(process.env.OPENCODE_BASH_GC_AGE_MS ?? 15 * 60 * 1000)
const SESSION_GC_MAX_FINISHED = Number(process.env.OPENCODE_BASH_GC_MAX_FINISHED ?? 20)
const SESSION_MAX_TOTAL = Number(process.env.OPENCODE_BASH_MAX_SESSIONS ?? 50)

function truncate(text: string): { text: string; truncated: boolean } {
  let out = text
  let truncated = false

  const lines = out.split("\n")
  if (lines.length > MAX_LINES) {
    out = lines.slice(-MAX_LINES).join("\n")
    truncated = true
  }

  const bytes = Buffer.byteLength(out, "utf8")
  if (bytes > MAX_BYTES) {
    out = Buffer.from(out, "utf8").subarray(bytes - MAX_BYTES).toString("utf8")
    truncated = true
  }

  return { text: out, truncated }
}

async function ensureRunDir() {
  await mkdir(RUN_DIR, { recursive: true })
  const agentsFile = path.join(RUN_DIR, "AGENTS.md")
  const exists = await stat(agentsFile).then(() => true).catch(() => false)
  if (!exists) await Bun.write(agentsFile, AGENTS_NOTICE)
}

async function archive(id: string, outFile: string, exitFile: string) {
  if (!ARCHIVE_ENABLED) return
  await mkdir(ARCHIVE_DIR, { recursive: true }).catch(() => {})
  await Promise.all([
    copyFile(outFile, path.join(ARCHIVE_DIR, `${id}.out`)).catch(() => {}),
    copyFile(exitFile, path.join(ARCHIVE_DIR, `${id}.exit`)).catch(() => {}),
  ])
}

async function paneDead(sessionName: string): Promise<boolean> {
  const result = await $`tmux list-panes -t ${sessionName} -F "#{pane_dead}"`.quiet().nothrow()
  if (result.exitCode !== 0) return true // session gone entirely, treat as done
  return result.stdout.toString().trim() === "1"
}

type SessionInfo = { name: string; dead: boolean; createdAt: number }

async function listOcSessions(): Promise<SessionInfo[]> {
  // -a lists every pane on the server; nothrow + exitCode check covers the
  // "no server running yet" case, which tmux reports as a hard error.
  const result = await $`tmux list-panes -a -F "#{session_name} #{pane_dead} #{session_created}"`
    .quiet()
    .nothrow()
  if (result.exitCode !== 0) return []

  const seen = new Set<string>()
  const sessions: SessionInfo[] = []
  for (const line of result.stdout.toString().split("\n")) {
    if (!line.trim()) continue
    const [name, deadFlag, createdAt] = line.split(" ")
    if (!name || !name.startsWith(SESSION_PREFIX)) continue
    if (seen.has(name)) continue // a session can have multiple panes; we only spawn one each
    seen.add(name)
    sessions.push({
      name,
      dead: deadFlag === "1",
      createdAt: Number(createdAt) * 1000,
    })
  }
  return sessions
}

async function killSessions(names: string[]) {
  await Promise.all(
    names.map((name) => $`tmux kill-session -t ${name}`.quiet().nothrow()),
  )
}

// Runs before every new session is spawned. Returns the up-to-date session
// list (post-GC) so the caller can enforce the hard cap.
async function gcSessions(): Promise<SessionInfo[]> {
  const sessions = await listOcSessions()

  const now = Date.now()
  const finished = sessions.filter((s) => s.dead)

  // 1. Kill anything finished and past the age threshold.
  const stale = finished.filter((s) => now - s.createdAt > SESSION_GC_AGE_MS)
  if (stale.length > 0) {
    await killSessions(stale.map((s) => s.name))
  }

  // 2. Even if not stale by age, cap the number of finished sessions kept
  // around; kill the oldest excess.
  const staleNames = new Set(stale.map((s) => s.name))
  const remainingFinished = finished
    .filter((s) => !staleNames.has(s.name))
    .sort((a, b) => a.createdAt - b.createdAt)
  const excess = remainingFinished.length - SESSION_GC_MAX_FINISHED
  if (excess > 0) {
    await killSessions(remainingFinished.slice(0, excess).map((s) => s.name))
  }

  return listOcSessions()
}

export default tool({
  description:
    "Execute a shell command that may be SLOW or LONG-RUNNING, inside a dedicated tmux session " +
    "instead of blocking indefinitely. Use this instead of the regular bash tool for things " +
    "like: searching/grepping over large trees, heavy disk I/O, builds or test suites that can " +
    "take a while, dev servers or other background/daemon processes, or anything else you're " +
    "not confident will finish in a couple seconds. For quick one-off commands, use the regular " +
    "bash tool instead - it's simpler and returns faster. " +
    "This tool blocks for a few seconds; if the command is still running, it detaches and " +
    "returns tmux commands to attach, tail, or send input to it instead of output - the " +
    "command keeps running in the background. To check on it later, just call this tool again " +
    "with a command like `tail -n 200 <output file>` or `cat <exit file>`.",
  args: {
    command: tool.schema.string().describe("The shell command to run"),
    cwd: tool.schema
      .string()
      .optional()
      .describe("Working directory for the command (defaults to the session's project directory)"),
    timeout: tool.schema
      .number()
      .optional()
      .describe(
        "Max seconds to wait for the command to finish before detaching and returning early " +
          "with the attach/tail commands instead of the output (default 5). Raise this for " +
          "commands you expect to finish quickly but want more time before detaching; leave it " +
          "low for anything long-running or interactive - detach early and use the returned " +
          "tmux commands to check back in later.",
      ),
  },
  async execute(args, context) {
    await ensureRunDir()

    const sessionsAfterGc = await gcSessions()
    if (sessionsAfterGc.length >= SESSION_MAX_TOTAL) {
      return (
        `Refusing to start: ${sessionsAfterGc.length} tmux sessions with the "${SESSION_PREFIX}" ` +
        `prefix already exist (limit ${SESSION_MAX_TOTAL}), even after garbage-collecting old ` +
        `finished ones. Something is likely spawning commands faster than they can be cleaned ` +
        `up, or a long-running session needs to be killed manually (\`tmux kill-session -t <name>\`).`
      )
    }

    const id = `${Date.now()}-${randomBytes(4).toString("hex")}`
    const sessionName = `oc-${id}`
    const outFile = path.join(RUN_DIR, `${id}.out`)
    const exitFile = path.join(RUN_DIR, `${id}.exit`)
    const cwd = args.cwd ?? context.directory
    const maxWaitMs = args.timeout ? args.timeout * 1000 : DEFAULT_WAIT_MS

    // Wrap the user's command so we can:
    // - preserve the real exit code through `tee` via PIPESTATUS
    // - merge stderr into the tee'd/captured stream
    const inner =
      `set -o pipefail; { ${args.command}; } 2>&1 | tee ${$.escape(outFile)}; ` +
      `echo $? > ${$.escape(exitFile)}`

    await $`tmux new-session -d -s ${sessionName} -c ${cwd} -x 220 -y 50 bash --noprofile --norc -c ${inner} \; set-option -t ${sessionName} remain-on-exit on`.quiet()

    const attachCmd = `tmux attach -t ${sessionName}`
    const tailCmd = `tail -f ${outFile}`
    const sendKeysCmd = `tmux send-keys -t ${sessionName} '<keys>' Enter`

    const start = Date.now()
    let finished = false
    while (Date.now() - start < maxWaitMs) {
      if (await paneDead(sessionName)) {
        finished = true
        break
      }
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    }

    if (!finished) {
      return (
        `Command is still running after ${Math.round(maxWaitMs / 1000)}s, detaching - it keeps ` +
        `running in the background.\n` +
        `Output file: ${outFile}\n` +
        `Attach (view/interact live): ${attachCmd}\n` +
        `Tail (view only): ${tailCmd}\n` +
        `Send input without attaching (e.g. to answer a prompt): ${sendKeysCmd}\n` +
        `To check back in later, call this tool again with a command like ` +
        `\`tail -n 200 ${outFile}\` or \`cat ${exitFile}\` to see if it's finished.`
      )
    }

    const rawOutput = await Bun.file(outFile)
      .text()
      .catch(() => "")
    const exitCodeRaw = await Bun.file(exitFile)
      .text()
      .catch(() => "")
    const exitCode = exitCodeRaw.trim() || "unknown"

    await archive(id, outFile, exitFile)

    const { text: shownOutput, truncated } = truncate(rawOutput)

    const parts = [
      `Exit code: ${exitCode}`,
      `Output file: ${outFile}`,
      `Re-attach to scroll back or interact further: ${attachCmd}`,
      ...(ARCHIVE_ENABLED
        ? [`Archived to: ${path.join(ARCHIVE_DIR, `${id}.out`)}`]
        : []),
      "",
      truncated
        ? `Output (truncated, full output in ${outFile}):`
        : "Output:",
      shownOutput,
    ]
    return parts.join("\n")
  },
})
