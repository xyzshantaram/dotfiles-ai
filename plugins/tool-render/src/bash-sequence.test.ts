/**
 * Truth-layer pins for multi-statement scripts, in the new vocabulary (#173
 * stage two). The old file imported bash-diagram.ts. That module is deleted.
 * This file proves the same facts against bash-graph instead.
 *
 * THE BIG TRANSLATION. The old sequence model returned statement groups
 * (diagram, chain, text) with separators and a trailing region. The fair
 * copy returns one panel per semicolon segment, in render order. Order is
 * spatial now: panel array order IS the sequence. There are no separators,
 * no text groups, no chain groups. Comments draw as verbatim cards, never
 * as gaps. Subshells draw as verbatim cards with a subshell badge, never
 * as refusals. A backgrounded segment draws as one verbatim node with no
 * edge. Every section below states what changed and pins what holds.
 *
 * WHAT DIED HERE. sequenceUnitDiagramModel and the client wiring pins (old
 * L104, L125) tested functions and components that no longer exist. The
 * funnel pin in the new vocabulary lives in bash-tabs.test.ts. The cache
 * pin (old L600) lives there too.
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
import { SL } from "./bash-graph/text.js";

/** The production sync scan. BashRow passes this exact literal. */
const UB: UnbashScan = { status: "stable-unavailable", nodes: [] };

const unesc = (s: string): string =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

/** Render one command exactly as production renders it. */
function render(command: string, pipeStages?: unknown): CardResult {
  const restore = installStub();
  try {
    resetStats("bash-sequence-truth");
    return renderOne(21, command, UB, { adopted: 0, avail: 716 }, pipeStages);
  } finally {
    restore();
  }
}

/** Displayed text of one panel, tags stripped, entities decoded. */
function panelText(panel: string): string {
  return unesc(panel.replace(/<[^>]*>/g, ""));
}

/** Displayed text of all panels. */
function shown(r: CardResult): string {
  return r.panelsHTML.map(panelText).join("\n");
}

function html(r: CardResult): string {
  return r.panelsHTML.join("\n");
}

/** The no-silent-loss net over the whole command. */
function wordsSurvive(src: string, r: CardResult): void {
  const text = shown(r);
  for (const w of new Set(src.match(/[A-Za-z0-9_]+/g) ?? []))
    expect(text, `word ${JSON.stringify(w)}`).toContain(w);
}

/**
 * Model nodes of one segment, built exactly as renderOne builds them,
 * including the per-line delimBase (ticket #181).
 */
function segNodesAt(src: string, li: number, si: number): ModelNode[] {
  const lines = splitLines(src);
  const ln = lines[li];
  const segs = splitSemis(src, ln.a, ln.b);
  let delimBase = 0;
  for (let k = 0; k < si; k++)
    delimBase += tokenizeParts(src, segs[k].a, segs[k].b).filter((t) => t.t === "delim").length;
  const sg = segs[si];
  const items = tokenizeParts(src, sg.a, sg.b);
  const ctx = makeBuildContext(5);
  return buildNodes(src, items, ln, { li, si }, UB, ctx, delimBase).nodes;
}

/** Conditional chips of the cmd nodes of one segment, in node order. */
function chipsOf(src: string, li: number, si: number): (string | undefined)[] {
  return segNodesAt(src, li, si)
    .filter((n) => n.kind === "cmd")
    .map((n) => (n.kind === "cmd" ? n.chip?.sym : undefined));
}

