// Measurement: the width/height contract, written down and asserted.
//
// Six real prototype bugs came from measuring something other than what
// renders. The contract below is the fix for that class. A reader must be
// able to tell, WITHOUT running anything, whether a proposed change breaks
// it; contract.test.ts asserts each clause with a recording stub.
//
// THE CONTRACT
// 1. Spec widths are OUTER widths: node border-box plus 2xNODE_M margin.
//    The node inline width is always spec minus the margins.
// 2. naturalWidth returns scrollWidth (the PADDING box: content plus padding,
//    EXCLUDING the 1px borders) plus 2px borders plus 2xNODE_M margins.
//    offsetWidth already includes borders, so the fallback path adds no +2.
//    A node measured 2px short makes overflow-wrap:anywhere fire emergency
//    breaks mid-token on text that fits (round 12).
// 3. measureH runs in the same .fobjwrap context as the final render, so the
//    zeroed vertical margins apply in both (round 8.1). It pins the node own
//    width to the candidate width first: without the pin the node lays out at
//    its stylesheet width and the DP prices fiction (defect D1). It takes
//    max(offsetHeight, boundingRect) and adds NO vertical margin. Lone
//    HTML-flow nodes keep real margins; svg foreignObject nodes zero vertical
//    margins; the foreignObject fits the border-box exactly.
// 4. Icons swap in AFTER measurement, so the measurer reserves icon space
//    structurally: 20px first-line reserve when data-lucide is present, plus
//    the #measure placeholder sizes (round 6). Any async content that lands
//    after measure needs the same treatment.
// 5. fitWidth (shrink-to-fit, round 10.1) never clips and never lies: binary
//    search plus verify-and-fall-back. The DP prices with it AND the render
//    assigns with it: one function, so cost cannot drift from drawing (the
//    round-6/7 fiction-measurement trap).

import { NODE_M, OP_W, PILL_MAX_PX } from "./constants.js";

/** Minimal structural view of the measurer element. No DOM lib needed. */
export interface MeasureElement {
  innerHTML: string;
  readonly firstChild: {
    readonly offsetHeight: number;
    getBoundingClientRect(): { height: number };
    readonly firstChild: {
      style: { width?: string; maxWidth?: string };
      readonly scrollWidth: number;
      readonly offsetWidth: number;
    } | null;
    style?: { width?: string; maxWidth?: string };
    classList?: { contains(cls: string): boolean };
  } | null;
  style?: Record<string, string>;
}

/** Minimal document surface this module touches. */
export interface MeasureDocument {
  querySelector(sel: string): MeasureElement | null;
}

function activeDocument(): MeasureDocument {
  const g = globalThis as { document?: MeasureDocument };
  if (!g.document) throw new Error("bash-graph: no document for measurement");
  return g.document;
}

/**
 * Natural width of a node spec as an OUTER width (contract clause 2). Op
 * discs are fixed. Otherwise the HTML is laid at width:max-content under a
 * nowrap guard (so step max-width ceilings cannot cap it: overflow counts),
 * the node own width forced to auto, and the padding-box scrollWidth plus
 * borders plus margins returned. Falls back to offsetWidth (no +2) and to
 * 120px when the DOM is absent.
 */
export function naturalWidth(html: string, sk: string): number {
  if (sk === "op") return OP_W + NODE_M * 2;
  try {
    const meas = activeDocument().querySelector("#measure");
    if (!meas) return 120;
    meas.innerHTML = `<div style="width:max-content;white-space:nowrap">${html}</div>`;
    const nodeEl = meas.firstChild && meas.firstChild.firstChild;
    if (nodeEl && nodeEl.style) nodeEl.style.width = "auto";
    const sw = nodeEl ? nodeEl.scrollWidth || 0 : 0;
    const ow = nodeEl ? nodeEl.offsetWidth || 0 : 0;
    meas.innerHTML = "";
    if (sw > 0) return Math.ceil(sw) + 2 + NODE_M * 2;
    if (ow > 0) return Math.ceil(ow) + NODE_M * 2;
  } catch {
    /* fall through to the 120px default */
  }
  return 120;
}

/**
 * Height of a node HTML at exactly w px (contract clause 3). Same .fobjwrap
 * context as the final render; pins the node own width to the candidate
 * width (defect D1); takes max(offsetHeight, boundingRect); adds NO vertical
 * margin. Never below 30px.
 */
export function measureH(html: string, w: number): number {
  const meas = activeDocument().querySelector("#measure");
  if (!meas) return 30;
  meas.innerHTML = `<div class="fobjwrap" style="width:${w}px">${html}</div>`;
  const inner = meas.firstChild;
  const node =
    inner && inner.firstChild
      ? (inner.firstChild as {
          style?: { width?: string; maxWidth?: string };
          classList?: { contains(cls: string): boolean };
        })
      : null;
  if (
    node &&
    node.style &&
    node.classList &&
    node.classList.contains("prim-node") &&
    !node.classList.contains("op")
  ) {
    node.style.width = Math.max(0, w - NODE_M * 2) + "px";
    node.style.maxWidth = Math.max(0, w - NODE_M * 2) + "px";
  }
  let h = inner ? inner.offsetHeight : 0;
  try {
    if (inner && inner.getBoundingClientRect) {
      const bb = inner.getBoundingClientRect();
      if (bb.height > h) h = bb.height;
    }
  } catch {
    /* keep offsetHeight */
  }
  meas.innerHTML = "";
  return Math.max(30, Math.ceil(h));
}

