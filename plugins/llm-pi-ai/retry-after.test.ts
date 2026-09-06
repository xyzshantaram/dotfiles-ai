// Regression tests for parseRetryAfterMs in plugins/llm-pi-ai/lib/index.js.
import { describe, expect, it } from "vitest";
import { parseRetryAfterMs } from "../llm-pi-ai/lib/index.js";

describe("parseRetryAfterMs", () => {
  it("parses delta seconds string and returns milliseconds", () => {
    expect(parseRetryAfterMs("120", 1000)).toBe(120000);
    expect(parseRetryAfterMs("120", 999999)).toBe(120000);
  });

  it("returns undefined for zero, negative, invalid, empty, null, and undefined values", () => {
    expect(parseRetryAfterMs("0", 1000)).toBeUndefined();
    expect(parseRetryAfterMs("-5", 1000)).toBeUndefined();
    expect(parseRetryAfterMs("abc", 1000)).toBeUndefined();
    expect(parseRetryAfterMs("", 1000)).toBeUndefined();
    expect(parseRetryAfterMs(null, 1000)).toBeUndefined();
    expect(parseRetryAfterMs(undefined, 1000)).toBeUndefined();
  });

  it("parses future HTTP date and returns milliseconds within range", () => {
    const nowMs = 1000000;
    const futureDate = new Date(nowMs + 45000).toUTCString();
    const result = parseRetryAfterMs(futureDate, nowMs);
    expect(result).toBeGreaterThanOrEqual(40000);
    expect(result).toBeLessThanOrEqual(45000);
  });

  it("returns undefined for past HTTP date", () => {
    const nowMs = 1000000;
    const pastDate = new Date(nowMs - 60000).toUTCString();
    expect(parseRetryAfterMs(pastDate, nowMs)).toBeUndefined();
  });

  it("returns undefined for fractional delta seconds", () => {
    expect(parseRetryAfterMs("1.5", 1000)).toBeUndefined();
  });

  it("parses whitespace-padded delta seconds", () => {
    expect(parseRetryAfterMs("  30  ", 1000)).toBe(30000);
  });
});
