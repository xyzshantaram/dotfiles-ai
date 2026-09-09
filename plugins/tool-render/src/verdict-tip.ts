// Verdict-badge tooltip composition (owner, 2026-09-09, ticket #104).
//
// When bash-guard rewrites a command or raises an approval, the tool call
// row's header badge states the OUTCOME (approved/rejected) but not the WHY.
// The reasons exist in durable data — the rewrite in the call's own result
// metadata (`meta.rewritten` + `meta.ran`, falling back to the result-text
// banner), the prompt in the session log's `approval/asked` events folded by
// guarded-approvals.ts — but both are only visible after expanding the card,
// and once the decision settles the header badge is often all that remains
// in view. This module composes the badge's tooltip from those two durable
// sources.
//
// THE OWNER'S DECIDED FORMAT (grill, 2026-09-09): ONE tooltip with TWO
// LABELLED LINES — not two tooltips, and not one run-on string. A rewritten
// AND prompted call carries both the rewrite reason and the prompt reason,
// each on its own labelled line, so the reader can tell which is which
// without guessing. A badge with neither reason gains NO tooltip (the
// composer returns null, and the render site sets no title attribute — an
// empty tooltip promises information and delivers a blank).
//
// Length is the risk the grill named: the guard prompt reason is a YAML
// payload, and dumping it into a title attribute reproduces exactly the
// noise the approval bar's deliberate guard exclusion exists to prevent.
// So the prompt line carries the payload's human-meaningful `summary` field
// only, collapsed to one line and capped; `wrote`/`runs` duplicate the
// rewrite line, and the long-form `why`/`changes` stay out of the tooltip.
// The rewrite line reuses guardRewriteLabel from ./text — the same function
// the expanded-card rewrite block renders — so the two can never disagree.
//
// Like escalation.ts, this module is React-free and DOM-free: the tooltip
// composition is pure string work, unit-tested without rendering.
import { parse } from "yaml";
import { isBashGuardReason } from "./guard";
import { guardRewriteLabel } from "./text";

/** First tooltip line's label: what bash-guard ran instead of the command. */
export const VERDICT_TIP_REWRITE_LABEL = "Rewrite";

/** Second tooltip line's label: why bash-guard asked the human. */
export const VERDICT_TIP_PROMPT_LABEL = "Prompt";

/**
 * Maximum characters per tooltip line, ellipsis included. A title attribute
 * is not a place for a command transcript or a rule dump; beyond this the
 * line is cut with a trailing ellipsis so the cut reads as a cut.
 */
export const VERDICT_TIP_LINE_MAX = 300;

/** Collapse every whitespace run (newlines included) to one space and trim. */
export function singleLineTipText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * The one-line human summary of a bash-guard approval reason, or null when
 * the reason is not a guard reason at all. A structured YAML payload
 * contributes its `summary` field; the shipped guard's plain-text shape
 * ("bash-guard: ...") contributes its first line. Anything else — an
 * escalation justification, a foreign approval's prose — is null: those
 * reasons have their own surfaces (the escalation banner, the approval
 * strip), and echoing them here would show the same fact twice.
 *
 * NOTE (#105, latent): isBashGuardReason currently classifies this repo's
 * escalation YAML (a mapping carrying a string `summary`) as a guard
 * reason. That branch is dead in practice — the live escalation reason is
 * the plain string `escalate sandbox to <mode>: <justification>`, which
 * carries no `summary` key and classifies false — but the day it fires, a
 * stored escalation reason reaches this function as guard-shaped and its
 * summary line renders as the Prompt line. That is the classifier's defect,
 * not this summariser's: this function trusts isBashGuardReason the same
 * way the card outline and the approval bar do.
 */
export function summariseGuardPromptReason(reason: unknown): string | null {
  if (typeof reason !== "string" || !isBashGuardReason(reason)) return null;
  var parsed: unknown = null;
  try {
    parsed = parse(reason);
  } catch (error) {
    parsed = null;
  }
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    var summary: unknown = (parsed as Record<string, unknown>).summary;
    if (typeof summary === "string") {
      var summaryLine = singleLineTipText(summary);
      if (summaryLine !== "") return summaryLine;
    }
  }
  // Plain-text guard reason ("bash-guard: ..."): its first non-empty line.
  // (A YAML payload that parses always carries a string `summary` — the
  // classifier guarantees it — so reaching this fallback with YAML-shaped
  // input means the blob was cut mid-scalar by the projection cap and no
  // longer classifies; that case fails silent above by returning null.)
  var lines = reason.split("\n");
  for (var i = 0; i < lines.length; i++) {
    var line = singleLineTipText(lines[i]);
    if (line !== "") return line;
  }
  return null;
}

/**
 * The tooltip's rewrite line, unlabelled: the shared guardRewriteLabel for
 * the command pair plus the command that actually ran. Null when there is
 * no ran command — no rewrite recorded, no line. An unreadable original
 * keeps the generic "ran instead" label, exactly as the expanded banner
 * does, because both read the same function.
 */
export function guardRewriteTipLine(originalCmd: unknown, ranCmd: unknown): string | null {
  if (typeof ranCmd !== "string") return null;
  var ran = singleLineTipText(ranCmd);
  if (ran === "") return null;
  var label = guardRewriteLabel(typeof originalCmd === "string" ? originalCmd : undefined, ranCmd);
  return label + " " + ran;
}

/**
 * Cap one composed line at VERDICT_TIP_LINE_MAX characters, ellipsis
 * included, so a long command or summary cannot turn the tooltip into a
 * transcript. Null when the value carries no text at all.
 */
function capTipLine(line: string): string | null {
  var collapsed = singleLineTipText(line);
  if (collapsed === "") return null;
  if (collapsed.length <= VERDICT_TIP_LINE_MAX) return collapsed;
  return collapsed.slice(0, VERDICT_TIP_LINE_MAX - 1).replace(/\s+$/, "") + "…";
}

/**
 * Compose the verdict badge's tooltip: at most TWO labelled lines, joined
 * by one newline — `Rewrite: ...` then `Prompt: ...` — each collapsed to a
 * single line so a reason containing a colon or a newline cannot break the
 * structure. (Colons need no special handling: nothing here splits on them;
 * newlines are collapsed before joining.) Null when neither reason carries
 * text, so the render site sets no title attribute at all.
 */
export function composeVerdictTooltip(
  rewriteReason: unknown,
  promptReason: unknown,
): string | null {
  var lines: string[] = [];
  if (typeof rewriteReason === "string") {
    var rewrite = capTipLine(rewriteReason);
    if (rewrite !== null) lines.push(VERDICT_TIP_REWRITE_LABEL + ": " + rewrite);
  }
  if (typeof promptReason === "string") {
    var prompt = capTipLine(promptReason);
    if (prompt !== null) lines.push(VERDICT_TIP_PROMPT_LABEL + ": " + prompt);
  }
  if (lines.length === 0) return null;
  return lines.join("\n");
}
