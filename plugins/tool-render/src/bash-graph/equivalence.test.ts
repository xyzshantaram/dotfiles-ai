// Corpus equivalence: the fair copy against the REAL prototype.
//
// Criterion 1. Runs every command of the 34-command corpus (CORPUS plus
// GCORPUS) through BOTH the prototype page functions and the fair-copy
// modules, sharing one stub-DOM geometry model, and requires byte-identical
// panelsHTML plus identical node/chip/pipe counts. Any difference is a
// porting bug, not a model question: both sides read the same stub.
//
// What is normalised, and why: svg marker ids (arr1, arr2, ...) count up
// from a module-level counter on EACH side, so the Nth svg of the prototype
// run and the Nth svg of the module run carry different numerals for the
// same construct. The test rewrites arr[0-9]+ to arr# on both sides before
// comparing, and separately asserts the svg COUNT matches, so no edge can
// hide behind the rewrite.
//
// The prototype side evaluates the page script with two patches (the same
// technique as proto/verify-roundN.mjs): document access retargeted at the
// stub, and the BOOT section cut off. No prototype line is retyped here.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CORPUS, GCORPUS } from "./corpus.fixture.js";
import { installStub, resetStats } from "./geometry.stub.js";
import { renderOne as moduleRenderOne } from "./render.js";
import { unbashScan as moduleUnbashScan, adoptSpans as moduleAdoptSpans } from "./parse.js";

const PROTO = "/home/sid/.dsh/aidos/scratch/--home-sid-repos-dotfiles-ai--/proto/index.html";

// ---- prototype loading ----
interface ProtoApi {
  renderOne(idx: number, src: string, ub: unknown, engines: Record<string, unknown>): {
    panelsHTML: string[];
    nCmd: number;
    nOp: number;
    nChip: number;
    nPipe: number;
  };
  adoptSpans(src: string, cmds: { ta: number; tb: number }[], ub: unknown): { adopted: number; total: number };
}

function loadPrototype(): ProtoApi {
  const file = readFileSync(PROTO, "utf8");
  const open = '<script type="module">';
  let src = file.slice(file.indexOf(open) + open.length, file.indexOf("</script>", file.indexOf(open)));
  src = src.slice(0, src.indexOf("/* ================= BOOT"));
  src = src.replace("const $=s=>document.querySelector(s);", "const $=s=>__dollar(s);");
  const factory = new Function(
    "__dollar",
    src + "\n;return { renderOne, adoptSpans };",
  ) as (__dollar: (sel: string) => unknown) => ProtoApi;
  const restore = installStub();
  try {
    return factory((sel: string) => {
      const g = globalThis as { document?: { querySelector(sel: string): unknown } };
      return g.document ? g.document.querySelector(sel) : null;
    });
  } finally {
    restore();
  }
}

const normMarkers = (s: string): string => s.replace(/arr\d+/g, "arr#");
const UB_STUB = { status: "stable-unavailable", nodes: [] };

describe("corpus equivalence (prototype vs fair copy)", () => {
  it("covers all 34 commands (20 everyday plus 14 git-commit)", () => {
    expect(CORPUS.length + GCORPUS.length).toBe(34);
  });

  it("renders every corpus command byte-identically (scanner path)", () => {
    const proto = loadPrototype();
    const restore = installStub();
    try {
      const lists: [string[], number][] = [
        [CORPUS, 0],
        [GCORPUS, 100],
      ];
      let cards = 0;
      let panels = 0;
      for (const [list, base] of lists) {
        for (let i = 0; i < list.length; i++) {
          resetStats("p" + i);
          const p = proto.renderOne(base + i, list[i], UB_STUB, { adopted: 0, avail: 716 });
          resetStats("m" + i);
          const m = moduleRenderOne(base + i, list[i], UB_STUB, { adopted: 0, avail: 716 });
          cards++;
          panels += p.panelsHTML.length;
          expect(m.panelsHTML.length, `card ${base + i} panel count`).toBe(p.panelsHTML.length);
          expect(
            { nCmd: m.nCmd, nOp: m.nOp, nChip: m.nChip, nPipe: m.nPipe },
            `card ${base + i} counts`,
          ).toEqual({ nCmd: p.nCmd, nOp: p.nOp, nChip: p.nChip, nPipe: p.nPipe });
          for (let k = 0; k < p.panelsHTML.length; k++) {
            expect(normMarkers(m.panelsHTML[k]), `card ${base + i} panel ${k}`).toBe(
              normMarkers(p.panelsHTML[k]),
            );
          }
          const svgCount = (h: string): number => (h.match(/<svg /g) || []).length;
          expect(
            m.panelsHTML.map(svgCount),
            `card ${base + i} svg count`,
          ).toEqual(p.panelsHTML.map(svgCount));
        }
      }
      expect(cards).toBe(34);
      expect(panels).toBeGreaterThan(34);
    } finally {
      restore();
    }
  });

  it("adopts unbash spans exactly like the prototype", async () => {
    const proto = loadPrototype();
    const restore = installStub();
    try {
      for (let i = 0; i < CORPUS.length + GCORPUS.length; i++) {
        const src = i < CORPUS.length ? CORPUS[i] : GCORPUS[i - CORPUS.length];
        const ub = await moduleUnbashScan(src);
        expect(ub.status, `card ${i} scan status`).toBe("ok");
        const cmdsP = [
          { ta: 0, tb: src.length },
          { ta: 3, tb: 40 },
        ];
        const cmdsM = cmdsP.map((c) => ({ ...c }));
        const rP = proto.adoptSpans(src, cmdsP, ub);
        const rM = moduleAdoptSpans(src, cmdsM, ub);
        expect(rM, `card ${i} adopt counts`).toEqual(rP);
        expect(cmdsM, `card ${i} adopted spans`).toEqual(cmdsP);
      }
    } finally {
      restore();
    }
  });
});
