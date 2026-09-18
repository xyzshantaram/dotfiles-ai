// Render: rows and statements become SVG plus HTML.
//
// svgRowHTML sizes each node off-screen at its snapped width, then places
// foreignObjects (two-pass). svgStatement stacks per-row layouts with
// indent plus hook edges across breaks. renderOne turns one command into
// statement panels. Page scaffolding (section wrappers, coverage readouts,
// width slider, theme toggle, icon pass, show-original toggle) is NOT here:
// the prototype "Incidental" list excludes it, and this module stops at the
// panelsHTML boundary.
//
// Top-align, not centre-align (round 7.6): every node in a row shares the
// same TOP edge T; a short node simply ends sooner. Row height keeps the
// layout bottom margin exactly, so this only removes centring slack, never
// content room. The edge line runs at the SHORTEST node vertical centre
// (T + hmin/2): inside every node span by construction, since all share T
// and none is shorter than hmin. Every intra-row edge is a horizontal
// segment of that one line; split-arrow glyph tags sit centred on it.

import { CARD_AVAIL, GAP, IND, PIPE_GAP, ROWGAP, stepFor } from "./constants.js";
import { layoutRow, planRows, enforceGaps, type PlanItem } from "./layout.js";
import { measureH, naturalWidth, setNodeWidth, specMinW } from "./measure.js";
import {
  attributeFinalSegment,
  buildNodes,
  buildSpecs,
  makeBuildContext,
  type NodeSpec,
  type SegLinkKind,
} from "./model.js";
import { splitLines, splitSemis, tokenizeParts, type UnbashScan } from "./parse.js";
import { pipeTagHTML } from "./primitives.js";
import { SL, esc, hlArgBody, hlBody } from "./text.js";

/** Engine telemetry bag, threaded through renders. */
export interface EngineFlags {
  adopted: number;
  avail?: number;
  [flag: string]: string | number | boolean | undefined;
}

/** Marker id counter. Module-level like the prototype. */
let uidc = 0;

export interface RowEdge {
  a: string;
  b: string;
  link: SegLinkKind;
}

export interface RowSvg {
  svg: string;
  engine: string;
  tags: string[];
}

type Placeable = NodeSpec & { h: number };

/**
 * One row as SVG. Measures every node at its snapped width first (single
 * source of truth: measureH in the fobjwrap context), lays the chain, meets
 * per-adjacency gaps, top-aligns, and draws. Returns the svg plus its HTML
 * overlay tags (positioned by .edgewrap, round 9.5).
 */
export function svgRowHTML(rowItems: Placeable[], edges: RowEdge[]): RowSvg {
  for (const r of rowItems) {
    r.h = measureH(r.html, r.w);
  }
  const lay = layoutRow(rowItems);
  enforceGaps(lay, rowItems, GAP);
  // Per-adjacency gaps in node order, for the harness mirror (and anyone
  // else pricing rows): pipe links carry PIPE_GAP, everything else GAP.
  const gapsAttr = rowItems.slice(0, -1).map((s2) => (s2.gapAfter != null ? s2.gapAfter : GAP)).join(",");
  let T = Infinity;
  let maxB = -Infinity;
  let hmin = Infinity;
  let maxh = 0;
  for (const r of rowItems) {
    const p = lay.pos.get(r.id);
    if (!p) continue;
    T = Math.min(T, p.y - r.h / 2);
    maxB = Math.max(maxB, p.y + r.h / 2);
    hmin = Math.min(hmin, r.h);
    maxh = Math.max(maxh, r.h);
  }
  const H2 = T + maxh + (lay.H - maxB);
  const yEdge = T + hmin / 2;
  const aid = "arr" + ++uidc;
  let s =
    `<svg width="${Math.ceil(lay.W)}" height="${Math.ceil(H2)}" data-gaps="${gapsAttr}" role="img">` +
    `<defs><marker id="${aid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M3 1 L10 5 L3 9" fill="none" stroke="var(--dsw-alias-label-tertiary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`;
  for (const r of rowItems) {
    const p = lay.pos.get(r.id);
    if (!p) continue;
    s += `<foreignObject x="${(p.x - r.w / 2).toFixed(1)}" y="${T.toFixed(1)}" width="${r.w}" height="${r.h}"><div class="fobjwrap" style="width:${r.w}px" xmlns="http://www.w3.org/1999/xhtml">${r.html}</div></foreignObject>`;
  }
  // Edges follow the link kinds. A "chip" adjacency draws a plain incoming
  // arrow into the chipped card (the chip replaced the operator NODE, not
  // the connection). A "pipe"/"pipe-fused" adjacency draws ONE continuous
  // edge across the PIPE_GAP with the glyph tag inline in the middle (single
  // marker-end at the target keeps direction unambiguous). A "stdin"
  // adjacency (command to following input) draws REVERSED: from the input
  // left boundary back into the command right boundary, head at the command
  // end, so the picture still says "this flows into that". A "flow"
  // adjacency keeps the plain edge. Tags are HTML overlays returned
  // alongside (positioned by .edgewrap).
  const tags: string[] = [];
  for (const e of edges) {
    const A = rowItems.find((q) => q.id === e.a);
    const B = rowItems.find((q) => q.id === e.b);
    if (!A || !B) continue;
    const x1 = (lay.pos.get(A.id)?.x ?? 0) + A.w / 2;
    const x2 = (lay.pos.get(B.id)?.x ?? 0) - B.w / 2;
    if (e.link === "stdin")
      s += `<path class="prim-edge reversed" d="M${x2.toFixed(1)} ${yEdge.toFixed(1)} L${x1.toFixed(1)} ${yEdge.toFixed(1)}" marker-end="url(#${aid})"/>`;
    else
      s += `<path class="prim-edge" d="M${x1.toFixed(1)} ${yEdge.toFixed(1)} L${x2.toFixed(1)} ${yEdge.toFixed(1)}" marker-end="url(#${aid})"/>`;
    if (e.link === "pipe" || e.link === "pipe-fused")
      tags.push(pipeTagHTML(e.link, (x1 + x2) / 2, yEdge));
  }
  return { svg: s + "</svg>", engine: lay.engine, tags };
}

