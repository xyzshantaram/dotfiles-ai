/**
 * Hermetic regression test for the sync.sh indentation fix (D-B1).
 *
 * The original fix (commit 97b38cf) corrected stray indentation at
 * sync.sh lines 208 and 601-602. It was a pure whitespace change with
 * no extractable runtime logic, so a real unit test is not meaningful.
 * Instead this test runs `bash -n sync.sh` (syntax check only) and
 * asserts the step markers in the settings-sync region still exist.
 * The script itself is never run: it mutates $DSH_HOME and runs pnpm.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const syncSh = join(dirname(fileURLToPath(import.meta.url)), "..", "sync.sh");

describe("sync.sh regression (D-B1)", () => {
  it("passes bash -n (syntax check)", () => {
    // bash -n exits 0 on valid syntax and non-zero otherwise. execFileSync
    // throws on any non-zero exit, so reaching the next line is the pass.
    execFileSync("bash", ["-n", syncSh], { stdio: "pipe" });
  });

  it("still contains the settings-sync step markers", () => {
    const text = readFileSync(syncSh, "utf8");
    expect(text).toContain("step_set_defaults");
    expect(text).toContain("modelSync:");
    expect(text).toContain("active: $active");
  });
});

/**
 * step_sync_guard_rules must MIRROR guards/, not merely copy into it (#128).
 *
 * The step's real body is EXTRACTED from sync.sh rather than retyped, so the
 * test cannot drift into passing against a copy of the logic that no longer
 * matches the script. Only this one function is run, against temp directories
 * — the script as a whole is never executed, per this file's header.
 */
describe("step_sync_guard_rules mirrors the guards directory (#128)", () => {
  function extractStep(name: string): string {
    const text = readFileSync(syncSh, "utf8");
    const start = text.indexOf(`${name}() {`);
    expect(start, `${name}() not found in sync.sh`).toBeGreaterThan(-1);
    // The first line that is exactly "}" at column 0 closes the function.
    const end = text.indexOf("\n}\n", start);
    expect(end, `end of ${name}() not found`).toBeGreaterThan(start);
    return text.slice(start, end + 3);
  }

  function runStep(here: string, dshHome: string): void {
    const body = extractStep("step_sync_guard_rules");
    // set -u so an unset DSH_HOME would fail loudly rather than expand empty,
    // matching how sync.sh itself runs (set -euo pipefail).
    const script = `set -euo pipefail\nHERE=${JSON.stringify(here)}\nDSH_HOME=${JSON.stringify(dshHome)}\n${body}\nstep_sync_guard_rules\n`;
    execFileSync("bash", ["-c", script], { stdio: "pipe" });
  }

  it("removes a runtime rule file the repo no longer ships", () => {
    const root = mkdtempSync(join(tmpdir(), "guards-mirror-"));
    const here = join(root, "repo");
    const dshHome = join(root, "dsh");
    mkdirSync(join(here, "guards"), { recursive: true });
    mkdirSync(join(dshHome, "plugins", "guards"), { recursive: true });

    // The repo ships one rule file...
    writeFileSync(join(here, "guards", "rg.json"), '{"commands":[]}');
    // ...and the runtime dir still holds one it no longer ships. This is the
    // exact shape of the bug: preset-drift.json lingering after the move,
    // parsed as a rule file on every bash call.
    writeFileSync(join(dshHome, "plugins", "guards", "stale.json"), '{"row":"x"}');

    runStep(here, dshHome);

    const after = readdirSync(join(dshHome, "plugins", "guards")).sort();
    expect(after).toEqual(["rg.json"]);
  });

  it("still copies every file the repo does ship, including non-json ones", () => {
    const root = mkdtempSync(join(tmpdir(), "guards-mirror-"));
    const here = join(root, "repo");
    const dshHome = join(root, "dsh");
    mkdirSync(join(here, "guards"), { recursive: true });
    // profile-awaiting_verification and profile-planning have no .json
    // extension and must survive the mirror unchanged.
    writeFileSync(join(here, "guards", "rm.json"), '{"commands":[]}');
    writeFileSync(join(here, "guards", "profile-planning"), "planning\n");

    runStep(here, dshHome);

    const after = readdirSync(join(dshHome, "plugins", "guards")).sort();
    expect(after).toEqual(["profile-planning", "rm.json"]);
    expect(readFileSync(join(dshHome, "plugins", "guards", "profile-planning"), "utf8")).toBe(
      "planning\n",
    );
  });
});

/**
 * step_drop_code_preset removes the shipped code preset (#139).
 *
 * Driven through a FAKE `dsh` on PATH rather than a production override:
 * the step derives its package dir as dirname(dirname(realpath(dsh))), so a
 * temp bin/dsh makes the derivation resolve into a temp package. That keeps
 * the test faithful to the real code path — no seam exists only for tests,
 * which is how a seam ends up untested itself.
 *
 * Never executes sync.sh as a whole: it mutates $DSH_HOME.
 */
