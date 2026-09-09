// Unit tests for the guarded-approvals projection's apply fold. Pure state
// checks: no React render, no DOM, no plugin host.
import { describe, expect, it } from "vitest";
import { guardedApprovalsProjection } from "./guarded-approvals";

function askedEvent(seq: number, data: unknown) {
  return { type: "approval/asked", seq: seq, time: 0, data: data };
}

function decidedEvent(seq: number, data: unknown) {
  return { type: "approval/decided", seq: seq, time: 0, data: data };
}

const GUARD_REASON =
  "kind: bash-guard\nsummary: block rm -rf outside the workspace\ncommand: rm -rf /tmp/x\n";

describe("guardedApprovalsProjection.apply", () => {
  it("records a callId whose reason passes the bash-guard test", () => {
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: GUARD_REASON }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: { "call-1": true },
      outcomes: {},
      reasons: { "call-1": GUARD_REASON },
    });
  });

  it("records a callId from the shipped guard's plain-text reason", () => {
    // The format every real `approval/asked` event carries: plain text that
    // opens with "bash-guard:" and names the matched rules. It parses as
    // YAML, so it must be matched by prefix, not by the summary shape.
    var reason = 'bash-guard: the following command needs approval:\n\n  git push\n\nMatched rule(s):\n  • git (push): denied.\n';
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-2", reason }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: { "call-2": true },
      outcomes: {},
      reasons: { "call-2": reason },
    });
  });

  it("stores no reason for a non-guard approval", () => {
    // Every approval with a callId is folded (the decided badge serves all
    // of them); only the outline set stays bash-guard-only. An escalation
    // justification already has its own banner, so keeping it here would
    // show the same fact twice.
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: "please approve" }) as never);
    var view = guardedApprovalsProjection.view(state);
    expect(view).not.toBeNull();
    expect((view as { guarded: Record<string, boolean> }).guarded).toEqual({});
    expect((view as { outcomes: Record<string, string> }).outcomes).toEqual({});
    expect((view as { reasons: Record<string, string> }).reasons).toEqual({});
  });

  it("skips an event with a missing or empty callId", () => {
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", reason: GUARD_REASON }) as never);
    state = guardedApprovalsProjection.apply(state, askedEvent(5, { id: "a2", callId: "", reason: GUARD_REASON }) as never);
    expect(guardedApprovalsProjection.view(state)).toBeNull();
  });

  it("pairs a decision to its asked entry by id and keeps the guard mark", () => {
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: GUARD_REASON }) as never);
    state = guardedApprovalsProjection.apply(state, decidedEvent(5, { id: "a1", outcome: "approved" }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: { "call-1": true },
      outcomes: { "call-1": "approved" },
      reasons: { "call-1": GUARD_REASON },
    });
  });

  it("stores the host's real settle vocabulary verbatim", () => {
    // REGRESSION (owner report: "approval response rejected: bad-response").
    // The harness never writes "approved": dsh-user-approval appends
    // `approval/decided` with the value `decide` resolved, which on the web
    // path is the api-proxy settle vocabulary "allowed-once" | "rejected" |
    // "cancelled". The fold must pass those through untouched so the card can
    // map "allowed-once" to its "approved" label; the other tests' "approved"
    // string only exercises pass-through, it is not a real outcome.
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: GUARD_REASON }) as never);
    state = guardedApprovalsProjection.apply(state, askedEvent(6, { id: "a2", callId: "call-2", reason: GUARD_REASON }) as never);
    state = guardedApprovalsProjection.apply(state, decidedEvent(5, { id: "a1", outcome: "allowed-once" }) as never);
    state = guardedApprovalsProjection.apply(state, decidedEvent(7, { id: "a2", outcome: "cancelled" }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: { "call-1": true, "call-2": true },
      outcomes: { "call-1": "allowed-once", "call-2": "cancelled" },
      reasons: { "call-1": GUARD_REASON, "call-2": GUARD_REASON },
    });
  });

  it("pairs a rejected decision for a non-guard approval", () => {
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a9", callId: "call-3", reason: "please approve" }) as never);
    state = guardedApprovalsProjection.apply(state, decidedEvent(5, { id: "a9", outcome: "rejected" }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: {},
      outcomes: { "call-3": "rejected" },
      reasons: {},
    });
  });

  it("ignores a decision whose id never paired with an asked entry", () => {
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: GUARD_REASON }) as never);
    state = guardedApprovalsProjection.apply(state, decidedEvent(5, { id: "unknown", outcome: "approved" }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: { "call-1": true },
      outcomes: {},
      reasons: { "call-1": GUARD_REASON },
    });
  });

  it("ignores a second decision for an already-paired entry", () => {
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: GUARD_REASON }) as never);
    state = guardedApprovalsProjection.apply(state, decidedEvent(5, { id: "a1", outcome: "approved" }) as never);
    state = guardedApprovalsProjection.apply(state, decidedEvent(6, { id: "a1", outcome: "rejected" }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: { "call-1": true },
      outcomes: { "call-1": "approved" },
      reasons: { "call-1": GUARD_REASON },
    });
  });

  it("a re-ask of the same callId keeps the guard mark sticky and takes the latest decision", () => {
    // The exact sequence a same-callId re-ask produces: a guarded ask is
    // decided, then a NON-guard approval re-asks the same callId, then that
    // one is decided too. Guarded must stay true (a later non-guard ask
    // never un-guards), and outcomes must reflect the LATEST decision, not
    // the first — the re-ask cleared the stale outcome.
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: GUARD_REASON }) as never);
    state = guardedApprovalsProjection.apply(state, decidedEvent(5, { id: "a1", outcome: "rejected" }) as never);
    state = guardedApprovalsProjection.apply(state, askedEvent(6, { id: "a2", callId: "call-1", reason: "please approve" }) as never);
    state = guardedApprovalsProjection.apply(state, decidedEvent(7, { id: "a2", outcome: "approved" }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: { "call-1": true },
      outcomes: { "call-1": "approved" },
      // The stored guard reason is sticky too: the later non-guard ask
      // never clears it, mirroring the guard mark.
      reasons: { "call-1": GUARD_REASON },
    });
  });

  it("a re-ask clears a stale outcome when the re-ask itself is never decided", () => {
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: "please approve" }) as never);
    state = guardedApprovalsProjection.apply(state, decidedEvent(5, { id: "a1", outcome: "rejected" }) as never);
    state = guardedApprovalsProjection.apply(state, askedEvent(6, { id: "a2", callId: "call-1", reason: "please approve" }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: {},
      outcomes: {},
      reasons: {},
    });
  });

  it("refreshes the stored reason when a guard approval re-asks the same callId", () => {
    var first = "kind: bash-guard\nsummary: first ask\nruns: ls\n";
    var second = "kind: bash-guard\nsummary: second ask\nruns: ls\n";
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: first }) as never);
    state = guardedApprovalsProjection.apply(state, askedEvent(6, { id: "a2", callId: "call-1", reason: second }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: { "call-1": true },
      outcomes: {},
      reasons: { "call-1": second },
    });
  });

  it("caps a stored guard reason so a rule dump cannot live in state unbounded", () => {
    var long = "kind: bash-guard\nsummary: " + "x".repeat(3000) + "\nruns: ls\n";
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "a1", callId: "call-1", reason: long }) as never);
    var view = guardedApprovalsProjection.view(state);
    expect(view).not.toBeNull();
    var reasons = (view as { reasons: Record<string, string> }).reasons;
    expect(reasons["call-1"]).toBe(long.slice(0, 2000));
  });

  it("caps the map at the most recent entries by seq", async () => {
    var state = guardedApprovalsProjection.init();
    for (var i = 0; i < 210; i++) {
      state = guardedApprovalsProjection.apply(state, askedEvent(i, { id: "a" + i, callId: "call-" + i, reason: GUARD_REASON }) as never);
    }
    var view = guardedApprovalsProjection.view(state);
    expect(view).not.toBeNull();
    var typed = view as { guarded: Record<string, boolean>; outcomes: Record<string, string> };
    expect(Object.keys(typed.guarded)).toHaveLength(200);
    expect(typed.guarded["call-9"]).toBeUndefined();
    expect(typed.guarded["call-209"]).toBe(true);
    // A decision for an entry the cap already evicted cannot pair.
    state = guardedApprovalsProjection.apply(state, decidedEvent(300, { id: "a5", outcome: "approved" }) as never);
    view = guardedApprovalsProjection.view(state);
    expect((view as { outcomes: Record<string, string> }).outcomes["call-5"]).toBeUndefined();
    // A decision for a live entry pairs.
    state = guardedApprovalsProjection.apply(state, decidedEvent(301, { id: "a209", outcome: "rejected" }) as never);
    view = guardedApprovalsProjection.view(state);
    expect((view as { outcomes: Record<string, string> }).outcomes["call-209"]).toBe("rejected");
  });

  it("keeps STATE losslessly JSON-serializable, with no present-but-undefined keys (#127)", () => {
    // The STATE, not the view, is what gets checkpointed, and that contract is
    // stricter than JSON.stringify: it REJECTS undefined rather than dropping
    // the key. One `{guarded: undefined}` failed the checkpoint write for
    // every unit in the session, 1473 times in six hours, and the cache never
    // healed. The view was always clean, which is exactly why nothing outside
    // the journal ever complained -- so this asserts on state.
    var state = guardedApprovalsProjection.init();
    // The common case is the poisonous one: a NON-guard approval with no id.
    state = guardedApprovalsProjection.apply(
      state,
      askedEvent(1, { callId: "call-plain", reason: "just some prose" }) as never,
    );
    // A guard approval, which sets the optional fields for real.
    state = guardedApprovalsProjection.apply(
      state,
      askedEvent(2, { id: "a2", callId: "call-guard", reason: GUARD_REASON }) as never,
    );
    // A re-ask, which rebuilds an existing entry in place.
    state = guardedApprovalsProjection.apply(
      state,
      askedEvent(3, { callId: "call-guard", reason: "not a guard reason" }) as never,
    );
    // A decision, which spreads an existing entry into a new one.
    state = guardedApprovalsProjection.apply(
      state,
      decidedEvent(4, { id: "a2", outcome: "approved" }) as never,
    );

    expect(state.entries.length).toBeGreaterThan(0);
    for (const entry of state.entries) {
      for (const [key, value] of Object.entries(entry)) {
        // Checking the VALUE of every present key is the real test:
        // JSON.stringify silently drops an undefined-valued key, so the
        // round-trip assertion below is necessary but not sufficient alone.
        expect(value, `entry key "${key}" is present but undefined`).not.toBe(undefined);
      }
    }
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("is at state version 5 so the shape-poisoned sticky marks are replayed", () => {
    // Fixing the classifier does not clean sessions that already rendered an
    // escalation: their guarded[callId] is sticky-durable. The bump forces a
    // replay under the kind-keyed test, clearing the poisoned marks.
    expect(guardedApprovalsProjection.stateVersion).toBe(5);
  });

  it("never marks an escalation approval, however it decides", () => {
    // The #105 acceptance shape: the YAML our own wrapper sends for a
    // sandbox escalation must not enter the guarded set — approved or
    // rejected alike. The decision still pairs for the decided badge.
    var escalation =
      "kind: escalation\nsummary: 'bash-guard: escalate from \"workspace-write\" to \"danger-full-access\"'\njustification: write the probe file\nruns: echo probe > ~/probe.txt\n";
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "e1", callId: "call-esc", reason: escalation }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: {},
      outcomes: {},
      reasons: {},
    });
    state = guardedApprovalsProjection.apply(state, decidedEvent(5, { id: "e1", outcome: "rejected" }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: {},
      outcomes: { "call-esc": "rejected" },
      reasons: {},
    });
  });

  it("never marks the host's plain-string escalation approval", () => {
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "h1", callId: "call-host", reason: "escalate sandbox to danger-full-access: install the bundles" }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: {},
      outcomes: {},
      reasons: {},
    });
  });

  it("stays un-guarded when a call's only guard-shaped past is an old kind-less escalation", () => {
    // The pre-kind escalation YAML from real logs: summary-shaped, but an
    // escalation. The strict test refuses it, so the replay heals it.
    var old = "summary: 'bash-guard: escalate from \"workspace-write\" to \"danger-full-access\"'\njustification: write the probe file\nruns: echo probe > ~/probe.txt\n";
    var state = guardedApprovalsProjection.init();
    state = guardedApprovalsProjection.apply(state, askedEvent(4, { id: "o1", callId: "call-old", reason: old }) as never);
    expect(guardedApprovalsProjection.view(state)).toEqual({
      guarded: {},
      outcomes: {},
      reasons: {},
    });
  });
});