export interface WidthSpec {
  sk: string;
  w: number;
  html: string;
}

/**
 * Stamp the assigned width onto a spec. Chipped nodes keep their has-chip
 * class (the flex split-card, round 8.4). Op discs are fixed width.
 */
export function setNodeWidth<S extends WidthSpec>(s: S, step: string): void {
  if (s.sk === "op") return;
  if (s.html.includes('class="prim-node has-chip"'))
    s.html = s.html.replace(
      'class="prim-node has-chip"',
      `class="prim-node has-chip" style="width:${Math.max(0, s.w - NODE_M * 2)}px"`,
    );
  else
    s.html = s.html.replace(
      'class="prim-node"',
      `class="prim-node" style="width:${Math.max(0, s.w - NODE_M * 2)}px"`,
    );
  s.html = s.html.replace(/data-size="[a-z]+"/, `data-size="${step}"`);
}

/**
 * Shrink-to-fit (round 10.1, contract clause 5). The smallest width at or
 * above minw rendering no taller than at wMax. Height is stepwise
 * non-increasing in width: binary-search the knee, then VERIFY and fall back
 * to wMax on any surprise. Pure in (html, wMax, minw, H).
 */
export function fitWidth(
  html: string,
  wMax: number,
  minw: number,
  Hw: (w: number) => number,
): number {
  void html;
  const lo0 = minw || 0;
  if (!(wMax > lo0)) return wMax;
  const hMax = Hw(wMax);
  if (Hw(lo0) <= hMax) return lo0;
  let lo = lo0;
  let hi = wMax;
  while (hi - lo > 4) {
    const mid = (lo + hi) / 2;
    if (Hw(mid) <= hMax) hi = mid;
    else lo = mid;
  }
  const w = Math.ceil(hi);
  return Hw(w) <= hMax ? w : wMax;
}

/**
 * Fair-share water-fill level (round 7 DP): raise all naturals toward an
 * even level until the budget runs out. Sets candidate widths; fitWidth then
 * narrows each node honestly.
 */
export function fillLevel(nats: number[], budget: number): number {
  const s = [...nats].sort((a, b) => a - b);
  let prev = 0;
  let rem = budget;
  for (let i = 0; i < s.length; i++) {
    const need = (s[i] - prev) * (s.length - i);
    if (rem >= need) {
      rem -= need;
      prev = s[i];
    } else return prev + rem / (s.length - i);
  }
  return prev;
}

function unescapeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

/**
 * Longest unbreakable run in a flexible node, as an OUTER width. .seg
 * contents at the unbiased 7.2px mono advance (the old 7.5 safety bias
 * false-tripped the bar on short nodes like `head`); nowrap pill labels
 * capped at their PILL_MAX_PX visual width plus pill button chrome; chrome
 * is node padding plus border plus first-line icon (only when the node has
 * one) plus 2xNODE_M outer margin. A has-chip node reserves its chip bar
 * beside the text on EVERY line (round 12.1): same formula as the chip
 * reserve, else the DP prices a minw it cannot render and the segment spills
 * (a browser fact, found by measuring at reducing node widths, not new CSS).
 */
export function specMinW(html: string): number {
  const tx = unescapeEntities;
  const hasIcon = html.includes("data-lucide");
  const chipR = chipReserve(html, tx);
  const chrome = 16 + 2 + (hasIcon ? 20 : 0) + NODE_M * 2 + chipR;
  let mx = 0;
  let m: RegExpExecArray | null;
  const reSeg = /<span class="seg">(.*?)<\/span>/g;
  while ((m = reSeg.exec(html))) mx = Math.max(mx, tx(m[1]).length * 7.2);
  const rePill = /<button class="prim-badge"[^>]*>([\s\S]*?)<\/button>/g;
  while ((m = rePill.exec(html))) {
    const pl = tx(m[1].replace(/<[^>]*>/g, ""));
    mx = Math.max(mx, Math.min(pl.length * 7.2, PILL_MAX_PX + (m[0].includes("data-hd") ? 18 : 14)));
  }
  return mx > 0 ? Math.ceil(mx + chrome) : 0;
}

/** Chip-bar reserve beside the text on every line of a chipped node. */
export function chipReserve(html: string, tx: (s: string) => string): number {
  const cm = /<span class="op-chip"[^>]*>([\s\S]*?)<\/span>/.exec(html);
  if (!cm) return 0;
  return Math.min(tx(cm[1]).length * 7.2, 200) + 30;
}
