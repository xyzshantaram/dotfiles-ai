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

// ---------------------------------------------------------------------------
// PART 2: the contribution surface (#103, phase 1 — local session).
//
// `createUserAttentionRequestSurface(id, displayName)` returns a surface and
// `surface.agentAskUser(component, props, checkExpiry)` contributes one item.
// One surface renders as one browser-style top-bar tab inside the
// pending-approvals modal, which owns keeping the tabs updated; a surface
// with no visible items renders no tab (empty tabs are hidden, not shown
// empty).
//
// WHERE THIS LIVES AND WHY NOT AS A CORDIS SERVICE (YET). Unknown C settled
// the seam as "a provided Cordis SERVICE, published by the #93 modal runtime
// plugin". That home is outside this ticket's allowlist (plugins/modal is
// untouchable here), and no second consumer exists yet — job-viewer migrates
// in a follow-up, not here. So Phase 1 keeps the store as a module singleton
// in the SAME bundle as its only consumers (the built-in approvals and
// questions below). Nothing crosses a bundle boundary, so no published
// global is invented either. Phase 2 wraps this same store in the provided
// service with no rewrite: the record already carries its workspace/session
// fields, and `getAttentionStore()` is the instance the service publishes.
//
// BODIES ARE CONTEXT-FREE BY CONTRACT. The #93 review found that React
// context does NOT cross the modal seam: bodies render in the host plugin's
// tree, so a body that relies on a caller-provided context silently loses
// it. A contributed body must carry everything it needs through `props` —
// including the settle handle, which the shell injects as the documented
// `ask` prop (surface-provided, not contributor-smuggled callbacks: the
// contributor never passes callbacks in, so the surface can always settle an
// item without the contributor's cooperation).
// ---------------------------------------------------------------------------

/** One button the shell renders into a card's actions row. Data, not a callback. */
export interface AskActionDecl {
  /** Stable id; handed back through the handle when the user picks it. */
  id: string;
  /** Button label, e.g. "Approve". */
  label: string;
  /** Visual tone from the bundle's button language. Defaults to "neutral". */
  tone?: "approve" | "reject" | "neutral";
  /**
   * When present the action arms first: the first click shows this label
   * (e.g. "Confirm reject") and only a second click within the shell's
   * confirm window settles. Destructive actions should set it.
   */
  confirmLabel?: string;
}

/**
 * Props for a contributed ask. The shell reads the documented fields for
 * card chrome; every other field passes through untouched to the body.
 */
export interface AskProps {
  /** Card title line. Defaults to the surface's display name. */
  title?: string;
  /** Optional second line under the title, e.g. a reason or question text. */
  detail?: string | null;
  /**
   * The running tool call's card to jump to, or null/undefined when there is
   * none. A present callId gives the card a shell-owned Jump button; the
   * body never implements jumping itself.
   */
  callId?: string | null;
  /** Action buttons for the shell-owned actions row (data, see AskActionDecl). */
  actions?: AskActionDecl[];
  [key: string]: unknown;
}

/**
 * Expiry check for one ask.
 *
 * CALLED REPEATEDLY BY A UI THAT RE-RENDERS, so it MUST BE CHEAP AND
 * SIDE-EFFECT FREE: no IO, no store writes, no network — a pure read of
 * already-held state. A contributor cannot infer this, so it is stated here
 * rather than left to convention.
 *
 * Return `false` when the ask is definitely over (the shell removes the
 * item); `true` when it is definitely still live; `null`/`undefined` when it
 * cannot decide. A check that THROWS or cannot decide KEEPS the item visible
 * (marked unverifiable, with a manual removal button) rather than removing
 * it: a shown stale ask costs a confused click, while a hidden live ask
 * strands an agent forever with nobody knowing.
 */
export type CheckExpiry = () => boolean | null | undefined;

/** How an ask settled. The promise NEVER rejects: cancel fulfils as cancelled. */
export type AskSettlement =
  | { via: "resolved"; outcome: unknown }
  | { via: "cancelled"; reason: string };

