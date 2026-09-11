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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  attentionRowsOf,
  bodyFallbackFor,
  createAttentionStore,
  evaluateItemExpiry,
  getAttentionStore,
  hasRemoteAttention,
  isJumpable,
  remoteAttentionCount,
  visibleTabsOf,
  workspaceLabelOf,
} from "./attention";
import {
  closeModal,
  createModalRegistry,
  MODAL_API_VERSION,
  modalAvailable,
  openModal,
  resolveModalApi,
  type ModalOpenRequest,
} from "../../modal/src/registry";

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

/**
 * Tests for the contribution surface (Part 2 of ./attention).
 *
 * These pin the API the ticket names exactly —
 * createUserAttentionRequestSurface(id, displayName) returning a surface with
 * agentAskUser(component, props, checkExpiry) — plus the contracts the owner
 * settled: the handle carries resolve/cancel PLUS a promise, a checkExpiry
 * that throws or cannot decide keeps the item visible, and disposing a
 * surface removes its tab and its outstanding items.
 */

// A deliberately throwing body: the isolation contract says rendering this
// inside the shell degrades to a placeholder naming its surface and never
// blanks the tab, the modal, or the approvals list. The shell's error
// boundary (SafeItemBody in client.tsx) implements the catch — React only,
// so it cannot run under vitest here — and `bodyFallbackFor` below is the
// exact descriptor it renders, pinned here through the same throwing
// component the boundary would receive.
function ThrowingBody() {
  throw new Error("contributor boom");
}

function nextTick(): Promise<void> {
  return new Promise((fulfil) => {
    setTimeout(fulfil, 0);
  });
}

describe("createUserAttentionRequestSurface", () => {
  it("exposes the ticket's exact API shape", () => {
    const store = createAttentionStore();
    const surface = store.createUserAttentionRequestSurface("approvals", "Approvals");
    expect(surface.id).toBe("approvals");
    expect(surface.displayName).toBe("Approvals");
    expect(typeof surface.agentAskUser).toBe("function");
    expect(typeof surface.dispose).toBe("function");
  });

  it("autogenerates an id when none is given, and rejects a duplicate", () => {
    const store = createAttentionStore();
    const first = store.createUserAttentionRequestSurface("", "First");
    const second = store.createUserAttentionRequestSurface("", "Second");
    expect(first.id).not.toBe(second.id);
    expect(() => store.createUserAttentionRequestSurface("approvals", "A")).not.toThrow();
    expect(() => store.createUserAttentionRequestSurface("approvals", "B")).toThrow();
  });

  it("carries workspace/session attribution for Phase 2", () => {
    const store = createAttentionStore();
    const surface = store.createUserAttentionRequestSurface("q", "Questions", {
      workspace: "dotfiles-ai",
      sessionId: "sess-1",
    });
    expect(surface.workspace).toBe("dotfiles-ai");
    expect(surface.sessionId).toBe("sess-1");
    const unattributed = store.createUserAttentionRequestSurface("u", "U");
    expect(unattributed.workspace).toBeNull();
    expect(unattributed.sessionId).toBeNull();
  });

  it("asks on a disposed surface throw loudly instead of orphaning an item", () => {
    const store = createAttentionStore();
    const surface = store.createUserAttentionRequestSurface("gone", "Gone");
    surface.dispose();
    expect(() => surface.agentAskUser(ThrowingBody, {})).toThrow();
  });
});

describe("agentAskUser's handle", () => {
  it("returns a handle with resolve/cancel PLUS a promise", () => {
    const store = createAttentionStore();
    const surface = store.createUserAttentionRequestSurface("a", "A");
    const handle = surface.agentAskUser(ThrowingBody, { title: "t" });
    expect(handle.surfaceId).toBe("a");
    expect(typeof handle.key).toBe("string");
    expect(typeof handle.promise.then).toBe("function");
    expect(typeof handle.resolve).toBe("function");
    expect(typeof handle.cancel).toBe("function");
  });

  it("resolve fulfils the promise and drops the item", async () => {
    const store = createAttentionStore();
    const surface = store.createUserAttentionRequestSurface("a", "A");
    const handle = surface.agentAskUser(ThrowingBody, {});
    expect(store.getSnapshot().surfaces[0].items).toHaveLength(1);
    handle.resolve("allowed-once");
    await expect(handle.promise).resolves.toEqual({ via: "resolved", outcome: "allowed-once" });
    expect(store.getSnapshot().surfaces[0].items).toHaveLength(0);
  });

  it("cancel fulfils (never rejects) and drops the item", async () => {
    const store = createAttentionStore();
    const surface = store.createUserAttentionRequestSurface("a", "A");
    const handle = surface.agentAskUser(ThrowingBody, {});
    handle.cancel("dismissed");
    await expect(handle.promise).resolves.toEqual({ via: "cancelled", reason: "dismissed" });
    expect(store.getSnapshot().surfaces[0].items).toHaveLength(0);
  });

  it("is idempotent: the first settle wins, later calls are ignored", async () => {
    const store = createAttentionStore();
    const surface = store.createUserAttentionRequestSurface("a", "A");
    const handle = surface.agentAskUser(ThrowingBody, {});
    handle.resolve("first");
    handle.cancel("second");
    handle.resolve("third");
    await expect(handle.promise).resolves.toEqual({ via: "resolved", outcome: "first" });
    await nextTick();
    expect(store.getSnapshot().surfaces[0].items).toHaveLength(0);
  });

  it("settling an unknown key is a no-op, never a throw", () => {
    const store = createAttentionStore();
    expect(() => store.resolveItem("nope", 1)).not.toThrow();
    expect(() => store.cancelItem("nope")).not.toThrow();
    expect(() => store.removeItem("nope")).not.toThrow();
  });
});

