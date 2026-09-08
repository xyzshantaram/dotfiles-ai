/**
 * Contract tests for advanceChain and recordFailure in plugins/profiles.ts.
 *
 * These functions will be extracted from the registerFailover closure.
 * The tests pin the exact contract before extraction lands.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import {
  advanceChain,
  recordFailure,
  markDown,
  isCachedDown,
  clearDownCache,
  normalizeErrorClass,
  sequenceKeyOf,
  recordSequenceFailure,
  isSequenceFailed,
  makeFailoverStatusHandler,
  recordFailoverEvent,
  clearFailoverEvents,
} from "./profiles";

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

  it("unclassified failure falls back to the short transient window (ticket #96)", () => {
    const level = makeLevel("openai", "gpt-4");

    // The regressed case: bodyless/transport failures classify as nothing.
    expect(normalizeErrorClass("UNKNOWN_CODE", "some transient error")).toBe(undefined);

    markDown(level, "UNKNOWN_CODE", "some transient error");

    // Inside the 30s transient window the rung reads down ...
    vi.setSystemTime(1);
    expect(isCachedDown(level)).toBe(true);
    vi.setSystemTime(29_999);
    expect(isCachedDown(level)).toBe(true);

    // ... and clears just past it, so a blip never blacklists a rung for minutes.
    vi.setSystemTime(30_001);
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

describe("ticket #96: middle rung always fails", () => {
  const makeLevel = (provider: string, model: string) => ({ provider, model });

  beforeEach(() => {
    clearDownCache();
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  it("walk terminates at the first working rung without revisiting a failed rung", () => {
    const head = makeLevel("cmd-code", "rung-1");
    const deadMiddle = makeLevel("opencode-go", "rung-2");
    const tail = makeLevel("zai", "rung-3");
    const levels = [head, deadMiddle, tail];
    // Walk memory for one request sequence, as registerFailover holds per turn.
    const seqKeys = new Set<string>();
    const isDown = (lvl: { provider: string; model: string }) =>
      isCachedDown(lvl) || isSequenceFailed(seqKeys, lvl);

    // The regressed case: these transport/bodyless failures classify as
    // nothing, so the old markDown early-return cached nothing.
    expect(normalizeErrorClass(undefined, "500 status code (no body)")).toBe(undefined);
    expect(normalizeErrorClass(undefined, "fetch failed")).toBe(undefined);

    const visited: string[] = [];
    // Every step resets the cursor to 0 (profiles.ts per-step reset); the
    // walk moves forward only via the down-cache plus sequence memory.
    const selectFromZero = () => advanceChain(levels, 0, isDown);

    // Step 1 lands on the head; it fails unclassifiably.
    let now = 0;
    vi.setSystemTime(now);
    let r = selectFromZero();
    expect(r.exhausted).toBe(false);
    expect(levels[r.cursor]).toEqual(head);
    visited.push(sequenceKeyOf(levels[r.cursor]));
    markDown(levels[r.cursor], undefined, "500 status code (no body)");
    recordSequenceFailure(seqKeys, levels[r.cursor]);

    // Step 2 resets to 0 and must skip the head without revisiting it.
    now += 2_000;
    vi.setSystemTime(now);
    r = selectFromZero();
    expect(r.exhausted).toBe(false);
    expect(levels[r.cursor]).toEqual(deadMiddle);
    expect(visited).not.toContain(sequenceKeyOf(levels[r.cursor]));
    visited.push(sequenceKeyOf(levels[r.cursor]));
    // The middle rung ALWAYS fails, again unclassifiably.
    markDown(levels[r.cursor], undefined, "fetch failed");
    recordSequenceFailure(seqKeys, levels[r.cursor]);

    // Step 3 resets to 0 and must skip both failed rungs, landing on tail.
    now += 2_000;
    vi.setSystemTime(now);
    r = selectFromZero();
    expect(r.exhausted).toBe(false);
    expect(levels[r.cursor]).toEqual(tail);
    expect(visited).not.toContain(sequenceKeyOf(levels[r.cursor]));
    visited.push(sequenceKeyOf(levels[r.cursor]));

    // One log line per rung: each rung selected exactly once, monotonically.
    expect(visited).toEqual([
      sequenceKeyOf(head),
      sequenceKeyOf(deadMiddle),
      sequenceKeyOf(tail),
    ]);
  });

  it("sequence memory skips a failed rung after its transient entry lapses", () => {
    const head = makeLevel("cmd-code", "rung-1");
    const next = makeLevel("opencode-go", "rung-2");
    const levels = [head, next];
    const seqKeys = new Set<string>();

    vi.setSystemTime(0);
    markDown(head, undefined, "fetch failed");
    recordSequenceFailure(seqKeys, head);

    // Past the 30s transient window the cache lapses ...
    vi.setSystemTime(30_001);
    expect(isCachedDown(head)).toBe(false);

    // ... but the walk still must not re-pick the rung this sequence.
    const r = advanceChain(
      levels,
      0,
      (lvl) => isCachedDown(lvl) || isSequenceFailed(seqKeys, lvl),
    );
    expect(r.exhausted).toBe(false);
    expect(levels[r.cursor]).toEqual(next);
  });
});

describe("failover-status", () => {
  function mockCtx(profile: unknown) {
    const noop = () => {};
    return {
      logger: { debug: noop, info: noop, warn: noop, error: noop },
      get(name: string) {
        if (name === "settings") {
          return {
            get: () => profile,
          };
        }
        return undefined;
      },
    };
  }

  function mockReq(method: string, url = "/") {
    return { method, url };
  }

  function mockRes() {
    let statusCode = 0;
    let jsonBody: unknown = null;
    return {
      setHeader(_key: string, _value: string) {
        // no-op for test
      },
      end(data: string) {
        jsonBody = JSON.parse(data);
      },
      getStatus: () => statusCode,
      getBody: () => jsonBody,
      set statusCode(val: number) {
        statusCode = val;
      },
      get statusCode() {
        return statusCode;
      },
    };
  }

  beforeEach(() => {
    clearFailoverEvents();
  });

  it("GET with no events returns ok true and the three-level active chain with head level equal to chain head and last event null", async () => {
    const profile = {
      active: "work",
      work: {
        orchestrator: {
          routes: [
            { provider: "p1", model: "m1" },
            { provider: "p2", model: "m2" },
            { provider: "p3", model: "m3" },
          ],
        },
        subagent: { routes: [] },
      },
      personal: { orchestrator: { routes: [] }, subagent: { routes: [] } },
    };
    const ctx = mockCtx(profile) as any;
    const req = mockReq("GET") as any;
    const res = mockRes() as any;

    const handler = makeFailoverStatusHandler(ctx);
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.getBody();
    expect(body).toEqual({
      ok: true,
      activeChain: [
        { provider: "p1", model: "m1" },
        { provider: "p2", model: "m2" },
        { provider: "p3", model: "m3" },
      ],
      headLevel: { provider: "p1", model: "m1" },
      lastEvent: null,
    });
  });

  it("non-GET returns the exact method-not-allowed status from the handler with ok false", async () => {
    const profile = {
      active: "work",
      work: { orchestrator: { routes: [] }, subagent: { routes: [] } },
      personal: { orchestrator: { routes: [] }, subagent: { routes: [] } },
    };
    const ctx = mockCtx(profile) as any;
    const req = mockReq("POST") as any;
    const res = mockRes() as any;

    const handler = makeFailoverStatusHandler(ctx);
    await handler(req, res);

    expect(res.statusCode).toBe(405);
    const body = res.getBody();
    expect(body.ok).toBe(false);
    expect(body.error).toContain("not allowed");
  });

  it("two sessions' events stay isolated: the session param selects its own event, and a bare request gets null even with events present", async () => {
    const profile = {
      active: "work",
      work: {
        orchestrator: {
          routes: [
            { provider: "p1", model: "m1" },
            { provider: "p2", model: "m2" },
          ],
        },
        subagent: { routes: [] },
      },
      personal: { orchestrator: { routes: [] }, subagent: { routes: [] } },
    };
    const ctx = mockCtx(profile) as any;

    recordFailoverEvent(
      "session-1",
      { provider: "p1", model: "m1" },
      { provider: "p2", model: "m2" },
      "RATE_LIMIT",
      1,
      2,
    );
    recordFailoverEvent(
      "session-2",
      { provider: "p1", model: "m1" },
      { provider: "p2", model: "m2" },
      "AUTH",
      2,
      2,
    );

    const handler = makeFailoverStatusHandler(ctx);

    // The param selects that session's event even though session-2 wrote later.
    const res1 = mockRes() as any;
    await handler(mockReq("GET", "/?session=session-1") as any, res1);
    expect(res1.statusCode).toBe(200);
    expect((res1.getBody() as any).lastEvent).toEqual({
      from: { provider: "p1", model: "m1" },
      to: { provider: "p2", model: "m2" },
      code: "RATE_LIMIT",
      time: expect.any(Number),
      rung: 1,
      total: 2,
      tried: [],
    });

    const res2 = mockRes() as any;
    await handler(mockReq("GET", "/?session=session-2") as any, res2);
    expect(res2.statusCode).toBe(200);
    expect((res2.getBody() as any).lastEvent).toEqual({
      from: { provider: "p1", model: "m1" },
      to: { provider: "p2", model: "m2" },
      code: "AUTH",
      time: expect.any(Number),
      rung: 2,
      total: 2,
      tried: [],
    });

    // A bare request returns null even with events present: the previous
    // cross-session "newest event" scan painted every badge with whichever
    // session failed over most recently.
    const resBare = mockRes() as any;
    await handler(mockReq("GET") as any, resBare);
    expect(resBare.statusCode).toBe(200);
    expect((resBare.getBody() as any).lastEvent).toBe(null);
  });

  it("rung and total pass through untouched from record to response", async () => {
    const profile = {
      active: "work",
      work: {
        orchestrator: {
          routes: [
            { provider: "p1", model: "m1" },
            { provider: "p2", model: "m2" },
            { provider: "p3", model: "m3" },
          ],
        },
        subagent: { routes: [] },
      },
      personal: { orchestrator: { routes: [] }, subagent: { routes: [] } },
    };
    const ctx = mockCtx(profile) as any;
    const req = mockReq("GET", "/?session=session-test") as any;
    const res = mockRes() as any;

    recordFailoverEvent(
      "session-test",
      { provider: "p1", model: "m1" },
      { provider: "p2", model: "m2" },
      "SERVER",
      3,
      5,
    );

    const handler = makeFailoverStatusHandler(ctx);
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.getBody();
    expect(body.lastEvent.rung).toBe(3);
    expect(body.lastEvent.total).toBe(5);
  });

  it("empty chain in profile returns head level null with ok true", async () => {
    const profile = {
      active: "work",
      work: { orchestrator: { routes: [] }, subagent: { routes: [] } },
      personal: { orchestrator: { routes: [] }, subagent: { routes: [] } },
    };
    const ctx = mockCtx(profile) as any;
    const req = mockReq("GET") as any;
    const res = mockRes() as any;

    const handler = makeFailoverStatusHandler(ctx);
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.getBody();
    expect(body.ok).toBe(true);
    expect(body.headLevel).toBe(null);
    expect(body.activeChain).toEqual([]);
  });

  it("tried entries pass through from record to response untouched", async () => {
    const profile = {
      active: "work",
      work: {
        orchestrator: {
          routes: [
            { provider: "p1", model: "m1" },
            { provider: "p2", model: "m2" },
          ],
        },
        subagent: { routes: [] },
      },
      personal: { orchestrator: { routes: [] }, subagent: { routes: [] } },
    };
    const ctx = mockCtx(profile) as any;
    const req = mockReq("GET", "/?session=session-tried") as any;
    const res = mockRes() as any;

    const tried = [
      { provider: "p1", model: "m1", code: "RATE_LIMIT" },
      { provider: "p2", model: "m2", code: "AUTH" },
    ];
    recordFailoverEvent(
      "session-tried",
      { provider: "p1", model: "m1" },
      { provider: "p2", model: "m2" },
      "SERVER",
      2,
      2,
      tried,
    );

    const handler = makeFailoverStatusHandler(ctx);
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.getBody();
    expect(body.ok).toBe(true);
    expect(body.lastEvent.tried).toEqual(tried);
  });

  it("omitted seventh arg responds with empty tried list", async () => {
    const profile = {
      active: "work",
      work: {
        orchestrator: {
          routes: [{ provider: "p1", model: "m1" }],
        },
        subagent: { routes: [] },
      },
      personal: { orchestrator: { routes: [] }, subagent: { routes: [] } },
    };
    const ctx = mockCtx(profile) as any;
    const req = mockReq("GET", "/?session=session-no-tried") as any;
    const res = mockRes() as any;

    recordFailoverEvent(
      "session-no-tried",
      { provider: "p1", model: "m1" },
      { provider: "p2", model: "m2" },
      "UNKNOWN",
      1,
      1,
    );

    const handler = makeFailoverStatusHandler(ctx);
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    const body = res.getBody();
    expect(body.ok).toBe(true);
    expect(body.lastEvent.tried).toEqual([]);
  });
});
