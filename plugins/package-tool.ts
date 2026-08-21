/**
 * W11 — package tool (personal bundle). Dependencies change only through this
 * tool: it autodetects the package manager, resolves the latest registry
 * version, and runs the change. The manifest-guard (plugins/manifest-guard.ts)
 * denies direct model write/edit of manifests and lockfiles; this tool is the
 * sanctioned path, and its internal `ctx.shell` calls are not model bash tool
 * executions, so neither the git-guard nor the manifest-guard applies to them.
 *
 * Seam: `defineTool` from @deepseek-ai/dsh-tools (name, description,
 * parameters, output { schema, render }, execute(args, exec)):
 *   DSH/dsh-tools/README.md:63-97 (typed parameter DSL, enum support).
 * Shell execution through the `ctx.shell` executor seam:
 *   `resolve(ShellExecRequest)` → `run(ShellExecSpec)`:
 *   DSH/dsh-shell/lib/types/index.d.ts:62-69; ShellRunResult.stdout.text:
 *   DSH/dsh-shell/lib/types/types.d.ts:107-131.
 * Session cwd: `exec.agent.session.header.cwd` (dsh-agent README:73;
 * SessionHeader.cwd DSH/dsh-session/lib/types/types.d.ts:52).
 * Marker detection via `ctx.fs.stat` (DSH/dsh-tool-fs/README.md:48;
 * better-edit statVersion pattern in ~/.dsh/profiles/web/node_modules/
 * dsh-better-edit/lib/fs-bridge.js).
 *
 * Registry version resolution (best-effort, verified against public docs):
 *   - nodejs: `npm view <pkg> version` (npm registry; npm ships with node,
 *     so it works in pnpm/yarn/bun projects too).
 *   - rust: crates.io API `curl -sA dsh-package-tool
 *     https://crates.io/api/v1/crates/<crate>` → `crate.max_stable_version`
 *     (crates.io API; User-Agent required by crates.io policy).
 *   - python: PyPI JSON `curl -s https://pypi.org/pypi/<pkg>/json` →
 *     `info.version` (https://docs.pypi.org/api/json/).
 *   - go: module proxy `curl -s https://proxy.golang.org/<module>/@latest` →
 *     `Version` (Go module proxy protocol; uppercase in module paths is
 *     escaped as !lowercase per the protocol).
 * JSON is parsed in-process (JSON.parse) from the curl stdout; no jq needed.
 *
 * NOT-VERIFIED (runtime-only): network egress from the sandboxed shell
 * executor, and exact per-manager CLI flag spelling across manager versions.
 * The registry endpoints above are documented public contracts; the manager
 * command lines follow each manager's documented CLI.
 *
 * Mount as a preset row, e.g. in the personal preset's agent.cordis.yml:
 *
 *   - id: package-tool
 *     name: ../plugins/package-tool.ts
 */
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-agent'
import type {} from '@deepseek-ai/dsh-shell'
import type {} from '@deepseek-ai/dsh-fs'

export const name = 'package-tool'

export const inject = ['tools', 'shell', 'fs']

type Ecosystem = 'rust' | 'python' | 'nodejs' | 'go'
type Action = 'add' | 'remove' | 'update' | 'add_task'
type Manager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'cargo' | 'uv' | 'pip' | 'poetry' | 'go'

/** Marker file → preferred manager, tried in order within an ecosystem. */
const NODE_MARKERS: ReadonlyArray<[string, Manager]> = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
]
const PY_MARKERS: ReadonlyArray<[string, Manager]> = [
  ['poetry.lock', 'poetry'],
  ['pyproject.toml', 'uv'],
  ['requirements.txt', 'pip'],
]

const FALLBACK_MANAGER: Record<Ecosystem, Manager> = {
  nodejs: 'npm',
  rust: 'cargo',
  python: 'pip',
  go: 'go',
}

