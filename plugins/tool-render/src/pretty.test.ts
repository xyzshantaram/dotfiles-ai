// Unit tests for the pure prettyView helpers in pretty.ts. String and
// shape checks only: no React render, no DOM, no plugin host.
import { describe, expect, it } from "vitest";
import { countMessageRows, isPrettyView, prettyRows } from "./pretty";

function sampleView() {
  return {
    version: 1,
    span: { minSeq: 10, maxSeq: 62 },
    items: [
      { type: "message", seq: 10, role: "user", text: "run the build" },
      { type: "toolStrip", seq: 12, tool: "bash", count: 48 },
      { type: "message", seq: 20, role: "assistant", text: "done" },
      { type: "elided", seq: 30, note: "3 near-duplicate reads" },
      { type: "media", seq: 40, label: "screenshot.png" },
      { type: "checkpoint", seq: 50 },
    ],
    tail: { count: 4, tokens: 900, fromSeq: 63 },
    stats: { droppedResultTokens: 12000, erroredCalls: 2, hiddenCalls: 7 },
  };
}

describe("isPrettyView", () => {
  it("accepts the payload shape the fork emits", () => {
    expect(isPrettyView(sampleView())).toBe(true);
  });

  it("accepts a null tail", () => {
    const view = sampleView();
    view.tail = null;
    expect(isPrettyView(view)).toBe(true);
  });

  it("rejects non-objects, wrong versions, and missing stats", () => {
    expect(isPrettyView(null)).toBe(false);
    expect(isPrettyView("x")).toBe(false);
    expect(isPrettyView({ ...sampleView(), version: 2 })).toBe(false);
    const noStats = sampleView();
    delete (noStats as Record<string, unknown>).stats;
    expect(isPrettyView(noStats)).toBe(false);
  });
});

describe("prettyRows", () => {
  it("maps each renderable item kind and drops checkpoint items", () => {
    const rows = prettyRows(sampleView());
    expect(rows.map((r) => r.kind)).toEqual([
      "message",
      "toolStrip",
      "message",
      "elided",
      "media",
    ]);
    expect(rows[1]).toEqual({ kind: "toolStrip", seq: 12, tool: "bash", count: 48 });
  });

  it("returns no rows for a missing or malformed payload", () => {
    expect(prettyRows(null)).toEqual([]);
    expect(prettyRows({ version: 1 })).toEqual([]);
  });

  it("coerces an unknown message role to system", () => {
    const view = sampleView();
    (view.items[0] as { role: string }).role = "tool";
    const rows = prettyRows(view);
    expect(rows[0]).toMatchObject({ kind: "message", role: "system" });
  });
});

describe("countMessageRows", () => {
  it("counts message rows only", () => {
    expect(countMessageRows(prettyRows(sampleView()))).toBe(2);
    expect(countMessageRows([])).toBe(0);
  });
});
