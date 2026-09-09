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
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
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
