/**
 * Unit tests for the pure text helpers in text.ts. These cover string
 * parsing only: no React render, no DOM, no snapshots.
 */
import { describe, expect, it } from "vitest";
import {
  HASH_ROW_RE,
  cleanReadTextForDiff,
  deIndent,
  isBuiltinReadEnvelope,
  numberedReadRows,
  parseSkillContent,
  readStartLine,
  splitSystemReminders,
} from "./text";

describe("deIndent", () => {
  it("strips the common leading whitespace from all lines", () => {
    expect(deIndent("  a\n  b\n    c")).toBe("a\nb\n  c");
  });

  it("takes the minimum indent from non-empty lines only", () => {
    // The blank line has no indent, so it must not set the minimum.
    expect(deIndent("    a\n\n    b")).toBe("a\n\nb");
  });

  it("collapses all-whitespace lines to empty strings and keeps the line count", () => {
    expect(deIndent("  a\n   \n  b")).toBe("a\n\nb");
  });

  it("expands a leading tab as 4 spaces before counting", () => {
    // One tab is one indent unit, so the tab-indented line sets min = 4 spaces.
    expect(deIndent("\tcode\n    plain")).toBe("code\nplain");
  });

  it("returns non-string input unchanged", () => {
    expect(deIndent(undefined as never)).toBe(undefined);
  });

  it("returns empty-string input unchanged", () => {
    expect(deIndent("")).toBe("");
  });
});

describe("HASH_ROW_RE", () => {
  it("matches a 3-char alphanumeric hash followed by the separator", () => {
    expect(HASH_ROW_RE.test("a01│content")).toBe(true);
    expect(HASH_ROW_RE.test("Z9x│content")).toBe(true);
  });

  it("rejects wrong hash shapes and must anchor at the line start", () => {
    expect(HASH_ROW_RE.test("ab│short")).toBe(false);
    expect(HASH_ROW_RE.test("abc1│4 chars")).toBe(false);
    expect(HASH_ROW_RE.test("  abc│leading space")).toBe(false);
    expect(HASH_ROW_RE.test("abc,content")).toBe(false);
  });
});

describe("isBuiltinReadEnvelope", () => {
  it("is true when the first line opens a path tag and a content tag exists", () => {
    const lines = ["<path>/a/b.ts</path>", "<type>file</type>", "<content>", "1: hi", "</content>"];
    expect(isBuiltinReadEnvelope(lines)).toBe(true);
  });

  it("is false without a <path> first line", () => {
    expect(isBuiltinReadEnvelope(["nope", "<content>"])).toBe(false);
  });

  it("is false without an exact <content> entry", () => {
    expect(isBuiltinReadEnvelope(["<path>/a</path>", "<content >"])).toBe(false);
  });

  it("is false for an empty list", () => {
    expect(isBuiltinReadEnvelope([])).toBe(false);
  });
});

describe("readStartLine", () => {
  it("uses args.offset when it is an integer >= 1", () => {
    expect(readStartLine({ offset: 7 }, "")).toBe(7);
  });

  it("ignores a non-integer or zero offset and falls back to the output scan", () => {
    expect(readStartLine({ offset: 2.5 }, "")).toBe(1);
    expect(readStartLine({ offset: 0 }, "")).toBe(1);
    expect(readStartLine(null, "")).toBe(1);
  });

  it("reads the start from a builtin partial-read footer", () => {
    const output = ["<path>/a</path>", "<content>", "5: e", "(Showing lines 5-9 of 40. File has more lines.)", "</content>"].join("\n");
    expect(readStartLine(null, output)).toBe(5);
  });

  it("pins the output-capped footer as a known limitation", () => {
    // Known limitation, not desired behavior: the builtin scan regex is
    // /\(Showing lines (\d+)-\d+/, which needs "(" directly before
    // "Showing". The capped footer reads "(Output capped. Showing lines",
    // so it never matches and the start falls back to 1.
    const output = ["<path>/a</path>", "<content>", "5: e", "(Output capped. Showing lines 5-9. Use offset to read more.)", "</content>"].join("\n");
    expect(readStartLine(null, output)).toBe(1);
  });

  it("returns 1 for a plain read with no range hints", () => {
    expect(readStartLine(null, "alpha\nbeta")).toBe(1);
  });

  it("pins a false footer match inside file content as a known limitation", () => {
    // Known limitation, not desired behavior: readStartLine scans the whole
    // output for the footer shape, so a file line that happens to look like
    // a pagination footer leaks into the returned start. This test pins the
    // actual result; do not read it as an endorsement.
    const output = "alpha\n(Showing lines 9-9 of 9)\ngamma";
    expect(readStartLine(null, output)).toBe(9);
  });
});

