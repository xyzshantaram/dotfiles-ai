import * as react from "react";
import { useDismissable } from "../../shared/client-react";
import { injectStyle, shippedClass } from "../../shared/client-util";
import { formatApproxCost, priceBuckets, rateKey, resolveRate } from "./cost";
import localCss from "./client.module.css";

const PLUGIN_NAME = "context-meter";
const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

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
  // Prices arrive through the `prices` settings namespace this plugin's host
  // half owns (rates rebuilt by sync-models.mjs, overrides hand-kept). The
  // seat below reads them through this scope; when the settings transport is
  // absent the scope stays inert and every figure degrades to unknown price
  // instead of throwing the ring off the composer row.
  let pricesScope: any;
  try {
    pricesScope = ctx.settingsScope.bind({ namespace: "prices" });
  } catch (e) {
    const snapshot = Object.freeze({ status: "unavailable", value: undefined });
    pricesScope = { store: { subscribe: () => () => {}, getSnapshot: () => snapshot } };
  }

  // The live model selection lives behind the modelDirectories service,
  // which mounts independently of this slot. The box holds whatever has
  // arrived; the seat below subscribes to the version so a late arrival
  // re-renders into a priced figure instead of sticking on unknown price.
  // Without the service (or its package) the box stays empty and the cost
  // rows stay unknown — a missing selection must never invent a rate.
  const servicesBox: { models?: any; version: number; listeners: Set<(v: number) => void> } = {
    version: 0,
    listeners: new Set(),
  };
  const notifyServices = () => {
    servicesBox.version += 1;
    for (const listener of servicesBox.listeners) listener(servicesBox.version);
  };
  try {
    ctx.inject(["modelDirectories"], (scope: any) => {
      servicesBox.models = scope.modelDirectories;
      notifyServices();
    });
  } catch (e) {
    // No modelDirectories on this context: the seat below prices nothing.
  }

  ctx.slots.inject("conversation.input.right", function* () {
    yield ctx.slots.register(
      { name: "conversation.input.right", id: "true-context-meter", order: 50 },
      (props: any) =>
        react.createElement(Meter, {
          useProjection: props.useProjection,
          sessionId: props.sessionId,
          pricesScope: pricesScope,
          servicesBox: servicesBox,
        }),
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
   *
   * Shared tier contract with plugins/composer-menu, which reorders the attach
   * picker on this same row with the identical technique: this meter takes
   * order 1, composer-menu's picker takes order 2, and whichever plugin's
   * effect runs last bumps the row's actual last child (the send button) to
   * order 3. Both plugins hardcode that same "3" literal, so re-asserting it
   * on every render is a no-op collision, not a fight. Changing any of these
   * three numbers here requires the matching change in composer-menu.
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
    if (last !== null && chain.indexOf(last) === -1) last.style.order = "3";
  }

  function Meter(props: any) {
    const useProjection = props.useProjection;
    const breakdown = useProjection("contextBreakdown");
    const pressure = useProjection("contextPressure");
    const usage = useProjection("tokenUsage");
    const [open, setOpen] = react.useState(false);
    const [hovering, setHovering] = react.useState(false);
    const rootRef = react.useRef(null);

    // Resolved prices doc ({rates, overrides}) through the scope bound in
    // apply(). A revised settings document re-resolves and re-renders, so a
    // sync-models run shows up without a reload. The subscribe closure is
    // stable: without useCallback every render would resubscribe the store.
    const pricesScope = props.pricesScope;
    const pricesSubscribe = react.useCallback(
      (callback: any) => pricesScope.store.subscribe(callback),
      [pricesScope],
    );
    const pricesSnap = react.useSyncExternalStore(pricesSubscribe, () =>
      pricesScope.store.getSnapshot(),
    );

    // Late-arriving modelDirectories bumps the box version and re-renders
    // into a priced figure instead of sticking on unknown price.
    const box = props.servicesBox;
    const boxSubscribe = react.useCallback(
      (callback: any) => {
        box.listeners.add(callback);
        return () => {
          box.listeners.delete(callback);
        };
      },
      [box],
    );
    const servicesVersion = react.useSyncExternalStore(boxSubscribe, () => box.version);

    // The session's live model selection, shared with the model seat through
    // the same resolver (profiles-client resolves it identically from its
    // slot inject). Resolved in an effect, not in render: the first call per
    // session registers the directory's lifetime effects, which do not
    // belong in a render pass. An unknown session, or no selection yet,
    // leaves the directory null — unknown price, never a guessed rate.
    const sessionId = props.sessionId;
    const [directory, setDirectory] = react.useState(null);
    react.useEffect(() => {
      if (box === undefined || box.models === undefined) {
        setDirectory(null);
        return;
      }
      if (typeof sessionId !== "string" || sessionId === "") {
        setDirectory(null);
        return;
      }
      let resolved: any = null;
      try {
        resolved = box.models.directoryFor(sessionId);
      } catch (e) {
        resolved = null;
      }
      setDirectory(resolved);
      // Refresh the already-shared snapshot. Without this a freshly opened
      // session prices nothing until something else touches the model seat.
      if (resolved !== null) {
        try {
          const pending = resolved.load();
          if (pending !== undefined && pending !== null && typeof pending.catch === "function")
            pending.catch(() => {});
        } catch (e) {}
      }
    }, [box, sessionId, servicesVersion]);

    const dirSubscribe = react.useCallback(
      (callback: any) => (directory === null ? () => {} : directory.store.subscribe(callback)),
      [directory],
    );
    const dirSnap = react.useSyncExternalStore(dirSubscribe, () =>
      directory === null ? null : directory.store.getSnapshot(),
    );
    const current = dirSnap !== null && dirSnap !== undefined ? dirSnap.current : undefined;
    const provider =
      current !== undefined && current !== null && typeof current.provider === "string"
        ? current.provider
        : null;
    const model =
      current !== undefined && current !== null && typeof current.model === "string"
        ? current.model
        : null;

    // The whole-session approximate cost at the live selection's rate. A
    // mixed-model history prices at the current rate and says which one: the
    // projection carries no per-model split, so any single-rate figure is an
    // approximation, and the rate label keeps it checkable.
    const pricesDoc =
      pricesSnap !== null && pricesSnap !== undefined ? pricesSnap.value : undefined;
    const rate = resolveRate(pricesDoc, provider, model);
    let costText: string | null = null;
    let rateLabel: string | null = null;
    if (usage !== undefined) {
      const totalTokens =
        (usage.uncachedInputTokens || 0) +
        (usage.cacheReadTokens || 0) +
        (usage.cacheWriteTokens || 0) +
        (usage.outputTokens || 0);
      if (totalTokens === 0) costText = formatApproxCost(0);
      else if (rate !== null) {
        costText = formatApproxCost(priceBuckets(usage, rate));
        rateLabel = provider !== null && model !== null ? rateKey(provider, model) : null;
      } else costText = "unknown price";
    }

    // No dependency list: the composer row re-renders around us, so reassert the
    // order after every render rather than only on mount. Both shipped-class
    // lookups also retry here, because at boot they can run before the shipped
    // stylesheets exist.
    react.useEffect(() => {
      ensureShippedHidden();
      placeAfterModelSelect(rootRef.current);
    });

    const close = react.useCallback(() => setOpen(false), []);
    useDismissable(open, rootRef, close);

    const contextWindow = pressure === undefined ? undefined : pressure.contextWindow;
    if (breakdown === undefined || contextWindow === undefined) return null;

    const trueTotal = breakdown.systemTokens + breakdown.toolsTokens + breakdown.messageTokens;
    const percent = Math.min(100, Math.round((trueTotal / contextWindow) * 100));
    const dash = CIRCUMFERENCE * Math.min(1, trueTotal / contextWindow);
    const reading =
      formatTokens(trueTotal) + " / " + formatTokens(contextWindow) + ", " + percent + "% used";
    // The hover tip carries the same total the panel prices, so the two
    // surfaces can never disagree about one session.
    const tipText = costText === null ? reading : reading + " · " + costText;

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
        "aria-label": tipText,
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
        react.createElement(
          "div",
          { key: "cg", className: "ctx-meter-group" },
          "Session cost, approximate",
        ),
        react.createElement("dl", { key: "cost", className: "ctx-meter-rows" }, [
          row("cost", "Whole session", costText ?? "unknown price"),
          ...(rateLabel !== null ? [row("rate", "Priced at", rateLabel, true)] : []),
        ]),
        react.createElement(
          "div",
          { key: "cn", className: "ctx-meter-note" },
          "Per-model cache rates from models.dev. The runtime exposes no " +
            "subagent or since-compaction split, so the panel shows the " +
            "whole-session total only.",
        ),
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
        react.createElement("div", { key: "tip", className: "ctx-meter-tip" }, tipText),
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
