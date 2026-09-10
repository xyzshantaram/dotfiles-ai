/**
 * Tests for the cross-workspace attention model (#103 phase 1).
 *
 * These pin the DECISIONS, not the implementation: local-first ordering, the
 * third `plan-review` kind surviving, workspace attribution from cwd, the
 * remote signal staying separate from the local question count, and a
 * degraded snapshot rendering nothing rather than throwing. Each is a
 * property some future refactor could silently drop.
 */
import { describe, expect, it } from "vitest";
import {
  attentionRowsOf,
  hasRemoteAttention,
  isJumpable,
  remoteAttentionCount,
  workspaceLabelOf,
} from "./attention";

/** One SessionSummary-shaped row, with only the fields the model reads. */
function summary(over: Record<string, unknown>) {
  return {
    displayTitle: "a session",
    cwd: "/home/sid/repos/dotfiles-ai",
    updatedAt: 0,
    ...over,
  };
}

function listOf(byId: Record<string, unknown>) {
  return { byId };
}

describe("workspaceLabelOf", () => {
  it("uses the last path segment, which is what distinguishes workspaces", () => {
    expect(workspaceLabelOf("/home/sid/repos/dotfiles-ai")).toBe("dotfiles-ai");
    expect(workspaceLabelOf("/home/sid/repos/aidos")).toBe("aidos");
  });

  it("tolerates a trailing slash, since cwd is not guaranteed normalised", () => {
    expect(workspaceLabelOf("/home/sid/repos/thursday/")).toBe("thursday");
    expect(workspaceLabelOf("/home/sid/repos/thursday///")).toBe("thursday");
  });

  it("returns null rather than inventing a placeholder", () => {
    // An absent value must stay distinguishable from a real directory that
    // happens to be named "unknown".
    expect(workspaceLabelOf(undefined)).toBeNull();
    expect(workspaceLabelOf(null)).toBeNull();
    expect(workspaceLabelOf("")).toBeNull();
    expect(workspaceLabelOf("///")).toBeNull();
    expect(workspaceLabelOf(42)).toBeNull();
  });

  it("handles a root-level and a relative cwd", () => {
    expect(workspaceLabelOf("/repos")).toBe("repos");
    expect(workspaceLabelOf("dotfiles-ai")).toBe("dotfiles-ai");
  });
});

