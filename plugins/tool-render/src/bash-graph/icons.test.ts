// Icon swap checks, ticket #184 item 1 (plus the item-2 lock).
//
// The swap fills every lucide name the module can emit, never touches the
// inline pipe art, never invents a glyph for an unknown name, and cannot
// reflow a row: the swapped svg keeps data-lucide (so every reserve check
// still fires) and the stylesheet already draws the svg at the exact box the
// measurer reserved (14px, 16px on op discs, 18px on pipe tags). The geometry
// section proves it headlessly: identical measured heights, widths, and
// minima before and after the swap, on real renderOne panels. The final
// section locks the item-2 rule THROUGH the swap: the edge line stays on the
// shortest rendered middle with icon-bearing nodes of differing heights.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CMD_ICON, OP_ICON, Icon, PipeGlyph } from "./primitives.js";
import { installStub } from "./geometry.stub.js";
import { measureH, naturalWidth, specMinW } from "./measure.js";
import { renderOne } from "./render.js";
import { svgRowHTML } from "./render.js";
import { CORPUS } from "./corpus.fixture.js";
import { isKnownIcon, knownIconNames, swapIcons } from "./icons.js";

const UB_STUB = { status: "stable-unavailable", nodes: [] };
const ENGINES = (): { adopted: number; avail?: number } => ({ adopted: 0, avail: 716 });

function placeholderNames(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<i data-lucide="([^"]+)" data-fb="[^"]*"><\/i>/g)) out.push(m[1]);
  return out;
}

