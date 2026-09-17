/**
 * Unit tests for the run_code shadow-row derivations in run-code.ts
 * (#152, Parts B and C). Pure string composition only: no React render, no DOM.
 */
import { describe, expect, it } from "vitest";
import {
  RUN_CODE_NO_OUTPUT,
  runCodeBodyText,
  runCodeInSummary,
  runCodeLineCount,
  runCodeOutSummary,
  runCodeOutputText,
  runCodeSummary,
} from "./run-code";

describe("runCodeSummary", () => {
  it("prefers the description's first line, like upstream deriveSummary", () => {
    expect(
      runCodeSummary(
        JSON.stringify({ code: "return 1", description: "Count things\nsecond line" }),
      ),
    ).toBe("Count things");
  });

  it("falls back to the first non-empty string value, then raw args", () => {
    expect(runCodeSummary(JSON.stringify({ code: "return 1" }))).toBe("return 1");
    expect(runCodeSummary("not json at all")).toBe("not json at all");
  });

  it("never renders an empty row label", () => {
    expect(runCodeSummary("")).toBe("Code");
    // Upstream-exact: an empty args object falls through to the raw args'
    // first line, just like deriveSummary.
    expect(runCodeSummary(JSON.stringify({}))).toBe("{}");
  });
});

describe("runCodeBodyText", () => {
  it("returns the program text behind the disclosure", () => {
    expect(runCodeBodyText(JSON.stringify({ code: "return 1", description: "d" }))).toBe(
      "return 1",
    );
  });

  it("falls back to pretty args JSON, then raw args", () => {
    expect(runCodeBodyText(JSON.stringify({ nope: true }))).toBe(
      JSON.stringify({ nope: true }, null, 2),
    );
    expect(runCodeBodyText("not json")).toBe("not json");
  });

  it("returns null with no args text, so the row is not expandable", () => {
    expect(runCodeBodyText("")).toBe(null);
  });
});

describe("runCodeOutputText", () => {
  it("joins text blocks verbatim and pretty-prints the rest", () => {
    expect(
      runCodeOutputText(
        [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
        false,
        undefined,
      ),
    ).toBe("a\nb");
    expect(runCodeOutputText([{ type: "image", url: "x" }], false, undefined)).toBe(
      JSON.stringify({ type: "image", url: "x" }, null, 2),
    );
  });

  it("renders nothing for empty, sentinel, or blank-only output", () => {
    expect(runCodeOutputText([], false, undefined)).toBe(null);
    expect(runCodeOutputText([{ type: "text", text: "" }], false, undefined)).toBe(null);
    expect(runCodeOutputText([{ type: "text", text: RUN_CODE_NO_OUTPUT }], false, undefined)).toBe(
      null,
    );
    expect(runCodeOutputText([{ type: "text", text: "  \n " }], false, undefined)).toBe(null);
  });

  it("shows failure text as the result, including the abort refusal", () => {
    const refusal =
      "Error: code run failed (abort): user rejected the approval request (a human refusal, not a crash)";
    expect(runCodeOutputText([{ type: "text", text: refusal }], true, { message: refusal })).toBe(
      refusal,
    );
  });

  it("keeps the upstream name/code fallback for contentless failures", () => {
    expect(runCodeOutputText([], true, { name: "AbortError", code: "ABORTED" })).toBe(
      "AbortError: ABORTED",
    );
  });
});

describe("runCodeLineCount", () => {
  it("counts newline-separated lines, ignoring one trailing newline", () => {
    expect(runCodeLineCount("return 1")).toBe(1);
    expect(runCodeLineCount("a\nb\nc")).toBe(3);
    expect(runCodeLineCount("return 1\n")).toBe(1);
    expect(runCodeLineCount("a\n\nb")).toBe(3);
  });

  it("is zero for empty or non-string input, never a label", () => {
    expect(runCodeLineCount("")).toBe(0);
    expect(runCodeLineCount(undefined as unknown as string)).toBe(0);
  });
});

describe("Part C section summaries", () => {
  it("IN summarises as language plus line count", () => {
    expect(runCodeInSummary("return 1")).toBe("ts [1]");
    expect(runCodeInSummary("a\nb\nc")).toBe("ts [3]");
    expect(runCodeInSummary("a\n".repeat(263))).toBe("ts [263]");
  });

  it("OUT summarises as a line count with correct singular/plural", () => {
    expect(runCodeOutSummary("hello")).toBe("1 line");
    expect(runCodeOutSummary("a\nb")).toBe("2 lines");
    expect(runCodeOutSummary("a\nb\nc\n")).toBe("3 lines");
  });
});
