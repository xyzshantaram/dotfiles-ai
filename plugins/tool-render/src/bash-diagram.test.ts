/**
 * Truth-layer pins for single-statement bash diagrams, in the new vocabulary
 * (#173 stage two). The old file imported bash-diagram.ts. That module is
 * deleted. This file proves the same facts against bash-graph instead.
 *
 * HOW TO READ THE TRANSLATIONS. The new module has no reconstruct or verify
 * function. Panels render separately, and separators between them are order,
 * not text. So byte-exact round-trip becomes three checks that together mean
 * the same thing: every word of the command survives in the panels, every
 * load-bearing slice occurs verbatim, and order holds where order matters.
 * The byte-identical equivalence proof against the prototype lives in
 * bash-graph/equivalence.test.ts. The exit-code unit rule lives in
 * bash-graph/exit-code.test.ts. This file pins the drawn facts.
 *
 * WHAT DIED HERE. The trigger predicate (what stays text), the size cap, and
 * the memoisation pins tested the old module. Bare commands now draw (hole
 * 1). Backgrounded segments draw verbatim (hole 2). Degenerate inputs draw
 * unstructured-but-complete nodes (hole 4). The cap and the cache live in
 * client.tsx now, pinned in bash-tabs.test.ts. The arg ROLE vocabulary has
 * no counterpart at all: the fair copy keeps no per-command tables, so the
 * eight role tests keep only their slice halves, stated below.
 */
import { describe, expect, it } from "vitest";
import { parse } from "unbash";
import { print } from "unbash/printer";
import { installStub, resetStats } from "./bash-graph/geometry.stub.js";
import {
  attributePipeStages,
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
    resetStats("bash-diagram-truth");
    return renderOne(11, command, UB, { adopted: 0, avail: 716 }, pipeStages);
  } finally {
    restore();
  }
}

/** All displayed text of every panel, tags stripped, entities decoded. */
function shown(r: CardResult): string {
  return unesc(r.panelsHTML.join("\n").replace(/<[^>]*>/g, ""));
}

/** Raw panel HTML joined. Use for paint-level counts. */
function html(r: CardResult): string {
  return r.panelsHTML.join("\n");
}

/**
 * The no-silent-loss net: every alphanumeric run of the source survives
 * somewhere in the displayed text. Generated captions add words but must
 * never remove them.
 */
function wordsSurvive(src: string, r: CardResult): void {
  const text = shown(r);
  for (const w of new Set(src.match(/[A-Za-z0-9_]+/g) ?? []))
    expect(text, `word ${JSON.stringify(w)}`).toContain(w);
}

/** Model nodes of the first segment, built exactly as renderOne builds them. */
function firstSegNodes(src: string): { nodes: ModelNode[] } {
  const lines = splitLines(src);
  const ln = lines[0];
  const sg = splitSemis(src, ln.a, ln.b)[0];
  const items = tokenizeParts(src, sg.a, sg.b);
  const ctx = makeBuildContext(3);
  return buildNodes(src, items, ln, { li: 0, si: 0 }, UB, ctx);
}

function cmdNodes(nodes: ModelNode[]): ModelNode[] {
  return nodes.filter((n) => n.kind === "cmd");
}

describe("fidelity: two heredocs on different stages of one pipeline", () => {
  // Re-points old L40. The ambiguous mapping (which body belongs to which
  // redirect) is pinned by literal bodies, not by the round-trip: a swapped
  // attribution still reconstructs cleanly.
  const command = "cat <<A | sort <<B\nhi A\nA\nbody B\nB";

  it("draws one panel with both commands and both heredoc endpoints", () => {
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(1);
    const text = shown(r);
    for (const anchor of ["cat", "<<A", "sort", "<<B", "hi A", "body B"])
      expect(text, anchor).toContain(anchor);
    // Order holds: structure first, bodies ride in their blocks after.
    expect(text.indexOf("cat")).toBeLessThan(text.indexOf("sort"));
    expect(text.indexOf("sort")).toBeLessThan(text.indexOf("hi A"));
    expect(text.indexOf("hi A")).toBeLessThan(text.indexOf("body B"));
    wordsSurvive(command, r);
  });

  it("attributes each body to its own redirect", () => {
    // Bodies ride heredoc nodes placed after their command (reading order),
    // not on the command itself. The node owns the body offsets.
    const { nodes } = firstSegNodes(command);
    const hds = nodes.filter((n) => n.kind === "heredoc");
    expect(hds).toHaveLength(2);
    const first = hds[0];
    const second = hds[1];
    if (first.kind !== "heredoc" || second.kind !== "heredoc") throw new Error("unreachable");
    expect(first.hd.raw).toBe("A");
    expect(second.hd.raw).toBe("B");
    expect(SL(command, first.hd.a, first.hd.b)).toBe("hi A\n");
    expect(SL(command, second.hd.a, second.hd.b)).toBe("body B\n");
    expect(first.hd.lines).toBe(1);
    expect(second.hd.lines).toBe(1);
  });
});

