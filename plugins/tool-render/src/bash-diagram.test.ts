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

describe("#162 parsed arguments: slices, never reprints (criteria 3-5)", () => {
  // FIDELITY FIRST: args attach THROUGH the existing slice machinery, so the
  // round-trip must hold for every arg-bearing command too.
  const corpus = [
    "git commit -m \"a message with 'single' and \\\"double\\\" quotes\" | cat",
    "rg -n --no-heading foo src/ | head -5",
    "cat <<EOF\nline\nEOF",
    "ls -la /tmp > out 2>&1",
  ];
  for (const command of corpus) {
    it(`keeps slice fidelity for ${JSON.stringify(command.slice(0, 40))}`, () => {
      const model = getBashDiagram(command);
      expect(model).not.toBeNull();
      if (model === null) return;
      expect(verifyBashDiagram(command, model)).toBe(true);
      expect(reconstructBashDiagram(command, model)).toBe(command);
      for (const stage of model.stages) {
        if (stage.args === undefined) continue;
        // Every chip is a positioned SLICE: each chip's text occurs inside
        // the stage slice, and the stage slice is echoed exactly.
        expect(stage.args.stageSlice).toBe(stage.slice);
      }
    });
  }

  it("cut chips verbatim, with the awkward-quoting LITERAL anchor", () => {
    // #149's reviewer + #160's review both caught diagrams that reconstruct
    // cleanly while attributing the wrong text. The anchor here is the
    // exact slice of a flag value with spaces AND an embedded quote.
    const command = 'git commit -m \'msg with "sp ace" inside\' | cat';
    const model = draw(command);
    const stage = model.stages[0];
    expect(stage.args).toBeDefined();
    const args = stage.args!.args;
    expect(args.map((a) => a.role)).toEqual(["flag", "subcommand", "flag", "value"]);
    // The value chip's slice is the typed text WITH its quotes, byte for byte.
    expect(args[3].slice).toBe("'msg with \"sp ace\" inside'");
    // And not the parser's unquoted value.
    expect(args[3].slice).not.toBe('msg with "sp ace" inside');
  });

  it("binds `--long=value` by shape alone for every command", () => {
    const model = draw("unknowncmd --precision 42 | head -1");
    // `unknowncmd` has no profile: `-42` would be a guessed bind; it is NOT.
    const first = model.stages[0];
    expect(first.args).toBeDefined();
    expect(first.args!.args.map((a) => a.role)).toEqual(["flag", "flag", "positional"]);
  });

  it("binds a flag's value only when the per-command table says so", () => {
    const model = draw("rg --context 3 error log.txt | head -2");
    const args = model.stages[0].args!.args;
    // rg's table declares `--context` a value flag: binds 3.
    expect(args.map((a) => a.role)).toEqual(["flag", "flag", "value", "positional", "positional"]);
    expect(args[2].slice).toBe("3");
  });

  it("does NOT detect value binding when a flag's next token could be positional", () => {
    // A table notch: `--no-heading` (no value) and a short flag never bind.
    const model = draw("rg -n -v pattern | tail -3");
    const args = model.stages[0].args!.args;
    expect(args.map((a) => a.role)).toEqual(["flag", "flag", "flag", "positional"]);
  });

  it("subcommands distinguish from flags and positionals (criterion 5)", () => {
    const model = draw("git status --porcelain | head -5");
    const args = model.stages[0].args!.args;
    expect(args.map((a) => a.role)).toEqual(["flag", "subcommand", "flag"]);
  });

  it("represents `git -C path log` correctly: -C binds the path, `log` is the subcommand (criterion 5)", () => {
    // The criterion's exact counterexample: a naive parser calls `path` the
    // subcommand. The table binds `-C path` first, so `log` wins.
    const model = draw("git -C /tmp/x log --oneline | head -20");
    const args = model.stages[0].args!.args;
    expect(args.map((a) => a.role)).toEqual(["flag", "flag", "value", "subcommand", "flag"]);
    expect(args[2].slice).toBe("/tmp/x");
    expect(args[3].slice).toBe("log");
  });

  it("uses git's per-subcommand value list: commit -m binds its message", () => {
    const model = draw("git commit -m \"msg here\" | tail -2");
    const args = model.stages[0].args!.args;
    expect(args.map((a) => a.role)).toEqual(["flag", "subcommand", "flag", "value"]);
    expect(args[3].slice).toBe('"msg here"');
  });

  it("leaves ls/node/etc. generic: no subcommand, no binding when the table refuses", () => {
    // ls: known command, but nothing binds here.
    const ls = draw("ls -la /tmp | wc -l");
    expect(ls.stages[0].args!.args.map((a) => a.role)).toEqual(["flag", "flag", "positional"]);
    // node: -e takes a value (declared): binds.
    const node = draw("node -e 'process.exit(1)' | head -2");
    expect(node.stages[0].args!.args.map((a) => a.role)).toEqual(["flag", "flag", "value"]);
  });

  it("unknown commands get the reject-a-guess parse, no binding or subcommand", () => {
    // `docker`'s -f: docker is not in the table, so -f does NOT bind next
    // token. (Criterion 4: unknown command -> generic treatment.)
    const model = draw("docker --rm -f busybox echo | head -2");
    const args = model.stages[0].args!.args;
    // Flag pose claimed; the VALUE was not: -f is not in any table, so
    // `busybox` stayed a positional instead of being swallowed.
    expect(args.map((a) => a.role)).toEqual(["flag", "flag", "flag", "positional", "positional"]);
    expect(args[3].slice).toBe("busybox");
  });
});

describe("#162 parsed args did not break much", () => {
  it("attributes exit codes alongside parsed args", () => {
    const base = draw("rg --context 2 pattern f.txt | sort");
    expect(base.stages[0].args).toBeDefined();
    const coded = attributePipeStages(base, [{ name: "rg", exitCode: 0 }, { name: "sort", exitCode: 0 }]);
    expect(coded.stages[0].exitCode).toBe(0);
    expect(coded.stages[1].exitCode).toBe(0);
    expect(coded.stages[0].args).toBeDefined();
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
