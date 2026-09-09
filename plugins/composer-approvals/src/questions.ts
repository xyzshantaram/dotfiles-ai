// Question half of the composer-approvals safety net (#38).
//
// The shipped composer takeover (dsh-client-ui-user-questions) is disabled
// in this GUI, so pending ask_user_question waits surface two places: the
// running tool call's own card (the single answer surface, owned by
// tool-render) and this indicator's modal (jump rows only, never answering
// in place). The FIFO routing lives in tool-render/src/questions.ts and is
// imported here, not duplicated: the modal's jump target and the card's
// claim MUST agree, and one implementation cannot drift from itself. The
// agreement is pinned by the test below (each modal row's callId claims the
// same pending the row was built from).
//
// React-free so vitest reaches it without a browser.
import {
  answeredAskCountOf,
  pendingQuestionForCall,
  pendingQuestionsOf,
  questionRowsOf,
  ringWidths,
} from "../../tool-render/src/questions";

/** One jump-only modal row for a pending question batch. */
export interface QuestionModalRow {
  key: string;
  /** The running ask_user_question callId to jump to, or null when no card. */
  callId: string | null;
  label: string;
}

/** Modal rows for every pending question, FIFO-paired with running calls. */
export function questionModalRowsOf(snapshot: any): QuestionModalRow[] {
  return questionRowsOf(snapshot).map((row) => ({
    key: row.key,
    callId: row.callId,
    label: row.label,
  }));
}

/** Ring inputs for the composer card: live pendings plus answered calls. */
export function ringInputsOf(snapshot: any): { pending: number; answered: number } {
  return {
    pending: pendingQuestionsOf(snapshot).length,
    answered: answeredAskCountOf(snapshot),
  };
}

/**
 * Answered-ring fade timing (#106).
 *
 * An answered question's composer band is CONFIRMATION, not state: it holds
 * long enough to register that the answer landed (HOLD), then the width
 * contribution drops to zero and a CSS transition on box-shadow animates it
 * away (FADE) — no per-frame JS, nothing in React's render path, just one
 * timeout per phase. This is the resolution of #38's own "propose a cap or
 * fade-out in review" note, not a defect in #38: the persistent dull band
 * was built exactly as specified, lived with, and then replaced on review.
 *
 * FADE is also the value the client half writes into --dsh-q-fade so the
 * CSS transition and the marker-removal timer agree on one source of truth
 * (client.module.css only declares how the property is used).
 */
export const RING_FADE_HOLD_MS = 2500;
export const RING_FADE_MS = 1600;

/**
 * Fade progress for the answered contribution. `faded` counts answered
 * batches whose band is fully gone; `zeroed` names the answered count whose
 * width was dropped to zero while the CSS transition animates it out (null
 * when no drop is in flight). A later answer resets the cycle because
 * `zeroed` only matches the exact count it was armed for.
 */
export interface ComposerRingFade {
  faded: number;
  zeroed: number | null;
}

/** The pristine fade state: nothing answered, nothing dropped. */
export const INITIAL_RING_FADE: ComposerRingFade = { faded: 0, zeroed: null };

/** What the client half should paint and which timer to arm, if any. */
export interface ComposerRingPaint {
  /** Bright width: a pure function of the LIVE pending count — never faded. */
  bright: number;
  /** Dull width: the answered contribution, zero once its fade is armed. */
  dull: number;
  /** Whether the marker attribute and width properties must be present. */
  ornament: boolean;
  /**
   * Timer the component should arm: "hold" keeps the confirmation band then
   * drops it (CSS animates the drop), "remove" waits out the transition then
   * clears the marker so the composer returns to its pre-question
   * appearance. Null when there is nothing to fade — notably for pending
   * questions, which never arm a timer and therefore can never fade.
   */
  next: "hold" | "remove" | null;
}

/**
 * Fade lifecycle decision for the composer rings (#106), pure so vitest
 * reaches it without a browser.
 *
 * - The BRIGHT ring is `ringWidths(pending, 0)`: answered counts never reach
 *   it, so a pending question's ring cannot fade while it is still waiting,
 *   and answering one of several pending questions only shrinks the bright
 *   width by that one question — the survivors stay intact.
 * - The DULL ring covers answered batches not yet faded. Each newly answered
 *   batch re-shows the band (the confirmation beat) and then fades it; once
 *   every answer has faded, `ornament` goes false and the client half drops
 *   the marker attribute, leaving no residual box-shadow behind.
 */
export function composerRingPaint(
  pending: number,
  answered: number,
  fade: ComposerRingFade,
): ComposerRingPaint {
  const bright = ringWidths(pending, 0).bright;
  const outstanding = Math.max(0, answered - fade.faded);
  if (outstanding <= 0) {
    return { bright, dull: 0, ornament: bright > 0, next: null };
  }
  if (fade.zeroed === answered) {
    // Contribution dropped; the CSS transition is animating it out. Keep
    // the marker until the transition lands so there is a rule to animate
    // within — removing it now would snap the shadow instead of fading it.
    return { bright, dull: 0, ornament: true, next: "remove" };
  }
  return { bright, dull: ringWidths(0, outstanding).dull, ornament: true, next: "hold" };
}

/** Composer ring widths in px from one snapshot. */
export function ringWidthsOf(snapshot: any): { bright: number; dull: number } {
  const inputs = ringInputsOf(snapshot);
  return ringWidths(inputs.pending, inputs.answered);
}

// Re-exported for the client half so the card claim and the modal jump
// provably share one FIFO implementation.
export { pendingQuestionForCall };
