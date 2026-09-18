// Row geometry: origin, gaps, hooks, and the named dagre delta.
//
// The chain engine (layoutRow) is the only layout engine in this module.
// The ticket report carries the evidence: across the whole corpus the chain
// reproduces dagre v1 x-coordinates, widths, splits, edges, and tags
// exactly; dagre adds exactly 11px of bottom slack per row (its margin
// semantics, unpriced by the DP). The second test below pins the chain side
// of that difference: a mutant restoring dagre-shaped slack goes red here.

import { describe, expect, it } from "vitest";
import { GAP, IND, NODE_M, PIPE_GAP, ROWGAP } from "./constants.js";
import { installStub, resetStats } from "./geometry.stub.js";
import { enforceGaps, layoutRow, planRows, type PlanItem } from "./layout.js";
import { svgRowHTML } from "./render.js";

describe("chain row geometry", () => {
  it("normalises to the border-edge origin with a NODE_M trailer (rounds 10.4, 11.3)", () => {
    // REJECTS trusting either engine x0 or dagre marginx: the leftmost
    // margin-box must start at the canvas edge (0) and the row must keep a
    // symmetric NODE_M trailing margin. Compares against the MARGIN value
    // would pass with borders at 20 vs 10 (round 10.4 lesson); this asserts
    // border edges, not margin numerals.
    const lay = layoutRow([
      { id: "a", w: 100, h: 50 },
      { id: "b", w: 200, h: 60 },
    ]);
    const left = Math.min(lay.pos.get("a")!.x - 50, lay.pos.get("b")!.x - 100);
    const right = Math.max(lay.pos.get("a")!.x + 50, lay.pos.get("b")!.x + 100);
    expect(left).toBe(0);
    expect(lay.W - right).toBe(NODE_M);
    expect(lay.engine).toBe("fallback-chain");
  });

  it("prices the chain bottom slack at 3px per row, not dagre 14px", () => {
    // REJECTS dagre-shaped slack: equal-height nodes centre at H/2 with
    // H = tallest+6, so the bottom margin H-maxB is exactly 3 (dagre marginy).
    // The prototype dagre branch hard-coded +14 there instead; the DP row
    // price (tallest+6 first, tallest+0 continuations) describes THIS height.
    const lay = layoutRow([
      { id: "a", w: 100, h: 50 },
      { id: "b", w: 200, h: 50 },
    ]);
    expect(lay.H).toBe(56);
    const maxB = Math.max(lay.pos.get("a")!.y + 25, lay.pos.get("b")!.y + 25);
    expect(lay.H - maxB).toBe(3);
  });

  it("meets per-adjacency gaps and never shifts left (round 10)", () => {
    // REJECTS uniform (n-1)*GAP pricing: a pipe adjacency must span PIPE_GAP
    // while neighbours keep GAP, with monotone rightward shifts only.
    const items = [
      { id: "a", w: 100, h: 50, gapAfter: PIPE_GAP },
      { id: "b", w: 100, h: 50, gapAfter: GAP },
      { id: "c", w: 100, h: 50 },
    ];
    const lay = layoutRow(items);
    const before = items.map((it) => lay.pos.get(it.id)!.x);
    enforceGaps(lay, items, GAP);
    const after = items.map((it) => lay.pos.get(it.id)!.x);
    for (let i = 0; i < items.length; i++) expect(after[i]).toBeGreaterThanOrEqual(before[i]);
    const gapAB = after[1] - 50 - (after[0] + 50);
    const gapBC = after[2] - 50 - (after[1] + 50);
    expect(gapAB).toBe(PIPE_GAP);
    expect(gapBC).toBe(GAP);
  });

  it("prices pipe gaps in the DP split (round 9.4)", () => {
    // REJECTS a DP blind to PIPE_GAP: the same inflexible nodes fit one row
    // naturally under GAP, but the 58px wider pipe adjacency pushes the row
    // past available and flips it to penalised scroll.
    const H = (): number => 40;
    const mk = (gapAfter: number): PlanItem[] => [
      { id: "a", nat: 300, flex: false, html: "a", gapAfter },
      { id: "b", nat: 300, flex: false, html: "b", gapAfter: GAP },
      { id: "c", nat: 60, flex: false, html: "c" },
    ];
    // 300+22+300+22+60+20 = 724 <= 730: natural fit.
    const narrow = planRows(mk(GAP), 730, IND, GAP, ROWGAP, H);
    expect(narrow.rows.length).toBe(1);
    expect(narrow.rows[0].scroll).toBe(false);
    // 300+80+300+22+60+20 = 782 > 730: no natural fit; inflexible nodes
    // cannot wrap, so the row scrolls at naturals plus hidden px.
    const piped = planRows(mk(PIPE_GAP), 730, IND, GAP, ROWGAP, H);
    expect(piped.rows.length).toBe(1);
    expect(piped.rows[0].scroll).toBe(true);
  });

  it("draws one row top-aligned on a shared edge line (round 7.6)", () => {
    // REJECTS centre alignment: every foreignObject in a row shares the same
    // y, and every intra-row edge is a horizontal segment at the shortest
    // node centre. Runs through the real svgRowHTML under the stub.
    const restore = installStub();
    try {
      resetStats("topalign");
      const items = [
        { id: "a", w: 200, h: 0, flex: true, sk: "m", html: '<div class="prim-node" data-size="m">short</div>' },
        { id: "b", w: 200, h: 0, flex: true, sk: "m", html: '<div class="prim-node" data-size="m">a much longer node body here</div>' },
      ];
      const r = svgRowHTML(items, [{ a: "a", b: "b", link: "flow" }]);
      const ys = [...r.svg.matchAll(/<foreignObject x="[\d.]+" y="([\d.]+)"/g)].map((m) => m[1]);
      expect(ys.length).toBe(2);
      expect(ys[0]).toBe(ys[1]);
      const edge = /<path class="prim-edge" d="M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)"/.exec(r.svg);
      expect(edge).not.toBeNull();
      expect(edge![2]).toBe(edge![4]);
    } finally {
      restore();
    }
  });
});
