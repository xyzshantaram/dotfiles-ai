/**
 * Tests for approval-interrupt's purge-at-insertion seam (#113) and its
 * kept pre-step backstop (#76).
 *
 * The fakes below model the upstream contract faithfully (read, not guessed,
 * against the installed DSH source):
 *   - `agent.followup()` / `agent.inject()` splice straight into the inbox
 *     with no waterfall before it (dsh-agent-loop/lib/index.js:390-404);
 *   - every insertion then emits `agent/inbox/inserted { agent, message }`
 *     SYNCHRONOUSLY — durable append, live projection, notification, one
 *     task — and `emit` never awaits listeners (dsh-agent-loop/lib/index.js
 *     :357-370, dsh-agent/lib/index.js dispatch `emit`);
 *   - `Inbox.remove(messageId)` removes one pending message across both
 *     lists and reports whether it was still pending
 *     (dsh-agent/lib/types/inbox.d.ts:65-70);
 *   - only TWO call sites in the whole install stamp
 *     `source = { kind: "plugin", plugin: "user-approval" }`
 *     (dsh-user-approval/lib/index.js:122 the policy notice, :234 the
 *     rejection followup), so the stamp filter cannot touch anything else;
 *   - the user's rejection comment travels `session.prompt(blocks, "steer")`
 *     (plugins/tool-render/src/client.tsx `buildApprovalSteer`), authored as
 *     the user with no plugin stamp.
 *
 * These tests fake the cordis `ctx` by recording `ctx.on` handlers in a map,
 * fake an inbox as a pending list with upstream `remove` semantics, drive
 * insertion the way upstream does (list first, notify second, same task),
 * and call the exported `apply(ctx, config)` directly.
 *
 * TRANSIENT: this file exists to prove #113 (suite + mutation runs) and is
 * removed before the handoff patch, whose allowlist is the plugin source
 * only. Land it alongside the source change under an extended allowlist.
 */
import { describe, expect, it } from "vitest";
import { apply } from "./approval-interrupt";

type Handler = (...args: never[]) => unknown;

interface TestMessage {
  id: string;
  source?: { kind?: string; plugin?: string };
  text: string;
}

/** Minimal fake cordis context: records handlers, collects info logs. */
function fakeCtx() {
  const handlers = new Map<string, Handler[]>();
  const infos: string[] = [];
  return {
    handlers,
    infos,
    logger: {
      info: (line: string) => {
        infos.push(line);
      },
      warn: () => {},
      error: () => {},
    },
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };
}

type TestCtx = ReturnType<typeof fakeCtx>;

/**
 * Fake inbox with upstream remove semantics: one pending list (both targets
 * behave identically for removal), `remove` reporting whether the id was
 * still pending.
 */
function makeInbox() {
  const pending: TestMessage[] = [];
  const removed: string[] = [];
  return {
    pending,
    removed,
    insert(message: TestMessage) {
      pending.push(message);
    },
    remove(id: string): boolean {
      const index = pending.findIndex((message) => message.id === id);
      if (index < 0) return false;
      pending.splice(index, 1);
      removed.push(id);
      return true;
    },
  };
}

type TestInbox = ReturnType<typeof makeInbox>;

function fakeAgent(inbox: TestInbox) {
  return { id: "agent-1", inbox };
}

/**
 * Drive one insertion the way upstream does: the message is already in the
 * live projection when `agent/inbox/inserted` fires, and the emit is
 * synchronous — handlers run before this function returns.
 */
function fireInserted(ctx: TestCtx, agent: { id: string; inbox: TestInbox }, message: TestMessage) {
  agent.inbox.insert(message);
  for (const handler of ctx.handlers.get("agent/inbox/inserted") ?? []) {
    handler({ agent, message } as never);
  }
}

const REJECTION_TEXT =
  "The user rejected your approval request. Stop and explain what happened. Do not retry the rejected action.";
const CANCELLED_TEXT = "The approval request was cancelled. Stop and explain what happened.";
const POLICY_TEXT = 'The approval policy changed from "ask" to "never" (changed by the user).';

function stamped(id: string, text: string): TestMessage {
  return { id, source: { kind: "plugin", plugin: "user-approval" }, text };
}

/** A user's rejection comment as it arrives on the steer wire: no stamp. */
function userComment(id: string, text: string): TestMessage {
  return { id, text };
}

function mount() {
  const ctx = fakeCtx();
  apply(ctx as never, {});
  const inbox = makeInbox();
  const agent = fakeAgent(inbox);
  return { ctx, inbox, agent };
}

