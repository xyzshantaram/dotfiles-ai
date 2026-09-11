/**
 * Badge tone tests (#135).
 *
 * The priority rule is the load-bearing part. A session can genuinely have a
 * pending escalation, a pending rewrite ask and a pending question at once,
 * and one badge has one colour — so something must be out-ranked. The trap
 * this guards is the one #132 had to undo: a signal that silently ERASES
 * another. Out-ranked for colour is fine; invisible is not, which is why the
 * count is asserted to stay independent of the tone.
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { approvalToneOf, badgeCount, badgeToneOf, badgeVisible } from "./badge";
import { RING_FADE_MS } from "./questions";

/** A stamped bash-guard rule/rewrite ask, as the guard writes it. */
const REWRITE = "kind: bash-guard\nsummary: 'bash-guard: this command changes files.'\nruns: rm x\n";
/** The host's prose escalation prompt. */
const ESCALATION = 'escalate sandbox to danger-full-access for this call';

describe("approvalToneOf classifies through the single-source predicates", () => {
  it("reads a guard rewrite as rewrite", () => {
    expect(approvalToneOf(REWRITE)).toBe("rewrite");
  });

  it("reads a host escalation as escalated", () => {
    expect(approvalToneOf(ESCALATION)).toBe("escalated");
  });

  it("keeps an UNCLASSIFIABLE approval as an approval, never none", () => {
    // This is the important degenerate case. An approval we cannot classify
    // is still blocking an agent, so it must out-rank a question and must
    // never fall through to "nothing pending".
    for (const reason of [undefined, null, "", "some unrecognised prose", 42, {}]) {
      expect(approvalToneOf(reason)).toBe("approval");
    }
  });
});

describe("badgeToneOf: approvals outrank questions, escalation outranks rewrite", () => {
  it("shows nothing when nothing is pending", () => {
    expect(badgeToneOf([], 0)).toBe("none");
  });

  it("shows the question tone when only questions wait", () => {
    expect(badgeToneOf([], 2)).toBe("question");
  });

  it("prefers ANY approval over a question", () => {
    // An unanswered approval blocks an agent mid-command; a question does
    // not. That asymmetry is the whole justification for the ordering.
    expect(badgeToneOf([REWRITE], 5)).toBe("rewrite");
    expect(badgeToneOf([ESCALATION], 5)).toBe("escalated");
    expect(badgeToneOf(["unrecognised"], 5)).toBe("approval");
  });

  it("prefers an escalation over a rewrite ask", () => {
    // An escalation grants wider sandbox access — the more consequential
    // decision of the two when both are waiting.
    expect(badgeToneOf([REWRITE, ESCALATION], 0)).toBe("escalated");
    expect(badgeToneOf([ESCALATION, REWRITE], 0)).toBe("escalated");
  });

  it("prefers a classified rewrite over an unclassifiable approval", () => {
    expect(badgeToneOf(["unrecognised", REWRITE], 0)).toBe("rewrite");
  });

  it("is order-independent: the worst kind wins wherever it sits", () => {
    const kinds = [REWRITE, ESCALATION, "unrecognised"];
    for (let i = 0; i < kinds.length; i++) {
      const rotated = kinds.slice(i).concat(kinds.slice(0, i));
      expect(badgeToneOf(rotated, 3)).toBe("escalated");
    }
  });
});

describe("the count never hides an out-ranked kind", () => {
  it("counts everything pending, across kinds", () => {
    // THE #132 TRAP, in a new place: the colour reports the most urgent kind
    // while the count reports the total. If the count tracked only the
    // winning kind, a pending question would vanish behind an approval.
    expect(badgeCount(2, 3)).toBe(5);
    expect(badgeCount(1, 0)).toBe(1);
    expect(badgeCount(0, 4)).toBe(4);
  });

  it("is independent of which tone won", () => {
    const approvals = [ESCALATION, REWRITE];
    expect(badgeToneOf(approvals, 3)).toBe("escalated");
    // Two approvals plus three questions is still five things waiting.
    expect(badgeCount(approvals.length, 3)).toBe(5);
  });

  it("never reports a negative count from malformed input", () => {
    expect(badgeCount(-1, -1)).toBe(0);
  });
});

describe("badgeVisible keeps the confirmation window", () => {
  it("is visible while anything is pending", () => {
    expect(badgeVisible("rewrite", false)).toBe(true);
    expect(badgeVisible("question", false)).toBe(true);
  });

  it("stays visible during the confirmation window after the last answer", () => {
    // #106's intent, preserved: an answered item confirms briefly rather
    // than the badge vanishing under the cursor mid-click.
    expect(badgeVisible("none", true)).toBe(true);
  });

  it("disappears once nothing is pending and the window has closed", () => {
    expect(badgeVisible("none", false)).toBe(false);
  });
});

describe("CSS/TS drift", () => {
  it("the badge fade literal in client.module.css equals RING_FADE_MS", async () => {
    // Nothing writes --dsh-badge-fade inline, so the CSS fallback literal IS
    // the badge's fade duration. If it drifts from RING_FADE_MS the badge
    // fades at a different speed than the timer that schedules the fade —
    // the same hazard the old ring code's "must match it" comment guarded,
    // restated as a test (#135 review note).
    const css = await readFile(
      join(dirname(fileURLToPath(import.meta.url)), "client.module.css"),
      "utf8",
    );
    const hits = css.match(/--dsh-badge-fade,\s*\d+ms/g) ?? [];
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) expect(hit).toContain(`${RING_FADE_MS}ms`);
  });
});
