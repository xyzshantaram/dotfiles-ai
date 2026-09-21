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
