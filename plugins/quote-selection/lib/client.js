window.__ModuleLoader__.load({
	id: "quote-selection",
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

// plugins/quote-selection/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var react = __toESM(require("react"), 1);

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

// plugins/quote-selection/src/quote.ts
function appendToDraft(existing, addition) {
  const trimmed = existing.replace(/\s+$/, "");
  return trimmed.length === 0 ? addition : trimmed + "\n\n" + addition;
}
function normalizeQuoteText(raw) {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") start++;
  while (end > start && lines[end - 1].trim() === "") end--;
  return lines.slice(start, end).join("\n").replace(/\n{3,}/g, "\n\n");
}
function quoteNodesToText(nodes) {
  const parts = [];
  const walk = (items) => {
    for (const node of items) {
      if (node.kind === "text") parts.push(node.text);
      else if (node.kind === "break") parts.push("\n");
      else if (node.kind === "block") {
        walk(node.children);
        parts.push("\n\n");
      } else walk(node.children);
    }
  };
  walk(nodes);
  return normalizeQuoteText(parts.join(""));
}
function isQuotableText(raw) {
  return normalizeQuoteText(raw).length > 0;
}
function toBlockquote(raw, fenced) {
  const text = normalizeQuoteText(raw);
  if (text === "") return "";
  const lines = text.split("\n").map((line) => line.trim() === "" ? ">" : "> " + line);
  if (fenced) return ["> ```", ...lines, "> ```"].join("\n");
  return lines.join("\n");
}
function isAssistantFlowKind(kind) {
  return kind === "assistant";
}

// css-text:/home/sid/repos/dotfiles-ai/plugins/quote-selection/src/client.module.css
var client_default = "/* Floating quote button (#155). Fixed-position: it lives in the composer's\n   React tree (where the composer API is) while appearing next to the text\n   selection anywhere on screen. Rendered only while a quotable selection is\n   armed; zero DOM otherwise. */\n.quote-selection-float {\n  position: fixed;\n  z-index: 60;\n  transform: translate(-50%, 0);\n  box-sizing: border-box;\n  padding: 4px 12px;\n  border: 1px solid var(--dsw-alias-border-l2, #3a3a3a);\n  border-radius: 999px;\n  background: var(--dsw-alias-button-floating-fill, #1f1f1f);\n  color: var(--dsw-alias-label-primary, #e8e8e8);\n  box-shadow: var(--dsw-shadow-lv2, 0 4px 12px rgba(0, 0, 0, 0.35));\n  font-size: 12px;\n  line-height: 18px;\n  cursor: pointer;\n  white-space: nowrap;\n}\n.quote-selection-float[data-above] {\n  transform: translate(-50%, -100%);\n}\n.quote-selection-float:hover {\n  filter: brightness(1.15);\n}\n";

// plugins/quote-selection/src/client.tsx
var PLUGIN_NAME = "quote-selection";
var STYLE_TAG_ID = "quote-selection";
var BUTTON_LABEL = "quote";
var BUTTON_ATTR = "data-quote-selection";
var FLOW_KIND_ATTR = "data-chat-flow-kind";
var BLOCK_TAGS = {
  P: true,
  DIV: true,
  LI: true,
  UL: true,
  OL: true,
  PRE: true,
  H1: true,
  H2: true,
  H3: true,
  H4: true,
  H5: true,
  H6: true,
  BLOCKQUOTE: true,
  SECTION: true,
  ARTICLE: true,
  HEADER: true,
  FOOTER: true,
  FIGURE: true,
  FIGCAPTION: true,
  TABLE: true,
  THEAD: true,
  TBODY: true,
  TR: true,
  // TD/TH are here because TR alone is not enough: a selection across two
  // cells of ONE row has no boundary between them and concatenates
  // ("firstsecond"). Assistant messages render tables routinely, so this was
  // malformed output from ordinary content, not an exotic edge (found by the
  // reviewer of fc4fc04). DT/DD/DL are the same shape for definition lists.
  TD: true,
  TH: true,
  DL: true,
  DT: true,
  DD: true,
  HR: true
};
var SILENT_TAGS = { SCRIPT: true, STYLE: true, NOSCRIPT: true };
function elementOf(node) {
  if (node === null || node === void 0) return null;
  if (node instanceof Element) return node;
  return node.parentElement;
}
function domToQuoteNodes(root) {
  var out = [];
  var children = root.childNodes;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (child.nodeType === 3) {
      out.push({ kind: "text", text: child.textContent || "" });
    } else if (child.nodeType === 1) {
      var el = child;
      var tag = el.tagName;
      if (tag === "BR") out.push({ kind: "break" });
      else if (SILENT_TAGS[tag] === true) continue;
      else if (BLOCK_TAGS[tag] === true) out.push({ kind: "block", children: domToQuoteNodes(el) });
      else out.push({ kind: "inline", children: domToQuoteNodes(el) });
    }
  }
  return out;
}
function extractQuoteText(sel, range) {
  try {
    var walked = quoteNodesToText(domToQuoteNodes(range.cloneContents()));
    if (isQuotableText(walked)) return normalizeQuoteText(walked);
  } catch {
  }
  return normalizeQuoteText(sel.toString());
}
function hide(setQuote) {
  setQuote(function(prev) {
    return prev === null ? prev : null;
  });
}
function makeQuoteButton() {
  return function QuoteButton(props) {
    var draft = props.useInput(function(input) {
      return input.draft;
    });
    var stateAndSet = react.useState(null);
    var quote = stateAndSet[0];
    var setQuote = stateAndSet[1];
    react.useEffect(function() {
      function onSelectionChange() {
        var sel = window.getSelection();
        if (sel === null || sel.isCollapsed || sel.rangeCount === 0 || sel.anchorNode === null || sel.focusNode === null) {
          hide(setQuote);
          return;
        }
        var anchorEl = elementOf(sel.anchorNode);
        var focusEl = elementOf(sel.focusNode);
        if (anchorEl === null || focusEl === null) {
          hide(setQuote);
          return;
        }
        if (anchorEl.closest("input,textarea,select,[contenteditable]") !== null) {
          hide(setQuote);
          return;
        }
        if (anchorEl.closest("[" + BUTTON_ATTR + "]") !== null) {
          hide(setQuote);
          return;
        }
        var anchorRow = anchorEl.closest("[" + FLOW_KIND_ATTR + "]");
        var focusRow = focusEl.closest("[" + FLOW_KIND_ATTR + "]");
        if (anchorRow === null || anchorRow !== focusRow) {
          hide(setQuote);
          return;
        }
        if (!isAssistantFlowKind(anchorRow.getAttribute(FLOW_KIND_ATTR))) {
          hide(setQuote);
          return;
        }
        var range = sel.getRangeAt(0);
        var text = extractQuoteText(sel, range);
        if (!isQuotableText(text)) {
          hide(setQuote);
          return;
        }
        var rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          hide(setQuote);
          return;
        }
        var focusNode = sel.focusNode;
        var focusEl = focusNode === null ? null : focusNode.nodeType === 1 ? focusNode : focusNode.parentElement;
        var fenced = anchorEl.closest("pre") !== null || focusEl !== null && focusEl.closest("pre") !== null;
        var x = Math.min(Math.max(rect.left + rect.width / 2, 72), window.innerWidth - 72);
        var above = rect.top >= 64;
        var y = above ? rect.top - 8 : rect.bottom + 8;
        setQuote(function(prev) {
          if (prev !== null && prev.text === text && prev.fenced === fenced && prev.x === x && prev.y === y && prev.above === above)
            return prev;
          return { text, fenced, x, y, above };
        });
      }
      document.addEventListener("selectionchange", onSelectionChange);
      return function() {
        document.removeEventListener("selectionchange", onSelectionChange);
      };
    }, []);
    react.useEffect(
      function() {
        if (quote === null) return void 0;
        function onScroll() {
          hide(setQuote);
        }
        function onKeyDown(e) {
          if (e.key === "Escape") hide(setQuote);
        }
        document.addEventListener("scroll", onScroll, true);
        document.addEventListener("keydown", onKeyDown);
        return function() {
          document.removeEventListener("scroll", onScroll, true);
          document.removeEventListener("keydown", onKeyDown);
        };
      },
      [quote]
    );
    if (quote === null) return null;
    function onMouseDown(e) {
      e.preventDefault();
    }
    function onClick() {
      var current = quote;
      if (current === null) return;
      props.inputActions.setDraft(appendToDraft(draft, toBlockquote(current.text, current.fenced)));
      setQuote(null);
      var sel = window.getSelection();
      if (sel !== null) sel.removeAllRanges();
    }
    return /* @__PURE__ */ react.createElement(
      "button",
      {
        type: "button",
        className: "quote-selection-float",
        "data-quote-selection": "1",
        "data-above": quote.above ? "1" : void 0,
        style: { position: "fixed", left: quote.x, top: quote.y },
        onMouseDown,
        onClick
      },
      BUTTON_LABEL
    );
  };
}
var name = PLUGIN_NAME;
var inject = ["slots"];
function apply(ctx) {
  injectStyle(PLUGIN_NAME, STYLE_TAG_ID, client_default);
  var Button = makeQuoteButton();
  ctx.slots.inject("conversation.input.dock", function() {
    return ctx.slots.register(
      { name: "conversation.input.dock", id: "quote-selection", order: 30 },
      function(props) {
        return /* @__PURE__ */ react.createElement(Button, { ...props });
      }
    );
  });
}
		return module.exports;
	}
});
