/**
 * Tests for the resume_search and resume_read tools (Effort 9 T2).
 *
 * The tests boot the real plugin with a fake ctx in the repo's convention:
 * a plain object that only satisfies the methods apply() calls, cast as
 * never at the boundary. The fake ctx captures the registered tool
 * definitions, and the tests drive their execute() with a fake exec whose
 * agent carries a fake session.
 */
import { describe, expect, it } from "vitest";
import { apply } from "./resume";

function msg(seq: number, text: string) {
  return {
    seq,
    type: "user/message",
    data: { message: { content: [{ type: "text", text }] } },
  };
}

interface SpFixture {
  headers: any[];
  sessions: Record<string, { events: any[] }>;
}

function fakeSp(fixture: SpFixture) {
  return {
    list: async () => fixture.headers,
    load: async (id: string) => fixture.sessions[id],
  };
}

function boot(opts: { current?: any; sp?: any }) {
  const registered: any[] = [];
  const tools = { register(t: any) { registered.push(t); return () => {}; } };
  const noop = () => {};
  const ctx = {
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    get(name: string) {
      if (name === "tools") return tools;
      return name === "sessionPersistence" ? opts.sp : undefined;
    },
    tools,
    effect(fn: any, _label?: string) {
      // Run the effect body so the register calls happen now. Cordis passes
      // a generator function; call it, then drain it. The disposers are
      // collected but never fired in tests.
      const gen = typeof fn === "function" ? fn() : fn;
      const it = typeof gen?.[Symbol.iterator] === "function" ? gen[Symbol.iterator]() : null;
      if (!it) return () => {};
      let r = it.next();
      while (!r.done) r = it.next(undefined as never);
      return () => {};
    },
  };
  apply(ctx as never);
  const searchTool = registered.find((t) => t.name === "resume_search");
  const readTool = registered.find((t) => t.name === "resume_read");
  if (!searchTool || !readTool) throw new Error("resume tools were not both registered");
  const exec = { agent: { session: opts.current } };
  return {
    search: (args: any) => searchTool.execute(args, exec),
    read: (args: any) => readTool.execute(args, exec),
  };
}

const CURRENT = fakeSessionHelper("current111", "/ws");
function fakeSessionHelper(id: string, cwd: string) {
  return { requestHeader: () => ({ id, cwd }) };
}

describe("resume_search", () => {
  it("with no workspaces returns only current-session hits", async () => {
    const sp = fakeSp({
      headers: [{ id: "other001-aaaa", cwd: "/ws", createdAt: "2024-01-02T00:00:00Z" }],
      sessions: { "other001-aaaa": { events: [msg(1, "needle in the other session")] } },
    });
    const current = fakeSessionHelper("current111", "/ws");
    (current as any).events = [msg(1, "needle in the current session")];
    const h = boot({ current, sp });

    const out = (await h.search({ query: "needle" })) as any;
    expect(out.total).toBe(1);
    expect(out.hits).toHaveLength(1);
    expect(out.hits[0].source).toBe("current");
    expect(out.hits[0].text).toContain("current session");
  });

  it("with workspaces set reaches the other session too", async () => {
    const sp = fakeSp({
      headers: [
        { id: "other001-bbbb", cwd: "/ws", createdAt: "2024-01-02T00:00:00Z" },
        { id: "elsewher-eccc", cwd: "/elsewhere", createdAt: "2024-01-03T00:00:00Z" },
      ],
      sessions: {
        "other001-bbbb": { events: [msg(7, "needle from the other session")] },
        "elsewher-eccc": { events: [msg(1, "needle from elsewhere")] },
      },
    });
    const current = fakeSessionHelper("current111", "/ws");
    (current as any).events = [msg(2, "needle in the current session")];
    const h = boot({ current, sp });

    const out = (await h.search({ query: "needle", workspaces: ["/ws"] })) as any;
    const sources = out.hits.map((x: any) => x.source);
    expect(sources).toContain("current");
    expect(sources).toContain("session:other001");
    expect(sources).not.toContain("session:elsewher");
    // current-session hits sort first
    expect(out.hits[0].source).toBe("current");
  });

  it("paginates: disjoint pages, hasMore true then false", async () => {
    const events = Array.from({ length: 20 }, (_, i) => msg(i + 1, "haystack item " + (i + 1)));
    const current = fakeSessionHelper("current111", "/ws");
    (current as any).events = events;
    const h = boot({ current, sp: fakeSp({ headers: [], sessions: {} }) });

    const page1 = (await h.search({ query: "haystack" })) as any;
    expect(page1.total).toBe(20);
    expect(page1.page).toBe(1);
    expect(page1.hits).toHaveLength(15);
    expect(page1.hasMore).toBe(true);
    const p1Seqs = page1.hits.map((x: any) => x.seq);

    const page2 = (await h.search({ query: "haystack", page: 2 })) as any;
    expect(page2.total).toBe(20);
    expect(page2.page).toBe(2);
    expect(page2.hits).toHaveLength(5);
    expect(page2.hasMore).toBe(false);
    const p2Seqs = page2.hits.map((x: any) => x.seq);
    for (const s of p2Seqs) expect(p1Seqs).not.toContain(s);
    expect([...p1Seqs, ...p2Seqs].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });
});

describe("resume_read", () => {
  it("reads the current session's own seq in full, untruncated", async () => {
    const long =
      "alpha " +
      "This sentence exists to push the text well past the 160 character summary cut used by search hits. ".repeat(
        3,
      ) +
      "OMEGA-MARKER";
    const current = fakeSessionHelper("current111", "/ws");
    (current as any).events = [msg(3, long)];
    const h = boot({ current, sp: fakeSp({ headers: [], sessions: {} }) });

    const out = (await h.read({ sessionId: "current111", seq: 3 })) as any;
    expect(out.found).toBe(true);
    expect(out.role).toBe("user");
    expect(out.text.length).toBeGreaterThan(160);
    expect(out.text).toContain("OMEGA-MARKER");
  });

  it("reads another session's seq via sessionPersistence", async () => {
    const sp = fakeSp({
      headers: [{ id: "other001-dddd", cwd: "/ws", createdAt: "2024-01-02T00:00:00Z" }],
      sessions: { "other001-dddd": { events: [msg(9, "content from the other session")] } },
    });
    const current = fakeSessionHelper("current111", "/ws");
    (current as any).events = [];
    const h = boot({ current, sp });

    const out = (await h.read({ sessionId: "other001-dddd", seq: 9 })) as any;
    expect(out.found).toBe(true);
    expect(out.role).toBe("user");
    expect(out.text).toBe("content from the other session");
  });

  it("returns found:false, without throwing, for a missing session or seq", async () => {
    const sp = fakeSp({
      headers: [],
      sessions: { "known01-eeee": { events: [msg(1, "only one event")] } },
    });
    const current = fakeSessionHelper("current111", "/ws");
    (current as any).events = [msg(1, "current event")];
    const h = boot({ current, sp });

    const missingSession = (await h.read({ sessionId: "no-such-session", seq: 1 })) as any;
    expect(missingSession).toEqual({ found: false, sessionId: "no-such-session", seq: 1 });

    const missingSeq = (await h.read({ sessionId: "known01-eeee", seq: 42 })) as any;
    expect(missingSeq).toEqual({ found: false, sessionId: "known01-eeee", seq: 42 });
  });
});
