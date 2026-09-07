// Guarded-approval projection.
// Folds `approval/asked` events into a set of callIds whose approval was
// raised by bash-guard. The BashRow client card reads the set to keep its
// electric-blue outline for the life of the session: the live
// `snapshot.pending` signal vanishes once the approval is answered, but the
// durable log keeps the fact that bash-guard raised one for that call.
// `approval/decided` removes nothing from that set -- the decision does not
// un-guard the command.
//
// The same fold now also pairs `approval/decided` to `approval/asked` by id
// and exposes a callId→outcome map for EVERY approval that carried a callId
// (not only bash-guard's). The tool-call card reads it for the durable
// decided badge that survives the decision and a page reload.
//
// The outcome string is stored VERBATIM, and the real vocabulary is the
// host's settle vocabulary -- "allowed-once" | "rejected" | "cancelled"
// (dsh-user-approval appends `approval/decided` with whatever `decide`
// resolved). It is NOT "approved": that value exists nowhere in the harness,
// and sending it on the response wire is rejected as `bad-response`. The card
// maps "allowed-once" to the friendlier "approved" LABEL at render time only.
import type {} from "@deepseek-ai/dsh-session-projection/types";
import type { ProjectionDefinition } from "@deepseek-ai/dsh-session-projection";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { z } from "zod";
import { isBashGuardReason } from "./guard.js";

export const GUARDED_APPROVALS_KEY = "tool-render/guarded-approvals";

/** Keep the most recent 200 approvals so a long session cannot grow the state without bound. */
export const GUARDED_APPROVALS_CAP = 200;

export interface GuardedApprovalsEntry {
  seq: number;
  callId: string;
  /** The `approval/asked` id, so a later `approval/decided` can pair with this entry. */
  id?: string;
  /** The paired decision's outcome string, once `approval/decided` arrives. */
  outcome?: string;
  /** Present only while the asked approval was raised by bash-guard. */
  guarded?: boolean;
}

export interface GuardedApprovalsState {
  entries: GuardedApprovalsEntry[];
}

/** The view: the bash-guard callId set for the card outline, plus the callId→outcome map for the decided badge. */
export interface GuardedApprovalsView {
  guarded: Record<string, boolean>;
  outcomes: Record<string, string>;
}

declare module "@deepseek-ai/dsh-session-projection/types" {
  interface SessionProjectionMap {
    "tool-render/guarded-approvals": GuardedApprovalsView | null;
  }
}

const viewSchema = z
  .object({
    guarded: z.record(z.string(), z.literal(true)),
    outcomes: z.record(z.string(), z.string()),
  })
  .nullable();

export const guardedApprovalsProjection: ProjectionDefinition<
  typeof GUARDED_APPROVALS_KEY,
  GuardedApprovalsState
> = {
  key: GUARDED_APPROVALS_KEY,
  // Version 3: entries now pair `approval/asked` to `approval/decided` by id
  // and carry the outcome for the decided badge, so the version-2 state
  // (callId-only) is stale and the log must be replayed.
  stateVersion: 3,
  schema: viewSchema,
  init(): GuardedApprovalsState {
    return { entries: [] };
  },
  // `approval/asked` and `approval/decided` sit outside this build's
  // SessionEventMap (the user-approval plugin extends the vocabulary out of
  // repo), so the events are read through a structural cast. An asked event
  // whose callId is missing or empty stores nothing; a decided event whose
  // id never paired with an asked entry (no callId, or aged out of the cap)
  // stores nothing.
  apply(state: GuardedApprovalsState, event: SessionEvent): GuardedApprovalsState {
    const e = event as unknown as {
      type: string;
      seq: number;
      data?: { reason?: unknown; callId?: unknown; id?: unknown; outcome?: unknown };
    };
    if (e.type === "approval/decided") {
      const decided = e.data;
      if (decided === undefined || decided === null) return state;
      if (typeof decided.id !== "string" || decided.id === "") return state;
      if (typeof decided.outcome !== "string" || decided.outcome === "") return state;
      for (let i = 0; i < state.entries.length; i++) {
        const entry = state.entries[i];
        if (entry.id !== decided.id) continue;
        if (entry.outcome !== undefined) return state;
        const entries = state.entries.slice();
        entries[i] = { ...entry, outcome: decided.outcome };
        return { entries };
      }
      return state;
    }
    if (e.type !== "approval/asked") return state;
    const data = e.data;
    if (data === undefined || data === null) return state;
    if (typeof data.callId !== "string" || data.callId === "") return state;
    const id = typeof data.id === "string" ? data.id : undefined;
    const guardedNow = isBashGuardReason(data.reason);
    // Every asked approval with a callId is recorded, so its decision can
    // pair later; the guarded flag keeps the outline set exactly as it was.
    // A re-ask of a callId already in the set refreshes its seq/id and
    // clears a stale outcome, but guarded is sticky: a later non-guard ask
    // never un-guards an already-guarded call.
    const entries = state.entries.slice();
    let updated = false;
    for (let i = 0; i < entries.length; i++) {
      if (entries[i].callId !== data.callId) continue;
      entries[i] = {
        seq: e.seq,
        callId: data.callId,
        id: id,
        guarded: entries[i].guarded === true || guardedNow || undefined,
      };
      updated = true;
      break;
    }
    if (!updated) {
      entries.push({ seq: e.seq, callId: data.callId, id: id, guarded: guardedNow || undefined });
    }
    entries.sort(function (a, b) {
      return a.seq - b.seq;
    });
    while (entries.length > GUARDED_APPROVALS_CAP) entries.shift();
    return { entries };
  },
  view(state: GuardedApprovalsState): GuardedApprovalsView | null {
    if (state.entries.length === 0) return null;
    const guarded: Record<string, boolean> = {};
    const outcomes: Record<string, string> = {};
    for (const entry of state.entries) {
      if (entry.guarded === true) guarded[entry.callId] = true;
      if (entry.outcome !== undefined) outcomes[entry.callId] = entry.outcome;
    }
    return { guarded, outcomes };
  },
};
