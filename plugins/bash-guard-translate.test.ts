/**
 * Tests for the pure grep and find translation layer.
 *
 * Every case asserts the exact argv the guard would run, so a wrong flag
 * spelling fails here rather than at the shell.
 */

import { describe, expect, it } from "vitest";
import {
  shellQuote,
  TRANSLATORS,
  type TranslateAsk,
  type TranslateBlocked,
  type TranslateOk,
  type TranslateOutcome,
} from "./bash-guard-translate";

function expectOk(outcome: TranslateOutcome): TranslateOk {
  if (outcome.kind !== "ok") {
    throw new Error(`expected ok, got ${outcome.kind}: ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

function expectAsk(outcome: TranslateOutcome): TranslateAsk {
  if (outcome.kind !== "ask") {
    throw new Error(`expected ask, got ${outcome.kind}: ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

function expectBlocked(outcome: TranslateOutcome): TranslateBlocked {
  if (outcome.kind !== "blocked") {
    throw new Error(`expected blocked, got ${outcome.kind}: ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

const grep = TRANSLATORS.grep;
const find = TRANSLATORS.find;

describe("TRANSLATORS", () => {
  it("exposes exactly grep and find", () => {
    expect(Object.keys(TRANSLATORS).sort()).toEqual(["find", "grep"]);
  });
});

describe("grep translation", () => {
  it("drops -r and keeps -n", () => {
    const out = expectOk(grep(["-rn", "foo", "src/"], "grep"));
    expect(out.argv).toEqual(["rg", "-n", "foo", "src/"]);
    expect(out.notes.some((note) => note.includes("recursive"))).toBe(true);
  });

  it("adds -F for fgrep", () => {
    const out = expectOk(grep(["foo"], "fgrep"));
    expect(out.argv).toEqual(["rg", "-F", "foo"]);
  });

  it("adds no flag for egrep but carries a note", () => {
    const out = expectOk(grep(["foo"], "egrep"));
    expect(out.argv).toEqual(["rg", "foo"]);
    expect(out.notes.some((note) => note.includes("egrep"))).toBe(true);
  });

  it("adds -z for zgrep", () => {
    const out = expectOk(grep(["foo"], "zgrep"));
    expect(out.argv).toEqual(["rg", "-z", "foo"]);
  });

  it("turns --include into a -g glob", () => {
    const out = expectOk(grep(["--include=*.ts", "foo", "."], "grep"));
    expect(out.argv).toEqual(["rg", "-g", "*.ts", "foo", "."]);
  });

  it("turns --exclude into a negated -g glob", () => {
    const out = expectOk(grep(["--exclude=*.min.js", "foo", "."], "grep"));
    expect(out.argv).toEqual(["rg", "-g", "!*.min.js", "foo", "."]);
    expect(out.notes.some((note) => note.includes("negated"))).toBe(true);
  });

  it("keeps both -e patterns and treats the rest as paths", () => {
    const out = expectOk(grep(["-e", "foo", "-e", "bar", "."], "grep"));
    expect(out.argv).toEqual(["rg", "-e", "foo", "-e", "bar", "."]);
  });

  it("blocks --color and names it", () => {
    const out = expectBlocked(grep(["--color=always", "foo", "."], "grep"));
    expect(out.why).toContain("--color");
  });

  it("maps -z to --null-data and never to -z", () => {
    const out = expectOk(grep(["-z", "foo", "."], "grep"));
    expect(out.argv).toEqual(["rg", "--null-data", "foo", "."]);
    expect(out.argv).not.toContain("-z");
  });

  it("maps -h to --no-filename and -H to -H", () => {
    expect(expectOk(grep(["-h", "foo"], "grep")).argv).toEqual(["rg", "--no-filename", "foo"]);
    expect(expectOk(grep(["-H", "foo"], "grep")).argv).toEqual(["rg", "-H", "foo"]);
  });

  it("maps -L to --files-without-match and -s to --no-messages", () => {
    const out = expectOk(grep(["-L", "-s", "foo"], "grep"));
    expect(out.argv).toEqual(["rg", "--files-without-match", "--no-messages", "foo"]);
  });

  it("reads a context value attached to the short flag", () => {
    const out = expectOk(grep(["-A3", "-B", "2", "foo"], "grep"));
    expect(out.argv).toEqual(["rg", "-A", "3", "-B", "2", "foo"]);
  });

  it("accepts a long flag with a separate value", () => {
    const out = expectOk(grep(["--context", "4", "foo"], "grep"));
    expect(out.argv).toEqual(["rg", "-C", "4", "foo"]);
  });

  it("treats every argument after -- as positional", () => {
    const out = expectOk(grep(["--", "-not-a-flag", "src"], "grep"));
    expect(out.argv).toEqual(["rg", "-not-a-flag", "src"]);
  });

  it("blocks an unknown short flag and names it", () => {
    const out = expectBlocked(grep(["-Z", "foo"], "grep"));
    expect(out.why).toContain("-Z");
  });
});

describe("find translation", () => {
  it("maps a search path and -name", () => {
    const out = expectOk(find([".", "-name", "*.ts"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", ".", "-g", "*.ts"]);
  });

  it("maps -type and -maxdepth", () => {
    const out = expectOk(find([".", "-type", "f", "-maxdepth", "2"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", ".", "-t", "f", "-d", "2"]);
  });

  it("adds -i for -iname", () => {
    const out = expectOk(find([".", "-iname", "*.TS"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", ".", "-g", "-i", "*.TS"]);
  });

  it("adds -p for -path", () => {
    const out = expectOk(find(["src", "-path", "*/lib/*"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", "src", "-g", "-p", "*/lib/*"]);
  });

  it("maps -iwholename exactly like -ipath", () => {
    const wholename = expectOk(find([".", "-iwholename", "*/src/*"], "find"));
    const ipath = expectOk(find([".", "-ipath", "*/src/*"], "find"));
    expect(wholename.argv).toEqual(["fd", "--search-path", ".", "-g", "-p", "-i", "*/src/*"]);
    expect(wholename.argv).toEqual(ipath.argv);
  });

  it("maps -wholename like -path and adds no -i", () => {
    const out = expectOk(find([".", "-wholename", "*/src/*"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", ".", "-g", "-p", "*/src/*"]);
  });

  it("maps -regex to the fd regex mode", () => {
    const out = expectOk(find([".", "-regex", ".*\\.rs"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", ".", "--regex", "-p", ".*\\.rs"]);
  });

  it("maps -mindepth, -empty and -print0", () => {
    const out = expectOk(find([".", "-mindepth", "1", "-empty", "-print0"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", ".", "--min-depth", "1", "-t", "e", "-0"]);
  });

  it("drops -print because fd prints by default", () => {
    const out = expectOk(find([".", "-print"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", "."]);
  });

  it("emits no --search-path when find got no path", () => {
    const out = expectOk(find(["-name", "*.md"], "find"));
    expect(out.argv).toEqual(["fd", "-g", "*.md"]);
  });

  it("drops -H and -P but keeps a note about symlinks", () => {
    const out = expectOk(find(["-H", ".", "-name", "*.md"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", ".", "-g", "*.md"]);
    expect(out.notes.some((note) => note.includes("symlinks"))).toBe(true);
  });

  it("maps a leading -L to --follow", () => {
    const out = expectOk(find(["-L", ".", "-type", "f"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", ".", "--follow", "-t", "f"]);
  });

  it("converts a find size suffix to the fd spelling", () => {
    const out = expectOk(find([".", "-size", "+10M"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", ".", "-S", "+10mi"]);
  });

  it("blocks a size form it can not convert", () => {
    const out = expectBlocked(find([".", "-size", "10"], "find"));
    expect(out.why).toContain("10");
  });

  it("blocks -delete because fd has no delete flag", () => {
    const out = expectBlocked(find([".", "-delete"], "find"));
    expect(out.why).toContain("-delete");
    expect(out.why).toContain("delete flag");
    expect(out.why).toContain(".gitignore");
  });

  it("blocks -newer because fd --newer wants a date, not a file", () => {
    const out = expectBlocked(find([".", "-newer", "ref.txt"], "find"));
    expect(out.why).toContain("-newer");
    expect(out.why).toContain("date");
  });

  it("asks before -exec and puts the exec flag last", () => {
    const out = expectAsk(find([".", "-name", "*.log", "-exec", "rm", "{}", ";"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", ".", "-g", "*.log", "-x", "rm", "{}"]);
    expect(out.why).toContain("-exec");
  });

  it("uses -X for an -exec ended by +", () => {
    const out = expectAsk(find([".", "-exec", "wc", "-l", "{}", "+"], "find"));
    expect(out.argv).toEqual(["fd", "--search-path", ".", "-X", "wc", "-l", "{}"]);
  });

  it("blocks the -o operator and names it", () => {
    const out = expectBlocked(find([".", "-name", "a", "-o", "-name", "b"], "find"));
    expect(out.why).toContain("-o");
  });

  it("blocks -printf and names it", () => {
    const out = expectBlocked(find([".", "-printf", "%p"], "find"));
    expect(out.why).toContain("-printf");
  });

  it("blocks -execdir and names it", () => {
    const out = expectBlocked(find([".", "-execdir", "rm", "{}", ";"], "find"));
    expect(out.why).toContain("-execdir");
  });

  it("blocks two pattern predicates because fd matches one pattern", () => {
    const out = expectBlocked(find([".", "-name", "a", "-path", "b"], "find"));
    expect(out.why).toContain("-path");
  });
});

describe("shellQuote", () => {
  it("leaves a safe word alone", () => {
    expect(shellQuote("src/main.ts")).toBe("src/main.ts");
    expect(shellQuote("a-b_c@1.0+x=y:z,w%q")).toBe("a-b_c@1.0+x=y:z,w%q");
  });

  it("quotes a word with a space", () => {
    expect(shellQuote("two words")).toBe("'two words'");
  });

  it("quotes a word with a single quote", () => {
    expect(shellQuote("it's")).toBe("'it'\\''s'");
  });

  it("quotes a word with a glob character", () => {
    expect(shellQuote("*.ts")).toBe("'*.ts'");
  });

  it("quotes an empty word", () => {
    expect(shellQuote("")).toBe("''");
  });
});
