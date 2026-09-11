// Client half of the composer-approvals indicator.
//
// A small badge sits immediately right of the composer overflow trigger
// whenever the session has at least one pending approval or pending
// ask_user_question batch (#135 colours it by kind; questions never inflate
// approval tones). Clicking it opens the ATTENTION SURFACE: a modal with one
// browser-style top-bar tab per contributing surface. The built-in approvals
// and question asks are the first CONSUMERS of that API (#103) — they render
// through the same card shell as any future contributor, so relocating the
// whole surface later is a change in one place.
//
// SHELL VS BODY. The shell is ours: tab, card chrome, title,
// workspace/session attribution, the actions row, spacing and dismissal — a
// contributor cannot restyle these, which is what keeps cards uniform. The
// body is theirs: the contributed component renders INSIDE the standardized
// card and owns only its content. Bodies are CONTEXT-FREE BY CONTRACT (React
// context does not cross the modal seam): everything a body needs arrives
// through props, including the settle handle the shell injects as `ask`.
//
// Rows that carry a callId get a shell-owned jump action that scrolls the
// conversation to that tool call's card (found through tool-render's
// data-call-id attribute), which is the single answer surface for those
// items. Approval rows WITHOUT a callId answer through the shell's actions
// row with approve/reject buttons (reject arms first); question rows NEVER
// answer in place (the card is their only surface), so a question row without
// a running card shows a disabled jump. The indicator disappears once every
// pending is answered.
//
// The same component drives the composer BADGE (#135): tone by pending kind
// (blue rewrite / yellow escalation / neutral question, priority rule in
// ./badge), count across every pending kind, and #106's hold-then-fade
// confirmation window after the last answer — an answered batch holds just
// long enough to confirm the answer registered, then fades out and leaves
// nothing behind. The composer RING this file used to paint is deliberately
// gone; ./questions keeps only the timing constants and the row/question
// plumbing that survived the deletion.
// The modal it opens is now the ATTENTION SURFACE (#103 Phase 1): tabbed,
// with the built-in approvals and questions migrated onto it through
// agentAskUser like any other contributing surface.
import * as react from "react";
import * as runtime from "@deepseek-ai/dsh-client-runtime/client";
import { injectStyle } from "../../shared/client-util";
import { PluginModal } from "../../shared/plugin-modal";
import { composerRingPaint, questionModalRowsOf, ringInputsOf } from "./questions";
import { badgeCount, badgeToneOf, badgeVisible } from "./badge";
import { initialRingFade, RING_FADE_HOLD_MS, RING_FADE_MS } from "./questions";
import type { QuestionModalRow } from "./questions";
import {
  bodyFallbackFor,
  evaluateItemExpiry,
  getAttentionStore,
  visibleTabsOf,
} from "./attention";
import type {
  AskActionDecl,
  AskHandle,
  AskProps,
  AttentionItem,
  AttentionStore,
  AttentionSurface,
  AttentionTab,
} from "./attention";import localCss from "./client.module.css";

var conversationContextKey = runtime.conversationContextKey;

var PLUGIN_NAME = "composer-approvals";

/** Built-in surface ids (per mount; see useBuiltInSurfaces). */
var APPROVALS_BASE_ID = "composer-approvals:approvals";
var QUESTIONS_BASE_ID = "composer-approvals:questions";

var EMPTY: ReadonlyArray<any> = [];

/** How long an armed reject stays confirmable before it resets itself. */
var REJECT_ARM_RESET_MS = 4000;

/** Mount sequence so every composer mount owns distinct surface ids. */
var mountSeq = 0;

/**
 * Read one root Tool lifecycle through the conversation snapshot index.
 * A callId may point at a subcall, so resolve to the root before asking it
 * for a label. Always returns `undefined` for "not present".
 */
function rootToolCall(snapshot: any, callId: string) {
  var node = snapshot.chat && snapshot.chat.nodes.get(conversationContextKey("tool-call", callId));
  if (node === undefined || node === null) return undefined;
  var root = node.data && node.data.root;
  if (root === undefined || root === null) return undefined;
  return root;
}

/**
 * Extract the shell command from an approval's paired running call.
 * Never throws.
 */
function commandOf(call: any): string | undefined {
  if (call === undefined) return undefined;
  try {
    var args = JSON.parse(call.argsRaw);
    return typeof args.command === "string" ? args.command : undefined;
  } catch {
    return undefined;
  }
}