describe("surface disposal", () => {
  it("removes the tab AND its outstanding items, settling handles cancelled", async () => {
    const store = createAttentionStore();
    const surface = store.createUserAttentionRequestSurface("a", "A");
    const first = surface.agentAskUser(ThrowingBody, {});
    const second = surface.agentAskUser(ThrowingBody, {});
    surface.dispose();
    // No orphan tab: the surface is gone from the snapshot entirely.
    expect(store.getSnapshot().surfaces).toEqual([]);
    await expect(first.promise).resolves.toEqual({
      via: "cancelled",
      reason: "surface-disposed",
    });
    await expect(second.promise).resolves.toEqual({
      via: "cancelled",
      reason: "surface-disposed",
    });
  });

  it("disposing twice is safe, and other surfaces survive", () => {
    const store = createAttentionStore();
    const doomed = store.createUserAttentionRequestSurface("doomed", "Doomed");
    const spared = store.createUserAttentionRequestSurface("spared", "Spared");
    spared.agentAskUser(ThrowingBody, {});
    doomed.dispose();
    doomed.dispose();
    expect(store.getSnapshot().surfaces.map((tab) => tab.surface.id)).toEqual(["spared"]);
  });

  it("sweeps sessions that died, but never an unattributed local surface", () => {
    const store = createAttentionStore();
    const remote = store.createUserAttentionRequestSurface("r", "R", { sessionId: "dead" });
    remote.agentAskUser(ThrowingBody, {});
    const local = store.createUserAttentionRequestSurface("l", "L");
    local.agentAskUser(ThrowingBody, {});
    // A dead session leaves no permanent ghost in another session's tab.
    store.sweepDeadSessions(["alive"]);
    const ids = store.getSnapshot().surfaces.map((tab) => tab.surface.id);
    expect(ids).toEqual(["l"]);
  });
});

describe("checkExpiry's contract", () => {
  it("false expires the item; true keeps it", () => {
    expect(evaluateItemExpiry({ checkExpiry: () => false })).toBe("expired");
    expect(evaluateItemExpiry({ checkExpiry: () => true })).toBe("live");
  });

  it("a throw keeps the item visible, marked unverifiable — never removes it", () => {
    // A hidden live ask strands an agent; a shown stale ask costs a click.
    expect(
      evaluateItemExpiry({
        checkExpiry: () => {
          throw new Error("store exploded");
        },
      }),
    ).toBe("unverifiable");
  });

  it("cannot-decide keeps the item visible, marked unverifiable", () => {
    expect(evaluateItemExpiry({ checkExpiry: () => null })).toBe("unverifiable");
    expect(evaluateItemExpiry({ checkExpiry: () => undefined })).toBe("unverifiable");
    expect(evaluateItemExpiry({ checkExpiry: () => "maybe" as unknown as boolean })).toBe(
      "unverifiable",
    );
  });

  it("no check, or a non-function check, never throws the evaluator", () => {
    expect(evaluateItemExpiry({})).toBe("live");
    expect(evaluateItemExpiry({ checkExpiry: null })).toBe("live");
    expect(evaluateItemExpiry({ checkExpiry: "nonsense" as unknown as () => boolean })).toBe(
      "unverifiable",
    );
  });

  it("evaluating never mutates the store: removal is the UI's explicit call", () => {
    const store = createAttentionStore();
    const surface = store.createUserAttentionRequestSurface("a", "A");
    surface.agentAskUser(ThrowingBody, {}, () => false);
    const item = store.getSnapshot().surfaces[0].items[0];
    expect(evaluateItemExpiry(item)).toBe("expired");
    // Still there: the check is side-effect free by construction.
    expect(store.getSnapshot().surfaces[0].items).toHaveLength(1);
    store.removeItem(item.key);
    expect(store.getSnapshot().surfaces[0].items).toHaveLength(0);
  });
});

