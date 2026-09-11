// Cover for the #137 redirect-origin decision. Pure functions only: no
// server, no DOM, no config service.
import { describe, expect, it } from "vitest";
import { isLoopbackHostname, normalizeConfiguredOrigin, resolveRedirectOrigin } from "./origin.js";

describe("isLoopbackHostname", () => {
  it.each(["localhost", "LOCALHOST", "127.0.0.1", "127.0.0.2", "127.1.2.3", "::1", "[::1]"])(
    "treats %s as loopback",
    (h) => {
      expect(isLoopbackHostname(h)).toBe(true);
    },
  );

  it.each(["example.com", "harness.example.com", "192.168.1.5", "10.0.0.1", "", "::2"])(
    "treats %s as non-loopback",
    (h) => {
      expect(isLoopbackHostname(h)).toBe(false);
    },
  );
});

describe("normalizeConfiguredOrigin", () => {
  it("treats unset values as loopback-only mode", () => {
    expect(normalizeConfiguredOrigin(undefined)).toEqual({ ok: true, origin: "" });
    expect(normalizeConfiguredOrigin(null)).toEqual({ ok: true, origin: "" });
    expect(normalizeConfiguredOrigin("")).toEqual({ ok: true, origin: "" });
    expect(normalizeConfiguredOrigin("   ")).toEqual({ ok: true, origin: "" });
  });

  it("pins a valid public origin", () => {
    expect(normalizeConfiguredOrigin("https://harness.example.com")).toEqual({
      ok: true,
      origin: "https://harness.example.com",
    });
  });

  it("normalises away path, query and trailing slash", () => {
    const v = normalizeConfiguredOrigin("https://harness.example.com/cb/?x=1");
    expect(v).toEqual({ ok: true, origin: "https://harness.example.com" });
  });

  it("accepts an http loopback pin", () => {
    expect(normalizeConfiguredOrigin("http://127.0.0.1:3939")).toEqual({
      ok: true,
      origin: "http://127.0.0.1:3939",
    });
  });

  it("rejects a non-URL with a loud error", () => {
    const v = normalizeConfiguredOrigin("not a url");
    expect(v.ok).toBe(false);
    if (v.ok === false) expect(v.error).toMatch(/invalid redirectOrigin/);
  });

  it("rejects a non-http(s) scheme with a loud error", () => {
    const v = normalizeConfiguredOrigin("ftp://files.example.com/x");
    expect(v.ok).toBe(false);
    if (v.ok === false) expect(v.error).toMatch(/scheme/);
  });

  it("rejects a non-string with a loud error", () => {
    const v = normalizeConfiguredOrigin(42);
    expect(v.ok).toBe(false);
    if (v.ok === false) expect(v.error).toMatch(/invalid redirectOrigin/);
  });
});

describe("resolveRedirectOrigin", () => {
  it("derives http://<host> for a loopback request with no configuration", () => {
    expect(resolveRedirectOrigin("127.0.0.1:3939", "")).toEqual({
      ok: true,
      origin: "http://127.0.0.1:3939",
      source: "loopback",
    });
  });

  it("derives for localhost and IPv6 loopback too", () => {
    expect(resolveRedirectOrigin("localhost:3000", "")).toEqual({
      ok: true,
      origin: "http://localhost:3000",
      source: "loopback",
    });
    expect(resolveRedirectOrigin("[::1]:4000", "")).toEqual({
      ok: true,
      origin: "http://[::1]:4000",
      source: "loopback",
    });
  });

  it("treats a missing Host header as loopback, like before", () => {
    expect(resolveRedirectOrigin(undefined, "")).toEqual({
      ok: true,
      origin: "http://127.0.0.1",
      source: "loopback",
    });
  });

  it("fails loudly for a non-loopback host with no configuration", () => {
    const v = resolveRedirectOrigin("harness.example.com", "");
    expect(v.ok).toBe(false);
    if (v.ok === false) {
      // Names the loopback constraint and the fix.
      expect(v.error).toMatch(/loopback/);
      expect(v.error).toMatch(/redirectOrigin/);
      // Quotes the host it refused, so the log is actionable.
      expect(v.error).toContain("harness.example.com");
    }
  });

  it("never produces a plausible-looking http://<public-host> guess", () => {
    // The old code returned http://harness.example.com here; that is the
    // exact wrong-uri trap this ticket closes.
    const v = resolveRedirectOrigin("harness.example.com:80", "");
    expect(v.ok).toBe(false);
  });

  it("fails loudly for a LAN host too: non-loopback is non-loopback", () => {
    expect(resolveRedirectOrigin("192.168.1.5:3000", "").ok).toBe(false);
  });

  it("a configured origin wins for a non-loopback request", () => {
    expect(resolveRedirectOrigin("harness.example.com", "https://harness.example.com")).toEqual({
      ok: true,
      origin: "https://harness.example.com",
      source: "configured",
    });
  });

  it("a configured origin wins even when the request looks like loopback", () => {
    // The dsh-remote case: a rewritten proxied request is indistinguishable
    // from genuine loopback, so derivation must not shadow the pin.
    expect(resolveRedirectOrigin("127.0.0.1:3939", "https://harness.example.com")).toEqual({
      ok: true,
      origin: "https://harness.example.com",
      source: "configured",
    });
  });

  it("a configured origin wins when no Host header is present", () => {
    const v = resolveRedirectOrigin(undefined, "https://harness.example.com");
    expect(v).toEqual({
      ok: true,
      origin: "https://harness.example.com",
      source: "configured",
    });
  });

  it("fails loudly for an unparseable Host header instead of guessing", () => {
    const v = resolveRedirectOrigin("http://[::1", "");
    expect(v.ok).toBe(false);
  });
});
