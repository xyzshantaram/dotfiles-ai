/**
 * subagent-steer — `send_message` delivers as a STEER, not a queued turn (#129).
 *
 * THE OWNER'S SPEC, and the acceptance bar: "orchestrator message to subagent
 * should behave exactly like user pressing Ctrl+Enter". That is not a loose
 * analogy. dsh-client-ui-conversation defines
 *
 *     const BUSY_ENTER_BEHAVIORS = ["queue", "steer"];
 *     return preferred === "queue" ? "steer" : "queue";
 *
 * so while an agent is busy, Enter performs the preferred behaviour and the
 * modifier performs the OTHER one. Ctrl+Enter is therefore the STEER path.
 * The shipped `send_message` uses followup — the "queue" behaviour, the one
 * Ctrl+Enter deliberately bypasses — which is why a correction sent to a
 * working subagent sat unread until its current turn ended.
 *
 * WHY A SHADOW AND NOT A PATCH. Every package in the delivery path is
 * @deepseek-ai-owned and uneditable here. `Agent.steer` is public API
 * (dsh-agent/lib/types/runtime-types.d.ts:123: "Submit steering for the
 * nearest step. An idle driver starts a turn; a running driver consumes it at
 * its next step boundary"), so the capability exists; only the routing is
 * wrong. Note `ctx.tools.register` THROWS on a duplicate name within a layer,
 * so sync.sh must disable the shipped `tool-subagent-control` row exactly as
 * it already does for `tool-bash` — and because that edits INSTALLED files a
 * reinstall reverts, it needs the same tripwire test.
 *
 * THE SECURITY POINT, which is the reason this file is careful rather than
 * short: `Agent.steer()` performs NO authorization. Any holder of the agent
 * object can steer any agent — a sibling, a parent, a stranger. The manager's
 * `authorizeLineage` normally stands in the way, and a shadow that reached
 * past it would be a privilege escalation, not a shortcut. So the two checks
 * are re-implemented here, and `decideDelivery` exists as a pure function
 * precisely so they can be tested exhaustively rather than eyeballed.
 *
 * WHAT WE DELIBERATELY DO NOT REACH PAST: when the child is not resident we
 * delegate to `ctx.subagents.followup`, which keeps cold-resume, per-child
 * locks, drain admission and FIFO ordering. Re-implementing those to save one
 * hop would trade correctness for symmetry.
 */
import type { Context } from "@deepseek-ai/cordis";
import { defineTool } from "@deepseek-ai/dsh-tools";

/** How a message should be delivered, or why it must not be. */
export type Delivery =
  | { kind: "steer" }
  | { kind: "followup" }
  | { kind: "refuse"; reason: string };

/** The facts a delivery decision needs, gathered by the caller. */
export interface DeliveryInput {
  /** `exec.agent` — the calling agent, per the initiator chain. */
  parent: { id: unknown } | undefined | null;
  /** `ctx.agents.get(parent.id)` — the registry's live parent, if any. */
  liveParent: unknown;
  /** `ctx.agents.get(childId)` — undefined once the child is disposed. */
  child: unknown;
  /** `child.session.header.parentSession` — the durable direct parent. */
  childParentSession: unknown;
}

/**
 * Decide how (and whether) to deliver.
 *
 * The two lineage checks mirror `authorizeLineage`
 * (dsh-subagent/lib/index.js:1373-1377) and BOTH are required:
 *
 *   1. `ctx.agents.get(parent.id) === parent` — identity, not equality. A
 *      caller holding a STALE agent object for a since-replaced id would pass
 *      an id comparison while no longer being that live agent.
 *   2. `child.session.header.parentSession === parent.id` — the child must be
 *      our DIRECT child. Without this, any agent could steer any other agent
 *      whose id it happened to learn, including its own parent.
 *
 * ORDER MATTERS FOR THE COLD PATH. The child-residency check sits BETWEEN the
 * two: a non-resident child yields `followup`, and the manager then performs
 * its own authorization on that path. Running check 2 first would require
 * reading `session.header` off an object we do not have, and refusing for
 * "wrong parent" when the truth is "already finished" would be a misleading
 * error for a completely ordinary race.
 */