describe("step_drop_code_preset removes the code agent preset (#139)", () => {
  function extractStep(name: string): string {
    const text = readFileSync(syncSh, "utf8");
    const start = text.indexOf(`${name}() {`);
    expect(start, `${name}() not found in sync.sh`).toBeGreaterThan(-1);
    const end = text.indexOf("\n}\n", start);
    expect(end, `end of ${name}() not found`).toBeGreaterThan(start);
    return text.slice(start, end + 3);
  }

  /** A temp package with a fake `dsh` binary, plus the presets it ships. */
  function makePkg(presets: readonly string[]): { root: string; pkg: string } {
    const root = mkdtempSync(join(tmpdir(), "code-preset-"));
    const pkg = join(root, "pkg");
    mkdirSync(join(pkg, "bin"), { recursive: true });
    writeFileSync(join(pkg, "bin", "dsh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    for (const name of presets) {
      mkdirSync(join(pkg, "config", "agent-presets", name), { recursive: true });
      writeFileSync(join(pkg, "config", "agent-presets", name, "agent.cordis.yml"), "- id: x\n");
    }
    return { root, pkg };
  }

  function runStep(pkg: string): void {
    const body = extractStep("step_drop_code_preset");
    const script = [
      "set -euo pipefail",
      `PATH=${JSON.stringify(join(pkg, "bin"))}:$PATH`,
      "short_path() { echo \"$1\"; }",
      body,
      "step_drop_code_preset",
    ].join("\n");
    execFileSync("bash", ["-c", script], { stdio: "pipe" });
  }

  it("removes the code preset and leaves the others alone", () => {
    const { pkg } = makePkg(["code", "standard", "aidos", "cordis.bak", "minimal.bak"]);
    runStep(pkg);
    const presets = join(pkg, "config", "agent-presets");
    expect(existsSync(join(presets, "code"))).toBe(false);
    // The .bak dirs and the live presets are explicitly NOT collateral.
    for (const keep of ["standard", "aidos", "cordis.bak", "minimal.bak"]) {
      expect(existsSync(join(presets, keep)), `${keep} must survive`).toBe(true);
    }
  });

  it("REFUSES to delete when the directory is not a real preset dir", () => {
    // The step feeds a computed path to `rm -rf`. A genuine preset directory
    // also contains `standard`; without it we are not where we think we are,
    // and refusing is the only safe answer. This is the guard that keeps a
    // mis-derived package root from being a destructive event.
    const { pkg } = makePkg(["code"]);
    runStep(pkg);
    expect(existsSync(join(pkg, "config", "agent-presets", "code"))).toBe(true);
  });

  it("skips with a warning when dsh does not resolve to a real binary", () => {
    // `command -v` can return a function name or alias, and realpath then
    // fails. Under `set -euo pipefail` an unguarded failure would kill the
    // WHOLE sync with no message — a failure mode that reads as "sync is
    // broken" rather than "this one step was skipped".
    const root = mkdtempSync(join(tmpdir(), "code-preset-fn-"));
    const body = extractStep("step_drop_code_preset");
    const script = [
      "set -euo pipefail",
      'short_path() { echo "$1"; }',
      // A shell FUNCTION named dsh: command -v prints "dsh", realpath fails.
      "dsh() { :; }",
      body,
      "step_drop_code_preset",
      'echo "STEP_RETURNED"',
    ].join("\n");
    const out = execFileSync("bash", ["-c", script], {
      stdio: "pipe",
      cwd: root,
    }).toString();
    // The step must RETURN rather than abort the run...
    expect(out).toContain("STEP_RETURNED");
    // ...AND it must have taken the SKIP path. Asserting only the return was
    // not discriminating: GNU realpath resolves a bare name against cwd and
    // exits 0, so the unguarded version does not abort either — it computes
    // a garbage package root and is saved only by the later -d check. The
    // warning is what proves we refused to derive from an unresolvable dsh.
    expect(out).toMatch(/could not resolve dsh to a real binary/);
  });

  it("is idempotent: absent is success, so a rerun converges", () => {
    // sync runs repeatedly; a step that errors on an already-done state
    // fails the whole run for no reason.
    const { pkg } = makePkg(["standard"]);
    expect(() => runStep(pkg)).not.toThrow();
    expect(() => runStep(pkg)).not.toThrow();
  });

  it("is registered in STEPS so it actually runs", () => {
    // A step nobody calls is the same as no step, and nothing else would
    // notice: the tripwire would simply fire forever.
    const text = readFileSync(syncSh, "utf8");
    expect(text).toContain("|step_drop_code_preset");
  });

  it("keeps a tripwire, because a dsh reinstall re-extracts the preset", () => {
    const text = readFileSync(syncSh, "utf8");
    expect(text).toMatch(/agent-presets\/code.{0,200}rerun sync/s);
  });
});
