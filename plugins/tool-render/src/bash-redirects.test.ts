/**
 * Redirects render EXACTLY ONCE, in the new vocabulary (#173 stage two).
 * The old file imported bash-diagram.ts. That module is deleted. This file
 * proves the same facts against bash-graph instead, at both levels the old
 * file cared about: the model carries each redirect once, and the paint
 * shows each target text once (hole 8: paint-level exactly-once).
 *
 * WHY COUNTING, NOT ROUND-TRIP. The old file already knew: reconstruction
 * concatenates each region once, so a chip rendered twice still
 * reconstructs byte-exactly. Every test below therefore counts occurrences
 * in the rendered HTML. This file contains no round-trip assertion on
 * purpose. One here would pass on a duplicated model and prove nothing.
 *
 * WHAT DIED HERE. The owner's-framing pin (old L57) asserted the exact
 * command stays text. It now draws, stated below. attributeStatementRedirects
 * and its three unit tests (old L128-L165) tested a function that no longer
 * exists: the new model builds each segment once from its own tokens, so
 * the aliasing shape (one list appended to its own copy) cannot occur. The
 * old paint pins (L176-L184) named dead class names. The counts below name
 * the live ones.
 */
import { describe, expect, it } from "vitest";
import { installStub, resetStats } from "./bash-graph/geometry.stub.js";
import {
  buildNodes,
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

/** The owner's exact command text, byte for byte. */
const OWNER = "cd /home/sid/repos/dotfiles-ai && node build.mjs >/dev/null 2>&1";

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
    resetStats("bash-redirect-truth");
    return renderOne(41, command, UB, { adopted: 0, avail: 716 });
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

function html(r: CardResult): string {
  return r.panelsHTML.join("\n");
}

function wordsSurvive(src: string, r: CardResult): void {
  const text = shown(r);
  for (const w of new Set(src.match(/[A-Za-z0-9_]+/g) ?? []))
    expect(text, `word ${JSON.stringify(w)}`).toContain(w);
}

function count(text: string, sub: string): number {
  return text.split(sub).length - 1;
}

/** Model nodes of one segment, built exactly as renderOne builds them. */
function segNodes(src: string): ModelNode[] {
  const lines = splitLines(src);
  const ln = lines[0];
  const sg = splitSemis(src, ln.a, ln.b)[0];
  const items = tokenizeParts(src, sg.a, sg.b);
  const ctx = makeBuildContext(8);
  return buildNodes(src, items, ln, { li: 0, si: 0 }, UB, ctx).nodes;
}

describe("redirects render exactly once: COUNT, not round-trip", () => {
  it("draws the owner command with its redirect pair shown once each", () => {
    // Changed from old L57. The old renderer refused single-statement &&
    // chains, so the exact command stayed text. The fair copy folds && into
    // a chip and draws: one panel, the condition on the dependent card, the
    // redirect pair beside it. The counting pins below are the same defect
    // class as ever: each target text occurs exactly once in the paint.
    const r = render(OWNER);
    expect(r.panelsHTML).toHaveLength(1);
    const text = shown(r);
    expect(count(text, "/dev/null")).toBe(1);
    expect(count(text, "2>&1")).toBe(1);
    expect(text).toContain("&&");
    wordsSurvive(OWNER, r);
  });

  it("the owner redirect pair draws twice on a chain, not four times", () => {
    // Re-points old L70. Two panels (setup, then the owner line). The pair
    // lives on the second panel only, once each, and the first panel holds
    // neither.
    const command = "echo setup; " + OWNER;
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    const first = panelText(r.panelsHTML[0]);
    const second = panelText(r.panelsHTML[1]);
    expect(first).not.toContain("/dev/null");
    expect(count(second, "/dev/null")).toBe(1);
    expect(count(second, "2>&1")).toBe(1);
    expect(count(shown(r), "/dev/null")).toBe(1);
    expect(count(shown(r), "2>&1")).toBe(1);
    wordsSurvive(command, r);
  });

  it("a single command with two redirects draws both once", () => {
    // Re-points old L80. The plain path: one redirect node plus the bare
    // merge node, each painted once.
    const command = "node build.mjs >/dev/null 2>&1";
    const nodes = segNodes(command);
    const redirs = nodes.filter((n) => n.kind === "redir");
    expect(redirs.map((n) => (n.kind === "redir" ? n.op : null))).toEqual([">"]);
    expect(redirs.map((n) => (n.kind === "redir" ? n.text : null))).toEqual(["/dev/null"]);
    expect(nodes.filter((n) => n.kind === "op" && n.op === "2>&1")).toHaveLength(1);
    const text = shown(render(command));
    expect(count(text, "/dev/null")).toBe(1);
    expect(count(text, "2>&1")).toBe(1);
    wordsSurvive(command, render(command));
  });

  it("a redirect on the first of two panels draws once", () => {
    // Re-points old L90. The old defect doubled every operand with
    // redirects. The new model builds each segment from its own tokens, so
    // the doubling shape cannot occur. The count proves it.
    const command = "echo s; echo a >/tmp/first && echo b";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    expect(panelText(r.panelsHTML[0])).not.toContain("/tmp/first");
    expect(count(panelText(r.panelsHTML[1]), "/tmp/first")).toBe(1);
    expect(count(shown(r), "/tmp/first")).toBe(1);
    wordsSurvive(command, r);
  });

  it("a pipeline whose last stage carries redirects draws it once", () => {
    // Re-points old L100 at both levels: the model carries one redirect
    // node, and the target text occurs once in the paint.
    const single = segNodes("a | b >/tmp/o");
    const redirs = single.filter((n) => n.kind === "redir");
    expect(redirs).toHaveLength(1);
    expect(redirs[0].kind === "redir" && redirs[0].text).toBe("/tmp/o");
    const r = render("echo s; a | b >/tmp/o && echo d");
    expect(count(shown(r), "/tmp/o")).toBe(1);
    expect(html(r)).toContain("data-pipe=");
    wordsSurvive("echo s; a | b >/tmp/o && echo d", r);
  });

  it("two redirects on one stage draw two targets, each once", () => {
    // The old suite pinned this only through the owner pair. Two plain
    // outputs in a row pin the general shape: order kept, neither
    // duplicated, neither dropped.
    const command = "echo foo > f1 > f2";
    const nodes = segNodes(command);
    const redirs = nodes.filter((n) => n.kind === "redir");
    expect(redirs.map((n) => (n.kind === "redir" ? n.text : null))).toEqual(["f1", "f2"]);
    const text = shown(render(command));
    expect(count(text, "f1")).toBe(1);
    expect(count(text, "f2")).toBe(1);
    expect(text.indexOf("f1")).toBeLessThan(text.indexOf("f2"));
    wordsSurvive(command, render(command));
  });
});
