/**
 * Pins for the ElectronHub DevPass WebSocket module (ticket #68).
 *
 * The private usage road — status frame 41/42, activity 47/48 — is the only
 * way a dev key ever sees real numbers, so its wire shape is pinned
 * byte-exactly here rather than trusted to memory: a codec table proves the
 * type byte, the big-endian length and the JSON body land where the
 * reference says they do; a fragmentation table proves partial frames join
 * and batched frames split; the parsers prove the reference payload shapes
 * fold to the panel numbers (absent fields stay null, never 0); and the JWT
 * cache proves the rotation property — no mint while the cached token is
 * young, one mint shared by concurrent polls, and a failure cooldown so a
 * dead session cannot retry-storm the rotation chain.
 *
 * The live round-trip itself (ehWsDevpassFetch) is NOT exercised here: its
 * 41-frame needs a real minted token, and minting burns a rotation, so any
 * live-token verification stays pending-orchestrator on main.
 */

import { describe, expect, it } from "vitest";
import {
  EH_DEVPASS_HEADROOM_NOTE,
  EH_DEVPASS_REDUCED,
  EH_DEVPASS_UNLIMITED,
  EH_WS_DEVPASS_ACTIVITY_REQ,
  EH_WS_DEVPASS_ACTIVITY_RES,
  EH_WS_DEVPASS_STATUS_REQ,
  EH_WS_DEVPASS_STATUS_RES,
  EH_WS_ERROR,
  EH_WS_PING,
  ehDevpassHasContent,
  ehDevpassPercent,
  ehDevpassResetMs,
  ehDevpassServiceChip,
  ehJwtCache,
  ehParseDevpassActivity,
  ehParseDevpassStatus,
  ehWsEncode,
  ehWsReader,
} from "./eh-ws";

describe("frame codec", () => {
  it("encodes type byte, big-endian length, JSON body", () => {
    const frame = ehWsEncode(EH_WS_DEVPASS_STATUS_REQ, { access_token: "abc" });
    const body = new TextEncoder().encode(JSON.stringify({ access_token: "abc" }));
    expect(frame[0]).toBe(41);
    expect(Array.from(frame.slice(1, 5))).toEqual([
      (body.length >>> 24) & 0xff,
      (body.length >>> 16) & 0xff,
      (body.length >>> 8) & 0xff,
      body.length & 0xff,
    ]);
    expect(Array.from(frame.slice(5))).toEqual(Array.from(body));
  });

  it("round-trips a 47 request and a 5 error through the reader", () => {
    const reader = ehWsReader();
    const out = reader.push(
      ehWsEncode(EH_WS_DEVPASS_ACTIVITY_REQ, { access_token: "jwt", days: 14 }),
    );
    expect(out).toEqual([{ type: 47, payload: { access_token: "jwt", days: 14 } }]);
    const err = reader.push(ehWsEncode(EH_WS_ERROR, { message: "bad token" }));
    expect(err).toEqual([{ type: 5, payload: { message: "bad token" } }]);
  });

  it("joins a frame split across pushes and splits batched frames", () => {
    const reader = ehWsReader();
    const frame = ehWsEncode(EH_WS_DEVPASS_STATUS_RES, { tokens_used_today: 7 });
    // A 1-byte / rest split: nothing complete until the tail arrives.
    expect(reader.push(frame.slice(0, 1))).toEqual([]);
    expect(reader.push(frame.slice(1, 4))).toEqual([]);
    expect(reader.push(frame.slice(4))).toEqual([
      { type: 42, payload: { tokens_used_today: 7 } },
    ]);
    // Two frames in one chunk come back as two pairs, in order.
    const batched = ehWsReader();
    const pair = new Uint8Array([
      ...ehWsEncode(EH_WS_PING, {}),
      ...ehWsEncode(EH_WS_DEVPASS_ACTIVITY_RES, { days: [] }),
    ]);
    expect(batched.push(pair)).toEqual([
      { type: 6, payload: {} },
      { type: 48, payload: { days: [] } },
    ]);
  });

  it("refuses oversized frames and non-JSON bodies", () => {
    const huge = new Uint8Array([42, 0xff, 0xff, 0xff, 0xff]);
    expect(() => ehWsReader().push(huge)).toThrow("exceeds 1MB cap");
    const notJson = new Uint8Array([42, 0, 0, 0, 3, 0x7b, 0x7b, 0x7b]);
    expect(() => ehWsReader().push(notJson)).toThrow("not JSON");
  });
});