describe("icon swap mapping (item 1)", () => {
  it("fills every name the module can emit except the inline pipe art", () => {
    // REJECTS a swap that covers the brief list but misses a real emission:
    // OP_ICON values, CMD_ICON values, the model chevron-right fallback, and
    // every direct Icon() call site name, minus pipe-glyph (owner art, never
    // a placeholder). A name here that isKnownIcon misses would render blank
    // in the GUI with no test going red.
    const names = new Set<string>();
    for (const v of Object.values(OP_ICON)) names.add(v);
    for (const v of Object.values(CMD_ICON)) names.add(v);
    names.add("chevron-right");
    names.add("scroll-text");
    names.add("merge");
    names.delete("pipe-glyph");
    for (const n of names) expect(isKnownIcon(n), `swap covers ${n}`).toBe(true);
    expect(knownIconNames().length).toBe(names.size);
  });

  it("leaves the pipe glyph byte-identical (criterion 3)", () => {
    // REJECTS treating pipe-glyph as a lucide name: the <use> markup carries
    // no data-lucide and must pass through untouched.
    const glyph = PipeGlyph();
    expect(glyph).toContain('href="#pipe-glyph"');
    expect(glyph).not.toContain("data-lucide");
    expect(swapIcons(glyph)).toBe(glyph);
    expect(swapIcons(`<div>${glyph}<span>x</span></div>`)).toContain('href="#pipe-glyph"');
  });

  it("leaves unknown names as placeholders, never inventing a glyph", () => {
    // REJECTS a swap that fills what it does not know: a future module name
    // stays blank-as-today rather than drawing a wrong glyph.
    const html = '<span class="prim-icon"><i data-lucide="not-a-real-icon" data-fb="N"></i></span>';
    expect(swapIcons(html)).toBe(html);
  });

  it("emits a 24-grid stroked svg that keeps both data attributes verbatim", () => {
    // REJECTS a swap that drops the reserve marker or mangles the fallback:
    // data-lucide keeps specMinW/geometry.stub charging the icon, and the
    // entity-escaped fb (here 2>&1 |) is re-emitted untouched, never decoded
    // and re-encoded. React-only key attrs are dropped.
    const fbEsc = "2&gt;&amp;1 |";
    const html = `<span class="prim-icon rot90"><i data-lucide="merge" data-fb="${fbEsc}"></i></span>`;
    const out = swapIcons(html);
    expect(out).toContain('viewBox="0 0 24 24"');
    expect(out).toContain('stroke="currentColor"');
    expect(out).toContain('data-lucide="merge"');
    expect(out).toContain(`data-fb="${fbEsc}"`);
    expect(out).toContain('aria-hidden="true"');
    expect(out).not.toContain("<i ");
    expect(out).not.toMatch(/\bkey="/);
    expect(out).toContain("<path");
  });

  it("fills every placeholder real panels emit, on real renderOne output", () => {
    // REJECTS map drift the census above cannot see: render these commands
    // and every placeholder found must be known, with none left after.
    const restore = installStub();
    try {
      const srcs = [
        "git log --oneline | head -20",
        "cat f | sort | uniq",
        "ls 2>&1 | head",
        "echo hi || echo bye",
        "cat <<EOF\nhi\nEOF",
        "frobnicate x | frobnicate y",
      ];
      for (const src of srcs) {
        const r = renderOne(700, src, UB_STUB as never, ENGINES());
        const joined = r.panelsHTML.join("");
        for (const n of placeholderNames(joined)) expect(isKnownIcon(n), `${src}: ${n}`).toBe(true);
        const swapped = r.panelsHTML.map(swapIcons).join("");
        expect(swapped).not.toContain("<i data-lucide");
      }
    } finally {
      restore();
    }
  });
});

describe("swap geometry proof (criterion 2)", () => {
  it("the stylesheet draws swapped svgs at the reserved boxes", () => {
    // REJECTS assuming the reserve is right: the proof needs the CSS side.
    // 14px base, 16px op discs, 18px pipe tags mirror the #measure icon
    // sizes, so placeholder box and svg box agree in every context.
    const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
    expect(css).toMatch(/\.prim-icon svg\s*\{\s*width:\s*14px;\s*height:\s*14px/);
    expect(css).toMatch(/\.prim-node\.op \.prim-icon svg\s*\{\s*width:\s*16px;\s*height:\s*16px/);
    expect(css).toMatch(/\.pipe-tag \.prim-icon svg\s*\{\s*width:\s*18px;\s*height:\s*18px/);
  });

  it("measured heights, widths, and minima are identical before and after", () => {
    // REJECTS a swap that reflows rows: under the shared stub geometry,
    // every representative spec and every corpus panel measures the same
    // with icons present (swapped) as absent (placeholders).
    const restore = installStub();
    try {
      const specs = [
        `<div class="prim-node" data-size="m">${Icon("search", "s")}<span class="node-text"><code>abcdefghij</code></span></div>`,
        `<div class="prim-node op" data-size="op" title="t">${Icon("merge", "2>&1 |", "rot90")}<span class="op-sym">2&gt;&amp;1 |</span></div>`,
        `<div class="prim-node has-chip" data-size="m"><span class="op-chip" title="t">${Icon("circle-plus", "||")}</span><span class="node-main">${Icon("search", "s")}<span class="node-text"><code>abcdefghij</code></span></span></div>`,
        `<button class="prim-node" data-size="m" data-hd="7_1" aria-expanded="false" title="t"><span class="hd-pair">${Icon("scroll-text", "<<")}<span class="node-text"><code><span class="hd-label">&lt;&lt;EOF [1:3]</span></code></span></span></button>`,
        `<div class="prim-node" data-size="m">${Icon("file-output", ">")}<span class="node-text"><code><span class="prim-chip">out.txt</span></code></span></div>`,
      ];
      for (const html of specs) {
        const swapped = swapIcons(html);
        expect(swapped).not.toBe(html);
        for (const w of [150, 300, 680]) {
          expect(measureH(swapped, w), `h@${w} ${html.slice(0, 40)}`).toBe(measureH(html, w));
        }
        expect(naturalWidth(swapped, "m")).toBe(naturalWidth(html, "m"));
        expect(specMinW(swapped)).toBe(specMinW(html));
      }
      for (const src of CORPUS.slice(0, 8)) {
        const r = renderOne(710, src, UB_STUB as never, ENGINES());
        for (const panel of r.panelsHTML) {
          const swapped = swapIcons(panel);
          for (const w of [200, 400, 680]) {
            expect(measureH(swapped, w), `panel h@${w} ${src.slice(0, 30)}`).toBe(measureH(panel, w));
          }
          expect(naturalWidth(swapped, "m"), `panel nat ${src.slice(0, 30)}`).toBe(
            naturalWidth(panel, "m"),
          );
          expect(specMinW(swapped), `panel minw ${src.slice(0, 30)}`).toBe(specMinW(panel));
        }
      }
    } finally {
      restore();
    }
  });
});

describe("edge line through the swap (item-2 lock)", () => {
  it("stays on the shortest rendered middle with icon-bearing nodes", () => {
    // REJECTS moving the line to fix a screenshot: the rule (shortest-node
    // centre, shared top edge) holds on swapped icon-bearing nodes of
    // differing heights, so the swap neither needs nor permits a line move.
    const restore = installStub();
    try {
      const short =
        `<div class="prim-node" data-size="s">${Icon("check", "&")}<span class="node-text"><code><span class="seg">ok</span></code></span></div>`;
      const tall =
        `<div class="prim-node" data-size="m">${Icon("search", "s")}<span class="node-text"><code><span class="seg">a</span> <span class="seg">much</span> <span class="seg">longer</span> <span class="seg">node</span> <span class="seg">body</span> <span class="seg">here</span></code></span></div>`;
      const items = [
        { id: "a", w: 150, h: 0, flex: true, sk: "s", html: swapIcons(short) },
        { id: "b", w: 250, h: 0, flex: true, sk: "m", html: swapIcons(tall) },
      ];
      const r = svgRowHTML(items, [{ a: "a", b: "b", link: "flow" }]);
      const boxes = [...r.svg.matchAll(/<foreignObject x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)">/g)].map(
        (m) => ({ y: parseFloat(m[1]), h: parseFloat(m[2]) }),
      );
      expect(boxes.length).toBe(2);
      expect(boxes[0].y).toBe(boxes[1].y);
      const edge = /<path class="prim-edge" d="M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)"/.exec(r.svg);
      expect(edge).not.toBeNull();
      const ey = parseFloat(edge![2]);
      expect(ey).toBe(parseFloat(edge![4]));
      const T = boxes[0].y;
      const hmin = Math.min(boxes[0].h, boxes[1].h);
      expect(ey).toBeCloseTo(T + hmin / 2, 1);
      for (const b of boxes) {
        expect(ey).toBeGreaterThanOrEqual(b.y);
        expect(ey).toBeLessThanOrEqual(b.y + b.h);
      }
    } finally {
      restore();
    }
  });
});

describe("criterion-6 spot checks through the swap", () => {
  it("keeps arg pills, heredoc buttons, and exit badges intact", () => {
    // REJECTS a swap that eats its neighbours: data-arg/data-hd controls
    // and exit pills survive byte-identical, only the icon changes.
    const restore = installStub();
    try {
      const r = renderOne(720, "cat <<EOF\nhi\nEOF", UB_STUB as never, ENGINES());
      const joined = r.panelsHTML.join("");
      expect(joined).toContain("data-hd=");
      const swapped = r.panelsHTML.map(swapIcons).join("");
      expect(swapped).toContain("data-hd=");
      expect(swapped).toContain("scroll-text");
      const r2 = renderOne(
        721,
        "git log | head",
        UB_STUB as never,
        ENGINES(),
        [
          { name: "git", exitCode: 0 },
          { name: "head", exitCode: 1 },
        ],
      );
      const j2 = r2.panelsHTML.map(swapIcons).join("");
      expect(j2).toContain("exit 0");
      expect(j2).toContain("exit 1");
      expect(j2).toContain("git-branch");
    } finally {
      restore();
    }
  });
});
