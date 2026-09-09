// Shared bash-guard reason test, used by both the client (BashRow) and the
// host-side guarded-approvals projection.
import { parse } from "yaml";

/**
 * The discriminator this repo stamps on the approval reasons it owns
 * (bash-guard.ts). A reason is a guard reason when it DECLARES itself one
 * with `kind: "bash-guard"`. The literal is repeated here rather than
 * imported: this module ships inside the browser bundle, which cannot import
 * the host-side plugin. The contract between the two literals is pinned by
 * plugins/bash-guard.test.ts, which runs the real builder output through
 * this real classifier.
 */
export const GUARD_APPROVAL_KIND = "bash-guard";

/**
 * The host executor's own escalation ask, which this repo does not control:
 * plain prose of the form `escalate sandbox to <mode>: <justification>`.
 * It is never a guard reason. Matched by its fixed prefix only — the mode
 * vocabulary may widen and the justification is free-form prose, so nothing
 * past the prefix is load-bearing.
 */
export const HOST_ESCALATION_PREFIX = "escalate sandbox to ";

export function isHostEscalationReason(reason: unknown): boolean {
  return typeof reason === "string" && reason.startsWith(HOST_ESCALATION_PREFIX);
}

/**
 * This repo's own retired escalation ask, sent as plain text before the YAML
 * form replaced it: `bash-guard: escalate this bash command from "<mode>" to
 * "<mode>". Justification: ...`. It opens with the guard prefix, so without
 * this carve-out it would keep classifying as a guard reason and old session
 * logs would replay their escalations as blue. No rewrite prompt has ever
 * used this prefix, so excluding it cannot un-guard a real rewrite.
 */
export function isRetiredEscalationPrompt(reason: unknown): boolean {
  return (
    typeof reason === "string" &&
    reason.startsWith("bash-guard: escalate this bash command from ")
  );
}

/**
 * Whether an approval's reason was raised by bash-guard. A reason counts
 * when it declares itself one:
 *
 * - the YAML payloads this repo owns, carrying `kind: "bash-guard"`,
 * - the legacy plain-text rewrite prompts opening with "bash-guard:".
 *
 * Escalations are excluded on every path: the current YAML escalation
 * carries `kind: "escalation"`, the host's plain-string escalation matches
 * isHostEscalationReason, and the retired plain-text escalation matches
 * isRetiredEscalationPrompt. A YAML parse alone is not a test: the plain
 * text parses as YAML just fine, as an object keyed "bash-guard".
 */
export function isBashGuardReason(reason: unknown): boolean {
  if (typeof reason !== "string") return false;
  if (isHostEscalationReason(reason)) return false;
  if (isRetiredEscalationPrompt(reason)) return false;
  if (reason.startsWith("bash-guard:")) return true;
  var result: unknown;
  try {
    result = parse(reason);
  } catch (error) {
    return false;
  }
  if (result === null || typeof result !== "object" || Array.isArray(result)) return false;
  const record = result as Record<string, unknown>;
  return record.kind === GUARD_APPROVAL_KIND;
}
