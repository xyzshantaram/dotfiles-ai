// Compaction prettyView projection.
// Folds `compaction/summary` events into a small map from the event's own
// seq to the structured prettyView payload the compaction fork emits. The
// conversation.chat.node compaction card reads this map to draw its
// structured body; checkpoints without a payload (old ones, or a fork
// that is not installed) stay absent and the card falls back to the
// fenced summary text.
import type {} from "@deepseek-ai/dsh-session-projection/types";
import type { ProjectionDefinition } from "@deepseek-ai/dsh-session-projection";
import type { SessionEvent } from "@deepseek-ai/dsh-session";
import { z } from "zod";
import { isPrettyView } from "./pretty.js";

export const COMPACTION_VIEWS_KEY = "tool-render/compaction-views";

/** Keep the most recent 20 checkpoints so a long session cannot grow the state without bound. */
export const COMPACTION_VIEWS_CAP = 20;

export interface CompactionViewsState {
  entries: Array<{ seq: number; view: unknown }>;
}

declare module "@deepseek-ai/dsh-session-projection/types" {
  interface SessionProjectionMap {
    "tool-render/compaction-views": Record<string, unknown> | null;
  }
}

const prettyViewSchema = z.object({
  version: z.literal(1),
  span: z.object({ minSeq: z.number(), maxSeq: z.number() }),
  items: z.array(
    z.union([
      z.object({
        type: z.literal("message"),
        seq: z.number(),
        role: z.enum(["user", "assistant", "system"]),
        text: z.string(),
      }),
      z.object({
        type: z.literal("toolStrip"),
        seq: z.number(),
        tool: z.string(),
        count: z.number(),
      }),
      z.object({ type: z.literal("elided"), seq: z.number(), note: z.string() }),
      z.object({ type: z.literal("media"), seq: z.number(), label: z.string() }),
      z.object({ type: z.literal("checkpoint"), seq: z.number() }),
    ]),
  ),
  tail: z
    .object({ count: z.number(), tokens: z.number(), fromSeq: z.number() })
    .nullable(),
  stats: z.object({
    droppedResultTokens: z.number(),
    erroredCalls: z.number(),
    hiddenCalls: z.number(),
  }),
});

const viewSchema = z.record(z.string(), prettyViewSchema).nullable();

export const compactionViewsProjection: ProjectionDefinition<
  typeof COMPACTION_VIEWS_KEY,
  CompactionViewsState
> = {
  key: COMPACTION_VIEWS_KEY,
  stateVersion: 1,
  schema: viewSchema,
  init(): CompactionViewsState {
    return { entries: [] };
  },
  // `compaction/summary` sits outside this build's SessionEventMap (the
  // fork extends the vocabulary out of repo), so the event is read through
  // a structural cast. An event without a prettyView payload stores nothing.
  apply(state: CompactionViewsState, event: SessionEvent): CompactionViewsState {
    const e = event as unknown as { type: string; seq: number; data?: { prettyView?: unknown } };
    if (e.type !== "compaction/summary") return state;
    const view = e.data !== undefined && e.data !== null ? e.data.prettyView : undefined;
    if (!isPrettyView(view)) return state;
    const kept = state.entries.filter(function (entry) {
      return entry.seq !== e.seq;
    });
    kept.push({ seq: e.seq, view: view });
    kept.sort(function (a, b) {
      return a.seq - b.seq;
    });
    while (kept.length > COMPACTION_VIEWS_CAP) kept.shift();
    return { entries: kept };
  },
  view(state: CompactionViewsState): Record<string, unknown> | null {
    if (state.entries.length === 0) return null;
    const out: Record<string, unknown> = {};
    for (const entry of state.entries) out[String(entry.seq)] = entry.view;
    return out;
  },
};