/** First line of a free-text reason, or null when there is nothing to show. */
function firstLineOf(text: unknown): string | null {
  if (typeof text !== "string") return null;
  var line = text.split("\n", 1)[0].trim();
  return line === "" ? null : line;
}

/**
 * One plain-data row of the modal. The live pending objects must never
 * reach React state (they are session-owned), so the selector rebuilds
 * this summary only when the pending set actually changes.
 */
interface ApprovalRow {
  key: string;
  kind: "approval";
  callId: string | null;
  approvalId: unknown;
  label: string;
}

/** A modal row for a pending question batch: jump-only, never in place. */
interface ModalQuestionRow extends QuestionModalRow {
  kind: "question";
}

type ModalRow = ApprovalRow | ModalQuestionRow;

/**
 * Build the selector once per component so its memo cell is not shared
 * across sessions. The selector returns a STABLE array: it is rebuilt only
 * when the key+callId signature changes, which keeps the
 * useSyncExternalStoreWithSelector-based useSession from looping.
 *
 * The selector also refreshes a key→pending map of the live objects. The
 * rows never carry them (session-owned), but a click needs the current
 * pending's `respond`, so the map is the click-time lookup.
 */
function makeSelector() {
  var lastSig = "\u0000";
  var lastRows: ApprovalRow[] = EMPTY as ApprovalRow[];
  var pendingByKey = new Map<string, any>();
  var selectApprovals = function (snapshot: any): ApprovalRow[] {
    var pending =
      snapshot !== null && snapshot !== undefined && Array.isArray(snapshot.pending)
        ? snapshot.pending
        : EMPTY;
    var parts: string[] = [];
    var rows: ApprovalRow[] = [];
    var live = new Set<string>();
    for (var i = 0; i < pending.length; i++) {
      var item = pending[i];
      if (item === null || item === undefined || item.kind !== "approval") continue;
      var payload = (item !== null && item.payload) || {};
      var callId = typeof payload.callId === "string" ? payload.callId : null;
      var label: string | null = null;
      if (callId !== null) {
        label = commandOf(rootToolCall(snapshot, callId)) ?? null;
      }
      if (label === null) label = firstLineOf(payload.reason);
      var key = String(item.key);
      // The label rides the signature too: argsRaw can stream in after the
      // approval frame, so a key+callId-only memo would freeze a stale label.
      parts.push(key + "\u0000" + (callId === null ? "" : callId) + "\u0000" + label);
      live.add(key);
      pendingByKey.set(key, item);
      rows.push({
        key: key,
        kind: "approval",
        callId: callId,
        approvalId: payload.approvalId,
        label: label === null ? "Approval" : label,
      });
    }
    for (var key of Array.from(pendingByKey.keys())) {
      if (!live.has(key)) pendingByKey.delete(key);
    }
    var sig = parts.join("\u0001");
    if (sig === lastSig) return lastRows;
    lastSig = sig;
    lastRows = rows;
    return rows;
  };
  return {
    selectApprovals: selectApprovals,
    pendingOf: function (key: string): any {
      return pendingByKey.get(key);
    },
  };
}

/**
 * Question selector twin of makeSelector: one stable value per component
 * holding the jump rows plus the composer ring inputs. Rebuilt only when
 * the row signature or either count changes, same no-loop contract.
 */
interface QuestionInputs {
  rows: ModalQuestionRow[];
  pending: number;
  answered: number;
}

function makeQuestionSelector() {
  var lastSig = "\u0000";
  var lastValue: QuestionInputs = { rows: EMPTY as ModalQuestionRow[], pending: 0, answered: 0 };
  var selectQuestions = function (snapshot: any): QuestionInputs {
    var rows = questionModalRowsOf(snapshot).map(function (row) {
      return { kind: "question" as const, key: row.key, callId: row.callId, label: row.label };
    });
    var inputs = ringInputsOf(snapshot);
    var sig =
      inputs.pending +
      "\u0000" +
      inputs.answered +
      "\u0000" +
      rows
        .map(function (row) {
          return (
            row.key + "\u0000" + (row.callId === null ? "" : row.callId) + "\u0000" + row.label
          );
        })
        .join("\u0001");
    if (sig === lastSig) return lastValue;
    lastSig = sig;
    lastValue = { rows: rows, pending: inputs.pending, answered: inputs.answered };
    return lastValue;
  };
  return { selectQuestions: selectQuestions };
}

/** Find the tool-render card for one callId, or null when it is not mounted. */
function cardOf(callId: string): HTMLElement | null {
  return document.querySelector('.tool-render-card[data-call-id="' + CSS.escape(callId) + '"]');
}

