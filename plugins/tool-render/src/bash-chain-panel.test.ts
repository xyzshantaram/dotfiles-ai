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

  it("the conditional chip shows the operator alone; the sentence lives in the tooltip", () => {
    // #168 criterion 4: the chip text is `{model.conditional}` and nothing
    // else — re-adding a painted sentence span (`<span>{why}</span>`)
    // reddens here, as does losing the operator. The sentence survives on
    // hover: the title still carries it, and the element opts into the
    // styled tooltip WITHOUT dropping the title (the plugin reads FROM
    // title and a screen reader announces it — one string, both surfaces).
    expect(view).toContain("<span>{model.conditional}</span>");
    expect(view).not.toContain("<span>{why}</span>");
    expect(view).toContain('title={"conditional step: " + why');
    const chipTips =
      view.match(/className="tool-render-diagram-conditional"[^>]*data-dsh-tip=""/g) ?? [];
    expect(chipTips).toHaveLength(1);
  });

  it("a bare chip row draws no stage box; earned boxes keep theirs", () => {
    // #168: the box goes away exactly when the stage is chips-only. The
    // predicate names all three conjuncts — dropping any one (redirects,
    // exit, chip-rendered) reddens its own line. One application site: a
    // second bare-class site is a branch going around the predicate.
    expect(view).toContain("stage.redirects.length === 0");
    expect(view).toContain("stage.exitCode === undefined");
    expect(view).toContain("stage.args.args.length > 1");
    const bares = view.match(/tool-render-diagram-stage-bare"/g) ?? [];
    expect(bares).toHaveLength(1);
  });

  it("the diagram opts into styled tooltips without touching other surfaces (criteria 5-6)", () => {
    // 4 pre-existing opt-ins (name badge, path option, agent id,
    // compaction text) plus the 9 diagram sites: heredoc x2, conditional,
    // time, !, arrow, argument chip, redirect endpoint, exit pill. The
    // COUNT pins both directions at once: a missed diagram site reads 12,
    // an out-of-scope conversion (verdict badge, sandbox mode, dismiss
    // button) reads 14. Every diagram opt-in keeps its title alongside the
    // marker — spot-pinned on the endpoint — so no conversion here may
    // bless moving the text out of `title` or adding a drifting aria-label.
    const tips = view.match(/data-dsh-tip=""/g) ?? [];
    expect(tips).toHaveLength(13);
    expect(view).toMatch(
      /className="tool-render-diagram-endpoint"[^>]*title=\{[^}]*\}[^>]*data-dsh-tip=""/,
    );
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
    // its vertical rhythm, wider than the in-panel card gap. #168 tightened
    // both proportionally (×2/3): separator 0.375→0.25rem, both gaps
    // 0.375→0.25rem — the boundary stays the wider of the two, pinned below.
    expect(sep).toContain("min-height: 0.25rem");
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

describe("the #168 CSS voice: conditional chip, earned boxes, tighter rhythm", () => {
  // Same honesty note as above: source assertions, not paint proofs. Every
  // pin is block-scoped through ruleBlock — four pins in this file first
  // passed against their own mutants on bare substrings, so no pin here
  // matches a value that also appears outside its rule.
  const css = readFileSync(new URL("./client.module.css", import.meta.url), "utf8");

  it("the conditional is a chip, visually distinct from an argument chip", () => {
    // Chip-sized (not the old full-line flex row), bold, dashed outline —
    // the solid-outline regular-weight argument chips answer it at a
    // glance. Block-scoped: `dashed` also describes the value chip and the
    // heredoc button, `700`/`inline-flex` appear nowhere else in this file
    // but the pin must not be hostage to that.
    const chip = ruleBlock(css, ".tool-render-diagram-conditional");
    expect(chip).toContain("display: inline-flex");
    expect(chip).toContain("font-weight: 700");
    expect(chip).toContain("border: 1px dashed var(--dsw-alias-border-l2)");
    expect(chip).toContain("padding: 0 0.375rem");
    expect(chip).toContain("margin-bottom: 0.25rem");
    // The old prominent-text row is gone: no wrapping flex row with a gap
    // for the painted sentence. `gap:` appears in a dozen rules, so the
    // absence is scoped to this block.
    expect(chip).not.toContain("gap:");
    expect(chip).not.toMatch(/font-weight:\s*600/);
  });

  it("a bare stage removes chrome, never layout", () => {
    // The earned-box rule removes border, background and padding — and
    // nothing else. Scoped where the old pin was bare: "border-color:
    // transparent" matches three rules, "background: transparent" and
    // "padding: 0" match several more. The negative pins keep a `border`
    // shorthand (or a margin/display/flex smuggle) from sneaking back in;
    // `border-radius` is excluded from the match, as in the panel pin.
    const bare = ruleBlock(css, ".tool-render-diagram-stage-bare");
    expect(bare).toContain("border-color: transparent");
    expect(bare).toContain("background: transparent");
    // Exact match with the semicolon: `padding: 0.375rem` also contains the
    // substring `padding: 0`, so a bare toContain stays green while the
    // padding is back — the M8 mutant proved it on this very pin.
    expect(bare).toMatch(/padding:\s*0\s*;/);
    expect(bare).not.toMatch(/border(-left|-right|-top|-bottom)?\s*:/);
    expect(bare).not.toContain("display:");
    expect(bare).not.toContain("margin");
  });

  it("tighter vertical rhythm, boundary still wider than the card gap", () => {
    // #168: both gaps tighten proportionally (×2/3) and the separator with
    // them — the BETWEEN-STATEMENT boundary must stay the wider of the two,
    // or independent statements stop reading as separate (#167). Measured
    // stack between adjacent statements: seq gap + separator box + seq gap
    // = 0.25 + (0.25 min-height + 0.125 padding) + 0.25 = 0.875rem, against
    // 0.25rem between in-panel cards. Reverting any one value reddens.
    const seq = ruleBlock(css, ".tool-render-diagram-seq");
    expect(seq).toContain("gap: 0.25rem");
    const sep = ruleBlock(css, ".tool-render-diagram-seq-sep");
    expect(sep).toContain("min-height: 0.25rem");
    expect(sep).not.toMatch(/border(-left|-right|-top|-bottom)?\s*:/);
    const panel = ruleBlock(css, ".tool-render-diagram-chainpanel");
    expect(panel).toContain("gap: 0.25rem");
    // The panel's voice is untouched by the tightening: still a weighted
    // field, still no outline, same radius and padding.
    expect(panel).toContain("background: var(--dsw-alias-bg-base)");
    expect(panel).toContain("border-radius: 0.75rem");
    expect(panel).toContain("padding: 0.375rem 0.5rem");
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
