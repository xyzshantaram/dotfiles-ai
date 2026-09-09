// Pure question-routing, draft, and answer-batch logic for the
// ask_user_question card (#38).
//
// The shipped composer takeover (dsh-client-ui-user-questions) is disabled
// in this GUI, so the tool-render AskRow answers inline instead. Routing
// carries no callId: question/requested frames hold only { sessionId,
// questions } (verified in dsh-host-apiproxy events.schema.js), and the
// client mints one PendingWait per request (kind "question", key
// `q:<rpcId>`). The running ask_user_question call claims a pending by
// position: both the running-call list (chat nodes in insertion order) and
// the pending list (mint order) are creation-ordered, so index i of one
// pairs with index i of the other (FIFO when several run at once).
//
// composer-approvals imports the routing section from here for its jump
// rows (single implementation, so the modal target and the card claim
// cannot drift apart).
//
// This module is deliberately React-free so vitest reaches it without a
// browser. The card (client.tsx) subscribes through useSession and parks
// the live pending object in a ref for click time, the same pattern as
// ToolRenderApprovalBar.

/** One answer draft for one question. Ported from the shipped QuestionFlow. */
export interface QuestionDraft {
  selected: string[];
  custom: string;
  skipped: boolean;
}

/** A pending question wait, structurally (the PendingWait for kind "question"). */
export interface QuestionPending {
  key: unknown;
  sessionId: string;
  payload: { questions?: unknown };
  respond: (message: unknown) => unknown;
}

/** A single question row for the safety-net modal. */
export interface QuestionRow {
  key: string;
  /** The running ask_user_question callId this pending pairs with, or null. */
  callId: string | null;
  label: string;
}

/** The tool name the running call must carry to claim a pending question. */
const ASK_TOOL_NAME = "ask_user_question";

/** Cap for the composer ring widths (owner: propose a cap in review). */
const RING_CAP = 4;

/** True when the block is a settled ToolResultNode (carries kind). */
function isSettled(block: any): boolean {
  return block !== null && typeof block === "object" && "kind" in block;
}

function blockName(block: any): string {
  if (isSettled(block)) {
    return block.call && typeof block.call.name === "string" ? block.call.name : "";
  }
  return block !== null && typeof block === "object" && typeof block.name === "string"
    ? block.name
    : "";
}

function blockCallId(block: any): string | null {
  return block !== null && typeof block === "object" && typeof block.callId === "string"
    ? block.callId
    : null;
}

/** Root Tool blocks in chat-node insertion order (creation order). */
function rootBlocksOf(snapshot: any): any[] {
  const nodes = snapshot && snapshot.chat && snapshot.chat.nodes;
  if (nodes === undefined || nodes === null || typeof nodes.values !== "function") return [];
  const iter = nodes.values();
  if (iter === null || iter === undefined) return [];
  const entries: any[] = typeof iter.next === "function"
    ? (() => {
        const out: any[] = [];
        for (let entry = iter.next(); entry.done !== true; entry = iter.next()) out.push(entry.value);
        return out;
      })()
    : Array.isArray(iter)
      ? iter
      : [];
  const out: any[] = [];
  for (const node of entries) {
    if (node === undefined || node === null || node.kind !== "tool-call") continue;
    const block = node.data !== undefined && node.data !== null ? node.data.root : undefined;
    if (block === undefined || block === null) continue;
    out.push(block);
  }
  return out;
}

/** Depth-first walk of one lifecycle: the root, then nested subCalls. */
function walkCalls(block: any, visit: (block: any) => void): void {
  visit(block);
  const sub = block !== null && typeof block === "object" && Array.isArray(block.subCalls)
    ? block.subCalls
    : [];
  for (const child of sub) walkCalls(child, visit);
}

/**
 * Pending question waits in mint (creation) order. Items of any other kind
 * are skipped, never filtered by position.
 */
export function pendingQuestionsOf(snapshot: any): QuestionPending[] {
  const pending =
    snapshot !== null && snapshot !== undefined && Array.isArray(snapshot.pending)
      ? snapshot.pending
      : [];
  const out: QuestionPending[] = [];
  for (const item of pending) {
    if (item === null || item === undefined || item.kind !== "question") continue;
    out.push(item as QuestionPending);
  }
  return out;
}

