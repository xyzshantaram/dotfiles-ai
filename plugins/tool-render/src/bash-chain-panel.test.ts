/**
 * Per-part conditional and exit-code pins at the card level, in the new
 * vocabulary (#173 stage two). The old file imported bash-diagram.ts. That
 * module is deleted. This file proves the same facts against bash-graph
 * instead, plus the new stylesheet voice.
 *
 * THE TRANSLATION. There is no chain panel anymore and no regrouping: one
 * `&&`/`||` chain is one segment, and each dependent command is its own
 * card carrying its own prefix chip. The base card carries none. Each card
 * keeps its own exit-code place. buildSpecs turns each node into its card
 * HTML, so the card level is where the BASE-BARE and DEPENDENT-MARKED facts
 * are proven: the base card has no chip element, each dependent card has
 * exactly one, and a hand-set code reaches exactly its own card.
 *
 * WHAT DIED HERE. chainPanelRows and every view test around it (old L59,
 * L97-L185) tested a builder and components that no longer exist. The 24
 * CSS tests (old L224-L604) pinned the dead tool-render-diagram rules.
 * Hole 10 replaces them below against bash-graph/styles.css. Hole 9
 * verdicts are stated with the old concept and its new answer, one by one.
 */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { installStub, resetStats } from "./bash-graph/geometry.stub.js";
import {
  buildNodes,
  buildSpecs,
  makeBuildContext,
  type ModelNode,
} from "./bash-graph/model.js";
import {
  splitLines,
  splitSemis,
  tokenizeParts,
  type UnbashScan,
} from "./bash-graph/parse.js";
import { renderOne, type CardResult } from "./bash-graph/render.js";

/** The production sync scan. BashRow passes this exact literal. */
const UB: UnbashScan = { status: "stable-unavailable", nodes: [] };

const DIR = dirname(fileURLToPath(import.meta.url));

const unesc = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** Render one command exactly as production renders it. */
function render(command: string): CardResult {
  const restore = installStub();
  try {
    resetStats("bash-chain-truth");
    return renderOne(31, command, UB, { adopted: 0, avail: 716 });
  } finally {
    restore();
  }
}

function panelText(panel: string): string {
  return unesc(panel.replace(/<[^>]*>/g, ""));
}

function shown(r: CardResult): string {
  return r.panelsHTML.map(panelText).join("\n");
}

function wordsSurvive(src: string, r: CardResult): void {
  const text = shown(r);
  for (const w of new Set(src.match(/[A-Za-z0-9_]+/g) ?? []))
    expect(text, `word ${JSON.stringify(w)}`).toContain(w);
}

/**
 * Card HTML strings of one segment, in node order, built exactly as
 * renderOne builds them.
 */
function cardsOf(src: string, li: number, si: number): string[] {
  const lines = splitLines(src);
  const ln = lines[li];
  const segs = splitSemis(src, ln.a, ln.b);
  let delimBase = 0;
  for (let k = 0; k < si; k++)
    delimBase += tokenizeParts(src, segs[k].a, segs[k].b).filter((t) => t.t === "delim").length;
  const sg = segs[si];
  const items = tokenizeParts(src, sg.a, sg.b);
  const ctx = makeBuildContext(9);
  const { nodes } = buildNodes(src, items, ln, { li, si }, UB, ctx, delimBase);
  return buildSpecs(src, nodes, ctx).map((s) => s.html);
}

/** Model nodes of one segment, for hand-setting exit codes. */
function nodesOf(src: string, li: number, si: number): ModelNode[] {
  const lines = splitLines(src);
  const ln = lines[li];
  const segs = splitSemis(src, ln.a, ln.b);
  const sg = segs[si];
  const items = tokenizeParts(src, sg.a, sg.b);
  const ctx = makeBuildContext(9);
  return buildNodes(src, items, ln, { li, si }, UB, ctx).nodes;
}

describe("the conditional rides only the dependent card", () => {
  // Re-points old L44 and L54 at the card level. The marker attaches ONLY
  // to the dependent part. The base runs unconditionally, so a marker
  // anywhere on it states something false.
  it("leaves the base card bare and chips rows 2 and 3", () => {
    const cards = cardsOf("a && b && c; d | e", 0, 0);
    expect(cards).toHaveLength(3);
    expect(cards[0]).not.toContain("op-chip");
    for (const card of [cards[1], cards[2]]) {
      expect(card).toContain("op-chip");
      expect(card).toContain("&amp;&amp;");
      expect(card).toContain("and: runs only if the previous step succeeded");
    }
  });

  it("keeps mixed operators per card, never collapsed to one marker", () => {
    const cards = cardsOf("a | b; c && d || e", 0, 1);
    expect(cards[0]).not.toContain("op-chip");
    expect(cards[1]).toContain("&amp;&amp;");
    expect(cards[2]).toContain("or: runs only if the previous step failed");
    // REJECTS a text || chip: the glyph-only chip reads as disjunction,
    // the literal text read as a pause button.
    expect(cards[2]).toContain('data-lucide="circle-plus"');
    expect(cards[2]).not.toContain(">||<");
  });
});

describe("every card keeps its own exit-code place", () => {
  // Re-points old L72 at the card level. The unit rule lives in
  // bash-graph/exit-code.test.ts. This proves the place: a code set on the
  // middle command reaches exactly its own card and leaks nowhere.
  it("carries a hand-set code on exactly its own card", () => {
    const nodes = nodesOf("a && b && c", 0, 0);
    let i = 0;
    for (const n of nodes) {
      if (n.kind !== "cmd") continue;
      if (i === 1) n.exitCode = 3;
      i++;
    }
    const cards = buildSpecs("a && b && c", nodes, makeBuildContext(9)).map((s) => s.html);
    expect(cards[0]).not.toContain("exit 3");
    expect(cards[1]).toContain("exit 3");
    expect(cards[2]).not.toContain("exit 3");
  });
});

