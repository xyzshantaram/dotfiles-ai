/**
 * Unit tests for the v2 sequence model in bash-diagram.ts (#160). String
 * parsing and model building only: no React render, no DOM, no snapshots.
 *
 * v1 (getBashDiagram) is untouched: single-statement commands keep their
 * exact trigger, and every multi-statement command is still null there. v2
 * (getBashSequenceDiagram) draws `;`/newline-separated scripts as an ordered
 * sequence of statement groups. Fidelity is the same slice-concatenation
 * invariant one level up: group slices plus verbatim separators, leading
 * and trailing regions reproduce the command byte for byte.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  attributeSequenceStages,
  sequenceUnitDiagramModel,
  clearBashSequenceCache,
  getBashDiagram,
  getBashSequenceDiagram,
  reconstructBashSequence,
  verifyBashSequence,
  type BashSequenceDiagram,
} from "./bash-diagram";

function draw(command: string): BashSequenceDiagram {
  const model = getBashSequenceDiagram(command);
  expect(model).not.toBeNull();
  if (model === null) throw new Error("unreachable");
  return model;
}

function text(command: string) {
  expect(getBashSequenceDiagram(command)).toBeNull();
}

function diagramsOf(model: BashSequenceDiagram) {
  return model.statements.filter((s) => s.kind === "diagram");
}

describe("ticket-named cases", () => {
  it("draws two statements each with pipelines", () => {
    const model = draw("a | b; c | d");
    expect(model.statements).toHaveLength(2);
    expect(model.separators).toEqual(["; "]);
    const kinds = model.statements.map((s) => s.kind);
    expect(kinds).toEqual(["diagram", "diagram"]);
    const first = model.statements[0];
    const second = model.statements[1];
    if (first.kind !== "diagram" || second.kind !== "diagram") throw new Error("unreachable");
    expect(first.unit.kind).toBe("pipeline");
    expect(first.unit.stages.map((s) => s.words)).toEqual(["a", "b"]);
    expect(second.unit.stages.map((s) => s.words)).toEqual(["c", "d"]);
    expect(verifyBashSequence("a | b; c | d", model)).toBe(true);
  });

  it("draws a statement with redirects beside one without", () => {
    const model = draw("ls > f; cat < in | sort");
    expect(model.statements).toHaveLength(2);
    const first = model.statements[0];
    const second = model.statements[1];
    if (first.kind !== "diagram" || second.kind !== "diagram") throw new Error("unreachable");
    expect(first.unit.kind).toBe("command");
    expect(first.unit.stages[0].redirects.map((r) => r.slice)).toEqual(["> f"]);
    expect(second.unit.kind).toBe("pipeline");
    expect(second.unit.stages.map((s) => s.words)).toEqual(["cat", "sort"]);
    expect(verifyBashSequence("ls > f; cat < in | sort", model)).toBe(true);
  });

  it("keeps a comment between statements inside the separator", () => {
    const command = "a | b; # comment\nc | d";
    const model = draw(command);
    expect(model.separators).toEqual(["; # comment\n"]);
    expect(verifyBashSequence(command, model)).toBe(true);
    expect(reconstructBashSequence(command, model)).toBe(command);
  });

  it("keeps a trailing `;` in the trailing region", () => {
    const command = "a | b; c | d;";
    const model = draw(command);
    expect(model.trailing).toEqual([{ kind: "gap", text: ";" }]);
    expect(verifyBashSequence(command, model)).toBe(true);
  });

  it("draws a `;`-and-`&&` mix as sequence + chain, markers on dependents (#162 2b supersession of v2's text-group marker)", () => {
    // v2 drew the `&&` statement as one verbatim text group with a group
    // badge — which marked the base too. #162 criterion 2b supersedes that:
    // the chain now draws, and each DEPENDENT row carries its own condition
    // while the base row carries none.
    const command = "a | b; c && d | e";
    const model = draw(command);
    expect(model.statements).toHaveLength(2);
    expect(model.statements[0].kind).toBe("diagram");
    const second = model.statements[1];
    if (second.kind !== "chain") throw new Error("expected a chain group");
    expect(second.chain.rows).toHaveLength(2);
    expect(second.chain.rows[0].conditional).toBeNull();
    expect(second.chain.rows[1].conditional).toBe("&&");
    expect(second.chain.rows.map((r) => r.kind)).toEqual(["command", "pipeline"]);
    expect(second.chain.rows[1].arrows.map((a) => a.operator)).toEqual(["|"]);
    expect(verifyBashSequence(command, model)).toBe(true);
    expect(reconstructBashSequence(command, model)).toBe(command);
  });

  it("carries the row's condition ACROSS THE RENDER SEAM, not just in the model (#162 review defect)", () => {
    // The defect this pins: the chain branch built the view's model inline
    // and omitted `conditional`, so the unit model was right and the SCREEN
    // was wrong — `a && b && c` drew as three bare rows. Every existing 2b
    // test passed throughout, because they all assert the model and none
    // asserted what the model hands to the view. Asserting the seam is the
    // only thing that can redden on a wiring defect.
    const model = draw("a && b && c; d | e");
    const chain = model.statements[0];
    if (chain.kind !== "chain") throw new Error("expected a chain group");
    const handed = chain.chain.rows.map((row) => sequenceUnitDiagramModel(row).conditional);
    // Base row unconditional (2b); both dependents name their own condition.
    expect(handed).toEqual([null, "&&", "&&"]);
    // The seam must not drop or invent anything else either.
    const first = sequenceUnitDiagramModel(chain.chain.rows[0]);
    expect(first.stages).toBe(chain.chain.rows[0].stages);
    expect(first.arrows).toBe(chain.chain.rows[0].arrows);
    expect(first.kind).toBe(chain.chain.rows[0].kind);
    expect(first.trailing).toEqual([]);
  });

  it("the view is WIRED to the seam: no branch builds the diagram model inline (#162 re-review)", () => {
    // Why this test is a source assertion and says so plainly: the test above
    // pins what the seam RETURNS, and the re-review proved that is not the
    // same thing — reverting only the call site in client.tsx reddened ZERO
    // tests, because nothing observed that the view CALLS the seam. Catching
    // that properly needs a render (react-dom/server or jsdom); this repo has
    // neither installed, and adding one is outside this ticket's allowlist.
    // So this pins the structure instead, and is honest about the limit: it
    // cannot prove the marker is painted, only that no branch has gone back
    // to hand-building the object, which is the defect CLASS both reviews
    // found. If a render harness ever lands, this test should be REPLACED by
    // one that asserts the marker's presence in rendered output, not kept
    // alongside it.
    //
    // #165: the chain branch no longer hands a model to BashCommandDiagram
    // directly — it renders <BashChainPanel>, which maps rows through
    // chainPanelRows (pinned in bash-chain-panel.test.ts). So exactly ONE
    // direct call site remains (the plain-diagram branch); the count below
    // would redden if either branch went back to an inline literal OR if a
    // third hand-rolled call site appeared.
    const source = readFileSync(new URL("./client.tsx", import.meta.url), "utf8");
    // The plain-diagram branch hands a model to BashCommandDiagram.
    const wired = source.match(/<BashCommandDiagram\s+model=\{sequenceUnitDiagramModel\(/g) ?? [];
    expect(wired).toHaveLength(1);
    // An inline object literal is exactly how `conditional` got dropped twice.
    expect(source).not.toMatch(/<BashCommandDiagram\s+model=\{\{/);
  });

  it("draws the exact command from the ticket description", () => {
    const command =
      'journalctl ... | rg ... | tail -8; echo "=== harness uptime ==="; ' +
      "ps -eo ... | rg ... | rg -v rg | head -1 | cut -c1-75";
    const model = draw(command);
    expect(model.statements).toHaveLength(3);
    const [first, middle, last] = model.statements;
    if (first.kind !== "diagram" || middle.kind !== "diagram" || last.kind !== "diagram") {
      throw new Error("expected three diagram groups");
    }
    expect(first.unit.kind).toBe("pipeline");
    expect(first.unit.stages).toHaveLength(3);
    // The plain `echo` between the pipelines draws as one block rather than
    // sinking the whole script back to text.
    expect(middle.unit.kind).toBe("command");
    expect(middle.unit.stages).toHaveLength(1);
    expect(last.unit.kind).toBe("pipeline");
    expect(last.unit.stages).toHaveLength(5);
    expect(verifyBashSequence(command, model)).toBe(true);
    expect(reconstructBashSequence(command, model)).toBe(command);
  });
});

describe("scope boundaries", () => {
  it("leaves single-statement commands to v1", () => {
    // The ticket's B command draws in v1; the sequence predicate owns only
    // multi-statement scripts, so it stays null here by construction.
    const command = 'journalctl --user --since "-60 min" --no-pager 2>/dev/null | rg -i "..." | tail -15';
    text(command);
    expect(getBashDiagram(command)).not.toBeNull();
  });

  it("leaves any backgrounded statement as whole-script text", () => {
    // `&` runs concurrently, so even the ordering claim would be false.
    text("sleep 1 & true | false");
    text("a | b &");
    text("a | b; c | d &");
    text("a & b | c");
  });

  it("renders subshells and compounds as verbatim text groups, not stages", () => {
    const model = draw("(a | b); c | d");
    expect(model.statements.map((s) => s.kind)).toEqual(["text", "diagram"]);
    const first = model.statements[0];
    if (first.kind !== "text") throw new Error("unreachable");
    expect(first.slice).toBe("(a | b)");
    expect(first.conditional).toBeNull();
    expect(verifyBashSequence("(a | b); c | d", model)).toBe(true);
  });

  it("draws `||` and mixed chains with per-row markers more specific than a group badge (#162 2b supersession)", () => {
    // v2 described the WHOLE statement with one conditional string. #162
    // 2b supersedes that: the chain rows carry their own operators, so a
    // mixed chain can say exactly which row runs on which condition.
    const orOnly = draw("a | b; c || d | e");
    const orGroup = orOnly.statements[1];
    if (orGroup.kind !== "chain") throw new Error("unreachable");
    expect(orGroup.chain.rows[0].conditional).toBeNull();
    expect(orGroup.chain.rows[1].conditional).toBe("||");
    const mixed = draw("a | b; c && d || e");
    const mixedGroup = mixed.statements[1];
    if (mixedGroup.kind !== "chain") throw new Error("unreachable");
    expect(mixedGroup.chain.rows.map((r) => r.conditional)).toEqual([null, "&&", "||"]);
  });

  it("draws newline-separated statements with a bare separator", () => {
    const command = "a | b\nc | d";
    const model = draw(command);
    expect(model.separators).toEqual(["\n"]);
    expect(verifyBashSequence(command, model)).toBe(true);
  });

  it("keeps a leading comment in the leading gap", () => {
    const command = "# lead\na | b; c | d";
    const model = draw(command);
    expect(model.leadingGap).toBe("# lead\n");
    expect(verifyBashSequence(command, model)).toBe(true);
  });

  it("draws trivial single commands as one block each", () => {
    const model = draw("a; b; c");
    expect(model.statements).toHaveLength(3);
    for (const group of model.statements) {
      if (group.kind !== "diagram") throw new Error("unreachable");
      expect(group.unit.stages).toHaveLength(1);
    }
    expect(verifyBashSequence("a; b; c", model)).toBe(true);
  });

  it("keeps per-statement `!`/`time` badges", () => {
    const model = draw("! a | b; c | d");
    const first = model.statements[0];
    if (first.kind !== "diagram") throw new Error("unreachable");
    expect(first.unit.negated).toBe(true);
    expect(first.unit.leadingGap).toBe("! ");
    const timed = draw("time a | b; c | d");
    const timedFirst = timed.statements[0];
    if (timedFirst.kind !== "diagram") throw new Error("unreachable");
    expect(timedFirst.unit.timed).toBe(true);
  });

  it("leaves empties, parse failures and the size cap as text", () => {
    text("");
    text("   ");
    text("a | b; c |");
    text("(((");
    text("# only a comment");
    text("a | " + "b".repeat(20000));
  });
});

describe("heredocs across statements", () => {
  it("attributes same-line bodies per stage with literal anchors", () => {
    const command = "cat <<A; cat <<B\nhi A\nA\nbody B\nB";
    const model = draw(command);
    expect(model.statements).toHaveLength(2);
    const first = model.statements[0];
    const second = model.statements[1];
    if (first.kind !== "diagram" || second.kind !== "diagram") throw new Error("unreachable");
    // Load-bearing literals: a swapped attribution still reconstructs
    // cleanly, so these bodies (not the round-trip) prove correctness.
    expect(first.unit.stages[0].redirects[0].heredoc?.body).toBe("hi A\n");
    expect(second.unit.stages[0].redirects[0].heredoc?.body).toBe("body B\n");
    expect(verifyBashSequence(command, model)).toBe(true);
    expect(reconstructBashSequence(command, model)).toBe(command);
  });

  it("refuses bodies from an earlier line instead of misattributing them", () => {
    // Bodies follow their own line; a global carve from the last line would
    // attribute the wrong text, so the script stays text.
    text("cat <<EOF\nhello\nEOF\nc | d");
  });

  it("refuses a SECOND heredoc whose body sits on an earlier line (#160 review)", () => {
    // This pins the same-line guard itself, which was reported as unreachable
    // defense-in-depth. It is not: the review found the input that reaches it.
    //
    // Remove the guard and this command DRAWS -- reconstructs byte-for-byte,
    // verifies true -- and yet BOTH heredoc bodies come out as "" instead of
    // "bodyA\n" and "A\n". A diagram that misquotes while passing every
    // fidelity check is precisely the failure the slice invariant exists to
    // prevent, and round-tripping cannot see it.
    //
    // The pre-existing case above does NOT cover this: it stays null in both
    // variants, via an unrelated downstream null, which is exactly why the
    // suite stayed green when the guard was disabled.
    text("cat <<A\nbodyA\nA\ncat <<B\nA\nB");
  });

  it("keeps a text group's heredoc bodies verbatim when nothing carves", () => {
    // Refined rule (#160 review): the subshell's body has nowhere to
    // attribute inside a verbatim slice, so it rides in the trailing gap —
    // exact while no DIAGRAM group carves bodies of its own (the other
    // direction is refused below).
    const command = "a | b; (cat <<EOF)\nhello\nEOF";
    const model = draw(command);
    expect(model.statements.map((s) => s.kind)).toEqual(["diagram", "text"]);
    expect(model.trailing).toEqual([{ kind: "gap", text: "\nhello\nEOF" }]);
    expect(verifyBashSequence(command, model)).toBe(true);
    expect(reconstructBashSequence(command, model)).toBe(command);
  });

  it("still refuses a carve alongside verbatim text-group bodies", () => {
    // Bodies serialize in global operator order: carving the diagram
    // group's body while a text group's bodies ride verbatim could attribute
    // the wrong bytes to an endpoint and still reconstruct cleanly — the one
    // failure the round-trip cannot catch — so these scripts stay text in
    // both orders.
    text("(cat <<B); cat <<A\nbodyB\nB\nbodyA\nA");
    text("cat <<A; (cat <<B)\nbodyA\nA\nbodyB\nB");
  });
});

describe("owner fixture #160: heredoc-that-is-shell plus && and ; in one command", () => {
  // Verbatim from the ticket: a `cd && cat`-with-heredoc first statement
  // whose body is itself shell (with a NESTED heredoc, 'PY'), then
  // `bash m3.sh; echo ...`. The body is DATA: unbash consumes it lexically
  // to the `EOF` line, so its `;`, `&&` and `if/then/else` never become
  // structure — pinned here by the statement count and slices.
  const BODY = [
    "set -euo pipefail",
    "new() {",
    "\tlocal rc=0",
    "\tif python3 - <<'PY'",
    "import sys; sys.exit(1)",
    "PY",
    "\tthen rc=0; else rc=$?; fi",
    '\techo "  NEW: warning path reached (rc=$rc); continuing"',
    "\treturn 0",
    "}",
    "new",
    'echo "  NEW: later steps still run"',
    "EOF",
  ].join("\n");
  const FIXTURE = "cd /tmp && cat > m3.sh <<'EOF'\n" + BODY + '\nbash m3.sh; echo "script exit=$?"';
  // Variant with a pipe: `;` (order), `&&` (condition) and `|` (dataflow)
  // appear together, each with its own marker.
  const WITH_PIPE =
    "cd /tmp && cat > m3.sh <<'EOF'\n" + BODY + '\nbash m3.sh | tail -3; echo "script exit=$?"';

  function drawnStages(model: BashSequenceDiagram): { slice: string; words: string }[] {
    const out: { slice: string; words: string }[] = [];
    for (const group of model.statements) {
      if (group.kind === "diagram") {
        for (const stage of group.unit.stages) out.push({ slice: stage.slice, words: stage.words });
      }
    }
    return out;
  }

  it("draws the fixture: text-conditional first, blocks after, body verbatim", () => {
    const model = draw(FIXTURE);
    // The body's `;`/`if` did not leak into structure: exactly the three
    // outer statements, with exact slices.
    expect(model.statements).toHaveLength(3);
    expect(model.statements.map((s) => s.kind)).toEqual(["text", "diagram", "diagram"]);
    const first = model.statements[0];
    if (first.kind !== "text") throw new Error("unreachable");
    expect(first.slice).toBe("cd /tmp && cat > m3.sh <<'EOF'");
    // `&&` is NOT collapsed into `;`: the condition rides on the group.
    expect(first.conditional).toBe("&&");
    // The `;` between the outer statements is the order marker's source.
    expect(model.separators[1]).toBe("; ");
    // The whole heredoc body (nested `<<'PY'` included) rides verbatim in
    // the first separator — between its statement and the next, never drawn.
    expect(model.separators[0]).toContain("import sys; sys.exit(1)");
    expect(model.separators[0]).toContain("<<'PY'");
    // Nothing in the body became a stage: the only drawn stages are the two
    // plain outer commands.
    expect(drawnStages(model).map((s) => s.words)).toEqual(["bash m3.sh", 'echo "script exit=$?"']);
    for (const stage of drawnStages(model)) {
      expect(stage.slice).not.toContain("sys.exit");
      expect(stage.slice).not.toContain("warning path");
    }
    expect(verifyBashSequence(FIXTURE, model)).toBe(true);
    expect(reconstructBashSequence(FIXTURE, model)).toBe(FIXTURE);
  });

  it("tells order, condition and dataflow apart in the pipe variant", () => {
    const model = draw(WITH_PIPE);
    expect(model.statements.map((s) => s.kind)).toEqual(["text", "diagram", "diagram"]);
    const first = model.statements[0];
    const middle = model.statements[1];
    if (first.kind !== "text" || middle.kind !== "diagram") throw new Error("unreachable");
    // Condition: named on the group, never an arrow.
    expect(first.conditional).toBe("&&");
    // Dataflow: a typed pipe arrow inside the middle group only.
    expect(middle.unit.kind).toBe("pipeline");
    expect(middle.unit.arrows.map((a) => a.operator)).toEqual(["|"]);
    // Order: the verbatim separators feed the "then ↓" markers, which share
    // no glyph with the `|` arrow above.
    expect(model.separators[1]).toBe("; ");
    expect(model.separators[0]).toContain("EOF\n");
    expect(drawnStages(model).map((s) => s.words)).toEqual([
      "bash m3.sh",
      "tail -3",
      'echo "script exit=$?"',
    ]);
    expect(verifyBashSequence(WITH_PIPE, model)).toBe(true);
    expect(reconstructBashSequence(WITH_PIPE, model)).toBe(WITH_PIPE);
  });
});

describe("fidelity corpus: sequences reconstruct exactly", () => {
  const corpus = [
    "a | b; c | d",
    "a|b;c|d",
    "a | b ; c | d",
    "a | b  ;  c | d",
    "a | b;#nospace\nc | d",
    "a | b; c | d;",
    "a | b\nc | d",
    "a | b; c | d; e | f",
    "ls > f; cat < in | sort",
    "echo hi; echo lo",
    "a | b; c && d | e",
    "a | b; c || d | e",
    "(a | b); c | d",
    "a | b; (c | d)",
    "! a | b; c | d",
    "time a | b; c | d",
    "a | b |& c; d | e",
    "cat <<A; cat <<B\nhi A\nA\nbody B\nB",
    "a | b; cat <<EOF\nhello\nEOF",
    "# lead\na | b; c | d",
    "  a | b; c | d  ",
    "a | b; c | d # trailing",
  ];
  for (const command of corpus) {
    it(`reconstructs ${JSON.stringify(command.slice(0, 48))}`, () => {
      const model = getBashSequenceDiagram(command);
      expect(model).not.toBeNull();
      if (model === null) return;
      expect(verifyBashSequence(command, model)).toBe(true);
      expect(reconstructBashSequence(command, model)).toBe(command);
    });
  }
});

describe("exit codes: final statement group only, never a guess", () => {
  it("shows codes on the final group when names match its stages", () => {
    const coded = attributeSequenceStages(draw("a | b; c | d"), [
      { name: "c", exitCode: 1 },
      { name: "d", exitCode: 0 },
    ]);
    const first = coded.statements[0];
    const last = coded.statements[1];
    if (first.kind !== "diagram" || last.kind !== "diagram") throw new Error("unreachable");
    // Earlier lines were never captured: no codes there, even named ones.
    expect(first.unit.stages.map((s) => s.exitCode)).toEqual([undefined, undefined]);
    expect(last.unit.stages.map((s) => s.exitCode)).toEqual([1, 0]);
  });

  it("shows no codes for bare entries, mismatches, or a final text group", () => {
    const named = [
      { name: "c", exitCode: 1 },
      { name: "d", exitCode: 0 },
    ];
    // Bare entries are the #142 disqualification signal (compound scripts
    // carry codes without attributable names).
    expect(
      attributeSequenceStages(draw("a | b; c | d"), [{ exitCode: 1 }, { exitCode: 0 }]).statements.map((s) =>
        s.kind === "diagram" ? s.unit.stages.map((x) => x.exitCode) : [],
      ),
    ).toEqual([[undefined, undefined], [undefined, undefined]]);
    // Length mismatch.
    expect(
      attributeSequenceStages(draw("a | b; c | d"), [...named, { name: "e", exitCode: 0 }]).statements.map((s) =>
        s.kind === "diagram" ? s.unit.stages.map((x) => x.exitCode) : [],
      ),
    ).toEqual([[undefined, undefined], [undefined, undefined]]);
    // Absent entirely (backgrounded calls carry no key at all).
    expect(
      attributeSequenceStages(draw("a | b; c | d"), undefined).statements.map((s) =>
        s.kind === "diagram" ? s.unit.stages.map((x) => x.exitCode) : [],
      ),
    ).toEqual([[undefined, undefined], [undefined, undefined]]);
    // A final text group (conditional scripts are unnamed host-side) shows none.
    const cond = attributeSequenceStages(draw("a | b; c && d | e"), named);
    expect(cond.statements.map((s) => (s.kind === "diagram" ? s.unit.stages.map((x) => x.exitCode) : null))).toEqual([
      [undefined, undefined],
      null,
    ]);
  });

  it("never mutates the cached base model", () => {
    clearBashSequenceCache();
    const base = draw("a | b; c | d");
    attributeSequenceStages(base, [
      { name: "c", exitCode: 1 },
      { name: "d", exitCode: 0 },
    ]);
    const first = base.statements[0];
    const last = base.statements[1];
    if (first.kind !== "diagram" || last.kind !== "diagram") throw new Error("unreachable");
    expect(first.unit.stages.map((s) => s.exitCode)).toEqual([undefined, undefined]);
    expect(last.unit.stages.map((s) => s.exitCode)).toEqual([undefined, undefined]);
    expect(getBashSequenceDiagram("a | b; c | d")).toBe(base);
  });
});

describe("#162 criterion 2b: the && chain's base carries NO marker", () => {
  it("draws a three-deep && chain with markers on rows 2 and 3 only", () => {
    // THE ticket's ownership test. The base of a && chain runs
    // unconditionally, so a marker anywhere on it is a false claim about
    // `a`; the markers describe b's and c's RIGHT TO RUN.
    const command = "a && b && c; d | e";
    const model = draw(command);
    expect(model.statements).toHaveLength(2);
    const first = model.statements[0];
    if (first.kind !== "chain") throw new Error("expected a chain group");
    const rows = first.chain.rows;
    expect(rows).toHaveLength(3);
    // Base: no marker of ANY kind.
    expect(rows[0].conditional).toBeNull();
    expect(rows[1].conditional).toBe("&&");
    expect(rows[2].conditional).toBe("&&");
    expect(first.chain.separators).toEqual([" && ", " && "]);
    expect(first.chain.operators).toEqual(["&&", "&&"]);
    // And the last statement after the `;` is its own plain pipeline.
    const last = model.statements[1];
    if (last.kind !== "diagram") throw new Error("expected a diagram group");
    expect(last.unit.stages.map((s) => s.words)).toEqual(["d", "e"]);
    expect(verifyBashSequence(command, model)).toBe(true);
    expect(reconstructBashSequence(command, model)).toBe(command);
  });

  it("keeps || chains marked 'runs only if the previous failed' on dependents", () => {
    const command = "cd a || cd b; echo done";
    const model = draw(command);
    const first = model.statements[0];
    if (first.kind !== "chain") throw new Error("expected a chain group");
    expect(first.chain.rows.map((r) => r.conditional)).toEqual([null, "||"]);
    expect(verifyBashSequence(command, model)).toBe(true);
  });

  it("keeps the heredoc-bearing && statement a verbatim text group (no carve inside chains)", () => {
    // The OWNER'S fixture: `cd /tmp && cat > m3.sh <<'EOF'` + body. The
    // chain must refuse here (the heredoc body's carriage lives in the
    // separators), so the statement is drawn VERBATIM exactly as #160 did,
    // with respect for #160's body-riders-verbatim rule.
    const body = "set -uo pipefail\nhi\nEOF";
    const command = "cd /tmp && cat > m3.sh <<'EOF'\n" + body + "\necho after";
    const model = draw(command);
    const first = model.statements[0];
    if (first.kind !== "text") throw new Error("expected a verbatim text group");
    expect(first.slice).toBe("cd /tmp && cat > m3.sh <<'EOF'");
  });

  it("refuses a chain whose operand is a subshell (verbatim text, no partial markup)", () => {
    const command = "a && (b | c); echo x";
    const model = draw(command);
    const first = model.statements[0];
    if (first.kind !== "text") throw new Error("expected a text group");
    expect(first.slice).toBe("a && (b | c)");
    // v2's marker lived here; #162 criterion 2 removed the badge chrome.
    expect(first.conditional).toBe("&&");
  });

  it("parsed args stay sliced in the sequence: awkward quoting round-trips (criterion 3)", () => {
    const command = "git commit -m 'sp ace \"quoted\" inside'; echo done";
    const model = draw(command);
    const group = model.statements[0];
    if (group.kind !== "diagram") throw new Error("expected a diagram group");
    const stage = group.unit.stages[0];
    expect(stage.args).toBeDefined();
    // LITERAL anchor: the value chip's slice is the typed text with its
    // quotes, not the parser's unquoted value.
    expect(stage.args!.args.map((a) => a.role)).toEqual(["flag", "subcommand", "flag", "value"]);
    expect(stage.args!.args[3].slice).toBe("'sp ace \"quoted\" inside'");
    expect(verifyBashSequence(command, model)).toBe(true);
  });

  it("attributeSequenceStages never shows codes on a final chain group", () => {
    // `a && b; c && d`: the FINAL group is the `c && d` chain (its own
    // statement's inner is an AndOr); the dependent rows never show codes —
    // a conditional script disqualifies naming host-side. Nothing is a
    // guess.
    const named = [{ name: "d", exitCode: 0 }];
    const coded = attributeSequenceStages(draw("a && b; c && d"), named);
    const last = coded.statements[coded.statements.length - 1];
    expect(last.kind).toBe("chain");
    expect(last.kind === "chain" && last.chain.rows.map((r) => r.stages.map((s) => s.exitCode))).toEqual([[undefined], [undefined]]);
  });
});

describe("limits", () => {
  it("memoises by command string, including the text fallback", () => {
    clearBashSequenceCache();
    expect(getBashSequenceDiagram("a | b; c | d")).toBe(getBashSequenceDiagram("a | b; c | d"));
    expect(getBashSequenceDiagram("a | b")).toBeNull();
    expect(getBashSequenceDiagram("a | b")).toBeNull();
    expect(diagramsOf(draw("x | y; z | w"))).toHaveLength(2);
  });
});
