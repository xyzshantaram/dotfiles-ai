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
 * THE SEAM, FIRST HALF (#76, KEPT AS A BACKSTOP). `agent/pre-step` is the
 * chokepoint where the loop assembles the messages a step will actually see
 * (dsh-agent-loop/lib/index.js:496-508): it claims the inbox, renders the
 * runtime context, and dispatches the waterfall whose returned decision is
 * authoritative.
 *
 * THE SEAM, SECOND HALF (#113, PRIMARY). The pre-step filter is correct and
 * late: a rejection CANCELS the turn (`maybeInterruptOnRejection` pairs the
 * followup with `agent.cancel(..., { keepInbox: true })`), a cancelled turn
 * assembles no further step, and the followup sits in the queue — rendered
 * above the composer with steer/delete/edit affordances — until the user's
 * next message finally drives a step. The fix purges at insertion instead:
 * `agent/inbox/inserted` (declared in dsh-agent/lib/types/runtime-types.d.ts,
 * `@mode emit`, payload `{ agent, message }`) fires synchronously inside
 * `agent.followup()` / `agent.inject()` — durable append, live projection,
 * then this notification, all in one task — so `Inbox.remove()` runs before
 * any render, queue snapshot, or step can observe the message. The queue the
 * composer shows therefore never contains the sentence: it is gone before
 * the user could see it, not dropped at the next step. (The gateway derives
 * its `session/queue` snapshots from the durable splices asynchronously over
 * the wire — dsh-host-apiproxy/README.md:41 — so an insert and its
 * same-task removal settle to a queue that never held the message.)
 *
 * Why not earlier still, and why not on the decided event — both checked:
 * - STRICTLY PRE-INBOX (a) is impossible on a public seam. `send()` splices
 *   straight into the inbox (dsh-agent-loop/lib/index.js:390-404 — `send`
 *   plus its `followup`/`steer`/`inject` wrappers, no waterfall or event
 *   before the splice; read, not guessed). Intercepting the call would mean wrapping another package's
 *   agent instance — more invasive than the prototype patch already
 *   rejected below — for no observable gain over a same-task purge.
 * - LITERALLY ON `approval/decided` (b-as-written) observes too early to
 *   purge. `decided` is a session-log event, and `request()` appends it
 *   BEFORE `maybeInterruptOnRejection` runs — the message to purge does not
 *   exist yet when the decided event fires. (Session events ARE observable
 *   via `ctx.on("session/event")`, dsh-goal-round-driver precedent — the
 *   problem is ordering, not visibility.) A decided-observer could only arm
 *   a flag for the later insertion, which the source stamp already
 *   identifies. So the purge runs at insertion: the earliest public point
 *   where the message exists, in the same synchronous block as the decision.
 * No UI-only hide (c): the message must not exist, not merely not render.
 *
 * First-party precedent for this exact shape: dsh-goal-round-driver listens
 * on `agent/inbox/inserted` with a synchronous callback reading
 * `agent.inbox` (lib/index.js:239-246). Both halves used here are public:
 * the event is declared agent vocabulary and `Inbox.remove(messageId)` is a
 * public method ("remove one pending message and durably record its
 * cancellation", dsh-agent/lib/types/inbox.d.ts:65-70); the Agent interface
 * itself exposes `readonly inbox: Inbox` (runtime-types.d.ts:68).
 *
 * SILENCE BY CONVENTION (#113 owner decision 2026-09-09). A rejection with
 * NO comment produces NO message at all: the turn stops exactly as clicking
 * Stop in the composer stops it. That is the system's existing convention —
 * the Stop button cancels identically (`{kind:'user'}`, `keepInbox: true`)
 * and says nothing — so the silence here is consistency, not an omission.
 * Do NOT "fix" it by adding a canned message back: purging the sentence and
 * adding nothing is the whole point.
 *
 * DISMISS PARITY (checked 2026-09-09 for #113; owned by ask-interrupt, not
 * this plugin). `ask_user_question`'s Dismiss already stops the turn the way
 * the Stop button does: the client answers the pending question with
 * `{ok:false, error:{code:"cancelled"}}`, the host provider rejects with
 * `UserQuestionError("the user cancelled ask_user_question", "ASK_CANCELLED")`
 * (dsh-host-apiproxy/lib/index.js:3762), and ask-interrupt's
 * `tools/post-execute` listener turns that code into
 * `agent.cancel(..., { keepInbox: true })`. No inbox message exists anywhere
 * on that path (a dismissal is a failed TOOL RESULT inside its step, never
 * a followup), so there is nothing for this plugin to purge. If that chain
 * ever breaks, the fix belongs in ask-interrupt, not here.
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

/** A claimed or inserted inbox message: identity plus the approval stamp. */
interface StampedMessage extends SourcedMessage {
  id: string;
}

/**
 * The fields this plugin reads off an `agent/inbox/inserted` notification:
 * the agent whose inbox changed (for its public `inbox.remove`) and the
 * inserted message. Structural on purpose — this plugin observes the event,
 * it does not import the loop's Agent class.
 */
interface InboxInsertion {
  agent: { inbox: { remove(messageId: string): boolean } };
  message: unknown;
}

/**
 * True for a message authored by the shipped approval service — the rejection
 * followup or the policy-change notice.
 * @param message - a claimed or inserted inbox message.
 * @returns whether this plugin should drop it.
 */
function isApprovalNotice(message: unknown): message is StampedMessage {
  const source = (message as SourcedMessage | null | undefined)?.source;
  if (source === undefined || source === null) return false;
  return source.kind === "plugin" && source.plugin === APPROVAL_PLUGIN;
}

export function apply(ctx: Context, config: ApprovalInterruptConfig): void {
  void config;

  // PRIMARY SEAM (#113): purge at insertion. This listener runs synchronously
  // inside `agent.followup()` / `agent.inject()` — `emit` never awaits, so a
  // sync callback removes the message in the SAME task as the insert, before
  // any render, queue snapshot, or step can observe it. An async callback
  // would still beat every render, but same-task is strictly earlier.
  ctx.on("agent/inbox/inserted", (payload: InboxInsertion) => {
    const message = payload.message;
    if (!isApprovalNotice(message)) return;
    // The user's rejection comment travels a different wire
    // (`session.prompt(blocks, "steer")`, authored as the user, never stamped
    // `{kind:"plugin", plugin:"user-approval"}`), so the stamp filter cannot
    // take the user's words with the canned sentence. And a rejection with no
    // comment leaves nothing behind: silence by convention (see header).
    if (payload.agent.inbox.remove(message.id)) {
      ctx.logger.info(`purged user-approval notice ${message.id} at insert`);
    }
  });

  // BACKSTOP (#76, kept): if the insertion seam is ever bypassed, a step must
  // still never see the sentence.
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
