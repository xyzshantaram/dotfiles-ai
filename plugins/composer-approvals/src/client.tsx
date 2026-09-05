// Client half of the composer-approvals indicator.
//
// A small warning circle sits immediately right of the composer overflow
// trigger whenever the session has at least one pending approval. Clicking
// it opens a modal listing every pending approval; rows that carry a callId
// get a jump action that scrolls the conversation to that tool call's card
// (found through tool-render's data-call-id attribute), and rows without a
// callId say so instead. The indicator disappears once every pending is
// answered.
import * as react from "react";
import * as runtime from "@deepseek-ai/dsh-client-runtime/client";
import { injectStyle } from "../../shared/client-util";
import localCss from "./client.module.css";

var conversationContextKey = runtime.conversationContextKey;

var PLUGIN_NAME = "composer-approvals";

var EMPTY: ReadonlyArray<any> = [];

/**
 * Read one root Tool lifecycle through the conversation snapshot index.
 * Mirrors approval-comment's helper of the same name: a callId may point at
 * a subcall, so resolve to the root before asking it for a label. Always
 * returns `undefined` for "not present".
 */
function rootToolCall(snapshot: any, callId: string) {
  var node = snapshot.chat && snapshot.chat.nodes.get(conversationContextKey("tool-call", callId));
  if (node === undefined || node === null) return undefined;
  var root = node.data && node.data.root;
  if (root === undefined || root === null) return undefined;
  return root;
}

/**
 * Extract the shell command from an approval's paired running call, the
 * same shape approval-comment reads. Never throws.
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
  callId: string | null;
  approvalId: unknown;
  label: string;
}

/**
 * Build the selector once per component so its memo cell is not shared
 * across sessions. The selector returns a STABLE array: it is rebuilt only
 * when the key+callId signature changes, which keeps the
 * useSyncExternalStoreWithSelector-based useSession from looping.
 */
function makeSelector() {
  var lastSig = "\u0000";
  var lastRows: ApprovalRow[] = EMPTY as ApprovalRow[];
  return function selectApprovals(snapshot: any): ApprovalRow[] {
    var pending =
      snapshot !== null && snapshot !== undefined && Array.isArray(snapshot.pending)
        ? snapshot.pending
        : EMPTY;
    var parts: string[] = [];
    var rows: ApprovalRow[] = [];
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
      // The label rides the signature too: argsRaw can stream in after the
      // approval frame, so a key+callId-only memo would freeze a stale label.
      parts.push(String(item.key) + "\u0000" + (callId === null ? "" : callId) + "\u0000" + label);
      rows.push({
        key: String(item.key),
        callId: callId,
        approvalId: payload.approvalId,
        label: label === null ? "Approval" : label,
      });
    }
    var sig = parts.join("\u0001");
    if (sig === lastSig) return lastRows;
    lastSig = sig;
    lastRows = rows;
    return rows;
  };
}

/** Find the tool-render card for one callId, or null when it is not mounted. */
function cardOf(callId: string): HTMLElement | null {
  return document.querySelector('.tool-render-card[data-call-id="' + CSS.escape(callId) + '"]');
}

function makeIndicator() {
  return function Indicator(props: any) {
    var selectApprovals = react.useMemo(makeSelector, []);
    var rows = props.useSession(selectApprovals);
    var openState = react.useState(false);
    var open = openState[0];
    var setOpen = openState[1];
    // callIds whose card was not found on click; their jump button disables.
    var missingState = react.useState(function () {
      return new Set<string>();
    });
    var missing = missingState[0];
    var setMissing = missingState[1];

    // Escape closes the modal, matching the mask click.
    react.useEffect(
      function () {
        if (!open) return;
        var onKey = function (event: KeyboardEvent) {
          if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return function () {
          window.removeEventListener("keydown", onKey);
        };
      },
      [open],
    );

    if (rows.length === 0) return null;

    var jump = function (row: ApprovalRow) {
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
        <li key={row.key} className="composer-approvals-row">
          <span className="composer-approvals-label" title={row.label}>
            {row.label}
          </span>
          {row.callId !== null ? (
            <button
              type="button"
              className="composer-approvals-jump"
              disabled={!jumpable}
              onClick={function () {
                jump(row);
              }}
            >
              Jump to call
            </button>
          ) : (
            <span className="composer-approvals-no-call">no tool call</span>
          )}
        </li>
      );
    });

    return (
      <>
        <button
          type="button"
          className="composer-approvals-indicator"
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
          {rows.length > 1 ? (
            <span className="composer-approvals-count" aria-hidden={true}>
              {rows.length}
            </span>
          ) : null}
        </button>
        {open ? (
          <div
            className="composer-approvals-overlay"
            onClick={function () {
              setOpen(false);
            }}
          >
            <div
              className="composer-approvals-panel"
              role="dialog"
              aria-label="Pending approvals"
              onClick={function (event) {
                event.stopPropagation();
              }}
            >
              <div className="composer-approvals-title">Pending approvals</div>
              <ul className="composer-approvals-list">{list}</ul>
            </div>
          </div>
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
