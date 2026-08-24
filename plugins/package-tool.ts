/**
 * W11/W15 — package tool (personal bundle). Dependencies change only through
 * this tool: it autodetects the package manager, resolves the latest
 * registry version, and runs the change. The manifest-guard
 * (plugins/manifest-guard.ts) denies direct model write/edit of manifests
 * and lockfiles; this tool is the sanctioned path, and its internal
 * `ctx.shell` calls are not model bash tool executions, so neither the
 * bash-guard nor the manifest-guard applies to them.
 *
 * Seam: `defineTool` from @deepseek-ai/dsh-tools (name, description,
 * parameters, output { schema, render }, execute(args, exec)):
 *   DSH/dsh-tools/README.md:63-97 (typed parameter DSL, enum support).
 * Shell execution through the `ctx.shell` executor seam:
 *   `resolve(ShellExecRequest)` → `run(ShellExecSpec)`:
 *   DSH/dsh-shell/lib/types/index.d.ts:62-69; ShellRunResult.stdout.text:
 *   DSH/dsh-shell/lib/types/types.d.ts:107-131.
 * Session cwd: `exec.agent.session.header.cwd` (dsh-agent README:73;
 * SessionHeader.cwd DSH/dsh-session/lib/types/types.d.ts:52). A `cwd`
 * argument, when given, resolves relative to this session cwd — never as an
 * absolute host path. No seam below this tool confines a relative path
 * against `..` traversal (`ctx.fs.resolve` takes a `cwd` base but does not
 * itself reject `../../etc` segments), so this tool confines it directly
 * before it reaches `ctx.fs.resolve` or a shell workdir.
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
 * No exact-version argument: W15 removed `version` from the schema and from
 * every install-command builder. A caller cannot pin a version. The tool
 * always resolves the latest registry version (or whatever an existing
 * lockfile/manifest constraint makes the manager itself apply). A model
 * agent hallucinates versions from stale training data; a pinned version is
 * a request for a human to type, not a tool argument.
 *
 * Fail-closed project detection (W15): before any command runs, the tool
 * requires a real manifest for the target ecosystem in the resolved
 * directory (package.json / Cargo.toml / pyproject.toml or setup.py /
 * go.mod). Without one it refuses and names the exact directory it checked,
 * instead of letting npm (or another manager) silently invent a project by
 * writing a manifest, a lockfile, and a dependency directory in the wrong
 * place — this is the fault that produced the 2026-08-21 incident.
 *
 * Downgrade refusal (W15): before an install, if the package already has an
 * installed version, the tool compares the resolved target version against
 * it with `semver.lt` (semver is a devDependency of this repo). A downgrade
 * is refused; the tool prints the exact manual command instead of running
 * it.
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

import { join, relative, sep } from "node:path";
import { lt as semverLt } from "semver";

import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-tools";
import type {} from "@deepseek-ai/dsh-agent";
import type {} from "@deepseek-ai/dsh-shell";
import type {} from "@deepseek-ai/dsh-fs";

export const name = "package-tool";

export const inject = ["tools", "shell", "fs"];

type Ecosystem = "rust" | "python" | "nodejs" | "go";
type Action = "add" | "remove" | "update" | "add_task";
type Manager = "npm" | "pnpm" | "yarn" | "bun" | "cargo" | "uv" | "pip" | "poetry" | "go";

/** Marker file → preferred manager, tried in order within an ecosystem. */
const NODE_MARKERS: ReadonlyArray<[string, Manager]> = [
  ["pnpm-lock.yaml", "pnpm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
];
const PY_MARKERS: ReadonlyArray<[string, Manager]> = [
  ["poetry.lock", "poetry"],
  ["pyproject.toml", "uv"],
  ["requirements.txt", "pip"],
];

/** Real manifest per ecosystem, checked before any command runs (W15 fail-closed). */
const MANIFEST_FILES: Record<Ecosystem, readonly string[]> = {
  nodejs: ["package.json"],
  rust: ["Cargo.toml"],
  python: ["pyproject.toml", "setup.py"],
  go: ["go.mod"],
};

const FALLBACK_MANAGER: Record<Ecosystem, Manager> = {
  nodejs: "npm",
  rust: "cargo",
  python: "pip",
  go: "go",
};

/**
 * Confine a caller-supplied relative cwd inside the session cwd. No seam
 * below this tool rejects `..` traversal or an absolute host path, so the
 * tool does it directly: reject an absolute path outright, then reject a
 * `..` segment after normalization. Returns the resolved absolute directory.
 */
function confineCwd(sessionCwd: string, requested: string | undefined): string {
  if (requested === undefined || requested === "") return sessionCwd;
  if (requested.startsWith("/") || /^[A-Za-z]:[\\/]/.test(requested)) {
    throw new Error(`cwd must be relative to the session cwd, got an absolute path: ${requested}`);
  }
  const joined = join(sessionCwd, requested);
  const rel = relative(sessionCwd, joined);
  if (rel === ".." || rel.startsWith(`..${sep}`)) {
    throw new Error(`cwd escapes the session cwd via '..': ${requested}`);
  }
  return joined;
}

/**
 * Fail closed (W15): require a real manifest for the ecosystem in `cwd`
 * before any command runs, so the tool cannot invent a project the way npm
 * did on 2026-08-21 (installing into a manifest-less directory writes a
 * fresh package.json, lockfile, and node_modules there instead of failing).
 */
async function requireManifest(
  ctx: Context,
  ecosystem: Ecosystem,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<void> {
  const candidates = MANIFEST_FILES[ecosystem];
  for (const name of candidates) {
    try {
      const target = await ctx.fs.resolve(name, { cwd, ...(signal ? { signal } : {}) });
      const info = await ctx.fs.stat(target, signal);
      if (info !== undefined) return;
    } catch {
      // Missing manifest or provider error: try the next candidate.
    }
  }
  throw new Error(
    `no ${candidates.join(" or ")} found in ${cwd}. Refusing to run a package command here, ` +
      "because this directory does not look like an existing project. " +
      "Pass a cwd naming the actual project directory, or create the project manifest first.",
  );
}

async function detectManager(
  ctx: Context,
  ecosystem: Ecosystem,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<Manager> {
  const markers = ecosystem === "nodejs" ? NODE_MARKERS : ecosystem === "python" ? PY_MARKERS : [];
  for (const [marker, manager] of markers) {
    try {
      const target = await ctx.fs.resolve(marker, { cwd, ...(signal ? { signal } : {}) });
      const info = await ctx.fs.stat(target, signal);
      if (info !== undefined) return manager;
    } catch {
      // Missing marker or provider error: try the next one.
    }
  }
  return FALLBACK_MANAGER[ecosystem];
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
  });
  const result = await ctx.shell.run(spec);
  const output = [result.stdout.text, result.stderr.text].filter(Boolean).join("\n[stderr]\n");
  if (result.exitCode !== 0) {
    throw new Error(
      `command failed with exit code ${result.exitCode}: ${command}\n${output.slice(-2000)}`,
    );
  }
  return output;
}

async function resolveLatest(
  ctx: Context,
  manager: Manager,
  packageName: string,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<string> {
  switch (manager) {
    case "npm":
    case "pnpm":
    case "yarn":
    case "bun": {
      const out = await runCommand(ctx, `npm view ${packageName} version`, cwd, signal);
      const version = out.trim().split("\n").pop();
      if (!version) throw new Error(`could not resolve latest version for ${packageName}`);
      return version;
    }
    case "cargo": {
      const out = await runCommand(
        ctx,
        `curl -sA dsh-package-tool https://crates.io/api/v1/crates/${packageName}`,
        cwd,
        signal,
      );
      const version = JSON.parse(out).crate?.max_stable_version;
      if (typeof version !== "string")
        throw new Error(`could not resolve latest version for ${packageName}`);
      return version;
    }
    case "pip":
    case "poetry":
    case "uv": {
      const out = await runCommand(
        ctx,
        `curl -s https://pypi.org/pypi/${packageName}/json`,
        cwd,
        signal,
      );
      const version = JSON.parse(out).info?.version;
      if (typeof version !== "string")
        throw new Error(`could not resolve latest version for ${packageName}`);
      return version;
    }
    case "go": {
      const escaped = packageName.replace(/[A-Z]/g, (c) => `!${c.toLowerCase()}`);
      const out = await runCommand(
        ctx,
        `curl -s https://proxy.golang.org/${escaped}/@latest`,
        cwd,
        signal,
      );
      const version = JSON.parse(out).Version;
      if (typeof version !== "string")
        throw new Error(`could not resolve latest version for ${packageName}`);
      return version;
    }
  }
}

/**
 * Best-effort installed-version lookup, used only for the downgrade check.
 * Returns undefined when the package is not installed or the manifest
 * cannot be read/parsed — in that case there is nothing to compare against
 * and the install proceeds normally.
 */
async function getInstalledVersion(
  ctx: Context,
  ecosystem: Ecosystem,
  manager: Manager,
  packageName: string,
  cwd: string,
  signal: AbortSignal | undefined,
): Promise<string | undefined> {
  try {
    if (ecosystem === "nodejs") {
      const target = await ctx.fs.resolve("package.json", { cwd, ...(signal ? { signal } : {}) });
      const text = await ctx.fs.readText(target, signal);
      const manifest = JSON.parse(text) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const raw = manifest.dependencies?.[packageName] ?? manifest.devDependencies?.[packageName];
      return raw ? raw.replace(/^[\^~]/, "") : undefined;
    }
    if (ecosystem === "rust") {
      const out = await runCommand(ctx, `cargo pkgid ${packageName}`, cwd, signal);
      const match = out.trim().match(/#(?:.*:)?([0-9][^:@]*)$/);
      return match?.[1];
    }
    if (ecosystem === "python") {
      const out = await runCommand(
        ctx,
        `${manager === "poetry" ? "poetry run pip" : "pip"} show ${packageName}`,
        cwd,
        signal,
      );
      const match = out.match(/^Version:\s*(\S+)/m);
      return match?.[1];
    }
    if (ecosystem === "go") {
      const out = await runCommand(ctx, `go list -m ${packageName}`, cwd, signal);
      const match = out.trim().match(/\s(\S+)$/);
      return match?.[1];
    }
  } catch {
    // Not installed, no manifest yet, or the lookup command failed: treat as
    // "no installed version to compare against".
    return undefined;
  }
  return undefined;
}

function buildCommand(
  manager: Manager,
  action: Action,
  packageName: string,
  dev: boolean,
  taskName?: string,
  taskCommand?: string,
): string {
  if (action === "add_task") {
    if (manager === "pnpm" || manager === "npm") {
      return `node -e "const f=require('node:fs');const p=require('./package.json');p.scripts=p.scripts||{};p.scripts[process.argv[1]]=process.argv[2];f.writeFileSync('./package.json',JSON.stringify(p,null,2)+'\\n')" ${taskName} ${taskCommand}`;
    }
    throw new Error(`add_task is not supported for manager ${manager}`);
  }
  switch (manager) {
    case "npm":
      return action === "remove"
        ? `npm uninstall ${packageName}`
        : `npm install ${dev ? "-D " : ""}${packageName}`;
    case "pnpm":
      return action === "remove"
        ? `pnpm remove ${packageName}`
        : `pnpm add ${dev ? "-D " : ""}${packageName}`;
    case "yarn":
      return action === "remove"
        ? `yarn remove ${packageName}`
        : `yarn add ${dev ? "-D " : ""}${packageName}`;
    case "bun":
      return action === "remove"
        ? `bun remove ${packageName}`
        : `bun add ${dev ? "-D " : ""}${packageName}`;
    case "cargo":
      return action === "remove" ? `cargo remove ${packageName}` : `cargo add ${packageName}`;
    case "poetry":
      return action === "remove" ? `poetry remove ${packageName}` : `poetry add ${packageName}`;
    case "uv":
      return action === "remove" ? `uv remove ${packageName}` : `uv add ${packageName}`;
    case "pip":
      return action === "remove"
        ? `pip uninstall -y ${packageName}`
        : `pip install --upgrade ${packageName}`;
    case "go":
      return action === "remove"
        ? `go mod edit -droprequire=${packageName}`
        : `go get ${packageName}@latest`;
  }
}

export function apply(ctx: Context): void {
  ctx.tools.register(
    defineTool({
      name: "package",
      description:
        "Add, remove, or update a dependency in the current project. " +
        "Detect the package manager, resolve the latest registry version, and run the change. " +
        "add refuses when the package is already installed (use update instead). " +
        "update requires an existing install and refuses to downgrade it. " +
        "Also register a project task (a scripts entry) through this sanctioned tool. " +
        "Never pass an exact version: this tool always resolves the latest registry version, " +
        "or whatever an existing lockfile/manifest constraint the manager itself applies. " +
        "Use this tool for every dependency change.",
      parameters: {
        ecosystem: {
          type: "string",
          required: true,
          description: "Ecosystem: rust, python, nodejs, or go.",
          enum: ["rust", "python", "nodejs", "go"],
        },
        action: {
          type: "string",
          required: true,
          description:
            "Action: add (refuses if the package is already installed), remove, " +
            "update (requires an existing install, refuses to downgrade it), or add_task.",
          enum: ["add", "remove", "update", "add_task"],
        },
        packageName: {
          type: "string",
          description: "Package name to change. Not used when action is add_task.",
        },
        cwd: {
          type: "string",
          description:
            "Project directory, relative to the session cwd. Omit to use the session cwd itself. " +
            "Must not be an absolute path and must not escape the session cwd via '..'.",
        },
        dev: {
          type: "boolean",
          description:
            "nodejs only: install into devDependencies instead of dependencies. Default false.",
        },
        taskName: {
          type: "string",
          description:
            "Task name (scripts key) to register. Required when action is add_task. e.g. gen:customize-setup.",
        },
        taskCommand: {
          type: "string",
          description:
            "Command value for the task. Required when action is add_task. e.g. node generate-customize-setup.mjs.",
        },
        manager: {
          type: "string",
          description:
            "Package manager override: npm, pnpm, yarn, bun, cargo, uv, pip, poetry, or go.",
          enum: ["npm", "pnpm", "yarn", "bun", "cargo", "uv", "pip", "poetry", "go"],
        },
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }],
      },
      async execute(args, exec) {
        const signal = exec.signal;
        const sessionCwd = exec.agent?.session.header.cwd ?? process.cwd();
        const cwd = confineCwd(sessionCwd, args.cwd);
        const dev = args.dev ?? false;
        const manager = args.manager ?? (await detectManager(ctx, args.ecosystem, cwd, signal));
        const action = args.action;
        if (action === "add_task") {
          // Task name is a scripts key; keep it to a safe path-like set.
          if (!/^[A-Za-z0-9:_\-./]+$/.test(args.taskName ?? "")) {
            throw new Error(`invalid task name: ${args.taskName}`);
          }
          // Task command is a shell fragment; reject metacharacters that allow injection.
          if (!/^[A-Za-z0-9 $'"\/\._:\-=]+$/.test(args.taskCommand ?? "")) {
            throw new Error(`invalid task command: ${args.taskCommand}`);
          }
          const command = buildCommand(manager, action, "", false, args.taskName, args.taskCommand);
          const output = await runCommand(ctx, command, cwd, signal);
          const lines: string[] = [];
          lines.push(`Registered task "${args.taskName}" = "${args.taskCommand}"`);
          lines.push(`Package manager: ${manager}.`);
          lines.push(`Ran: ${command}`);
          const tail = output.trim().slice(-4000);
          if (tail) lines.push(`Output:\n${tail}`);
          return lines.join("\n");
        }
        // Fail closed (W15): refuse when the target directory has no real
        // manifest for the ecosystem, instead of letting the manager invent a
        // project there.
        await requireManifest(ctx, args.ecosystem, cwd, signal);
        // Arguments flow into shell command strings; reject anything outside a
        // safe package-name character set to stop injection through quotes,
        // dollars, or backticks.
        if (!/^[A-Za-z0-9@._\-/]+$/.test(args.packageName)) {
          throw new Error(`invalid package name: ${args.packageName}`);
        }
        const installedVersion = await getInstalledVersion(
          ctx,
          args.ecosystem,
          manager,
          args.packageName,
          cwd,
          signal,
        );
        if (action === "add" && installedVersion !== undefined) {
          throw new Error(
            `${args.packageName} is already installed at ${installedVersion}. ` +
              'add refuses to run against an already-installed package. Use action "update" instead.',
          );
        }
        if (action === "update" && installedVersion === undefined) {
          throw new Error(
            `${args.packageName} is not installed. update requires an existing install. Use action "add" instead.`,
          );
        }
        const version =
          action === "remove"
            ? undefined
            : await resolveLatest(ctx, manager, args.packageName, cwd, signal);
        // Downgrade refusal (W15): never let a resolved "latest" silently move a
        // package backward, e.g. because the registry's default dist-tag lags
        // behind, or the caller named an older manager/registry mirror.
        if (
          version !== undefined &&
          installedVersion !== undefined &&
          semverLt(version, installedVersion)
        ) {
          const manualCommand = buildCommand(
            manager,
            "add",
            `${args.packageName}@${installedVersion}`,
            dev,
          );
          throw new Error(
            `Resolved version ${version} for ${args.packageName} is older than the installed version ` +
              `${installedVersion}. Refusing to downgrade. To do this deliberately, run by hand: ${manualCommand}`,
          );
        }
        const command = buildCommand(manager, action, args.packageName, dev);
        const output = await runCommand(ctx, command, cwd, signal);
        const lines: string[] = [];
        if (version) lines.push(`Resolved ${args.packageName} to version ${version}.`);
        lines.push(`Package manager: ${manager}.`);
        lines.push(`Ran: ${command}`);
        const tail = output.trim().slice(-4000);
        if (tail) lines.push(`Output:\n${tail}`);
        return lines.join("\n");
      },
    }),
  );
}
