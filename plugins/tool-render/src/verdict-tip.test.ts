/**
 * Unit tests for the verdict-badge tooltip helpers in verdict-tip.ts. These
 * cover string composition only: no React render, no DOM, no snapshots.
 */
import { describe, expect, it } from "vitest";
import { stringify } from "yaml";
import { isBashGuardReason } from "./guard";
import {
  VERDICT_TIP_LINE_MAX,
  composeVerdictTooltip,
  guardRewriteTipLine,
  singleLineTipText,
  summariseGuardPromptReason,
} from "./verdict-tip";

describe("composeVerdictTooltip", () => {
  it("renders both reasons as two labelled lines in one tooltip", () => {
    expect(
      composeVerdictTooltip("rewrote arguments to rg -n foo", "this command changes files."),
    ).toBe("Rewrite: rewrote arguments to rg -n foo\nPrompt: this command changes files.");
  });

  it("renders a rewrite-only tooltip as one labelled line", () => {
    expect(composeVerdictTooltip("translated to rg grep -n foo", null)).toBe(
      "Rewrite: translated to rg grep -n foo",
    );
  });

  it("renders a prompt-only tooltip as one labelled line", () => {
    expect(composeVerdictTooltip(null, "this command needs your approval.")).toBe(
      "Prompt: this command needs your approval.",
    );
  });

  it("yields no tooltip when neither reason exists", () => {
    // Null, undefined, blank, and non-string inputs all mean "no reason" —
    // the render site then sets no title attribute at all.
    expect(composeVerdictTooltip(null, null)).toBe(null);
    expect(composeVerdictTooltip(undefined, undefined)).toBe(null);
    expect(composeVerdictTooltip("", "   ")).toBe(null);
    expect(composeVerdictTooltip(42 as never, {} as never)).toBe(null);
  });

  it("keeps a reason containing a colon or newline inside its own line", () => {
    // Nothing here splits on colons, and newlines collapse before joining,
    // so the two-line structure cannot break no matter what the reasons
    // carry — justifications narrate changes with colons routinely.
    expect(
      composeVerdictTooltip(
        "rewrote arguments to rg -n foo: bar",
        "Third part of the requested change: adds the handlers\nsecond line here",
      ),
    ).toBe(
      "Rewrite: rewrote arguments to rg -n foo: bar\nPrompt: Third part of the requested change: adds the handlers second line here",
    );
  });

  it("caps a long line with an ellipsis instead of dumping a transcript", () => {
    var long = "x".repeat(VERDICT_TIP_LINE_MAX + 50);
    var tip = composeVerdictTooltip(long, "short");
    expect(tip).not.toBe(null);
    var lines = (tip as string).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].length).toBeLessThanOrEqual("Rewrite: ".length + VERDICT_TIP_LINE_MAX);
    expect(lines[0].endsWith("…")).toBe(true);
    expect(lines[1]).toBe("Prompt: short");
  });
});

describe("guardRewriteTipLine", () => {
  it("shares the expanded banner's label for an argument-level rewrite", () => {
    // Same first token: the banner says "rewrote arguments to".
    expect(guardRewriteTipLine("rg -n foo", "rg -n foo --hidden")).toBe(
      "rewrote arguments to rg -n foo --hidden",
    );
  });

  it("shares the expanded banner's label when the binary changed", () => {
    expect(guardRewriteTipLine("grep -n foo", "rg -n foo bar")).toBe(
      "translated to rg rg -n foo bar",
    );
  });

  it("keeps the generic label for unreadable input, like the banner", () => {
    expect(guardRewriteTipLine(undefined, "rg -n foo")).toBe("ran instead rg -n foo");
    expect(guardRewriteTipLine("", "")).toBe(null);
  });

  it("yields no line when no rewrite was recorded", () => {
    expect(guardRewriteTipLine("ls", null)).toBe(null);
    expect(guardRewriteTipLine("ls", "")).toBe(null);
    expect(guardRewriteTipLine("ls", 42 as never)).toBe(null);
  });
});

