// Exit-code seam pins, ticket #180.
//
// Each check re-points one surviving truth-layer test at the new seam and
// names it, per criterion 4 (#173 moves the tests; this file proves the
// facts hold here). Per the repo convention every check states what buggy
// state it REJECTS, and the attribution checks discriminate in both
// directions: the positives fail against a seam that never attributes, the
// negatives fail against one that always does.

import { describe, expect, it } from "vitest";
import { splitLines, splitSemis, tokenizeParts, type UnbashScan } from "./parse.js";
import {
  attributeFinalSegment,
  attributePipeStages,
  attributeSequenceStages,
  buildNodes,
  buildSpecs,
  exitBadgeHTML,
  makeBuildContext,
  type ModelNode,
} from "./model.js";
import { installStub, resetStats } from "./geometry.stub.js";
import { renderOne } from "./render.js";

const UB: UnbashScan = { status: "stable-unavailable", nodes: [] };

/** Node list of one semicolon segment, built exactly as renderOne builds it. */
function segNodes(src: string, li: number, si: number): ModelNode[] {
  const lines = splitLines(src);
  const ln = lines[li];
  const sg = splitSemis(src, ln.a, ln.b)[si];
  const items = tokenizeParts(src, sg.a, sg.b);
  const ctx = makeBuildContext(0);
  return buildNodes(src, items, ln, { li, si }, UB, ctx).nodes;
}

/** Node lists of every rendered panel of a command, in render order. */
function allSegments(src: string): ModelNode[][] {
  const lines = splitLines(src);
  const out: ModelNode[][] = [];
  lines.forEach((ln, li) => {
    splitSemis(src, ln.a, ln.b).forEach((sg, si) => {
      const items = tokenizeParts(src, sg.a, sg.b);
      if (!items.length) return;
      const ctx = makeBuildContext(0);
      out.push(buildNodes(src, items, ln, { li, si }, UB, ctx).nodes);
    });
  });
  return out;
}

/** Per-cmd exit codes of one segment, in node order. */
function cmdCodes(nodes: ModelNode[]): (number | undefined)[] {
  const out: (number | undefined)[] = [];
  for (const n of nodes) if (n.kind === "cmd") out.push(n.exitCode);
  return out;
}

describe("exitBadgeHTML: the failed and non-failed treatment", () => {
  it("carries the old text, titles, and failed tone", () => {
    // REJECTS a pill that drops the failed tone, renames the text, or
    // invents new titles: the treatment ports client.tsx:1441-1471.
    const failed = exitBadgeHTML(1);
    expect(failed).toContain("exit 1");
    expect(failed).toContain('data-tone="error"');
    expect(failed).toContain("stage exit code 1 (failed)");
    const ok = exitBadgeHTML(0);
    expect(ok).toContain("exit 0");
    expect(ok).not.toContain("data-tone");
    expect(ok).toContain("stage exit code 0");
  });
});

describe("attributePipeStages: the ported rule", () => {
  it("re-points bash-diagram L210: named codes land on their stages", () => {
    // REJECTS a seam that never attributes (and any position swap).
    const coded = attributePipeStages(segNodes("false | cat", 0, 0), [
      { name: "false", exitCode: 1 },
      { name: "cat", exitCode: 0 },
    ]);
    expect(cmdCodes(coded)).toEqual([1, 0]);
  });

  it("re-points bash-diagram L218: the single code of a redirect command", () => {
    // REJECTS counting non-cmd nodes as stages: the segment holds a cmd
    // plus a redir node, and the length gate counts cmds only.
    const coded = attributePipeStages(segNodes("ls > out.txt", 0, 0), [
      { name: "ls", exitCode: 0 },
    ]);
    expect(cmdCodes(coded)).toEqual([0]);
  });

  it("re-points bash-diagram L223: bare entries attribute nothing", () => {
    // REJECTS always-attribute: bare {exitCode} entries are the #142
    // disqualification signal, and any doubt hides every code.
    const coded = attributePipeStages(segNodes("false | cat", 0, 0), [
      { exitCode: 1 },
      { exitCode: 0 },
    ]);
    expect(cmdCodes(coded)).toEqual([undefined, undefined]);
  });

  it("re-points bash-diagram L230: length mismatch, empty names, absence", () => {
    // REJECTS each dropped gate, one assert at a time.
    const base = segNodes("false | cat", 0, 0);
    expect(
      cmdCodes(
        attributePipeStages(base, [
          { name: "false", exitCode: 1 },
          { name: "cat", exitCode: 0 },
          { name: "extra", exitCode: 0 },
        ]),
      ),
    ).toEqual([undefined, undefined]);
    expect(
      cmdCodes(
        attributePipeStages(base, [
          { name: "", exitCode: 1 },
          { name: "cat", exitCode: 0 },
        ]),
      ),
    ).toEqual([undefined, undefined]);
    expect(cmdCodes(attributePipeStages(base, undefined))).toEqual([undefined, undefined]);
  });

  it("re-points bash-diagram L373: codes land alongside parsed args", () => {
    // REJECTS attribution that clobbers node data: the arg HTML survives.
    const base = segNodes("rg --context 2 pattern f.txt | sort", 0, 0);
    const coded = attributePipeStages(base, [
      { name: "rg", exitCode: 0 },
      { name: "sort", exitCode: 0 },
    ]);
    expect(cmdCodes(coded)).toEqual([0, 0]);
    for (const n of coded) {
      if (n.kind !== "cmd") continue;
      expect(typeof n.hl).toBe("string");
    }
  });

  it("never mutates the input nodes (the cached base stays clean)", () => {
    // REJECTS in-place attribution: the caller may hold the base cached.
    const base = segNodes("false | cat", 0, 0);
    attributePipeStages(base, [
      { name: "false", exitCode: 1 },
      { name: "cat", exitCode: 0 },
    ]);
    expect(cmdCodes(base)).toEqual([undefined, undefined]);
  });
});

