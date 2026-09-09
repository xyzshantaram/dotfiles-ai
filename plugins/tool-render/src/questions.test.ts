// Browser-free tests for the ask_user_question card logic (#38): the
// running-call FIFO matcher and the structured answer-batch builder.
import { describe, expect, it } from "vitest";
import {
  answerMessage,
  answeredAskCountOf,
  blankDrafts,
  buildAnswerBatch,
  cancelMessage,
  chooseInDraft,
  draftAnswered,
  draftCompleted,
  parseRecommendedLabel,
  pendingQuestionForCall,
  pendingQuestionsOf,
  questionLabelOf,
  questionRowsOf,
  ringWidths,
  runningAskCallIdsOf,
  skipDraft,
  typeCustomInDraft,
} from "./questions.js";

function runningCall(callId: string, name = "ask_user_question", subCalls: any[] = []) {
  return { callId, name, argsRaw: "{}", time: 1, subCalls };
}

function settledCall(name: string, text: string, isError = false) {
  return {
    kind: "tool-result",
    call: { name, argsRaw: "{}" },
    callTime: 1,
    content: [{ type: "text", text }],
    isError,
  };
}

function toolNode(root: any) {
  return { kind: "tool-call", data: { root } };
}

function snapshot(pending: any[], roots: any[]) {
  return { pending, chat: { nodes: new Map(roots.map((root, i) => [`n${i}`, toolNode(root)])) } };
}

function questionPending(key: string, questions: any[] = [{ id: "q1", question: "Pick?" }]) {
  return { kind: "question", key, sessionId: "s1", payload: { questions }, respond: () => {} };
}

describe("pendingQuestionsOf", () => {
  it("keeps only question waits, in order", () => {
    const snap = snapshot(
      [
        { kind: "approval", key: "a:1", payload: {} },
        questionPending("q:1"),
        null,
        questionPending("q:2"),
      ],
      [],
    );
    expect(pendingQuestionsOf(snap).map((p) => p.key)).toEqual(["q:1", "q:2"]);
  });

  it("tolerates a missing pending list", () => {
    expect(pendingQuestionsOf({})).toEqual([]);
    expect(pendingQuestionsOf(null)).toEqual([]);
  });
});

describe("runningAskCallIdsOf", () => {
  it("lists running ask calls in node order", () => {
    const snap = snapshot([], [runningCall("c1"), runningCall("c2")]);
    expect(runningAskCallIdsOf(snap)).toEqual(["c1", "c2"]);
  });

  it("skips settled calls and other tools", () => {
    const snap = snapshot(
      [],
      [
        settledCall("ask_user_question", JSON.stringify({ answers: [] })),
        runningCall("c-bash", "bash"),
        runningCall("c1"),
      ],
    );
    expect(runningAskCallIdsOf(snap)).toEqual(["c1"]);
  });

  it("finds nested ask calls depth-first", () => {
    const snap = snapshot([], [runningCall("root", "subagent", [runningCall("nested")])]);
    expect(runningAskCallIdsOf(snap)).toEqual(["nested"]);
  });

  it("ignores non-tool-call nodes and missing chat", () => {
    const snap = {
      pending: [],
      chat: { nodes: new Map([["x", { kind: "message", data: {} }]]) },
    };
    expect(runningAskCallIdsOf(snap)).toEqual([]);
    expect(runningAskCallIdsOf({})).toEqual([]);
  });
});

describe("pendingQuestionForCall", () => {
  it("pairs by position, FIFO", () => {
    const snap = snapshot(
      [questionPending("q:1"), questionPending("q:2")],
      [runningCall("c1"), runningCall("c2")],
    );
    expect((pendingQuestionForCall(snap, "c1") as any).key).toBe("q:1");
    expect((pendingQuestionForCall(snap, "c2") as any).key).toBe("q:2");
  });

  it("claims nothing for settled or unknown calls", () => {
    const settled = { ...settledCall("ask_user_question", "{}"), callId: "done" };
    const snap = snapshot([questionPending("q:1")], [settled, runningCall("c1")]);
    expect(pendingQuestionForCall(snap, "done")).toBeNull();
    expect(pendingQuestionForCall(snap, "nope")).toBeNull();
    expect((pendingQuestionForCall(snap, "c1") as any).key).toBe("q:1");
  });

  it("leaves surplus pendings and surplus calls unmatched", () => {
    const twoPendings = snapshot([questionPending("q:1"), questionPending("q:2")], [runningCall("c1")]);
    expect((pendingQuestionForCall(twoPendings, "c1") as any).key).toBe("q:1");
    const twoCalls = snapshot([questionPending("q:1")], [runningCall("c1"), runningCall("c2")]);
    expect(pendingQuestionForCall(twoCalls, "c2")).toBeNull();
  });
});

describe("questionRowsOf", () => {
  it("labels a single question with its text", () => {
    const snap = snapshot([questionPending("q:1", [{ id: "a", question: "Deploy?\nsecond" }])], [runningCall("c1")]);
    expect(questionRowsOf(snap)).toEqual([{ key: "q:1", callId: "c1", label: "Deploy?" }]);
  });

  it("labels a batch with its count and leaves extras call-less", () => {
    const snap = snapshot(
      [
        questionPending("q:1", [
          { id: "a", question: "One?" },
          { id: "b", question: "Two?" },
        ]),
        questionPending("q:2"),
      ],
      [runningCall("c1")],
    );
    expect(questionRowsOf(snap)).toEqual([
      { key: "q:1", callId: "c1", label: "2 questions" },
      { key: "q:2", callId: null, label: "Pick?" },
    ]);
  });

  it("falls back when the payload carries no questions", () => {
    const snap = snapshot([{ kind: "question", key: "q:9", sessionId: "s", payload: {}, respond: () => {} }], []);
    expect(questionRowsOf(snap)).toEqual([{ key: "q:9", callId: null, label: "Question" }]);
  });
});