export interface PlacedRow {
  r: { ids: string[] };
  lay: { W: number; H: number; pos: Map<string, { x: number; y: number }> };
  dx: number;
  dy: number;
  H: number;
  yEdge: number;
  pos: Map<string, { x: number; y: number }>;
  links: (SegLinkKind | null)[];
}

/**
 * One svg per wrapped statement: per-row chain layouts stacked with indent,
 * 3-segment hook edges across breaks (down, gap, down into target top).
 * Intra-row edges follow segLinks (chip: plain incoming arrow; pipe: split
 * arrow plus tag across PIPE_GAP; stdin: reversed arrow, head at the command
 * end; flow: plain edge). Hooks ALWAYS run in reading direction (the
 * continuation thread, down across the break whatever the link) and a piped
 * hook carries its glyph tag on the horizontal mid-gap segment. The svg plus
 * tags share one padding-free .edgewrap, so tag coordinates (pure svg-space)
 * resolve against the svg origin whatever padding .panel-scroll carries
 * (round 9.5: no offset constants; the tag is glued by construction).
 */
export function svgStatement(
  plan: { rows: { ids: string[] }[] },
  specs: Placeable[],
  ind: number = IND,
  rowGap: number = ROWGAP,
  engines?: EngineFlags,
  segLinks?: Map<string, SegLinkKind>,
): string {
  const byId = new Map(specs.map((s) => [s.id, s]));
  const f = (x: number): string => x.toFixed(1);
  const laid: PlacedRow[] = [];
  let y = 0;
  let maxW = 0;
  plan.rows.forEach((r) => {
    for (const id of r.ids) {
      const s = byId.get(id);
      if (s) s.h = measureH(s.html, s.w);
    }
    const items = r.ids.map((id) => byId.get(id)).filter((s): s is Placeable => !!s);
    const lay = layoutRow(items);
    enforceGaps(lay, items, GAP);
    if (engines) engines[lay.engine] = true;
    const dx = (r as { first?: boolean }).first ? 0 : ind;
    let T = Infinity;
    let maxB = -Infinity;
    let hmin = Infinity;
    let maxh = 0;
    for (const id of r.ids) {
      const s = byId.get(id);
      const q = lay.pos.get(id);
      if (!s || !q) continue;
      T = Math.min(T, q.y - s.h / 2);
      maxB = Math.max(maxB, q.y + s.h / 2);
      hmin = Math.min(hmin, s.h);
      maxh = Math.max(maxh, s.h);
    }
    const H2 = T + maxh + (lay.H - maxB);
    const pos = new Map<string, { x: number; y: number }>();
    for (const id of r.ids) {
      const s = byId.get(id);
      const q = lay.pos.get(id);
      if (!s || !q) continue;
      pos.set(id, { x: q.x + dx, y: T + s.h / 2 + y });
    }
    laid.push({
      r,
      lay,
      dx,
      dy: y,
      H: H2,
      yEdge: T + hmin / 2 + y,
      pos,
      links: r.ids.map((id, k) =>
        k + 1 < r.ids.length ? segLinks?.get(id + ">" + r.ids[k + 1]) || "flow" : null,
      ),
    });
    maxW = Math.max(maxW, lay.W + dx);
    y += H2 + rowGap;
  });
  const H = y - rowGap;
  const aid = "arr" + ++uidc;
  // data-gaps: per-adjacency gaps in full node order (pipe links PIPE_GAP),
  // mirroring rowCost gap sums for the harness.
  const gapsAttr = specs
    .slice(0, -1)
    .map((s2) => (s2.gapAfter != null ? s2.gapAfter : GAP))
    .join(",");
  let s =
    `<svg width="${Math.ceil(maxW)}" height="${Math.ceil(H)}" data-rows="${plan.rows.length}" data-left="${plan.rows.map((r) => (r as { left?: number }).left ?? "").join(",")}" data-gaps="${gapsAttr}" role="img">` +
    `<defs><marker id="${aid}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M3 1 L10 5 L3 9" fill="none" stroke="var(--dsw-alias-label-tertiary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></marker></defs>`;
  const clip = (
    c: { x: number; y: number; hw: number; hh: number },
    t: { x: number; y: number },
  ): { x: number; y: number } => {
    const dx = t.x - c.x;
    const dy = t.y - c.y;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { x: c.x, y: c.y };
    let k = 1;
    if (Math.abs(dx) > 1e-9) k = Math.min(k, c.hw / Math.abs(dx));
    if (Math.abs(dy) > 1e-9) k = Math.min(k, c.hh / Math.abs(dy));
    return { x: c.x + dx * k, y: c.y + dy * k };
  };
  const boxOf = (
    L: PlacedRow,
    id: string,
  ): { x: number; y: number; hw: number; hh: number } => {
    const r = byId.get(id) as Placeable;
    const q = L.pos.get(id) as { x: number; y: number };
    return { x: q.x, y: q.y, hw: r.w / 2, hh: r.h / 2 };
  };
  const tags: string[] = [];
  laid.forEach((L, ri) => {
    for (const id of L.r.ids) {
      const r = byId.get(id);
      const q = L.pos.get(id);
      if (!r || !q) continue;
      s += `<foreignObject x="${f(q.x - r.w / 2)}" y="${f(q.y - r.h / 2)}" width="${r.w}" height="${r.h}"><div class="fobjwrap" style="width:${r.w}px" xmlns="http://www.w3.org/1999/xhtml">${r.html}</div></foreignObject>`;
    }
    for (let k = 0; k + 1 < L.r.ids.length; k++) {
      const lk = L.links[k];
      const A = boxOf(L, L.r.ids[k]);
      const B = boxOf(L, L.r.ids[k + 1]);
      if (lk === "stdin")
        s += `<path class="prim-edge reversed" d="M${f(B.x - B.hw)} ${f(L.yEdge)} L${f(A.x + A.hw)} ${f(L.yEdge)}" marker-end="url(#${aid})"/>`;
      else
        s += `<path class="prim-edge" d="M${f(A.x + A.hw)} ${f(L.yEdge)} L${f(B.x - B.hw)} ${f(L.yEdge)}" marker-end="url(#${aid})"/>`;
      if (lk === "pipe" || lk === "pipe-fused")
        tags.push(pipeTagHTML(lk, (A.x + A.hw + B.x - B.hw) / 2, L.yEdge));
    }
    if (ri + 1 < laid.length) {
      // Continuation hooks leave through the MIDDLE of the source bottom
      // edge and enter through the MIDDLE of the target top edge
      // (boundary-intersection clip, vertical axis) with rounded elbows (R
      // at most 6px), still fully orthogonal (round 7.7). The elbow sits a
      // quarter-gap below the source row (round 10.6), so the vertical run
      // ENTERING the target is about 3/4 of the gap while the exit run
      // shortens symmetrically. Zero height cost: ROWGAP is untouched.
      const A = boxOf(L, L.r.ids[L.r.ids.length - 1]);
      const B = boxOf(laid[ri + 1], laid[ri + 1].r.ids[0]);
      const gy = L.dy + L.H + rowGap * 0.25;
      const p0 = clip(A, { x: A.x, y: A.y + 1000 });
      const p3 = clip(B, { x: B.x, y: B.y - 1000 });
      const dx = Math.sign(p3.x - p0.x);
      let d: string;
      if (Math.abs(p3.x - p0.x) < 1e-9) {
        d = `M${f(p0.x)} ${f(p0.y)} V${f(p3.y)}`;
      } else {
        const R = Math.max(
          0,
          Math.min(6, (gy - p0.y) / 2, (p3.y - gy) / 2, Math.abs(p3.x - p0.x) / 2),
        );
        d =
          `M${f(p0.x)} ${f(p0.y)} V${f(gy - R)} Q${f(p0.x)} ${f(gy)} ${f(p0.x + dx * R)} ${f(gy)}` +
          ` H${f(p3.x - dx * R)} Q${f(p3.x)} ${f(gy)} ${f(p3.x)} ${f(gy + R)} V${f(p3.y)}`;
      }
      s += `<path class="prim-edge hook" d="${d}" marker-end="url(#${aid})"/>`;
      // The hook is the continuation thread: always drawn whatever the
      // link. A piped hook keeps its glyph on the horizontal segment.
      const hlink =
        (segLinks && segLinks.get(L.r.ids[L.r.ids.length - 1] + ">" + laid[ri + 1].r.ids[0])) ||
        "flow";
      if (hlink === "pipe" || hlink === "pipe-fused")
        tags.push(pipeTagHTML(hlink, (p0.x + p3.x) / 2, gy));
    }
  });
  return `<div class="panel-scroll"><div class="edgewrap">${s}</svg>${tags.join("")}</div></div>`;
}

