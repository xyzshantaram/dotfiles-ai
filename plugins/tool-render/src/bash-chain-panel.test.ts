/**
 * Unit tests for the #165 chain panel in bash-diagram.ts / client.tsx.
 * String parsing and model building only, plus source-structure pins:
 * no React render, no DOM, no snapshots.
 *
 * The regrouping is VIEW-ONLY: the model is untouched, so per-row identity
 * (conditional) and the exit-code attachment points (per-stage exitCode)
 * survive by construction — and are pinned below at the seam that carries
 * them into the panel. The wiring tests at the bottom pin that the view
 * CALLS the seam; like their #162/#164 siblings they are source-structure
 * assertions and say so plainly, for the same reason: this repo has no jsdom
 * and no react-dom, and adding one is outside this ticket's allowlist. If a
 * render harness ever lands, the wiring tests should be REPLACED by tests
 * that render a chain and assert one panel with N part cards, per-part
 * markers, and per-part exit pills — not kept alongside them.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  chainPanelRows,
  clearBashSequenceCache,
  getBashSequenceDiagram,
  reconstructBashSequence,
  verifyBashSequence,
  type BashSequenceChainGroup,
  type BashSequenceDiagram,
} from "./bash-diagram";

function draw(command: string): BashSequenceDiagram {
  const model = getBashSequenceDiagram(command);
  expect(model).not.toBeNull();
  if (model === null) throw new Error("unreachable");
  return model;
}

function chainOf(command: string): BashSequenceChainGroup {
  const model = draw(command);
  const group = model.statements.find((s) => s.kind === "chain");
  if (group === undefined || group.kind !== "chain") throw new Error("expected a chain group");
  return group.chain;
}

describe("chainPanelRows: the panel's per-part view models", () => {
  it("hands every row through the seam with its own condition, base bare", () => {
    // Criterion 2a: the marker attaches ONLY to the dependent part. The base
    // runs unconditionally, so a panel-wide marker would state something
    // FALSE about it — the base part's null must reach the card as null.
    const chain = chainOf("a && b && c; d | e");
    const parts = chainPanelRows(chain);
    expect(parts).toHaveLength(3);
    expect(parts.map((p) => p.conditional)).toEqual([null, "&&", "&&"]);
  });

  it("keeps mixed operators per part, never collapsed to one panel marker", () => {
    const parts = chainPanelRows(chainOf("a | b; c && d || e"));
    expect(parts.map((p) => p.conditional)).toEqual([null, "&&", "||"]);
  });

  it("carries each part's stages, arrows and gaps through untouched", () => {
    const chain = chainOf("a | b; c && d | e");
    const parts = chainPanelRows(chain);
    expect(parts[0].kind).toBe("command");
    expect(parts[1].kind).toBe("pipeline");
    // The pipe INSIDE the dependent part keeps its own typed arrow: the
    // regrouping moves rows, never rebuilds them.
    expect(parts[1].arrows.map((a) => a.operator)).toEqual(["|"]);
    expect(parts[1].stages.map((s) => s.words)).toEqual(["d", "e"]);
    expect(parts[0].stages).toBe(chain.rows[0].stages);
    expect(parts[1].arrows).toBe(chain.rows[1].arrows);
  });

  it("gives every part its own exit-code place, with no leakage across parts", () => {
    // Criterion 2b: #143/#144 capture a code PER STATEMENT, so each part
    // must still have somewhere to carry its own. (In practice
    // attributeSequenceStages leaves chain rows uncoded — a conditional
    // script disqualifies naming host-side — so the codes are set by hand
    // here to prove the PLACE, not the pipeline.)
    clearBashSequenceCache();
    const chain = chainOf("a && b && c; d | e");
    chain.rows[1].stages[0].exitCode = 3;
    const parts = chainPanelRows(chain);
    expect(parts[0].stages.map((s) => s.exitCode)).toEqual([undefined]);
    expect(parts[1].stages.map((s) => s.exitCode)).toEqual([3]);
    expect(parts[2].stages.map((s) => s.exitCode)).toEqual([undefined]);
    clearBashSequenceCache();
  });
});

describe("the view is WIRED to the panel seam, not around it", () => {
  // Same honesty note as the seam tests above and the #162/#164 wiring pins:
  // these pin structure because no render harness exists — they cannot prove
  // a panel is painted, only that no branch has gone back to hand-rolling
  // per-row view objects, which is the defect class every review found.
  const view = readFileSync(new URL("./client.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("./client.module.css", import.meta.url), "utf8");

  it("the sequence renderer hands a chain to exactly one BashChainPanel", () => {
    const panels = view.match(/<BashChainPanel\s+chain=\{/g) ?? [];
    expect(panels).toHaveLength(1);
  });

  it("the panel builds its parts through chainPanelRows, never inline", () => {
    // Anchored to the CODE call (`= chainPanelRows(chain)`), not the bare
    // string: the panel's own comment names the seam, so a plain toContain
    // stays green while the call is gone — the M3 mutant proved it, the same
    // way #164's bare `role="tab"` match once stayed green on its mutant.
    const seamCalls = view.match(/=\s*chainPanelRows\(chain\)/g) ?? [];
    expect(seamCalls).toHaveLength(1);
    expect(view).toContain("model={parts[r]}");
    // Whole-file ceiling: the plain-diagram branch, the panel, and #164's
    // Graph-tab body (model={diagram}) are the only BashCommandDiagram sites
    // — three before this ticket, three after. A fourth site is a branch gone
    // around the seam and reddens here.
    const sites = view.match(/<BashCommandDiagram\s/g) ?? [];
    expect(sites).toHaveLength(3);
  });

  it("the conditional marker is painted in exactly one place: inside the part card", () => {
    // className="tool-render-diagram-conditional" lives in BashCommandDiagram,
    // which the panel renders once PER PART — so each dependent part carries
    // its own marker and the base carries none. A second paint site (a
    // panel-wide marker) would state something false about the base and
    // reddens here. Comment mentions of the class name do not match: the
    // quotes anchor this to the JSX attribute.
    const paints = view.match(/className="tool-render-diagram-conditional"/g) ?? [];
    expect(paints).toHaveLength(1);
  });

  it("in-panel separators vanish when contentless; sequence separators keep the rail", () => {
    // The card stack itself is the in-panel boundary; an empty rail div would
    // paint a second connector saying the same thing.
    expect(view).toContain("hideWhenEmpty={true}");
    // The sequence-level boundary keeps #162's deliberate rail: exactly one
    // separator site passes hideWhenEmpty (the panel's), the statement-level
    // site does not.
    const chromeless = view.match(/hideWhenEmpty=\{/g) ?? [];
    expect(chromeless).toHaveLength(1);
    expect(view).toContain("props.hideWhenEmpty");
  });

  it("the flow names its stage count for the single-stage hug rule", () => {
    expect(view).toContain("data-stages={model.stages.length}");
  });
});

describe("the panel's CSS voice: card style reused, stage chrome removed", () => {
  // Source assertions again, same honesty note: without a render harness
  // nothing here proves paint — only that the rules exist with the values
  // the criteria name. A screenshot test in a live browser would replace
  // these, not join them.
  const css = readFileSync(new URL("./client.module.css", import.meta.url), "utf8");

  it("the panel and its parts reuse the run_code nested-card voice", () => {
    // Criterion 1 names .tool-render-card as the visual target: border-l2,
    // 0.75rem radius, layer-1 background, 0.15625rem vertical padding. The
    // panel takes the card's outline; the part takes the whole voice at a
    // nested radius — a reuse, not a third card style.
    expect(css).toContain(".tool-render-diagram-chainpanel");
    expect(css).toContain(".tool-render-diagram-part");
    const panel = css.slice(css.indexOf(".tool-render-diagram-chainpanel"));
    expect(panel).toContain("border: 1px solid var(--dsw-alias-border-l2)");
    expect(panel).toContain("border-radius: 0.75rem");
    const part = css.slice(css.indexOf(".tool-render-diagram-part {"));
    expect(part).toContain("background: var(--dsw-alias-bg-layer-1)");
    expect(part).toContain("padding: 0.15625rem 0.5rem");
  });

  it("stages inside a part go flat: the part owns the only outline", () => {
    // The "excessive outlining" was panel border + every stage's own border,
    // background and 0.375rem/0.5rem padding. Inside a part the stage box is
    // redundant with the part card, so it loses border, background and
    // padding — one outline level per drawn unit.
    expect(css).toContain(".tool-render-diagram-part .tool-render-diagram-stage");
    expect(css).toContain("border-color: transparent");
  });

  it("single-stage flows size to content instead of stretching (narrow #162-C1 reversal)", () => {
    // Criterion 4's dead space IS #162's equal-share flex on a row with
    // nothing to share with. The reversal is narrow on purpose: only
    // data-stages="1" hugs; multi-stage pipelines keep equal-share (pinned
    // next), because #162 spent that width deliberately. Scoped to the hug
    // rule's block, like the C0 pin below: bare substrings proved blind.
    const hugAt = css.indexOf('[data-stages="1"]');
    expect(hugAt).toBeGreaterThan(-1);
    expect(css.slice(hugAt, hugAt + 200)).toContain("flex: 0 1 auto");
  });

  it("equal-share and the nowrap pipe row survive for multi-stage pipelines (#162 C0 + C1)", () => {
    // Scoped to the RULE BLOCKS, not bare substrings: `flex-flow: row nowrap`
    // also appears on the sequence separator, so a bare toContain stays green
    // when the FLOW rule alone wraps — the M7 mutant proved it. The base
    // stage rule still shares width equally, and the flow still never wraps:
    // a wrapped pipe row is indistinguishable from a stacked sequence, so an
    // overlong pipeline scrolls instead.
    const flowRule = css.slice(css.indexOf(".tool-render-diagram-flow {"));
    expect(flowRule.slice(0, 300)).toContain("flex-flow: row nowrap");
    expect(flowRule.slice(0, 300)).toContain("overflow-x: auto");
    const stageRule = css.slice(css.indexOf(".tool-render-diagram-stage {"));
    expect(stageRule.slice(0, 600)).toContain("flex: 1 1 0%");
  });
});

describe("slice invariant: regrouped chains reconstruct byte-exactly", () => {
  // The model is untouched, so this is a guard rail, not a discovery: a
  // regrouping that reprints text is a regression no matter how good it
  // looks (criterion 5). Real session commands, not toy `a && b` cases —
  // the same fixtures criterion 4 measures.
  const corpus = [
    "a && b && c; d | e",
    "a | b; c && d | e",
    "a | b; c || d | e",
    "cd a || cd b; echo done",
    "git commit -m 'sp ace \"quoted\" inside'; echo done",
    'journalctl ... | rg ... | tail -8; echo "=== harness uptime ==="; ' +
      "ps -eo ... | rg ... | rg -v rg | head -1 | cut -c1-75",
  ];
  for (const command of corpus) {
    it(`reconstructs ${JSON.stringify(command.slice(0, 48))}`, () => {
      const model = getBashSequenceDiagram(command);
      expect(model).not.toBeNull();
      if (model === null) return;
      expect(verifyBashSequence(command, model)).toBe(true);
      expect(reconstructBashSequence(command, model)).toBe(command);
    });
  }
});
