// Cross-workspace attention model (#103, phase 1).
//
// WHY THERE IS NO HOST PLUGIN HERE. The original design for #103 assumed a
// host-plane aggregation plugin exporting an HTTP route, because "can the
// host see other sessions' pending waits" looked like the only way to learn
// about them. That turned out to be true but unnecessary: the CLIENT already
// holds the whole picture.
//
//   - `props.useSessions` is UNCONDITIONAL for every slot component. The
//     renderer composes props as `OwnerOf & KeyPropsOf & SlotInjectFace &
//     (session ? SessionStandardProps : ...) & GlobalStandardProps`
//     (dsh-cordis-client-runner/lib/client.js:1841) and GlobalStandardProps
//     carries `useSessions` beside the `useSession` this plugin already uses
//     (dsh-client-runtime/lib/types/client/index.d.ts:85-90).
//   - `SessionListState.byId` is `Record<SessionId, SessionSummary>`, and the
//     store carries EVERY row: "Filtering stays with the consumer: the store
//     carries every row" (service.d.ts:52-56). The sidebar's per-workspace
//     grouping is a consumer-side view over that one global list, which is
//     why deleting a workspace leaves its sessions under "Ungrouped".
//     So the list is CROSS-WORKSPACE by construction.
//   - `SessionSummary.pendingInteraction` is projected from the same mux
//     frames the api-proxy replays, updated with `notifier.markDirty()` on
//     arrival, so it is LIVE. No polling, no route, no host code.
//
// THE ONE THING THE PROJECTION DOES NOT CARRY is granularity: it is the bare
// enum below, with no callId, no toolName and no count. The richer
// `PendingWait` payload exists client-side but only the OWNING session's UI
// can read it. That is a real limit, not an oversight, and it decides the
// jump behaviour: a LOCAL row can jump to the exact running tool call card,
// while a REMOTE row can only open its session. Encoding that here keeps the
// component from pretending otherwise.
//
// React-free so vitest reaches it without a browser.

/**
 * The kinds the client projects. `plan-review` is a THIRD kind that #103's
 * original text did not account for — it was written when only `approval`
 * and `question` were known. It is carried through rather than dropped: an
 * unmodelled kind is exactly the sort of thing that silently strands a
 * human, which is the failure this whole surface exists to prevent.
 */
export type AttentionKind = "approval" | "plan-review" | "question";

const ATTENTION_KINDS: readonly string[] = ["approval", "plan-review", "question"];

/** One row of the attention surface: a session that is blocked on a human. */
export interface AttentionRow {
  /** Stable across renders; one row per session, so the session id serves. */
  key: string;
  sessionId: string;
  kind: AttentionKind;
  /** What the session list calls this session. */
  title: string;
  /** Workspace label from the session's cwd; null when it has no cwd. */
  workspace: string | null;
  /** True for the session this composer is mounted in. */
  local: boolean;
}

/**
 * Workspace label for a row, derived from the session's `cwd`.
 *
 * The last path segment, because that is what distinguishes workspaces in
 * practice (`dotfiles-ai`, `aidos`, `thursday`) while the full path is too
 * long for a row and the shared prefix carries no information. A trailing
 * slash is tolerated because `cwd` is not guaranteed normalised.
 *
 * Returns null rather than a placeholder when there is no cwd: the caller
 * decides how to present an unattributed row, and inventing "unknown" here
 * would make an absent value indistinguishable from a real directory named
 * "unknown".
 */
export function workspaceLabelOf(cwd: unknown): string | null {
  if (typeof cwd !== "string") return null;
  const trimmed = cwd.replace(/\/+$/, "");
  if (trimmed === "") return null;
  const at = trimmed.lastIndexOf("/");
  const label = at === -1 ? trimmed : trimmed.slice(at + 1);
  return label === "" ? null : label;
}

/** Narrow an unknown projection value to a kind we model. */
function attentionKindOf(value: unknown): AttentionKind | null {
  return typeof value === "string" && ATTENTION_KINDS.indexOf(value) !== -1
    ? (value as AttentionKind)
    : null;
}

/**
 * Attention rows for every session currently blocked on a human.
 *
 * ORDERING IS PART OF THE CONTRACT, not a detail: the LOCAL session sorts
 * first (#103 requires "the current session's items remain first"), then
 * remote sessions by most-recently-updated. A human scanning this list is
 * almost always answering their own session's ask; making them hunt for it
 * among other workspaces would be a regression over today's local-only
 * modal.
 *
 * Sorting is stable for equal `updatedAt` because rows are collected in the
 * list's own iteration order and the comparator returns 0 — a jittering row
 * order under live updates would make the list hard to click.
 *
 * @param list - the `SessionListState` from `useSessions`; tolerates a
 *   missing or malformed value so a degraded snapshot renders nothing rather
 *   than throwing inside a load-bearing surface.
 * @param currentSessionId - the session this composer belongs to.
 */
export function attentionRowsOf(list: any, currentSessionId: unknown): AttentionRow[] {
  const byId =
    list !== null && list !== undefined && typeof list.byId === "object" && list.byId !== null
      ? list.byId
      : null;
  if (byId === null) return [];

  const rows: { row: AttentionRow; updatedAt: number }[] = [];
  for (const id of Object.keys(byId)) {
    const summary = byId[id];
    if (summary === null || summary === undefined) continue;
    const kind = attentionKindOf(summary.pendingInteraction);
    if (kind === null) continue;
    const title =
      typeof summary.displayTitle === "string" && summary.displayTitle !== ""
        ? summary.displayTitle
        : typeof summary.title === "string" && summary.title !== ""
          ? summary.title
          : id;
    rows.push({
      row: {
        key: id,
        sessionId: id,
        kind,
        title,
        workspace: workspaceLabelOf(summary.cwd),
        local: id === currentSessionId,
      },
      updatedAt: typeof summary.updatedAt === "number" ? summary.updatedAt : 0,
    });
  }

  rows.sort((a, b) => {
    if (a.row.local !== b.row.local) return a.row.local ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });
  return rows.map((entry) => entry.row);
}

/**
 * Whether the composer highlight should reflect something OUTSIDE this
 * session.
 *
 * Deliberately separate from the row list: #103 requires that a local ask be
 * "distinguishable at a glance from a remote one", and that the #38 question
 * rings keep counting QUESTIONS on this session and are never inflated by
 * the cross-workspace signal. Keeping the remote signal as its own boolean
 * means the component cannot accidentally add remote sessions into a count
 * that promises to be local questions.
 */
export function hasRemoteAttention(rows: readonly AttentionRow[]): boolean {
  for (const row of rows) if (!row.local) return true;
  return false;
}

/** How many other sessions are waiting on a human. */
export function remoteAttentionCount(rows: readonly AttentionRow[]): number {
  let count = 0;
  for (const row of rows) if (!row.local) count += 1;
  return count;
}

/**
 * Whether a row can be jumped to.
 *
 * `sessions.open(id)` THROWS for an id absent from the client's session
 * summaries (dsh-client-runtime/lib/client.js:7867), so this is checked at
 * CLICK time against the live list rather than trusted from render time.
 * Rows are built from `byId`, so this is true at the moment of construction
 * — but a session can die between the render and the click, and a throw
 * inside a click handler on a load-bearing surface is exactly what must not
 * happen.
 */
export function isJumpable(list: any, sessionId: string): boolean {
  const byId =
    list !== null && list !== undefined && typeof list.byId === "object" && list.byId !== null
      ? list.byId
      : null;
  if (byId === null) return false;
  return Object.prototype.hasOwnProperty.call(byId, sessionId);
}
