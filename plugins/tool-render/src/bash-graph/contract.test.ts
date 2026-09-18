// Contract and rule pins: the measurement contract asserted, every
// bug-learned rule as a comment or a test, and the ship-clean guarantees.
//
// Criterion 9 governs this file: for each check, the comment states what
// buggy state it REJECTS. The central ones prove it by mutation (see the
// ticket report for the transcript): mutate, show red, restore, verify
// byte-identity, report counts.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CORPUS, GCORPUS } from "./corpus.fixture.js";
import { NODE_M } from "./constants.js";
import { installStub, resetStats } from "./geometry.stub.js";
import { fitWidth, fillLevel, measureH, naturalWidth, specMinW } from "./measure.js";
import { planRows } from "./layout.js";
import { parseTest, testBodyHTML } from "./parse.js";
import { chipHTML } from "./primitives.js";
import { renderOne } from "./render.js";

// Self-locating, deliberately. These paths were absolute into the ticket's
// disposable worktree under /tmp, which passes today and breaks the moment
// the worktree is cleaned up or the machine reboots -- and /tmp does not
// survive hibernation on this host. The repo already has this convention
// (plugins/user-bubble/src/chrome.test.ts).
const DIR = dirname(fileURLToPath(import.meta.url));
const DIST = join(DIR, "..", "..", "dist");
const UB_STUB = { status: "stable-unavailable", nodes: [] };

describe("measurement contract", () => {
  it("naturalWidth adds borders plus margins to the padding box (round 12)", () => {
    // REJECTS the pre-R12.1 state: scrollWidth excludes the 1px borders, so
    // forgetting the +2 measures every node 2px short and anywhere breaks
    // mid-token on text that fits.
    const g = globalThis as { document?: unknown };
    const prev = g.document;
    let widthAfterSet = "";
    const node = {
      style: {} as Record<string, string>,
      get scrollWidth(): number {
        return 100;
      },
      get offsetWidth(): number {
        return 0;
      },
    };
    const MEAS = {
      _h: "",
      writes: [] as string[],
      get innerHTML(): string {
        return this._h;
      },
      set innerHTML(v: string) {
        this._h = v;
        (this.writes as string[]).push(v);
      },
      get firstChild(): unknown {
        return {
          get firstChild(): unknown {
            return node;
          },
        };
      },
    };
    g.document = { querySelector: (s: string): unknown => (s === "#measure" ? MEAS : null) };
    try {
      expect(naturalWidth("<div></div>", "m")).toBe(100 + 2 + NODE_M * 2);
      widthAfterSet = node.style.width;
      // The measurer lays out at width:max-content under nowrap so step
      // ceilings cannot cap the read; the node itself is forced to auto.
      // (The measurer clears after reading, so assert on the recorded write.)
      expect(MEAS.writes[0]).toContain("width:max-content");
      expect(MEAS.writes[0]).toContain("white-space:nowrap");
      expect(widthAfterSet).toBe("auto");
    } finally {
      g.document = prev;
    }
  });

  it("naturalWidth offsetWidth fallback takes no +2, op discs are fixed", () => {
    // REJECTS a +2 applied to the fallback path (offsetWidth already
    // includes borders) and any computed op width (discs never measure).
    const g = globalThis as { document?: unknown };
    const prev = g.document;
    const node = {
      style: {},
      get scrollWidth(): number {
        return 0;
      },
      get offsetWidth(): number {
        return 100;
      },
    };
    const MEAS = {
      _h: "",
      get innerHTML(): string {
        return this._h;
      },
      set innerHTML(v: string) {
        this._h = v;
      },
      get firstChild(): unknown {
        return { get firstChild(): unknown { return node; } };
      },
    };
    g.document = { querySelector: (s: string): unknown => (s === "#measure" ? MEAS : null) };
    try {
      expect(naturalWidth("<div></div>", "m")).toBe(100 + NODE_M * 2);
      expect(naturalWidth("<div></div>", "op")).toBe(56);
    } finally {
      g.document = prev;
    }
    expect(naturalWidth("<div></div>", "m")).toBe(120);
  });

  it("measureH pins the candidate width in the fobjwrap context (D1, round 8.1)", () => {
    // REJECTS the D1 fiction (node laid out at stylesheet width, DP prices
    // one height for every candidate width) and the round-8 double count
    // (vertical margins added on top of a zeroed wrapper).
    const g = globalThis as { document?: unknown };
    const prev = g.document;
    let pinned = "";
    let pinnedMax = "";
    const node = {
      style: {} as Record<string, string>,
      classList: { contains: (c: string): boolean => c === "prim-node" },
    };
    const inner = {
      get offsetHeight(): number {
        return 54;
      },
      getBoundingClientRect(): { height: number } {
        return { height: 40 };
      },
      get firstChild(): unknown {
        return node;
      },
    };
    const MEAS = {
      _h: "",
      writes: [] as string[],
      get innerHTML(): string {
        return this._h;
      },
      set innerHTML(v: string) {
        this._h = v;
        (this.writes as string[]).push(v);
      },
      get firstChild(): unknown {
        return inner;
      },
    };
    g.document = { querySelector: (s: string): unknown => (s === "#measure" ? MEAS : null) };
    try {
      // max(offsetHeight, rect), no margins: 54, not 54+20 and not 40.
      expect(measureH('<div class="prim-node">x</div>', 200)).toBe(54);
      pinned = node.style.width;
      pinnedMax = node.style.maxWidth;
      expect(MEAS.writes[0]).toContain('class="fobjwrap"');
      expect(MEAS.writes[0]).toContain("width:200px");
      expect(pinned).toBe("180px");
      expect(pinnedMax).toBe("180px");
    } finally {
      g.document = prev;
    }
  });

  it("specMinW charges icon, chip bar, and pill caps (rounds 6, 7.2, 12.1)", () => {
    // REJECTS three past states: no icon reserve (round 6 clip), no chip
    // reserve (round 12.1 spill beside the chip bar), and uncapped pill runs
    // (round 7.2 banners).
    const plain = '<div class="prim-node" data-size="m"><span class="node-text"><code><span class="seg">abcdefghij</span></code></span></div>';
    const icon = '<div class="prim-node" data-size="m"><span class="prim-icon"><i data-lucide="search" data-fb="s"></i></span><span class="node-text"><code><span class="seg">abcdefghij</span></code></span></div>';
    expect(specMinW(icon) - specMinW(plain)).toBe(20);
    const chipped =
      '<div class="prim-node has-chip" data-size="m"><span class="op-chip" title="t"><span class="seg">&&</span></span><span class="node-main"><span class="node-text"><code><span class="seg">abcdefghij</span></code></span></span></div>';
    expect(specMinW(chipped)).toBeGreaterThan(specMinW(plain));
    expect(specMinW("no runs here")).toBe(0);
  });

  it("fitWidth never clips and never lies (round 10.1)", () => {
    // REJECTS a shrink that changes height (clip) or reports a width whose
    // height was never verified (lie). Staircase heights stand in for the DOM.
    const H = (w: number): number => (w >= 300 ? 40 : w >= 150 ? 60 : 80);
    const got = fitWidth("html", 360, 100, H);
    expect(got).toBeLessThanOrEqual(360);
    expect(got).toBeGreaterThanOrEqual(100);
    expect(H(got)).toBe(H(360));
    expect(fitWidth("html", 100, 100, H)).toBe(100);
    expect(fitWidth("html", 360, 0, () => 40)).toBe(0);
  });

  it("fillLevel water-fills short naturals first", () => {
    // REJECTS an even split that starves short nodes or overfeeds tall ones.
    expect(fillLevel([100, 100, 100], 300)).toBe(100);
    expect(fillLevel([50, 200, 200], 300)).toBeCloseTo(125, 5);
  });
});