/**
 * The settle handle for one ask: a HANDLE carrying resolve/cancel, PLUS a
 * promise (owner decision 2026-09-09). An ask that cannot be ANSWERED is only
 * a notification, so the caller holds this: `resolve` delivers the outcome
 * and drops the item, `cancel` drops it without an outcome, and `promise`
 * lets the caller receive either. Both are idempotent — the first call wins,
 * later calls are ignored — so dismissal, disposal and answering cannot race.
 */
export interface AskHandle {
  /** Stable key of the item; unique within its surface. */
  key: string;
  /** The surface this ask belongs to. */
  surfaceId: string;
  /** Fulfils with the settlement; never rejects. */
  promise: Promise<AskSettlement>;
  /** The user answered (or the producer settled): deliver outcome, drop item. */
  resolve(outcome: unknown): void;
  /** Drop the item without an outcome (dismissal, disposal, settled elsewhere). */
  cancel(reason?: string): void;
}

/** One contributed ask as the store holds it. */
export interface AttentionItem {
  key: string;
  surfaceId: string;
  /** The contributed body component; rendered INSIDE the card, owning only its content. */
  component: unknown;
  props: AskProps;
  checkExpiry?: CheckExpiry | null;
  addedAt: number;
}

/** What the modal lists: a surface's identity plus attribution for Phase 2. */
export interface AttentionSurfaceRecord {
  id: string;
  displayName: string;
  /** Workspace label; null when unattributed. Carried now so Phase 2 needs no rewrite. */
  workspace: string | null;
  /** Owning session; null when unattributed. Carried now so Phase 2 needs no rewrite. */
  sessionId: string | null;
}

/** A surface: one plugin's tab. Disposal removes the tab AND its items. */
export interface AttentionSurface extends AttentionSurfaceRecord {
  agentAskUser(component: unknown, props: AskProps, checkExpiry?: CheckExpiry | null): AskHandle;
  /**
   * Dispose the surface: its tab and every outstanding item go with it, so
   * no orphan tab survives that nothing can answer. Outstanding handles
   * settle as cancelled. Called by contributors in their own effect cleanup;
   * the shell also sweeps surfaces whose session died.
   */
  dispose(): void;
}

/** Optional attribution carried on the surface record for Phase 2. */
export interface AttentionSurfaceOpts {
  workspace?: string | null;
  sessionId?: string | null;
}

/** One tab the modal renders: a surface with its currently visible items. */
export interface AttentionTab {
  surface: AttentionSurfaceRecord;
  items: AttentionItem[];
}

/** Immutable snapshot the modal subscribes to; rebuilt only on change. */
export interface AttentionSnapshot {
  surfaces: AttentionTab[];
}

/** The store behind the surface API. Factory (not singleton) so tests isolate. */
export interface AttentionStore {
  createUserAttentionRequestSurface(
    id: string,
    displayName: string,
    opts?: AttentionSurfaceOpts,
  ): AttentionSurface;
  /** Settle an item with an outcome and drop it. Unknown keys are ignored. */
  resolveItem(key: string, outcome: unknown): void;
  /** Drop an item without an outcome. Unknown keys are ignored. */
  cancelItem(key: string, reason?: string): void;
  /** Manual removal: cancel ("removed-by-user") and drop. Unknown keys ignored. */
  removeItem(key: string): void;
  /** Dispose a surface: tab plus outstanding items, handles settle cancelled. */
  disposeSurface(id: string): void;
  /** Reap surfaces whose session is gone: no permanent ghost in another tab. */
  sweepDeadSessions(liveSessionIds: readonly string[]): void;
  /** Current snapshot; STABLE reference until something changes. */
  getSnapshot(): AttentionSnapshot;
  /** Subscribe; returns the unsubscribe disposer. */
  subscribe(listener: () => void): () => void;
}

let surfaceSeq = 0;
let itemSeq = 0;

