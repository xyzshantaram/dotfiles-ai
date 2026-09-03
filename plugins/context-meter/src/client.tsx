import * as react from "react";
import { injectStyle } from "../../shared/client-util";
import localCss from "./client.module.css";

const PLUGIN_NAME = "context-meter";
const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const OWNER = "@deepseek-ai/dsh-client-ui-conversation/";

/**
 * Read one hashed class name out of a stylesheet the conversation package
 * injects. The hash changes per DSH build, so never hard-code it.
 */
function shippedClass(moduleName: string, suffix: string): string | null {
  if (typeof document === "undefined") return null;
  const tag = document.querySelector('style[data-plugin-css="' + OWNER + moduleName + '"]');
  if (tag === null) return null;
  const found = new RegExp("\\.([A-Za-z0-9_-]+" + suffix + ")\\s*\\{").exec(tag.textContent || "");
  return found === null ? null : found[1];
}

/** Compact token count: 12345 becomes "12.3k". */
function formatTokens(value: any): string {
  if (typeof value !== "number" || !isFinite(value)) return "—";
  if (value < 1000) return String(Math.round(value));
  return (value / 1000).toFixed(value < 10000 ? 1 : 0) + "k";
}

const TRUE_ROWS = [
  {
    key: "systemTokens",
    label: "System prompt",
    color: "ctx-meter-color-system",
  },
  { key: "toolsTokens", label: "Tools", color: "ctx-meter-color-tools" },
  {
    key: "messageTokens",
    label: "Conversation",
    color: "ctx-meter-color-messages",
  },
];

/** One label/value row in the panel. */
function row(key: string, label: string, value: string, sub?: boolean) {
  return react.createElement(
    "div",
    { key: key, className: sub ? "ctx-meter-row ctx-meter-sub" : "ctx-meter-row" },
    [
      react.createElement("dt", { key: "dt" }, label),
      react.createElement("dd", { key: "dd" }, value),
    ],
  );
}

var inject = ["slots"];
var name = PLUGIN_NAME;