describe("layout purity (criterion 2)", () => {
  it("planRows is deterministic and touches no DOM", () => {
    // REJECTS any impurity smuggled into the DP: with the document deleted,
    // two runs over the same inputs must agree exactly.
    const g = globalThis as { document?: unknown };
    const prev = g.document;
    (globalThis as { document?: undefined }).document = undefined;
    try {
      const H = (it: { id: string }, w: number): number => 40 + ((it.id.length + w) % 3) * 20;
      const items = [
        { id: "a", nat: 200, flex: true, minw: 80, html: "a" },
        { id: "b", nat: 300, flex: true, minw: 90, html: "b" },
        { id: "c", nat: 150, flex: false, html: "c" },
      ];
      const r1 = planRows(items, 716, 32, 22, 22, H);
      const r2 = planRows(items, 716, 32, 22, 22, H);
      expect(r2).toEqual(r1);
    } finally {
      g.document = prev;
    }
  });

  it("exact px ties pack early (round 7.4b)", () => {
    // REJECTS the pre-7.4b tiebreak: at avail 740 a scrolled single row
    // (46 + 62 hidden px) ties a two-row split (46 + 22 + 40) at 108 px. The
    // later split (fuller early rows) must win: an emptier first row with
    // room to spare reads broken while a fuller one costs the same.
    const H = (): number => 40;
    const items = [
      { id: "a", nat: 700, flex: false, html: "a" },
      { id: "b", nat: 60, flex: false, html: "b" },
    ];
    const plan = planRows(items, 740, 32, 22, 22, H);
    expect(plan.totalH).toBe(108);
    expect(plan.rows.length).toBe(2);
    expect(plan.rows[0].ids).toEqual(["a"]);
  });

  it("scroll survives only where nothing fits", () => {
    // REJECTS a DP that wraps below the unbreakable minimum (overflow out of
    // the foreignObject) or scrolls when wrap would do.
    const H = (): number => 40;
    const fits = planRows(
      [
        { id: "a", nat: 200, flex: true, minw: 80, html: "a" },
        { id: "b", nat: 200, flex: true, minw: 80, html: "b" },
      ],
      716, 32, 22, 22, H,
    );
    expect(fits.rows.every((r) => !r.scroll)).toBe(true);
    const forced = planRows([{ id: "a", nat: 900, flex: false, html: "a" }], 716, 32, 22, 22, H);
    expect(forced.rows[0].scroll).toBe(true);
  });
});

