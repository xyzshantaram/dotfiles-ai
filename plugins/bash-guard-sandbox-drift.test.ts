/**
 * Drift guard for the sandbox tables this plugin mirrors.
 *
 * `plugins/bash-guard.ts` carries local copies of `WIDER_MODES` and
 * `ESCALATION_TARGETS` from `@deepseek-ai/dsh-sandbox`. It has to: that package
 * is not a direct dependency of this repo, so `require.resolve` on it fails
 * from here. A mirrored table drifts silently when upstream changes, and this
 * one decides whether a sandbox escalation is allowed, so silent drift would
 * either strand a real escalation or wave through one that upstream refuses.
 *
 * This test reads the installed dsh and compares. It resolves the package the
 * same way `sync.sh` does, from the `dsh` binary on PATH, because the install
 * path is machine-specific. When dsh is not installed the test skips rather
 * than fails: the mirror is still correct, we just cannot prove it here.
 *
 * If this test fails, do not edit the test. Read the upstream table and update
 * the mirror in `plugins/bash-guard.ts`.
 */

import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";

import { ESCALATION_TARGETS, WIDER_MODES } from "./bash-guard";

/** The installed dsh-sandbox source, or null when dsh is not on PATH. */
function upstreamSandboxSource(): string | null {
  let bin: string;
  try {
    // `which` is a real binary, so no shell is needed. Passing args with a
    // shell would concatenate rather than escape them.
    bin = execFileSync("which", ["dsh"], { encoding: "utf8" }).trim();
  } catch {
    return null;
  }
  if (bin === "") return null;
  // sync.sh derives the package root the same way: realpath the binary, then
  // up two directories.
  const pkgRoot = dirname(dirname(realpathSync(bin)));
  const file = join(pkgRoot, "node_modules", "@deepseek-ai", "dsh-sandbox", "lib", "index.js");
  return existsSync(file) ? readFileSync(file, "utf8") : null;
}

/**
 * Pull one `const NAME = { ... };` or `const NAME = [ ... ];` initialiser out of
 * the upstream bundle and parse it. The bundle is plain ES module JavaScript
 * with no dynamic values in these two tables, so a bounded slice plus JSON5-ish
 * normalisation is enough. Returns null when the name is absent, which is
 * itself drift worth failing on.
 */
function upstreamTable(source: string, name: string): unknown | null {
  const start = source.indexOf(`const ${name} = `);
  if (start === -1) return null;
  const open = start + `const ${name} = `.length;
  const closer = source[open] === "{" ? "}" : source[open] === "[" ? "]" : null;
  if (closer === null) return null;
  const end = source.indexOf(`${closer};`, open);
  if (end === -1) return null;
  const literal = source.slice(open, end + 1);
  // Quote bare keys, drop trailing commas, and swap single quotes for double.
  const json = literal
    .replace(/'/g, '"')
    .replace(/([{,]\s*)([A-Za-z_][\w-]*)(\s*:)/g, '$1"$2"$3')
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(json);
}

describe("sandbox tables mirrored from dsh-sandbox", () => {
  const source = upstreamSandboxSource();

  it.skipIf(source === null)("WIDER_MODES still matches upstream", () => {
    const upstream = upstreamTable(source as string, "WIDER_MODES") as Record<string, string[]>;
    expect(upstream).not.toBeNull();
    // Without this the test passes vacuously when the parse yields {}: the
    // comparison loop below would simply not run.
    expect(Object.keys(upstream)).toContain("workspace-write");

    // Upstream omits the danger-full-access key and relies on `?? []` at its
    // lookup site. Ours states it, so compare on the shared keys and assert
    // that anything upstream leaves out really is empty for us.
    for (const [mode, wider] of Object.entries(upstream)) {
      expect(WIDER_MODES[mode as keyof typeof WIDER_MODES]).toEqual(wider);
    }
    for (const mode of Object.keys(WIDER_MODES)) {
      if (mode in upstream) continue;
      expect(WIDER_MODES[mode as keyof typeof WIDER_MODES]).toEqual([]);
    }
  });

  it.skipIf(source === null)("ESCALATION_TARGETS still matches upstream", () => {
    const upstream = upstreamTable(source as string, "ESCALATION_TARGETS") as string[];
    expect(upstream).not.toBeNull();
    expect([...ESCALATION_TARGETS]).toEqual(upstream);
  });
});
