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

  it("in-panel separators vanish when contentless; sequence separators render rail-free", () => {
    // The card stack itself is the in-panel boundary; an empty rail div would
    // paint a second connector saying the same thing. #167 removed the
    // sequence-level rail as well (a connector between independent statements
    // implies a dependency that does not exist) — the statement boundary is
    // whitespace now, pinned in the CSS describe below.
    expect(view).toContain("hideWhenEmpty={true}");
    // The sequence-level boundary keeps #162's deliberate separation: exactly
    // one separator site passes hideWhenEmpty (the panel's), the
    // statement-level site does not.
    const chromeless = view.match(/hideWhenEmpty=\{/g) ?? [];
    expect(chromeless).toHaveLength(1);
    expect(view).toContain("props.hideWhenEmpty");
  });

  it("a comment riding the separator still renders verbatim (the rail removal must not take it)", () => {
    // The defect this pins: deleting the rail by deleting the whole branch.
    // The comment element's classes appear in exactly one JSX site — the
    // carriesContent branch — so removing that branch reddens here. Comment
    // mentions do not match: the quotes anchor this to the JSX attribute.
    const paints = view.match(/className="hljs tool-render-diagram-seq-sep-text"/g) ?? [];
    expect(paints).toHaveLength(1);
    expect(view).toContain("carriesContent");
  });

  it("the flow names its stage count for the single-stage hug rule", () => {
    expect(view).toContain("data-stages={model.stages.length}");
  });
});

/** Extract one rule's `{ ... }` block, anchored to `selector {` at a line
 *  start. Every CSS pin below asserts INSIDE the returned block: #165 proved
 *  bare-substring matches stay green on their own mutants (one matched its
 *  own comment text, two matched text outside the intended rule), so no pin
 *  here uses a whole-file substring for a value that appears anywhere else
 *  in this file. */
function ruleBlock(css: string, selector: string): string {
  const at = css.indexOf("\n" + selector + " {");
  expect(at).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  expect(close).toBeGreaterThan(open);
  return css.slice(open, close + 1);
}

describe("the #167 CSS voice: no rail, weighted panel, content widths", () => {
  // Source assertions again, same honesty note: without a render harness
  // nothing here proves paint — only that the rules exist with the values
  // the criteria name. A screenshot test in a live browser would replace
  // these, not join them.
  const css = readFileSync(new URL("./client.module.css", import.meta.url), "utf8");

  it("no rail between independent statements; the comment voice survives (criteria 1-2)", () => {
    // The connector is gone from the rule block: no border of any kind draws
    // here anymore — neither the old `border-left` rail nor a `border`
    // shorthand smuggled back in. The character class keeps `border-radius`
    // out of the match (no radius lives in this block, but the pin must not
    // be hostage to that).
    const sep = ruleBlock(css, ".tool-render-diagram-seq-sep");
    expect(sep).not.toMatch(/border(-left|-right|-top|-bottom)?\s*:/);
    // What must NOT be lost: a comment riding the separator still renders in
    // its muted voice — the sep-text rule keeps its tertiary color and
    // wrapping.
    const text = ruleBlock(css, ".tool-render-diagram-seq-sep-text");
    expect(text).toContain("color: var(--dsw-alias-label-tertiary)");
    expect(text).toContain("white-space: pre-wrap");
    // The boundary still breathes as whitespace: the empty separator keeps
    // its vertical rhythm, wider than the in-panel card gap.
    expect(sep).toContain("min-height: 0.375rem");
  });

  it("the outer panel is a weighted field, not an outline (criterion 3)", () => {
    // Criterion 5's token choice lands here: bg-base, the canvas layer-1
    // sits on in both themes. Block-scoped: bg-base appears fourteen times
    // in this file, so a bare match proves nothing.
    const panel = ruleBlock(css, ".tool-render-diagram-chainpanel");
    expect(panel).toContain("background: var(--dsw-alias-bg-base)");
    // No outline of any kind: neither a `border` shorthand nor a longhand.
    // `border-radius` is excluded from the match — it shapes the field and
    // is pinned present just below.
    expect(panel).not.toMatch(/border(-left|-right|-top|-bottom|-color|-style|-width)?\s*:/);
    // Radius and padding stay: they shape the field and inset the cards,
    // they draw no outline.
    expect(panel).toContain("border-radius: 0.75rem");
    expect(panel).toContain("padding: 0.375rem 0.5rem");
  });

  it("the command parts keep their outlines exactly (criterion 4)", () => {
    // Do not flatten, restyle, or "harmonise": the part block below repeats
    // every value #165 set, so any touch reddens here.
    const part = ruleBlock(css, ".tool-render-diagram-part");
    expect(part).toContain("border: 1px solid var(--dsw-alias-border-l2)");
    expect(part).toContain("border-radius: 0.5rem");
    expect(part).toContain("background: var(--dsw-alias-bg-layer-1)");
    expect(part).toContain("padding: 0.15625rem 0.5rem");
  });

  it("stages inside a part stay flat: the part owns the only outline", () => {
    // Block-scoped where the old pin was bare: "border-color: transparent"
    // matches three rules in this file, so the whole-file pin stayed green
    // with the descendant rule deleted.
    const flat = ruleBlock(css, ".tool-render-diagram-part .tool-render-diagram-stage");
    expect(flat).toContain("border-color: transparent");
    expect(flat).toContain("background: transparent");
    expect(flat).toContain("padding: 0");
  });

  it("stage width follows content, still spending the row (criterion 6)", () => {
    // `flex: 1 1 auto` keeps #162's grow (the row still fills the pane) but
    // sizes from content instead of zero — the sanctioned second narrowing
    // of #162's equal-share (see the rule's own trade comment). Block-scoped:
    // `flex: 1 1 auto` appears eight times in this file.
    const stage = ruleBlock(css, ".tool-render-diagram-stage");
    expect(stage).toContain("flex: 1 1 auto");
    expect(stage).not.toContain("flex: 1 1 0%");
  });

  it("single-stage flows still hug with no grow (the #165 narrowing, kept)", () => {
    // Block-scoped: `flex: 0 1 auto` appears three times counting the rule's
    // own trade comment, so the old fixed-window slice could match the
    // comment instead of the declaration.
    const hug = ruleBlock(css, '.tool-render-diagram-flow[data-stages="1"] .tool-render-diagram-stage');
    expect(hug).toContain("flex: 0 1 auto");
  });

  it("the pipe row never wraps and scrolls instead; equal height is deliberate (criteria 7-8)", () => {
    // Scoped to the flow rule block: `flex-flow: row nowrap` also appears on
    // the sequence separator, so a bare toContain stays green when the FLOW
    // rule alone wraps — the M7 mutant proved it. The flow still never
    // wraps: a wrapped pipe row is indistinguishable from a stacked
    // sequence, so an overlong pipeline scrolls instead. And criterion 8's
    // decision: boxes keep matching the row's tallest — the declaration is
    // the decision, since ragged bottoms would break the one-band read.
    const flow = ruleBlock(css, ".tool-render-diagram-flow");
    expect(flow).toContain("flex-flow: row nowrap");
    expect(flow).toContain("overflow-x: auto");
    expect(flow).toContain("align-items: stretch");
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
