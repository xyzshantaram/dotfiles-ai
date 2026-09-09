// Browser-free tests for the composer-approvals question safety net (#38):
// modal rows pair jump targets through the same FIFO the card claims with,
// and the composer ring inputs count live pendings plus answered calls.
import { describe, expect, it } from "vitest";
import { pendingQuestionForCall } from "../../tool-render/src/questions";
import { questionModalRowsOf, ringInputsOf, ringWidthsOf } from "./questions.js";

function runningCall(callId: string, name = "ask_user_question", subCalls: any[] = []) {
  return { callId, name, argsRaw: "{}", time: 1, subCalls };
}

function settledAnswered(name = "ask_user_question") {
  return {
    kind: "tool-result",
    call: { name, argsRaw: "{}" },
    callTime: 1,
    content: [{ type: "text", text: JSON.stringify({ answers: [{ id: "a", selected: ["x"] }] }) }],
    isError: false,
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

describe("questionModalRowsOf", () => {
  it("pairs each pending with its running card, FIFO", () => {
    const snap = snapshot(
      [questionPending("q:1"), questionPending("q:2")],
      [runningCall("c1"), runningCall("c2")],
    );
    expect(questionModalRowsOf(snap)).toEqual([
      { key: "q:1", callId: "c1", label: "Pick?" },
      { key: "q:2", callId: "c2", label: "Pick?" },
    ]);
  });

  it("leaves a pending call-less when no card runs for it", () => {
    const snap = snapshot([questionPending("q:1")], []);
    expect(questionModalRowsOf(snap)).toEqual([{ key: "q:1", callId: null, label: "Pick?" }]);
  });

  it("agrees with the card's own claim: jumping lands on the asking card", () => {
    const snap = snapshot(
      [questionPending("q:1"), questionPending("q:2")],
      [runningCall("c1"), runningCall("c2")],
    );
    for (const row of questionModalRowsOf(snap)) {
      if (row.callId === null) throw new Error("expected a jump target");
      const claimed = pendingQuestionForCall(snap, row.callId) as any;
      expect(claimed.key).toBe(row.key);
    }
  });
});

describe("ringInputsOf / ringWidthsOf", () => {
  it("counts live pendings and answered calls", () => {
    const snap = snapshot(
      [questionPending("q:1"), { kind: "approval", key: "a:1", payload: {} }],
      [runningCall("c1"), settledAnswered()],
    );
    expect(ringInputsOf(snap)).toEqual({ pending: 1, answered: 1 });
    expect(ringWidthsOf(snap)).toEqual({ bright: 3, dull: 3 });
  });

  it("is quiet with nothing pending and nothing answered", () => {
    expect(ringInputsOf(snapshot([], [runningCall("c1", "bash")]))).toEqual({ pending: 0, answered: 0 });
    expect(ringWidthsOf(snapshot([], []))).toEqual({ bright: 0, dull: 0 });
  });
});
