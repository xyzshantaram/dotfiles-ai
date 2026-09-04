/**
 * Completion delivery — push unreported job completions to the owner.
 *
 * The jobs service marks every finished job with a reported flag. The
 * owner agent learns about the finish only if something delivers it.
 * This module listens for done jobs and sends one notice message to
 * the owner, either as a wakeup (followup on an idle agent, under a
 * budget) or as quiet context (inject).
 */

import type { Agent } from "@deepseek-ai/dsh-agent";
import { boundContextSummary, createUserMessage } from "@deepseek-ai/dsh-llm";

export interface JobDoneSnapshotLike {
  id: string;
  kind: string;
  label: string;
  status: "completed" | "killed" | "failed";
  detail?: string;
  startedAt: number;
  finishedAt?: number;
  reported: boolean;
}

export interface JobDoneServiceLike {
  onJobDone(listener: (snapshot: JobDoneSnapshotLike, owner: Agent | undefined) => void): () => void;
}

export interface InboxClaimEventsLike {
  on(
    event: "agent/inbox/claimed",
    listener: (payload: { agent: Agent; message: { source: { kind: string } } }) => void,
  ): () => void;
}

export type DeliveryMode = "quiet" | "wakeup";

/** Decide how to deliver one completion notice to its owner. */
export function chooseDelivery(
  ownerStatus: "idle" | "running",
  spentWakes: number,
  maxConsecutiveWakes: number,
  delivery: DeliveryMode,
): "followup" | "inject" {
  if (delivery === "wakeup" && ownerStatus === "idle" && spentWakes < maxConsecutiveWakes) {
    return "followup";
  }
  return "inject";
}

/**
 * One short, plain-text completion notice. Always short enough that a
 * byte cap never matters for it. Unlike the tool this replaces, this
 * plugin's simplified job snapshot carries no per-job output-byte-limit
 * field to bound against, so no truncation logic exists here. This is a
 * deliberate simplification, not an oversight.
 */
export function completionNoticeText(snapshot: JobDoneSnapshotLike): string {
  const detail = snapshot.detail !== undefined ? `, ${snapshot.detail}` : "";
  return `background job ${snapshot.id} (${snapshot.kind}: ${snapshot.label}) finished [status: ${snapshot.status}${detail}]. Read its output with job_output.`;
}

export interface CompletionOptions {
  delivery: DeliveryMode;
  maxConsecutiveWakes: number;
}

/**
 * Wire completion delivery to a live jobs service and agent events.
 * Returns the teardown function. The teardown unregisters both
 * listeners.
 */
export function mountCompletionDelivery(
  jobs: JobDoneServiceLike,
  events: InboxClaimEventsLike,
  options: CompletionOptions,
): () => void {
  const spentWakes = new WeakMap<Agent, number>();
  const unregisterClaim =
    options.delivery === "wakeup"
      ? events.on("agent/inbox/claimed", ({ agent, message }) => {
          if (message.source.kind === "user") spentWakes.delete(agent);
        })
      : () => {};
  const unregisterDone = jobs.onJobDone((snapshot, owner) => {
    if (snapshot.reported || owner === undefined) return;
    const message = createUserMessage({
      content: [{ type: "text", text: completionNoticeText(snapshot) }],
      source: {
        kind: "plugin",
        plugin: "job-viewer",
        form: "notice",
        summary: boundContextSummary(`${snapshot.kind} ${snapshot.label} [status: ${snapshot.status}]`),
      },
    });
    const spent = spentWakes.get(owner) ?? 0;
    const decision = chooseDelivery(owner.status, spent, options.maxConsecutiveWakes, options.delivery);
    if (decision === "followup") {
      spentWakes.set(owner, spent + 1);
      owner.followup(message);
    } else {
      owner.inject(message);
    }
  });
  return () => {
    unregisterClaim();
    unregisterDone();
  };
}
