// Guarded-approval projection.
// Folds `approval/asked` events into a set of callIds whose approval was
// raised by bash-guard. The BashRow client card reads the set to keep its
// electric-blue outline for the life of the session: the live
// `snapshot.pending` signal vanishes once the approval is answered, but the
// durable log keeps the fact that bash-guard raised one for that call.
// `approval/decided` removes nothing -- the decision does not un-guard the
// command.
import type {} from "@deepseek-ai/dsh-session-projection/types";
import type { ProjectionDefinition } from "@deepseek-ai/dsh-session-projection";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { z } from "zod";
import { isBashGuardReason } from "./guard.js";

export const GUARDED_APPROVALS_KEY = "tool-render/guarded-approvals";

/** Keep the most recent 200 approvals so a long session cannot grow the state without bound. */
export const GUARDED_APPROVALS_CAP = 200;

export interface GuardedApprovalsState {
  entries: Array<{ seq: number; callId: string }>;
}

declare module "@deepseek-ai/dsh-session-projection/types" {
  interface SessionProjectionMap {
    "tool-render/guarded-approvals": Record<string, boolean> | null;
  }
}

const viewSchema = z.record(z.string(), z.literal(true)).nullable();

export const guardedApprovalsProjection: ProjectionDefinition<
  typeof GUARDED_APPROVALS_KEY,
  GuardedApprovalsState
> = {
  key: GUARDED_APPROVALS_KEY,
  // Version 2: the reason matcher learned the shipped guard's plain-text
  // "bash-guard:" format, so the previously folded (empty) state is stale
  // and the log must be replayed.
  stateVersion: 2,
  schema: viewSchema,
  init(): GuardedApprovalsState {
    return { entries: [] };
  },
  // `approval/asked` sits outside this build's SessionEventMap (the
  // user-approval plugin extends the vocabulary out of repo), so the event
  // is read through a structural cast. An event whose reason is not a
  // bash-guard payload, or whose callId is missing or empty, stores nothing.
  apply(state: GuardedApprovalsState, event: SessionEvent): GuardedApprovalsState {
    const e = event as unknown as {
      type: string;
      seq: number;
      data?: { reason?: unknown; callId?: unknown };
    };
    if (e.type !== "approval/asked") return state;
    const data = e.data;
    if (data === undefined || data === null) return state;
    if (typeof data.callId !== "string" || data.callId === "") return state;
    if (!isBashGuardReason(data.reason)) return state;
    for (const entry of state.entries) {
      if (entry.callId === data.callId) return state;
    }
    const kept = state.entries.concat([{ seq: e.seq, callId: data.callId }]);
    kept.sort(function (a, b) {
      return a.seq - b.seq;
    });
    while (kept.length > GUARDED_APPROVALS_CAP) kept.shift();
    return { entries: kept };
  },
  view(state: GuardedApprovalsState): Record<string, boolean> | null {
    if (state.entries.length === 0) return null;
    const out: Record<string, boolean> = {};
    for (const entry of state.entries) out[entry.callId] = true;
    return out;
  },
};
