/**
 * Tests for the ElectronHub browser-session harvest (ticket #108).
 *
 * Load-bearing logic, mutation-tested (see the ticket report for the mutant
 * run): expiry detection (ehJwtIsExpired — must fail closed) and the
 * absent-credential path (ehPickRefreshCookie / the fold's session-empty
 * line — must never render a comfortable lie).
 *
 * Fixture hygiene: no credential value appears anywhere here. JWTs are
 * crafted in-test from harmless fixture claims; cookie values are
 * obvious fakes ("dead-beef" style, never a real token shape).
 */

import { describe, expect, it } from "vitest";
import {
  EH_FIREFOX_COOKIE_HOST,
  EH_FIREFOX_COOKIE_NAME,
  EH_SESSION_ANALYTICS_NOTE,
  EH_SESSION_EXPIRED,
  EH_SESSION_NO_COOKIE,
  EH_SESSION_TIER_UNRESOLVED_NOTE,
  ehDecodeJwtPayload,
  ehIsPlausibleTokenChars,
  ehJwtIsExpired,
  ehJwtSecondsLeft,
  ehParseRefreshBody,
  ehParseRefreshSuccessor,
  ehParseSessionFlexCredits,
  ehParseSessionPermanentCredits,
  ehParseSessionSubscription,
  ehPickRefreshCookie,
  ehHarvestOutcome,
  ehResolveFirefoxProfiles,
  ehSessionCookieHeader,
  ehSessionHasContent,
} from "./eh-session-model";
import { ehSectionModel } from "./eh-section-model";

