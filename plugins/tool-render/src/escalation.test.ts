/**
 * Unit tests for the sandbox-escalation helpers in escalation.ts. These
 * cover string parsing only: no React render, no DOM, no snapshots.
 */
import { readFileSync } from "node:fs";
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

/**
 * The #177 outline matrix. This repo has no render harness, so these tests
 * read the stylesheet text directly and resolve the cascade the way the
 * browser does: collect every `.tool-render-card[...]` rule that paints an
 * outline, keep each rule's required and :not() excluded attributes, then
 * pick the winner by specificity with document order breaking ties. A
 * static snapshot cannot see the transition case below, but this resolver
 * can: the same settled marks flip colour when the pending mark changes.
 */
const outlineCss = readFileSync(new URL("./client.module.css", import.meta.url), "utf8");
const clientView = readFileSync(new URL("./client.tsx", import.meta.url), "utf8");

type OutlineRule = {
  selector: string;
  requires: string[];
  excludes: string[];
  color: string;
};

function outlineRules(css: string): OutlineRule[] {
  const found: OutlineRule[] = [];
  const ruleRe = /\.tool-render-card((?:\[[^\]]+\]|:not\(\[[^\]]+\]\))+)\s*\{([^}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = ruleRe.exec(css)) !== null) {
    const color = /outline:\s*([^;]+);/.exec(match[2]);
    if (color === null) continue;
    const head: string = match[1];
    const excludes: string[] = [];
    const plain = head.replace(/:not\(\[([^\]]+)\]\)/g, (whole: string, name: string) => {
      void whole;
      excludes.push(name);
      return "";
    });
    const requires: string[] = [];
    for (const attr of plain.matchAll(/\[([^\]]+)\]/g)) requires.push(attr[1]);
    found.push({ selector: ".tool-render-card" + head, requires, excludes, color: color[1].trim() });
  }
  return found;
}

function rankOf(rule: OutlineRule): number {
  // One class plus one point per attribute test. The :not() contents count
  // per the CSS rule, and repeats count, so the doubled guard selector
  // outranks every single-mark rule here.
  return 1 + rule.requires.length + rule.excludes.length;
}

function winningOutline(rules: OutlineRule[], attrs: string[]): string {
  let best: OutlineRule | null = null;
  for (const rule of rules) {
    if (!rule.requires.every((a) => attrs.includes(a))) continue;
    if (rule.excludes.some((a) => attrs.includes(a))) continue;
    if (best === null || rankOf(rule) >= rankOf(best)) best = rule;
  }
  // Later document order wins ties because the loop keeps replacing.
  expect(best, `no outline rule matches [${attrs.join(", ")}]`).not.toBeNull();
  return (best as OutlineRule).color;
}