describe("visible tabs", () => {
  it("hides empty surfaces instead of showing them empty", () => {
    const store = createAttentionStore();
    store.createUserAttentionRequestSurface("empty", "Empty", { sessionId: "s" });
    const full = store.createUserAttentionRequestSurface("full", "Full", { sessionId: "s" });
    full.agentAskUser(ThrowingBody, {});
    const tabs = visibleTabsOf(store.getSnapshot(), "s");
    expect(tabs.map((tab) => tab.surface.id)).toEqual(["full"]);
  });

  it("Phase 1 lists only this session's surfaces", () => {
    const store = createAttentionStore();
    const mine = store.createUserAttentionRequestSurface("mine", "Mine", { sessionId: "s1" });
    mine.agentAskUser(ThrowingBody, {});
    const theirs = store.createUserAttentionRequestSurface("theirs", "Theirs", {
      sessionId: "s2",
    });
    theirs.agentAskUser(ThrowingBody, {});
    // Cross-session aggregation is Phase 2; the record already carries the
    // fields, so widening this filter is the whole Phase 2 listing change.
    expect(visibleTabsOf(store.getSnapshot(), "s1").map((tab) => tab.surface.id)).toEqual([
      "mine",
    ]);
  });

  it("degrades to no tabs on a malformed snapshot rather than throwing", () => {
    expect(visibleTabsOf(undefined as unknown as never, "s")).toEqual([]);
    expect(visibleTabsOf({ surfaces: null } as unknown as never, "s")).toEqual([]);
  });
});

describe("the throwing-body fallback names its surface", () => {
  it("a throwing body degrades to a placeholder, never a blank surface", () => {
    // Sanity: the fixture really throws, like a broken contributor would.
    expect(() => ThrowingBody()).toThrow("contributor boom");
    const fallback = bodyFallbackFor("Approvals");
    expect(fallback.surface).toBe("Approvals");
    expect(fallback.message).toContain("Approvals");
    // ...while the tab, the modal and the approvals list around it are
    // untouched: the descriptor carries no instruction to remove anything.
    expect(Object.keys(fallback).sort()).toEqual(["message", "surface"]);
  });

  it("falls back to a generic name rather than rendering 'undefined'", () => {
    expect(bodyFallbackFor("").surface).toBe("an attention surface");
  });
});

describe("subscribers", () => {
  it("notifies on ask, settle and dispose, with a stable snapshot between", () => {
    const store = createAttentionStore();
    let calls = 0;
    const unsub = store.subscribe(() => {
      calls += 1;
    });
    const before = store.getSnapshot();
    const surface = store.createUserAttentionRequestSurface("a", "A");
    expect(calls).toBe(1);
    expect(store.getSnapshot()).not.toBe(before);
    const handle = surface.agentAskUser(ThrowingBody, {});
    expect(calls).toBe(2);
    handle.cancel();
    expect(calls).toBe(3);
    surface.dispose();
    expect(calls).toBe(4);
    unsub();
    store.createUserAttentionRequestSurface("b", "B");
    expect(calls).toBe(4);
    // A no-op settle emits nothing, so the snapshot reference stays stable.
    const after = store.getSnapshot();
    store.resolveItem("unknown-key", 1);
    expect(store.getSnapshot()).toBe(after);
  });

  it("one throwing subscriber cannot starve the others", () => {
    const store = createAttentionStore();
    let healthy = 0;
    store.subscribe(() => {
      throw new Error("bad subscriber");
    });
    store.subscribe(() => {
      healthy += 1;
    });
    expect(() => store.createUserAttentionRequestSurface("a", "A")).not.toThrow();
    expect(healthy).toBe(1);
  });
});

describe("the live store is a shared singleton for Phase 2's service", () => {
  it("getAttentionStore returns one instance", () => {
    expect(getAttentionStore()).toBe(getAttentionStore());
  });
});

/**
 * #93 seam integration, exercised from its FIRST real caller.
 *
 * The review's demand: round-trip open/close through the LIVE global
 * (`resolveModalApi` against a published `window.__dshModal__`), not just the
 * registry functions — otherwise shape friction (the API check requires all
 * three of open/close/subscribe) surfaces in production instead of the test
 * run. Mounting the host's React container needs a DOM, which vitest does
 * not have here; this publishes a live registry through the EXACT shape the
 * modal plugin's apply() publishes (version/open/close/subscribe delegates)
 * and drives the guarded entry points against it.
 */
