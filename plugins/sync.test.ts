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
import { readFileSync } from "node:fs";
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
