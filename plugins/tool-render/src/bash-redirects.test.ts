/**
 * Unit tests for #168: a redirect renders EXACTLY ONCE.
 *
 * WHY COUNTING, NOT ROUND-TRIP: the reconstruct/verify round-trip is
 * structurally blind to duplication — reconstruction concatenates each
 * region's slice once, in order, so a chip rendered twice still
 * reconstructs byte-exactly (the same blindness that let #160 ship swapped
 * heredoc bodies). Every test below therefore asserts the RENDERED COUNT —
 * model redirect entries against redirects in the command — and this file
 * contains no round-trip assertion on purpose: one here would pass on the
 * duplicated model and prove nothing.
 *
 * WHERE THE SECOND COPY CAME FROM (read at runtime, not guessed):
 * `attributeStatementRedirects` is called with an AndOr operand AS its own
 * statement for chain rows, and for a Command operand rawStages[0] === that
 * operand — so the operand's redirects were already in the lists when
 * `statement.redirects` (the same array) was appended again. The outer
 * chain statement carries NO redirects for these inputs and unbash reports
 * each redirect on exactly one node: one call site appending a list to its
 * own copy, not two call sites both firing and not a double-reporting
 * parser. The fix is the exactly-once guard inside that call site.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  attributeStatementRedirects,
  getBashDiagram,
  getBashSequenceDiagram,
  resolveBashTab,
  type BashSequenceChainGroup,
  type BashSequenceDiagram,
} from "./bash-diagram";

/** The owner's exact command text, byte for byte. */
const OWNER = "cd /home/sid/repos/dotfiles-ai && node build.mjs >/dev/null 2>&1";

function drawSequence(command: string): BashSequenceDiagram {
  const model = getBashSequenceDiagram(command);
  expect(model).not.toBeNull();
  if (model === null) throw new Error("unreachable");
  return model;
}

function chainOf(command: string): BashSequenceChainGroup {
  const model = drawSequence(command);
  const group = model.statements.find((s) => s.kind === "chain");
  if (group === undefined || group.kind !== "chain") throw new Error("expected a chain group");
  return group.chain;
}

/** Every redirect slice on every row of a chain, in order. */
function chainRedirects(chain: BashSequenceChainGroup): string[] {
  return chain.rows.flatMap((row) => row.stages.flatMap((s) => s.redirects.map((r) => r.slice)));
}

describe("redirects render exactly once: COUNT, not round-trip", () => {
  it("the owner's exact command alone renders as text (a single-statement && chain is not drawable)", () => {
    // Honest framing for the tests below: the quoted command is ONE
    // statement whose inner is AndOr, which v1 refuses by design — so the
    // chain panel in the owner's screenshot requires the sequence path
    // (the live command carried more than the quoted line). The counting
    // tests therefore embed the owner's EXACT bytes as a chain row; this
    // pin keeps that framing from silently changing into "the exact string
    // draws" if the predicates ever move.
    expect(getBashDiagram(OWNER)).toBeNull();
    expect(getBashSequenceDiagram(OWNER)).toBeNull();
    expect(resolveBashTab(OWNER, false).drawable).toBe(false);
  });

  it("the owner's exact redirect pair draws twice, not four times, on its chain row", () => {
    // The defect: `>/dev/null`, `2>&1` rendered as FOUR rows. The command
    // contains each exactly once; the model must carry each exactly once.
    const chain = chainOf("echo setup; " + OWNER);
    expect(chain.rows).toHaveLength(2);
    expect(chain.rows[0].stages[0].redirects).toHaveLength(0);
    expect(chain.rows[1].stages[0].redirects.map((r) => r.slice)).toEqual([">/dev/null", "2>&1"]);
    expect(chainRedirects(chain)).toEqual([">/dev/null", "2>&1"]);
  });

  it("a single command with two redirects and no chain draws both once", () => {
    // The non-chain path was already correct — this pins it so the fix
    // cannot "solve" chains by breaking the plain case.
    const model = getBashDiagram("node build.mjs >/dev/null 2>&1");
    expect(model).not.toBeNull();
    if (model === null) return;
    expect(model.stages).toHaveLength(1);
    expect(model.stages[0].redirects.map((r) => r.slice)).toEqual([">/dev/null", "2>&1"]);
  });

  it("a chain whose FIRST row carries redirects draws it once", () => {
    // The aliasing fired for EVERY Command operand with redirects, not just
    // the last row: the first row doubled too.
    const chain = chainOf("echo s; echo a >/tmp/first && echo b");
    expect(chain.rows).toHaveLength(2);
    expect(chain.rows[0].stages[0].redirects.map((r) => r.slice)).toEqual([">/tmp/first"]);
    expect(chain.rows[1].stages[0].redirects).toHaveLength(0);
    expect(chainRedirects(chain)).toEqual([">/tmp/first"]);
  });

  it("a pipeline whose last stage carries redirects draws it once", () => {
    // Pipeline operands never aliased (stages are distinct objects), so
    // these were correct before — pinned as the regression half.
    const single = getBashDiagram("a | b >/tmp/o");
    expect(single).not.toBeNull();
    if (single === null) return;
    expect(single.stages[0].redirects).toHaveLength(0);
    expect(single.stages[1].redirects.map((r) => r.slice)).toEqual([">/tmp/o"]);
    const chain = chainOf("echo s; a | b >/tmp/o && echo d");
    expect(chain.rows[0].stages[1].redirects.map((r) => r.slice)).toEqual([">/tmp/o"]);
    expect(chainRedirects(chain)).toEqual([">/tmp/o"]);
  });
});

