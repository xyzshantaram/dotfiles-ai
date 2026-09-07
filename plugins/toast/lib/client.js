window.__ModuleLoader__.load({
	id: "toast",
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

// plugins/toast/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);

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

// css-text:/home/sid/repos/dotfiles-ai/plugins/toast/src/client.module.css
var client_default = "/* The stack itself never eats clicks: it spans a strip of the viewport and\n   most of it is empty. Only the toast rows opt back in. */\n.dsh-toast-stack {\n  position: fixed;\n  left: 50%;\n  bottom: 32px;\n  transform: translateX(-50%);\n  z-index: 2147483000;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  gap: 8px;\n  pointer-events: none;\n}\n\n.dsh-toast {\n  pointer-events: auto;\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  max-width: min(560px, calc(100vw - 32px));\n  padding: 8px 14px;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-bg-layer-1);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-left-width: 3px;\n  border-radius: 6px;\n  box-shadow: 0 8px 24px rgb(0 0 0 / 0.4);\n}\n\n.dsh-toast-text {\n  white-space: pre-wrap;\n  overflow-wrap: anywhere;\n}\n\n/* Kind shows as a left edge rather than a coloured background, so long text\n   stays as readable as the rest of the UI. */\n.dsh-toast-refusal {\n  border-left-color: var(--dsw-alias-state-error-primary);\n}\n.dsh-toast-info {\n  border-left-color: var(--dsw-alias-state-business-primary);\n}\n.dsh-toast-success {\n  border-left-color: var(--dsw-alias-state-success-primary);\n}\n\n.dsh-toast-dismiss {\n  cursor: pointer;\n  flex: none;\n  border: none;\n  background: none;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 16px;\n  line-height: 16px;\n}\n.dsh-toast-dismiss:hover {\n  color: var(--dsw-alias-label-primary);\n}\n";

// plugins/toast/src/store.ts
var TOAST_DURATION_MS = 6e3;
var toasts = [];
var listeners = /* @__PURE__ */ new Set();
var timers = /* @__PURE__ */ new Map();
var idCounter = 0;
function makeToastId() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  idCounter += 1;
  return "toast-" + String(idCounter) + "-" + String(Date.now());
}
function emit() {
  const snapshot = toasts.slice();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error("[toast] listener threw:", error);
    }
  }
}
function removeToast(id) {
  const timer = timers.get(id);
  if (timer !== void 0) {
    globalThis.clearTimeout(timer);
    timers.delete(id);
  }
  const next = toasts.filter((toast) => toast.id !== id);
  if (next.length === toasts.length) return;
  toasts = next;
  emit();
}
function getToasts() {
  return toasts;
}
function showToast(text, kind = "info", durationMs = TOAST_DURATION_MS) {
  const id = makeToastId();
  toasts = toasts.concat({ id, text, kind, expiresAt: Date.now() + durationMs });
  emit();
  timers.set(
    id,
    globalThis.setTimeout(() => {
      removeToast(id);
    }, durationMs)
  );
  return id;
}
function dismissToast(id) {
  removeToast(id);
}
function subscribeToasts(listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// plugins/toast/src/client.tsx
var PLUGIN_NAME = "toast";
var STYLE_TAG_ID = "dsh-toast-styles";
var TOAST_API_VERSION = 1;
var inject = ["slots"];
var name = PLUGIN_NAME;
function ToastStack() {
  const [toasts2, setToasts] = import_react.default.useState(getToasts());
  import_react.default.useEffect(function() {
    setToasts(getToasts());
    return subscribeToasts(setToasts);
  }, []);
  if (toasts2.length === 0) return null;
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dsh-toast-stack" }, toasts2.map(function(toast) {
    return /* @__PURE__ */ import_react.default.createElement(
      "div",
      {
        key: toast.id,
        className: "dsh-toast dsh-toast-" + toast.kind,
        role: "status",
        "aria-live": "polite"
      },
      /* @__PURE__ */ import_react.default.createElement("span", { className: "dsh-toast-text" }, toast.text),
      /* @__PURE__ */ import_react.default.createElement(
        "button",
        {
          className: "dsh-toast-dismiss",
          "aria-label": "Dismiss notification",
          onClick: function() {
            dismissToast(toast.id);
          }
        },
        "\xD7"
      )
    );
  }));
}
function apply(ctx) {
  ctx.effect(function() {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, client_default);
  }, "toast: styles");
  ctx.effect(function() {
    const api = {
      version: TOAST_API_VERSION,
      show: showToast,
      dismiss: dismissToast,
      subscribe: subscribeToasts
    };
    globalThis.__dshToast__ = api;
    return function() {
      if (globalThis.__dshToast__ === api) {
        delete globalThis.__dshToast__;
      }
    };
  }, "toast: window.__dshToast__");
  ctx.slots.inject("shell.overlay", function() {
    return ctx.slots.register({ name: "shell.overlay", id: PLUGIN_NAME }, ToastStack);
  });
}
		return module.exports;
	}
});