describe("regrouped chains lose nothing", () => {
  // Re-points the six old L604 corpus tests. The regrouping is gone, so
  // this is a guard rail: every chained script still draws every part with
  // every word surviving.
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
    it(`keeps every word of ${JSON.stringify(command.slice(0, 48))}`, () => {
      const r = render(command);
      expect(r.panelsHTML.length).toBeGreaterThan(1);
      wordsSurvive(command, r);
    });
  }
});

/**
 * Extract one rule `{ ... }` block, anchored to `selector {` at a line
 * start. Every pin below asserts INSIDE the returned block: bare-substring
 * matches once stayed green on their own mutants in this file history, so
 * no pin here uses a whole-file substring for a value that appears
 * elsewhere. Kept from the old file. The technique survives. The rules do
 * not.
 */
function ruleBlock(css: string, selector: string): string {
  const at = css.indexOf("\n" + selector);
  expect(at).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  expect(open).toBeGreaterThan(at);
  const close = css.indexOf("}", open);
  expect(close).toBeGreaterThan(open);
  return css.slice(open, close + 1);
}

describe("the new stylesheet voice (hole 10)", () => {
  // Replaces all 24 dead CSS tests. Production injects this exact file
  // through stripBashGraphRoot (pinned in bash-tabs.test.ts). These pins
  // prove the shipped rules carry the new voice in both themes.
  const css = readFileSync(new URL("./bash-graph/styles.css", import.meta.url), "utf8");

  it("carries no rule from the dead vocabulary", () => {
    // REJECTS a ported old treatment: a dashed-border annotation or a
    // stage box smuggled into the new file would show up under the old
    // class names.
    expect(css).not.toContain("tool-render-diagram");
  });

  it("defines the syntax hues in both themes", () => {
    // The eight fair-copy hexes arrive in dark and light pairs. Syntax
    // colour is content language, and no host token expresses "this span
    // is a string". Both pairs are pinned, not just the dark one. They live
    // in the scoped .tool-render-bash-panel block in client.module.css —
    // the prototype :root stand-ins in styles.css were deleted (#336: the
    // page never saw them), so this is the production home, not a copy.
    const scoped = readFileSync(new URL("./client.module.css", import.meta.url), "utf8");
    for (const [dark, light] of [
      ["#9ece6a", "#2c7a2c"],
      ["#e0af68", "#9a5b00"],
      ["#7aa2f7", "#1d4fd7"],
      ["#bb9af7", "#6d28d9"],
    ]) {
      expect(scoped, dark).toContain(dark);
      expect(scoped, light).toContain(light);
    }
  });

  it("keeps the conditional chip bold against regular body text", () => {
    // The chip answers the argument text at a glance: bold operator bar,
    // regular-weight body. Block-scoped to the chip rule.
    const chip = ruleBlock(css, ".prim-node.has-chip .op-chip");
    expect(chip).toContain("font-weight:700");
  });

  it("caps pills with an explicit ellipsis, never a silent spill", () => {
    // Truncation states itself: front slice plus counts on the label, full
    // text one click away. The cap below is what keeps a long pill inside
    // its node instead of past the foreignObject edge (the 6 spilled pills
    // of the prototype history).
    const label = ruleBlock(css, ".prim-badge .pill-label");
    expect(label).toContain("max-width:220px");
    expect(label).toContain("text-overflow:ellipsis");
  });

  it("keeps the unbreakable guards on labels and tokens", () => {
    // The prototype broke mid-token three times on a 2px measurement
    // error. The guards forbid wraps the layout never priced, on both
    // axes.
    expect(ruleBlock(css, ".hd-label")).toContain("overflow-wrap:normal");
    expect(ruleBlock(css, ".seg")).toContain("white-space:nowrap");
  });

  it("derives the error tone from the theme token, never a hardcode", () => {
    const err = ruleBlock(css, '.prim-badge[data-tone="error"]');
    expect(err).toContain("var(--dsw-alias-state-error-primary)");
  });

  it("never caps a lone node: one command is never squeezed", () => {
    // Hole 1 support: a bare command draws as one uncapped node.
    expect(css).toContain('[data-size="lone"]');
  });

  it("ships the measurer context with the rules", () => {
    // The wiring guarantees #measure before every render. Its positioning
    // and the icon reserve arrive with this file, so measurement always
    // runs in the same context as the final panels.
    expect(css).toContain("#measure");
    expect(css).toContain("left:-9999px");
  });
});

describe("hole 9 verdicts: old concepts and their new answers", () => {
  // Each dead concept below gets its verdict stated once, with the test
  // that proves its replacement named.
  it("states where each dead concept went", () => {
    const css = readFileSync(`${DIR}/bash-graph/styles.css`, "utf8");
    // Tooltip sentence: the chip title carries the meaning in the new
    // model too ("and: runs only if ..."). Proven at the card level above.
    expect(cardsOf("a && b", 0, 0)[1]).toContain("and: runs only if the previous step succeeded");
    // Bare-box rule: no counterpart by design. Every node keeps its
    // outline. No earned-box class exists in the new file.
    expect(css).not.toContain("stage-bare");
    // Separator comment voice: no counterpart. Comments are cards now,
    // proven in bash-sequence.test.ts ("# comment" panels).
    expect(css).not.toContain("seq-sep");
    // Hug rule: the lone rule answers it (pinned above). Single-stage
    // flows hug by construction: one node, uncapped, no grow.
  });
});
