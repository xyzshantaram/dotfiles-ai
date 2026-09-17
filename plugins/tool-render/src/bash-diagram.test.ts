/**
 * Unit tests for the pure diagram model in bash-diagram.ts (#149). String
 * parsing and model building only: no React render, no DOM, no snapshots.
 *
 * The fidelity invariant under test is SLICE CONCATENATION — the drawn
 * nodes' source slices plus the verbatim gap slices between them reproduce
 * the command byte for byte — because unbash's print() normalises source
 * (see the "print() is not an exactness oracle" test below) and so cannot
 * prove exactness.
 */
import { describe, expect, it } from "vitest";
import { parse } from "unbash";
import { print } from "unbash/printer";
import {
  BASH_DIAGRAM_MAX_COMMAND,
  attributePipeStages,
  clearBashDiagramCache,
  getBashDiagram,
  reconstructBashDiagram,
  verifyBashDiagram,
} from "./bash-diagram";

function draw(command: string) {
  const model = getBashDiagram(command);
  expect(model).not.toBeNull();
  if (model === null) throw new Error("unreachable");
  return model;
}

function text(command: string) {
  expect(getBashDiagram(command)).toBeNull();
}

describe("fidelity: two heredocs on different stages of one pipeline", () => {
  // The FIRST test, named by the investigation as the mechanic most likely
  // to break: bodies serialize in redirect order, so attributing each body
  // span to its redirect is the one ambiguous mapping in the whole module.
  const command = "cat <<A | sort <<B\nhi A\nA\nbody B\nB";

  it("draws two stages with one heredoc endpoint each", () => {
    const model = draw(command);
    expect(model.kind).toBe("pipeline");
    expect(model.stages).toHaveLength(2);
    expect(model.stages[0].words).toBe("cat");
    expect(model.stages[1].words).toBe("sort");
    expect(model.stages[0].redirects).toHaveLength(1);
    expect(model.stages[1].redirects).toHaveLength(1);
    expect(model.stages[0].redirects[0].slice).toBe("<<A");
    expect(model.stages[1].redirects[0].slice).toBe("<<B");
    expect(model.stages[0].redirects[0].heredoc?.lines).toBe(1);
    expect(model.stages[1].redirects[0].heredoc?.lines).toBe(1);
    expect(model.stages[0].redirects[0].heredoc?.body).toBe("hi A\n");
    expect(model.stages[1].redirects[0].heredoc?.body).toBe("body B\n");
  });

  it("reproduces the command byte for byte from slices plus gaps", () => {
    const model = draw(command);
    expect(verifyBashDiagram(command, model)).toBe(true);
    expect(reconstructBashDiagram(command, model)).toBe(command);
  });
});

describe("fidelity corpus: drawn commands reconstruct exactly", () => {
  // Real commands: the ticket's benchmarks, plugins/bash-guard.test.ts, and
  // the probe matrix behind the design note.
  const corpus = [
    "a | b",
    "a|b",
    "a | b |& c",
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
    // A 200-line heredoc body: one collapsed element, still byte-exact.
    "cat <<EOF | sort\n" + Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n") + "\nEOF",
  ];
  for (const command of corpus) {
    it(`reconstructs ${JSON.stringify(command.slice(0, 48))}`, () => {
      const model = getBashDiagram(command);
      expect(model).not.toBeNull();
      if (model === null) return;
      expect(verifyBashDiagram(command, model)).toBe(true);
      expect(reconstructBashDiagram(command, model)).toBe(command);
    });
  }
});

describe("trigger predicate: what draws and what stays text", () => {
  it("draws a multi-stage pipeline and a redirect", () => {
    expect(draw("a | b").kind).toBe("pipeline");
    expect(draw("a > f").kind).toBe("command");
  });

  it("leaves a single simple command as text", () => {
    for (const command of ["ls", "git status", "rg -n foo src/", "sleep 1", "true", "echo hello-pipe-test"]) {
      text(command);
    }
  });

  it("leaves control flow as text, even the branch holding the pipe", () => {
    // Narrower than "contains a pipe": a partial diagram of one branch of a
    // chain would misrepresent when that branch runs.
    text("a && b | c");
    text("true && false | cat");
    text("if true; then false | cat; fi");
  });

  it("leaves subshells, compounds and backgrounding as text", () => {
    text("(a | b)");
    text("{ false | cat; }");
    text("a | b &");
    text("a > f &");
    text("false | cat &");
  });

  it("leaves multi-statement commands as text", () => {
    text("a | b; c");
    text("echo one | cat; echo two | cat");
    text("echo starting\nfalse | cat");
    text("false | cat\necho done");
    text("sleep 1 & true | false");
  });

  it("leaves non-plain stages and word-interior pipes as text", () => {
    text("a | (b)");
    text("echo $(ls | head -3)");
  });

  it("leaves parse failures, empties and incomplete heredocs as text", () => {
    text("");
    text("   ");
    text("a |");
    text("| b");
    text("(((");
    text("cat <<EOF | sort");
    text("cat <<EOF\nhi");
  });

  it("leaves single-stage !/time prefixes as text but draws them with redirects", () => {
    text("! ls");
    text("time ls");
    const negated = draw("! ls > f");
    expect(negated.kind).toBe("command");
    expect(negated.negated).toBe(true);
  });
});

