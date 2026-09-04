// Shared bash-guard reason test, used by both the client (BashRow) and the
// host-side guarded-approvals projection.
import { parse } from "yaml";

/**
 * Whether an approval's reason is a bash-guard structured payload. bash-guard
 * now sends this as YAML (approval-comment's parseGuardReason applies the
 * same test to the same field): it is ours only when the reason parses as
 * YAML and the result is a plain object with a string `summary`. A literal
 * `reason.indexOf("bash-guard:") === 0` check no longer works -- the raw
 * string starts with the YAML key `summary:`, not the text "bash-guard:".
 */
export function isBashGuardReason(reason: unknown): boolean {
  if (typeof reason !== "string") return false;
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
