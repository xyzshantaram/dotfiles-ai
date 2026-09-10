// Badge tone model for the composer indicator (#135).
//
// REPLACES THE COMPOSER RINGS. Three fronts had accumulated on the composer
// card — #38's white question rings, #65's blue/yellow approval rings, and
// #106's hold-then-fade — and #132 then had to stop them MASKING each other,
// because two plugins competed for one `box-shadow` property. The fix worked,
// but it cost a cross-plugin custom-property contract with cumulative spread
// arithmetic and a drift test to tint the edge of a text box. The badge is
// already there, already the thing you click, and carries the same
// information with none of the coupling.
//
// TOOL CALL CARDS ARE NOT AFFECTED and must not be: a card is a durable
// RECORD of one call and its outline is that record's mark, so it keeps it
// permanently. The composer is a LIVE CONTROL, which is why its state may
// fade. That distinction predates this ticket and survives it.
//
// React-free so vitest reaches it without a browser.
import { isBashGuardReason, isHostEscalationReason } from "../../shared/guard-reason";
import { splitEscalationReason } from "../../tool-render/src/escalation";

/**
 * What the badge is currently reporting.
 *
 * The colour vocabulary is INHERITED, not invented: blue = guard rewrite or
 * rule ask, yellow = sandbox escalation, neutral = questions. #130 has just
 * corrected escalations from blue to yellow, so re-picking colours here would
 * undo a fix that landed hours ago.
 */
export type BadgeTone = "escalated" | "rewrite" | "approval" | "question" | "none";

/**
 * Priority when several kinds are pending at once.
 *
 * This is a DECISION, not an ordering that fell out of the code, and #135
 * requires it be stated and pinned. A session can genuinely have a pending
 * escalation, a pending rewrite ask and a pending question simultaneously.
 *
 *   escalated > rewrite > approval > question
 *
 * Approvals outrank questions because an unanswered approval blocks an agent
 * MID-COMMAND while an unanswered question does not. Escalation outranks a
 * rewrite ask because it grants wider sandbox access — the more consequential
 * decision of the two, and the one worth surfacing when both wait.
 *
 * The count (see `badgeCount`) still reports EVERYTHING pending, so a
 * lower-priority kind is never hidden — only out-ranked for the colour. That
 * is the specific trap #132 was: one signal silently erasing another.
 */
const ORDER: readonly BadgeTone[] = ["escalated", "rewrite", "approval", "question", "none"];

/** Rank for comparison; lower wins. */
function rankOf(tone: BadgeTone): number {
  const at = ORDER.indexOf(tone);
  return at === -1 ? ORDER.length : at;
}

/**
 * Classify one pending approval's reason.
 *
 * Both predicates are imported from their single sources rather than
 * reimplemented: `isBashGuardReason` from shared/guard-reason (extracted in
 * #130 precisely because a hand-copied twin had drifted and kept the #105 bug
 * alive), and `splitEscalationReason` from tool-render's escalation module.
 * A fourth copy of either would be the same defect again.
 */
export function approvalToneOf(reason: unknown): BadgeTone {
  if (isBashGuardReason(reason)) return "rewrite";
  if (isHostEscalationReason(reason)) return "escalated";
  if (splitEscalationReason(reason) !== null) return "escalated";
  // A pending approval we cannot classify is still an approval: it must
  // out-rank a question and must never be silently dropped to "none".
  return "approval";
}

/**
 * The tone the badge should paint.
 *
 * @param approvalReasons - `payload.reason` of every pending approval.
 * @param questionCount - number of pending question batches.
 */
export function badgeToneOf(
  approvalReasons: readonly unknown[],
  questionCount: number,
): BadgeTone {
  let best: BadgeTone = "none";
  for (const reason of approvalReasons) {
    const tone = approvalToneOf(reason);
    if (rankOf(tone) < rankOf(best)) best = tone;
  }
  if (best !== "none") return best;
  return questionCount > 0 ? "question" : "none";
}

/**
 * How many things are waiting, across every kind.
 *
 * Deliberately independent of the tone: the colour reports the most urgent
 * kind while the count reports the total, so an out-ranked kind is still
 * visibly there. Reporting only the winning kind's count would reproduce
 * #132's masking in a new place.
 */
export function badgeCount(approvalCount: number, questionCount: number): number {
  return Math.max(0, approvalCount) + Math.max(0, questionCount);
}

/**
 * Whether the badge should be on screen at all.
 *
 * `true` while anything is pending, and ALSO during the confirmation window
 * after the last item is answered — #106 established that an answered item
 * deserves a brief confirmation rather than vanishing, and dropping that
 * would make answering feel like the click was lost.
 */
export function badgeVisible(tone: BadgeTone, confirming: boolean): boolean {
  return tone !== "none" || confirming;
}
