/**
 * Contract tests for advanceChain and recordFailure in plugins/profiles.ts.
 *
 * These functions will be extracted from the registerFailover closure.
 * The tests pin the exact contract before extraction lands.
 */
import { describe, expect, it } from "vitest";
import { advanceChain, recordFailure } from "./profiles";

describe("advanceChain", () => {
  const makeLevel = (provider: string, model: string) => ({ provider, model });

  it("keeps cursor and exhausted false when all levels are live", () => {
    const levels = [makeLevel("a", "1"), makeLevel("b", "2")];
    const result = advanceChain(levels, 0, (lvl) => lvl.provider === "dead");
    expect(result).toEqual({ cursor: 0, exhausted: false });
  });

  it("moves cursor to index 1 when head is down and second is live", () => {
    const levels = [makeLevel("dead", "1"), makeLevel("b", "2")];
    const result = advanceChain(levels, 0, (lvl) => lvl.provider === "dead");
    expect(result).toEqual({ cursor: 1, exhausted: false });
  });

  it("lands on index 2 when first two are down then one is live", () => {
    const levels = [makeLevel("dead", "1"), makeLevel("dead", "2"), makeLevel("c", "3")];
    const result = advanceChain(levels, 0, (lvl) => lvl.provider === "dead");
    expect(result).toEqual({ cursor: 2, exhausted: false });
  });

  it("marks exhausted true with cursor on the last index when all levels are down", () => {
    const levels = [makeLevel("dead", "1"), makeLevel("dead", "2"), makeLevel("dead", "3")];
    const result = advanceChain(levels, 0, (lvl) => lvl.provider === "dead");
    expect(result).toEqual({ cursor: 2, exhausted: true });
  });

  it("marks exhausted true when levels array is empty", () => {
    const levels: Array<{ provider: string; model: string }> = [];
    const result = advanceChain(levels, 0, (lvl) => lvl.provider === "dead");
    expect(result).toEqual({ cursor: 0, exhausted: true });
  });

  it("stays on a live rung at mid-chain cursor with exhausted false", () => {
    const levels = [
      makeLevel("a", "1"),
      makeLevel("b", "2"),
      makeLevel("c", "3"),
      makeLevel("d", "4"),
    ];
    const result = advanceChain(levels, 2, (lvl) => lvl.provider === "dead");
    expect(result).toEqual({ cursor: 2, exhausted: false });
  });

  it("exhausts with cursor on last index when tail is down from mid-chain cursor", () => {
    const levels = [
      makeLevel("a", "1"),
      makeLevel("b", "2"),
      makeLevel("dead", "3"),
      makeLevel("dead", "4"),
    ];
    const result = advanceChain(levels, 2, (lvl) => lvl.provider === "dead");
    expect(result).toEqual({ cursor: 3, exhausted: true });
  });
});

describe("recordFailure", () => {
  const makeLevel = (provider: string, model: string) => ({ provider, model });

  it("appends the exact record shape with provider model code message", () => {
    const failures: Array<{
      level: { provider: string; model: string };
      code: string;
      message: string;
    }> = [];
    const level = makeLevel("openai", "gpt-4");
    recordFailure(failures, level, "RATE_LIMIT", "too many requests");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toEqual({
      level,
      code: "RATE_LIMIT",
      message: "too many requests",
    });
  });
});