/**
 * Answer one live approval pending. Mirrors the pre-surface behaviour
 * exactly: resolve through `respond`, check the receipt, and THROW on
 * anything but an acceptance — the caller decides whether the item returns
 * to the tab. `respond` itself throws synchronously once the wait was
 * settled elsewhere; that propagates as a failure too.
 */
function respondToApproval(pending: any, outcome: string): Promise<void> {
  return Promise.resolve(
    pending.respond({
      ok: true,
      value: {
        sessionId: pending.sessionId,
        approvalId: pending.payload.approvalId,
        outcome: outcome,
      },
    }),
  ).then(function (receipt: any) {
    if (receipt === undefined || receipt === null || !receipt.accepted) {
      throw new Error(
        "approval response rejected: " +
          (receipt === undefined || receipt === null || receipt.reason === undefined
            ? "unknown"
            : receipt.reason),
      );
    }
  });
}

/**
 * The isolation boundary: EVERY contributed body renders inside one of
 * these, keyed per item, so a throwing body degrades to the placeholder
 * below — naming its surface — and can never blank the tab, the modal, or
 * the approvals list. The tab bar, the modal chrome and the sibling cards
 * all render OUTSIDE any boundary.
 *
 * Props: { component, bodyProps, ask, surfaceName, itemKey }.
 */
class SafeItemBody extends react.Component {
  props: any;
  state: any;
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: unknown) {
    return { error: error };
  }
  componentDidCatch(error: unknown) {
    console.error("[composer-approvals] attention body threw:", this.props.surfaceName, error);
  }
  render() {
    if (this.state.error !== null && this.state.error !== undefined) {
      var fallback = bodyFallbackFor(this.props.surfaceName);
      return (
        <div
          className="composer-approvals-fallback"
          data-surface={fallback.surface}
          role="note"
        >
          <span className="composer-approvals-fallback-text">{fallback.message}</span>
        </div>
      );
    }
    var bodyProps = this.props.bodyProps || {};
    var merged: any = {};
    for (var key in bodyProps) {
      if (Object.prototype.hasOwnProperty.call(bodyProps, key)) merged[key] = bodyProps[key];
    }
    // The settle handle is SURFACE-PROVIDED, not contributor-smuggled: the
    // contributor never passes callbacks in `props`, so the surface can
    // always settle without the contributor's cooperation (dismissal,
    // disposal, settled elsewhere).
    merged.ask = this.props.ask;
    return react.createElement(this.props.component, merged);
  }
}

/**
 * Built-in approval body: the full detail the card title truncates.
 * Context-free — everything arrives through props.
 */
function ApprovalBody(props: any) {
  var detail = typeof props.detail === "string" && props.detail !== "" ? props.detail : null;
  return (
    <div className="composer-approvals-detail">
      {detail === null ? (
        <span className="composer-approvals-detail-empty">Waiting on your answer.</span>
      ) : (
        <span className="composer-approvals-detail-text" title={detail}>
          {detail}
        </span>
      )}
    </div>
  );
}

/**
 * Built-in question body: the full question text the card title truncates.
 * Context-free — everything arrives through props. Never answers in place:
 * the running card is the single answer surface, so this body carries no
 * actions at all.
 */
function QuestionBody(props: any) {
  var detail = typeof props.detail === "string" && props.detail !== "" ? props.detail : null;
  return (
    <div className="composer-approvals-detail">
      {detail === null ? (
        <span className="composer-approvals-detail-empty">Answer on the running card.</span>
      ) : (
        <span className="composer-approvals-detail-text" title={detail}>
          {detail}
        </span>
      )}
    </div>
  );
}

/**
 * One card in the shell's chrome. The shell owns everything here EXCEPT the
 * body: header (kind chip + title), attribution, the actions row and
 * dismissal. A contributor cannot restyle any of it.
 *
 * Props: { item, surfaceName, sessionLabel, jumpable, onJump, store }.
 */
