/**
 * log-viewer — command runner, host half.
 *
 * Runs the log command the panel needs. The module is pure: it imports
 * only node:child_process and touches no cordis or dsh state, so the
 * runner is unit-testable on its own and the route handler stays thin.
 */

import { execFile } from "node:child_process";

/**
 * Run one command with execFile and return its output.
 *
 * The raw string is split on whitespace only. Pipes and quotes are not
 * supported. Wrap a complex pipeline in a script and point the command
 * at it.
 *
 * On success the output lines are capped to the last 2000. On failure
 * the error is stderr when present, else the error message.
 */
export function runLogCommand(
  raw: string,
): Promise<{ ok: boolean; lines: string[]; truncated: boolean; error?: string }> {
  const parts = String(raw).trim().split(/\s+/);
  const argv0 = parts[0];
  const args = parts.slice(1);
  return new Promise((resolve) => {
    execFile(argv0, args, { maxBuffer: 16 * 1024 * 1024, timeout: 10_000 }, (err, stdout) => {
      if (err) {
        resolve({
          ok: false,
          lines: [],
          truncated: false,
          error: String((err as any).stderr || err.message),
        });
        return;
      }
      const lines = String(stdout).split("\n");
      const wasTruncated = lines.length > 2000;
      resolve({
        ok: true,
        lines: wasTruncated ? lines.slice(-2000) : lines,
        truncated: wasTruncated,
      });
    });
  });
}
