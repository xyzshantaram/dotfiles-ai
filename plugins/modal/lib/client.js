window.__ModuleLoader__.load({
	id: "modal",
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

// plugins/modal/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react2 = __toESM(require("react"), 1);

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
var plugin_modal_default = "/* Shared modal component styles. Class names are kebab-case only.\n *\n * This stylesheet is the modal's ONLY sizing surface. The component injects\n * it once (plugin-modal.tsx) and picks between exactly two standard sizes\n * through the panel's `data-size` attribute, so a caller cannot invent a\n * third size, and cannot re-align the action row, from its own stylesheet.\n */\n\n.plugin-modal-mask {\n  /* Full-screen overlay with mask blur and semi-transparent background. */\n  position: fixed;\n  inset: 0;\n  z-index: 200;\n  display: grid;\n  place-items: center;\n  /* The SAFE BOX: 24px of inset on every side. Both standard sizes measure\n     their caps against this box, which is what makes the compact size's\n     `max-width: 100%` / `max-height: 100%` mean \"the safe box\" rather than\n     \"the raw viewport\". It is also exactly the 48px total that the full\n     size's calc()/min() expressions subtract, so the two sizes agree. */\n  padding: 24px;\n  box-sizing: border-box;\n  background: var(--dsw-alias-bg-mask-1);\n  backdrop-filter: var(--dsw-mask-blur);\n}\n\n.plugin-modal-panel {\n  /* Dialog panel, centered by the overlay's grid layout. Mask, radius and\n     elevation are the settings-panel family's; only the sizing below\n     differs between the two standard sizes. */\n  display: flex;\n  flex-direction: column;\n  border-radius: 24px;\n  background: var(--dsw-alias-bg-layer-2);\n  box-shadow: var(--dsw-shadow-lv3);\n  color: var(--dsw-alias-label-primary);\n  padding: 20px;\n  box-sizing: border-box;\n  /* The PANEL never scrolls -- the body is the modal's single scroller. */\n  overflow: hidden;\n  min-height: 0;\n\n  /* SIZE 1 of 2, FULL (the default): the settings-panel spec (#35). This is\n     also the base rule, so markup that somehow loses its data-size still\n     lands on a standard size instead of an unsized panel. */\n  width: 800px;\n  max-width: calc(100vw - 48px);\n  height: min(800px, 100vh - 48px);\n}\n\n.plugin-modal-panel[data-size=\"compact\"] {\n  /* SIZE 2 of 2, COMPACT: the aidos modal spec. Fixed 420px wide, capped by\n     the mask safe box on both axes, and auto-height so a short modal stays\n     short. When the cap bites the panel still does not scroll: the body\n     does. */\n  width: 420px;\n  max-width: 100%;\n  max-height: 100%;\n  height: auto;\n}\n\n.plugin-modal-header {\n  /* Header row: title on the left, close button on the right. */\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n  margin-bottom: 16px;\n  flex: none;\n}\n\n.plugin-modal-title {\n  /* Header title text. */\n  font-size: 16px;\n  font-weight: 600;\n  line-height: 1.375rem;\n  margin: 0;\n  flex: 1;\n}\n\n.plugin-modal-close {\n  /* Close button in the header. */\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  flex: none;\n  width: 24px;\n  height: 24px;\n  border: none;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n  padding: 0;\n  border-radius: 4px;\n  transition: background-color 0.12s;\n}\n\n.plugin-modal-close:hover {\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n.plugin-modal-body {\n  /* The modal's single scroller, filling whatever the header and the action\n     row leave. A flex column on purpose: it lets a caller mark one region as\n     the flexible one (job-viewer's output box is `flex: 1`) so that region\n     keeps a CONSTANT height and scrolls internally instead of growing the\n     panel with its content. */\n  display: flex;\n  flex-direction: column;\n  flex: 1;\n  min-height: 0;\n  overflow-y: auto;\n  overflow-x: hidden;\n}\n\n.plugin-modal-actions,\n.plugin-modal-footer {\n  /* Action buttons are ALWAYS right-aligned. The shared component wraps\n     whatever the caller passes as `actions` in this row, so the alignment is\n     structural: no caller has to ask for it and no caller can opt out of it.\n     Stays fixed at the bottom while the body scrolls. */\n  display: flex;\n  align-items: center;\n  justify-content: flex-end;\n  gap: 8px;\n  margin-top: 16px;\n  flex: none;\n  padding-top: 12px;\n  border-top: 1px solid var(--dsw-alias-border-l3);\n}\n";

// plugins/shared/plugin-modal.tsx
var STYLE_OWNER = "shared";
var STYLE_ID = "shared/plugin-modal.css";
injectStyle(STYLE_OWNER, STYLE_ID, plugin_modal_default);
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
function standardSize(size) {
  return size === "compact" ? "compact" : "full";
}
function PluginModal(props) {
  var size = standardSize(props.size);
  var actions = props.actions !== void 0 && props.actions !== null ? props.actions : props.footer;
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
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "plugin-modal-mask", onClick: props.onClose }, /* @__PURE__ */ import_react.default.createElement(
    "div",
    {
      className: "plugin-modal-panel",
      "data-size": size,
      role: "dialog",
      "aria-labelledby": "plugin-modal-title",
      onClick: function(event) {
        event.stopPropagation();
      }
    },
    /* @__PURE__ */ import_react.default.createElement("div", { className: "plugin-modal-header" }, /* @__PURE__ */ import_react.default.createElement("h2", { id: "plugin-modal-title", className: "plugin-modal-title" }, props.title), /* @__PURE__ */ import_react.default.createElement(
      "button",
      {
        className: "plugin-modal-close",
        onClick: props.onClose,
        "aria-label": "Close",
        type: "button"
      },
      /* @__PURE__ */ import_react.default.createElement(CloseIcon, null)
    )),
    /* @__PURE__ */ import_react.default.createElement("div", { className: "plugin-modal-body" }, props.children),
    actions ? /* @__PURE__ */ import_react.default.createElement("div", { className: "plugin-modal-actions" }, actions) : null
  ));
}

