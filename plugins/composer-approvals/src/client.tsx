// Client half of the composer-approvals indicator.
//
// A small warning circle sits immediately right of the composer overflow
// trigger whenever the session has at least one pending approval or
// pending ask_user_question batch. Clicking it opens a modal listing every
// pending item; rows that carry a callId get a jump action that scrolls the
// conversation to that tool call's card (found through tool-render's
// data-call-id attribute), which is the single answer surface for those
// items. Approval rows WITHOUT a callId answer inline here with
// approve/reject buttons (reject arms first); question rows NEVER answer
// in place (the card is their only surface), so a question row without a
// running card shows a disabled jump. The indicator disappears once every
// pending is answered.
//
// The same component maintains the composer question rings (#38, fade per
// #106): while a question waits, the composer card carries a white band
// whose width grows per pending question; an answered batch holds a duller
// band just long enough to confirm the answer registered, then it fades out
// and leaves nothing behind. Widths come from the shared ring rule (see
// ./questions); the paint itself is static CSS on [data-composer-card], so
// this effect only sets two custom properties (and a marker attribute that
// outranks the card's own shadow).
import * as react from "react";
import * as runtime from "@deepseek-ai/dsh-client-runtime/client";
import { injectStyle } from "../../shared/client-util";
import { PluginModal } from "../../shared/plugin-modal";
import { composerRingPaint, questionModalRowsOf, ringInputsOf } from "./questions";
import { badgeToneOf, badgeVisible } from "./badge";
import { initialRingFade, RING_FADE_HOLD_MS, RING_FADE_MS } from "./questions";
import type { QuestionModalRow } from "./questions";
import localCss from "./client.module.css";

var conversationContextKey = runtime.conversationContextKey;

var PLUGIN_NAME = "composer-approvals";

var EMPTY: ReadonlyArray<any> = [];

/** How long an armed reject stays confirmable before it resets itself. */
var REJECT_ARM_RESET_MS = 4000;

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
 * One modal row. With a callId the only action is the jump to the card:
 * the card's answer bar is the single answer surface for callId approvals.
 * WITHOUT a callId the row answers inline -- approve is one click, reject
 * is arm-then-confirm with a ~4s auto-reset. There is deliberately NO
 * comment field here (settled default): commenting lives on the card's
 * answer bar, and no-callId approvals answer without one.
 *
 * A question row (kind "question") is always jump-only: the ask_user_question
 * card is the single answer surface, so the modal never answers in place --
 * a question with no running card shows a disabled jump instead.
 *
 * Props: { row: ApprovalRow | ModalQuestionRow, jumpable: boolean,
 * onJump: (row) => void, pendingOf: (key) => live pending or undefined }.
 */
function ComposerApprovalsRow(props: any) {
  var row = props.row;
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

  var answer = function (outcome: string) {
    if (answered) return;
    var pending = props.pendingOf(row.key);
    if (pending === undefined || pending === null) {
      console.warn("[composer-approvals] answer skipped, pending is gone", row.key);
      return;
    }
    console.debug("[composer-approvals] answer:", outcome, row.key);
    setAnswered(true);
    try {
      Promise.resolve(
        pending.respond({
          ok: true,
          value: {
            sessionId: pending.sessionId,
            approvalId: pending.payload.approvalId,
            outcome: outcome,
          },
        }),
      )
        .then(function (receipt: any) {
          if (receipt === undefined || receipt === null || !receipt.accepted) {
            throw new Error(
              "approval response rejected: " +
                (receipt === undefined || receipt === null || receipt.reason === undefined
                  ? "unknown"
                  : receipt.reason),
            );
          }
        })
        .catch(function (error: unknown) {
          console.warn("[composer-approvals] answer failed", row.key, outcome, error);
          setAnswered(false);
        });
    } catch (error) {
      // respond throws synchronously once the wait was settled elsewhere.
      console.warn("[composer-approvals] answer failed", row.key, outcome, error);
      setAnswered(false);
    }
  };

  var clearArm = function () {
    if (armTimer.current !== 0) {
      window.clearTimeout(armTimer.current);
      armTimer.current = 0;
    }
  };
  var onReject = function () {
    if (answered) return;
    if (armed) {
      clearArm();
      setArmed(false);
      answer("rejected");
      return;
    }
    setArmed(true);
    clearArm();
    armTimer.current = window.setTimeout(function () {
      armTimer.current = 0;
      setArmed(false);
    }, REJECT_ARM_RESET_MS);
  };

  // A question row is jump-only even WITH a callId, and stays jump-only
  // (disabled) without one: the running card is the single answer surface
  // for questions, and the modal never answers in place.
  if (row.kind === "question" || row.callId !== null) {
    return (
      <li className="composer-approvals-row">
        <span className="composer-approvals-label" title={row.label}>
          {row.label}
        </span>
        <button
          type="button"
          className="composer-approvals-jump"
          disabled={!props.jumpable}
          onClick={function () {
            props.onJump(row);
          }}
        >
          Jump to call
        </button>
      </li>
    );
  }
  return (
    <li className="composer-approvals-row">
      <span className="composer-approvals-label" title={row.label}>
        {row.label}
      </span>
      <span className="composer-approvals-no-call">no tool call</span>
      <button
        type="button"
        className="composer-approvals-approve"
        disabled={answered}
        onClick={function () {
          // Wire vocabulary: the host schema accepts "allowed-once" |
          // "rejected"; "approved" would be rejected as bad-response.
          answer("allowed-once");
        }}
      >
        ✓ Approve
      </button>
      <button
        type="button"
        className="composer-approvals-reject"
        data-armed={armed || undefined}
        disabled={answered}
        onClick={onReject}
      >
        {armed ? "? Confirm reject" : "✗ Reject"}
      </button>
    </li>
  );
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

    var rows: ModalRow[] = (approvalRows as ApprovalRow[]).concat(questionInputs.rows);
    // Stay mounted through the confirmation window so an answer reads as
    // confirmed rather than as the badge disappearing under the cursor.
    if (!badgeVisible(tone, confirming)) return null;

    var jump = function (row: ModalRow) {
      if (row.callId === null) return;
      var el = cardOf(row.callId);
      if (el === null) {
        // No card for this callId in the conversation: disable the row's
        // jump button rather than leaving a dead action.
        setMissing(function (prev) {
          var next = new Set(prev);
          next.add(row.key);
          return next;
        });
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setOpen(false);
    };

    var list = rows.map(function (row) {
      var jumpable = row.callId !== null && !missing.has(row.key);
      return (
        <ComposerApprovalsRow
          key={row.key}
          row={row}
          jumpable={jumpable}
          onJump={jump}
          pendingOf={selectorTools.pendingOf}
        />
      );
    });

    return (
      <>
        <button
          type="button"
          className="composer-approvals-indicator"
          data-tone={tone}
          data-fading={confirming ? "1" : undefined}
          aria-label="Pending approvals"
          data-dsh-tip=""
          title="Pending approvals"
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
          {rows.length > 1 ? (
            <span className="composer-approvals-count" aria-hidden={true}>
              {rows.length}
            </span>
          ) : null}
        </button>
        {open ? (
          // The full standard size (#75): the settings-panel footprint every
          // other plugin modal uses. Rows carry their own actions, so there is
          // no actions row here — but the panel matches its siblings rather
          // than being the one odd 420px popover in the set.
          <PluginModal
            title="Pending approvals"
            size="full"
            onClose={function () {
              setOpen(false);
            }}
          >
            <ul className="composer-approvals-list">{list}</ul>
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