describe("bug-learned rules (criterion 6)", () => {
  it("parseTest paraphrases only exact equivalences", () => {
    // REJECTS interpretation of unproven forms: ! -a -o -nt compounds, ==
    // and =~ inside [, -v -t, and broken brackets all stay verbatim (null).
    expect(parseTest("[ -f board.db-shm ]")).toEqual({ op1: "board.db-shm", mid: "is a file?", op2: null });
    expect(parseTest('[[ $x == foo* ]]')).toEqual({ op1: "$x", mid: "matches the pattern", op2: "foo*" });
    expect(parseTest("[ -s somedir ]")).toEqual({ op1: "somedir", mid: "is non-empty?", op2: null });
    // Single-bracket string equality is its own table entry (pattern match
    // lives only in [[): dropping it must redden this check (M9).
    expect(parseTest('[ "$a" = b ]')).toEqual({ op1: '"$a"', mid: "equals", op2: "b" });
    for (const bad of [
      "[ ! -f x ]",
      "[ a -a b ]",
      "[ x -nt y ]",
      "[ $a == b ]",
      "[ $a =~ b ]",
      "[ -v var ]",
      "[ -t 0 ]",
      "[[ a && b ]]",
      "[ -f x",
      "[-f x ]",
      "[ -f 'unterminated ]",
      "test -f x",
    ])
      expect(parseTest(bad), bad).toBeNull();
    // Operands keep their quotes: verbatim, not cleaned.
    expect(parseTest('[ -f "$a" ]')?.op1).toBe('"$a"');
    // Generated words render prose-styled, operands code-styled.
    const h = testBodyHTML({ op1: "board.db-shm", mid: "is a file?", op2: null });
    expect(h).toContain("test-word");
    expect(h).toContain("<code>");
  });

  it("|| rides as a glyph-only chip, && keeps text (round 13.2)", () => {
    // REJECTS the pause-button text chip and any chip that drops the verbatim
    // sym from the data path.
    const or = chipHTML("||", "or");
    expect(or).toContain('data-lucide="circle-plus"');
    expect(or).not.toContain(">||<");
    // && keeps its seg-wrapped text (escaped in HTML).
    expect(chipHTML("&&", "and")).toContain("&amp;&amp;");
  });

  it("stdin edges run reversed, pipes tag, continuations hook", () => {
    // REJECTS three link regressions with three commands: an input after its
    // command must draw the reversed edge (round 9.2, head at the command
    // end); a pipe must draw one continuous edge with the glyph tag inline
    // (rounds 8.4/9.4); a wrapped statement must join rows with a hook edge
    // (round 7.7). The wrapped command is long enough to force two rows at
    // 716px under the stub geometry.
    const restore = installStub();
    try {
      resetStats("stdin");
      const hd = renderOne(0, "cat <<'EOF'\nhello world\nEOF", UB_STUB, { adopted: 0, avail: 716 });
      expect(hd.panelsHTML.join("")).toContain("prim-edge reversed");
      resetStats("pipe");
      const pipe = renderOne(1, "rg -n 'escapeHtml' wizardkit/toolkit.tsx | head -20", UB_STUB, {
        adopted: 0,
        avail: 716,
      });
      const pipeHTML = pipe.panelsHTML.join("");
      expect(pipeHTML).toContain('data-pipe="pipe"');
      expect(pipeHTML).not.toContain("prim-node op");
      resetStats("hook");
      const long = renderOne(
        2,
        "cd /home/sid/ai-scratch/split-utils && export DENO_DIR=/tmp/dsh/deno NPM_CONFIG_CACHE=/tmp/dsh/npm-cache && deno task check 2>&1 | tail -2 && echo done",
        UB_STUB,
        { adopted: 0, avail: 300 },
      );
      const longHTML = long.panelsHTML.join("");
      const rows = /data-rows="(\d+)"/.exec(longHTML);
      expect(rows && Number(rows[1]) > 1, "statement wraps to several rows").toBe(true);
      expect(longHTML).toContain("prim-edge hook");
    } finally {
      restore();
    }
  });

  it("every rendered token span is a verbatim source slice", () => {
    // REJECTS re-printed text: the verbatim invariant says every display
    // string derives from source slices, so every .seg content (unescaped)
    // must occur in its command. Runs over all 34 corpus cards.
    const restore = installStub();
    try {
      const unesc = (s: string): string =>
        s
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'");
      const all = [...CORPUS.map((c, i) => [c, i] as const), ...GCORPUS.map((c, i) => [c, 100 + i] as const)];
      let checked = 0;
      for (const [src, idx] of all) {
        resetStats("v" + idx);
        const r = renderOne(idx, src, UB_STUB, { adopted: 0, avail: 716 });
        for (const p of r.panelsHTML) {
          for (const m of p.matchAll(/<span class="seg">(.*?)<\/span>/g)) {
            const text = unesc(m[1]);
            expect(src.includes(text), `card ${idx} seg ${JSON.stringify(text)}`).toBe(true);
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(500);
    } finally {
      restore();
    }
  });
});

describe("ship-clean (criterion 7)", () => {
  it("no module imports the harness or the corpus", () => {
    // REJECTS a corpus leak into the shippable module: the 37KB fixture is
    // test-only. Every module file is read and scanned for the import.
    const modules = [
      "constants.ts",
      "text.ts",
      "primitives.ts",
      "parse.ts",
      "model.ts",
      "measure.ts",
      "layout.ts",
      "render.ts",
      "index.ts",
    ];
    for (const f of modules) {
      const src = readFileSync(`${DIR}/${f}`, "utf8");
      expect(src, f).not.toContain("corpus.fixture");
      expect(src, f).not.toContain("CORPUS");
      expect(src, f).not.toContain("GCORPUS");
    }
  });

  it("the DP prices with the shared fitWidth", () => {
    // Contract clause 5 says the DP prices and the render assigns through ONE
    // function, so cost cannot drift from drawing. Every other clause has a
    // test; this one only had its consequences tested. A copy of fitWidth
    // living in layout.ts with a subtle difference would satisfy every
    // existing check. This pins the mechanism instead of the symptom.
    const src = readFileSync(join(DIR, "layout.ts"), "utf8");
    expect(src).toContain('from "./measure.js"');
    expect(src).not.toContain("function fitWidth");
  });

  it("the built client bundle carries no corpus text", () => {
    // REJECTS a bundle that ships the fixture: the corpus signature string
    // must not appear in dist. (Nothing imports bash-graph yet, so no bundle
    // can change in this ticket; this pin holds the line for later tickets.)
    for (const f of ["client.js", "index.js"]) {
      const src = readFileSync(join(DIST, f), "utf8");
      expect(src, f).not.toContain("ai-scratch/split-utils");
    }
  });

  it("every class the renderer emits is styled or knowingly style-less", () => {
    // REJECTS renamed classes and deleted rules in EITHER direction: render
    // output class names must each resolve to a stylesheet rule, except the
    // two directional markers (reversed, hook) whose direction lives in the
    // path data, not in style — documented here, not folk knowledge. Runs
    // over all 34 corpus cards so every construct is covered.
    const css = readFileSync(`${DIR}/styles.css`, "utf8");
    expect(css).toContain(".fobjwrap>.prim-node{margin-top:0;margin-bottom:0;}");
    expect(css).toContain(".hd-label{white-space:nowrap;overflow-wrap:normal;word-break:normal;}");
    expect(css).toContain("max-width:220px");
    const open = (css.match(/{/g) || []).length;
    const close = (css.match(/}/g) || []).length;
    expect(close).toBe(open);
    expect(open).toBeGreaterThan(40);
    const restore = installStub();
    try {
      const seen = new Set<string>();
      const all = [...CORPUS, ...GCORPUS];
      all.forEach((src, i) => {
        resetStats("c" + i);
        const r = renderOne(i, src, UB_STUB, { adopted: 0, avail: 716 });
        for (const p of r.panelsHTML)
          for (const m of p.matchAll(/class="([^"]+)"/g))
            for (const c of m[1].split(" ")) seen.add(c);
      });
      expect(seen.size).toBeGreaterThan(15);
      const styleless = new Set(["reversed", "hook"]);
      const missing: string[] = [];
      for (const c of seen) {
        if (styleless.has(c)) continue;
        if (!css.includes("." + c)) missing.push(c);
      }
      expect(missing).toEqual([]);
    } finally {
      restore();
    }
  });
});