export function decideDelivery(input: DeliveryInput): Delivery {
  const parent = input.parent;
  if (parent === undefined || parent === null) {
    return { kind: "refuse", reason: "send_message requires a calling agent" };
  }
  if (input.liveParent !== parent) {
    return {
      kind: "refuse",
      reason: "the calling agent is no longer the live agent for its id",
    };
  }
  // Not resident: settled, disposed, or never ours. Delegate rather than
  // guess — followup cold-resumes and re-checks lineage itself.
  if (input.child === undefined || input.child === null) return { kind: "followup" };
  // THE IDENTITY MUST BE USABLE BEFORE IT IS COMPARED. Caught by its own
  // test: a parent with no id and a child with no recorded parentSession are
  // both `undefined`, and `undefined === undefined` would have AUTHORIZED
  // the steer — an absent identity matching an absent claim. Two malformed
  // objects must never authorize each other, so an unusable id is refused
  // before any comparison happens.
  const parentId = parent.id;
  if (parentId === undefined || parentId === null || parentId === "") {
    return { kind: "refuse", reason: "the calling agent has no usable id" };
  }
  if (input.childParentSession !== parentId) {
    return {
      kind: "refuse",
      reason: "that subagent is not a direct child of the calling agent",
    };
  }
  return { kind: "steer" };
}

/**
 * The sentence the caller reads back.
 *
 * Three outcomes rather than one, because the timing genuinely differs and a
 * caller who cannot tell them apart will misjudge when their correction
 * lands. The shipped tool said "message queued as the next turn" for every
 * case, which was true then and would be a lie now.
 */
export function resultTextFor(delivery: Delivery, subagentId: string, running: boolean): string {
  if (delivery.kind === "followup") {
    return `subagent ${subagentId} was not resident; message queued as its next turn`;
  }
  if (delivery.kind === "refuse") return delivery.reason;
  return running
    ? `message steered into subagent ${subagentId}'s current turn (visible at its next step)`
    : `message delivered to subagent ${subagentId}, starting its next turn`;
}

/** Structural view of the services this plugin reaches. */
interface AgentsService {
  get(id: unknown): unknown;
}
interface SubagentsService {
  followup(parent: unknown, childId: unknown, message: unknown, options?: unknown): Promise<unknown>;
  interrupt(agentId: unknown, by: unknown): unknown;
}

/** Read `child.session.header.parentSession` without trusting any hop. */
export function parentSessionOf(child: unknown): unknown {
  if (child === null || child === undefined || typeof child !== "object") return undefined;
  const session = (child as { session?: unknown }).session;
  if (session === null || session === undefined || typeof session !== "object") return undefined;
  const header = (session as { header?: unknown }).header;
  if (header === null || header === undefined || typeof header !== "object") return undefined;
  return (header as { parentSession?: unknown }).parentSession;
}

/** Whether the child is mid-turn, for the result sentence only. */
export function isRunning(child: unknown): boolean {
  if (child === null || child === undefined || typeof child !== "object") return false;
  return (child as { status?: unknown }).status === "running";
}

export const name = "subagent-steer";
export const inject = ["tools"];