describe("status (42) parser", () => {
  /** The reference payload shape, all known fields present. */
  const full = {
    subscribed: true,
    tier: "devpass",
    status: "active",
    tokens_used_today: 1200,
    daily_limit: 5000,
    tokens_week: 9000,
    weekly_cap: 20000,
    active_requests: 2,
    concurrency_limit: 5,
    service_mode: "interactive",
    period_end: "2026-09-23T21:00:00Z",
  };

  it("folds the full reference shape to panel numbers", () => {
    expect(ehParseDevpassStatus(full)).toEqual({
      subscribed: true,
      tier: "devpass",
      status: "active",
      todayTokens: 1200,
      dailyLimit: 5000,
      todayPercent: 24,
      weekTokens: 9000,
      weeklyCap: 20000,
      weekPercent: 45,
      activeRequests: 2,
      concurrencyLimit: 5,
      serviceMode: "interactive",
      periodEnd: "2026-09-23T21:00:00Z",
    });
  });

  it("degrades absent fields to null, never 0, and caps percentages at 100", () => {
    const parsed = ehParseDevpassStatus({ tokens_used_today: 99999, daily_limit: 100 });
    expect(parsed && parsed.todayTokens).toBe(99999);
    expect(parsed && parsed.todayPercent).toBe(100);
    expect(parsed && parsed.weekTokens).toBeNull();
    expect(parsed && parsed.weekPercent).toBeNull();
    expect(parsed && parsed.serviceMode).toBeNull();
    expect(parsed && parsed.subscribed).toBeNull();
  });

  it("answers null for non-objects, and hasContent counts only drawable fields", () => {
    expect(ehParseDevpassStatus(null)).toBeNull();
    expect(ehParseDevpassStatus([1])).toBeNull();
    expect(ehDevpassHasContent(ehParseDevpassStatus(full))).toBe(true);
    expect(ehDevpassHasContent(ehParseDevpassStatus({ unknown: 1 }))).toBe(false);
    expect(ehDevpassHasContent(null)).toBe(false);
  });

  it("matches the reference percentage: round(min(100, used/limit*100))", () => {
    expect(ehDevpassPercent(1, 3)).toBe(33);
    expect(ehDevpassPercent(2, 3)).toBe(67);
    expect(ehDevpassPercent(0, 100)).toBe(0);
    expect(ehDevpassPercent(5, 0)).toBeNull();
    expect(ehDevpassPercent(null, 100)).toBeNull();
  });
});

describe("activity (48) parser: the rolling 7-day window", () => {
  // Fixed "today": 2026-09-22. The window is 09-16..09-22; 09-15 rolls out.
  const NOW = Date.UTC(2026, 8, 22, 12, 0, 0);
  const days = [
    { day: "2026-09-15", tokens: 111 },
    { day: "2026-09-16", tokens: 222 },
    { day: "2026-09-22", tokens: 333 },
    { day: "not-a-day", tokens: 999 },
  ];

  it("pins weekStart to today-6 and the leaving day to today-7 with its count", () => {
    const parsed = ehParseDevpassActivity({ days: days }, NOW);
    expect(parsed && parsed.weekStart).toBe("2026-09-16");
    expect(parsed && parsed.leavingDay).toBe("2026-09-15");
    expect(parsed && parsed.leavingTokens).toBe(111);
    // Malformed rows are dropped, never guessed at.
    expect(parsed && parsed.days).toEqual([
      { day: "2026-09-15", tokens: 111 },
      { day: "2026-09-16", tokens: 222 },
      { day: "2026-09-22", tokens: 333 },
    ]);
  });

  it("names the leaving day even when its count already rolled away", () => {
    const parsed = ehParseDevpassActivity({ days: [{ day: "2026-09-22", tokens: 1 }] }, NOW);
    expect(parsed && parsed.leavingDay).toBe("2026-09-15");
    expect(parsed && parsed.leavingTokens).toBeNull();
  });

  it("answers null for non-objects", () => {
    expect(ehParseDevpassActivity(null, NOW)).toBeNull();
    expect(ehParseDevpassActivity("x", NOW)).toBeNull();
  });
});

describe("daily reset countdown", () => {
  it("counts down to the next 21:00 UTC", () => {
    // 20:00 UTC -> one hour left; 22:00 UTC -> twenty-three hours left.
    expect(ehDevpassResetMs(Date.UTC(2026, 8, 22, 20, 0, 0))).toBe(3600000);
    expect(ehDevpassResetMs(Date.UTC(2026, 8, 22, 22, 0, 0))).toBe(23 * 3600000);
    // Exactly on the reset, the NEXT reset is tomorrow, not now.
    expect(ehDevpassResetMs(Date.UTC(2026, 8, 22, 21, 0, 0))).toBe(24 * 3600000);
  });
});

