// Client half of the user-bubble takeover (#125).
//
// The shipped conversation package renders `user` and `steering` chat nodes
// with UserMessageNodeView, whose plain-text projection mis-decorates pasted
// paths: its pattern /(^|\s)(\/[\w-]+|...)/gu stops a slash token at the next
// slash, so `/home/sid/.dsh` chipped `/home` and labelled it a SKILL. This
// plugin shadows BOTH keys at priority -100 (keyed slots render the lowest
// live entry) with a markdown bubble driven by the pure model in ./text.
//
// KNOWN LIMITATION, stated rather than hidden: PendingSteeringBubble (shipped
// client.js:5271) calls the bubble component DIRECTLY, bypassing
// conversation.chat.node entirely. In-flight steering keeps the old rendering
// until the message is admitted to the transcript. A plugin cannot reach it;
// fixing it needs an upstream change.
//
// LOSS LIST accepted by taking the node over: bubble chrome is rebuilt from
// scratch in ./client.module.css, so upstream restyles stop propagating; and
// any FUTURE upstream addition to the user action row is silently lost. User
// rows carry copy + timestamp only today, and both survive here.
import * as React from "react";
import * as primitives from "@deepseek-ai/dsh-client-ui-primitives";
import {
  encodeRefsForMarkdown,
  hardBreakOutsideFences,
  splitReferences,
  CHAT_NODE_KEYS,
} from "./text";
import { fetchJson, injectStyle } from "../../shared/client-util";
import localCss from "./client.module.css";

var MarkdownText = primitives.MarkdownText;
var JsonBlock = primitives.JsonBlock;
var Tooltip = primitives.Tooltip;
var IconCopyOutline16 = primitives.IconCopyOutline16;
var IconCheckOutline16 = primitives.IconCheckOutline16;
var writeClipboard = primitives.writeClipboard;

var PLUGIN_NAME = "user-bubble";
/** The keyed slot every chat node renders through. */
var SLOT = "conversation.chat.node";
/** Shadow priority: keyed slots render the lowest live entry (see tool-render). */
var SHADOW_PRIORITY = -100;
/** Locale namespace the shipped node renderers translate against. */
var LOCALE = "conversation";

/**
 * Replica of the shipped contentParts (client.js:5044), which is internal to
 * the conversation package and not exported. Splits message content into the
 * joined text, image attachments, and everything else.
 */
function contentParts(content) {
  var texts = [];
  var images = [];
  var rest = [];
  for (var block of content) {
    if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
    else if (block.type === "image" && block.attachment !== undefined) images.push({ attachment: block.attachment });
    else rest.push(block);
  }
  return { text: texts.join(""), images: images, rest: rest };
}

function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}

/**
 * Replica of the shipped formatMessageClock (client.js:2729): HH:MM today,
 * otherwise a month-day (or year-prefixed) stamp followed by the clock.
 * The calendar-day midnight re-render nuance (a `useCalendarDay` hook in the
 * shipped MessageIconActions) is the one accepted approximation: the stamp is
 * computed at render time instead.
 */
function formatMessageClock(time, t) {
  var d = new Date(time);
  var n = new Date();
  var clock = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  var sameDay =
    d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  if (sameDay) return clock;
  var params = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  return (
    (d.getFullYear() === n.getFullYear() ? t("clock.md", params) : t("clock.ymd", params)) + " " + clock
  );
}

/**
 * ONE TEXT FLOW (#148, defect B). The bubble used to map each segment to
 * either a block-level <MarkdownText> or an inline chip span, so
 * text/chip/text rendered as block, span, block and every chip cost a line
 * break. Now the whole body goes through ONE <MarkdownText> with the chips
 * encoded inside the source (see encodeRefsForMarkdown in ./text): the
 * paragraph flows and the chips sit inline in it. Markdown still renders —
 * headings, bold, lists, fenced code — because the single pass parses the
 * full body instead of per-segment fragments (which also fixes chips
 * splitting constructs like **bold /chip bold** across two renderers).
 *
 * DEPARTURE FROM THE SHIPPED CHIP, written down so a later reader does not
 * file it as a regression: chips render as markdown links (`a[href^="#ub-ref/"]`,
 * styled as chips, non-interactive) rather than `span[data-ref-chip]`, because
 * a link is the only attribute-carrying INLINE element markdown offers, and
 * only an inline element keeps the single flow. The earlier departures stand
 * (no glyph; every @-ref reads as file) and are unchanged by this.
 */

/**
 * Served slash names, fetched once per session and shared by every bubble.
 * `null` means unknown — not loaded yet, or the fetch failed — and the
 * bubble treats unknown as NO names (slash tokens plain, the safe
 * direction) rather than flashing optimistic chips. A failed load logs and
 * stays failed for the page lifetime; retrying every render would turn one
 * missing route into a request storm.
 */
var NAMES_URL = "/user-bubble/slash-names";
var namesCache: Map<string, ReadonlySet<string> | null> = new Map();
var namesInflight: Map<string, Promise<ReadonlySet<string> | null>> = new Map();

/** Guard an unknown JSON value into a string array, or null. */
function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  var out: string[] = [];
  for (var item of value) {
    if (typeof item !== "string" || item === "") return null;
    out.push(item);
  }
  return out;
}

