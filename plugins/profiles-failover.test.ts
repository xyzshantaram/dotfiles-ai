/**
 * Contract tests for advanceChain and recordFailure in plugins/profiles.ts.
 *
 * These functions will be extracted from the registerFailover closure.
 * The tests pin the exact contract before extraction lands.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { advanceChain, recordFailure, markDown, isCachedDown, clearDownCache } from "./profiles";

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

describe("down-cache", () => {
  const makeLevel = (provider: string, model: string) => ({ provider, model });

  beforeEach(() => {
    clearDownCache();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  it("rate-limit first strike reads down inside the base window and clears after it lapses", () => {
    const level = makeLevel("openai", "gpt-4");
    markDown(level, "HTTP_429", "rate limit exceeded");

    // Inside base window 60_000 ms, isCachedDown returns true.
    vi.setSystemTime(30_000);
    expect(isCachedDown(level)).toBe(true);

    // At base window edge, still inside.
    vi.setSystemTime(59_999);
    expect(isCachedDown(level)).toBe(true);

    // Just past base window 60_000 ms, isCachedDown returns false.
    vi.setSystemTime(60_001);
    expect(isCachedDown(level)).toBe(false);
  });

  it("rate-limit second strike doubles the window", () => {
    const level = makeLevel("openai", "gpt-4");

    // Mark twice to trigger doubling: first strike at time 0.
    markDown(level, "HTTP_429", "rate limit exceeded");
    vi.setSystemTime(30_000);

    // Second strike at time 30_000.
    markDown(level, "HTTP_429", "rate limit exceeded");

    // Window doubles to 120_000 ms from the second mark time.
    // Just past base window 60_000 from second mark, still inside doubled window.
    vi.setSystemTime(30_000 + 60_000 + 1);
    expect(isCachedDown(level)).toBe(true);

    // At twice base window 120_000 from second mark, still inside.
    vi.setSystemTime(30_000 + 120_000 - 1);
    expect(isCachedDown(level)).toBe(true);

    // Just past twice base window, clears.
    vi.setSystemTime(30_000 + 120_000 + 1);
    expect(isCachedDown(level)).toBe(false);
  });

  it("server-error doubles the same way", () => {
    const level = makeLevel("anthropic", "claude-opus");

    markDown(level, "HTTP_500", "internal server error");
    vi.setSystemTime(30_000);
    markDown(level, "HTTP_500", "internal server error");

    vi.setSystemTime(30_000 + 60_000 + 1);
    expect(isCachedDown(level)).toBe(true);

    vi.setSystemTime(30_000 + 120_000 + 1);
    expect(isCachedDown(level)).toBe(false);
  });

  it("no-credits stays down for its full fixed window and clears one millisecond past it", () => {
    const level = makeLevel("anthropic", "claude-opus");

    markDown(level, "PAYMENT_REQUIRED", "insufficient credits");

    // Fixed window 600_000 ms, still inside at 599_999.
    vi.setSystemTime(599_999);
    expect(isCachedDown(level)).toBe(true);

    // At 600_000, still inside.
    vi.setSystemTime(600_000 - 1);
    expect(isCachedDown(level)).toBe(true);

    // One millisecond past 600_000, clears.
    vi.setSystemTime(600_001);
    expect(isCachedDown(level)).toBe(false);
  });

  it("auth fixed window clears one millisecond past exact value", () => {
    const level = makeLevel("openai", "gpt-4");

    markDown(level, "UNAUTHORIZED", "invalid api key");

    vi.setSystemTime(600_000 - 1);
    expect(isCachedDown(level)).toBe(true);

    vi.setSystemTime(600_001);
    expect(isCachedDown(level)).toBe(false);
  });

  it("unclassified failure marks nothing and does not go down", () => {
    const level = makeLevel("openai", "gpt-4");

    // Use code and message that normalizeErrorClass maps to undefined.
    markDown(level, "UNKNOWN_CODE", "some transient error");

    vi.setSystemTime(1);
    expect(isCachedDown(level)).toBe(false);
  });

  it("levels isolate: different provider stays live", () => {
    const levelA = makeLevel("openai", "gpt-4");
    const levelB = makeLevel("anthropic", "gpt-4");

    markDown(levelA, "HTTP_429", "rate limit exceeded");

    vi.setSystemTime(30_000);
    expect(isCachedDown(levelA)).toBe(true);
    expect(isCachedDown(levelB)).toBe(false);
  });

  it("expiry prunes old entries and fresh strike starts at base window", () => {
    const level = makeLevel("openai", "gpt-4");

    markDown(level, "HTTP_429", "rate limit exceeded");

    vi.setSystemTime(60_001);
    expect(isCachedDown(level)).toBe(false);

    // Fresh strike after expiry starts at base window again, not doubled.
    vi.setSystemTime(60_001);
    markDown(level, "HTTP_429", "rate limit exceeded");

    vi.setSystemTime(60_001 + 60_000 - 1);
    expect(isCachedDown(level)).toBe(true);

    vi.setSystemTime(60_001 + 60_000 + 1);
    expect(isCachedDown(level)).toBe(false);
  });
});