describe("model detail", () => {
  it("types arrows and keeps the verbatim gap", () => {
    const model = draw("a | b |& c");
    expect(model.arrows.map((a) => a.operator)).toEqual(["|", "|&"]);
    expect(model.arrows[0].gap).toBe(" | ");
    expect(model.arrows[1].gap).toBe(" |& ");
  });

  it("records negation and time flags without consuming their text", () => {
    const negated = draw("! ls | head");
    expect(negated.negated).toBe(true);
    expect(negated.timed).toBe(false);
    expect(negated.leadingGap).toBe("! ");
    const timed = draw("time ls | head");
    expect(timed.timed).toBe(true);
    expect(timed.leadingGap).toBe("time ");
  });

  it("shows redirect slices verbatim, including fd duplication", () => {
    const model = draw("cat < in.txt | sort > out.txt 2>&1");
    expect(model.stages[0].words).toBe("cat");
    expect(model.stages[1].words).toBe("sort");
    expect(model.stages[0].redirects.map((r) => r.slice)).toEqual(["< in.txt"]);
    expect(model.stages[1].redirects.map((r) => r.slice)).toEqual(["> out.txt", "2>&1"]);
    expect(model.stages[1].redirects[1].operator).toBe(">&");
  });

  it("collapses a heredoc body to one element with a line count", () => {
    const model = draw("cat <<EOF | sort\nline1\nline2\nEOF");
    const endpoint = model.stages[0].redirects[0];
    expect(endpoint.slice).toBe("<<EOF");
    expect(endpoint.heredoc?.lines).toBe(2);
    expect(endpoint.heredoc?.body).toBe("line1\nline2\n");
  });
});

describe("exit codes from block.meta.pipeStages", () => {
  it("shows per-stage codes when names match the drawn stages", () => {
    const coded = attributePipeStages(draw("false | cat"), [
      { name: "false", exitCode: 1 },
      { name: "cat", exitCode: 0 },
    ]);
    expect(coded.stages.map((s) => s.exitCode)).toEqual([1, 0]);
  });

  it("shows the single code of a redirect command", () => {
    const coded = attributePipeStages(draw("ls > out.txt"), [{ name: "ls", exitCode: 0 }]);
    expect(coded.stages.map((s) => s.exitCode)).toEqual([0]);
  });

  it("shows NO per-stage codes when naming was disqualified (bare entries)", () => {
    // The #142 signal: bash-guard emits bare {exitCode} entries plus the
    // "final pipeline only" note when it cannot attribute them.
    const coded = attributePipeStages(draw("false | cat"), [{ exitCode: 1 }, { exitCode: 0 }]);
    expect(coded.stages.map((s) => s.exitCode)).toEqual([undefined, undefined]);
  });

  it("shows NO per-stage codes on length mismatch, empty names or absence", () => {
    const model = draw("false | cat");
    expect(
      attributePipeStages(model, [
        { name: "false", exitCode: 1 },
        { name: "cat", exitCode: 0 },
        { name: "extra", exitCode: 0 },
      ]).stages.map((s) => s.exitCode),
    ).toEqual([undefined, undefined]);
    expect(
      attributePipeStages(model, [
        { name: "", exitCode: 1 },
        { name: "cat", exitCode: 0 },
      ]).stages.map((s) => s.exitCode),
    ).toEqual([undefined, undefined]);
    // A backgrounded call carries no pipeStages key at all.
    expect(attributePipeStages(model, undefined).stages.map((s) => s.exitCode)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("never mutates the cached base model", () => {
    clearBashDiagramCache();
    const base = draw("false | cat");
    attributePipeStages(base, [
      { name: "false", exitCode: 1 },
      { name: "cat", exitCode: 0 },
    ]);
    expect(base.stages.map((s) => s.exitCode)).toEqual([undefined, undefined]);
    expect(getBashDiagram("false | cat")).toBe(base);
  });
});

describe("limits and oracle", () => {
  it("degrades commands above the stated size cap to text", () => {
    expect(BASH_DIAGRAM_MAX_COMMAND).toBe(20000);
    text("a | " + "b".repeat(BASH_DIAGRAM_MAX_COMMAND));
  });

  it("memoises by command string, including the text fallback", () => {
    clearBashDiagramCache();
    expect(getBashDiagram("a | b")).toBe(getBashDiagram("a | b"));
    expect(getBashDiagram("ls")).toBeNull();
    expect(getBashDiagram("ls")).toBeNull();
  });

  it("print() normalises source, so it cannot be the fidelity oracle", () => {
    // Guard for the future: if this starts passing, print() round-trips and
    // the slice-concatenation invariant above is redundant — until then the
    // invariant is the proof and print() is only a structural cross-check.
    const source = "cat <<EOF\nhello\nEOF";
    expect(print(parse(source))).not.toBe(source);
    expect(print(parse("a|b"))).not.toBe("a|b");
  });
});
