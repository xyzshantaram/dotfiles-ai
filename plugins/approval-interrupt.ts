/**
 * approval-interrupt — own the approval-rejection experience (#76).
 *
 * THE PROBLEM. When a human rejects or cancels a live approval,
 * `@deepseek-ai/dsh-user-approval` does two things
 * (dsh-user-approval/lib/index.js:214-237, `maybeInterruptOnRejection`, called
 * unconditionally from `request()` at :159 after the `approval/decided`
 * append):
 *
 *   agent.cancel({ kind: "user", reason: "approval-rejected" }, { keepInbox: true });
 *   agent.followup(createUserMessage({
 *     content: [{ type: "text", text }],
 *     source: { kind: "plugin", plugin: "user-approval" },
 *   }));
 *
 * with `text` being one of two hard-coded strings:
 *
 *   "The user rejected your approval request. Stop and explain what happened.
 *    Do not retry the rejected action."
 *   "The approval request was cancelled. Stop and explain what happened."
 *
 * The CANCEL is worth keeping: without it a rejected tool call can leave the
 * agent looping. Note it already passes `keepInbox: true`, so a comment the
 * user attached to the rejection survives it. The FOLLOWUP is the harmful
 * half: tool-render's approval bar already carries the user's own words on the
 * steer wire, and the canned sentence lands beside them and contradicts them —
 * "do not retry" against a comment that usually says exactly how to retry.
 *
 * Worth knowing: this is the ONLY place in the whole DSH install that pairs a
 * cancel with an injected explanation. The human Stop button cancels
 * identically (dsh-host-apiproxy/lib/index.js:2879, `{kind:'user'}`,
 * `keepInbox: true`) and says nothing at all. Removing the sentence makes
 * approval-rejection behave like every other cancellation in the system.
 *
 * THE SEAM. `agent/pre-step` is the chokepoint where the loop assembles the
 * messages a step will actually see (dsh-agent-loop/lib/index.js:496-508): it
 * claims the inbox, renders the runtime context, and dispatches the waterfall
 * whose returned decision is authoritative.
 *
 * Ordering is guaranteed by Cordis, not assumed: `register` uses
 * `options.prepend ? "unshift" : "push"` (cordis/lib/index.js:335-345) and
 * `waterfall` walks that array (:317-325), so a prepended listener runs FIRST,
 * its `await next()` yields the fully-composed decision, and its return value
 * is final. `dsh-time-context` prepends the same way (lib/index.js:393), and
 * `dsh-tool-skill` filters a message out of `decision.messages` in exactly
 * this shape (lib/index.js:205-213) — so both halves of this technique are
 * first-party precedent rather than invention.
 *
 * WHY NOT the alternatives, all checked:
 * - Answering `approval/request` ourselves does NOT help:
 *   `maybeInterruptOnRejection` runs after `decide()` returns, on whatever
 *   outcome, whoever authored it.
 * - Re-providing the `approval` service is impossible: `ctx.provide` throws
 *   when the name is already provided in scope
 *   (cordis/lib/types/reflect.d.ts:18-40).
 * - Patching `ApprovalService.prototype.maybeInterruptOnRejection` would work
 *   (the Cordis service proxy passes writes through to the real target,
 *   cordis/lib/index.js:145-151) but reaches into another package's internals
 *   for no gain over a public waterfall.
 *
 * SCOPE. Both messages this plugin drops carry
 * `source = { kind: "plugin", plugin: "user-approval" }`: the rejection
 * followup above, and the policy-change notice at
 * dsh-user-approval/lib/index.js:118 ("The approval policy changed from ... to
 * ... (changed by the user)."), delivered by `agent.inject`. Dropping the
 * second is deliberate: the effective policy is already stated every step by
 * that package's own runtime-context provider at order 115, which re-emits
 * whenever the rendered snapshot changes, so the notice is a duplicate of a
 * fact the model is told anyway.
 *
 * This plugin removes TEXT ONLY. It never touches the cancel, so a bare
 * rejection still stops the turn.
 *
 * Mount on the HOST plane:
 *
 *   - id: approval-interrupt
 *     name: /path/to/plugins/approval-interrupt.js
 */
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";

export const name = "approval-interrupt";

export const Config = z.object({});

type ApprovalInterruptConfig = Record<string, never>;

/** The stamp every message authored by the shipped approval service carries. */
const APPROVAL_PLUGIN = "user-approval";

/** The one field shape this plugin reads off a claimed message. */
interface SourcedMessage {
  source?: { kind?: string; plugin?: string };
}

/**
 * True for a message authored by the shipped approval service — the rejection
 * followup or the policy-change notice.
 * @param message - a claimed inbox message.
 * @returns whether this plugin should drop it.
 */
function isApprovalNotice(message: unknown): boolean {
  const source = (message as SourcedMessage | null | undefined)?.source;
  if (source === undefined || source === null) return false;
  return source.kind === "plugin" && source.plugin === APPROVAL_PLUGIN;
}

export function apply(ctx: Context, config: ApprovalInterruptConfig): void {
  void config;

  ctx.on(
    "agent/pre-step",
    async (_payload, next) => {
      const decision = await next();
      // A rejected step carries no messages to filter, and re-deciding it here
      // would override a refusal someone else already made.
      if (decision.kind !== "enter") return decision;

      const kept = decision.messages.filter((message) => !isApprovalNotice(message));
      if (kept.length === decision.messages.length) return decision;

      ctx.logger.info(
        `dropped ${decision.messages.length - kept.length} user-approval notice(s)`,
      );
      // Every message was ours to drop: entering a step with an empty message
      // list is not the same as entering with none, so reject the step instead.
      // dsh-agent/lib/types/runtime-types.d.ts:184-193 — a rejected step means
      // the claimed message "is neither discarded nor re-emitted as a
      // user/message, and the turn closes without a step", which is exactly
      // the outcome we want: the cancel already stopped the turn, and the
      // model never sees the sentence.
      if (kept.length === 0) return { kind: "reject" };
      return { kind: "enter", messages: kept };
    },
    { prepend: true },
  );
}