function AttentionCard(props: any) {
  var item = props.item as AttentionItem;
  var bodyProps = item.props as AskProps;
  var armedState = react.useState(false);
  var armed = armedState[0];
  var setArmed = armedState[1];
  var answeredState = react.useState(false);
  var answered = answeredState[0];
  var setAnswered = answeredState[1];
  var armTimer = react.useRef(0);
  react.useEffect(function () {
    return function () {
      if (armTimer.current !== 0) window.clearTimeout(armTimer.current);
    };
  }, []);

  // checkExpiry is render-driven and side-effect free by contract; the
  // REMOVAL below is the shell's explicit effect, not the check's.
  var verdict = evaluateItemExpiry(item);
  react.useEffect(
    function () {
      if (verdict === "expired") {
        (props.store as AttentionStore).removeItem(item.key);
      }
      return undefined;
    },
    [verdict, item.key, props.store],
  );

  var settle = function (outcome: unknown) {
    if (answered) return;
    setAnswered(true);
    (props.store as AttentionStore).resolveItem(item.key, outcome);
  };

  var clearArm = function () {
    if (armTimer.current !== 0) {
      window.clearTimeout(armTimer.current);
      armTimer.current = 0;
    }
  };
  var onAction = function (action: AskActionDecl) {
    if (answered) return;
    if (action.confirmLabel !== undefined && action.confirmLabel !== "") {
      // Destructive actions arm first: the first click shows the confirm
      // label, only a second click within the window settles.
      if (!armed) {
        setArmed(true);
        clearArm();
        armTimer.current = window.setTimeout(function () {
          armTimer.current = 0;
          setArmed(false);
        }, REJECT_ARM_RESET_MS);
        return;
      }
      clearArm();
      setArmed(false);
    }
    settle(action.id);
  };

  var kind = bodyProps.kind;
  var kindLabel = kind === "approval" ? "Approval" : kind === "question" ? "Question" : null;
  var title =
    typeof bodyProps.title === "string" && bodyProps.title !== ""
      ? bodyProps.title
      : props.surfaceName;
  var callId = typeof bodyProps.callId === "string" ? bodyProps.callId : null;
  var actions: AskActionDecl[] = Array.isArray(bodyProps.actions) ? bodyProps.actions : [];

  var actionButtons = actions.map(function (action) {
    var tone = action.tone === "approve" ? "approve" : action.tone === "reject" ? "reject" : "jump";
    var className =
      tone === "approve"
        ? "composer-approvals-approve"
        : tone === "reject"
          ? "composer-approvals-reject"
          : "composer-approvals-jump";
    var isArmed = tone === "reject" && armed;
    return (
      <button
        key={action.id}
        type="button"
        className={className}
        data-armed={isArmed || undefined}
        disabled={answered}
        onClick={function () {
          onAction(action);
        }}
      >
        {isArmed && action.confirmLabel ? action.confirmLabel : action.label}
      </button>
    );
  });

  return (
    <li
      className="composer-approvals-card"
      data-kind={typeof kind === "string" ? kind : undefined}
      data-unverifiable={verdict === "unverifiable" ? "1" : undefined}
    >
      <div className="composer-approvals-card-head">
        {kindLabel === null ? null : (
          <span className="composer-approvals-kind">{kindLabel}</span>
        )}
        <span className="composer-approvals-title" title={title}>
          {title}
        </span>
      </div>
      <div className="composer-approvals-attr">{props.sessionLabel}</div>
      {verdict === "unverifiable" ? (
        <div className="composer-approvals-unverifiable" role="note">
          <span>
            Could not verify whether this ask is still live, so it stays visible — a hidden live
            ask would strand an agent.
          </span>
          <button
            type="button"
            className="composer-approvals-jump"
            onClick={function () {
              // Manual removal takes the ITEM, never the surface.
              (props.store as AttentionStore).removeItem(item.key);
            }}
          >
            Remove
          </button>
        </div>
      ) : null}
      <div className="composer-approvals-body">
        <SafeItemBody
          key={item.key}
          component={item.component}
          bodyProps={bodyProps}
          ask={props.askOf(item.key)}
          surfaceName={props.surfaceName}
          itemKey={item.key}
        />
      </div>
      <div className="composer-approvals-actions">
        {callId === null ? (
          actions.length === 0 ? (
            <span className="composer-approvals-no-call">no tool call</span>
          ) : null
        ) : (
          <button
            type="button"
            className="composer-approvals-jump"
            disabled={!props.jumpable}
            onClick={function () {
              props.onJump(item.key, callId);
            }}
          >
            Jump to call
          </button>
        )}
        {actionButtons}
      </div>
    </li>
  );
}

/**
 * The tabbed surface: one browser-style top-bar tab per surface with
 * visible items. EMPTY TABS ARE HIDDEN, not shown empty; with a single
 * visible tab the bar itself stays hidden. The modal owns keeping the tabs
 * updated through the store subscription.
 *
 * Props: { sessionId, sessionLabel, jumpableOf, onJump, handlesOf, store }.
 */