describe("fidelity corpus: drawn commands lose nothing", () => {
  // Re-points the 33 old L103 round-trip tests. Each command renders, every
  // word survives, and every pipe the command types is drawn as a tagged
  // link. The |& command is excluded: the fair copy cannot draw it as
  // dataflow, pinned in its own test below.
  const corpus = [
    "a | b",
    "a|b",
    "rg -n foo src | head -20",
    "seq 1 100000 | head -3",
    "false | cat",
    `node -e "console.error('Read-only file system (os error 30)'); process.exit(1)" 2>&1 | tail -2`,
    "a > f",
    "ls > out.txt",
    "ls 2> err.txt",
    "cat < in.txt | sort > out.txt 2>&1",
    "a | b > f",
    "> f a | b",
    "> f",
    "echo foo > f1 > f2",
    "exec > f",
    "FOO=1 BAR=x ls -la /tmp > out 2>&1",
    "FOO=bar a | b",
    "cat <<< hello | sort",
    "! ls | head",
    "time ls | head",
    "! ls > f",
    "  ls | head",
    "ls \\\n| head",
    "ls | head # c",
    "cat <<EOF\nhello\nEOF",
    "cat <<EOF\nhello\nEOF\n",
    "cat <<EOF # comment\nhello\nEOF",
    "cat <<EOF | sort\nline1\nline2\nEOF",
    "cat <<-EOF | sort\n\tline\n\tEOF",
    "cat <<'EOF'\nhello\nEOF",
    `cat <<"EO F" | sort\nx\nEO F`,
    "cat <<EOF | sort\n" + Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n") + "\nEOF",
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

describe("operators the fair copy cannot draw as dataflow", () => {
  // Old L174 typed arrows [|, |&] have no counterpart. A bare & backgrounds,
  // and |& backgrounds its left side in real shell, so the module degrades
  // the whole segment to one verbatim node: all text shown, no edge drawn,
  // no order claimed. A false pipe would be worse than none.
  it("draws `a | b |& c` verbatim with no pipe claim", () => {
    const command = "a | b |& c";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(1);
    expect(shown(r)).toContain("a | b |& c");
    expect(html(r)).not.toContain("data-pipe=");
    expect(html(r)).not.toContain("prim-edge");
    wordsSurvive(command, r);
  });
});

describe("model detail in the new vocabulary", () => {
  it("keeps negation and time prefixes as verbatim text", () => {
    // Old L181 recorded negated/timed flags. The fair copy keeps no such
    // fields. The prefixes ride inside the command slice instead, which is
    // the same honesty with less machinery: the picture cannot deny them.
    // Gaps between slices are layout, not text, so anchors stop at slice
    // edges. The words net below guards the rest.
    const cases: [string, string[]][] = [
      ["! ls | head", ["! ls", "head"]],
      ["time ls | head", ["time ls", "head"]],
      ["! ls > f", ["! ls", "f"]],
    ];
    for (const [command, anchors] of cases) {
      const text = shown(render(command));
      for (const a of anchors) expect(text, a).toContain(a);
      wordsSurvive(command, render(command));
    }
  });

  it("shows redirect slices verbatim, including fd duplication", () => {
    // Re-points old L191. Targets read as text. The operator meaning rides
    // the title. The bare 2>&1 stays its own node by design.
    const command = "cat < in.txt | sort > out.txt 2>&1";
    const { nodes } = firstSegNodes(command);
    const redirs = nodes.filter((n) => n.kind === "redir");
    expect(redirs.map((n) => (n.kind === "redir" ? n.op : null))).toEqual(["<", ">"]);
    expect(redirs.map((n) => (n.kind === "redir" ? n.text : null))).toEqual(["in.txt", "out.txt"]);
    const dup = nodes.filter((n) => n.kind === "op" && n.op === "2>&1");
    expect(dup).toHaveLength(1);
    const text = shown(render(command));
    expect(text).toContain("in.txt");
    expect(text).toContain("out.txt");
    // REJECTS a duplicated fd node: the merge reads exactly once.
    expect(text.match(/2>&1/g) ?? []).toHaveLength(1);
    expect(html(render(command))).toContain("redirect: writes the previous step");
    wordsSurvive(command, render(command));
  });

  it("collapses a heredoc body to one block with a line count", () => {
    // Re-points old L200. The heredoc node owns the body. The chip names
    // the delimiter with its index and line count. The full body expands
    // below the panel.
    const command = "cat <<EOF | sort\nline1\nline2\nEOF";
    const { nodes } = firstSegNodes(command);
    const hds = nodes.filter((n) => n.kind === "heredoc");
    expect(hds).toHaveLength(1);
    if (hds[0].kind !== "heredoc") throw new Error("unreachable");
    expect(hds[0].hd.raw).toBe("EOF");
    expect(hds[0].hd.lines).toBe(2);
    expect(SL(command, hds[0].hd.a, hds[0].hd.b)).toBe("line1\nline2\n");
    const h = html(render(command));
    expect(h).toContain("[1:2]");
    expect(h).toContain("line1");
    expect(h).toContain("line2");
    wordsSurvive(command, render(command));
  });
});

describe("exit codes at the drawn level", () => {
  // The unit rule lives in bash-graph/exit-code.test.ts (re-points old
  // L210, L218, L223, L230, L373, L252). These two pin the same facts where
  // the owner sees them: on the drawn cards.
  it("shows named codes on their cards", () => {
    const r = render("false | cat", [
      { name: "false", exitCode: 1 },
      { name: "cat", exitCode: 0 },
    ]);
    expect(shown(r)).toContain("exit 1");
    expect(shown(r)).toContain("exit 0");
    expect(html(r)).toContain('data-tone="error"');
  });

  it("shows no codes for bare entries", () => {
    // REJECTS always-attribute: bare entries are the disqualification
    // signal, and any doubt hides every code.
    const base = firstSegNodes("false | cat").nodes;
    const coded = attributePipeStages(base, [{ exitCode: 1 }, { exitCode: 0 }]);
    expect(coded.filter((n) => n.kind === "cmd").map((n) => n.kind === "cmd" && n.exitCode)).toEqual([
      undefined,
      undefined,
    ]);
    expect(shown(render("false | cat", [{ exitCode: 1 }, { exitCode: 0 }]))).not.toContain("exit ");
    // REJECTS partial attribution: one named entry plus one bare entry
    // must hide every code, not just the bare one. A plausible-but-wrong
    // code on the first card is worse than none.
    expect(
      shown(render("false | cat", [{ name: "false", exitCode: 1 }, { exitCode: 0 }])),
    ).not.toContain("exit ");
  });
});

describe("arg slices, never reprints", () => {
  // Re-points the four old L274 own-offsets-only tests. The fair copy keeps
  // no stageSlice field. The translated fact: the typed quoted text occurs
  // verbatim in the card, so display slices the source instead of
  // re-serialising a parse.
  const cases: [string, string[]][] = [
    [`git commit -m "a message with 'single' and \\"double\\" quotes" | cat`, [`"a message with 'single' and \\"double\\" quotes"`]],
    ["rg -n --no-heading foo src/ | head -5", ["--no-heading", "foo", "src/"]],
    ["cat <<EOF\nline\nEOF", ["<<EOF", "line"]],
    ["ls -la /tmp > out 2>&1", ["-la", "/tmp", "out", "2>&1"]],
  ];
  for (const [command, anchors] of cases) {
    it(`keeps slice fidelity for ${JSON.stringify(command.slice(0, 40))}`, () => {
      const r = render(command);
      const text = shown(r);
      for (const a of anchors) expect(text, a).toContain(a);
      wordsSurvive(command, r);
    });
  }

  it("cuts chips verbatim, with the awkward-quoting anchor", () => {
    // Re-points old L289. The value chip shows the typed text WITH its
    // quotes. The leading-quote anchor names the defect: a reprint from the
    // parser value would drop the quotes and redden here.
    const command = 'git commit -m \'msg with "sp ace" inside\' | cat';
    const text = shown(render(command));
    expect(text).toContain('\'msg with "sp ace" inside\'');
    expect(text).toContain("'msg with");
    wordsSurvive(command, render(command));
  });
});

describe("arg roles: only the slice halves survive", () => {
  // Resolves the eight ambiguous role tests (old L305-L360). The fair copy
  // has no per-command tables and no role vocabulary, by design. Each
  // fixture below keeps its slice half: the typed tokens occur verbatim.
  // Hole 12 verdict: the role tables are dropped, the slices are kept.
  const cases: [string, string, string[]][] = [
    ["unknowncmd shape", "unknowncmd --precision 42 | head -1", ["--precision", "42"]],
    ["value flag shape", "rg --context 3 error log.txt | head -2", ["--context", "3", "error", "log.txt"]],
    ["short flags shape", "rg -n -v pattern | tail -3", ["-n", "-v", "pattern"]],
    ["git status shape", "git status --porcelain | head -5", ["status", "--porcelain"]],
    ["git -C shape", "git -C /tmp/x log --oneline | head -20", ["-C", "/tmp/x", "log", "--oneline"]],
    ["commit -m shape", 'git commit -m "msg here" | tail -2', ['"msg here"', "commit"]],
    ["ls and node shapes", "ls -la /tmp | wc -l", ["-la", "/tmp"]],
    ["unknown docker shape", "docker --rm -f busybox echo | head -2", ["--rm", "-f", "busybox", "echo"]],
  ];
  for (const [name, command, anchors] of cases) {
    it(`shows the typed tokens of the ${name}`, () => {
      const text = shown(render(command));
      for (const a of anchors) expect(text, a).toContain(a);
      wordsSurvive(command, render(command));
    });
  }

  it("extracts no pills on these fixtures and names no roles", () => {
    // REJECTS a smuggled role table: short quotes stay inline, and no role
    // word reaches the picture. Quoted args past 80 chars still pill (ARG_T).
    const joined = cases.map(([, command]) => html(render(command))).join("\n");
    expect(joined).not.toContain("pill-label");
    expect(joined).not.toContain("subcommand");
    expect(joined).not.toContain("positional");
  });

  it("still pills a genuinely long quoted arg with counts and a full body", () => {
    const inner = "x".repeat(100);
    const command = `git commit -m "${inner}" | tail -2`;
    const h = html(render(command));
    expect(h).toContain("pill-label");
    expect(h).toContain("ch ·");
    expect(h).toContain(inner);
    wordsSurvive(command, render(command));
  });
});

describe("degenerate inputs draw unstructured-but-complete nodes", () => {
  // Hole 4. The old module refused all of these (old L154). The fair copy
  // degrades instead: one verbatim node over the full span, all text shown,
  // no edge drawn, no order claimed. Nothing hidden is the whole point.
  it("renders no panels for blank input", () => {
    expect(render("").panelsHTML).toEqual([]);
    expect(render("   ").panelsHTML).toEqual([]);
  });

  it("draws a trailing pipe as a stray disc, not a pipe claim", () => {
    const r = render("a |");
    expect(r.panelsHTML).toHaveLength(1);
    expect(shown(r)).toContain("a");
    expect(html(r)).toContain("prim-node op");
    expect(html(r)).not.toContain("data-pipe=");
    wordsSurvive("a |", r);
  });

  it("draws a leading pipe as a stray disc", () => {
    const r = render("| head -20");
    expect(r.panelsHTML).toHaveLength(1);
    expect(shown(r)).toContain("head -20");
    expect(html(r)).toContain("prim-node op");
    wordsSurvive("| head -20", r);
  });

  it("draws an unparseable line verbatim with no structure claim", () => {
    const r = render("(((");
    expect(r.panelsHTML).toHaveLength(1);
    expect(shown(r)).toContain("(((");
    expect(html(r)).not.toContain("data-pipe=");
    wordsSurvive("(((", r);
  });

  it("shows an unterminated heredoc opener instead of dropping it", () => {
    const r = render("cat <<EOF | sort");
    expect(r.panelsHTML).toHaveLength(1);
    expect(shown(r)).toContain("<<EOF");
    expect(shown(r)).toContain("sort");
    wordsSurvive("cat <<EOF | sort", r);
  });

  it("shows an unterminated heredoc body instead of dropping it", () => {
    const r = render("cat <<EOF\nhi");
    expect(shown(r)).toContain("hi");
    expect(shown(r)).toContain("EOF");
    wordsSurvive("cat <<EOF\nhi", render("cat <<EOF\nhi"));
  });
});

describe("command substitution and word-interior pipes", () => {
  // Hole 3. The old module refused both (old L149). The scanner tracks
  // quote and substitution depth, so inner pipes never split structure.
  it("keeps a substitution interior as data, never as structure", () => {
    const command = "echo $(ls | head -3)";
    const r = render(command);
    expect(r.panelsHTML).toHaveLength(1);
    expect(shown(r)).toContain("echo $(ls | head -3)");
    // REJECTS a pipe claim about two words that share no dataflow.
    expect(html(r)).not.toContain("data-pipe=");
    wordsSurvive(command, r);
  });

  it("still draws the outer pipe around a subshell operand", () => {
    const command = "a | (b)";
    const r = render(command);
    const text = shown(r);
    expect(text).toContain("(b)");
    expect(text).toContain("subshell");
    expect(html(r)).toContain("data-pipe=");
    wordsSurvive(command, r);
  });
});

describe("limits and oracle", () => {
  // Old L385 (size cap) and L390 (memoisation) tested the dead module. The
  // cap and the cache live in client.tsx now. Pinned in bash-tabs.test.ts.

  it("print() normalises source, so it cannot be the fidelity oracle", () => {
    // Kept verbatim from old L397. It imports only unbash, so no re-point
    // was needed. The slice checks above are the proof. print stays a
    // structural cross-check only.
    const source = "cat <<EOF\nhello\nEOF";
    expect(print(parse(source))).not.toBe(source);
    expect(print(parse("a|b"))).not.toBe("a|b");
  });
});
