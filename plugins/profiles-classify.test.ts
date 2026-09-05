/**
 * Regression tests for normalizeErrorClass in plugins/profiles.ts.
 *
 * The classifier order matters: the no-credits message test runs before the
 * code table, so a QUOTA code paired with an insufficient-credits message
 * stays no-credits instead of collapsing to rate-limit.
 */
import { describe, expect, it } from "vitest";
import { normalizeErrorClass } from "./profiles";

describe("normalizeErrorClass", () => {
  it("keeps no-credits when a QUOTA code meets a billing message", () => {
    expect(normalizeErrorClass("QUOTA", "quota exceeded for this key")).toBe("no-credits");
    expect(normalizeErrorClass("QUOTA", "billing account out of credits")).toBe("no-credits");
  });

  it("maps a bare QUOTA code to rate-limit", () => {
    expect(normalizeErrorClass("QUOTA", "slow down")).toBe("rate-limit");
  });

  it("maps usage-limit messages to rate-limit", () => {
    expect(normalizeErrorClass(undefined, "usage limit reached")).toBe("rate-limit");
    expect(normalizeErrorClass(undefined, "usage_limit reached")).toBe("rate-limit");
  });

  it("maps unknown-model codes and messages to model-unavailable", () => {
    expect(normalizeErrorClass("UNKNOWN_MODEL", "boom")).toBe("model-unavailable");
    expect(normalizeErrorClass(undefined, "no such model: foo")).toBe("model-unavailable");
    expect(normalizeErrorClass(undefined, "the account has no configured model")).toBe(
      "model-unavailable",
    );
  });

  it("returns undefined for transient failures", () => {
    expect(normalizeErrorClass(undefined, "socket hang up")).toBeUndefined();
    expect(normalizeErrorClass("weird-code-123", "something odd")).toBeUndefined();
  });
});