/** A fresh, isolated store. The live one is `getAttentionStore()`. */
export function createAttentionStore(): AttentionStore {
  const surfaces = new Map<string, AttentionSurfaceRecord>();
  const items = new Map<string, AttentionItem>();
  const waiters = new Map<string, (settlement: AskSettlement) => void>();
  const listeners = new Set<() => void>();
  let snapshot: AttentionSnapshot = { surfaces: [] };

  function emit(): void {
    const tabs: AttentionTab[] = [];
    for (const surface of surfaces.values()) {
      const owned: AttentionItem[] = [];
      for (const item of items.values()) {
        if (item.surfaceId === surface.id) owned.push(item);
      }
      owned.sort((a, b) => a.addedAt - b.addedAt);
      tabs.push({ surface, items: owned });
    }
    snapshot = { surfaces: tabs };
    for (const listener of listeners) {
      // One bad subscriber must not stop the others on a load-bearing path.
      try {
        listener();
      } catch (error) {
        console.error("[attention] subscriber threw:", error);
      }
    }
  }

  function settle(key: string, settlement: AskSettlement): void {
    const waiter = waiters.get(key);
    if (waiter === undefined) return; // already settled: first call wins
    waiters.delete(key);
    items.delete(key);
    emit();
    waiter(settlement);
  }

  function ask(
    surfaceId: string,
    component: unknown,
    props: AskProps,
    checkExpiry?: CheckExpiry | null,
  ): AskHandle {
    if (!surfaces.has(surfaceId)) {
      throw new Error("[attention] agentAskUser on a disposed or unknown surface: " + surfaceId);
    }
    itemSeq += 1;
    const key = surfaceId + ":" + String(itemSeq);
    const item: AttentionItem = {
      key,
      surfaceId,
      component,
      props: props === undefined || props === null ? {} : props,
      checkExpiry: checkExpiry === undefined ? null : checkExpiry,
      addedAt: Date.now(),
    };
    let waiter: ((settlement: AskSettlement) => void) | null = null;
    const promise = new Promise<AskSettlement>((fulfil) => {
      waiter = fulfil;
    });
    // Avoid an unhandled rejection ever surfacing if a caller attaches late;
    // the promise never rejects, but a fulfil with no consumer is silence
    // either way, so no catch needed.
    waiters.set(key, waiter as (settlement: AskSettlement) => void);
    items.set(key, item);
    emit();
    return {
      key,
      surfaceId,
      promise,
      resolve(outcome: unknown): void {
        settle(key, { via: "resolved", outcome });
      },
      cancel(reason?: string): void {
        settle(key, { via: "cancelled", reason: reason === undefined ? "cancelled" : reason });
      },
    };
  }

  const store: AttentionStore = {
    createUserAttentionRequestSurface(
      id: string,
      displayName: string,
      opts?: AttentionSurfaceOpts,
    ): AttentionSurface {
      let surfaceId = typeof id === "string" ? id : "";
      if (surfaceId === "") {
        surfaceSeq += 1;
        surfaceId = "surface-" + String(surfaceSeq);
      }
      if (surfaces.has(surfaceId)) {
        throw new Error("[attention] duplicate surface id: " + surfaceId);
      }
      const record: AttentionSurfaceRecord = {
        id: surfaceId,
        displayName,
        workspace:
          opts !== undefined && opts !== null && typeof opts.workspace === "string"
            ? opts.workspace
            : null,
        sessionId:
          opts !== undefined && opts !== null && typeof opts.sessionId === "string"
            ? opts.sessionId
            : null,
      };
      surfaces.set(surfaceId, record);
      emit();
      return {
        ...record,
        agentAskUser(component: unknown, props: AskProps, checkExpiry?: CheckExpiry | null) {
          return ask(surfaceId, component, props, checkExpiry);
        },
        dispose(): void {
          store.disposeSurface(surfaceId);
        },
      };
    },

    resolveItem(key: string, outcome: unknown): void {
      settle(key, { via: "resolved", outcome });
    },

    cancelItem(key: string, reason?: string): void {
      settle(key, { via: "cancelled", reason: reason === undefined ? "cancelled" : reason });
    },

    removeItem(key: string): void {
      // Manual removal takes the ITEM, never the surface: a contributor whose
      // checkExpiry is broken keeps working for its other items.
      settle(key, { via: "cancelled", reason: "removed-by-user" });
    },

    disposeSurface(id: string): void {
      if (!surfaces.has(id)) return;
      for (const item of Array.from(items.values())) {
        if (item.surfaceId === id) {
          const waiter = waiters.get(item.key);
          if (waiter !== undefined) {
            waiters.delete(item.key);
            items.delete(item.key);
            waiter({ via: "cancelled", reason: "surface-disposed" });
          } else {
            items.delete(item.key);
          }
        }
      }
      surfaces.delete(id);
      emit();
    },

    sweepDeadSessions(liveSessionIds: readonly string[]): void {
      const live = new Set<string>();
      for (const id of liveSessionIds) live.add(id);
      for (const surface of Array.from(surfaces.values())) {
        // Only attributed surfaces participate: an unattributed surface is
        // local to its own mount, which disposes it on unmount.
        if (surface.sessionId !== null && !live.has(surface.sessionId)) {
          store.disposeSurface(surface.id);
        }
      }
    },

    getSnapshot(): AttentionSnapshot {
      return snapshot;
    },

    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return store;
}

let sharedStore: AttentionStore | null = null;

/**
 * The live store: one per bundle, shared by every surface in it. Phase 2
 * publishes this same instance as the provided Cordis service.
 */
export function getAttentionStore(): AttentionStore {
  if (sharedStore === null) sharedStore = createAttentionStore();
  return sharedStore;
}

/** What `evaluateItemExpiry` concluded. */
export type ExpiryVerdict = "live" | "expired" | "unverifiable";

/**
 * Evaluate one item's `checkExpiry` WITHOUT touching the store: cheap,
 * side-effect free, and itself never throwing.
 *
 * - `false` → "expired": the ask is definitely over; the UI drops the item.
 * - `true`, or no check declared → "live".
 * - a check that THROWS, is not a function, or returns anything else
 *   ("cannot decide") → "unverifiable": the item STAYS VISIBLE with an
 *   unverifiable mark plus a manual removal button. A hidden live ask
 *   strands an agent; a shown stale ask costs a click.
 */
export function evaluateItemExpiry(item: {
  checkExpiry?: CheckExpiry | null;
}): ExpiryVerdict {
  const fn = item.checkExpiry;
  if (fn === undefined || fn === null) return "live";
  let verdict: unknown;
  try {
    verdict = (fn as CheckExpiry)();
  } catch {
    return "unverifiable";
  }
  if (verdict === false) return "expired";
  if (verdict === true) return "live";
  return "unverifiable";
}

/**
 * Tabs the modal renders for one session: that session's surfaces that
 * currently hold at least one item. EMPTY TABS ARE HIDDEN, not shown empty.
 *
 * Phase 1 is LOCAL SESSION ONLY: only surfaces attributed to `sessionId`
 * (plus unattributed ones, which are local to their own mount) are listed.
 * Cross-session aggregation is Phase 2; the record already carries the
 * fields it needs, so this filter is the only thing Phase 2 widens.
 */
export function visibleTabsOf(
  snapshot: AttentionSnapshot,
  sessionId: string | null,
): AttentionTab[] {
  if (snapshot === null || snapshot === undefined || !Array.isArray(snapshot.surfaces)) return [];
  const tabs: AttentionTab[] = [];
  for (const tab of snapshot.surfaces) {
    if (tab === null || tab === undefined) continue;
    const surface = tab.surface;
    if (surface === null || surface === undefined) continue;
    if (surface.sessionId !== null && surface.sessionId !== sessionId) continue;
    if (!Array.isArray(tab.items) || tab.items.length === 0) continue;
    tabs.push(tab);
  }
  return tabs;
}

/**
 * The fallback descriptor the shell's error boundary renders when a
 * contributed body throws. Data, so the contract is testable without a DOM:
 * the placeholder NAMES the offending surface and never blanks the tab, the
 * modal, or the approvals list around it.
 */
export function bodyFallbackFor(surfaceDisplayName: string): { surface: string; message: string } {
  const name =
    typeof surfaceDisplayName === "string" && surfaceDisplayName !== ""
      ? surfaceDisplayName
      : "an attention surface";
  return {
    surface: name,
    message: "Something in \u201c" + name + "\u201d failed to render. The ask is still pending.",
  };
}
