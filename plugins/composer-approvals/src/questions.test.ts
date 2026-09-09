// Browser-free tests for the composer-approvals question safety net (#38):
// modal rows pair jump targets through the same FIFO the card claims with,
// and the composer ring inputs count live pendings plus answered calls.
import { describe, expect, it } from "vitest";
import { pendingQuestionForCall, ringWidths } from "../../tool-render/src/questions";
import {
  INITIAL_RING_FADE,
  composerRingPaint,
  initialRingFade,
  questionModalRowsOf,
  ringInputsOf,
  ringWidthsOf,
} from "./questions.js";

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
    expect(ringInputsOf(snapshot([], [runningCall("c1", "bash")]))).toEqual({
      pending: 0,
      answered: 0,
    });
    expect(ringWidthsOf(snapshot([], []))).toEqual({ bright: 0, dull: 0 });
  });
});

describe("initialRingFade (#106: opening a session must not replay history)", () => {
  it("pre-fades the answered backlog, so a fresh mount arms no timer and paints no band", () => {
    // The reported symptom: the animation played on every session open. A
    // composer mounting into scrollback with three already-answered questions
    // must be indistinguishable from one with none — no dull band, no timer.
    const paint = composerRingPaint(0, 3, initialRingFade(3));
    expect(paint).toEqual({ bright: 0, dull: 0, ornament: false, next: null });
  });

  it("still marks questions that are PENDING at mount", () => {
    // Seeding must not silence a live ask. Two waiting, five already answered:
    // the bright ring is painted immediately and nothing fades.
    const paint = composerRingPaint(2, 5, initialRingFade(5));
    expect(paint.bright).toBe(5);
    expect(paint.dull).toBe(0);
    expect(paint.next).toBeNull();
  });

  it("animates an answer given AFTER mount, which is the only thing that should animate", () => {
    // Mounted with two answered; a third is answered live. Exactly one
    // contribution is outstanding, so the hold-then-fade cycle arms.
    const paint = composerRingPaint(0, 3, initialRingFade(2));
    expect(paint.next).toBe("hold");
    expect(paint.dull).toBeGreaterThan(0);
  });
});

describe("composerRingPaint (#106 fade lifecycle)", () => {
  it("never arms a timer for pending questions: the bright ring cannot fade", () => {
    const paint = composerRingPaint(2, 0, INITIAL_RING_FADE);
    expect(paint).toEqual({ bright: 5, dull: 0, ornament: true, next: null });
  });

  it("leaves the other bright rings intact when one of several pending is answered", () => {
    // Answer lands: bright shrinks by exactly the answered one, dull holds
    // the confirmation band.
    const held = composerRingPaint(2, 1, INITIAL_RING_FADE);
    expect(held).toEqual({ bright: 5, dull: 3, ornament: true, next: "hold" });
    // Hold fires: the answered contribution drops (CSS animates it out)
    // while the survivors stay at full width.
    const fading = composerRingPaint(2, 1, { faded: 0, zeroed: 1 });
    expect(fading).toEqual({ bright: 5, dull: 0, ornament: true, next: "remove" });
    // Transition lands: marker stays for the still-pending questions.
    const settled = composerRingPaint(2, 1, { faded: 1, zeroed: null });
    expect(settled).toEqual({ bright: 5, dull: 0, ornament: true, next: null });
  });

  it("returns the composer to its pre-question appearance once all answers fade", () => {
    const held = composerRingPaint(0, 2, INITIAL_RING_FADE);
    expect(held).toEqual({ bright: 0, dull: 5, ornament: true, next: "hold" });
    // Mid-fade the marker stays so the transition has a rule to animate
    // within; dropping it here would snap instead of fading.
    const fading = composerRingPaint(0, 2, { faded: 0, zeroed: 2 });
    expect(fading).toEqual({ bright: 0, dull: 0, ornament: true, next: "remove" });
    // Fade landed: no band, no marker — the client half removes the
    // attribute and the width properties, leaving no residual box-shadow.
    const gone = composerRingPaint(0, 2, { faded: 2, zeroed: null });
    expect(gone).toEqual({ bright: 0, dull: 0, ornament: false, next: null });
  });

  it("re-shows the band when a new answer lands mid-fade", () => {
    const paint = composerRingPaint(0, 2, { faded: 1, zeroed: 1 });
    expect(paint).toEqual({ bright: 0, dull: 3, ornament: true, next: "hold" });
  });

  it("caps both bands at four steps", () => {
    expect(composerRingPaint(40, 0, INITIAL_RING_FADE).bright).toBe(9);
    expect(composerRingPaint(0, 40, INITIAL_RING_FADE).dull).toBe(9);
    // A long session fades one outstanding answer at a time, not the cap.
    expect(composerRingPaint(0, 40, { faded: 39, zeroed: null }).dull).toBe(3);
  });

  it("derives the bright width from the live pending count in every phase", () => {
    const phases = [
      INITIAL_RING_FADE,
      { faded: 0, zeroed: 1 },
      { faded: 1, zeroed: null },
      { faded: 1, zeroed: 2 },
    ];
    for (const fade of phases) {
      for (const pending of [0, 1, 3, 40]) {
        expect(composerRingPaint(pending, 2, fade).bright).toBe(ringWidths(pending, 0).bright);
      }
    }
  });
});