export interface CardResult {
  panelsHTML: string[];
  nCmd: number;
  nOp: number;
  nRedir: number;
  nHd: number;
  nArg: number;
  nChip: number;
  nPipe: number;
  nPanels: number;
  maxSeg: number;
  adopted: number;
}

/**
 * Render one command as statement panels. Lines split at depth-0 newlines
 * (heredoc bodies ride along), segments split at depth-0 semicolons, tokens
 * become nodes, nodes become measured specs, the DP splits rows, and rows
 * become lone HTML, one svg, or a hooked statement. Heredoc and extracted
 * arg bodies append as collapsed blocks below their panel.
 *
 * The optional pipeStages is the ticket #180 seam: block.meta.pipeStages,
 * attributed under the ported rule (attributeFinalSegment: final panel
 * only, never a chipped segment, never on doubt). Omitted or undefined
 * renders exactly as before: every node keeps exitCode undefined, so the
 * equivalence proof (which never passes results) cannot see this param.
 */
export function renderOne(
  idx: number,
  src: string,
  ub: UnbashScan,
  engines: EngineFlags,
  pipeStages?: unknown,
): CardResult {
  const lines = splitLines(src);
  const ctx = makeBuildContext(idx);
  const panelsHTML: string[] = [];
  let nPanels = 0;
  // The last panel is the only one that can carry codes (PIPESTATUS holds
  // the last pipeline only). Precomputed with pure string scans, and only
  // when a result is attached at all, so result-less renders run the exact
  // old path. Empty segments render no panel and are skipped here as in
  // the loop below.
  let lastKey: string | null = null;
  if (pipeStages !== undefined) {
    lines.forEach((ln, li) => {
      const segs = splitSemis(src, ln.a, ln.b);
      segs.forEach((sg, si) => {
        if (tokenizeParts(src, sg.a, sg.b).length > 0) lastKey = li + "_" + si;
      });
    });
  }
  lines.forEach((ln, li) => {
    const segs = splitSemis(src, ln.a, ln.b);
    segs.forEach((sg, si) => {
      const items = tokenizeParts(src, sg.a, sg.b);
      if (!items.length) return;
      // Mirror the prototype's adopted-span telemetry back into the engines
      // bag (prototype index.html:1295). The build context accumulates the
      // count, but the prototype also writes it back, and a caller reading
      // engines after a render must see the same number in both.
      const adoptedBefore = ctx.adopted.n;
      const { nodes, segLinks, hdItems } = buildNodes(src, items, ln, { li, si }, ub, ctx);
      engines.adopted += ctx.adopted.n - adoptedBefore;
      // The seam: only the last panel can carry codes, under the ported
      // rule. Any other panel passes its nodes through untouched.
      const attrNodes =
        lastKey !== null && li + "_" + si === lastKey
          ? attributeFinalSegment(nodes, pipeStages, true)
          : nodes;
      const specs = buildSpecs(src, attrNodes, ctx);
      specs.forEach((s) => {
        s.nat = naturalWidth(s.html, s.sk);
      });
      specs.forEach((s) => {
        s.minw = s.flex ? specMinW(s.html) : 0;
      });
      // Per-adjacency gaps for the DP: pipe links need PIPE_GAP so the split
      // arrow runs as long as the two arrows plus op node it replaced (round
      // 9.4); everything else keeps GAP.
      specs.forEach((s, k) => {
        const nx = attrNodes[k + 1];
        const lk = nx ? segLinks.get(attrNodes[k].key + ">" + nx.key) : null;
        s.gapAfter = lk === "pipe" || lk === "pipe-fused" ? PIPE_GAP : GAP;
      });
      const avail = engines.avail || CARD_AVAIL;
      const planItems: PlanItem[] = specs.map((s) => ({
        id: s.id,
        nat: s.nat ?? 0,
        flex: s.flex,
        minw: s.minw ?? 0,
        html: s.html,
        gapAfter: s.gapAfter,
      }));
      const plan = planRows(planItems, avail, IND, GAP, ROWGAP, (it, w) => {
        const spec = specs.find((q) => q.id === it.id);
        return measureH(spec ? spec.html : (it.html ?? ""), w);
      });
      let html = "";
      if (plan.rows.length === 1 && plan.rows[0].ids.length === 1) {
        const s = specs[0];
        s.w = s.nat ?? s.w;
        s.html = s.html.replace(/data-size="[a-z]+"/, 'data-size="lone"');
        html += `<div class="panel-scroll">${s.html}</div>`;
      } else {
        plan.rows.forEach((r) => {
          r.ids.forEach((id, k) => {
            const s = specs.find((q) => q.id === id);
            if (!s) return;
            s.w = r.widths[k];
            setNodeWidth(s, stepFor(s.nat ?? 0));
          });
        });
        if (plan.rows.length === 1) {
          const rowItems = plan.rows[0].ids
            .map((id) => specs.find((q) => q.id === id))
            .filter((s): s is Placeable => !!s);
          const edges: RowEdge[] = [];
          for (let k = 0; k + 1 < rowItems.length; k++) {
            const A = rowItems[k].id;
            const B = rowItems[k + 1].id;
            edges.push({ a: A, b: B, link: segLinks.get(A + ">" + B) || "flow" });
          }
          const r1 = svgRowHTML(rowItems, edges);
          if (engines) engines[r1.engine] = true;
          html += `<div class="panel-scroll"><div class="edgewrap">${r1.svg}${r1.tags.join("")}</div></div>`;
        } else {
          const rows = plan.rows.map((r) => ({ ids: r.ids, first: r.first, left: r.left }));
          html += svgStatement({ rows }, specs as Placeable[], IND, ROWGAP, engines, segLinks);
        }
      }
      nPanels++;
      const hdBlocks = hdItems
        .map((d) => d.hd)
        .filter((h): h is NonNullable<typeof h> => Boolean(h))
        .map(
          (h) =>
            `<div class="hd-body" id="hd-${idx}_${h.n}" hidden><div class="hd-cap">heredoc [${h.n}] · ${h.lines} lines · expanded from the node above; the terminator line is not drawn</div><pre>${hlBody(SL(src, h.a, h.b))}</pre></div>`,
        )
        .join("");
      const argBlocks = ctx.argBodies
        .splice(0)
        .map(
          (a) =>
            `<div class="hd-body" id="arg-${a.id}" hidden><div class="hd-cap">${a.flag ? esc(a.flag) + " · " : ""}${a.chars} chars · ${a.lines} line${a.lines > 1 ? "s" : ""} · full verbatim argument</div><pre>${hlArgBody(a.body)}</pre></div>`,
        )
        .join("");
      panelsHTML.push(
        `<div class="prim-panel stmt" data-seg="${li}_${si}" data-nodes="${nodes.length}">${html}</div>` +
          hdBlocks +
          argBlocks,
      );
    });
  });
  return {
    panelsHTML,
    nCmd: ctx.counts.nCmd,
    nOp: ctx.counts.nOp,
    nRedir: ctx.counts.nRedir,
    nHd: ctx.counts.nHd,
    nArg: ctx.counts.nArg,
    nChip: ctx.counts.nChip,
    nPipe: ctx.counts.nPipe,
    nPanels,
    maxSeg: ctx.maxSeg.n,
    adopted: ctx.adopted.n,
  };
}
