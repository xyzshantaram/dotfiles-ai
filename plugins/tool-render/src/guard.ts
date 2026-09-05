// Shared bash-guard reason test, used by both the client (BashRow) and the
// host-side guarded-approvals projection.
import { parse } from "yaml";

/**
 * Whether an approval's reason was raised by bash-guard. Two shapes exist:
 *
 * - The one the shipped guard actually emits (every `approval/asked` event
 *   in the real session log): plain text starting with "bash-guard:", then
 *   the command and the matched rules.
 * - The YAML payload (a plain object with a string `summary`) that
 *   approval-comment's parseGuardReason also accepts, kept for forward
 *   compatibility.
 *
 * A YAML parse alone is not a test: the plain text parses as YAML just
 * fine, as an object keyed "bash-guard". Each shape therefore gets its own
 * explicit branch.
 */
export function isBashGuardReason(reason: unknown): boolean {
  if (typeof reason !== "string") return false;
  if (reason.startsWith("bash-guard:")) return true;
  var result: unknown;
  try {
    result = parse(reason);
  } catch (error) {
    return false;
  }
  if (result === null || typeof result !== "object" || Array.isArray(result)) return false;
  const record = result as Record<string, unknown>;
  return typeof record.summary === "string";
}
