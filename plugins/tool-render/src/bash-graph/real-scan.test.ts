// Real-scan pins, ticket #181.
//
// Every check here drives the renderer with a REAL unbash scan (criterion
// 5): the stub path ({ status: "stable-unavailable", nodes: [] }) never runs
// adoptSpans, so a stub-only test cannot see this ticket's defect class at
// all, which is exactly how it shipped. Each helper asserts the scan came
// back "ok", so a test that silently fell back to the stub fails loudly
// instead of passing blind.
//
// Criterion 7: each check names the buggy state it REJECTS, and the ticket
// report carries the mutation transcript (red on today's code first).

import { describe, expect, it } from "vitest";
import { installStub, resetStats } from "./geometry.stub.js";
import { unbashScan } from "./parse.js";
import { renderOne, type CardResult } from "./render.js";

const unesc = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** All displayed text of every panel, tags stripped, entities decoded. */
function shown(r: CardResult): string {
  return unesc(r.panelsHTML.join("\n").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/** Render on the REAL path: the scan must succeed, or the test is blind. */
async function renderReal(src: string, idx: number): Promise<{ r: CardResult; html: string }> {
  const ub = await unbashScan(src);
  expect(ub.status, `real scan of ${JSON.stringify(src)}`).toBe("ok");
  const restore = installStub();
  try {
    resetStats("t181_" + idx);
    const r = renderOne(idx, src, ub, { adopted: 0, avail: 716 });
    return { r, html: r.panelsHTML.join("\n") };
  } finally {
    restore();
  }
}

/**
 * The criterion-1 invariant in test form: every alphanumeric run of the
 * source survives somewhere in the displayed text. Generated captions add
 * words but must never remove them; a dropped operand fails here whatever
 * shape dropped it, including shapes this ticket never names.
 */
function assertWordsSurvive(src: string, r: CardResult): void {
  const text = shown(r);
  for (const w of new Set(src.match(/[A-Za-z0-9_]+/g) ?? []))
    expect(text, `word ${JSON.stringify(w)} of ${JSON.stringify(src)}`).toContain(w);
}

describe("subshell operands stay whole on the real path", () => {
  it("renders (a | b) with both operands and its wrapper", async () => {
    // REJECTS today's narrowing: adoptSpans snaps the span to unbash's inner
    // Command and the panel reads "a", denying the pipe, the operand and the
    // parens. Chosen outcome: faithful drawing (full text plus the true
    // subshell badge, the same picture the stub path already draws).
    const { r } = await renderReal("(a | b)", 0);
    expect(r.panelsHTML.length).toBe(1);
    expect(shown(r)).toContain("(a | b)");
    expect(shown(r)).toContain("subshell");
    assertWordsSurvive("(a | b)", r);
  });

  it("renders a && (b | c) with the whole dependent", async () => {
    // REJECTS today's "a && b": the second operand and the pipe vanish while
    // the && chip keeps asserting the conditional. Faithful drawing, as
    // above: the stub path proves the shape is drawable.
    const { r } = await renderReal("a && (b | c)", 1);
    expect(shown(r)).toContain("a");
    expect(shown(r)).toContain("(b | c)");
    expect(shown(r)).toContain("&&");
    assertWordsSurvive("a && (b | c)", r);
  });
});

describe("parenthesised heredocs keep their bodies on the real path", () => {
  it("shows the body and the terminator of (cat <<EOF ...)", async () => {
    // REJECTS today's "cat <<EOF": adoption narrows the one command span to
    // unbash's inner Command and the body plus terminator vanish with no
    // mark. Chosen outcome: honest degradation to unstructured-but-complete
    // text (the stub picture). A structured heredoc node inside parens would
    // be faithful too; silent loss is the one unacceptable answer.
    const src = "(cat <<EOF\nhi\nEOF\n)";
    const { r } = await renderReal(src, 2);
    expect(shown(r)).toContain("hi");
    expect(shown(r)).toContain("EOF");
    assertWordsSurvive(src, r);
  });
});

describe("heredoc bodies stay with the command that opened them", () => {
  it("attributes both bodies correctly when A opens first", async () => {
    // REJECTS the per-segment delim indexing: the second segment's first
    // delim read line.heredocs[0], so cat <<B displayed A's body ("one").
    // Attaching one command's input to another is a truth-layer violation.
    const src = "cat <<A; cat <<B\none\nA\ntwo\nB\n";
    const { r } = await renderReal(src, 3);
    expect(r.panelsHTML.length).toBe(2);
    const [p1, p2] = r.panelsHTML.map((p) => unesc(p.replace(/<[^>]*>/g, "")));
    expect(p1).toContain("one");
    expect(p1).not.toContain("two");
    expect(p2).toContain("two");
    expect(p2).not.toContain("one");
    assertWordsSurvive(src, r);
  });

  it("attributes both bodies correctly when B opens first", async () => {
    // REJECTS the same indexing from the other order: whichever command runs
    // second stole the first command's body. Both orders are pinned because
    // the index arithmetic is order-sensitive.
    const src = "cat <<B; cat <<A\ntwo\nB\none\nA\n";
    const { r } = await renderReal(src, 4);
    expect(r.panelsHTML.length).toBe(2);
    const [p1, p2] = r.panelsHTML.map((p) => unesc(p.replace(/<[^>]*>/g, "")));
    expect(p1).toContain("two");
    expect(p1).not.toContain("one");
    expect(p2).toContain("one");
    expect(p2).not.toContain("two");
    assertWordsSurvive(src, r);
  });
});

describe("backgrounding never reads as order", () => {
  it("draws a & b as one verbatim node, not a chain", async () => {
    // REJECTS today's lone "a": adoption narrows past "& b" and the second
    // statement vanishes. Chosen outcome: honest degradation to verbatim
    // (what the old renderer did: it refused this shape). A single node
    // draws no edge and claims no order.
    const { r, html } = await renderReal("a & b", 5);
    expect(r.panelsHTML.length).toBe(1);
    expect(shown(r)).toContain("a & b");
    expect(html).not.toContain("prim-edge");
    expect(html).not.toContain("data-pipe");
    assertWordsSurvive("a & b", r);
  });

  it("draws sleep 1 & true | false with no pipe claim", async () => {
    // REJECTS today's "sleep 1 false" with a pipe edge: the diagram asserted
    // a dataflow between two statements that never share one, while dropping
    // "& true" entirely. Verbatim degradation, as above; the pipe tag must
    // be gone because the pipe claim was the falsehood.
    const src = "sleep 1 & true | false";
    const { r, html } = await renderReal(src, 6);
    expect(r.panelsHTML.length).toBe(1);
    expect(shown(r)).toContain("sleep 1 & true | false");
    expect(html).not.toContain("prim-edge");
    expect(html).not.toContain("data-pipe");
    assertWordsSurvive(src, r);
  });
});

describe("the guard does not over-degrade", () => {
  it("still draws a real pipe as a pipe", async () => {
    // REJECTS the degenerate fix: refusing every adoption (or degrading
    // every segment) would pass the shape tests above while destroying what
    // the renderer is for. A genuine pipeline keeps its tagged link.
    const { html } = await renderReal("echo a | head -5", 7);
    expect(html).toContain('data-pipe="pipe"');
  });

  it("still folds a conditional into its chip", async () => {
    // REJECTS the same degenerate fix from the conditional side: a && b
    // keeps the && chip on the dependent card.
    const { html } = await renderReal("a && b", 8);
    expect(html).toContain("op-chip");
    expect(unesc(html)).toContain("&&");
  });

  it("still attaches a plain heredoc to its command", async () => {
    // REJECTS the same degenerate fix from the heredoc side: an ordinary
    // heredoc keeps its structured node and its expandable body.
    const src = "cat <<'EOF'\nhello world\nEOF";
    const { r, html } = await renderReal(src, 9);
    expect(html).toContain("[1:1]");
    expect(shown(r)).toContain("hello world");
    assertWordsSurvive(src, r);
  });
});

describe("compounds degrade to one verbatim node (ticket #187)", () => {
  const edgeCount = (html: string): number => (html.match(/prim-edge/g) || []).length;

  it("draws a for loop as one panel, never three", async () => {
    // REJECTS today's tear: splitSemis cut the semicolons inside the
    // construct, so `for f in a b`, `do echo $f` and `done` rendered as
    // three sibling command panels and the picture claimed `done` ran.
    const src = "for f in a b; do echo $f; done";
    const { r, html } = await renderReal(src, 30);
    expect(r.panelsHTML.length).toBe(1);
    expect(shown(r)).toContain("for f in a b; do echo $f; done");
    expect(edgeCount(html)).toBe(0);
    assertWordsSurvive(src, r);
  });

  it("draws an if as one panel, with its test words intact", async () => {
    // REJECTS the same tear for conditionals: `if [ -f x ]`, `then cat x`
    // and `fi` were three panels.
    const src = "if [ -f x ]; then cat x; fi";
    const { r, html } = await renderReal(src, 31);
    expect(r.panelsHTML.length).toBe(1);
    expect(shown(r)).toContain("if [ -f x ]; then cat x; fi");
    expect(edgeCount(html)).toBe(0);
    assertWordsSurvive(src, r);
  });

  it("draws a while with its redirect as one panel", async () => {
    // REJECTS the redirect landing on a panel reading `done < in.txt`: the
    // trailing redirect belongs to the loop, not to a command named done.
    const src = "while read l; do echo $l; done < in.txt";
    const { r, html } = await renderReal(src, 32);
    expect(r.panelsHTML.length).toBe(1);
    expect(shown(r)).toContain("while read l; do echo $l; done < in.txt");
    expect(shown(r)).toContain("in.txt");
    expect(edgeCount(html)).toBe(0);
    assertWordsSurvive(src, r);
  });

  it("draws a case as one panel, never two", async () => {
    // REJECTS today's two panels (`case $x in a) echo one` plus `esac`):
    // the `;;` arm terminator is body punctuation, not a statement split.
    const src = "case $x in a) echo one;; esac";
    const { r, html } = await renderReal(src, 33);
    expect(r.panelsHTML.length).toBe(1);
    expect(shown(r)).toContain("case $x in a) echo one;; esac");
    expect(edgeCount(html)).toBe(0);
    assertWordsSurvive(src, r);
  });

  it("draws no edge for a conditional inside a loop body", async () => {
    // REJECTS the invented top-level chain: the body's `||` was consumed
    // into a chip and drawn as dataflow between two panels. An ordering
    // claim is drawn, not written, so this counts EDGES: zero, not text.
    const src = "for f in *.ts; do deno check $f || exit 1; done";
    const { r, html } = await renderReal(src, 34);
    expect(r.panelsHTML.length).toBe(1);
    expect(edgeCount(html)).toBe(0);
    expect(html).not.toContain("data-pipe");
    expect(shown(r)).toContain("exit 1");
    assertWordsSurvive(src, r);
  });

  it("draws no pipe for a pipe inside a loop body", async () => {
    // REJECTS the same invention from the pipe side: the body's `|` drew a
    // tagged link between panels that are not siblings.
    const src = "for f in *.ts; do cat $f | head -1; done";
    const { r, html } = await renderReal(src, 35);
    expect(r.panelsHTML.length).toBe(1);
    expect(edgeCount(html)).toBe(0);
    expect(html).not.toContain("data-pipe");
    assertWordsSurvive(src, r);
  });

  it("keeps a multiline loop in one panel", async () => {
    // REJECTS the line-split twin of the semicolon tear: one statement per
    // line would draw `done` alone on its own panel.
    const src = "for f in a b\ndo\necho $f\ndone";
    const { r, html } = await renderReal(src, 36);
    expect(r.panelsHTML.length).toBe(1);
    expect(edgeCount(html)).toBe(0);
    assertWordsSurvive(src, r);
  });

  it("still splits plain semicolon siblings after a closed compound", async () => {
    // REJECTS the over-degrade: refusing every split past an opener would
    // fuse the compound with whatever follows it. The neighbours stay
    // neighbours; only the construct itself goes verbatim.
    const src = "echo before; for f in a b; do echo $f; done; echo after";
    const { r, html } = await renderReal(src, 37);
    expect(r.panelsHTML.length).toBe(3);
    expect(shown(r)).toContain("echo before");
    expect(shown(r)).toContain("for f in a b; do echo $f; done");
    expect(shown(r)).toContain("echo after");
    assertWordsSurvive(src, r);
  });
});

describe("review pins: keyword arguments must not steer the tracker (ticket #187)", () => {
  const edgeCount = (html: string): number => (html.match(/prim-edge/g) || []).length;

  it("does not draw `done` for a loop whose body echoes an argument named done", async () => {
    // REJECTS the precise lie this ticket exists to kill, back on valid
    // input: the body argument `done` in `echo else done` re-armed command
    // position, so the body's `done` closed the loop early and the real
    // terminator rendered as its own panel. Three panels with panel[1]
    // exactly `done`; the fix keeps the construct whole (2 panels).
    const src = "for f in a; do echo else done; done; echo after";
    const { r, html } = await renderReal(src, 40);
    expect(r.panelsHTML.length).toBe(2);
    expect(edgeCount(html)).toBe(0);
    const panels = r.panelsHTML.map((p) => unesc(p.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim());
    expect(panels.some((p) => p === "done")).toBe(false);
    expect(shown(r)).toContain("for f in a; do echo else done; done");
    expect(shown(r)).toContain("echo after");
    assertWordsSurvive(src, r);
  });

  it("does not fuse the sibling past a keyword-named case arm", async () => {
    // REJECTS the swallow: the arm label `for` in `for)` sat at command
    // position (it follows `in`), opened a second compound, and the single
    // `esac` could not close both, so `echo after` fused into the case node
    // (1 panel). The label is a pattern, not a command: 2 panels.
    const src = "case $x in for) echo hi;; esac; echo after";
    const { r, html } = await renderReal(src, 41);
    expect(r.panelsHTML.length).toBe(2);
    expect(edgeCount(html)).toBe(0);
    expect(shown(r)).toContain("case $x in for) echo hi;; esac");
    expect(shown(r)).toContain("echo after");
    assertWordsSurvive(src, r);
  });

  it("does not swallow the sibling when the body echoes `then for`", async () => {
    // REJECTS the same re-arm from `then`: the body argument `then` in
    // `echo then for` promoted `for` to command position, opening a compound
    // the single `done` could not close (1 panel). Two panels after.
    const src = "for f in a b; do echo then for; done; echo after";
    const { r, html } = await renderReal(src, 42);
    expect(r.panelsHTML.length).toBe(2);
    expect(edgeCount(html)).toBe(0);
    expect(shown(r)).toContain("for f in a b; do echo then for; done");
    expect(shown(r)).toContain("echo after");
    assertWordsSurvive(src, r);
  });

  it("still splits two plain siblings with no compound present", async () => {
    // REJECTS the fusion with NO compound at all: `then` as an argument of
    // `echo` re-armed command position and `for` opened a compound, fusing
    // two plain siblings into 1 panel. The property, not one shape: an
    // argument that spells like a keyword steers nothing.
    const src = "echo then for; echo after";
    const { r, html } = await renderReal(src, 43);
    expect(r.panelsHTML.length).toBe(2);
    expect(edgeCount(html)).toBe(0);
    expect(shown(r)).toContain("echo then for");
    expect(shown(r)).toContain("echo after");
    assertWordsSurvive(src, r);
  });

  it("does not open for a keyword-named second arm either", async () => {
    // REJECTS the second-arm twin: after a genuine `;;` separator the label
    // `for` IS at command position, so gating the re-arm is not enough; the
    // word before a depth-0 `)` is a pattern whatever follows the separator.
    // Without the pattern rule this fuses to 1 panel like the first arm did.
    const src = "case $x in a) echo one;; for) echo two;; esac; echo after";
    const { r, html } = await renderReal(src, 44);
    expect(r.panelsHTML.length).toBe(2);
    expect(edgeCount(html)).toBe(0);
    expect(shown(r)).toContain("case $x in a) echo one;; for) echo two;; esac");
    expect(shown(r)).toContain("echo after");
    assertWordsSurvive(src, r);
  });
});

describe("criterion 1 over further shapes", () => {  it("loses no word on the real path for every listed shape", async () => {
    // The general rule as a net: any fifth shape that narrows past dropped
    // text fails here without needing its own named test first.
    const shapes = [
      "(a)",
      "(a | b) | c",
      "a & b & c",
      "sleep 1 &",
      "(cat <<EOF\nhi\nEOF\n)\necho done",
      "cat <<A &\nbodyA\nA",
      "(a & b)",
      "a && (b) && c",
    ];
    let n = 0;
    for (const src of shapes) {
      const { r } = await renderReal(src, 20 + n);
      assertWordsSurvive(src, r);
      n++;
    }
    expect(n).toBe(shapes.length);
  });
});

describe("a case inside a subshell stays whole (ticket #340)", () => {
  const edgeCount = (html: string): number => (html.match(/prim-edge/g) || []).length;
  const panels = (r: CardResult): string[] =>
    r.panelsHTML.map((p) => unesc(p.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim());

  it("draws no `esac)` panel for a case inside a subshell", async () => {
    // REJECTS the tear: the arm `)` decremented the paren depth as though it
    // closed the subshell, so `;;` split at depth 0 and `esac)` drew as a
    // command. Two panels: the subshell whole, then the sibling.
    const src = "(case $x in a) echo hi;; esac); echo after";
    const { r, html } = await renderReal(src, 50);
    expect(r.panelsHTML.length).toBe(2);
    expect(edgeCount(html)).toBe(0);
    expect(panels(r).some((p) => p === "esac)" || p === "esac")).toBe(false);
    expect(shown(r)).toContain("(case $x in a) echo hi;; esac)");
    expect(shown(r)).toContain("echo after");
    assertWordsSurvive(src, r);
  });

  it("treats a keyword-named arm like an ordinary one inside a subshell", async () => {
    // REJECTS the same tear through `for)`: the cause is the inert tracker,
    // not the word, so ordinary and keyword arms must behave the same.
    const src = "(case $x in for) echo hi;; esac); echo after";
    const { r, html } = await renderReal(src, 51);
    expect(r.panelsHTML.length).toBe(2);
    expect(edgeCount(html)).toBe(0);
    expect(panels(r).some((p) => p === "esac)" || p === "esac")).toBe(false);
    expect(shown(r)).toContain("(case $x in for) echo hi;; esac)");
    expect(shown(r)).toContain("echo after");
    assertWordsSurvive(src, r);
  });

  it("holds star and alternation arms too", async () => {
    // REJECTS the tear where no word precedes the arm `)`: `*)` carries no
    // pending word, so the arm rule cannot depend on one being there.
    for (const [src, whole, idx] of [
      ["(case x in *) echo hi;; esac); echo after", "(case x in *) echo hi;; esac)", 52],
      ["(case x in a|b) echo hi;; esac); echo after", "(case x in a|b) echo hi;; esac)", 53],
    ] as [string, string, number][]) {
      const { r, html } = await renderReal(src, idx);
      expect(r.panelsHTML.length, src).toBe(2);
      expect(edgeCount(html), src).toBe(0);
      expect(panels(r).some((p) => p === "esac)" || p === "esac"), src).toBe(false);
      expect(shown(r), src).toContain(whole);
      expect(shown(r), src).toContain("echo after");
      assertWordsSurvive(src, r);
    }
  });

  it("holds an empty-bodied arm and a command substitution", async () => {
    // REJECTS the tear where the arm body is empty (`a);;`) and where the
    // case sits in `$(...)` rather than a plain subshell.
    for (const [src, whole, idx] of [
      ["(case x in a);; esac); echo after", "(case x in a);; esac)", 54],
      ["(echo $(case x in a) echo one;; esac)); echo after", "(echo $(case x in a) echo one;; esac))", 55],
    ] as [string, string, number][]) {
      const { r, html } = await renderReal(src, idx);
      expect(r.panelsHTML.length, src).toBe(2);
      expect(edgeCount(html), src).toBe(0);
      expect(shown(r), src).toContain(whole);
      expect(shown(r), src).toContain("echo after");
      assertWordsSurvive(src, r);
    }
  });

  it("holds a multiline subshell case in one panel", async () => {
    // REJECTS the line-split twin: the same miscounted arm `)` restored the
    // newline gate, so the construct drew as five panels down to a lone `)`.
    const src = "(case $x in a)\n echo hi;; esac\n); echo after";
    const { r, html } = await renderReal(src, 56);
    expect(r.panelsHTML.length).toBe(2);
    expect(edgeCount(html)).toBe(0);
    expect(panels(r).some((p) => p === "esac" || p === ")" || p === "esac)")).toBe(false);
    expect(shown(r)).toContain("echo after");
    assertWordsSurvive(src, r);
  });

  it("keeps non-command keywords inside parens out of the tracker", async () => {
    // LOCKS the paren-depth gate's good side: arithmetic identifiers, brace
    // expansion, array elements, loop-body function definitions and spaced
    // closers are valid bash whose keyword-spelled words must steer nothing.
    // Each draws exactly as many panels as siblings demand — no fusion.
    for (const [src, n, idx] of [
      ["((case+1)); echo after", 2, 57],
      ["echo {for,bar}; echo after", 2, 58],
      ["a=(for bar); echo after", 2, 59],
      ["(for f in a; do f() { echo hi; }; done); echo after", 2, 60],
      ["(for f in a; do echo $f; done ); echo after", 2, 61],
    ] as [string, number, number][]) {
      const { r } = await renderReal(src, idx);
      expect(r.panelsHTML.length, src).toBe(n);
      assertWordsSurvive(src, r);
    }
  });
});

describe("a non-empty subshell inside an open compound stays whole (ticket #340 round 2)", () => {
  const edgeCount = (html: string): number => (html.match(/prim-edge/g) || []).length;
  const panels = (r: CardResult): string[] =>
    r.panelsHTML.map((p) => unesc(p.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim());

  // REJECTS the 753c757 regression (both directions): compoundParenClose read
  // a GENUINE subshell/cmdsubst closer as a case-arm terminator whenever an
  // outer compound was still open and the frame ended with a word — nearly
  // every `(cmd args)` inside a loop/if/case body. The arm branch leaked the
  // frame, so the later `esac)`/`done`/`fi` popped the leaked frame, the
  // outer `(` never closed, the `;` never split, and the construct fused with
  // its sibling (1 panel instead of 2). Each shape below fused pre-fix.
  for (const [src, whole, idx] of [
    ["for f in a; do (echo hi); done; echo after", "for f in a; do (echo hi); done", 62],
    ["if true; then (echo hi); fi; echo after", "if true; then (echo hi); fi", 63],
    ["while true; do (echo hi); done; echo after", "while true; do (echo hi); done", 64],
    ["case $x in a) (echo hi);; esac; echo after", "case $x in a) (echo hi);; esac", 65],
    ["for f in a; do echo $(echo hi); done; echo after", "for f in a; do echo $(echo hi); done", 66],
    ["for f in a; do (echo hi;); done; echo after", "for f in a; do (echo hi;); done", 67],
    ["for f in a; do (echo a); (echo b); done; echo after", "for f in a; do (echo a); (echo b); done", 68],
    ["(case $x in a) (echo hi);; esac); echo after", "(case $x in a) (echo hi);; esac)", 69],
  ] as [string, string, number][]) {
    it(`draws 2 panels for ${src}`, async () => {
      const { r, html } = await renderReal(src, idx);
      expect(r.panelsHTML.length, src).toBe(2);
      expect(edgeCount(html), src).toBe(0);
      expect(panels(r).some((p) => p === "done" || p === "fi" || p === "esac"), src).toBe(false);
      expect(shown(r), src).toContain(whole);
      expect(shown(r), src).toContain("echo after");
      assertWordsSurvive(src, r);
    });
  }
});