/**
 * CallIds of still-running ask_user_question calls in creation order:
 * chat nodes in insertion order, each lifecycle walked depth-first.
 * A settled call (ToolResultNode, carries kind) never appears.
 */
export function runningAskCallIdsOf(snapshot: any): string[] {
  const out: string[] = [];
  for (const root of rootBlocksOf(snapshot)) {
    walkCalls(root, (block) => {
      if (isSettled(block)) return;
      if (blockName(block) !== ASK_TOOL_NAME) return;
      const callId = blockCallId(block);
      if (callId !== null) out.push(callId);
    });
  }
  return out;
}

/**
 * The pending question one running card claims, or null. Pairing is by
 * position: the card's index in the running-call list selects the same
 * index in the pending list. A settled (or unknown) callId claims nothing.
 */
export function pendingQuestionForCall(snapshot: any, callId: string): QuestionPending | null {
  const running = runningAskCallIdsOf(snapshot);
  const index = running.indexOf(callId);
  if (index === -1) return null;
  const pendings = pendingQuestionsOf(snapshot);
  return index < pendings.length ? pendings[index] : null;
}

/** Questions carried by one pending wait, or null when malformed. */
export function questionsOfPending(pending: QuestionPending): any[] | null {
  const payload = pending !== null && pending !== undefined ? pending.payload : undefined;
  const questions = payload !== null && payload !== undefined ? payload.questions : undefined;
  return Array.isArray(questions) ? questions : null;
}

/** First line of a free-text label, or null when there is nothing to show. */
export function firstLineOf(text: unknown): string | null {
  if (typeof text !== "string") return null;
  const line = text.split("\n", 1)[0].trim();
  return line === "" ? null : line;
}

/** Modal label for one pending: the single question's text, else a count. */
export function questionLabelOf(questions: any[]): string {
  if (questions.length === 1) {
    return firstLineOf(questions[0] !== null && questions[0] !== undefined ? questions[0].question : undefined) ?? "Question";
  }
  return `${questions.length} questions`;
}

/** Safety-net rows: every pending paired with its running call, FIFO. */
export function questionRowsOf(snapshot: any): QuestionRow[] {
  const pendings = pendingQuestionsOf(snapshot);
  const running = runningAskCallIdsOf(snapshot);
  const rows: QuestionRow[] = [];
  for (let i = 0; i < pendings.length; i++) {
    const pending = pendings[i];
    const questions = questionsOfPending(pending);
    rows.push({
      key: String(pending.key),
      callId: i < running.length ? running[i] : null,
      label: questions === null ? "Question" : questionLabelOf(questions),
    });
  }
  return rows;
}

/** Fresh drafts for one question batch (shipped shape). */
export function blankDrafts(count: number): QuestionDraft[] {
  const out: QuestionDraft[] = [];
  for (let i = 0; i < count; i++) out.push({ selected: [], custom: "", skipped: false });
  return out;
}

function isMulti(question: any): boolean {
  return question !== null && typeof question === "object" && question.multiSelect === true;
}

/** Pick (or toggle, for multi-select) one option label. */
export function chooseInDraft(question: any, draft: QuestionDraft, label: string): QuestionDraft {
  if (isMulti(question)) {
    const selected = draft.selected.includes(label)
      ? draft.selected.filter((item) => item !== label)
      : [...draft.selected, label];
    return { ...draft, selected, skipped: false };
  }
  return { selected: [label], custom: "", skipped: false };
}

/** Type into the custom-answer field (clears the pick for single-select). */
export function typeCustomInDraft(question: any, draft: QuestionDraft, value: string): QuestionDraft {
  return {
    ...draft,
    selected: isMulti(question) ? draft.selected : [],
    custom: value,
    skipped: false,
  };
}

/** Skip one question: an empty selection that still counts as complete. */
export function skipDraft(): QuestionDraft {
  return { selected: [], custom: "", skipped: true };
}

/** Answered means a pick or a non-blank custom answer (shipped rule). */
export function draftAnswered(draft: QuestionDraft): boolean {
  return draft.selected.length > 0 || draft.custom.trim() !== "";
}

