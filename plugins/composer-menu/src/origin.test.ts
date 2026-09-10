/**
 * Same-origin guard tests (#136).
 *
 * This guard protects a route that RAISES SANDBOX PERMISSIONS, so the tests
 * that matter most are the refusals. The bug being fixed made the check
 * refuse everything, and the tempting overcorrection is to make it accept
 * everything — the negative cases below are what stand between those two
 * failures.
 */
import { describe, expect, it } from "vitest";
import { isSameOriginPost } from "./index";

describe("isSameOriginPost accepts the app's own page", () => {
  it("accepts a plain-http same-authority POST", () => {
    expect(isSameOriginPost("http://127.0.0.1:3080", "127.0.0.1:3080")).toBe(true);
  });

  it("accepts an HTTPS page behind a TLS-terminating proxy", () => {
    // THE REPORTED BUG. The old check rebuilt "http://" + host and compared
    // strings, so this exact case 403'd every guarded POST.
    expect(isSameOriginPost("https://potato.local:1337", "potato.local:1337")).toBe(true);
  });

  it("accepts a default-port HTTPS origin against a port-less Host", () => {
    // URL.host omits the default port, and the Host header usually does too.
    expect(isSameOriginPost("https://example.com", "example.com")).toBe(true);
  });

  it("ignores authority case, which is not significant", () => {
    expect(isSameOriginPost("https://Potato.Local:1337", "potato.local:1337")).toBe(true);
    expect(isSameOriginPost("https://potato.local:1337", "Potato.Local:1337")).toBe(true);
  });

  it("tolerates a Host header with stray whitespace", () => {
    expect(isSameOriginPost("http://127.0.0.1:3080", " 127.0.0.1:3080 ")).toBe(true);
  });
});

describe("isSameOriginPost refuses everything else", () => {
  it("refuses a genuinely cross-origin POST", () => {
    // The attack the guard exists for: an unrelated page POSTing text/plain
    // with a JSON body, which does NOT trigger a CORS preflight.
    expect(isSameOriginPost("https://evil.example", "potato.local:1337")).toBe(false);
  });

  it("refuses a different PORT on the same host", () => {
    // A different port is a different origin; another local service must not
    // be able to raise our sandbox permissions.
    expect(isSameOriginPost("http://127.0.0.1:9999", "127.0.0.1:3080")).toBe(false);
  });

  it("refuses a subdomain that merely looks similar", () => {
    expect(isSameOriginPost("https://evil.potato.local:1337", "potato.local:1337")).toBe(false);
    expect(isSameOriginPost("https://potato.local.evil:1337", "potato.local:1337")).toBe(false);
  });

  it("refuses a MISSING Origin rather than trusting it", () => {
    // Browsers always attach Origin to a POST, so its absence is not a
    // legitimate same-origin case — it is a non-browser client or something
    // stripping headers.
    expect(isSameOriginPost(undefined, "127.0.0.1:3080")).toBe(false);
    expect(isSameOriginPost("", "127.0.0.1:3080")).toBe(false);
    expect(isSameOriginPost(null, "127.0.0.1:3080")).toBe(false);
  });

  it("refuses an opaque origin", () => {
    // A sandboxed iframe or a privacy-sensitive cross-site initiator sends
    // the literal "null", which is not a URL.
    expect(isSameOriginPost("null", "127.0.0.1:3080")).toBe(false);
  });

  it("refuses when the Host header is missing or unusable", () => {
    expect(isSameOriginPost("http://127.0.0.1:3080", undefined)).toBe(false);
    expect(isSameOriginPost("http://127.0.0.1:3080", "")).toBe(false);
  });

  it("refuses a malformed Origin instead of throwing", () => {
    expect(isSameOriginPost("not a url", "127.0.0.1:3080")).toBe(false);
    expect(isSameOriginPost("://", "127.0.0.1:3080")).toBe(false);
  });

  it("does not accept an Origin whose authority is empty", () => {
    // e.g. a scheme-only or file: origin, whose host is "".
    expect(isSameOriginPost("file:///etc/passwd", "127.0.0.1:3080")).toBe(false);
  });
});
