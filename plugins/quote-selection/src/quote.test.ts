/**
 * Unit tests for the pure quote model (#155).
 *
 * No DOM here on purpose: this repo has no jsdom harness (vitest runs plain
 * node), so the browser glue in ./client.tsx is thin by design and pinned by
 * ./chrome.test.ts source assertions instead. Everything decidable without a
 * browser lives in ./quote and is tested here.
 */
import { describe, expect, it } from "vitest";
import {
  appendToDraft,
  isAssistantFlowKind,
  isQuotableText,
  normalizeQuoteText,
  quoteNodesToText,
  toBlockquote,
} from "./quote";
import type { QuoteNode } from "./quote";

describe("appendToDraft: quoting appends, never replaces", () => {
  it("quotes into an empty draft bare", () => {
    expect(appendToDraft("", "> hello")).toBe("> hello");
  });

  it("a whitespace-only draft counts as empty", () => {
    expect(appendToDraft("  \n  ", "> hello")).toBe("> hello");
  });

  it("a half-typed draft survives with a blank line between", () => {
    expect(appendToDraft("my reply so far", "> hello")).toBe("my reply so far\n\n> hello");
  });

  it("trailing whitespace on the draft is dropped first, so repeats do not pile blank lines", () => {
    expect(appendToDraft("my reply\n\n   ", "> hello")).toBe("my reply\n\n> hello");
  });

  it("quoting twice appends a second block rather than overwriting the first", () => {
    const once = appendToDraft("", "> first");
    const twice = appendToDraft(once, "> second");
    expect(twice).toBe("> first\n\n> second");
  });
});

describe("normalizeQuoteText", () => {
  it("passes plain text through untouched", () => {
    expect(normalizeQuoteText("hello world")).toBe("hello world");
  });

  it("folds CRLF and lone CR to LF", () => {
    expect(normalizeQuoteText("a\r\nb\rc")).toBe("a\nb\nc");
  });

  it("collapses 3+ newlines to a paragraph break", () => {
    expect(normalizeQuoteText("a\n\n\n\nb")).toBe("a\n\nb");
  });

  it("keeps a single paragraph break intact", () => {
    expect(normalizeQuoteText("a\n\nb")).toBe("a\n\nb");
  });

  it("strips leading and trailing blank lines", () => {
    expect(normalizeQuoteText("\n\n  \na\nb\n  \n")).toBe("a\nb");
  });

  it("preserves indentation inside the quote", () => {
    expect(normalizeQuoteText("  indented\n\tTabbed")).toBe("  indented\n\tTabbed");
  });
});

describe("isQuotableText", () => {
  it("rejects empty and whitespace-only selections", () => {
    expect(isQuotableText("")).toBe(false);
    expect(isQuotableText("   \n\n  ")).toBe(false);
  });

  it("accepts real text", () => {
    expect(isQuotableText("hello")).toBe(true);
    expect(isQuotableText("\n\nhello\n\n")).toBe(true);
  });
});

describe("quoteNodesToText: block boundaries survive selection", () => {
  const text = (text: string): QuoteNode => ({ kind: "text", text: text });
  const block = (...children: QuoteNode[]): QuoteNode => ({ kind: "block", children: children });
  const inline = (...children: QuoteNode[]): QuoteNode => ({ kind: "inline", children: children });

  it("plain inline text concatenates", () => {
    expect(quoteNodesToText([text("a"), inline(text("b"), text("c"))])).toBe("abc");
  });

  it("two paragraphs stay two paragraphs", () => {
    expect(quoteNodesToText([block(text("para one")), block(text("para two"))])).toBe(
      "para one\n\npara two",
    );
  });

  it("a <br> is a lone newline, not a paragraph break", () => {
    expect(quoteNodesToText([block(text("line one"), { kind: "break" }, text("line two"))])).toBe(
      "line one\nline two",
    );
  });

  it("headings and list items each break the flow", () => {
    expect(
      quoteNodesToText([
        block(text("Title")),
        block(text("first")),
        block(text("second")),
      ]),
    ).toBe("Title\n\nfirst\n\nsecond");
  });

  it("code lines inside a pre keep their own newlines", () => {
    expect(quoteNodesToText([block(text("const a = 1;\nconst b = 2;"))])).toBe(
      "const a = 1;\nconst b = 2;",
    );
  });

  it("nested inline markup does not cost a line break", () => {
    expect(
      quoteNodesToText([
        block(text("see "), inline(text("code")), text(" here")),
      ]),
    ).toBe("see code here");
  });
});

describe("toBlockquote: markdown blockquote rendering", () => {
  it("prefixes a single line", () => {
    expect(toBlockquote("hello", false)).toBe("> hello");
  });

  it("a multi-paragraph quote stays multi-paragraph", () => {
    expect(toBlockquote("para one\n\npara two", false)).toBe("> para one\n>\n> para two");
  });

  it("blank lines become a bare marker with no trailing space", () => {
    expect(toBlockquote("a\n\nb", false)).toContain("\n>\n");
  });

  it("indented code lines keep their indentation", () => {
    expect(toBlockquote("  indented", false)).toBe(">   indented");
  });

  it("empty input renders empty, never a stray marker", () => {
    expect(toBlockquote("   \n  ", false)).toBe("");
  });

  it("fenced mode wraps the quote in a code fence so code survives as code", () => {
    expect(toBlockquote("const a = 1;\nconst b = 2;", true)).toBe(
      "> ```\n> const a = 1;\n> const b = 2;\n> ```",
    );
  });

  it("fenced mode keeps multi-paragraph code selections intact", () => {
    const out = toBlockquote("line one\n\nline two", true);
    expect(out.startsWith("> ```\n")).toBe(true);
    expect(out.endsWith("\n> ```")).toBe(true);
    expect(out).toContain("> line one\n>\n> line two");
  });
});

describe("isAssistantFlowKind: containment predicate", () => {
  it("arms only on assistant rows", () => {
    expect(isAssistantFlowKind("assistant")).toBe(true);
  });

  it("stays off user and steering rows (both bubble takeovers)", () => {
    expect(isAssistantFlowKind("user")).toBe(false);
    expect(isAssistantFlowKind("steering")).toBe(false);
  });

  it("stays off tool-call, compaction and error rows", () => {
    expect(isAssistantFlowKind("tool-call")).toBe(false);
    expect(isAssistantFlowKind("compaction")).toBe(false);
    expect(isAssistantFlowKind("error")).toBe(false);
  });

  it("fails closed on missing or empty kinds (composer, modal, input, sidebar)", () => {
    expect(isAssistantFlowKind(null)).toBe(false);
    expect(isAssistantFlowKind(undefined)).toBe(false);
    expect(isAssistantFlowKind("")).toBe(false);
  });
});
