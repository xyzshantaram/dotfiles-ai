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
var react2 = __toESM(require("react"), 1);
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

// plugins/shared/plugin-modal.tsx
var import_react = __toESM(require("react"));

// css-text:/home/sid/repos/dotfiles-ai/plugins/shared/plugin-modal.module.css
var plugin_modal_default = `/* Shared modal component styles. Class names are kebab-case only. */

.plugin-modal-mask {
  /* Full-screen overlay with mask blur and semi-transparent background. */
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: center;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur);
}

.plugin-modal-panel {
  /* Dialog panel, centered by the overlay's grid layout. */
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-shadow-lv3);
  color: var(--dsw-alias-label-primary);
  padding: 20px;
  box-sizing: border-box;
  /* Default size: the settings-panel recipe (#35). */
  width: 800px;
  max-width: calc(100vw - 48px);
  height: min(800px, 100vh - 48px);
}

.plugin-modal-panel[data-size="compact"] {
  /* Compact variant for smaller modals. */
  width: 30rem;
  max-width: calc(100vw - 3rem);
  max-height: 60vh;
  height: auto;
}

.plugin-modal-header {
  /* Header row: title on the left, close button on the right. */
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
  flex: none;
}

.plugin-modal-title {
  /* Header title text. */
  font-size: 16px;
  font-weight: 600;
  line-height: 1.375rem;
  margin: 0;
  flex: 1;
}

.plugin-modal-close {
  /* Close button in the header. */
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  cursor: pointer;
  padding: 0;
  border-radius: 4px;
  transition: background-color 0.12s;
}

.plugin-modal-close:hover {
  background: var(--dsw-alias-bg-tertiary);
}

.plugin-modal-body {
  /* Scrollable body content. Fills the remaining space in the panel. */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.plugin-modal-footer {
  /* Optional footer row, typically for buttons. Stays fixed at the bottom. */
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
  flex: none;
  padding-top: 12px;
  border-top: 1px solid var(--dsw-alias-border-l3);
}
`;

// plugins/shared/plugin-modal.tsx
function CloseIcon() {
  return /* @__PURE__ */ import_react.default.createElement(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: "16",
      height: "16",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round"
    },
    /* @__PURE__ */ import_react.default.createElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" }),
    /* @__PURE__ */ import_react.default.createElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" })
  );
}
function PluginModal(props) {
  var size = props.size || "default";
  import_react.default.useEffect(
    function() {
      var onKeyDown = function(event) {
        if (event.key === "Escape") {
          props.onClose();
        }
      };
      document.addEventListener("keydown", onKeyDown);
      return function() {
        document.removeEventListener("keydown", onKeyDown);
      };
    },
    [props.onClose]
  );
  return /* @__PURE__ */ import_react.default.createElement("div", { className: plugin_modal_default["plugin-modal-mask"], onClick: props.onClose }, /* @__PURE__ */ import_react.default.createElement(
    "div",
    {
      className: plugin_modal_default["plugin-modal-panel"],
      "data-size": size,
      role: "dialog",
      "aria-labelledby": "plugin-modal-title",
      onClick: function(event) {
        event.stopPropagation();
      }
    },
    /* @__PURE__ */ import_react.default.createElement("div", { className: plugin_modal_default["plugin-modal-header"] }, /* @__PURE__ */ import_react.default.createElement("h2", { id: "plugin-modal-title", className: plugin_modal_default["plugin-modal-title"] }, props.title), /* @__PURE__ */ import_react.default.createElement(
      "button",
      {
        className: plugin_modal_default["plugin-modal-close"],
        onClick: props.onClose,
        "aria-label": "Close",
        type: "button"
      },
      /* @__PURE__ */ import_react.default.createElement(CloseIcon, null)
    )),
    /* @__PURE__ */ import_react.default.createElement("div", { className: plugin_modal_default["plugin-modal-body"] }, props.children),
    props.footer ? /* @__PURE__ */ import_react.default.createElement("div", { className: plugin_modal_default["plugin-modal-footer"] }, props.footer) : null
  ));
}