describe("summariseGuardPromptReason", () => {
  it("reads the human summary out of the guard's YAML payload", () => {
    // Built with the same stringify the guard uses, so this is the actual
    // YAML shape — not a hand-written approximation of it.
    var reason = stringify({
      summary: "bash-guard: this command runs in a different form.",
      wrote: "grep -n foo",
      runs: "rg -n foo",
      why: "grep is translated to rg and the rg form is what runs.",
    });
    expect(summariseGuardPromptReason(reason)).toBe(
      "bash-guard: this command runs in a different form.",
    );
  });

  it("renders the first line of the shipped plain-text guard reason", () => {
    // The format every real approval/asked event carries in the session log.
    var reason =
      "bash-guard: the following command needs approval:\n\n  git push\n\nMatched rule(s):\n  • git (push): denied.\n";
    expect(summariseGuardPromptReason(reason)).toBe(
      "bash-guard: the following command needs approval:",
    );
  });

  it("renders nothing for a non-guard reason", () => {
    // An escalation justification has its own banner; foreign prose has the
    // approval strip. Echoing either here would show the same fact twice.
    expect(summariseGuardPromptReason("please approve")).toBe(null);
    expect(
      summariseGuardPromptReason("escalate sandbox to danger-full-access: run the migration"),
    ).toBe(null);
    expect(summariseGuardPromptReason(undefined)).toBe(null);
    expect(summariseGuardPromptReason(null)).toBe(null);
    expect(summariseGuardPromptReason(42)).toBe(null);
  });

  it("still summarises a capped blob whose cut kept the YAML parseable", () => {
    // The projection caps stored reasons at 2000 characters; a cut inside
    // a plain scalar still parses, so the summary survives the cap.
    var reason =
      "summary: block rm -rf outside the workspace\nruns: rm -rf /tmp/x\nwhy: " + "x".repeat(3000);
    expect(summariseGuardPromptReason(reason.slice(0, 2000))).toBe(
      "block rm -rf outside the workspace",
    );
  });

  it("fails silent when a cut leaves an unclosed quote behind", () => {
    // A cut inside a quoted scalar no longer parses AND no longer
    // classifies as guard-shaped, so there is no Prompt line. The cap can
    // only lose the line, never corrupt it into a wrong one.
    expect(summariseGuardPromptReason('summary: "block rm -rf outside the work')).toBe(null);
  });
});

describe("singleLineTipText", () => {
  it("collapses newlines, tabs, and repeats to one space", () => {
    expect(singleLineTipText("  a\n\n  b\tc  ")).toBe("a b c");
  });
});

describe("guard/escalation classification at the tooltip boundary (#105)", () => {
  it("does NOT classify the live escalation string as a guard reason", () => {
    // The host executor raises the plain string, which appears nowhere in
    // this repo as a producer — so the misclassification does not fire
    // today, and the tooltip renders no Prompt line for it.
    var live = "escalate sandbox to danger-full-access: run the migration";
    expect(isBashGuardReason(live)).toBe(false);
    expect(summariseGuardPromptReason(live)).toBe(null);
  });

  it("pins the latent misclassification: repo-built escalation YAML reads as guard", () => {
    // bash-guard.ts builds its (currently dead) escalation prompt as YAML
    // carrying a `summary` key — exactly the shape the classifier treats as
    // TRUE. If that branch ever executes against a client surfacing its
    // reasons, the tooltip WOULD render the escalation summary as its
    // Prompt line. Pinned here as the known trap, not absorbed silently.
    var yaml = stringify({
      summary: 'bash-guard: escalate from "read-only" to "workspace-write"',
      justification: "need to write the migration",
      runs: "npx migrate",
    });
    expect(isBashGuardReason(yaml)).toBe(true);
    expect(summariseGuardPromptReason(yaml)).toBe(
      'bash-guard: escalate from "read-only" to "workspace-write"',
    );
  });
});
