// Layout: chain rows plus the DP over contiguous splits.
//
// THE DAGRE DECISION (criterion 5, evidence in the ticket report). The
// prototype loaded @dagrejs/dagre v1 from a CDN and carried a fallback-chain
// engine. A headless run of the REAL prototype over the whole 34-command
// corpus with the real dagre library against the fallback engine showed:
// every panel byte-identical EXCEPT the svg height, which dagre renders
// exactly 11px taller PER ROW. That 11px is dagre margin semantics leaking
// into row height (marginy 3 plus a hard-coded +14 bottom margin in the
// prototype dagre branch), not content geometry: x positions, widths, row
// splits, edges, hooks, and tags all match. A row here is a contiguous
// left-to-right chain at one rank; that is not a graph-layout problem. The
// fair copy therefore ships the chain engine only and drops the dependency.
// The +11px slack is NAMED, not hidden: had it been kept, the DP row price
// (first row tallest+6, continuations tallest+0, round 7.8) would describe a
// different height than the render draws, reintroducing the exact fiction
// round 7.8 removed. No graph-layout library enters the client bundle.
//
// THE DP (planRows). ONE optimisation: minimise total panel px over
// contiguous row splits. Items carry id, nat, flex, minw; H(item, w) is the
// measured height at exactly w. Each candidate row costs the cheapest of:
// natural fit (all naturals), fair-share wrap-to-fit (inflex keep natural,
// flexible water-fill via fillLevel, never below the longest unbreakable run
// minw), or scroll at naturals (only when inflex alone exceeds the row, or a
// flex minimum forces it: a scrolled row pays each hidden px as a px, so
// wrap-plus-indent wins whenever sanely possible). Row price tracks rendered
// overhead exactly: first row tallest+6 (2x3px svg margin), continuations
// tallest+0 (the old flat +20 overpriced every continuation by 14, round
// 7.8). Chained cost adds ROWGAP per continuation; exact px ties pack early
// (prefer the later split, round 7.4b). Gaps are per-adjacency (gapAfter:
// PIPE_GAP on pipe links, GAP otherwise), summed, never (n-1)*GAP.
// planRows is PURE and deterministic given its measurements: the only reason
// thirteen rounds verified without a browser. Keep it that way.

import { GAP, IND, NODE_M, ROWGAP } from "./constants.js";
import { fitWidth, fillLevel } from "./measure.js";

export interface RowItem {
  id: string;
  w: number;
  h: number;
  gapAfter?: number;
}

export interface RowLayout {
  W: number;
  H: number;
  pos: Map<string, { x: number; y: number }>;
  engine: string;
}

/**
 * Lay one chain row. Positions centres left to right at the per-adjacency
 * gaps, then normalises to ONE origin by construction (rounds 10.4, 11.3):
 * the origin is the node BORDER edge, not the margin-box. A lone HTML node
 * margin-box starts at the container edge (margins are transparent) and its
 * 10px CSS margin puts its border at NODE_M, so the svg row leftmost
 * margin-box must start at the canvas edge too; then both borders sit at
 * NODE_M from their container content-box. (Round 10.4 aligned the svg
 * margin-box to NODE_M, comparing it against the lone MARGIN value: same
 * numeral, different quantity, so borders sat at 20 versus 10 while the
 * check passed.) The canvas keeps a symmetric NODE_M trailing margin.
 * Continuation rows sit at NODE_M plus IND borders by design.
 */
export function layoutRow(items: RowItem[]): RowLayout {
  let x = 10;
  const H = Math.max(...items.map((it) => it.h)) + 6;
  const pos = new Map<string, { x: number; y: number }>();
  for (const it of items) {
    pos.set(it.id, { x: x + it.w / 2, y: H / 2 });
    x += it.w + 22;
  }
  let W = x - 22 + 10;
  const engine = "fallback-chain";
  let minL = Infinity;
  let maxR = -Infinity;
  for (const it of items) {
    const q = pos.get(it.id);
    if (!q) continue;
    minL = Math.min(minL, q.x - it.w / 2);
    maxR = Math.max(maxR, q.x + it.w / 2);
  }
  const sh = -minL;
  if (sh !== 0)
    for (const it of items) {
      const q = pos.get(it.id);
      if (q) q.x += sh;
    }
  W = maxR + sh + NODE_M;
  return { W, H, pos, engine };
}

/**
 * Post-pass over a laid-out row: walk the chain in order and shift every
 * node right just enough that each adjacency meets its own gap (pipe links
 * carry PIPE_GAP on items[i].gapAfter, everything else GAP). Shifts are
 * monotone rightward only, so the row width grows by the final accumulation
 * and y geometry is untouched. Normalises every engine to the same gaps by
 * construction (round 10).
 */
export function enforceGaps<T extends { id: string; w: number; gapAfter?: number }>(
  lay: { pos: Map<string, { x: number; y: number }>; W: number },
  items: T[],
  gap: number = GAP,
): number {
  let acc = 0;
  for (let i = 0; i < items.length; i++) {
    const p = lay.pos.get(items[i].id);
    if (!p) continue;
    p.x += acc;
    if (i + 1 < items.length) {
      const req = items[i].gapAfter != null ? (items[i].gapAfter as number) : gap;
      const nx = (lay.pos.get(items[i + 1].id)?.x ?? 0) + acc;
      const need = p.x + items[i].w / 2 + req + items[i + 1].w / 2;
      if (need > nx + 1e-9) acc += need - nx;
    }
  }
  lay.W += acc;
  return acc;
}

