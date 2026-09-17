window.__ModuleLoader__.load({
	id: "user-bubble",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugins/user-bubble/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var react = __toESM(require("react"), 1);
var primitives = __toESM(require("@deepseek-ai/dsh-client-ui-primitives"), 1);

// plugins/user-bubble/src/text.ts
var CHAT_NODE_KEYS = ["user", "steering"];
var REFERENCE_RE = /(^|\s)(\/[\w-]+|@"[^"\n]+"|@[^\s]+)/gu;
function refKindOf(label, sessionLabels) {
  if (sessionLabels.has(label)) return "session";
  return label.startsWith("@") ? "file" : "skill";
}
function splitReferences(text, sessionLabels = /* @__PURE__ */ new Set(), slashNames = /* @__PURE__ */ new Set()) {
  if (typeof text !== "string" || text === "") return [];
  const out = [];
  let cursor = 0;
  REFERENCE_RE.lastIndex = 0;
  let match;
  while ((match = REFERENCE_RE.exec(text)) !== null) {
    const lead = match[1];
    const label = match[2];
    if (label.startsWith("/") && !slashNames.has(label.slice(1))) {
      continue;
    }
    const tokenStart = match.index + lead.length;
    if (tokenStart > cursor) out.push({ kind: "text", text: text.slice(cursor, tokenStart) });
    out.push({ kind: "ref", raw: label, label, refKind: refKindOf(label, sessionLabels) });
    cursor = tokenStart + label.length;
  }
  if (cursor < text.length) out.push({ kind: "text", text: text.slice(cursor) });
  return out;
}
var CHIP_LINK_PREFIX = "#ub-ref/";
function chipDisplayText(segment) {
  const label = segment.label;
  if (segment.refKind === "session") return label.slice(1);
  if (segment.refKind === "skill") return label;
  return label.slice(1).replace(/^"|"$/g, "").split(/[\\/]/).filter(Boolean).at(-1) ?? label.slice(1);
}
function escapeLinkText(text) {
  return text.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
}
function escapeLinkTitle(title) {
  return title.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function encodeRefChip(segment) {
  const text = escapeLinkText(chipDisplayText(segment));
  const dest = "<" + CHIP_LINK_PREFIX + segment.refKind + "/" + encodeURIComponent(segment.label.slice(1)) + ">";
  const title = escapeLinkTitle(segment.label);
  return `[${text}](${dest} "${title}")`;
}
function inlineCodeSpans(line) {
  const out = [];
  const re = /(`+)([^`]*?)\1/g;
  let match;
  while ((match = re.exec(line)) !== null) {
    if (match[0].length > match[1].length * 2) {
      out.push({ start: match.index, end: match.index + match[0].length });
    }
  }
  return out;
}
function protectedRanges(body) {
  const ranges = [];
  const lines = body.split("\n");
  let offset = 0;
  let fence = null;
  let fenceStart = 0;
  for (const line of lines) {
    const lineStart = offset;
    const lineEnd = offset + line.length;
    const fenceMatch = FENCE_RE.exec(line);
    if (fence === null) {
      if (fenceMatch !== null) {
        fence = { marker: fenceMatch[1], char: fenceMatch[1][0] };
        fenceStart = lineStart;
      } else if (/^ {4,}\S/.test(line)) {
        ranges.push({ start: lineStart, end: lineEnd });
      } else {
        for (const span of inlineCodeSpans(line)) {
          ranges.push({ start: lineStart + span.start, end: lineStart + span.end });
        }
      }
    } else {
      const closes = fenceMatch !== null && fenceMatch[1][0] === fence.char && fenceMatch[1].length >= fence.marker.length && line.slice(fenceMatch[0].length).trim() === "";
      if (closes) {
        ranges.push({ start: fenceStart, end: lineEnd });
        fence = null;
      }
    }
    offset = lineEnd + 1;
  }
  if (fence !== null) ranges.push({ start: fenceStart, end: body.length });
  return ranges;
}
function encodeRefsForMarkdown(body, segments) {
  if (typeof body !== "string" || body === "") return "";
  const prot = protectedRanges(body);
  const isProtected = (start, end) => prot.some((range) => start < range.end && end > range.start);
  let out = "";
  let cursor = 0;
  for (const segment of segments) {
    if (segment.kind === "text") {
      out += segment.text;
      cursor += segment.text.length;
      continue;
    }
    const start = cursor;
    const end = cursor + segment.raw.length;
    out += isProtected(start, end) ? segment.raw : encodeRefChip(segment);
    cursor = end;
  }
  return out;
}
var FENCE_RE = /^ {0,3}(`{3,}|~{3,})/;
function hardBreakOutsideFences(text) {
  if (typeof text !== "string" || text === "") return "";
  const lines = text.split("\n");
  let fence = null;
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = FENCE_RE.exec(line);
    if (fence === null) {
      if (fenceMatch !== null) {
        fence = { marker: fenceMatch[1], char: fenceMatch[1][0] };
        out.push(line);
        continue;
      }
    } else {
      const closes = fenceMatch !== null && fenceMatch[1][0] === fence.char && fenceMatch[1].length >= fence.marker.length && line.slice(fenceMatch[0].length).trim() === "";
      out.push(line);
      if (closes) fence = null;
      continue;
    }
    const next = i + 1 < lines.length ? lines[i + 1] : null;
    const isLast = next === null;
    const nextBlank = next !== null && next.trim() === "";
    const alreadyBroken = /( {2}|\\)$/.test(line);
    const indentedCode = /^ {4,}\S/.test(line);
    if (line.trim() === "" || isLast || nextBlank || alreadyBroken || indentedCode) {
      out.push(line);
      continue;
    }
    out.push(line + "  ");
  }
  return out.join("\n");
}

// plugins/shared/client-util.ts
function injectStyle(pluginName, styleId, cssText) {
  if (typeof document === "undefined") return;
  if (document.querySelector(
    'style[data-plugin-css="' + (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(styleId) : String(styleId).replace(/"/g, '\\"')) + '"]'
  ) !== null)
    return;
  const tag = document.createElement("style");
  tag.dataset.plugin = pluginName;
  tag.dataset.pluginCss = styleId;
  tag.textContent = cssText;
  document.head.appendChild(tag);
}
var HLJS_THEME_CSS = [
  ".hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#ff7b72}",
  ".hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#d2a8ff}",
  ".hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-variable,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id{color:#79c0ff}",
  ".hljs-regexp,.hljs-string,.hljs-meta .hljs-string{color:#a5d6ff}",
  ".hljs-built_in,.hljs-symbol{color:#ffa657}",
  ".hljs-comment,.hljs-code,.hljs-formula{color:#8b949e}",
  ".hljs-name,.hljs-quote,.hljs-selector-tag,.hljs-selector-pseudo{color:#7ee787}",
  ".hljs-subst{color:#c9d1d9}",
  ".hljs-section{color:#1f6feb;font-weight:bold}",
  ".hljs-bullet{color:#f2cc60}",
  ".hljs-emphasis{color:#c9d1d9;font-style:italic}",
  ".hljs-strong{color:#c9d1d9;font-weight:bold}",
  ".hljs-addition{color:#aff5b4;background-color:#033a16}",
  ".hljs-deletion{color:#ffdcd7;background-color:#67060c}"
].join("");
function request(method, url, body) {
  const hasBody = body !== void 0 && method !== "GET";
  console.debug("[client-util] " + method + " " + url);
  return fetch(url, {
    method,
    cache: "no-store",
    ...hasBody ? { headers: { "content-type": "application/json" } } : {},
    ...hasBody ? { body: JSON.stringify(body) } : {}
  }).then(function(res) {
    return res.json().catch(function() {
      return null;
    }).then(function(json) {
      return { ok: res.ok, status: res.status, json };
    });
  }).then(function(result) {
    if (result.json !== null && result.json.error) {
      console.error(
        "[client-util] " + method + " " + url + " failed: server error " + result.status
      );
      return { data: null, error: String(result.json.error) };
    }
    if (!result.ok) {
      console.error("[client-util] " + method + " " + url + " failed: HTTP " + result.status);
      return { data: null, error: "HTTP " + result.status };
    }
    console.info("[client-util] " + method + " " + url + " ok (HTTP " + result.status + ")");
    return { data: result.json, error: null };
  }).catch(function(e) {
    console.error("[client-util] " + method + " " + url + " failed: network error");
    return { data: null, error: String(e && e.message || e) };
  });
}
function fetchJson(url) {
  return request("GET", url);
}

// css-text:/home/sid/.dsh/aidos/scratch/--home-sid-repos-dotfiles-ai--/wt/148/plugins/user-bubble/src/client.module.css
var client_default = '/*\n * Bubble chrome for the user-bubble takeover (#125). The shipped bubble CSS\n * is internal to the conversation package, so the takeover restyles from\n * scratch; upstream restyles stop propagating (accepted in the loss list).\n * Class names are literal: the build injects this file as raw text.\n */\n/*\n * THE AXIS IS LOAD-BEARING, and getting it wrong is what the owner reported\n * on 2026-09-17: "the timestamp is rendering to the right of the message\n * instead of below it which pushes the entire chat bubble to the left".\n *\n * The actions row is a SIBLING of the bubble stack, so in a horizontal row it\n * consumes width beside the bubble and \u2014 because the row is right-aligned \u2014\n * displaces every bubble leftward by the width of the clock. The shipped\n * component stacks them: its .gdEzaW_userRow is `flex-direction: column;\n * align-items: flex-end; gap: 6px`. Keep this a COLUMN, and the existing JSX\n * needs no sibling-shuffling to put the clock underneath.\n *\n * THE SPLIT WITH UPSTREAM IS DELIBERATE (owner, 2026-09-17), not a migration\n * someone abandoned half way. We KEEP OUR colours and type scale (the fill\n * token below, 13px/20px) because the owner prefers them to the shipped\n * 16px/24px, and we TAKE UPSTREAM\'S shape metrics (radius 22px, padding\n * 10px 16px, gaps 6px/8px, max-width min(525px, 82%)) so the bubble sits in\n * the same geometry as the assistant rows around it. Do NOT "finish the job"\n * by pulling the shipped font size across: the smaller type is the choice.\n */\n.user-bubble-row {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 6px;\n  padding: 1px 0;\n}\n.user-bubble-stack {\n  display: flex;\n  flex-direction: column;\n  align-items: flex-end;\n  gap: 8px;\n  min-width: 0;\n  max-width: min(525px, 82%);\n}\n.user-bubble-body {\n  background: var(--dsw-alias-fill-l2, rgba(128, 128, 128, 0.14));\n  /* Upstream\'s radius against our smaller line-height makes a short bubble a\n     full pill. That is a CONSEQUENCE of the owner\'s split, not a defect. */\n  border-radius: 22px;\n  padding: 10px 16px;\n  overflow-wrap: anywhere;\n  font-size: 13px;\n  line-height: 20px;\n}\n/*\n * CHIPS ARE LINKS (#148, defect B). The bubble renders ONE MarkdownText for\n * the whole body so text and chips share a single paragraph flow, and the\n * chips ride inside that flow as markdown links \u2014 a link is the only\n * attribute-carrying inline element markdown offers. The href is an opaque\n * hook (never navigated), the title carries the full label. Visuals match\n * the old span chip exactly; behaviour is deliberately non-interactive\n * (these are decorations of sent text, not navigation), announced to\n * assistive tech as links rather than buttons.\n */\n.user-bubble-body a[href^="#ub-ref/"] {\n  display: inline-block;\n  background: var(--dsw-alias-fill-l3, rgba(128, 128, 128, 0.22));\n  border-radius: 5px;\n  padding: 0 5px;\n  margin: 0 1px;\n  font-size: 12px;\n  line-height: 18px;\n  vertical-align: baseline;\n  white-space: nowrap;\n  color: inherit;\n  text-decoration: none;\n  pointer-events: none;\n  cursor: text;\n}\n.user-bubble-refs {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary, #8a8a8a);\n}\n/*\n * THE 28px IS UPSTREAM\'S OWN (.p-xYUq_actions), kept so a user row occupies\n * the same vertical rhythm as the assistant rows it sits between.\n *\n * AN EARLIER VERSION OF THIS COMMENT CALLED IT REFLOW PREVENTION, AND THAT\n * WAS WRONG \u2014 caught in review (subagent 9c62b952). The row hides with\n * `opacity: 0`, which KEEPS it in layout, so hover moves nothing with or\n * without an explicit height. The height is rhythm, not a jump guard. It\n * would BECOME load-bearing the moment anyone swapped the opacity fade for\n * `display: none`, which is the real reason not to reclaim it.\n *\n * OUR SMALLER SCALE DIVERGES FROM UPSTREAM IN TWO MORE PLACES, deliberately,\n * so that nobody "corrects" them later: the clock drops upstream\'s\n * padding-right: 12px (the flex gap already separates it), and\n * .user-bubble-action is 20x20 with a 5px radius where upstream is 28x28 and\n * fully round. Both follow the owner\'s kept-ours type scale.\n *\n * WE FADE THE WHOLE ROW, upstream fades only the clock (its .p-xYUq_action\n * carries no opacity rule). Chosen deliberately: a copy button on every user\n * message is visual noise in a long transcript, and the affordance is still\n * one hover away. Flip this by moving the opacity pair onto .user-bubble-time\n * alone.\n */\n.user-bubble-actions {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  height: 28px;\n  flex: none;\n  opacity: 0;\n  transition: opacity 80ms ease;\n}\n.user-bubble-row:hover .user-bubble-actions,\n.user-bubble-row:focus-within .user-bubble-actions {\n  opacity: 1;\n}\n.user-bubble-time {\n  font-size: 11px;\n  color: var(--dsw-alias-label-tertiary, #8a8a8a);\n  white-space: nowrap;\n}\n.user-bubble-action {\n  display: grid;\n  place-items: center;\n  width: 20px;\n  height: 20px;\n  padding: 0;\n  border: none;\n  border-radius: 5px;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary, #8a8a8a);\n  cursor: pointer;\n}\n.user-bubble-action:hover {\n  color: var(--dsw-alias-label-primary, #f0f0f0);\n  background: var(--dsw-alias-fill-l2, rgba(128, 128, 128, 0.14));\n}\n';

// plugins/user-bubble/src/client.tsx
var MarkdownText2 = primitives.MarkdownText;
var JsonBlock2 = primitives.JsonBlock;
var Tooltip2 = primitives.Tooltip;
var IconCopyOutline162 = primitives.IconCopyOutline16;
var IconCheckOutline162 = primitives.IconCheckOutline16;
var writeClipboard2 = primitives.writeClipboard;
var PLUGIN_NAME = "user-bubble";
var SLOT = "conversation.chat.node";
var SHADOW_PRIORITY = -100;
var LOCALE = "conversation";
function contentParts(content) {
  var texts = [];
  var images = [];
  var rest = [];
  for (var block of content) {
    if (block.type === "text" && typeof block.text === "string") texts.push(block.text);
    else if (block.type === "image" && block.attachment !== void 0) images.push({ attachment: block.attachment });
    else rest.push(block);
  }
  return { text: texts.join(""), images, rest };
}
function pad2(n) {
  return n < 10 ? "0" + n : String(n);
}
function formatMessageClock(time, t) {
  var d = new Date(time);
  var n = /* @__PURE__ */ new Date();
  var clock = pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  var sameDay = d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  if (sameDay) return clock;
  var params = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
  return (d.getFullYear() === n.getFullYear() ? t("clock.md", params) : t("clock.ymd", params)) + " " + clock;
}
var NAMES_URL = "/user-bubble/slash-names";
var namesCache = /* @__PURE__ */ new Map();
var namesInflight = /* @__PURE__ */ new Map();
function stringArray(value) {
  if (!Array.isArray(value)) return null;
  var out = [];
  for (var item of value) {
    if (typeof item !== "string" || item === "") return null;
    out.push(item);
  }
  return out;
}
function fetchSlashNames(sessionId) {
  var key = sessionId ?? "";
  var cached = namesCache.get(key);
  if (cached !== void 0) return Promise.resolve(cached);
  var inflight = namesInflight.get(key);
  if (inflight !== void 0) return inflight;
  var url = NAMES_URL + (sessionId !== null ? "?sessionId=" + encodeURIComponent(sessionId) : "");
  var pending = fetchJson(url).then(function(result) {
    var skills = result.data !== null && typeof result.data === "object" ? stringArray(result.data.skills) : null;
    var commands = result.data !== null && typeof result.data === "object" ? stringArray(result.data.commands) : null;
    var names = skills === null || commands === null ? null : /* @__PURE__ */ new Set([...skills, ...commands]);
    namesCache.set(key, names);
    namesInflight.delete(key);
    return names;
  });
  namesInflight.set(key, pending);
  return pending;
}
function useSlashNames(sessionId) {
  var state = react.useState(null);
  react.useEffect(
    function() {
      var cancelled = false;
      fetchSlashNames(sessionId).then(function(names) {
        if (!cancelled) state[1](names);
      });
      return function() {
        cancelled = true;
      };
    },
    [sessionId]
  );
  return state[0];
}
function BubbleActions({ text, time, t }) {
  var copied = react.useState(false);
  var setCopied = copied[1];
  var onCopy = react.useCallback(
    function() {
      if (copied[0]) return;
      writeClipboard2(text).then(function(ok) {
        if (!ok) return;
        setCopied(true);
        window.setTimeout(function() {
          setCopied(false);
        }, 1e3);
      });
    },
    [copied[0], text]
  );
  return /* @__PURE__ */ react.createElement("div", { className: "user-bubble-actions" }, time !== void 0 ? /* @__PURE__ */ react.createElement("span", { className: "user-bubble-time" }, formatMessageClock(time, t)) : null, /* @__PURE__ */ react.createElement(Tooltip2, { label: copied[0] ? t("copied") : t("copy"), side: "bottom" }, /* @__PURE__ */ react.createElement(
    "button",
    {
      type: "button",
      className: "user-bubble-action",
      "aria-label": copied[0] ? t("copied") : t("copy"),
      onClick: onCopy
    },
    copied[0] ? /* @__PURE__ */ react.createElement(IconCheckOutline162, null) : /* @__PURE__ */ react.createElement(IconCopyOutline162, null)
  )));
}
var UserBubbleNodeView = react.memo(function UserBubbleNodeView2({ node, renderMessageImages, t, sessionId }) {
  var data = node.data;
  var parts = contentParts(data.content);
  var body = hardBreakOutsideFences(parts.text);
  var slashNames = useSlashNames(typeof sessionId === "string" && sessionId !== "" ? sessionId : null);
  var sessionLabels = new Set(
    (data.referenceLabels ?? []).map(function(label) {
      return "@" + label;
    })
  );
  var markdown = encodeRefsForMarkdown(body, splitReferences(body, sessionLabels, slashNames ?? /* @__PURE__ */ new Set()));
  var showBubble = body !== "" || parts.rest.length > 0;
  var truncated = function(total) {
    return t("json.truncated", { total });
  };
  return /* @__PURE__ */ react.createElement("div", { className: "user-bubble-row", "data-time-hover-root": "true" }, /* @__PURE__ */ react.createElement("div", { className: "user-bubble-stack" }, renderMessageImages({ images: parts.images, align: "end" }), showBubble ? /* @__PURE__ */ react.createElement("div", { className: "user-bubble-body" }, /* @__PURE__ */ react.createElement(MarkdownText2, { text: markdown }), parts.rest.map(function(block, i) {
    return /* @__PURE__ */ react.createElement(JsonBlock2, { key: i, label: t("message.extraBlock"), payload: block, truncatedLabel: truncated });
  })) : null, data.referenceLabels !== void 0 && data.referenceLabels.length > 0 ? /* @__PURE__ */ react.createElement("div", { className: "user-bubble-refs" }, t("message.referenceSummary", {
    labels: data.referenceLabels.join(t("message.referenceSeparator"))
  })) : null), /* @__PURE__ */ react.createElement(BubbleActions, { text: body, time: data.time, t }));
});
var name = PLUGIN_NAME;
var inject = ["slots"];
function apply(ctx) {
  injectStyle(PLUGIN_NAME, "user-bubble", client_default);
  for (var key of CHAT_NODE_KEYS) {
    ctx.slots.inject(SLOT, function* () {
      yield ctx.slots.register(
        {
          name: SLOT,
          key,
          priority: SHADOW_PRIORITY,
          locale: LOCALE
        },
        UserBubbleNodeView
      );
    });
  }
}
		return module.exports;
	}
});
