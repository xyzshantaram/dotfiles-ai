// Single-sourced bash-guard reason test, shared by tool-render (the BashRow
// client card and the host-side guarded-approvals projection) and
// approval-comment (the composer takeover shadow's selectApproval).
//
// One definition on purpose: approval-comment used to carry a hand-copied
// twin of this classifier, and the twin missed two fixes in a row (the `kind`
// stamp, then the escalation exclusions), so escalations kept classifying as
// guard rewrites there long after tool-render was fixed (#105, #130). Both
// consumers import this module, so the next change to classification cannot
// desynchronise again. Do not copy it elsewhere; if a consumer genuinely
// cannot import it, record why and add a divergence test to each copy.
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
 * The summary this repo's escalation YAML carried BEFORE `kind` existed:
 * `bash-guard: escalate from "<mode>" to "<mode>"` (buildEscalationApprovalReason
 * in plugins/bash-guard.ts still emits this exact summary, now alongside a
 * `kind`). Legacy escalation YAML is the one shape that must NOT be adopted
 * by the legacy carve-out below, because classifying it as a guard reason is
 * precisely the #105 bug — it is what painted escalations blue.
 */
export const LEGACY_ESCALATION_SUMMARY_PREFIX = 'bash-guard: escalate from "';

/**
 * The guard YAML this repo emitted before the `kind` discriminator shipped
 * (commit b0c4747). Every approval recorded until then carries no `kind`, so
 * a strict `kind === "bash-guard"` test silently reclassifies ALL history as
 * not-a-guard-reason: old cards lose their banner and dump raw YAML, and the
 * guarded-approvals projection — whose stateVersion bump forces a replay from
 * those very log events — faithfully re-derives the wrong answer.
 *
 * Recognised STRUCTURALLY, because there is no marker to read: a mapping with
 * a string `summary` and a string `runs`, carrying no `kind`. Escalations are
 * excluded twice over, deliberately belt-and-braces since a false positive
 * here reintroduces #105 for historical rows: legacy escalation YAML is the
 * only shape carrying `justification` (a guard reason has never had that
 * field — see GuardApprovalReasonFields), and its summary is a fixed literal.
 *
 * DELETABLE: once sessions predating b0c4747 have aged out of the logs, this
 * carve-out and its tests can go, and the classifier returns to reading only
 * the stamp.
 */
export function isLegacyGuardReasonRecord(record: Record<string, unknown>): boolean {
  if ("kind" in record) return false;
  if (typeof record.summary !== "string") return false;
  if (typeof record.runs !== "string") return false;
  if ("justification" in record) return false;
  return !record.summary.startsWith(LEGACY_ESCALATION_SUMMARY_PREFIX);
}

/**
 * Whether an approval's reason was raised by bash-guard. A reason counts
 * when it declares itself one:
 *
 * - the YAML payloads this repo owns, carrying `kind: "bash-guard"`,
 * - the legacy plain-text rewrite prompts opening with "bash-guard:",
 * - the legacy guard YAML that predates the stamp, matched structurally by
 *   isLegacyGuardReasonRecord so that history keeps its classification.
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
  if (record.kind === GUARD_APPROVAL_KIND) return true;
  return isLegacyGuardReasonRecord(record);
}
