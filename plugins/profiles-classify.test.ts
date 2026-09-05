/**
 * Regression tests for normalizeErrorClass and failoverNoticeText in plugins/profiles.ts.
 *
 * The classifier order matters: the no-credits message test runs before the
 * code table, so a QUOTA code paired with an insufficient-credits message
 * stays no-credits instead of collapsing to rate-limit.
 */
import { describe, expect, it } from "vitest";
import { normalizeErrorClass, failoverNoticeText } from "./profiles";

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

  it("maps SERVER and HTTP 5xx codes to server-error", () => {
    expect(normalizeErrorClass("SERVER", "boom")).toBe("server-error");
    expect(normalizeErrorClass("HTTP_500", "internal error")).toBe("server-error");
    expect(normalizeErrorClass("HTTP_502", "bad gateway")).toBe("server-error");
    expect(normalizeErrorClass("HTTP_503", "service unavailable")).toBe("server-error");
    expect(normalizeErrorClass("HTTP_504", "gateway timeout")).toBe("server-error");
    expect(normalizeErrorClass("INTERNAL", "server fault")).toBe("server-error");
    expect(normalizeErrorClass("INTERNAL_ERROR", "oops")).toBe("server-error");
    expect(normalizeErrorClass("SERVICE_UNAVAILABLE", "down")).toBe("server-error");
  });

  it("maps server-error messages to server-error", () => {
    expect(normalizeErrorClass(undefined, "internal server error")).toBe("server-error");
    expect(normalizeErrorClass(undefined, "service unavailable")).toBe("server-error");
    expect(normalizeErrorClass(undefined, "bad gateway")).toBe("server-error");
    expect(normalizeErrorClass(undefined, "gateway timeout")).toBe("server-error");
    expect(normalizeErrorClass(undefined, "http 500")).toBe("server-error");
    expect(normalizeErrorClass(undefined, "http 502")).toBe("server-error");
  });

  it("handles live message from provider: 500 json error", () => {
    expect(
      normalizeErrorClass("SERVER", '500: {"type":"error","message":"Internal server error"}'),
    ).toBe("server-error");
  });

  it("keeps no-credits when QUOTA code meets billing message", () => {
    expect(normalizeErrorClass("QUOTA", "insufficient credits")).toBe("no-credits");
  });
});

describe("failoverNoticeText", () => {
  it("formats the header with exact shape", () => {
    const result = failoverNoticeText("openai", "gpt-4", "anthropic", "claude-3", "RATE_LIMIT", "");
    expect(result).toMatch(/^LLM failover openai\/gpt-4 -> anthropic\/claude-3 \(RATE_LIMIT\)/);
  });

  it("uses UNKNOWN when code is undefined", () => {
    const result = failoverNoticeText("openai", "gpt-4", "anthropic", "claude-3", undefined, "");
    expect(result).toMatch(/^LLM failover openai\/gpt-4 -> anthropic\/claude-3 \(UNKNOWN\)/);
  });

  it("includes blank line between header and detail", () => {
    const result = failoverNoticeText(
      "openai",
      "gpt-4",
      "anthropic",
      "claude-3",
      "AUTH",
      "Invalid API key",
    );
    expect(result).toContain("\n\n");
    const parts = result.split("\n\n");
    expect(parts[0]).toMatch(/^LLM failover/);
    expect(parts[1]).toBe("Invalid API key");
  });

  it("trims message to 500 chars", () => {
    const longMessage = "x".repeat(600);
    const result = failoverNoticeText("a", "b", "c", "d", "E", longMessage);
    const lines = result.split("\n\n");
    expect(lines[1].length).toBe(500);
  });

  it("trims excess whitespace from message", () => {
    const result = failoverNoticeText("a", "b", "c", "d", "E", "  message  \n  ");
    expect(result).toContain("message");
    expect(result).not.toContain("  message  ");
  });

  it("handles empty message", () => {
    const result = failoverNoticeText("a", "b", "c", "d", "E", "");
    const lines = result.split("\n\n");
    expect(lines[1]).toBe("");
  });
});