export function apply(ctx: Context) {
  const agents = (ctx as unknown as { get(n: string): unknown }).get("agents") as
    | AgentsService
    | undefined;
  const subagents = (ctx as unknown as { get(n: string): unknown }).get("subagents") as
    | SubagentsService
    | undefined;

  const tools = (ctx as unknown as { tools: { register(t: unknown): unknown } }).tools;

  /*
   * RE-PROVIDED, NOT REDESIGNED (#129).
   *
   * The shipped `tool-subagent-control` row registers TWO tools —
   * `send_message` AND `interrupt_agent` — and sync.sh disables the whole
   * row so this plugin can own `send_message`. Disabling a row is
   * all-or-nothing, so `interrupt_agent` would simply VANISH unless it is
   * re-provided here. That is a regression a test of send_message could
   * never catch: the tool is not wrong, it is absent.
   *
   * So this is a deliberate verbatim delegate. The behaviour, the parameter,
   * the output shape and the description are the shipped ones, because
   * nothing about interrupt_agent is changing — only its registrar. Its
   * description remains TRUE under steer delivery: cancel keeps both inbox
   * lists, so "messages already queued for the agent stay parked until a
   * later send_message" still holds.
   */
  tools.register(
    defineTool({
      name: "interrupt_agent",
      description:
        "Request cancellation of a background agent's current turn by its agent id. The target may be your direct child or a deeper agent created under you. Only the current turn stops: messages already queued for the agent stay parked until a later send_message, agents it started keep running, and the agent itself stays available for follow-ups. This call returns as soon as the stop request is accepted, so the target may keep running briefly; interrupting an agent that already finished is an accepted no-op.",
      parameters: {
        agent_id: {
          type: "string",
          required: true,
          description: "The agent id of the running agent to interrupt.",
        },
      },
      output: {
        schema: { type: "string" },
        render: (args: any, _value: unknown) => [
          { type: "text", text: `interrupt requested for agent ${args.agent_id}` },
        ],
      },
      async execute(args: any, exec: any) {
        if (subagents === undefined) {
          throw new Error("interrupt_agent is not available in this composition");
        }
        const caller = exec?.agent;
        if (caller === undefined || caller === null) {
          throw new Error("interrupt_agent requires a calling agent (exec.agent was undefined)");
        }
        // `kind: "ancestor"` is the shipped authorization shape: the manager
        // checks the caller is an ancestor of the target. Unlike steer, this
        // path is authorized by the manager, so we do not re-implement it.
        subagents.interrupt(args.agent_id, { kind: "ancestor", agent: caller });
        return `interrupt requested for agent ${args.agent_id}`;
      },
    }) as unknown,
  );

  tools.register(
    defineTool({
      name: "send_message",
      description:
        "Send a message to a background subagent by its subagent id, continuing the same conversation. If the subagent is idle this starts a new turn; if it is still working the message is STEERED into its current turn and is visible before its next model call, so it can redirect work already underway. This is the same delivery a human gets from Ctrl+Enter in the composer. Prefer it for corrections and newly arrived facts. This call returns no answer from the subagent — only confirmation that the message was delivered — so use it to give it more work. A failure means the message was NOT delivered. Cost, so you can time it well: a steer can land in the middle of a multi-step plan and prolongs the current turn while it is unread, so keep steers short and unambiguous. A message you queued earlier may be delivered in the same step, after the steered one.",
      parameters: {
        subagent_id: {
          type: "string",
          required: true,
          description: "The subagent id returned when the background subagent was started.",
        },
        message: {
          type: "string",
          required: true,
          description: "The message to deliver to the subagent.",
        },
      },
      output: {
        schema: { type: "string" },
        render: (_args: unknown, value: string) => [{ type: "text", text: value }],
      },
      async execute(args: any, exec: any) {
        if (agents === undefined || subagents === undefined) {
          throw new Error("send_message is not available in this composition");
        }
        if (exec?.signal?.throwIfAborted !== undefined) exec.signal.throwIfAborted();
        const parent = exec?.agent;
        const childId = args.subagent_id;
        const child = agents.get(childId);
        const delivery = decideDelivery({
          parent: parent,
          liveParent: parent === undefined || parent === null ? undefined : agents.get(parent.id),
          child: child,
          childParentSession: parentSessionOf(child),
        });
        if (delivery.kind === "refuse") throw new Error(delivery.reason);
        if (delivery.kind === "steer") {
          const running = isRunning(child);
          (child as { steer(m: unknown): void }).steer({
            content: [{ type: "text", text: args.message }],
            source: { kind: "coordinator", form: "relay", senderSessionId: parent.id },
          });
          return resultTextFor(delivery, childId, running);
        }
        await subagents.followup(parent, childId, [{ type: "text", text: args.message }], {
          source: { kind: "coordinator", form: "relay", senderSessionId: parent.id },
          signal: exec?.signal,
        });
        return resultTextFor(delivery, childId, false);
      },
    }) as unknown,
  );
}