/** Complete means answered or skipped (shipped rule). */
export function draftCompleted(draft: QuestionDraft): boolean {
  return draftAnswered(draft) || draft.skipped;
}

export interface AnswerBatch {
  answers: Array<{ id: string; selected: string[]; custom?: string }>;
}

export type BatchResult =
  | { ok: true; batch: AnswerBatch }
  | { ok: false; missingIndex: number };

/**
 * Build the structured answer batch for one question set, or name the
 * first incomplete question. Ported from the shipped submitDrafts: a skip
 * sends an empty selection, a custom answer rides `custom` (and clears the
 * pick for single-select), multi-select keeps both.
 */
export function buildAnswerBatch(questions: any[], drafts: QuestionDraft[]): BatchResult {
  for (let i = 0; i < drafts.length; i++) {
    if (!draftCompleted(drafts[i])) return { ok: false, missingIndex: i };
  }
  return {
    ok: true,
    batch: {
      answers: questions.map((item, index) => {
        const value = drafts[index];
        if (value.skipped) return { id: item.id, selected: [] as string[] };
        const custom = value.custom.trim();
        return {
          id: item.id,
          selected: custom === "" || isMulti(item) ? value.selected : [],
          ...(custom === "" ? {} : { custom }),
        };
      }),
    },
  };
}

/**
 * The answer wire, verified against dsh-client-ui-user-questions
 * PendingQuestion.answer: respond ok with the sessionId plus the whole
 * structured batch; a rejected carrier receipt throws at the call site.
 */
export function answerMessage(pending: QuestionPending, batch: AnswerBatch): unknown {
  return { ok: true, value: { sessionId: pending.sessionId, answer: batch } };
}

/** The cancel wire: the exact cancelled error the shipped composer sends. */
export function cancelMessage(): unknown {
  return {
    ok: false,
    error: { code: "cancelled", message: "the user closed this question request", details: {} },
  };
}

function parseBlockArgs(raw: unknown): any | null {
  if (typeof raw !== "string" || raw === "") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function settledAnswerCount(block: any): number {
  if (!isSettled(block) || block.isError === true) return 0;
  const content = Array.isArray(block.content) ? block.content : [];
  const parts: string[] = [];
  for (const item of content) {
    if (item && item.type === "text" && typeof item.text === "string") parts.push(item.text);
  }
  const parsed = parseBlockArgs(parts.join("\n"));
  if (parsed === null || typeof parsed !== "object" || !Array.isArray(parsed.answers)) return 0;
  return 1;
}

/**
 * Settled ask_user_question calls that carry a parsed answer batch. These
 * are the "dull" composer rings: answered, not vanishing. Unparseable and
 * errored calls (cancelled, aborted) count for nothing.
 */
export function answeredAskCountOf(snapshot: any): number {
  let count = 0;
  for (const root of rootBlocksOf(snapshot)) {
    walkCalls(root, (block) => {
      if (!isSettled(block)) return;
      if (blockName(block) !== ASK_TOOL_NAME) return;
      count += settledAnswerCount(block);
    });
  }
  return count;
}

/**
 * Composer ring widths in px from live and answered counts. One ring step
 * per question, capped (see RING_CAP): the bright band grows with pending
 * questions, the dull band with answered ones.
 */
export function ringWidths(pendingCount: number, answeredCount: number): { bright: number; dull: number } {
  const bright = pendingCount <= 0 ? 0 : 3 + 2 * (Math.min(pendingCount, RING_CAP) - 1);
  const dull = answeredCount <= 0 ? 0 : 3 + 2 * (Math.min(answeredCount, RING_CAP) - 1);
  return { bright, dull };
}

/**
 * Split the conventional recommendation suffix without changing the answer
 * value. Ported from the shipped QuestionComposer.
 */
export function parseRecommendedLabel(label: string): { label: string; recommended: boolean } {
  const suffix = /\s*(?:\((?:recommended|推荐)\)|（(?:recommended|推荐)）)\s*$/i;
  return suffix.test(label)
    ? { label: label.replace(suffix, ""), recommended: true }
    : { label, recommended: false };
}