describe("ticket-named cases", () => {
  it("draws two statements each with pipelines", () => {
    // Re-points old L41. Panel order is the sequence. No separators exist.
    const command = "a | b; c | d";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    expect(panelText(r.panelsHTML[0])).toContain("a");
    expect(panelText(r.panelsHTML[1])).toContain("c");
    expect(html(r).match(/data-pipe="pipe"/g) ?? []).toHaveLength(2);
    wordsSurvive(command, r);
  });

  it("draws a statement with redirects beside one without", () => {
    // Re-points old L56.
    const command = "ls > f; cat < in | sort";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    expect(panelText(r.panelsHTML[0])).toContain("ls");
    expect(panelText(r.panelsHTML[0])).toContain("f");
    expect(panelText(r.panelsHTML[1])).toContain("cat");
    expect(html(r)).toContain("data-pipe=");
    wordsSurvive(command, r);
  });

  it("draws a comment between statements as its own verbatim card", () => {
    // Changed from old L69. The old model kept the comment in the
    // separator. The fair copy has no separators, so the comment draws as
    // a verbatim card between the two pipelines. Nothing hidden, order
    // kept. Three panels, not two.
    const command = "a | b; # comment\nc | d";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(3);
    expect(panelText(r.panelsHTML[1])).toContain("# comment");
    wordsSurvive(command, r);
  });

  it("drops a trailing `;` with no panel and no text", () => {
    // Changed from old L77. The trailing separator carried no display in
    // the old model either beyond its gap text. Panel stacking states the
    // order now. The bare `;` itself is not shown. Stated, not hidden.
    const command = "a | b; c | d;";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    wordsSurvive("a | b; c | d", r);
  });

  it("draws a `;`-and-`&&` mix with the marker on the dependent only", () => {
    // Re-points old L84 and the #162 2b rule in the new vocabulary. The
    // condition is a prefix chip on the dependent card. The base card
    // carries none.
    const command = "a | b; c && d | e";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    expect(chipsOf(command, 0, 1)).toEqual([undefined, "&&", undefined]);
    const second = segNodesAt(command, 0, 1);
    const piped = second.filter((n) => n.kind === "cmd" && n.incoming === "pipe");
    expect(piped).toHaveLength(1);
    wordsSurvive(command, r);
  });

  it("draws the exact command from the ticket description", () => {
    // Re-points old L153. The plain echo between the pipelines draws as
    // its own lone panel instead of sinking the script back to text.
    const command =
      'journalctl ... | rg ... | tail -8; echo "=== harness uptime ==="; ' +
      "ps -eo ... | rg ... | rg -v rg | head -1 | cut -c1-75";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(3);
    expect(panelText(r.panelsHTML[1])).toContain("harness uptime");
    expect(html(r).match(/data-pipe="pipe"/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    wordsSurvive(command, r);
  });
});

describe("scope boundaries in the new vocabulary", () => {
  it("draws a single statement as one panel", () => {
    // Changed from old L177. The v1 and v2 predicates are gone. One
    // statement is one panel. The pipe inside still draws as a tagged link.
    const command = 'journalctl --user --since "-60 min" --no-pager 2>/dev/null | rg -i "..." | tail -15';
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(1);
    expect(html(r)).toContain("data-pipe=");
    wordsSurvive(command, r);
  });

  it("draws backgrounded segments verbatim with no order claim", () => {
    // Changed from old L185 and hole 2. `&` runs concurrently, so even the
    // ordering claim would be false. Each backgrounded segment draws as one
    // verbatim node: all text shown, no edge, no pipe tag. A clean sibling
    // segment keeps its own pipe. That contrast is the point.
    for (const command of ["sleep 1 & true | false", "a | b &", "a & b | c"]) {
      const h = html(render(command));
      expect(h, command).not.toContain("prim-edge");
      expect(h, command).not.toContain("data-pipe=");
      wordsSurvive(command, render(command));
    }
    // The clean segment beside a backgrounded one still draws structured.
    const mixed = render("a | b; c | d &");
    expect(mixed.panelsHTML).toHaveLength(2);
    expect(mixed.panelsHTML[0]).toContain("data-pipe=");
    expect(mixed.panelsHTML[1]).not.toContain("prim-edge");
    expect(mixed.panelsHTML[1]).not.toContain("data-pipe=");
    expect(panelText(mixed.panelsHTML[1])).toContain("c | d &");
    wordsSurvive("a | b; c | d", mixed);
  });

  it("draws subshells as one verbatim unit with a subshell badge", () => {
    // Resolves ambiguous old L193. The old renderer refused. The fair copy
    // draws the whole span as one card plus the true subshell badge, the
    // same picture the stub path always drew.
    const command = "(a | b); c | d";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    expect(panelText(r.panelsHTML[0])).toContain("(a | b)");
    expect(panelText(r.panelsHTML[0])).toContain("subshell");
    wordsSurvive(command, r);
  });

  it("marks `||` and mixed chains per dependent, never panel-wide", () => {
    // Re-points old L203. The || chip is glyph-only (circle-plus). The
    // meaning rides the title.
    const orOnly = "a | b; c || d | e";
    expect(chipsOf(orOnly, 0, 1)).toEqual([undefined, "||", undefined]);
    const h = html(render(orOnly));
    expect(h).toContain('data-lucide="circle-plus"');
    expect(h).not.toContain(">||<");
    const mixed = "a | b; c && d || e";
    expect(chipsOf(mixed, 0, 1)).toEqual([undefined, "&&", "||"]);
    wordsSurvive(mixed, render(mixed));
  });

  it("draws newline-separated statements as one panel each", () => {
    // Re-points old L218.
    const command = "a | b\nc | d";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    wordsSurvive(command, r);
  });

  it("draws a leading comment as its own verbatim card", () => {
    // Changed from old L225. The old model kept it in the leading gap.
    // The fair copy has no gaps, so it draws first. Nothing hidden.
    const command = "# lead\na | b; c | d";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(3);
    expect(panelText(r.panelsHTML[0])).toContain("# lead");
    wordsSurvive(command, r);
  });

  it("draws trivial single commands as one block each", () => {
    // Resolves ambiguous old L232. Bare commands draw (hole 1). Each is a
    // lone node. The old refusal is gone.
    const command = "a; b; c";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(3);
    expect(html(r).match(/data-size="lone"/g) ?? []).toHaveLength(3);
    wordsSurvive(command, r);
  });

  it("keeps per-statement `!` and `time` text verbatim", () => {
    // Re-points old L242. No badge fields exist. The prefixes ride in the
    // slices.
    const first = render("! a | b; c | d");
    expect(panelText(first.panelsHTML[0])).toContain("! a");
    const timed = render("time a | b; c | d");
    expect(panelText(timed.panelsHTML[0])).toContain("time a");
    wordsSurvive("! a | b; c | d", first);
  });

  it("draws empties as nothing and failures as verbatim", () => {
    // Changed from old L254. Parse failures cannot happen on this path:
    // the scanner never fails, it degrades. Stray text draws verbatim.
    expect(render("").panelsHTML).toEqual([]);
    expect(render("   ").panelsHTML).toEqual([]);
    const trailing = render("a | b; c |");
    expect(trailing.panelsHTML).toHaveLength(2);
    wordsSurvive("a | b; c", trailing);
    const garbage = render("(((");
    expect(garbage.panelsHTML).toHaveLength(1);
    expect(shown(garbage)).toContain("(((");
    const commentOnly = render("# only a comment");
    expect(commentOnly.panelsHTML).toHaveLength(1);
    expect(shown(commentOnly)).toContain("# only a comment");
  });

  it("has no size cap of its own: the cap lives in the client", () => {
    // Changed from old L254 cap half. renderOne renders whatever it gets.
    // getBashGraphPanels refuses past 20000 chars. Pinned in
    // bash-tabs.test.ts. This documents the seam.
    const big = "a | " + "b".repeat(20000);
    expect(render(big).panelsHTML.length).toBeGreaterThan(0);
  });
});

describe("heredocs across statements", () => {
  it("attributes same-line bodies per stage with literal anchors", () => {
    // Re-points old L265 and the delimBase rule (ticket #181). A swapped
    // attribution still passes the words net, so the bodies themselves
    // prove correctness: each panel holds its own body and not the other.
    const command = "cat <<A; cat <<B\nhi A\nA\nbody B\nB";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    const first = panelText(r.panelsHTML[0]);
    const second = panelText(r.panelsHTML[1]);
    expect(first).toContain("hi A");
    expect(first).not.toContain("body B");
    expect(second).toContain("body B");
    expect(second).not.toContain("hi A");
    wordsSurvive(command, r);
  });

  it("draws bodies from an earlier line on their own line", () => {
    // Resolves ambiguous old L280. The old renderer refused these scripts
    // rather than misattribute bodies across lines. Line-scoped bodies fix
    // the attribution, so they draw: the heredoc panel keeps its body, the
    // later line keeps its pipe.
    const command = "cat <<EOF\nhello\nEOF\nc | d";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    expect(panelText(r.panelsHTML[0])).toContain("hello");
    expect(html(r)).toContain("data-pipe=");
    wordsSurvive(command, r);
  });

  it("draws the second-heredoc guard case with correct bodies", () => {
    // Resolves ambiguous old L286. Bodies stay on their own lines and
    // attach to their own openers.
    const command = "cat <<A\nbodyA\nA\ncat <<B\nA\nB";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    expect(panelText(r.panelsHTML[0])).toContain("bodyA");
    expect(panelText(r.panelsHTML[1])).toContain("<<B");
    expect(html(r)).toContain("[1:1]");
    wordsSurvive(command, r);
  });

  it("draws a parenthesised heredoc line with its body lines kept", () => {
    // Resolves ambiguous old L302. The opener hides inside parens, so the
    // scanner never registers it and each body line draws as its own
    // verbatim card. Noisy but honest: every byte is shown, none is
    // claimed as structure it is not.
    const command = "a | b; (cat <<EOF)\nhello\nEOF";
    const r = render(command);
    expect(panelText(r.panelsHTML[1])).toContain("(cat <<EOF)");
    wordsSurvive(command, r);
  });

  it("does NOT faithfully draw a hidden opener before a visible one", () => {
    // FINDING, not a re-point: old L315 cannot be translated faithfully.
    // In `(cat <<B); cat <<A` the <<B hides inside parens, so the scanner
    // registers only <<A and attaches the whole "bodyB B bodyA" run to it.
    // The panel below proves every word is shown. It does NOT prove the
    // bodies sit with their openers, because they do not: the <<A card
    // displays bodyB lines as its own input. The no-misattribution fact
    // FAILS for this shape and needs a follow-up: the scanner must not
    // attach a body across a hidden opener, either by registering hidden
    // openers or by leaving the body unattached. Filed in the stage-two
    // report. Criterion 7 forbids fixing the fair copy inside this ticket.
    const command = "(cat <<B); cat <<A\nbodyB\nB\nbodyA\nA";
    const r = render(command);
    wordsSurvive(command, r);
    const bodies = r.panelsHTML.map(panelText).join("\n");
    expect(bodies).toContain("bodyB");
    expect(bodies).toContain("bodyA");
  });

  it("draws the visible-opener-first order with correct bodies", () => {
    // The reverse order is faithful: <<A owns bodyA, and bodyB with B draw
    // as verbatim cards, shown and unclaimed.
    const command = "cat <<A; (cat <<B)\nbodyA\nA\nbodyB\nB";
    const r = render(command);
    const first = panelText(r.panelsHTML[0]);
    expect(first).toContain("bodyA");
    expect(first).not.toContain("bodyB");
    wordsSurvive(command, r);
  });
});

describe("owner fixture #160: heredoc-that-is-shell plus && and ; in one command", () => {
  // The body is DATA. Its `;`, `&&` and `if` never become structure. Pinned
  // by panel counts and literal anchors, re-pointing old L363 (load-bearing:
  // heredoc bodies never become structure) and old L391.
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
  const WITH_PIPE =
    "cd /tmp && cat > m3.sh <<'EOF'\n" + BODY + '\nbash m3.sh | tail -3; echo "script exit=$?"';

  it("draws the fixture: conditional first, blocks after, body verbatim", () => {
    const r = render(FIXTURE);
    // Exactly three outer segments. The body lines are data inside the
    // first panel heredoc block, never panels of their own.
    expect(r.panelsHTML).toHaveLength(3);
    expect(chipsOf(FIXTURE, 0, 0)).toEqual([undefined, "&&"]);
    expect(panelText(r.panelsHTML[0])).toContain("import sys; sys.exit(1)");
    expect(panelText(r.panelsHTML[0])).toContain("<<'PY'");
    expect(panelText(r.panelsHTML[1])).toContain("bash m3.sh");
    expect(panelText(r.panelsHTML[2])).toContain("script exit");
    // Nothing in the body became a stage: the later panels hold only the
    // outer commands.
    expect(panelText(r.panelsHTML[1])).not.toContain("sys.exit");
    expect(panelText(r.panelsHTML[2])).not.toContain("warning path");
    wordsSurvive(FIXTURE, r);
  });

  it("tells order, condition and dataflow apart in the pipe variant", () => {
    const r = render(WITH_PIPE);
    expect(r.panelsHTML).toHaveLength(3);
    expect(chipsOf(WITH_PIPE, 0, 0)).toEqual([undefined, "&&"]);
    const middle = html({ panelsHTML: [r.panelsHTML[1]] } as CardResult);
    expect(middle).toContain("data-pipe=");
    expect(panelText(r.panelsHTML[1])).toContain("bash m3.sh");
    expect(panelText(r.panelsHTML[1])).toContain("tail -3");
    wordsSurvive(WITH_PIPE, r);
  });
});

describe("fidelity corpus: sequences lose nothing", () => {
  // Re-points the 22 old L442 round-trip tests.
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
    it(`keeps every word of ${JSON.stringify(command.slice(0, 48))}`, () => {
      const r = render(command);
      expect(r.panelsHTML.length).toBeGreaterThan(0);
      wordsSurvive(command, r);
      if (command.includes("|")) expect(html(r)).toContain("data-pipe=");
    });
  }
});

describe("exit codes: final panel only, never a guess", () => {
  // The unit rule lives in bash-graph/exit-code.test.ts (re-points old
  // L453, L466, L498, L586). These pin the same facts on the drawn panels.
  it("shows codes on the final panel when names match its stages", () => {
    const r = render("a | b; c | d", [
      { name: "c", exitCode: 1 },
      { name: "d", exitCode: 0 },
    ]);
    expect(r.panelsHTML).toHaveLength(2);
    expect(panelText(r.panelsHTML[0])).not.toContain("exit ");
    expect(panelText(r.panelsHTML[1])).toContain("exit 1");
    expect(panelText(r.panelsHTML[1])).toContain("exit 0");
  });

  it("shows no codes on a chained final panel", () => {
    // REJECTS coding chained finals: the && chip disqualifies the panel,
    // the same way the old model made it a chain instead of a diagram.
    const r = render("a && b; c && d", [{ name: "d", exitCode: 0 }]);
    expect(shown(r)).not.toContain("exit ");
  });

  it("shows no codes for bare entries", () => {
    const r = render("a | b; c | d", [{ exitCode: 1 }, { exitCode: 0 }]);
    expect(shown(r)).not.toContain("exit ");
  });
});

describe("the && chain base carries NO marker", () => {
  // Re-points the old L515 2b ownership test and old L540 in the new
  // vocabulary. The base runs unconditionally. Markers describe the
  // dependents right to run.
  it("marks rows 2 and 3 only of a three-deep && chain", () => {
    const command = "a && b && c; d | e";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    expect(chipsOf(command, 0, 0)).toEqual([undefined, "&&", "&&"]);
    expect(panelText(r.panelsHTML[1])).toContain("d");
    wordsSurvive(command, r);
  });

  it("marks || dependents with the failure condition", () => {
    const command = "cd a || cd b; echo done";
    expect(chipsOf(command, 0, 0)).toEqual([undefined, "||"]);
    wordsSurvive(command, render(command));
  });

  it("draws the heredoc-bearing && statement with its body attached", () => {
    // Changed from old L549. The old chain refused here. The fair copy
    // draws: the && chip rides the dependent, the body rides its opener.
    const body = "set -uo pipefail\nhi\nEOF";
    const command = "cd /tmp && cat > m3.sh <<'EOF'\n" + body + "\necho after";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    expect(chipsOf(command, 0, 0)).toEqual([undefined, "&&"]);
    expect(panelText(r.panelsHTML[0])).toContain("set -uo pipefail");
    expect(panelText(r.panelsHTML[1])).not.toContain("set -uo pipefail");
    wordsSurvive(command, r);
  });

  it("draws a chain with a subshell operand whole", () => {
    // Resolves ambiguous old L562. The whole dependent draws verbatim with
    // its chip and its subshell badge. Nothing partial, nothing dropped.
    const command = "a && (b | c); echo x";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(2);
    expect(chipsOf(command, 0, 0)).toEqual([undefined, "&&"]);
    expect(panelText(r.panelsHTML[0])).toContain("(b | c)");
    expect(panelText(r.panelsHTML[0])).toContain("subshell");
    wordsSurvive(command, r);
  });

  it("keeps awkward quoting verbatim in a sequence", () => {
    // Re-points old L572. The value shows with its quotes, not the
    // parser unquoted value.
    const command = "git commit -m 'sp ace \"quoted\" inside'; echo done";
    const text = panelText(render(command).panelsHTML[0]);
    expect(text).toContain('\'sp ace "quoted" inside\'');
    wordsSurvive(command, render(command));
  });
});