describe("attributeStatementRedirects: NO OVER-CORRECTION (criterion 3)", () => {
  // No drawable command in the corpus carries statement-level redirects
  // (probes: they arrive on the inner node, or on Subshell/BraceGroup
  // statements that never classify), so only direct unit tests of the seam
  // can prove BOTH directions. Deleting the append would silence the
  // duplicate by dropping legitimate redirects — the first test proves the
  // duplicate is gone, the second proves the append still lands.
  const redirect = (pos: number, end: number, operator = ">") => ({
    pos,
    end,
    operator,
    target: { text: "x", pos: pos + 1, end, value: "x" },
  });

  it("an operand passed as its own statement is not attributed twice", () => {
    // The chain shape: rawStages[0] === statement, so statement.redirects
    // starts out already in the lists. Pre-fix this returned four entries.
    const op = { redirects: [redirect(49, 59), redirect(60, 64, ">&")] };
    const lists = attributeStatementRedirects(op, [op]);
    expect(lists).toHaveLength(1);
    expect(lists[0]).toHaveLength(2);
  });

  it("a redirect that lives only on the statement still lands exactly once", () => {
    // The load-bearing direction: the append exists for a span no stage
    // owns. Removing the loop (the over-correction) drops it to zero and
    // reddens here.
    const stageRedirect = redirect(5, 12);
    const statementOnly = redirect(20, 27);
    const lists = attributeStatementRedirects({ redirects: [statementOnly] }, [
      { redirects: [stageRedirect] },
    ]);
    expect(lists).toHaveLength(1);
    expect(lists[0]).toHaveLength(2);
    expect(lists[0][0]).toBe(stageRedirect);
    expect(lists[0][1]).toBe(statementOnly);
  });

  it("the same span reported on two distinct nodes draws once", () => {
    // The parser double-report shape the ticket raised: distinct objects,
    // identical bytes. The span guard (not just the identity guard) is what
    // catches it — deleting the span half reddens here while the aliasing
    // test above stays green.
    const onStage = redirect(49, 59);
    const onStatement = redirect(49, 59);
    expect(onStatement).not.toBe(onStage);
    const lists = attributeStatementRedirects({ redirects: [onStatement] }, [
      { redirects: [onStage] },
    ]);
    expect(lists[0]).toHaveLength(1);
    expect(lists[0][0]).toBe(onStage);
  });
});

describe("the view paints one chip per model redirect", () => {
  // Same honesty note as the #162/#164/#165 wiring pins: without a render
  // harness nothing here proves paint — only that each model redirect maps
  // to exactly one painted element, which is the defect class (a second
  // paint site per redirect would reintroduce the visual duplicate with a
  // correct model).
  const view = readFileSync(new URL("./client.tsx", import.meta.url), "utf8");

  it("each redirect paints exactly one endpoint element", () => {
    // One JSX site carries the endpoint class; comment mentions do not
    // match (the quotes anchor to the JSX attribute). A second paint site
    // is a branch drawing redirects around the loop and reddens here.
    const paints = view.match(/className="tool-render-diagram-endpoint"/g) ?? [];
    expect(paints).toHaveLength(1);
  });

  it("the redirect loop visits each entry once", () => {
    // The single `for (... < stage.redirects.length ...)` loop pushes one
    // element per entry (heredoc disclosure or endpoint span). Two loops
    // over the same list is the render-side double-draw. Anchored to the
    // loop comparison — the bare-stage predicate elsewhere also names
    // `stage.redirects.length`, so a plain substring count is two by
    // construction, not by defect.
    const loops = view.match(/r < stage\.redirects\.length/g) ?? [];
    expect(loops).toHaveLength(1);
    expect(view).toContain("<BashDiagramHeredoc endpoint={redirect} />");
  });
});
