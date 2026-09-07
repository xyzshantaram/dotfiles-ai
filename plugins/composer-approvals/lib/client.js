window.__ModuleLoader__.load({
	id: "composer-approvals",
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

// plugins/composer-approvals/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var react = __toESM(require("react"), 1);
var runtime = __toESM(require("@deepseek-ai/dsh-client-runtime/client"), 1);

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

// css-text:/home/sid/repos/dotfiles-ai/plugins/composer-approvals/src/client.module.css
var client_default = "/* Pending-approval indicator and modal at the composer. */\n.composer-approvals-indicator {\n  position: relative;\n  width: 20px;\n  height: 20px;\n  flex: none;\n  display: grid;\n  place-items: center;\n  border: none;\n  border-radius: 999px;\n  padding: 0;\n  cursor: pointer;\n  background: var(--dsw-alias-state-warn-primary, #d97706);\n  color: #fff;\n}\n.composer-approvals-indicator:hover {\n  filter: brightness(1.08);\n}\n.composer-approvals-glyph {\n  font-size: 13px;\n  font-weight: 700;\n  line-height: 1;\n}\n.composer-approvals-count {\n  position: absolute;\n  top: -5px;\n  right: -7px;\n  min-width: 14px;\n  height: 14px;\n  box-sizing: border-box;\n  padding: 0 3px;\n  border-radius: 999px;\n  background: var(--dsw-alias-state-danger-primary, #dc2626);\n  color: #fff;\n  font-size: 9px;\n  font-weight: 600;\n  line-height: 14px;\n  text-align: center;\n}\n.composer-approvals-overlay {\n  position: fixed;\n  inset: 0;\n  z-index: 200;\n  display: grid;\n  place-items: center;\n  background: var(--dsw-alias-bg-mask-1);\n  backdrop-filter: var(--dsw-mask-blur);\n}\n.composer-approvals-panel {\n  width: 30rem;\n  max-width: calc(100vw - 3rem);\n  max-height: 60vh;\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  border-radius: 24px;\n  background: var(--dsw-alias-bg-layer-2);\n  box-shadow: var(--dsw-shadow-lv3);\n  color: var(--dsw-alias-label-primary);\n  padding: 20px;\n}\n.composer-approvals-title {\n  font-size: 15px;\n  font-weight: 600;\n  margin-bottom: 12px;\n}\n.composer-approvals-list {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  overflow-y: auto;\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n.composer-approvals-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n}\n.composer-approvals-label {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 13px;\n  font-family: var(--dsw-alias-font-mono, monospace);\n}\n.composer-approvals-jump {\n  flex: none;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 999px;\n  background: 0 0;\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n  padding: 3px 10px;\n  cursor: pointer;\n}\n.composer-approvals-jump:hover:enabled {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.composer-approvals-jump:disabled {\n  opacity: 0.45;\n  cursor: default;\n}\n.composer-approvals-no-call {\n  flex: none;\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n}\n/* Inline answer buttons for a no-callId row: the card answer bar is the\n   single answer surface for callId approvals, so those rows keep only\n   their jump button. Reject arms first; the armed fill marks the confirm\n   step. */\n.composer-approvals-approve,\n.composer-approvals-reject {\n  flex: none;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 999px;\n  background: 0 0;\n  font-size: 12px;\n  padding: 3px 10px;\n  cursor: pointer;\n}\n.composer-approvals-approve {\n  color: var(--dsw-alias-state-business-primary, #2563eb);\n  border-color: var(--dsw-alias-state-business-primary, #2563eb);\n}\n.composer-approvals-reject {\n  color: var(--dsw-alias-state-danger-primary, #dc2626);\n  border-color: var(--dsw-alias-state-danger-primary, #dc2626);\n}\n.composer-approvals-approve:hover:enabled,\n.composer-approvals-reject:hover:enabled {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.composer-approvals-approve:disabled,\n.composer-approvals-reject:disabled {\n  opacity: 0.45;\n  cursor: default;\n}\n.composer-approvals-reject[data-armed] {\n  background: var(--dsw-alias-state-danger-primary, #dc2626);\n  border-color: var(--dsw-alias-state-danger-primary, #dc2626);\n  color: #fff;\n}\n";

// plugins/composer-approvals/src/client.tsx
var conversationContextKey2 = runtime.conversationContextKey;
var PLUGIN_NAME = "composer-approvals";
var EMPTY = [];
var REJECT_ARM_RESET_MS = 4e3;
function rootToolCall(snapshot, callId) {
  var node = snapshot.chat && snapshot.chat.nodes.get(conversationContextKey2("tool-call", callId));
  if (node === void 0 || node === null) return void 0;
  var root = node.data && node.data.root;
  if (root === void 0 || root === null) return void 0;
  return root;
}
function commandOf(call) {
  if (call === void 0) return void 0;
  try {
    var args = JSON.parse(call.argsRaw);
    return typeof args.command === "string" ? args.command : void 0;
  } catch {
    return void 0;
  }
}
function firstLineOf(text) {
  if (typeof text !== "string") return null;
  var line = text.split("\n", 1)[0].trim();
  return line === "" ? null : line;
}
function makeSelector() {
  var lastSig = "\0";
  var lastRows = EMPTY;
  var pendingByKey = /* @__PURE__ */ new Map();
  var selectApprovals = function(snapshot) {
    var pending = snapshot !== null && snapshot !== void 0 && Array.isArray(snapshot.pending) ? snapshot.pending : EMPTY;
    var parts = [];
    var rows = [];
    var live = /* @__PURE__ */ new Set();
    for (var i = 0; i < pending.length; i++) {
      var item = pending[i];
      if (item === null || item === void 0 || item.kind !== "approval") continue;
      var payload = item !== null && item.payload || {};
      var callId = typeof payload.callId === "string" ? payload.callId : null;
      var label = null;
      if (callId !== null) {
        label = commandOf(rootToolCall(snapshot, callId)) ?? null;
      }
      if (label === null) label = firstLineOf(payload.reason);
      var key = String(item.key);
      parts.push(key + "\0" + (callId === null ? "" : callId) + "\0" + label);
      live.add(key);
      pendingByKey.set(key, item);
      rows.push({
        key,
        callId,
        approvalId: payload.approvalId,
        label: label === null ? "Approval" : label
      });
    }
    for (var key of Array.from(pendingByKey.keys())) {
      if (!live.has(key)) pendingByKey.delete(key);
    }
    var sig = parts.join("");
    if (sig === lastSig) return lastRows;
    lastSig = sig;
    lastRows = rows;
    return rows;
  };
  return {
    selectApprovals,
    pendingOf: function(key) {
      return pendingByKey.get(key);
    }
  };
}
function cardOf(callId) {
  return document.querySelector('.tool-render-card[data-call-id="' + CSS.escape(callId) + '"]');
}
function ComposerApprovalsRow(props) {
  var row = props.row;
  var armedState = react.useState(false);
  var armed = armedState[0];
  var setArmed = armedState[1];
  var answeredState = react.useState(false);
  var answered = answeredState[0];
  var setAnswered = answeredState[1];
  var armTimer = react.useRef(0);
  react.useEffect(function() {
    return function() {
      if (armTimer.current !== 0) window.clearTimeout(armTimer.current);
    };
  }, []);
  var answer = function(outcome) {
    if (answered) return;
    var pending = props.pendingOf(row.key);
    if (pending === void 0 || pending === null) {
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
            outcome
          }
        })
      ).then(function(receipt) {
        if (receipt === void 0 || receipt === null || !receipt.accepted) {
          throw new Error(
            "approval response rejected: " + (receipt === void 0 || receipt === null || receipt.reason === void 0 ? "unknown" : receipt.reason)
          );
        }
      }).catch(function(error) {
        console.warn("[composer-approvals] answer failed", row.key, outcome, error);
        setAnswered(false);
      });
    } catch (error) {
      console.warn("[composer-approvals] answer failed", row.key, outcome, error);
      setAnswered(false);
    }
  };
  var clearArm = function() {
    if (armTimer.current !== 0) {
      window.clearTimeout(armTimer.current);
      armTimer.current = 0;
    }
  };
  var onReject = function() {
    if (answered) return;
    if (armed) {
      clearArm();
      setArmed(false);
      answer("rejected");
      return;
    }
    setArmed(true);
    clearArm();
    armTimer.current = window.setTimeout(function() {
      armTimer.current = 0;
      setArmed(false);
    }, REJECT_ARM_RESET_MS);
  };
  if (row.callId !== null) {
    return /* @__PURE__ */ react.createElement("li", { className: "composer-approvals-row" }, /* @__PURE__ */ react.createElement("span", { className: "composer-approvals-label", title: row.label }, row.label), /* @__PURE__ */ react.createElement(
      "button",
      {
        type: "button",
        className: "composer-approvals-jump",
        disabled: !props.jumpable,
        onClick: function() {
          props.onJump(row);
        }
      },
      "Jump to call"
    ));
  }
  return /* @__PURE__ */ react.createElement("li", { className: "composer-approvals-row" }, /* @__PURE__ */ react.createElement("span", { className: "composer-approvals-label", title: row.label }, row.label), /* @__PURE__ */ react.createElement("span", { className: "composer-approvals-no-call" }, "no tool call"), /* @__PURE__ */ react.createElement(
    "button",
    {
      type: "button",
      className: "composer-approvals-approve",
      disabled: answered,
      onClick: function() {
        answer("approved");
      }
    },
    "\u2713 Approve"
  ), /* @__PURE__ */ react.createElement(
    "button",
    {
      type: "button",
      className: "composer-approvals-reject",
      "data-armed": armed || void 0,
      disabled: answered,
      onClick: onReject
    },
    armed ? "? Confirm reject" : "\u2717 Reject"
  ));
}
function makeIndicator() {
  return function Indicator(props) {
    var selectorTools = react.useMemo(makeSelector, []);
    var rows = props.useSession(selectorTools.selectApprovals);
    var openState = react.useState(false);
    var open = openState[0];
    var setOpen = openState[1];
    var missingState = react.useState(function() {
      return /* @__PURE__ */ new Set();
    });
    var missing = missingState[0];
    var setMissing = missingState[1];
    react.useEffect(
      function() {
        if (!open) return;
        var onKey = function(event) {
          if (event.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return function() {
          window.removeEventListener("keydown", onKey);
        };
      },
      [open]
    );
    if (rows.length === 0) return null;
    var jump = function(row) {
      if (row.callId === null) return;
      var el = cardOf(row.callId);
      if (el === null) {
        setMissing(function(prev) {
          var next = new Set(prev);
          next.add(row.key);
          return next;
        });
        return;
      }
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setOpen(false);
    };
    var list = rows.map(function(row) {
      var jumpable = row.callId !== null && !missing.has(row.key);
      return /* @__PURE__ */ react.createElement(
        ComposerApprovalsRow,
        {
          key: row.key,
          row,
          jumpable,
          onJump: jump,
          pendingOf: selectorTools.pendingOf
        }
      );
    });
    return /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement(
      "button",
      {
        type: "button",
        className: "composer-approvals-indicator",
        "aria-label": "Pending approvals",
        "data-dsh-tip": "",
        title: "Pending approvals",
        onClick: function() {
          setOpen(true);
        }
      },
      /* @__PURE__ */ react.createElement("span", { className: "composer-approvals-glyph", "aria-hidden": true }, "!"),
      rows.length > 1 ? /* @__PURE__ */ react.createElement("span", { className: "composer-approvals-count", "aria-hidden": true }, rows.length) : null
    ), open ? /* @__PURE__ */ react.createElement(
      "div",
      {
        className: "composer-approvals-overlay",
        onClick: function() {
          setOpen(false);
        }
      },
      /* @__PURE__ */ react.createElement(
        "div",
        {
          className: "composer-approvals-panel",
          role: "dialog",
          "aria-label": "Pending approvals",
          onClick: function(event) {
            event.stopPropagation();
          }
        },
        /* @__PURE__ */ react.createElement("div", { className: "composer-approvals-title" }, "Pending approvals"),
        /* @__PURE__ */ react.createElement("ul", { className: "composer-approvals-list" }, list)
      )
    ) : null);
  };
}
var name = PLUGIN_NAME;
var inject = ["slots"];
function apply(ctx) {
  injectStyle(PLUGIN_NAME, "composer-approvals", client_default);
  var Indicator = makeIndicator();
  ctx.slots.inject("conversation.input.left", function* () {
    yield ctx.slots.register(
      {
        name: "conversation.input.left",
        id: "composer-approvals-indicator",
        order: -99
      },
      Indicator
    );
  });
}
		return module.exports;
	}
});
