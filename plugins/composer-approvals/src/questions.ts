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

/** Composer ring widths in px from one snapshot. */
export function ringWidthsOf(snapshot: any): { bright: number; dull: number } {
  const inputs = ringInputsOf(snapshot);
  return ringWidths(inputs.pending, inputs.answered);
}

// Re-exported for the client half so the card claim and the modal jump
// provably share one FIFO implementation.
export { pendingQuestionForCall };