describe("numberedReadRows", () => {
  it("numbers plain reads sequentially from startLine", () => {
    expect(numberedReadRows("alpha\nbeta", 1)).toEqual([
      { number: 1, text: "alpha" },
      { number: 2, text: "beta" },
    ]);
    expect(numberedReadRows("alpha\nbeta", 10)).toEqual([
      { number: 10, text: "alpha" },
      { number: 11, text: "beta" },
    ]);
  });

  it("keeps the builtin tool's own numbers and drops the envelope lines", () => {
    const output = [
      "<path>/a/b.ts</path>",
      "<type>file</type>",
      "<content>",
      "3:     deep",
      "4:  top",
      "",
      "(Showing lines 3-4 of 9. File has more lines.)",
      "</content>",
    ].join("\n");
    expect(numberedReadRows(output, 1)).toEqual([
      { number: 3, text: "   deep" },
      { number: 4, text: "top" },
      // The blank separator line and the footer carry no number.
      { number: null, text: "" },
      { number: null, text: "(Showing lines 3-4 of 9. File has more lines.)" },
    ]);
  });

  it("scopes de-indentation to numbered rows only", () => {
    const output = [
      "<path>/a</path>",
      "<content>",
      "1:     indented",
      "2:  ok",
      "(note: this footer keeps its leading spaces)",
      "</content>",
    ].join("\n");
    const rows = numberedReadRows(output, 1);
    expect(rows).toEqual([
      { number: 1, text: "   indented" },
      { number: 2, text: "ok" },
      { number: null, text: "(note: this footer keeps its leading spaces)" },
    ]);
  });

  it("parses a hashline read and strips the 4-char anchor prefix", () => {
    const output = ["k3f│    deep", "x9Q│  top", "[hint line]"].join("\n");
    expect(numberedReadRows(output, 5)).toEqual([
      { number: 5, text: "  deep" },
      { number: 6, text: "top" },
      // Hint lines are not file content and carry no number.
      { number: null, text: "[hint line]" },
    ]);
  });

  it("leaves a non-hashline, non-envelope read in plain mode", () => {
    expect(numberedReadRows("a\nb", 1)).toEqual([
      { number: 1, text: "a" },
      { number: 2, text: "b" },
    ]);
  });
});

describe("cleanReadTextForDiff", () => {
  it("strips a builtin envelope down to bare file lines", () => {
    const text = [
      "<path>/a/b.ts</path>",
      "<type>file</type>",
      "<content>",
      "3:     deep",
      "4:  top",
      "",
      "(Showing lines 3-4 of 9. File has more lines.)",
      "</content>",
    ].join("\n");
    // cleanReadTextForDiff strips only the "N: " prefix. It does not
    // de-indent, so the remaining spaces stay exactly as served.
    expect(cleanReadTextForDiff(text)).toEqual({
      content: "    deep\n top",
      start: 3,
    });
  });

  it("keeps only hashline rows from a hashline read", () => {
    const text = ["k3f│    deep", "x9Q│top", "[hint line]"].join("\n");
    expect(cleanReadTextForDiff(text)).toEqual({
      content: "    deep\ntop",
      start: 1,
    });
  });

  it("returns plain text unchanged", () => {
    expect(cleanReadTextForDiff("alpha\nbeta")).toEqual({ content: "alpha\nbeta", start: 1 });
  });

  it("returns empty text unchanged", () => {
    expect(cleanReadTextForDiff("")).toEqual({ content: "", start: 1 });
  });
});

describe("parseSkillContent", () => {
  it("parses a well-formed skill_content block", () => {
    const text = [
      '<skill_content name="review">',
      "<skill_resources>",
      'Resources for this skill are managed by provider "researcher".',
      "Load referenced resources only as needed.",
      "</skill_resources>",
      "",
      "<skill_instructions>",
      "# Review skill",
      "",
      "Some body text.",
      "</skill_instructions>",
      "</skill_content>",
    ].join("\n");
    expect(parseSkillContent(text)).toEqual({
      name: "review",
      resourceHint:
        'Resources for this skill are managed by provider "researcher".\nLoad referenced resources only as needed.',
      instructions: "# Review skill\n\nSome body text.",
    });
  });

  it("unescapes the name attribute in the documented order", () => {
    const text = [
      '<skill_content name="a&lt;b&quot;c&amp;d">',
      "<skill_resources>",
      "r",
      "</skill_resources>",
      "",
      "<skill_instructions>",
      "i",
      "</skill_instructions>",
      "</skill_content>",
    ].join("\n");
    expect(parseSkillContent(text)?.name).toBe('a<b"c&d');
  });

  it("returns null for text that is not the exact shape", () => {
    expect(parseSkillContent("")).toBe(null);
    expect(parseSkillContent("just some text")).toBe(null);
    expect(parseSkillContent("<skill_content name=\"x\">no body</skill_content>")).toBe(null);
    // Missing the blank line between the two sections breaks the exact shape.
    const noBlankLine = [
      '<skill_content name="x">',
      "<skill_resources>",
      "r",
      "</skill_resources>",
      "<skill_instructions>",
      "i",
      "</skill_instructions>",
      "</skill_content>",
    ].join("\n");
    expect(parseSkillContent(noBlankLine)).toBe(null);
  });
});

describe("splitSystemReminders", () => {
  it("splits plain and reminder segments in order", () => {
    const text = "Some intro text.\n\n<system-reminder>\nThe following workspace instructions...\nfoo bar\n</system-reminder>\n\nTrailing text.";
    expect(splitSystemReminders(text)).toEqual([
      { reminder: false, text: "Some intro text.\n\n" },
      { reminder: true, text: "The following workspace instructions...\nfoo bar" },
      { reminder: false, text: "\n\nTrailing text." },
    ]);
  });

  it("keeps an escaped closing tag inside a reminder body as inert text", () => {
    const text = "<system-reminder>\nSome text with <\\/system-reminder> inside it, literally.\n</system-reminder>";
    expect(splitSystemReminders(text)).toEqual([
      { reminder: true, text: "Some text with <\\/system-reminder> inside it, literally." },
    ]);
  });

  it("returns a single plain segment when there are no reminders", () => {
    expect(splitSystemReminders("just text")).toEqual([{ reminder: false, text: "just text" }]);
  });

  it("returns an empty list for non-string or empty input", () => {
    expect(splitSystemReminders(undefined as never)).toEqual([]);
    expect(splitSystemReminders("")).toEqual([]);
  });
});
