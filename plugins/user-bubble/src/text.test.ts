/**
 * Tests for the user bubble's text model (#125).
 *
 * The two transforms are tested apart because they fail differently: one
 * decorates the wrong thing, the other corrupts pasted code. The code-fence
 * cases below are the ones that matter most — a hard-break transform that
 * runs inside a fence is worse than the paragraph folding it fixes, and the
 * damage would be invisible in a rendered diff.
 */
import { describe, expect, it } from "vitest";
import {
  hardBreakOutsideFences,
  joinSegments,
  splitReferences,
  type UserSegment,
} from "./text";

/** Just the chips, for readable assertions. */
function refs(segments: readonly UserSegment[]) {
  return segments.filter((s): s is Extract<UserSegment, { kind: "ref" }> => s.kind === "ref");
}

describe("splitReferences: paths are text, not skills", () => {
  it("leaves an absolute path entirely alone", () => {
    // THE REPORTED BUG. The shipped pattern chipped `/home` out of this and
    // labelled it a skill, because [\w-] stops at the second slash.
    const segments = splitReferences("see /home/sid/.dsh for the config");
    expect(refs(segments)).toEqual([]);
    expect(joinSegments(segments)).toBe("see /home/sid/.dsh for the config");
  });

  it("leaves other path-ish tokens alone", () => {
    for (const text of ["/etc/passwd", "/usr/bin/env", "/a.b", "/tmp/x-y/z", "/var/"]) {
      expect(refs(splitReferences("path " + text))).toEqual([]);
    }
  });

  it("still chips a bare slash reference, which the owner chose to keep", () => {
    const found = refs(splitReferences("run /compact now"));
    expect(found.length).toBe(1);
    expect(found[0].label).toBe("/compact");
    expect(found[0].refKind).toBe("skill");
  });

  it("still chips @-references, which carry real evidence", () => {
    expect(refs(splitReferences("open @src/main.ts"))[0].refKind).toBe("file");
    expect(refs(splitReferences('open @"my file.ts"'))[0].label).toBe('@"my file.ts"');
  });

  it("trusts only runtime-validated labels as sessions, never a guess", () => {
    const validated = new Set(["@alpha"]);
    expect(refs(splitReferences("see @alpha", validated))[0].refKind).toBe("session");
    // Not in the validated set: it is an @-reference, not a session.
    expect(refs(splitReferences("see @beta", validated))[0].refKind).toBe("file");
  });

  it("records the accepted limitation honestly", () => {
    // Without the composer lexicon this still chips. The test exists so the
    // limitation is VISIBLE rather than discovered later as a surprise.
    expect(refs(splitReferences("try /notaskill"))[0].refKind).toBe("skill");
  });

  it("round-trips: no separator is ever eaten", () => {
    // A tokenizer that swallowed the anchoring whitespace would reintroduce
    // the collapse this ticket also fixes.
    for (const text of [
      "a /skill b",
      "\n/skill\n",
      "  @file  ",
      "line one\nline two /x",
      "/home/x and @y and /z",
    ]) {
      expect(joinSegments(splitReferences(text))).toBe(text);
    }
  });

  it("handles degenerate input without throwing", () => {
    expect(splitReferences("")).toEqual([]);
    expect(splitReferences(undefined)).toEqual([]);
    expect(splitReferences(null)).toEqual([]);
    expect(splitReferences(42)).toEqual([]);
  });
});

describe("hardBreakOutsideFences: typed breaks survive, code does not change", () => {
  it("makes a single newline a hard break", () => {
    expect(hardBreakOutsideFences("one\ntwo")).toBe("one  \ntwo");
  });

  it("leaves the last line and blank-separated paragraphs alone", () => {
    // A break before a blank line is stray whitespace, not a break.
    expect(hardBreakOutsideFences("one\n\ntwo")).toBe("one\n\ntwo");
    expect(hardBreakOutsideFences("only")).toBe("only");
  });

  it("DOES NOT TOUCH ANYTHING INSIDE A FENCED BLOCK", () => {
    // The load-bearing case: appending two spaces to pasted code corrupts it
    // and the damage is invisible once rendered.
    const code = ["intro", "```js", "const a = 1", "const b = 2", "```", "outro"].join("\n");
    const out = hardBreakOutsideFences(code);
    expect(out).toContain("const a = 1\nconst b = 2");
    expect(out).not.toContain("const a = 1  ");
    // The fence delimiters themselves must not gain trailing spaces either:
    // that would change what the fence is.
    expect(out).not.toContain("```js  ");
    // Text outside the fence still breaks.
    expect(out.startsWith("intro  \n")).toBe(true);
  });

  it("handles tilde fences and longer markers", () => {
    const out = hardBreakOutsideFences(["~~~", "a", "b", "~~~"].join("\n"));
    expect(out).toBe(["~~~", "a", "b", "~~~"].join("\n"));
    const long = hardBreakOutsideFences(["````", "a", "b", "````"].join("\n"));
    expect(long).toBe(["````", "a", "b", "````"].join("\n"));
  });

  it("does not let a shorter inner marker close a longer fence", () => {
    // ``` inside a ```` block is content, not a terminator. Getting this
    // wrong would resume breaking in the middle of pasted code.
    const out = hardBreakOutsideFences(["````", "```", "still code", "````", "after"].join("\n"));
    expect(out).toContain("```\nstill code");
    expect(out).not.toContain("still code  ");
  });

  it("resumes breaking after a fence closes", () => {
    const out = hardBreakOutsideFences(["```", "code", "```", "one", "two"].join("\n"));
    expect(out).toContain("one  \ntwo");
  });

  it("leaves an unterminated fence as code to the end", () => {
    // Better to decline a break than to corrupt what the user is mid-pasting.
    const out = hardBreakOutsideFences(["```", "a", "b"].join("\n"));
    expect(out).toBe(["```", "a", "b"].join("\n"));
  });

  it("skips indented code, the approximate case", () => {
    const out = hardBreakOutsideFences(["    const a = 1", "    const b = 2", "tail"].join("\n"));
    expect(out).not.toContain("const a = 1  ");
  });

  it("does not double an existing hard break", () => {
    expect(hardBreakOutsideFences("one  \ntwo")).toBe("one  \ntwo");
    expect(hardBreakOutsideFences("one\\\ntwo")).toBe("one\\\ntwo");
  });

  it("handles degenerate input without throwing", () => {
    expect(hardBreakOutsideFences("")).toBe("");
    expect(hardBreakOutsideFences(undefined)).toBe("");
    expect(hardBreakOutsideFences(null)).toBe("");
  });
});
