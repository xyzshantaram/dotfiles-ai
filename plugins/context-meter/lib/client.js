window.__ModuleLoader__.load({
	id: "context-meter",
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

// plugins/context-meter/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var react2 = __toESM(require("react"), 1);

// plugins/shared/client-react.ts
var react = __toESM(require("react"));
function useDismissable(open, rootRef, onClose) {
  react.useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const onPointerDown = (event) => {
      const root = rootRef.current;
      if (root !== null && event.target instanceof Node && root.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
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
var SHIPPED_CSS_OWNER = "@deepseek-ai/dsh-client-ui-conversation/";
function shippedClass(moduleName, suffix) {
  if (typeof document === "undefined") return null;
  const tag = document.querySelector(
    'style[data-plugin-css="' + SHIPPED_CSS_OWNER + moduleName + '"]'
  );
  if (tag === null) return null;
  const found = new RegExp("\\.([A-Za-z0-9_-]+" + suffix + ")\\s*\\{").exec(tag.textContent || "");
  return found === null ? null : found[1];
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

// css-text:/home/sid/repos/dotfiles-ai/plugins/context-meter/src/client.module.css
var client_default = ".ctx-meter-root {\n  display: inline-flex;\n  position: relative;\n}\n.ctx-meter-trigger {\n  width: 30px;\n  height: 30px;\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n  background: 0 0;\n  border: none;\n  border-radius: 999px;\n  flex: none;\n  place-items: center;\n  display: grid;\n  padding: 0;\n}\n.ctx-meter-trigger:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.ctx-meter-track {\n  fill: none;\n  stroke: var(--dsw-alias-border-l2);\n  stroke-width: 2.5px;\n}\n.ctx-meter-fill {\n  fill: none;\n  stroke: var(--dsw-alias-label-primary);\n  stroke-width: 2.5px;\n  stroke-linecap: round;\n}\n.ctx-meter-tip {\n  z-index: 100;\n  pointer-events: none;\n  white-space: nowrap;\n  border: 1px solid var(--dsw-alias-border-inverted);\n  background: var(--dsw-specific-menu);\n  box-shadow: var(--dsw-shadow-lv3);\n  color: var(--dsw-alias-label-secondary);\n  border-radius: 8px;\n  padding: 4px 8px;\n  font-size: 12px;\n  line-height: 18px;\n  font-variant-numeric: tabular-nums;\n  position: absolute;\n  bottom: calc(100% + 8px);\n  right: 0;\n}\n.ctx-meter-panel {\n  z-index: 100;\n  box-sizing: border-box;\n  border: 1px solid var(--dsw-alias-border-inverted);\n  background: var(--dsw-specific-menu);\n  width: 296px;\n  box-shadow: var(--dsw-shadow-lv3);\n  color: var(--dsw-alias-label-secondary);\n  cursor: default;\n  border-radius: 12px;\n  padding: 12px;\n  font-size: 12px;\n  line-height: 20px;\n  position: absolute;\n  bottom: calc(100% + 8px);\n  right: 0;\n}\n.ctx-meter-title {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 500;\n}\n.ctx-meter-half + .ctx-meter-half {\n  margin-top: 12px;\n  padding-top: 10px;\n  border-top: 1px solid var(--dsw-alias-border-l3);\n}\n.ctx-meter-head {\n  align-items: baseline;\n  gap: 6px;\n  display: flex;\n}\n.ctx-meter-figures {\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-primary);\n  margin-left: auto;\n  font-weight: 500;\n}\n.ctx-meter-bar {\n  background: var(--dsw-alias-interactive-bg-hover);\n  border-radius: 999px;\n  gap: 1px;\n  height: 4px;\n  margin: 8px 0 6px;\n  display: flex;\n  overflow: hidden;\n}\n.ctx-meter-segment {\n  background: var(--meter-tint, var(--dsw-alias-label-tertiary));\n  border-radius: 1px;\n  flex: none;\n  min-width: 2px;\n  height: 100%;\n}\n.ctx-meter-swatch {\n  background: var(--meter-tint);\n  vertical-align: baseline;\n  border-radius: 2px;\n  width: 8px;\n  height: 8px;\n  margin-right: 6px;\n  display: inline-block;\n}\n.ctx-meter-color-system {\n  --meter-tint: var(--dsw-static-neutral-bluish-400);\n}\n.ctx-meter-color-tools {\n  --meter-tint: #a78bfa;\n}\n.ctx-meter-color-messages {\n  --meter-tint: var(--dsw-static-blue-450);\n}\n.ctx-meter-rows {\n  margin: 4px 0 0;\n}\n.ctx-meter-row {\n  justify-content: space-between;\n  align-items: center;\n  gap: 12px;\n  padding: 2px 0;\n  display: flex;\n}\n.ctx-meter-row dt {\n  color: var(--dsw-alias-label-secondary);\n}\n.ctx-meter-row dd {\n  font-variant-numeric: tabular-nums;\n  color: var(--dsw-alias-label-primary);\n  margin: 0;\n}\n.ctx-meter-sub dt {\n  padding-left: 14px;\n  color: var(--dsw-alias-label-tertiary);\n}\n.ctx-meter-group {\n  color: var(--dsw-alias-label-tertiary);\n  margin-top: 8px;\n}\n.ctx-meter-note {\n  color: var(--dsw-alias-label-tertiary);\n  margin-top: 6px;\n}\n";

// plugins/context-meter/src/client.tsx
var PLUGIN_NAME = "context-meter";
var RADIUS = 7;
var CIRCUMFERENCE = 2 * Math.PI * RADIUS;
function formatTokens(value) {
  if (typeof value !== "number" || !isFinite(value)) return "\u2014";
  if (value < 1e3) return String(Math.round(value));
  return (value / 1e3).toFixed(value < 1e4 ? 1 : 0) + "k";
}
var TRUE_ROWS = [
  {
    key: "systemTokens",
    label: "System prompt",
    color: "ctx-meter-color-system"
  },
  { key: "toolsTokens", label: "Tools", color: "ctx-meter-color-tools" },
  {
    key: "messageTokens",
    label: "Conversation",
    color: "ctx-meter-color-messages"
  }
];
function row(key, label, value, sub) {
  return react2.createElement(
    "div",
    { key, className: sub ? "ctx-meter-row ctx-meter-sub" : "ctx-meter-row" },
    [
      react2.createElement("dt", { key: "dt" }, label),
      react2.createElement("dd", { key: "dd" }, value)
    ]
  );
}
var inject = ["slots"];
var name = PLUGIN_NAME;
function apply(ctx) {
  ctx.slots.inject("conversation.input.right", function* () {
    yield ctx.slots.register(
      { name: "conversation.input.right", id: "true-context-meter", order: 50 },
      (props) => react2.createElement(Meter, { useProjection: props.useProjection })
    );
  });
  injectStyle(PLUGIN_NAME, "context-meter", client_default);
  let hideDone = false;
  let trailingClass = null;
  let attempts = 0;
  let warned = false;
  function ensureShippedHidden() {
    if (hideDone) return;
    const hidden = shippedClass("ContextMeter.module.css", "_root");
    if (hidden === null) return;
    injectStyle(PLUGIN_NAME, "context-meter-hide", "." + hidden + " { display: none !important; }");
    hideDone = true;
  }
  function trailingOf() {
    if (trailingClass === null) trailingClass = shippedClass("InputBar.module.css", "_trailing");
    return trailingClass;
  }
  function warnUnresolved(what) {
    attempts += 1;
    if (attempts < 20 || warned) return;
    warned = true;
    console.error("true context meter: " + what);
  }
  function placeAfterModelSelect(el) {
    if (el === null || typeof document === "undefined") return;
    const trailing = trailingOf();
    if (trailing === null) {
      warnUnresolved(
        "could not read the composer tool row class, so the meter stays left of the model select."
      );
      return;
    }
    const rowEl = el.closest("." + trailing);
    if (rowEl === null) {
      warnUnresolved(
        "the meter is not inside the composer tool row, so its position is unchanged."
      );
      return;
    }
    const chain = [];
    let node = el;
    while (node !== null && node !== rowEl) {
      chain.push(node);
      node = node.parentElement;
    }
    if (node !== rowEl) return;
    for (const item of chain) item.style.order = "1";
    const last = rowEl.lastElementChild;
    if (last !== null && chain.indexOf(last) === -1) last.style.order = "3";
  }
  function Meter(props) {
    const useProjection = props.useProjection;
    const breakdown = useProjection("contextBreakdown");
    const pressure = useProjection("contextPressure");
    const usage = useProjection("tokenUsage");
    const [open, setOpen] = react2.useState(false);
    const [hovering, setHovering] = react2.useState(false);
    const rootRef = react2.useRef(null);
    react2.useEffect(() => {
      ensureShippedHidden();
      placeAfterModelSelect(rootRef.current);
    });
    const close = react2.useCallback(() => setOpen(false), []);
    useDismissable(open, rootRef, close);
    const contextWindow = pressure === void 0 ? void 0 : pressure.contextWindow;
    if (breakdown === void 0 || contextWindow === void 0) return null;
    const trueTotal = breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens;
    const percent = Math.min(100, Math.round(trueTotal / contextWindow * 100));
    const dash = CIRCUMFERENCE * Math.min(1, trueTotal / contextWindow);
    const reading = formatTokens(trueTotal) + " / " + formatTokens(contextWindow) + ", " + percent + "% used";
    const segments = TRUE_ROWS.map((part) => ({
      key: part.key,
      color: part.color,
      width: trueTotal === 0 ? 0 : percent * breakdown[part.key] / trueTotal
    })).filter((part) => part.width > 0);
    const trigger = react2.createElement(
      "button",
      {
        type: "button",
        className: "ctx-meter-trigger",
        "aria-label": reading,
        "aria-expanded": open,
        onClick: () => setOpen(!open)
      },
      react2.createElement(
        "svg",
        { width: 18, height: 18, viewBox: "0 0 18 18", "aria-hidden": true },
        [
          react2.createElement("circle", {
            key: "track",
            className: "ctx-meter-track",
            cx: 9,
            cy: 9,
            r: RADIUS
          }),
          react2.createElement("circle", {
            key: "fill",
            className: "ctx-meter-fill",
            cx: 9,
            cy: 9,
            r: RADIUS,
            strokeDasharray: dash + " " + CIRCUMFERENCE,
            transform: "rotate(-90 9 9)"
          })
        ]
      )
    );
    const trueHalf = react2.createElement("div", { className: "ctx-meter-half" }, [
      react2.createElement("div", { key: "head", className: "ctx-meter-head" }, [
        react2.createElement(
          "span",
          { key: "t", className: "ctx-meter-title" },
          "Prompt, as measured"
        ),
        react2.createElement(
          "span",
          { key: "f", className: "ctx-meter-figures" },
          formatTokens(trueTotal) + " / " + formatTokens(contextWindow) + "  " + percent + "%"
        )
      ]),
      react2.createElement(
        "div",
        { key: "bar", className: "ctx-meter-bar" },
        segments.map(
          (part) => react2.createElement("span", {
            key: part.key,
            className: "ctx-meter-segment " + part.color,
            style: { width: part.width + "%" }
          })
        )
      ),
      react2.createElement(
        "dl",
        { key: "rows", className: "ctx-meter-rows" },
        TRUE_ROWS.map(
          (part) => react2.createElement("div", { key: part.key, className: "ctx-meter-row" }, [
            react2.createElement("dt", { key: "dt" }, [
              react2.createElement("span", {
                key: "s",
                className: "ctx-meter-swatch " + part.color
              }),
              part.label
            ]),
            react2.createElement("dd", { key: "dd" }, formatTokens(breakdown[part.key]))
          ])
        )
      )
    ]);
    let providerBody;
    if (usage === void 0) {
      providerBody = react2.createElement(
        "div",
        { className: "ctx-meter-note" },
        "No usage reported yet."
      );
    } else {
      const billed = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
      providerBody = [
        react2.createElement("dl", { key: "last", className: "ctx-meter-rows" }, [
          row("claim", "Prompt it says it read", formatTokens(pressure.pressureTokens))
        ]),
        react2.createElement(
          "div",
          { key: "g", className: "ctx-meter-group" },
          "Session totals, every call summed"
        ),
        react2.createElement("dl", { key: "totals", className: "ctx-meter-rows" }, [
          row("in", "Prompt, billed", formatTokens(billed)),
          row("cr", "of which cache read", formatTokens(usage.cacheReadTokens), true),
          row("cw", "of which cache write", formatTokens(usage.cacheWriteTokens), true),
          row("out", "Output", formatTokens(usage.outputTokens))
        ])
      ];
    }
    const providerHalf = react2.createElement("div", { className: "ctx-meter-half" }, [
      react2.createElement("div", { key: "head", className: "ctx-meter-head" }, [
        react2.createElement(
          "span",
          { key: "t", className: "ctx-meter-title" },
          "Provider claims, last call"
        )
      ]),
      react2.createElement("div", { key: "body" }, providerBody),
      react2.createElement(
        "div",
        { key: "note", className: "ctx-meter-note" },
        "Reported by the provider, not measured here. Some providers report these as running totals, which makes them larger than the prompt above."
      )
    ]);
    const children = [trigger];
    if (open)
      children.push(
        react2.createElement("div", { key: "panel", className: "ctx-meter-panel" }, [
          trueHalf,
          providerHalf
        ])
      );
    else if (hovering)
      children.push(
        react2.createElement("div", { key: "tip", className: "ctx-meter-tip" }, reading)
      );
    return react2.createElement(
      "span",
      {
        ref: rootRef,
        className: "ctx-meter-root",
        onMouseEnter: () => setHovering(true),
        onMouseLeave: () => setHovering(false)
      },
      children
    );
  }
}
		return module.exports;
	}
});
