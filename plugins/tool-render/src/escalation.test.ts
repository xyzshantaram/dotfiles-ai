/**
 * Unit tests for the sandbox-escalation helpers in escalation.ts. These
 * cover string parsing only: no React render, no DOM, no snapshots.
 */
import { describe, expect, it } from "vitest";
import {
  ESCALATION_LABEL,
  ESCALATION_LABEL_SETTLED,
  escalationDetailOf,
  escalationLabel,
  escalationReasonClassName,
  splitEscalationReason,
} from "./escalation";

describe("ESCALATION_LABEL", () => {
  it("reads exactly as the ticket criteria require", () => {
    expect(ESCALATION_LABEL).toBe("agent requests sandbox access escalation");
  });

  it("settles into the past tense", () => {
    expect(ESCALATION_LABEL_SETTLED).toBe("agent requested sandbox access escalation");
  });
});

describe("escalationLabel / escalationReasonClassName", () => {
  it("drives tense and prominence from the SAME settled/open signal", () => {
    // One boolean in, both out — so they can never disagree.
    expect(escalationLabel(false)).toBe(ESCALATION_LABEL);
    expect(escalationLabel(true)).toBe(ESCALATION_LABEL_SETTLED);
    expect(escalationReasonClassName(false)).toBe("tool-render-escalation-reason");
    expect(escalationReasonClassName(true)).toBe(
      "tool-render-escalation-reason tool-render-escalation-reason-muted",
    );
  });

  it("settles approved and rejected alike — the trigger is settledness", () => {
    // No outcome parameter exists: settled is settled, either way it went.
    expect(escalationLabel.length).toBe(1);
    expect(escalationReasonClassName.length).toBe(1);
  });
});

describe("splitEscalationReason", () => {
  it("splits the machine string into mode and justification", () => {
    expect(
      splitEscalationReason("escalate sandbox to danger-full-access: run the migration"),
    ).toEqual({ mode: "danger-full-access", justification: "run the migration" });
  });

  it("keeps a justification that itself contains a colon intact", () => {
    // This WILL happen (justifications narrate changes), so a naive split
    // on ":" must not corrupt it: only the FIRST colon separates.
    expect(
      splitEscalationReason(
        "escalate sandbox to danger-full-access: Third part of the requested change: adds the handlers",
      ),
    ).toEqual({
      mode: "danger-full-access",
      justification: "Third part of the requested change: adds the handlers",
    });
  });

  it("rejects anything that is not the escalation shape", () => {
    expect(splitEscalationReason("run the migration")).toBe(null);
    expect(splitEscalationReason("escalate sandbox to danger-full-access")).toBe(null);
    expect(splitEscalationReason("escalate sandbox to danger-full-access: ")).toBe(null);
    expect(splitEscalationReason("")).toBe(null);
    expect(splitEscalationReason(undefined)).toBe(null);
    expect(splitEscalationReason(null)).toBe(null);
    expect(splitEscalationReason(42 as never)).toBe(null);
  });
});

describe("escalationDetailOf", () => {
  it("reads mode and justification from the durable args", () => {
    expect(
      escalationDetailOf({
        command: "npx vitest run",
        sandbox_permissions: "danger-full-access",
        justification: "Third part of the requested change",
      }),
    ).toEqual({ mode: "danger-full-access", justification: "Third part of the requested change" });
  });

  it("keeps a justification containing a colon verbatim", () => {
    // Structured args never need splitting, so the colon survives for free.
    expect(
      escalationDetailOf({
        command: "npx vitest run",
        sandbox_permissions: "danger-full-access",
        justification: "Third part of the requested change: adds the handlers",
      }),
    ).toEqual({
      mode: "danger-full-access",
      justification: "Third part of the requested change: adds the handlers",
    });
  });

  it("consumes the machine-string prefix when the justification wears it", () => {
    expect(
      escalationDetailOf({
        command: "npx vitest run",
        sandbox_permissions: "danger-full-access",
        justification:
          "escalate sandbox to danger-full-access: Third part of the requested change: adds the handlers",
      }),
    ).toEqual({
      mode: "danger-full-access",
      justification: "Third part of the requested change: adds the handlers",
    });
  });

  it("produces no label for a call that was never an escalation", () => {
    expect(escalationDetailOf({ command: "ls", description: "list" })).toBe(null);
    expect(escalationDetailOf({ command: "ls", sandbox_permissions: "unlimited" })).toBe(null);
    expect(escalationDetailOf(null)).toBe(null);
    expect(escalationDetailOf(undefined)).toBe(null);
    expect(escalationDetailOf("escalate sandbox to danger-full-access: x" as never)).toBe(null);
  });

  it("produces no label when the justification is missing or blank", () => {
    expect(escalationDetailOf({ command: "ls", sandbox_permissions: "danger-full-access" })).toBe(
      null,
    );
    expect(
      escalationDetailOf({
        command: "ls",
        sandbox_permissions: "danger-full-access",
        justification: "   ",
      }),
    ).toBe(null);
  });

  it("still excludes a bash-guard reason from this surface", () => {
    // The guard banner already renders it readably on the same card, so
    // echoing it here would show the same fact twice, once as noise.
    expect(
      escalationDetailOf({
        command: "rm -rf /tmp/x",
        sandbox_permissions: "danger-full-access",
        justification: 'bash-guard: this command changes files\nruns: rm -rf /tmp/x',
      }),
    ).toBe(null);
  });
});