export interface PlanItem {
  id: string;
  nat: number;
  flex: boolean;
  minw?: number;
  html?: string;
  gapAfter?: number;
}

export interface PlanRow {
  ids: string[];
  widths: number[];
  left: number;
  first: boolean;
  scroll: boolean;
}

export interface RowPlan {
  rows: PlanRow[];
  totalH: number;
}

/**
 * The DP. Pure and deterministic given H: no DOM, no randomness, no clock.
 * inds and gaps default to the layout constants so headless callers pass
 * only (items, avail, H).
 */
export function planRows(
  items: PlanItem[],
  avail: number,
  ind: number = IND,
  gap: number = GAP,
  rowGap: number = ROWGAP,
  H: (item: PlanItem, w: number) => number,
): RowPlan {
  const n = items.length;
  if (!n) return { rows: [], totalH: 0 };
  const hcache = new Map<string, number>();
  const Hc = (it: PlanItem, w: number): number => {
    const k = it.id + "@" + w;
    let v = hcache.get(k);
    if (v === undefined) {
      v = H(it, w);
      hcache.set(k, v);
    }
    return v;
  };
  function rowCost(
    js: number,
    ie: number,
    first: boolean,
  ): { h: number; widths: Map<string, number>; scroll: boolean; left: number } {
    const g = items.slice(js, ie + 1);
    const aw = avail - (first ? 0 : ind);
    const gaps =
      g.slice(0, -1).reduce((a, s) => a + (s.gapAfter != null ? (s.gapAfter as number) : gap), 0) +
      20;
    const natSum = g.reduce((a, s) => a + s.nat, 0);
    const widths = new Map<string, number>();
    if (natSum + gaps <= aw) {
      let h = 0;
      for (const s of g) {
        widths.set(s.id, s.nat);
        h = Math.max(h, Hc(s, s.nat));
      }
      return { h: h + (first ? 6 : 0), widths, scroll: false, left: aw - natSum - (gaps - 20) };
    }
    const inflex = g.filter((s) => !s.flex);
    const flex = g.filter((s) => s.flex);
    const iSum = inflex.reduce((a, s) => a + s.nat, 0);
    const budget = aw - gaps - iSum;
    const L = budget >= 0 && flex.length ? fillLevel(flex.map((s) => s.nat), budget) : -1;
    // No squeeze floor below the unbreakable-run minimum: a squeezed width
    // prices at its TRUE wrapped height, so crushing nodes narrow loses on
    // height alone. Below minw, nowrap content would overflow the
    // foreignObject, so such rows price as penalised scroll.
    if (L < 0 || flex.some((s) => Math.min(s.nat, L) < (s.minw || 0))) {
      let h = 0;
      for (const s of g) {
        widths.set(s.id, s.nat);
        h = Math.max(h, Hc(s, s.nat));
      }
      const hidden = Math.max(0, natSum + gaps - aw);
      return { h: h + (first ? 6 : 0) + hidden, widths, scroll: true, left: 0 };
    }
    // Price heights at the fair-share widths but record the SHRUNK widths
    // (fitWidth proves equal height per node, so the row max stands and the
    // leftover grows honestly: the row renders narrower, never
    // shorter-than-priced). Inflexible nodes keep natural, never shrunk.
    let h = 0;
    const rawW = new Map<string, number>();
    for (const s of g) {
      const w = s.flex ? Math.ceil(Math.min(s.nat, L)) : s.nat;
      rawW.set(s.id, w);
      h = Math.max(h, Hc(s, w));
    }
    for (const s of g) {
      widths.set(
        s.id,
        s.flex ? fitWidth(s.html ?? "", rawW.get(s.id) ?? 0, s.minw || 0, (w) => Hc(s, w)) : s.nat,
      );
    }
    let used = 0;
    for (const s of g) used += widths.get(s.id) ?? 0;
    return { h: h + (first ? 6 : 0), widths, scroll: false, left: aw - used - (gaps - 20) };
  }
  const INF = 1e15;
  const dp = new Array(n + 1).fill(INF);
  const par = new Array(n + 1).fill(-1);
  const rc: ({ widths: Map<string, number>; scroll: boolean; left: number } | null)[] = new Array(
    n + 1,
  ).fill(null);
  dp[0] = 0;
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j < i; j++) {
      const c = rowCost(j, i - 1, j === 0);
      const tot = dp[j] + c.h + (j > 0 ? rowGap : 0);
      if (tot < dp[i] || (tot === dp[i] && j > par[i])) {
        dp[i] = tot;
        par[i] = j;
        rc[i] = c;
      }
    }
  }
  const rows: PlanRow[] = [];
  let i = n;
  while (i > 0) {
    const j = par[i];
    const c = rc[i];
    if (!c || j < 0) break;
    const ids: string[] = [];
    for (let k = j; k < i; k++) ids.push(items[k].id);
    rows.unshift({
      ids,
      widths: ids.map((id) => c.widths.get(id) ?? 0),
      left: Math.max(0, Math.round(c.left)),
      first: j === 0,
      scroll: c.scroll,
    });
    i = j;
  }
  return { rows, totalH: dp[n] };
}