describe("#93 modal seam: live-global round-trip", () => {
  const key = "__dshModal__";
  const holder = globalThis as Record<string, unknown>;
  const previous = holder[key];

  function publishLive(): void {
    const live = createModalRegistry();
    holder[key] = {
      version: MODAL_API_VERSION,
      open: (request: ModalOpenRequest) => live.open(request),
      close: (id: string) => live.close(id),
      subscribe: live.subscribe.bind(live),
    };
  }

  function restore(): void {
    if (previous === undefined) delete holder[key];
    else holder[key] = previous;
  }

  it("open and close round-trip through the live global", () => {
    publishLive();
    try {
      expect(modalAvailable()).toBe(true);
      const opened = openModal({ title: "Pending approvals", body: "x" });
      expect(opened.opened).toBe(true);
      if (!opened.opened) return;
      expect(typeof opened.id).toBe("string");
      expect(closeModal(opened.id)).toBe(true);
      // Closing twice reports, not pretends.
      expect(closeModal(opened.id)).toBe(false);
    } finally {
      restore();
    }
  });

  it("the version check rejects a shape without all three functions", () => {
    publishLive();
    try {
      // Shape friction pinned: drop `subscribe` and the whole API reads as
      // absent rather than calling a method that is not there.
      const broken = { ...(holder[key] as object), subscribe: undefined };
      expect(resolveModalApi(broken)).toBeNull();
      holder[key] = broken;
      expect(modalAvailable()).toBe(false);
      const refused = openModal({ title: "t", body: "b" });
      expect(refused.opened).toBe(false);
    } finally {
      restore();
    }
  });
});

/**
 * Shell-ownership drift pins on client.tsx / client.module.css.
 *
 * The isolation and shell-vs-body contracts live in code vitest cannot
 * execute (React, no DOM here), so — following the plugin-modal.test.ts
 * precedent — these read the sources and pin the structure: every body
 * inside a per-item error boundary, the tab bar and actions row owned by
 * the shell, bodies context-free, and the built-ins going through the same
 * agentAskUser door as any future contributor.
 */
describe("attention shell: source structure", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (name: string) => readFileSync(join(here, name), "utf8");
  const code = (source: string) =>
    source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  const tsx = code(read("client.tsx"));
  const css = code(read("client.module.css"));

  it("every contributed body renders inside a per-item error boundary", () => {
    expect(tsx).toContain("getDerivedStateFromError");
    expect(tsx).toContain("<SafeItemBody");
    // Keyed per item, so one failed body cannot blank a healthy sibling.
    expect(tsx).toContain("key={item.key}");
    // The placeholder names the offending surface.
    expect(tsx).toContain("bodyFallbackFor");
  });

  it("the shell owns tabs, card chrome and the actions row", () => {
    expect(tsx).toContain("visibleTabsOf");
    expect(tsx).toContain("composer-approvals-tabs");
    expect(tsx).toContain("composer-approvals-card");
    expect(tsx).toContain("composer-approvals-actions");
    // Empty tabs hidden, not shown empty.
    expect(tsx).toContain("tabs.length < 2");
  });

  it("bodies are context-free: everything arrives through props", () => {
    // React context does not cross the modal seam (#93 review), so a body
    // relying on a caller-provided context would silently lose it.
    expect(tsx).not.toContain("useContext");
    expect(tsx).not.toContain("createContext");
    // The settle handle is surface-provided as the `ask` prop.
    expect(tsx).toContain("merged.ask");
  });

  it("the built-ins go through the same agentAskUser door", () => {
    expect(tsx).toContain("agentAskUser(ApprovalBody");
    expect(tsx).toContain("agentAskUser(");
    // The built-in approvals path proves the handle: resolve carries the
    // outcome to respondToApproval, cancel means "do not respond".
    expect(tsx).toContain("respondToApproval");
    expect(tsx).toContain("settled-elsewhere");
    // Disposal removes tab and items together.
    expect(tsx).toContain("approvals.dispose()");
    expect(tsx).toContain("questions.dispose()");
  });

  it("cards are visually designed, not bare lines", () => {
    for (const rule of [
      ".composer-approvals-card {",
      ".composer-approvals-card-head {",
      ".composer-approvals-kind {",
      ".composer-approvals-title {",
      ".composer-approvals-attr {",
      ".composer-approvals-actions {",
      ".composer-approvals-tabs {",
      ".composer-approvals-tab {",
    ]) {
      expect(css, rule).toContain(rule);
    }
  });
});