describe("attributeSequenceStages: final group only, never a guess", () => {
  it("re-points bash-sequence L453: codes reach the final segment only", () => {
    // REJECTS coding earlier segments: PIPESTATUS holds the last pipeline.
    const coded = attributeSequenceStages(allSegments("a | b; c | d"), [
      { name: "c", exitCode: 1 },
      { name: "d", exitCode: 0 },
    ]);
    expect(coded.map(cmdCodes)).toEqual([
      [undefined, undefined],
      [1, 0],
    ]);
  });

  it("re-points bash-sequence L466: bare, mismatched, absent, or text-final", () => {
    // REJECTS dropped gates and chip-blindness, one assert at a time. The
    // final text group is "c && d | e": its && chip disqualifies it, the
    // same way the old model made it a text group instead of a diagram.
    const named = [
      { name: "c", exitCode: 1 },
      { name: "d", exitCode: 0 },
    ];
    expect(
      attributeSequenceStages(allSegments("a | b; c | d"), [{ exitCode: 1 }, { exitCode: 0 }]).map(
        cmdCodes,
      ),
    ).toEqual([
      [undefined, undefined],
      [undefined, undefined],
    ]);
    expect(
      attributeSequenceStages(allSegments("a | b; c | d"), [...named, { name: "e", exitCode: 0 }]).map(
        cmdCodes,
      ),
    ).toEqual([
      [undefined, undefined],
      [undefined, undefined],
    ]);
    expect(attributeSequenceStages(allSegments("a | b; c | d"), undefined).map(cmdCodes)).toEqual([
      [undefined, undefined],
      [undefined, undefined],
    ]);
    expect(attributeSequenceStages(allSegments("a | b; c && d | e"), named).map(cmdCodes)).toEqual([
      [undefined, undefined],
      [undefined, undefined, undefined],
    ]);
  });

  it("re-points bash-sequence L586: a final chain group never shows codes", () => {
    // REJECTS coding chained finals: a conditional script disqualifies
    // naming host-side, so there is nothing to attribute without guessing.
    const coded = attributeSequenceStages(allSegments("a && b; c && d"), [
      { name: "d", exitCode: 0 },
    ]);
    expect(coded.map(cmdCodes)).toEqual([[undefined, undefined], [undefined, undefined]]);
  });

  it("re-points bash-chain-panel L72: every part has its own code place", () => {
    // REJECTS a shared or single code field: hand-setting the middle
    // command's code reaches exactly that card and leaks nowhere.
    const nodes = segNodes("a && b && c", 0, 0);
    let i = 0;
    for (const n of nodes) {
      if (n.kind !== "cmd") continue;
      if (i === 1) n.exitCode = 3;
      i++;
    }
    expect(cmdCodes(nodes)).toEqual([undefined, 3, undefined]);
    const specs = buildSpecs("a && b && c", nodes, makeBuildContext(0));
    expect(specs).toHaveLength(3);
    expect(specs[0].html).not.toContain("exit 3");
    expect(specs[1].html).toContain("exit 3");
    expect(specs[2].html).not.toContain("exit 3");
  });
});

describe("renderOne carries the seam end to end", () => {
  it("shows codes on the final panel only", () => {
    // REJECTS wiring that codes every panel, or none: the pill must reach
    // the drawn card it belongs to and no other.
    const restore = installStub();
    try {
      resetStats("exit-final");
      const r = renderOne(0, "a | b; c | d", UB, { adopted: 0, avail: 716 }, [
        { name: "c", exitCode: 1 },
        { name: "d", exitCode: 0 },
      ]);
      expect(r.panelsHTML).toHaveLength(2);
      expect(r.panelsHTML[0]).not.toContain("exit ");
      expect(r.panelsHTML[1]).toContain("exit 1");
      expect(r.panelsHTML[1]).toContain("exit 0");
      expect(r.panelsHTML[1]).toContain('data-tone="error"');
    } finally {
      restore();
    }
  });

  it("renders a result-less command exactly as before", () => {
    // REJECTS any drawing change from the seam itself: no result attached
    // means the old path, byte for byte.
    const restore = installStub();
    try {
      resetStats("exit-none-a");
      const a = renderOne(1, "false | cat", UB, { adopted: 0, avail: 716 });
      resetStats("exit-none-b");
      const b = renderOne(1, "false | cat", UB, { adopted: 0, avail: 716 }, undefined);
      // Marker ids count up from a module-level counter, so the Nth svg of
      // two runs carries different numerals for the same construct; the
      // equivalence suite normalises arrN the same way before comparing.
      const norm = (s: string): string => s.replace(/arr\d+/g, "arr#");
      expect(b.panelsHTML.map(norm)).toEqual(a.panelsHTML.map(norm));
      expect(b.panelsHTML.join("")).not.toContain("exit ");
    } finally {
      restore();
    }
  });
});