function fetchSlashNames(sessionId: string | null): Promise<ReadonlySet<string> | null> {
  var key = sessionId ?? "";
  var cached = namesCache.get(key);
  if (cached !== undefined) return Promise.resolve(cached);
  var inflight = namesInflight.get(key);
  if (inflight !== undefined) return inflight;
  var url = NAMES_URL + (sessionId !== null ? "?sessionId=" + encodeURIComponent(sessionId) : "");
  var pending = fetchJson(url).then(function (result) {
    var skills = result.data !== null && typeof result.data === "object" ? stringArray(result.data.skills) : null;
    var commands =
      result.data !== null && typeof result.data === "object" ? stringArray(result.data.commands) : null;
    var names: ReadonlySet<string> | null =
      skills === null || commands === null ? null : new Set([...skills, ...commands]);
    namesCache.set(key, names);
    namesInflight.delete(key);
    return names;
  });
  namesInflight.set(key, pending);
  return pending;
}

/**
 * The served slash names for one bubble. Session-scope slots receive
 * sessionId in props (the slot system synthesizes standard props for
 * session-scope entries); without one the bubble uses the global names.
 */
function useSlashNames(sessionId: string | null) {
  // No type argument: the react shim types the namespace as `any`, and an
  // untyped call may not take explicit type arguments (TS2347).
  var state = React.useState(null);
  React.useEffect(
    function () {
      var cancelled = false;
      fetchSlashNames(sessionId).then(function (names) {
        if (!cancelled) state[1](names);
      });
      return function () {
        cancelled = true;
      };
    },
    [sessionId],
  );
  return state[0];
}

/**
 * Copy + timestamp action row. The shipped MessageIconActions is internal to
 * the conversation package, so the two affordances user rows actually carry
 * are rebuilt here: the copy debounce and the 1s "copied" timer are kept.
 */
function BubbleActions({ text, time, t }) {
  var copied = React.useState(false);
  var setCopied = copied[1];
  var onCopy = React.useCallback(
    function () {
      // The copied guard doubles as the debounce while the 1s timer runs.
      if (copied[0]) return;
      writeClipboard(text).then(function (ok) {
        if (!ok) return;
        setCopied(true);
        window.setTimeout(function () {
          setCopied(false);
        }, 1000);
      });
    },
    [copied[0], text],
  );
  return (
    <div className="user-bubble-actions">
      {time !== undefined ? <span className="user-bubble-time">{formatMessageClock(time, t)}</span> : null}
      <Tooltip label={copied[0] ? t("copied") : t("copy")} side="bottom">
        <button
          type="button"
          className="user-bubble-action"
          aria-label={copied[0] ? t("copied") : t("copy")}
          onClick={onCopy}
        >
          {copied[0] ? <IconCheckOutline16 /> : <IconCopyOutline16 />}
        </button>
      </Tooltip>
    </div>
  );
}

/**
 * One user/steering chat node, rendered as markdown with hard breaks outside
 * fences (./text). Images go through the renderMessageImages OWNER PROP —
 * never reimplemented — so image rendering is zero-loss in the takeover.
 */
var UserBubbleNodeView = React.memo(function UserBubbleNodeView({ node, renderMessageImages, t, sessionId }) {
  var data = node.data;
  var parts = contentParts(data.content);
  // Order matters: hard breaks FIRST (so chip labels never carry break
  // markers — the tokenizer's tokens never contain whitespace), then the
  // reference split against the served names, then the single-flow encode.
  // Copy keeps the RAW body: what you copy never contains chip encoding.
  var body = hardBreakOutsideFences(parts.text);
  var slashNames = useSlashNames(typeof sessionId === "string" && sessionId !== "" ? sessionId : null);
  // Runtime referenceLabels are validated names WITHOUT the @ prefix (the
  // shipped projector prepends it); the model trusts only full labels.
  var sessionLabels = new Set<string>(
    (data.referenceLabels ?? []).map(function (label: string) {
      return "@" + label;
    }),
  );
  var markdown = encodeRefsForMarkdown(body, splitReferences(body, sessionLabels, slashNames ?? new Set()));
  var showBubble = body !== "" || parts.rest.length > 0;
  var truncated = function (total) {
    return t("json.truncated", { total: total });
  };
  return (
    <div className="user-bubble-row" data-time-hover-root="true">
      <div className="user-bubble-stack">
        {renderMessageImages({ images: parts.images, align: "end" })}
        {showBubble ? (
          <div className="user-bubble-body">
            <MarkdownText text={markdown} />
            {parts.rest.map(function (block, i) {
              return <JsonBlock key={i} label={t("message.extraBlock")} payload={block} truncatedLabel={truncated} />;
            })}
          </div>
        ) : null}
        {data.referenceLabels !== undefined && data.referenceLabels.length > 0 ? (
          <div className="user-bubble-refs">
            {t("message.referenceSummary", {
              labels: data.referenceLabels.join(t("message.referenceSeparator")),
            })}
          </div>
        ) : null}
      </div>
      <BubbleActions text={body} time={data.time} t={t} />
    </div>
  );
});

/** Stable Cordis plugin name. */
var name = PLUGIN_NAME;
/** Services this bundle reaches through the plugin context. */
var inject = ["slots"];

/**
 * Plugin body: inject the styles once and shadow BOTH `user` and `steering`
 * keys (they map to the same shipped component, so taking one leaves half
 * the transcript broken). The keys come from the pure CHAT_NODE_KEYS so the
 * registration list is pinned by the model's tests. No children are
 * declared — the shipped registrations declare none, and a shadow declaring
 * none cannot trip the duplicate-child-slot throw.
 */
function apply(ctx) {
  injectStyle(PLUGIN_NAME, "user-bubble", localCss);
  for (var key of CHAT_NODE_KEYS) {
    ctx.slots.inject(SLOT, function* () {
      yield ctx.slots.register(
        {
          name: SLOT,
          key: key,
          priority: SHADOW_PRIORITY,
          locale: LOCALE,
        },
        UserBubbleNodeView,
      );
    });
  }
}

export { apply, inject, name };