describe("JWT reuse cache: mint at most once per TTL", () => {
  /** A mint stub counting its calls against a controllable clock. */
  function stubMint(clock, calls, behavior) {
    return () => {
      calls.count++;
      return behavior(clock.now);
    };
  }

  it("reuses a young token and mints again only near expiry", async () => {
    const clock = { now: 1_000_000 };
    const calls = { count: 0 };
    const cache = ehJwtCache(
      stubMint(clock, calls, () => Promise.resolve({ accessToken: "jwt-1", expiresIn: 3600 })),
      { now: () => clock.now },
    );
    await expect(cache.get()).resolves.toEqual({ accessToken: "jwt-1", expiresIn: 3600 });
    await expect(cache.get()).resolves.toEqual({ accessToken: "jwt-1", expiresIn: 3600 });
    expect(calls.count).toBe(1);
    // 3600s TTL with a 300s margin: at +3300s the token is still good…
    clock.now += 3300 * 1000;
    await cache.get();
    expect(calls.count).toBe(1);
    // …at +3301s it is inside the margin and a second mint happens.
    clock.now += 1000;
    await cache.get();
    expect(calls.count).toBe(2);
  });

  it("shares one in-flight mint across concurrent polls", async () => {
    const clock = { now: 2_000_000 };
    const calls = { count: 0 };
    let release = null;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const cache = ehJwtCache(
      stubMint(clock, calls, () =>
        gate.then(() => ({ accessToken: "jwt-gated", expiresIn: 3600 })),
      ),
      { now: () => clock.now },
    );
    const first = cache.get();
    const second = cache.get();
    release();
    await expect(first).resolves.toEqual({ accessToken: "jwt-gated", expiresIn: 3600 });
    await expect(second).resolves.toEqual({ accessToken: "jwt-gated", expiresIn: 3600 });
    expect(calls.count).toBe(1);
  });

  it("cools down after a failed mint instead of retry-storming", async () => {
    const clock = { now: 3_000_000 };
    const calls = { count: 0 };
    const failure = new Error("electronhub session refresh HTTP 500");
    const cache = ehJwtCache(
      stubMint(clock, calls, () => Promise.reject(failure)),
      { now: () => clock.now, failCooldownMs: 300000 },
    );
    await expect(cache.get()).rejects.toBe(failure);
    // Inside the cooldown the SAME error answers with no new mint.
    await expect(cache.get()).rejects.toBe(failure);
    expect(calls.count).toBe(1);
    // Past the cooldown one retry is allowed…
    clock.now += 300001;
    await expect(cache.get()).rejects.toBe(failure);
    expect(calls.count).toBe(2);
  });

  it("falls back to the default TTL when the mint names none", async () => {
    const clock = { now: 4_000_000 };
    const calls = { count: 0 };
    const cache = ehJwtCache(
      stubMint(clock, calls, () => Promise.resolve({ accessToken: "jwt-x", expiresIn: null })),
      { now: () => clock.now, defaultTtlSec: 3300, refreshMarginSec: 300 },
    );
    await expect(cache.get()).resolves.toEqual({ accessToken: "jwt-x", expiresIn: 3300 });
    clock.now += 3000 * 1000;
    await cache.get();
    expect(calls.count).toBe(1);
    clock.now += 1000;
    await cache.get();
    expect(calls.count).toBe(2);
  });
});

describe("display copy", () => {
  it("keeps the reference chips and headroom line verbatim", () => {
    expect(EH_DEVPASS_UNLIMITED).toBe("Unlimited tokens");
    expect(EH_DEVPASS_REDUCED).toBe("Reduced speed");
    expect(EH_DEVPASS_HEADROOM_NOTE).toBe(
      "Beyond your full-speed headroom, requests continue at lower priority. Resets 21:00 UTC.",
    );
  });

  it("maps the known service modes to chips, passes the rest through raw", () => {
    expect(ehDevpassServiceChip("interactive")).toBe("Unlimited tokens");
    expect(ehDevpassServiceChip("slowed")).toBe("Reduced speed");
    expect(ehDevpassServiceChip("paused")).toBe("paused");
    expect(ehDevpassServiceChip(null)).toBeNull();
    expect(ehDevpassServiceChip(undefined)).toBeNull();
  });
});