function AttentionModal(props: any) {
  var store = props.store as AttentionStore;
  var snapshot = react.useSyncExternalStore(store.subscribe, store.getSnapshot);
  var tabs: AttentionTab[] = visibleTabsOf(snapshot, props.sessionId);
  var activeState = react.useState(null as string | null);
  var activeId = activeState[0];
  var setActiveId = activeState[1];

  var active =
    tabs.length === 0
      ? null
      : tabs.find(function (tab) {
          return tab.surface.id === activeId;
        }) || tabs[0];

  var bar =
    tabs.length < 2 ? null : (
      <div className="composer-approvals-tabs" role="tablist">
        {tabs.map(function (tab) {
          var selected = active !== null && tab.surface.id === active.surface.id;
          return (
            <button
              key={tab.surface.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className="composer-approvals-tab"
              data-active={selected || undefined}
              onClick={function () {
                setActiveId(tab.surface.id);
              }}
            >
              <span className="composer-approvals-tab-name">{tab.surface.displayName}</span>
              {tab.items.length > 1 ? (
                <span className="composer-approvals-tab-count" aria-hidden={true}>
                  {tab.items.length}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    );

  return (
    <>
      {bar}
      {active === null ? null : (
        <ul className="composer-approvals-list">
          {active.items.map(function (item) {
            return (
              <AttentionCard
                key={item.key}
                item={item}
                surfaceName={active.surface.displayName}
                sessionLabel={props.sessionLabel}
                jumpable={props.jumpableOf(item)}
                onJump={props.onJump}
                askOf={props.handlesOf}
                store={store}
              />
            );
          })}
        </ul>
      )}
    </>
  );
}

/**
 * Migrate the built-ins through the surface door. Each composer mount owns
 * two surfaces (Approvals, Questions) attributed to its session; a snapshot
 * effect reconciles the live pendings against the surfaces' items — adding
 * new asks through agentAskUser, cancelling items whose pending vanished
 * (answered elsewhere, so WITHOUT responding), and disposing everything on
 * unmount so no orphan tab survives.
 *
 * The handle proves the return-value decision: the reconciler holds each
 * ask's handle, and its `resolve` continuation performs the actual
 * `respond`. A `cancel` settlement means "do not respond". If the respond
 * FAILS, the item is re-asked while its pending is still live, so a failed
 * answer returns to the tab instead of vanishing silently.
 */
/** Per-mount ownership: two surfaces plus this mount's handle maps. */
interface BuiltInSurfacesBox {
  approvals: AttentionSurface;
  questions: AttentionSurface;
  approvalHandles: Map<string, AskHandle>;
  questionHandles: Map<string, AskHandle>;
  /** Item key → handle, so the shell can inject `ask` into body props. */
  handlesByItem: Map<string, AskHandle>;
}

function useBuiltInSurfaces(  sessionId: string | null,
  approvalRows: ApprovalRow[],
  questionRows: ModalQuestionRow[],
  pendingOf: (key: string) => any,
) {
  var store = getAttentionStore();
  var box = react.useRef(null as BuiltInSurfacesBox | null);
  if (box.current === null) {
    mountSeq += 1;
    var suffix = String(mountSeq);
    var attributed = sessionId;
    box.current = {
      approvals: store.createUserAttentionRequestSurface(APPROVALS_BASE_ID + ":" + suffix, "Approvals", {
        sessionId: attributed,
      }),
      questions: store.createUserAttentionRequestSurface(QUESTIONS_BASE_ID + ":" + suffix, "Questions", {
        sessionId: attributed,
      }),
      approvalHandles: new Map<string, AskHandle>(),
      questionHandles: new Map<string, AskHandle>(),
      handlesByItem: new Map<string, AskHandle>(),
    };
  }
  react.useEffect(function () {
    var owned: BuiltInSurfacesBox | null = box.current;
    if (owned === null) return undefined;
    return function () {
      // Unmount: cancel every outstanding handle this mount placed, then
      // dispose the surfaces — tab and items go together, no orphan tab.
      for (const handle of Array.from(owned.handlesByItem.values())) {
        handle.cancel("surface-unmounted");
      }
      owned.approvalHandles.clear();
      owned.questionHandles.clear();
      owned.handlesByItem.clear();
      owned.approvals.dispose();
      owned.questions.dispose();
      box.current = null;
    };
  }, []);

  react.useEffect(
    function () {
      var owned: BuiltInSurfacesBox | null = box.current;
      if (owned === null) return;
      var dropApproval = function (rowKey: string, handle: AskHandle) {
        if (owned.approvalHandles.get(rowKey) === handle) {
          owned.approvalHandles.delete(rowKey);
        }
        owned.handlesByItem.delete(handle.key);
      };
      var placeApproval = function (row: ApprovalRow) {
        if (owned.approvalHandles.has(row.key)) return;
        var live = pendingOf(row.key);
        if (live === undefined || live === null) return;
        var reason =
          live.payload === undefined || live.payload === null ? null : live.payload.reason;
        var reasonText =
          typeof reason === "string" && reason.trim() !== "" ? (reason as string) : null;
        var props: AskProps = {
          kind: "approval",
          title: row.label,
          detail: reasonText !== null ? reasonText : row.label !== "Approval" ? row.label : null,
          callId: row.callId,
          // Wire vocabulary: the host schema accepts "allowed-once" |
          // "rejected"; "approved" would be rejected as bad-response.
          // A no-callId row answers inline here; a callId row is
          // jump-only because the card's answer bar is the single answer
          // surface for it. There is deliberately NO comment field
          // (settled default): commenting lives on the card's answer bar.
          actions:
            row.callId !== null
              ? []
              : [
                  { id: "allowed-once", label: "✓ Approve", tone: "approve" },
                  {
                    id: "rejected",
                    label: "✗ Reject",
                    tone: "reject",
                    confirmLabel: "? Confirm reject",
                  },
                ],
        };
        var handle = owned.approvals.agentAskUser(ApprovalBody, props, function () {
          // Cheap and side-effect free: a pure read of the selector's
          // key→pending map. False only when the pending is truly gone.
          return pendingOf(row.key) !== undefined && pendingOf(row.key) !== null;
        });
        owned.approvalHandles.set(row.key, handle);
        owned.handlesByItem.set(handle.key, handle);
        handle.promise.then(function (settlement) {
          dropApproval(row.key, handle);
          if (settlement.via !== "resolved") return; // cancelled: do NOT respond
          // Click-time lookup, like the pre-surface row did: the selector's
          // map may hold a fresher live object than the one seen at ask
          // time, and answering must go to the current one.
          var current = pendingOf(row.key);
          var target = current === undefined || current === null ? live : current;
          respondToApproval(target, String(settlement.outcome)).catch(function (error: unknown) {
            console.warn("[composer-approvals] answer failed", row.key, settlement, error);
            // The answer did not land and the pending may still be live:
            // re-ask so the item returns to the tab with working buttons
            // instead of vanishing silently.
            if (box.current !== null && box.current === owned) {
              var stillLive = pendingOf(row.key);
              if (stillLive !== undefined && stillLive !== null) {
                placeApproval(row);
              }
            }
          });
        });
      };
      // --- approvals ---
      var liveApprovalKeys = new Set<string>();
      for (var i = 0; i < approvalRows.length; i++) {
        liveApprovalKeys.add(approvalRows[i].key);
        placeApproval(approvalRows[i]);
      }
      for (var key of Array.from(owned.approvalHandles.keys())) {
        if (!liveApprovalKeys.has(key)) {
          // Answered elsewhere (the card): drop WITHOUT responding.
          var stale = owned.approvalHandles.get(key);
          owned.approvalHandles.delete(key);
          if (stale !== undefined) {
            owned.handlesByItem.delete(stale.key);
            stale.cancel("settled-elsewhere");
          }
        }
      }
      // --- questions: jump-only, never in place ---
      var liveQuestionKeys = new Set<string>();
      for (var j = 0; j < questionRows.length; j++) {
        (function (row: ModalQuestionRow) {
          liveQuestionKeys.add(row.key);
          if (owned.questionHandles.has(row.key)) return;
          var handle = owned.questions.agentAskUser(
            QuestionBody,
            {
              kind: "question",
              title: row.label,
              detail: row.label,
              callId: row.callId,
              actions: [],
            },
            function () {
              return true; // presence is reconciled from the snapshot below
            },
          );
          owned.questionHandles.set(row.key, handle);
          owned.handlesByItem.set(handle.key, handle);
          handle.promise.then(function () {
            if (owned.questionHandles.get(row.key) === handle) {
              owned.questionHandles.delete(row.key);
            }
            owned.handlesByItem.delete(handle.key);
          });
        })(questionRows[j]);
      }
      for (var qkey of Array.from(owned.questionHandles.keys())) {
        if (!liveQuestionKeys.has(qkey)) {
          var qstale = owned.questionHandles.get(qkey);
          owned.questionHandles.delete(qkey);
          if (qstale !== undefined) {
            owned.handlesByItem.delete(qstale.key);
            qstale.cancel("settled-elsewhere");
          }
        }
      }
    },
    [approvalRows, questionRows, pendingOf],
  );

  return box;
}

function makeIndicator() {
  return function Indicator(props: any) {
    var selectorTools = react.useMemo(makeSelector, []);
    var approvalRows = props.useSession(selectorTools.selectApprovals);
    var questionTools = react.useMemo(makeQuestionSelector, []);
    var questionInputs = props.useSession(questionTools.selectQuestions);
    var openState = react.useState(false);
    var open = openState[0];
    var setOpen = openState[1];
    // callIds whose card was not found on click; their jump button disables.
    var missingState = react.useState(function () {
      return new Set<string>();
    });
    var missing = missingState[0];
    var setMissing = missingState[1];

    // Fade progress for the answered contribution. `faded` counts batches
    // whose band is fully gone; `zeroed` names the answered count dropped to
    // zero while the CSS transition animates it out. Pending counts never
    // enter this state — the bright width below is a pure function of the
    // live pending set, so no timer can ever touch a waiting question.
    //
    // SEEDED FROM THE FIRST SNAPSHOT, not from a constant. Questions answered
    // before this mount are history: their bands were already shown and faded
    // in whatever session answered them. Starting at faded: 0 would treat the
    // whole backlog as freshly answered, so merely OPENING a session painted a
    // band nobody had seen and animated it away — the fade replaying history
    // instead of confirming an answer (owner, 2026-09-09). Seeding marks that
    // backlog already faded, so the animation can only ever be caused by an
    // answer given while the composer is mounted. A question still PENDING at
    // mount is untouched by this: bright width reads the live pending set, so
    // an unanswered question is still marked the moment the session opens.
    var fadeState = react.useState(function () {
      return initialRingFade(questionInputs.answered);
    });
    var fade = fadeState[0];
    var setFade = fadeState[1];
    var paint = composerRingPaint(questionInputs.pending, questionInputs.answered, fade);

    // The answered contribution fades on a hold-then-drop cycle: one timeout
    // holds the confirmation band, a second waits out the CSS transition
    // before the marker is cleared. Keyed on the paint decision (not on the
    // raw counts), so a new answer mid-fade re-arms the hold instead of
    // joining a stale timer, while a new PENDING question changes only the
    // bright width and never disturbs the answered cycle.
    react.useEffect(
      function () {
        if (paint.next === null) return undefined;
        if (paint.next === "hold") {
          var answered = questionInputs.answered;
          var hold = window.setTimeout(function () {
            setFade(function (prev) {
              return prev.zeroed === answered ? prev : { faded: prev.faded, zeroed: answered };
            });
          }, RING_FADE_HOLD_MS);
          return function () {
            window.clearTimeout(hold);
          };
        }
        var seen = questionInputs.answered;
        var remove = window.setTimeout(function () {
          setFade({ faded: seen, zeroed: null });
        }, RING_FADE_MS);
        return function () {
          window.clearTimeout(remove);
        };
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [paint.next, questionInputs.answered, fade.faded, fade.zeroed],
    );

    /*
     * THE COMPOSER RING IS GONE (#135). This used to paint
     * `data-dsh-qrings` and three width properties onto
     * [data-composer-card]. Three fronts had accumulated there -- #38's
     * question rings, #65's approval rings, #106's hold-then-fade -- and
     * #132 then had to stop them MASKING each other, because two plugins
     * competed for one box-shadow property. The owner's call: drop the ring
     * entirely and colour the badge instead. That deletes the whole
     * cross-plugin custom-property contract rather than maintaining it.
     *
     * TOOL CALL CARDS ARE UNTOUCHED and must stay so. A card is a durable
     * RECORD of one call and its outline is that record's mark, so a record
     * that erases its own marks is not a record. The composer is a LIVE
     * CONTROL whose styling describes what you can do NOW, which is why its
     * state may fade. Do not "fix" a permanent card outline by fading it.
     *
     * `paint.ornament` survives as the CONFIRMATION WINDOW: it stays true
     * through #106's hold-then-fade after the last question is answered, so
     * the badge lingers briefly rather than vanishing mid-click. That intent
     * is preserved; only its rendering moved.
     */
    var approvalReasons: unknown[] = [];
    for (var ai = 0; ai < (approvalRows as ApprovalRow[]).length; ai++) {
      var live = selectorTools.pendingOf((approvalRows as ApprovalRow[])[ai].key);
      approvalReasons.push(live === undefined || live === null ? undefined : live.payload?.reason);
    }
    var tone = badgeToneOf(approvalReasons, questionInputs.pending);
    var confirming = paint.ornament && tone === "none";
    // The label names what is actually pending: a question-only badge that
    // announces "approvals" lies to a screen reader and to the tooltip.
    var label = tone === "question" ? "Pending questions" : "Pending approvals";
    // The count goes through the TESTED helper (not rows.length) so the
    // mutation-pinned "count is independent of tone" contract is the shipped
    // path, not a structural twin of it (#135 review note).
    var count = badgeCount((approvalRows as ApprovalRow[]).length, questionInputs.pending);

    // The built-ins go through the surface door: two tabs (Approvals,
    // Questions) in the modal below. Badge, count and rings keep reading the
    // selectors directly, so #135's badge meaning never depends on the
    // surface being healthy. Unconditional: hooks cannot sit below the
    // badge-hidden early return.
    var sessionId = typeof props.sessionId === "string" ? props.sessionId : null;
    var surfacesBox = useBuiltInSurfaces(
      sessionId,
      approvalRows as ApprovalRow[],
      questionInputs.rows,
      selectorTools.pendingOf,
    );

    var rows: ModalRow[] = (approvalRows as ApprovalRow[]).concat(questionInputs.rows);
    // Stay mounted through the confirmation window so an answer reads as
    // confirmed rather than as the badge disappearing under the cursor.
    if (!badgeVisible(tone, confirming)) return null;

    var jump = function (key: string, callId: string | null) {
      if (callId === null) return;
      var el = cardOf(callId);
      if (el === null) {
        // No card for this callId in the conversation: disable the row's
        // jump button rather than leaving a dead action.
        setMissing(function (prev) {
          var next = new Set(prev);
          next.add(key);
          return next;
        });
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setOpen(false);
    };

    var jumpableOf = function (item: AttentionItem) {
      var callId = item.props.callId;
      return typeof callId === "string" && callId !== "" && !missing.has(item.key);
    };

    var handlesOf = function (itemKey: string): AskHandle | null {
      var owned = surfacesBox.current;
      if (owned === null) return null;
      var found = owned.handlesByItem.get(itemKey);
      return found === undefined ? null : found;
    };

    return (
      <>
        <button
          type="button"
          className="composer-approvals-indicator"
          data-tone={tone}
          data-fading={confirming ? "1" : undefined}
          aria-label={label}
          data-dsh-tip=""
          title={label}
          onClick={function () {
            setOpen(true);
          }}
        >
          <span className="composer-approvals-glyph" aria-hidden={true}>
            !
          </span>
          {/*
            The COUNT reports everything pending while the TONE reports only
            the most urgent kind. Keeping them separate is deliberate: a
            lower-priority kind is out-ranked for colour but never hidden,
            which is exactly the masking #132 had to undo.
          */}
          {count > 1 ? (
            <span className="composer-approvals-count" aria-hidden={true}>
              {count}
            </span>
          ) : null}
        </button>
        {open ? (
          // The full standard size (#75): the settings-panel footprint every
          // other plugin modal uses. Cards carry their own actions rows, so
          // there is no modal-level actions row here — but the panel matches
          // its siblings rather than being the one odd 420px popover.
          <PluginModal
            title="Pending approvals"
            size="full"
            onClose={function () {
              setOpen(false);
            }}
          >
            <AttentionModal
              sessionId={sessionId}
              sessionLabel="This session"
              jumpableOf={jumpableOf}
              onJump={jump}
              handlesOf={handlesOf}
              store={getAttentionStore()}
            />
          </PluginModal>
        ) : null}
      </>
    );
  };
}

/** Stable Cordis plugin name. */
var name = PLUGIN_NAME;
/** Services this bundle reaches through the plugin context. */
var inject = ["slots"];

/**
 * Plugin body: inject the styles once and register the indicator in the
 * composer tool row's left slot, immediately right of the overflow trigger
 * (order -99 next to composer-menu's -100; the shared tier contract with
 * context-meter's meter=1 / composer-menu's picker=2 / send-bump=3 is
 * untouched).
 */
function apply(ctx: any) {
  injectStyle(PLUGIN_NAME, "composer-approvals", localCss);
  var Indicator = makeIndicator();
  ctx.slots.inject("conversation.input.left", function* () {
    yield ctx.slots.register(
      {
        name: "conversation.input.left",
        id: "composer-approvals-indicator",
        order: -99,
      },
      Indicator,
    );
  });
}

export { apply, inject, name };