describe("attentionRowsOf", () => {
  it("keeps only sessions that are actually blocked on a human", () => {
    const rows = attentionRowsOf(
      listOf({
        a: summary({ pendingInteraction: "approval" }),
        b: summary({}), // no pendingInteraction: not blocked
        c: summary({ pendingInteraction: undefined }),
      }),
      "a",
    );
    expect(rows.map((r) => r.sessionId)).toEqual(["a"]);
  });

  it("carries the third plan-review kind instead of dropping it", () => {
    // #103's original text knew only approval and question. An unmodelled
    // kind would silently strand whoever is waiting on it.
    const rows = attentionRowsOf(listOf({ a: summary({ pendingInteraction: "plan-review" }) }), "z");
    expect(rows[0].kind).toBe("plan-review");
  });

  it("ignores a kind the client does not project", () => {
    const rows = attentionRowsOf(listOf({ a: summary({ pendingInteraction: "banana" }) }), "z");
    expect(rows).toEqual([]);
  });

  it("sorts the local session first, then remote by most recent", () => {
    const rows = attentionRowsOf(
      listOf({
        old: summary({ pendingInteraction: "approval", updatedAt: 10 }),
        mine: summary({ pendingInteraction: "question", updatedAt: 1 }),
        fresh: summary({ pendingInteraction: "approval", updatedAt: 99 }),
      }),
      "mine",
    );
    // Local first even though its updatedAt is the OLDEST: a human is
    // almost always answering their own session's ask.
    expect(rows.map((r) => r.sessionId)).toEqual(["mine", "fresh", "old"]);
    expect(rows[0].local).toBe(true);
    expect(rows[1].local).toBe(false);
  });

  it("attributes each row to its workspace, spanning several at once", () => {
    const rows = attentionRowsOf(
      listOf({
        a: summary({ pendingInteraction: "approval", cwd: "/home/sid/repos/aidos", updatedAt: 2 }),
        b: summary({
          pendingInteraction: "question",
          cwd: "/home/sid/repos/thursday",
          updatedAt: 1,
        }),
      }),
      "none",
    );
    expect(rows.map((r) => r.workspace)).toEqual(["aidos", "thursday"]);
  });

  it("falls back through displayTitle, title, then the session id", () => {
    const rows = attentionRowsOf(
      listOf({
        a: summary({ pendingInteraction: "approval", displayTitle: "", title: "fallback" }),
        b: summary({
          pendingInteraction: "approval",
          displayTitle: undefined,
          title: undefined,
        }),
      }),
      "none",
    );
    const byId = Object.fromEntries(rows.map((r) => [r.sessionId, r.title]));
    expect(byId.a).toBe("fallback");
    expect(byId.b).toBe("b");
  });

  it("renders nothing rather than throwing on a degraded snapshot", () => {
    // This surface is LOAD-BEARING: if it throws, a human cannot answer and
    // an agent stays blocked forever. Degrading to empty is the only safe
    // failure.
    expect(attentionRowsOf(undefined, "a")).toEqual([]);
    expect(attentionRowsOf(null, "a")).toEqual([]);
    expect(attentionRowsOf({}, "a")).toEqual([]);
    expect(attentionRowsOf({ byId: null }, "a")).toEqual([]);
    expect(attentionRowsOf({ byId: "nonsense" }, "a")).toEqual([]);
    expect(attentionRowsOf(listOf({ a: null }), "a")).toEqual([]);
  });

  it("treats a missing updatedAt as oldest instead of NaN-sorting", () => {
    const rows = attentionRowsOf(
      listOf({
        none: summary({ pendingInteraction: "approval", updatedAt: undefined }),
        dated: summary({ pendingInteraction: "approval", updatedAt: 5 }),
      }),
      "x",
    );
    expect(rows.map((r) => r.sessionId)).toEqual(["dated", "none"]);
  });
});

describe("the remote signal stays separate from the local question count", () => {
  it("reports remote attention only for other sessions", () => {
    const localOnly = attentionRowsOf(
      listOf({ mine: summary({ pendingInteraction: "question" }) }),
      "mine",
    );
    expect(hasRemoteAttention(localOnly)).toBe(false);
    expect(remoteAttentionCount(localOnly)).toBe(0);

    const withRemote = attentionRowsOf(
      listOf({
        mine: summary({ pendingInteraction: "question" }),
        other: summary({ pendingInteraction: "approval" }),
        third: summary({ pendingInteraction: "plan-review" }),
      }),
      "mine",
    );
    expect(hasRemoteAttention(withRemote)).toBe(true);
    // #38's rings count QUESTIONS on THIS session. The remote count is a
    // separate number precisely so it can never inflate that one.
    expect(remoteAttentionCount(withRemote)).toBe(2);
  });

  it("counts a remote session even when this session has nothing pending", () => {
    const rows = attentionRowsOf(listOf({ other: summary({ pendingInteraction: "approval" }) }), "mine");
    expect(rows[0].local).toBe(false);
    expect(hasRemoteAttention(rows)).toBe(true);
  });
});

describe("isJumpable", () => {
  it("is true only while the session is still in the live list", () => {
    // sessions.open() THROWS for an unknown id, so this is checked at click
    // time: a session can die between render and click.
    const list = listOf({ alive: summary({ pendingInteraction: "approval" }) });
    expect(isJumpable(list, "alive")).toBe(true);
    expect(isJumpable(list, "gone")).toBe(false);
  });

  it("is false for a degraded list instead of throwing", () => {
    expect(isJumpable(undefined, "a")).toBe(false);
    expect(isJumpable({ byId: null }, "a")).toBe(false);
  });

  it("is not fooled by inherited Object properties", () => {
    // A naive `byId[id] !== undefined` would say yes to "toString".
    expect(isJumpable(listOf({}), "toString")).toBe(false);
    expect(isJumpable(listOf({}), "constructor")).toBe(false);
  });
});