/** Craft a JWT-shaped token from fixture claims (never a real credential). */
function fixtureJwt(payload: unknown): string {
  const b64 = (value: unknown) =>
    Buffer.from(JSON.stringify(value), "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64(payload)}.fixture-signature`;
}

const NOW = 1789609205; // fixed "now" (unix seconds) for expiry tables

describe("ehResolveFirefoxProfiles", () => {
  const INI = [
    "[Profile1]",
    "Name=default",
    "IsRelative=1",
    "Path=1i6dv093.default",
    "Default=1",
    "",
    "[Profile0]",
    "Name=shantaram",
    "IsRelative=1",
    "Path=m0uvw5b1.shantaram",
    "",
    "[General]",
    "StartWithLastProfile=1",
    "Version=2",
    "",
    "[Install11457493C5A56847]",
    "Default=m0uvw5b1.shantaram",
    "Locked=1",
    "",
  ].join("\n");

  it("prefers the Install default, then Default=1, then the rest", () => {
    const ordered = ehResolveFirefoxProfiles(INI, "/home/someone");
    expect(ordered).toEqual([
      "/home/someone/.mozilla/firefox/m0uvw5b1.shantaram",
      "/home/someone/.mozilla/firefox/1i6dv093.default",
    ]);
  });

  it("never hardcodes a machine path: homeDir drives the root", () => {
    const ordered = ehResolveFirefoxProfiles(INI, "/home/other");
    expect(ordered[0]).toBe("/home/other/.mozilla/firefox/m0uvw5b1.shantaram");
    expect(ordered.join(" ")).not.toContain("/home/sid");
  });

  it("passes IsRelative=0 paths through untouched and dedupes", () => {
    const ini = [
      "[Profile2]",
      "Name=abs",
      "IsRelative=0",
      "Path=/data/ff/profile",
      "Default=1",
      "",
      "[Profile3]",
      "Name=dup",
      "IsRelative=0",
      "Path=/data/ff/profile",
      "",
    ].join("\n");
    expect(ehResolveFirefoxProfiles(ini, "/home/x")).toEqual(["/data/ff/profile"]);
  });

  it("answers [] for garbage instead of throwing", () => {
    expect(ehResolveFirefoxProfiles("not an ini at all", "/home/x")).toEqual([]);
    expect(ehResolveFirefoxProfiles("", "/home/x")).toEqual([]);
  });
});

describe("ehPickRefreshCookie", () => {
  const rows = [
    { host: ".electronhub.ai", name: "_bs", value: "opaque-1" },
    { host: ".electronhub.ai", name: "cf_clearance", value: "opaque-2" },
    { host: EH_FIREFOX_COOKIE_HOST, name: EH_FIREFOX_COOKIE_NAME, value: "fixture-refresh-1" },
    { host: "other.example", name: EH_FIREFOX_COOKIE_NAME, value: "wrong-host" },
    { host: EH_FIREFOX_COOKIE_HOST, name: "other-name", value: "wrong-name" },
  ];

  it("selects the one pinned host+name row (absent-credential path)", () => {
    expect(ehPickRefreshCookie(rows)).toBe("fixture-refresh-1");
  });

  it("answers null when the row is missing, empty, or malformed", () => {
    expect(ehPickRefreshCookie([])).toBeNull();
    expect(ehPickRefreshCookie(null)).toBeNull();
    expect(ehPickRefreshCookie([{ host: EH_FIREFOX_COOKIE_HOST, name: "nope", value: "x" }])).toBeNull();
    expect(
      ehPickRefreshCookie([{ host: EH_FIREFOX_COOKIE_HOST, name: EH_FIREFOX_COOKIE_NAME, value: "" }]),
    ).toBeNull();
  });

  it("builds a single-pair Cookie header, never a jar", () => {
    expect(ehSessionCookieHeader("fixture-refresh-1")).toBe("refresh_token=fixture-refresh-1");
  });
});

describe("mint response parsing", () => {
  it("accepts the observed {access_token, expires_in} shape", () => {
    expect(ehParseRefreshBody({ access_token: "aaa.bbb.ccc", expires_in: 3600 })).toEqual({
      accessToken: "aaa.bbb.ccc",
      expiresIn: 3600,
    });
  });

  it("tolerates a missing ttl but never a missing token", () => {
    expect(ehParseRefreshBody({ access_token: "aaa.bbb.ccc" })).toEqual({
      accessToken: "aaa.bbb.ccc",
      expiresIn: null,
    });
    expect(ehParseRefreshBody({ expires_in: 3600 })).toBeNull();
    expect(ehParseRefreshBody(null)).toBeNull();
    expect(ehParseRefreshBody("nope")).toBeNull();
  });

  it("extracts the rotation successor from Set-Cookie (string or array)", () => {
    const header = "refresh_token=fixture-next-2; Path=/; HttpOnly; Secure; SameSite=None";
    expect(ehParseRefreshSuccessor(header)).toBe("fixture-next-2");
    expect(ehParseRefreshSuccessor(["other=a; Path=/", header])).toBe("fixture-next-2");
    expect(ehParseRefreshSuccessor("other=a; Path=/")).toBeNull();
    expect(ehParseRefreshSuccessor(null)).toBeNull();
    expect(ehParseRefreshSuccessor("refresh_token=; Path=/")).toBeNull();
  });

  it("refuses implausible token alphabets for the write-back path", () => {
    expect(ehIsPlausibleTokenChars("abcDEF012._~+/-==")).toBe(true);
    expect(ehIsPlausibleTokenChars("has space")).toBe(false);
    expect(ehIsPlausibleTokenChars("semi;colon")).toBe(false);
    expect(ehIsPlausibleTokenChars("quote'")).toBe(false);
    expect(ehIsPlausibleTokenChars("")).toBe(false);
    expect(ehIsPlausibleTokenChars(null)).toBe(false);
  });
});

describe("JWT decode + expiry (fail-closed)", () => {
  const live = { sub: "user_1", iat: NOW - 100, exp: NOW + 3500, refresh_token_id: "rt-1", tier: 0 };

  it("decodes the payload claims of a well-formed token", () => {
    expect(ehDecodeJwtPayload(fixtureJwt(live))).toMatchObject({ sub: "user_1", tier: 0 });
  });

  it("rejects malformed tokens", () => {
    expect(ehDecodeJwtPayload("not-a-jwt")).toBeNull();
    expect(ehDecodeJwtPayload("a.b")).toBeNull();
    expect(ehDecodeJwtPayload("a.!!!.c")).toBeNull();
    expect(ehDecodeJwtPayload(null)).toBeNull();
  });

  it("seconds-left is exp minus now, null when exp is unusable", () => {
    expect(ehJwtSecondsLeft({ exp: NOW + 60 }, NOW)).toBe(60);
    expect(ehJwtSecondsLeft({}, NOW)).toBeNull();
    expect(ehJwtSecondsLeft({ exp: "soon" }, NOW)).toBeNull();
    expect(ehJwtSecondsLeft(null, NOW)).toBeNull();
  });

  it.each([
    ["fresh token is usable", { exp: NOW + 3500 }, false],
    ["token at exactly now is expired", { exp: NOW }, true],
    ["past token is expired", { exp: NOW - 1 }, true],
    ["missing exp is expired (fail-closed)", {}, true],
    ["non-numeric exp is expired (fail-closed)", { exp: "later" }, true],
  ])("%s", (_name, claims, expired) => {
    expect(ehJwtIsExpired(claims, NOW)).toBe(expired);
  });
});

describe("session surface parsers (captured shapes)", () => {
  const SUBSCRIPTION = {
    tier: 0,
    tier_label: "Free",
    active: false,
    subscription_status: "inactive",
    cancel_at_period_end: false,
    current_period_end: null,
    payment_provider: null,
    period: null,
    premium_expiry: 0,
    expires_in_days: null,
    amount: null,
    email: "fixture@example.com",
    email_verified: true,
    last_tier_change: 0,
    manage: { method: null, has_portal: false, can_cancel: false, portal_endpoint: null },
  };
  const PERMANENT = {
    balance: 0.25,
    enabled: true,
    total_purchased_usd: 10,
    current_bonus_percentage: 5,
    next_discount_threshold: 500,
    rate_limit_scale_tier: 1,
    rate_limit_scale_name: "Scale 1",
    rate_limit_scale_next: "Reach $100",
    monthly_limit: 10,
    monthly_spent: 9.75,
    monthly_remaining: 0.25,
    monthly_reset: "2026-10",
  };
  const FLEX = {
    flex_credits: 0.1,
    flex_credits_enabled: true,
    weekly_save_limit: 0.05,
    weekly_saved: 0.01,
    weekly_save_remaining: 0.04,
    total_cap: 0.125,
  };

  it("keeps the captured field names verbatim", () => {
    const sub = ehParseSessionSubscription(SUBSCRIPTION);
    expect(Object.keys(sub).sort()).toEqual(Object.keys(SUBSCRIPTION).sort());
    expect(sub?.tier_label).toBe("Free");
    expect(sub?.manage).toEqual(SUBSCRIPTION.manage);
    expect(ehParseSessionPermanentCredits(PERMANENT)).toMatchObject({
      balance: 0.25,
      monthly_remaining: 0.25,
      monthly_reset: "2026-10",
    });
    expect(ehParseSessionFlexCredits(FLEX)).toMatchObject({
      flex_credits: 0.1,
      total_cap: 0.125,
    });
  });

  it("coerces numeric strings and degrades unknowns to null", () => {
    expect(ehParseSessionSubscription({ ...SUBSCRIPTION, tier: "0" })?.tier).toBe(0);
    expect(ehParseSessionPermanentCredits({ balance: "oops" })?.balance).toBeNull();
    expect(ehParseSessionSubscription(null)).toBeNull();
    expect(ehParseSessionSubscription([1, 2])).toBeNull();
    expect(ehParseSessionFlexCredits("junk")).toBeNull();
  });

  it.each([
    ["null", null, false],
    ["empty object", {}, false],
    ["subscription block", { subscription: { tier: 0 } }, true],
    ["permanent block", { permanentCredits: { balance: 0 } }, true],
    ["flex block", { flexCredits: { flex_credits: 0 } }, true],
  ])("ehSessionHasContent: %s", (_name, session, expected) => {
    expect(ehSessionHasContent(session)).toBe(expected);
  });
});

describe("#108 fold: harvested session envelope", () => {
  const okBody = (body: unknown) => ({ data: body, error: null });
  const sessionBody = (session: unknown) => okBody({ ok: true, session });

  const FULL_SESSION = {
    fetchedAt: "2026-09-17T09:30:00.000Z",
    sessionExpiresIn: 3600,
    reflected: true,
    partial: false,
    subscription: {
      tier: 0,
      tier_label: "Free",
      active: false,
      subscription_status: "inactive",
      email: "fixture@example.com",
      manage: {},
    },
    permanentCredits: { balance: 0.25, monthly_remaining: 0.25, monthly_reset: "2026-10" },
    flexCredits: { flex_credits: 0.1, weekly_save_remaining: 0.04 },
  };

  it("a harvested session renders ready with the recorded-limitation notes", () => {
    const model = ehSectionModel(undefined, undefined, sessionBody(FULL_SESSION));
    expect(model.status).toBe("ready");
    expect(model.errorLine).toBeNull();
    expect(model.emptyLine).toBeNull();
    expect(model.notes).toContain(EH_SESSION_TIER_UNRESOLVED_NOTE);
    expect(model.notes).toContain(EH_SESSION_ANALYTICS_NOTE);
    expect(model.session).toMatchObject({ fetchedAt: FULL_SESSION.fetchedAt });
  });

  it("an empty harvested session says so in session wording, never the key wording", () => {
    const model = ehSectionModel(undefined, undefined, sessionBody({ fetchedAt: "x" }));
    expect(model.status).toBe("empty");
    expect(model.emptyLine).toBe("ElectronHub session returned no account data.");
  });

  it("a failed harvest surfaces the login-again message in the error slot", () => {
    const model = ehSectionModel(undefined, undefined, { data: null, error: EH_SESSION_EXPIRED });
    expect(model.status).toBe("error");
    expect(model.errorLine).toBe("ElectronHub: " + EH_SESSION_EXPIRED);
    expect(model.emptyLine).toBeNull();
  });

  it("a missing harvest surfaces the no-cookie affordance", () => {
    const model = ehSectionModel(undefined, undefined, { data: null, error: EH_SESSION_NO_COOKIE });
    expect(model.status).toBe("error");
    expect(model.errorLine).toContain("no ElectronHub browser session");
  });

  it("the fold never carries a token: the session object holds figures only", () => {
    const model = ehSectionModel(undefined, undefined, sessionBody(FULL_SESSION));
    const text = JSON.stringify(model);
    expect(text).not.toContain("access_token");
    expect(text).not.toContain("accessToken");
    expect(text).not.toContain("refresh_token");
  });

  it("the never-a-bare-heading contract holds with a third envelope", () => {
    const pairs: unknown[][] = [
      [undefined, undefined, undefined],
      [okBody({ ok: true }), undefined, undefined],
      [undefined, undefined, sessionBody({ fetchedAt: "x" })],
      [{ data: null, error: "HTTP 500" }, undefined, sessionBody(FULL_SESSION)],
    ];
    for (const [u, m, s] of pairs) {
      const model = ehSectionModel(u, m, s);
      const slots = [model.errorLine !== null, model.emptyLine !== null, model.status === "ready"].filter(
        Boolean,
      ).length;
      expect(slots).toBe(1);
    }
  });
});

describe("ehHarvestOutcome (the dead-cookie lie, pinned)", () => {
  // Probed live 2026-09-24: the profile HELD the cookie (87 chars, exact
  // host) while the mint answered 401 — the old code relabeled that
  // EXPIRED state as NO_COOKIE and sent the owner hunting a harvest bug
  // that did not exist. These rows pin the honest split.
  it("a dead cookie (mint 401, cookie seen) is EXPIRED, never no-cookie", () => {
    const outcome = ehHarvestOutcome({ minted: null, error: new Error(EH_SESSION_EXPIRED) });
    expect(outcome).toEqual({ kind: "expired" });
  });
  it("no cookie in any profile is the only no-cookie case", () => {
    expect(ehHarvestOutcome({ minted: null, error: null })).toEqual({ kind: "no-cookie" });
    expect(ehHarvestOutcome(null)).toEqual({ kind: "no-cookie" });
    expect(ehHarvestOutcome({})).toEqual({ kind: "no-cookie" });
  });
  it("transport/parse failures keep their own message", () => {
    const outcome = ehHarvestOutcome({ minted: null, error: new Error("fetch failed") });
    expect(outcome).toEqual({ kind: "error", message: "fetch failed" });
  });
  it("a non-Error rejection is stringified, never crashes the split", () => {
    const outcome = ehHarvestOutcome({ minted: null, error: "boom" });
    expect(outcome).toEqual({ kind: "error", message: "boom" });
  });
  it("success carries whether the rotation successor was written back", () => {
    expect(ehHarvestOutcome({ minted: { reflected: true }, error: null })).toEqual({
      kind: "session",
      reflected: true,
    });
    expect(ehHarvestOutcome({ minted: { reflected: false }, error: null })).toEqual({
      kind: "session",
      reflected: false,
    });
  });
});