describe("questionLabelOf", () => {
  it("falls back for blank or missing text", () => {
    expect(questionLabelOf([{ id: "a" }])).toBe("Question");
    expect(questionLabelOf([{ id: "a", question: "  " }])).toBe("Question");
  });
});

describe("drafts", () => {
  it("starts blank in the shipped shape", () => {
    expect(blankDrafts(2)).toEqual([
      { selected: [], custom: "", skipped: false },
      { selected: [], custom: "", skipped: false },
    ]);
  });

  it("single-select replaces the pick and clears custom", () => {
    const next = chooseInDraft({}, { selected: ["a"], custom: "typed", skipped: false }, "b");
    expect(next).toEqual({ selected: ["b"], custom: "", skipped: false });
  });

  it("multi-select toggles without clearing", () => {
    const q = { multiSelect: true };
    const added = chooseInDraft(q, { selected: ["a"], custom: "", skipped: false }, "b");
    expect(added.selected).toEqual(["a", "b"]);
    expect(chooseInDraft(q, added, "a").selected).toEqual(["b"]);
  });

  it("typing clears the pick for single-select but keeps it for multi", () => {
    const single = typeCustomInDraft({}, { selected: ["a"], custom: "", skipped: false }, "hi");
    expect(single).toEqual({ selected: [], custom: "hi", skipped: false });
    const multi = typeCustomInDraft(
      { multiSelect: true },
      { selected: ["a"], custom: "", skipped: false },
      "hi",
    );
    expect(multi.selected).toEqual(["a"]);
  });

  it("skip and completion rules match the shipped flow", () => {
    expect(skipDraft()).toEqual({ selected: [], custom: "", skipped: true });
    expect(draftAnswered({ selected: [], custom: "  ", skipped: false })).toBe(false);
    expect(draftAnswered({ selected: ["a"], custom: "", skipped: false })).toBe(true);
    expect(draftCompleted(skipDraft())).toBe(true);
    expect(draftCompleted({ selected: [], custom: "", skipped: false })).toBe(false);
  });
});

describe("buildAnswerBatch", () => {
  const one = [{ id: "a", question: "Pick?" }];

  it("sends the single pick", () => {
    expect(
      buildAnswerBatch(one, [{ selected: ["x"], custom: "", skipped: false }]),
    ).toEqual({ ok: true, batch: { answers: [{ id: "a", selected: ["x"] }] } });
  });

  it("sends custom alone for single-select, alongside for multi", () => {
    expect(
      buildAnswerBatch(one, [{ selected: ["x"], custom: "other", skipped: false }]),
    ).toEqual({ ok: true, batch: { answers: [{ id: "a", selected: [], custom: "other" }] } });
    expect(
      buildAnswerBatch([{ id: "a", multiSelect: true }], [{ selected: ["x"], custom: "other", skipped: false }]),
    ).toEqual({ ok: true, batch: { answers: [{ id: "a", selected: ["x"], custom: "other" }] } });
  });

  it("sends an empty selection for a skip", () => {
    expect(buildAnswerBatch(one, [skipDraft()])).toEqual({
      ok: true,
      batch: { answers: [{ id: "a", selected: [] }] },
    });
  });

  it("names the first incomplete question", () => {
    const questions = [...one, { id: "b", question: "Next?" }];
    const drafts = [{ selected: ["x"], custom: "", skipped: false }, blankDrafts(1)[0]];
    expect(buildAnswerBatch(questions, drafts)).toEqual({ ok: false, missingIndex: 1 });
  });
});

describe("answer wire", () => {
  it("answers ok with the sessionId and the whole batch", () => {
    const pending = questionPending("q:1");
    const batch = { answers: [{ id: "a", selected: ["x"] }] };
    expect(answerMessage(pending, batch)).toEqual({
      ok: true,
      value: { sessionId: "s1", answer: batch },
    });
  });

  it("cancels with the exact shipped cancelled error", () => {
    expect(cancelMessage()).toEqual({
      ok: false,
      error: { code: "cancelled", message: "the user closed this question request", details: {} },
    });
  });
});

describe("answeredAskCountOf", () => {
  it("counts only settled ask calls with a parsed answer batch", () => {
    const snap = snapshot(
      [],
      [
        settledCall("ask_user_question", JSON.stringify({ answers: [{ id: "a", selected: ["x"] }] })),
        settledCall("ask_user_question", "not json"),
        settledCall("ask_user_question", JSON.stringify({ answers: [] }), true),
        settledCall("bash", "ok"),
        runningCall("c1"),
      ],
    );
    expect(answeredAskCountOf(snap)).toBe(1);
  });
});

describe("ringWidths", () => {
  it("is zero when there is nothing to show and 3px for one", () => {
    expect(ringWidths(0, 0)).toEqual({ bright: 0, dull: 0 });
    expect(ringWidths(1, 1)).toEqual({ bright: 3, dull: 3 });
  });

  it("grows per question and caps", () => {
    expect(ringWidths(2, 3)).toEqual({ bright: 5, dull: 7 });
    expect(ringWidths(4, 9)).toEqual({ bright: 9, dull: 9 });
  });
});

describe("parseRecommendedLabel", () => {
  it("strips the recommendation suffix in both languages", () => {
    expect(parseRecommendedLabel("Blue (recommended)")).toEqual({ label: "Blue", recommended: true });
    expect(parseRecommendedLabel("蓝（推荐）")).toEqual({ label: "蓝", recommended: true });
    expect(parseRecommendedLabel("Plain")).toEqual({ label: "Plain", recommended: false });
  });
});