async function detectManager(
  ctx: Context,
  ecosystem: Ecosystem,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<Manager> {
  const markers = ecosystem === 'nodejs' ? NODE_MARKERS : ecosystem === 'python' ? PY_MARKERS : []
  for (const [marker, manager] of markers) {
    try {
      const target = await ctx.fs.resolve(marker, { cwd, ...(signal ? { signal } : {}) })
      const info = await ctx.fs.stat(target, signal)
      if (info !== undefined) return manager
    } catch {
      // Missing marker or provider error: try the next one.
    }
  }
  return FALLBACK_MANAGER[ecosystem]
}

async function runCommand(
  ctx: Context,
  command: string,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  const spec = ctx.shell.resolve({
    command,
    workdir: cwd,
    timeoutMs: 180_000,
    ...(signal ? { signal } : {}),
  })
  const result = await ctx.shell.run(spec)
  const output = [result.stdout.text, result.stderr.text].filter(Boolean).join('\n[stderr]\n')
  if (result.exitCode !== 0) {
    throw new Error(`command failed with exit code ${result.exitCode}: ${command}\n${output.slice(-2000)}`)
  }
  return output
}

async function resolveLatest(
  ctx: Context,
  manager: Manager,
  packageName: string,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  switch (manager) {
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'bun': {
      const out = await runCommand(ctx, `npm view ${packageName} version`, cwd, signal)
      const version = out.trim().split('\n').pop()
      if (!version) throw new Error(`could not resolve latest version for ${packageName}`)
      return version
    }
    case 'cargo': {
      const out = await runCommand(
        ctx,
        `curl -sA dsh-package-tool https://crates.io/api/v1/crates/${packageName}`,
        cwd,
        signal,
      )
      const version = JSON.parse(out).crate?.max_stable_version
      if (typeof version !== 'string') throw new Error(`could not resolve latest version for ${packageName}`)
      return version
    }
    case 'pip':
    case 'poetry':
    case 'uv': {
      const out = await runCommand(ctx, `curl -s https://pypi.org/pypi/${packageName}/json`, cwd, signal)
      const version = JSON.parse(out).info?.version
      if (typeof version !== 'string') throw new Error(`could not resolve latest version for ${packageName}`)
      return version
    }
    case 'go': {
      const escaped = packageName.replace(/[A-Z]/g, (c) => `!${c.toLowerCase()}`)
      const out = await runCommand(ctx, `curl -s https://proxy.golang.org/${escaped}/@latest`, cwd, signal)
      const version = JSON.parse(out).Version
      if (typeof version !== 'string') throw new Error(`could not resolve latest version for ${packageName}`)
      return version
    }
  }
}

function buildCommand(
  manager: Manager,
  action: Action,
  packageName: string,
  version: string | undefined,
  taskName?: string,
  taskCommand?: string,
): string {
  if (action === 'add_task') {
    if (manager === 'pnpm' || manager === 'npm') {
      return `node -e "const f=require('node:fs');const p=require('./package.json');p.scripts=p.scripts||{};p.scripts[process.argv[1]]=process.argv[2];f.writeFileSync('./package.json',JSON.stringify(p,null,2)+'\\n')" ${taskName} ${taskCommand}`
    }
    throw new Error(`add_task is not supported for manager ${manager}`)
  }
  const spec = version ? `${packageName}@${version}` : packageName
  switch (manager) {
    case 'npm':
      return action === 'remove' ? `npm uninstall ${packageName}` : `npm install ${spec}`
    case 'pnpm':
      return action === 'remove' ? `pnpm remove ${packageName}` : `pnpm add ${spec}`
    case 'yarn':
      return action === 'remove' ? `yarn remove ${packageName}` : `yarn add ${spec}`
    case 'bun':
      return action === 'remove' ? `bun remove ${packageName}` : `bun add ${spec}`
    case 'cargo':
      return action === 'remove' ? `cargo remove ${packageName}` : `cargo add ${spec}`
    case 'poetry':
      return action === 'remove' ? `poetry remove ${packageName}` : `poetry add ${spec}`
    case 'uv':
      return action === 'remove' ? `uv remove ${packageName}` : `uv add ${spec}`
    case 'pip':
      return action === 'remove'
        ? `pip uninstall -y ${packageName}`
        : `pip install ${packageName}==${version ?? ''}`
    case 'go':
      return action === 'remove'
        ? `go mod edit -droprequire=${packageName}`
        : `go get ${spec}`
  }
}

export function apply(ctx: Context): void {
  ctx.tools.register(defineTool({
    name: 'package',
    description:
      'Add, remove, or update a dependency in the current project. ' +
      'Detect the package manager, resolve the latest registry version, and run the change. ' +
      'Also register a project task (a scripts entry) through this sanctioned tool. ' +
      'Use this tool for every dependency change.',
    parameters: {
      ecosystem: {
        type: 'string',
        required: true,
        description: 'Ecosystem: rust, python, nodejs, or go.',
        enum: ['rust', 'python', 'nodejs', 'go'],
      },
      action: {
        type: 'string',
        required: true,
        description: 'Action: add, remove, update, or add_task.',
        enum: ['add', 'remove', 'update', 'add_task'],
      },
      packageName: {
        type: 'string',
        description: 'Package name to change. Not used when action is add_task.',
      },
      taskName: {
        type: 'string',
        description: 'Task name (scripts key) to register. Required when action is add_task. e.g. gen:customize-setup.',
      },
      taskCommand: {
        type: 'string',
        description: 'Command value for the task. Required when action is add_task. e.g. node generate-customize-setup.mjs.'
      },
      version: {
        type: 'string',
        description: 'Exact version. Omit to resolve the latest registry version.',
      },
      manager: {
        type: 'string',
        description: 'Package manager override: npm, pnpm, yarn, bun, cargo, uv, pip, poetry, or go.',
        enum: ['npm', 'pnpm', 'yarn', 'bun', 'cargo', 'uv', 'pip', 'poetry', 'go'],
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute(args, exec) {
      const signal = exec.signal
      const cwd = exec.agent?.session.header.cwd ?? process.cwd()
      const manager = args.manager ?? (await detectManager(ctx, args.ecosystem, cwd, signal))
      const action = args.action
      if (action === 'add_task') {
        // Task name is a scripts key; keep it to a safe path-like set.
        if (!/^[A-Za-z0-9:_\-./]+$/.test(args.taskName ?? '')) {
          throw new Error(`invalid task name: ${args.taskName}`)
        }
        // Task command is a shell fragment; reject metacharacters that allow injection.
        if (!/^[A-Za-z0-9 $'"\/\._:\-=]+$/.test(args.taskCommand ?? '')) {
          throw new Error(`invalid task command: ${args.taskCommand}`)
        }
        const command = buildCommand(manager, action, '', undefined, args.taskName, args.taskCommand)
        const output = await runCommand(ctx, command, cwd, signal)
        const lines: string[] = []
        lines.push(`Registered task "${args.taskName}" = "${args.taskCommand}"`)
        lines.push(`Package manager: ${manager}.`)
        lines.push(`Ran: ${command}`)
        const tail = output.trim().slice(-4000)
        if (tail) lines.push(`Output:\n${tail}`)
        return lines.join('\n')
      }
      // Arguments flow into shell command strings; reject anything outside a
      // safe package-name/version character set to stop injection through
      // quotes, dollars, or backticks.
      if (!/^[A-Za-z0-9@._\-/]+$/.test(args.packageName)) {
        throw new Error(`invalid package name: ${args.packageName}`)
      }
      if (args.version !== undefined && !/^[A-Za-z0-9._\-+]+$/.test(args.version)) {
        throw new Error(`invalid version: ${args.version}`)
      }
      const version =
        args.version ??
        (action === 'remove' ? undefined : await resolveLatest(ctx, manager, args.packageName, cwd, signal))
      const command = buildCommand(manager, action, args.packageName, version)
      const output = await runCommand(ctx, command, cwd, signal)
      const lines: string[] = []
      if (version) lines.push(`Resolved ${args.packageName} to version ${version}.`)
      lines.push(`Package manager: ${manager}.`)
      lines.push(`Ran: ${command}`)
      const tail = output.trim().slice(-4000)
      if (tail) lines.push(`Output:\n${tail}`)
      return lines.join('\n')
    },
  }))
}