// css-text:/home/sid/repos/dotfiles-ai/plugins/composer-approvals/src/client.module.css
var client_default = "/* Pending-approval indicator at the composer. */\n.composer-approvals-indicator {\n  position: relative;\n  width: 20px;\n  height: 20px;\n  flex: none;\n  display: grid;\n  place-items: center;\n  border: none;\n  border-radius: 999px;\n  padding: 0;\n  cursor: pointer;\n  background: var(--dsw-alias-state-warn-primary, #d97706);\n  color: #fff;\n}\n.composer-approvals-indicator:hover {\n  filter: brightness(1.08);\n}\n.composer-approvals-glyph {\n  font-size: 13px;\n  font-weight: 700;\n  line-height: 1;\n}\n.composer-approvals-count {\n  position: absolute;\n  top: -5px;\n  right: -7px;\n  min-width: 14px;\n  height: 14px;\n  box-sizing: border-box;\n  padding: 0 3px;\n  border-radius: 999px;\n  background: var(--dsw-alias-state-danger-primary, #dc2626);\n  color: #fff;\n  font-size: 9px;\n  font-weight: 600;\n  line-height: 14px;\n  text-align: center;\n}\n.composer-approvals-list {\n  list-style: none;\n  margin: 0;\n  padding: 0;\n  overflow-y: auto;\n  display: flex;\n  flex-direction: column;\n  gap: 8px;\n}\n.composer-approvals-row {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  min-width: 0;\n}\n.composer-approvals-label {\n  flex: 1 1 auto;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 13px;\n  font-family: var(--dsw-alias-font-mono, monospace);\n}\n.composer-approvals-jump {\n  flex: none;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 999px;\n  background: 0 0;\n  color: var(--dsw-alias-label-primary);\n  font-size: 12px;\n  padding: 3px 10px;\n  cursor: pointer;\n}\n.composer-approvals-jump:hover:enabled {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.composer-approvals-jump:disabled {\n  opacity: 0.45;\n  cursor: default;\n}\n.composer-approvals-no-call {\n  flex: none;\n  font-size: 12px;\n  color: var(--dsw-alias-label-tertiary);\n}\n/* Inline answer buttons for a no-callId row: the card answer bar is the\n   single answer surface for callId approvals, so those rows keep only\n   their jump button. Reject arms first; the armed fill marks the confirm\n   step. */\n.composer-approvals-approve,\n.composer-approvals-reject {\n  flex: none;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 999px;\n  background: 0 0;\n  font-size: 12px;\n  padding: 3px 10px;\n  cursor: pointer;\n}\n.composer-approvals-approve {\n  color: var(--dsw-alias-state-business-primary, #2563eb);\n  border-color: var(--dsw-alias-state-business-primary, #2563eb);\n}\n.composer-approvals-reject {\n  color: var(--dsw-alias-state-danger-primary, #dc2626);\n  border-color: var(--dsw-alias-state-danger-primary, #dc2626);\n}\n.composer-approvals-approve:hover:enabled,\n.composer-approvals-reject:hover:enabled {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.composer-approvals-approve:disabled,\n.composer-approvals-reject:disabled {\n  opacity: 0.45;\n  cursor: default;\n}\n.composer-approvals-reject[data-armed] {\n  background: var(--dsw-alias-state-danger-primary, #dc2626);\n  border-color: var(--dsw-alias-state-danger-primary, #dc2626);\n  color: #fff;\n}\n";

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
  var armedState = react2.useState(false);
  var armed = armedState[0];
  var setArmed = armedState[1];
  var answeredState = react2.useState(false);
  var answered = answeredState[0];
  var setAnswered = answeredState[1];
  var armTimer = react2.useRef(0);
  react2.useEffect(function() {
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
    return /* @__PURE__ */ react2.createElement("li", { className: "composer-approvals-row" }, /* @__PURE__ */ react2.createElement("span", { className: "composer-approvals-label", title: row.label }, row.label), /* @__PURE__ */ react2.createElement(
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
  return /* @__PURE__ */ react2.createElement("li", { className: "composer-approvals-row" }, /* @__PURE__ */ react2.createElement("span", { className: "composer-approvals-label", title: row.label }, row.label), /* @__PURE__ */ react2.createElement("span", { className: "composer-approvals-no-call" }, "no tool call"), /* @__PURE__ */ react2.createElement(
    "button",
    {
      type: "button",
      className: "composer-approvals-approve",
      disabled: answered,
      onClick: function() {
        answer("allowed-once");
      }
    },
    "\u2713 Approve"
  ), /* @__PURE__ */ react2.createElement(
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
    var selectorTools = react2.useMemo(makeSelector, []);
    var rows = props.useSession(selectorTools.selectApprovals);
    var openState = react2.useState(false);
    var open = openState[0];
    var setOpen = openState[1];
    var missingState = react2.useState(function() {
      return /* @__PURE__ */ new Set();
    });
    var missing = missingState[0];
    var setMissing = missingState[1];
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
      return /* @__PURE__ */ react2.createElement(
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
    return /* @__PURE__ */ react2.createElement(react2.Fragment, null, /* @__PURE__ */ react2.createElement(
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
      /* @__PURE__ */ react2.createElement("span", { className: "composer-approvals-glyph", "aria-hidden": true }, "!"),
      rows.length > 1 ? /* @__PURE__ */ react2.createElement("span", { className: "composer-approvals-count", "aria-hidden": true }, rows.length) : null
    ), open ? /* @__PURE__ */ react2.createElement(
      PluginModal,
      {
        title: "Pending approvals",
        onClose: function() {
          setOpen(false);
        },
        size: "compact"
      },
      /* @__PURE__ */ react2.createElement("ul", { className: "composer-approvals-list" }, list)
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
