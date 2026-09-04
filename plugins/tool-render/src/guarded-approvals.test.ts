// Unit tests for the guarded-approvals projection's apply fold. Pure state
// checks: no React render, no DOM, no plugin host.
import { describe, expect, it } from "vitest";
import { guardedApprovalsProjection } from "./guarded-approvals";

function askedEvent(seq: number, data: unknown) {
  return { type: "approval/asked", seq: seq, time: 0, data: data };
}

const GUARD_REASON = "summary: block rm -rf outside the workspace\ncommand: rm -rf /tmp/x\n";

describe("guardedApprovalsProjection.apply", () => {
  it("records a callId whose reason passes the bash-guard test", () => {
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: GUARD_REASON }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({ "call-1": true });
  });

  it("skips a reason that is not a bash-guard payload", () => {
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: "please approve" }) as never);
    expect(guardedApprovalsProjection.view(state)).toBeNull();
  });

  it("skips an event with a missing or empty callId", () => {
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", reason: GUARD_REASON }) as never);
    state = guardedApprovalsProjection.apply(state, askedEvent(5, { id: "a2", callId: "", reason: GUARD_REASON }) as never);
    expect(guardedApprovalsProjection.view(state)).toBeNull();
  });

  it("ignores approval/decided: the mark is for the life of the call", () => {
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: GUARD_REASON }) as never);
    state = guardedApprovalsProjection.apply(state, { type: "approval/decided", seq: 5, time: 0, data: { id: "a1", outcome: "approved" } } as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({ "call-1": true });
  });

  it("caps the map at the most recent entries by seq", async () => {
    var state = guardedApprovalsProjection.init();
    for (var i = 0; i < 210; i++) {
      state = guardedApprovalsProjection.apply(state, askedEvent(i, { id: "a" + i, callId: "call-" + i, reason: GUARD_REASON }) as never);
    }
    var view = guardedApprovalsProjection.view(state);
    expect(view).not.toBeNull();
    expect(Object.keys(view as object)).toHaveLength(200);
    expect(view["call-9"]).toBeUndefined();
    expect(view["call-209"]).toBe(true);
  });
});
