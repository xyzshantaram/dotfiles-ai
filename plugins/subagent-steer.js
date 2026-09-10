// plugins/subagent-steer.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
function decideDelivery(input) {
  const parent = input.parent;
  if (parent === void 0 || parent === null) {
    return { kind: "refuse", reason: "send_message requires a calling agent" };
  }
  if (input.liveParent !== parent) {
    return {
      kind: "refuse",
      reason: "the calling agent is no longer the live agent for its id"
    };
  }
  if (input.child === void 0 || input.child === null) return { kind: "followup" };
  const parentId = parent.id;
  if (typeof parentId !== "string" || parentId === "") {
    return { kind: "refuse", reason: "the calling agent has no usable id" };
  }
  if (input.childParentSession !== parentId) {
    return {
      kind: "refuse",
      reason: "that subagent is not a direct child of the calling agent"
    };
  }
  return { kind: "steer" };
}
function resultTextFor(delivery, subagentId, running) {
  if (delivery.kind === "followup") {
    return `subagent ${subagentId} was not resident; message queued as its next turn`;
  }
  if (delivery.kind === "refuse") return delivery.reason;
  return running ? `message steered into subagent ${subagentId}'s current turn (visible at its next step)` : `message delivered to subagent ${subagentId}, starting its next turn`;
}
function parentSessionOf(child) {
  if (child === null || child === void 0 || typeof child !== "object") return void 0;
  const session = child.session;
  if (session === null || session === void 0 || typeof session !== "object") return void 0;
  const header = session.header;
  if (header === null || header === void 0 || typeof header !== "object") return void 0;
  return header.parentSession;
}
function isRunning(child) {
  if (child === null || child === void 0 || typeof child !== "object") return false;
  return child.status === "running";
}
var name = "subagent-steer";
var inject = ["tools"];
function apply(ctx) {
  const svc = (n) => ctx.get(n);
  const tools = ctx.tools;
  tools.register(
    defineTool({
      name: "interrupt_agent",
      description: "Request cancellation of a background agent's current turn by its agent id. The target may be your direct child or a deeper agent created under you. Only the current turn stops: messages already queued for the agent stay parked until a later send_message, agents it started keep running, and the agent itself stays available for follow-ups. This call returns as soon as the stop request is accepted, so the target may keep running briefly; interrupting an agent that already finished is an accepted no-op.",
      parameters: {
        agent_id: {
          type: "string",
          required: true,
          description: "The agent id of the running agent to interrupt."
        }
      },
      // THE SHIPPED OUTPUT SHAPE, restored. My first re-provision quietly
      // returned a plain string where the shipped tool returns
      // `{accepted: true}`. "Verbatim delegate" has to mean the WIRE too:
      // a caller or card reading `.accepted` would have silently seen
      // undefined, which is the same class of invisible break as the missing
      // registrar this whole commit exists to repair.
      output: {
        schema: {
          type: "object",
          additionalProperties: false,
          properties: { accepted: { type: "boolean", required: true } }
        },
        render: (args, _value) => [
          { type: "text", text: `interrupt requested for agent ${args.agent_id}` }
        ]
      },
      async execute(args, exec) {
        const subagents = svc("subagents");
        if (subagents === void 0) {
          throw new Error("interrupt_agent is not available in this composition");
        }
        const caller = exec?.agent;
        if (caller === void 0 || caller === null) {
          throw new Error("interrupt_agent requires a calling agent (exec.agent was undefined)");
        }
        subagents.interrupt(args.agent_id, { kind: "ancestor", agent: caller });
        return { accepted: true };
      }
    })
  );
  tools.register(
    defineTool({
      name: "send_message",
      description: "Send a message to a background subagent by its subagent id, continuing the same conversation. If the subagent is idle this starts a new turn; if it is still working the message is STEERED into its current turn and is visible before its next model call, so it can redirect work already underway. This is the same delivery a human gets from Ctrl+Enter in the composer. Prefer it for corrections and newly arrived facts. This call returns no answer from the subagent \u2014 only confirmation that the message was delivered \u2014 so use it to give it more work. A failure means the message was NOT delivered. Cost, so you can time it well: a steer can land in the middle of a multi-step plan and prolongs the current turn while it is unread, so keep steers short and unambiguous. A message you queued earlier may be delivered in the same step, after the steered one.",
      parameters: {
        subagent_id: {
          type: "string",
          required: true,
          description: "The subagent id returned when the background subagent was started."
        },
        message: {
          type: "string",
          required: true,
          description: "The message to deliver to the subagent."
        }
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: value }]
      },
      async execute(args, exec) {
        const agents = svc("agents");
        const subagents = svc("subagents");
        if (agents === void 0 || subagents === void 0) {
          throw new Error("send_message is not available in this composition");
        }
        if (exec?.signal?.throwIfAborted !== void 0) exec.signal.throwIfAborted();
        const parent = exec?.agent;
        const childId = args.subagent_id;
        const child = agents.get(childId);
        const delivery = decideDelivery({
          parent,
          liveParent: parent === void 0 || parent === null ? void 0 : agents.get(parent.id),
          child,
          childParentSession: parentSessionOf(child)
        });
        if (delivery.kind === "refuse") throw new Error(delivery.reason);
        if (delivery.kind === "steer") {
          const running = isRunning(child);
          child.steer({
            content: [{ type: "text", text: args.message }],
            source: { kind: "coordinator", form: "relay", senderSessionId: parent.id }
          });
          return resultTextFor(delivery, childId, running);
        }
        await subagents.followup(parent, childId, [{ type: "text", text: args.message }], {
          source: { kind: "coordinator", form: "relay", senderSessionId: parent.id },
          signal: exec?.signal
        });
        return resultTextFor(delivery, childId, false);
      }
    })
  );
}
export {
  apply,
  decideDelivery,
  inject,
  isRunning,
  name,
  parentSessionOf,
  resultTextFor
};