function apply(ctx: any) {
  ctx.slots.inject("conversation.input.right", function* () {
    yield ctx.slots.register(
      { name: "conversation.input.right", id: "true-context-meter", order: 50 },
      (props: any) => react.createElement(Meter, { useProjection: props.useProjection }),
    );
  });

  injectStyle(PLUGIN_NAME, "context-meter", localCss);

  // Both shipped class names are read from the stylesheets that package injects,
  // because their hashes change per DSH build. As a tracked plugin, apply() runs
  // at boot and can run BEFORE those stylesheets exist. Resolving them once here
  // left the shipped ring visible and our meter unmoved, so resolve them lazily
  // on render and keep retrying until they appear.
  let hideDone = false;
  let trailingClass: string | null = null;
  let attempts = 0;
  let warned = false;

  /** Hide the shipped meter as soon as its stylesheet exists. */
  function ensureShippedHidden() {
    if (hideDone) return;
    const hidden = shippedClass("ContextMeter.module.css", "_root");
    if (hidden === null) return;
    injectStyle(PLUGIN_NAME, "context-meter-hide", "." + hidden + " { display: none !important; }");
    hideDone = true;
  }

  /** The composer tool row class, resolved on the first render that finds it. */
  function trailingOf() {
    if (trailingClass === null) trailingClass = shippedClass("InputBar.module.css", "_trailing");
    return trailingClass;
  }

  /**
   * Report a lookup that never resolved. Boot renders legitimately miss, so
   * stay quiet until enough of them have failed to mean a real breakage.
   */
  function warnUnresolved(what: string) {
    attempts += 1;
    if (attempts < 20 || warned) return;
    warned = true;
    console.error("true context meter: " + what);
  }

  /**
   * Place our seat after the model select and before the send button.
   *
   * Our slot renders before the model select, but the meter belongs after it. A
   * stylesheet cannot express this reliably. We do not know whether the slot
   * wraps our element, and a wrapper with `display: contents` is not a flex item
   * at all, so order on it is inert. Apply the order to every element from our
   * root up to the row's direct child: exactly one of them is the real flex
   * item, and the order does nothing on the others.
   */
  function placeAfterModelSelect(el: any) {
    if (el === null || typeof document === "undefined") return;
    const trailing = trailingOf();
    if (trailing === null) {
      warnUnresolved(
        "could not read the composer tool row class, so the meter stays left of the model select.",
      );
      return;
    }
    const rowEl = el.closest("." + trailing);
    if (rowEl === null) {
      warnUnresolved(
        "the meter is not inside the composer tool row, so its position is unchanged.",
      );
      return;
    }
    const chain: any[] = [];
    let node = el;
    while (node !== null && node !== rowEl) {
      chain.push(node);
      node = node.parentElement;
    }
    if (node !== rowEl) return;
    for (const item of chain) item.style.order = "1";
    const last = rowEl.lastElementChild;
    if (last !== null && chain.indexOf(last) === -1) last.style.order = "2";
  }

  function Meter(props: any) {
    const useProjection = props.useProjection;
    const breakdown = useProjection("contextBreakdown");
    const pressure = useProjection("contextPressure");
    const usage = useProjection("tokenUsage");
    const [open, setOpen] = react.useState(false);
    const [hovering, setHovering] = react.useState(false);
    const rootRef = react.useRef(null);

    // No dependency list: the composer row re-renders around us, so reassert the
    // order after every render rather than only on mount. Both shipped-class
    // lookups also retry here, because at boot they can run before the shipped
    // stylesheets exist.
    react.useEffect(() => {
      ensureShippedHidden();
      placeAfterModelSelect(rootRef.current);
    });

    react.useEffect(() => {
      if (!open || typeof document === "undefined") return;
      const onPointerDown = (event: any) => {
        const root = rootRef.current;
        if (root !== null && event.target instanceof Node && root.contains(event.target)) return;
        setOpen(false);
      };
      const onKeyDown = (event: any) => {
        if (event.key === "Escape") setOpen(false);
      };
      document.addEventListener("pointerdown", onPointerDown);
      document.addEventListener("keydown", onKeyDown);
      return () => {
        document.removeEventListener("pointerdown", onPointerDown);
        document.removeEventListener("keydown", onKeyDown);
      };
    }, [open]);

    const contextWindow = pressure === undefined ? undefined : pressure.contextWindow;
    if (breakdown === undefined || contextWindow === undefined) return null;

    const trueTotal = breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens;
    const percent = Math.min(100, Math.round((trueTotal / contextWindow) * 100));
    const dash = CIRCUMFERENCE * Math.min(1, trueTotal / contextWindow);
    const reading =
      formatTokens(trueTotal) + " / " + formatTokens(contextWindow) + ", " + percent + "% used";

    const segments = TRUE_ROWS.map((part) => ({
      key: part.key,
      color: part.color,
      width: trueTotal === 0 ? 0 : (percent * breakdown[part.key]) / trueTotal,
    })).filter((part) => part.width > 0);

    const trigger = react.createElement(
      "button",
      {
        type: "button",
        className: "ctx-meter-trigger",
        "aria-label": reading,
        "aria-expanded": open,
        onClick: () => setOpen(!open),
      },
      react.createElement(
        "svg",
        { width: 18, height: 18, viewBox: "0 0 18 18", "aria-hidden": true },
        [
          react.createElement("circle", {
            key: "track",
            className: "ctx-meter-track",
            cx: 9,
            cy: 9,
            r: RADIUS,
          }),
          react.createElement("circle", {
            key: "fill",
            className: "ctx-meter-fill",
            cx: 9,
            cy: 9,
            r: RADIUS,
            strokeDasharray: dash + " " + CIRCUMFERENCE,
            transform: "rotate(-90 9 9)",
          }),
        ],
      ),
    );

    const trueHalf = react.createElement("div", { className: "ctx-meter-half" }, [
      react.createElement("div", { key: "head", className: "ctx-meter-head" }, [
        react.createElement(
          "span",
          { key: "t", className: "ctx-meter-title" },
          "Prompt, as measured",
        ),
        react.createElement(
          "span",
          { key: "f", className: "ctx-meter-figures" },
          formatTokens(trueTotal) + " / " + formatTokens(contextWindow) + "  " + percent + "%",
        ),
      ]),
      react.createElement(
        "div",
        { key: "bar", className: "ctx-meter-bar" },
        segments.map((part) =>
          react.createElement("span", {
            key: part.key,
            className: "ctx-meter-segment " + part.color,
            style: { width: part.width + "%" },
          }),
        ),
      ),
      react.createElement(
        "dl",
        { key: "rows", className: "ctx-meter-rows" },
        TRUE_ROWS.map((part) =>
          react.createElement("div", { key: part.key, className: "ctx-meter-row" }, [
            react.createElement("dt", { key: "dt" }, [
              react.createElement("span", {
                key: "s",
                className: "ctx-meter-swatch " + part.color,
              }),
              part.label,
            ]),
            react.createElement("dd", { key: "dd" }, formatTokens(breakdown[part.key])),
          ]),
        ),
      ),
    ]);

    let providerBody;
    if (usage === undefined) {
      providerBody = react.createElement(
        "div",
        { className: "ctx-meter-note" },
        "No usage reported yet.",
      );
    } else {
      const billed = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
      providerBody = [
        react.createElement("dl", { key: "last", className: "ctx-meter-rows" }, [
          row("claim", "Prompt it says it read", formatTokens(pressure.pressureTokens)),
        ]),
        react.createElement(
          "div",
          { key: "g", className: "ctx-meter-group" },
          "Session totals, every call summed",
        ),
        react.createElement("dl", { key: "totals", className: "ctx-meter-rows" }, [
          row("in", "Prompt, billed", formatTokens(billed)),
          row("cr", "of which cache read", formatTokens(usage.cacheReadTokens), true),
          row("cw", "of which cache write", formatTokens(usage.cacheWriteTokens), true),
          row("out", "Output", formatTokens(usage.outputTokens)),
        ]),
      ];
    }

    const providerHalf = react.createElement("div", { className: "ctx-meter-half" }, [
      react.createElement("div", { key: "head", className: "ctx-meter-head" }, [
        react.createElement(
          "span",
          { key: "t", className: "ctx-meter-title" },
          "Provider claims, last call",
        ),
      ]),
      react.createElement("div", { key: "body" }, providerBody),
      react.createElement(
        "div",
        { key: "note", className: "ctx-meter-note" },
        "Reported by the provider, not measured here. Some providers report these as running totals, which makes them larger than the prompt above.",
      ),
    ]);

    const children = [trigger];
    if (open)
      children.push(
        react.createElement("div", { key: "panel", className: "ctx-meter-panel" }, [
          trueHalf,
          providerHalf,
        ]),
      );
    else if (hovering)
      children.push(
        react.createElement("div", { key: "tip", className: "ctx-meter-tip" }, reading),
      );

    return react.createElement(
      "span",
      {
        ref: rootRef,
        className: "ctx-meter-root",
        onMouseEnter: () => setHovering(true),
        onMouseLeave: () => setHovering(false),
      },
      children,
    );
  }
}

export { apply, inject, name };