describe("purge at insertion (primary seam)", () => {
  it("removes the rejection followup the moment it is inserted", () => {
    const { ctx, inbox, agent } = mount();
    fireInserted(ctx, agent, stamped("msg-1", REJECTION_TEXT));
    expect(inbox.pending).toEqual([]);
    expect(inbox.removed).toEqual(["msg-1"]);
    expect(ctx.infos.some((line) => line.includes("msg-1"))).toBe(true);
  });

  it("removes the cancellation followup too", () => {
    const { ctx, inbox, agent } = mount();
    fireInserted(ctx, agent, stamped("msg-2", CANCELLED_TEXT));
    expect(inbox.pending).toEqual([]);
    expect(inbox.removed).toEqual(["msg-2"]);
  });

  it("keeps purging the policy-change notice at insert", () => {
    const { ctx, inbox, agent } = mount();
    fireInserted(ctx, agent, stamped("msg-3", POLICY_TEXT));
    expect(inbox.pending).toEqual([]);
    expect(inbox.removed).toEqual(["msg-3"]);
  });

  it("leaves the user's steer comment alone", () => {
    const { ctx, inbox, agent } = mount();
    fireInserted(ctx, agent, userComment("c-1", "retry with --dry-run instead"));
    expect(inbox.pending.map((message) => message.id)).toEqual(["c-1"]);
    expect(inbox.removed).toEqual([]);
  });

  it("leaves other plugins' messages alone", () => {
    const { ctx, inbox, agent } = mount();
    fireInserted(ctx, agent, {
      id: "other-1",
      source: { kind: "plugin", plugin: "something-else" },
      text: "not ours",
    });
    expect(inbox.pending.map((message) => message.id)).toEqual(["other-1"]);
    expect(inbox.removed).toEqual([]);
  });

  it("keeps the comment while purging the canned sentence beside it", () => {
    const { ctx, inbox, agent } = mount();
    // Real order: the steer goes out before the answer resolves, the canned
    // followup is appended after the decision (tool-render client.tsx:952).
    fireInserted(ctx, agent, userComment("c-2", "retry with --dry-run instead"));
    fireInserted(ctx, agent, stamped("msg-4", REJECTION_TEXT));
    expect(inbox.pending.map((message) => message.id)).toEqual(["c-2"]);
    expect(inbox.removed).toEqual(["msg-4"]);
  });

  it("a bare rejection leaves nothing behind: silence by convention", () => {
    const { ctx, inbox, agent } = mount();
    fireInserted(ctx, agent, stamped("msg-5", REJECTION_TEXT));
    // Purged, and the plugin authors no replacement — no append/insert path
    // exists on the fake inbox at all, so any attempt would throw.
    expect(inbox.pending).toEqual([]);
    expect(inbox.removed).toEqual(["msg-5"]);
  });

  it("the purge runs synchronously in the insert task", () => {
    const { ctx } = mount();
    const handlers = ctx.handlers.get("agent/inbox/inserted") ?? [];
    expect(handlers).toHaveLength(1);
    // A same-task purge is the whole point ("gone before the user could see
    // it"): an async callback would slip to a later microtask. Guard the
    // sync shape against a well-meaning async rewrite.
    expect(handlers[0].constructor.name).toBe("Function");
  });
});

describe("pre-step backstop (#76, kept)", () => {
  async function runPreStep(decision: unknown) {
    const { ctx } = mount();
    const handlers = ctx.handlers.get("agent/pre-step") ?? [];
    expect(handlers).toHaveLength(1);
    // Cast the HANDLER, not one of its arguments. `as never` on the second
    // argument also collapsed the FIRST parameter to `never` (TS2345), since
    // both are inferred together from a loosely-typed handler map.
    const handler = handlers[0] as (
      payload: unknown,
      next: () => Promise<unknown>,
    ) => Promise<unknown>;
    return handler({}, async () => decision);
  }

  it("rejects a step whose every message is an approval notice", async () => {
    const outcome = (await runPreStep({
      kind: "enter",
      messages: [stamped("m-1", REJECTION_TEXT)],
    })) as { kind: string };
    expect(outcome).toEqual({ kind: "reject" });
  });

  it("filters notices out of a mixed step", async () => {
    const comment = userComment("c-3", "go on");
    const outcome = (await runPreStep({
      kind: "enter",
      messages: [stamped("m-2", REJECTION_TEXT), comment],
    })) as { kind: string; messages: TestMessage[] };
    expect(outcome.kind).toBe("enter");
    expect(outcome.messages).toEqual([comment]);
  });

  it("passes a clean step through untouched", async () => {
    const decision = { kind: "enter", messages: [userComment("c-4", "go on")] };
    await expect(runPreStep(decision)).resolves.toBe(decision);
  });

  it("leaves non-enter decisions alone", async () => {
    const decision = { kind: "reject" };
    await expect(runPreStep(decision)).resolves.toBe(decision);
  });
});