describe("the #177 outline matrix: the open ask names the colour", () => {
  it("escalated only stays yellow", () => {
    expect(winningOutline(outlineRules(outlineCss), ["data-escalated"])).toContain(
      "var(--dsh-outline-escalated)",
    );
  });

  it("guard only stays blue", () => {
    expect(winningOutline(outlineRules(outlineCss), ["data-guard-approval"])).toContain(
      "var(--dsh-outline-guard)",
    );
  });

  it("a guard ask while open outlines guard blue", () => {
    // The durable mark rides along because an open guard approval feeds it
    // too, so the cell carries both marks, exactly like the live card.
    expect(
      winningOutline(outlineRules(outlineCss), ["data-guard-approval", "data-guard-pending"]),
    ).toContain("var(--dsh-outline-guard)");
  });

  it("an escalation ask while open outlines escalated yellow", () => {
    expect(
      winningOutline(outlineRules(outlineCss), ["data-escalated", "data-escalation-pending"]),
    ).toContain("var(--dsh-outline-escalated)");
  });

  it("both settled outlines escalated yellow, even when also guard approved", () => {
    // The defect cell: the old doubled guard rule won this pair at higher
    // specificity, so chip and outline disagreed.
    expect(
      winningOutline(outlineRules(outlineCss), ["data-escalated", "data-guard-approval"]),
    ).toContain("var(--dsh-outline-escalated)");
  });

  it("an open escalation ask wins over a durable guard mark", () => {
    // The rewrite-first sequence leaves a guard mark behind, then the
    // sandbox ask opens on top of it. The outline must name the open ask.
    expect(
      winningOutline(outlineRules(outlineCss), [
        "data-escalated",
        "data-guard-approval",
        "data-escalation-pending",
      ]),
    ).toContain("var(--dsh-outline-escalated)");
  });

  it("an open guard ask wins over a settled escalation mark", () => {
    // The reverse order proves no sequence assumption: if the guard ask is
    // the one open, the outline names it even beside a settled escalation.
    expect(
      winningOutline(outlineRules(outlineCss), [
        "data-escalated",
        "data-guard-approval",
        "data-guard-pending",
      ]),
    ).toContain("var(--dsh-outline-guard)");
  });

  it("guard approved plus errored but not escalated keeps the guard mark", () => {
    // The doubled-selector property from the stylesheet comment: a
    // rewritten command often exits non-zero, so durable blue must still
    // beat red. Losing to escalated must not mean losing to error.
    expect(
      winningOutline(outlineRules(outlineCss), ["data-guard-approval", "data-error"]),
    ).toContain("var(--dsh-outline-guard)");
  });

  it("escalated plus errored reads error red, exactly as before", () => {
    // Unchanged single-mark behaviour: the error rule follows the settled
    // escalation rule at equal specificity, so a failed call reads red.
    expect(winningOutline(outlineRules(outlineCss), ["data-escalated", "data-error"])).toContain(
      "var(--dsw-alias-state-error-primary)",
    );
  });

  it("error only and stopped only stay red", () => {
    expect(winningOutline(outlineRules(outlineCss), ["data-error"])).toContain(
      "var(--dsw-alias-state-error-primary)",
    );
    expect(winningOutline(outlineRules(outlineCss), ["data-stopped"])).toContain(
      "var(--dsw-alias-state-error-primary)",
    );
  });

  it("the outline moves when the open approval changes", () => {
    // The behaviour the owner asked for: one settled mark pair, two open
    // asks in turn. A static render of either state alone cannot prove the
    // colour tracks the ask, so this resolves both and compares.
    const rules = outlineRules(outlineCss);
    const settled = ["data-escalated", "data-guard-approval"];
    const guardOpen = winningOutline(rules, [...settled, "data-guard-pending"]);
    const escalationOpen = winningOutline(rules, [...settled, "data-escalation-pending"]);
    expect(guardOpen).toContain("var(--dsh-outline-guard)");
    expect(escalationOpen).toContain("var(--dsh-outline-escalated)");
    expect(escalationOpen).not.toBe(guardOpen);
  });
});

describe("the #177 pending seam: the card reads the open approval kind", () => {
  it("the card carries one pending mark per approval kind", () => {
    expect(clientView).toContain("data-guard-pending={options.guardPending || undefined}");
    expect(clientView).toContain(
      "data-escalation-pending={options.escalationPending || undefined}",
    );
  });

  it("both pending marks classify the same live open approval", () => {
    // The escalation branch is the negation of the guard test on the open
    // approval pendingApprovalOf returns, so arrival order cannot matter.
    // An escalation ask that arrives first still paints yellow.
    expect(clientView).toContain("pendingApprovalOf(snapshot, props.callId)");
    expect(clientView).toContain("return isBashGuardReason(payload.reason);");
    expect(clientView).toContain("return !isBashGuardReason(payload.reason);");
  });

  it("the BashRow threads both pending flags into the row options", () => {
    expect(clientView).toContain("guardPending: openGuardApproval");
    expect(clientView).toContain("escalationPending: openEscalationApproval");
  });
});

describe("the #177 stylesheet discipline", () => {
  it("no rule brute-forces the cascade with !important", () => {
    const withoutComments = outlineCss.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(withoutComments).not.toContain("!important");
  });

  it("no comment still promises blue for the both case", () => {
    expect(outlineCss).not.toContain("blue wins when a call is somehow both");
  });

  it("the #105 note records the fix instead of the open defect", () => {
    expect(outlineCss).not.toContain("until #105 lands");
    expect(outlineCss).toContain("#177");
  });
});