// css-text:/home/sid/repos/dotfiles-ai/plugins/modal/src/client.module.css
var client_default = "/* The modal host's own chrome \u2014 everything that is NOT the shared component.\n *\n * The modal itself (mask, panel, header, body, actions row, and both\n * standard sizes) lives in plugins/shared/plugin-modal.module.css and is\n * injected by that component when this plugin's container imports it. That\n * sheet is the modal's ONLY sizing surface: nothing here redefines a\n * `plugin-modal-*` class, re-aligns the actions row, or adds a third size,\n * and registry.test.ts pins that absence.\n *\n * What belongs here instead is shell-owned chrome AROUND the component \u2014\n * today that is nothing, and this sheet exists (imported and injected by\n * client.tsx like every other client half) so the next shell-owned surface\n * (the #103 attention tab bar, settled to live in this plugin) has a home\n * that is not a caller's stylesheet.\n */\n";

// plugins/modal/src/registry.ts
var MODAL_API_VERSION = 1;
var idCounter = 0;
function makeModalId() {
  const c = globalThis;
  if (typeof c.crypto?.randomUUID === "function") return c.crypto.randomUUID();
  idCounter += 1;
  return "modal-" + String(idCounter) + "-" + String(Date.now());
}
function createModalRegistry() {
  let open = [];
  const listeners = /* @__PURE__ */ new Set();
  function emit() {
    const snapshot = open.slice();
    for (const listener of listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        console.error("[modal] listener threw:", error);
      }
    }
  }
  return {
    open(request) {
      if (request === null || typeof request !== "object") {
        throw new TypeError("[modal] open() needs a request object");
      }
      const id = makeModalId();
      open = open.concat({ ...request, id });
      emit();
      return id;
    },
    close(id) {
      const next = open.filter((record) => record.id !== id);
      if (next.length === open.length) return false;
      open = next;
      emit();
      return true;
    },
    getOpen() {
      return open.slice();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    }
  };
}

// plugins/modal/src/client.tsx
var PLUGIN_NAME = "modal";
var STYLE_TAG_ID = "dsh-modal-styles";
var inject = ["slots"];
var name = PLUGIN_NAME;
var registry = createModalRegistry();
function closeRecord(record) {
  registry.close(record.id);
  if (typeof record.onClose === "function") {
    try {
      record.onClose();
    } catch (error) {
      console.error("[modal] onClose threw:", error);
    }
  }
}
function ModalEntry(props) {
  var record = props.record;
  return /* @__PURE__ */ import_react2.default.createElement(
    PluginModal,
    {
      title: record.title,
      size: record.size,
      onClose: function() {
        closeRecord(record);
      },
      actions: record.actions
    },
    record.body
  );
}
function ModalHost() {
  const [open, setOpen] = import_react2.default.useState(function() {
    return registry.getOpen();
  });
  import_react2.default.useEffect(function() {
    setOpen(registry.getOpen());
    return registry.subscribe(setOpen);
  }, []);
  if (open.length === 0) return null;
  return /* @__PURE__ */ import_react2.default.createElement(import_react2.default.Fragment, null, open.map(function(record) {
    return /* @__PURE__ */ import_react2.default.createElement(ModalEntry, { key: record.id, record });
  }));
}
function apply(ctx) {
  ctx.effect(function() {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, client_default);
  }, "modal: styles");
  ctx.effect(function() {
    const api = {
      version: MODAL_API_VERSION,
      open: function(request) {
        return registry.open(request);
      },
      close: function(id) {
        return registry.close(id);
      },
      subscribe: function(listener) {
        return registry.subscribe(listener);
      }
    };
    globalThis.__dshModal__ = api;
    return function() {
      if (globalThis.__dshModal__ === api) {
        delete globalThis.__dshModal__;
      }
    };
  }, "modal: window.__dshModal__");
  ctx.slots.inject("shell.overlay", function() {
    return ctx.slots.register({ name: "shell.overlay", id: PLUGIN_NAME }, ModalHost);
  });
}
		return module.exports;
	}
});
