/**
 * Unit tests for runLogCommand.
 *
 * These tests run real child processes with execFile: no shell, no
 * mocking. echo and seq are coreutils present on any POSIX target, and
 * the failure case names a binary that never exists. Split output keeps
 * the trailing empty string that "\n".split() produces, so the
 * assertions below match the verbatim behavior.
 */

import { describe, expect, it } from "vitest";
import { runLogCommand } from "./run";

describe("runLogCommand", () => {
  it("runs a command and returns its output lines", async () => {
    const result = await runLogCommand("echo hello world");
    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.lines).toEqual(["hello world", ""]);
  });

  it("reports a missing binary as a failure with a message", async () => {
    const result = await runLogCommand("this-binary-does-not-exist-xyz");
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe("string");
    expect((result.error ?? "").length).toBeGreaterThan(0);
  });

  it("caps output to the last 2000 lines", async () => {
    const result = await runLogCommand("seq 1 2500");
    expect(result.ok).toBe(true);
    expect(result.truncated).toBe(true);
    expect(result.lines.length).toBe(2000);
    expect(result.lines[result.lines.length - 2]).toBe("2500");
    expect(result.lines[result.lines.length - 1]).toBe("");
  });
});
