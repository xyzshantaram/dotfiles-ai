import * as React from "react";
import { useDismissable } from "../../shared/client-react";
import { fetchJson, injectStyle, shippedClass } from "../../shared/client-util";
import {
  effectiveExplainStatus,
  explainMissingRate,
  formatApproxCost,
  rateKey,
  selectCostBranch,
  summarizeCost,
  unwrapRoutePrices,
} from "./cost";
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

/**
 * One label/value row in the panel.
 *
 * `title` hangs an explanatory sentence off the VALUE rather than the whole
 * row, so hovering the thing that reads oddly is what explains it (#134).
 * Absent by default: a title on every row would turn the panel into a field
 * of tooltips and devalue the ones that carry a real diagnosis.
 */
function row(key: string, label: string, value: string, sub?: boolean, title?: string | null) {
  return React.createElement(
    "div",
    { key: key, className: sub ? "ctx-meter-row ctx-meter-sub" : "ctx-meter-row" },
    [
      React.createElement("dt", { key: "dt" }, label),
      React.createElement(
        "dd",
        title === undefined || title === null ? { key: "dd" } : { key: "dd", title: title },
        value,
      ),
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
        React.createElement(Meter, {
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
    const [open, setOpen] = React.useState(false);
    const [hovering, setHovering] = React.useState(false);
    const rootRef = React.useRef(null);

    // Resolved prices doc ({rates, overrides}) through the scope bound in
    // apply(). A revised settings document re-resolves and re-renders, so a
    // sync-models run shows up without a reload. The subscribe closure is
    // stable: without useCallback every render would resubscribe the store.
    const pricesScope = props.pricesScope;
    const pricesSubscribe = React.useCallback(
      (callback: any) => pricesScope.store.subscribe(callback),
      [pricesScope],
    );
    const pricesSnap = React.useSyncExternalStore(pricesSubscribe, () =>
      pricesScope.store.getSnapshot(),
    );

    // Late-arriving modelDirectories bumps the box version and re-renders
    // into a priced figure instead of sticking on unknown price.
    const box = props.servicesBox;
    const boxSubscribe = React.useCallback(
      (callback: any) => {
        box.listeners.add(callback);
        return () => {
          box.listeners.delete(callback);
        };
      },
      [box],
    );
    const servicesVersion = React.useSyncExternalStore(boxSubscribe, () => box.version);

    // The session's live model selection, shared with the model seat through
    // the same resolver (profiles-client resolves it identically from its
    // slot inject). Resolved in an effect, not in render: the first call per
    // session registers the directory's lifetime effects, which do not
    // belong in a render pass. An unknown session, or no selection yet,
    // leaves the directory null — unknown price, never a guessed rate.
    const sessionId = props.sessionId;
    const [directory, setDirectory] = React.useState(null);
    React.useEffect(() => {
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

    const dirSubscribe = React.useCallback(
      (callback: any) => (directory === null ? () => {} : directory.store.subscribe(callback)),
      [directory],
    );
    const dirSnap = React.useSyncExternalStore(dirSubscribe, () =>
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

    // The whole-session approximate cost. The settings scope is first: it is
    // reactive, so a sync-models run re-renders without a reload. But the
    // mirror is loopback-only, and it can stall anywhere — so when the scope
    // yields no document, the same resolved table is read over the plugin's
    // own GET route instead (#161). Same document, same pipeline; only the
    // road differs, and the scope still wins whenever it has the table.
    const pricesDoc =
      pricesSnap !== null && pricesSnap !== undefined ? pricesSnap.value : undefined;
    const [routeDoc, setRouteDoc] = React.useState(null);
    React.useEffect(() => {
      if (pricesDoc !== undefined) return;
      let cancelled = false;
      fetchJson("/context-meter/prices")
        .then(function (result: any) {
          if (cancelled) return;
          const prices = unwrapRoutePrices(result);
          if (prices !== null && prices !== undefined) setRouteDoc(prices);
        })
        .catch(function () {});
      return function () {
        cancelled = true;
      };
    }, [pricesDoc]);
    const effectiveDoc = pricesDoc !== undefined ? pricesDoc : routeDoc;
    const summary =
      usage !== undefined ? summarizeCost(usage, effectiveDoc, provider, model) : null;
    let costText: string | null = null;
    let rateLabel: string | null = null;
    let rangeLabel: string | null = null;
    // #134: WHY no rate, not merely THAT there is none. One "unknown price"
    // string used to cover three unrelated failures — a dead settings
    // transport, an unresolved model, and a genuinely unpriced model — with
    // no console output, so a bug report could not say which half to look
    // at. Computed even when priced, because it costs nothing and keeps the
    // two branches from drifting apart.
    // The absence explainer judges the EFFECTIVE document (scope, else the
    // route): when the route delivered the table, a missing rate means the
    // model is genuinely unpriced, not a transport fault. The scope status
    // rides along through effectiveExplainStatus — except it must not
    // overrule a delivered document: on a LAN origin the scope status IS
    // 'unavailable' while the route HAS delivered the table, and judging
    // the raw scope status would lie about the held document (#161 review).
    const scopeStatus =
      pricesSnap !== null && pricesSnap !== undefined ? pricesSnap.status : undefined;
    const missing = explainMissingRate(
      effectiveExplainStatus(scopeStatus, effectiveDoc),
      effectiveDoc,
      provider,
      model,
    );
    let costDetail: string | null = null;
    // Exact, estimated, or missing is decided by selectCostBranch (cost.ts),
    // where the suite executes the gate — not by an inline kind check the
    // suite can only grep for (#161 review).
    const costBranch = selectCostBranch(summary);
    if (usage !== undefined) {
      const totalTokens =
        (usage.uncachedInputTokens || 0) +
        (usage.cacheReadTokens || 0) +
        (usage.cacheWriteTokens || 0) +
        (usage.outputTokens || 0);
      if (totalTokens === 0) costText = formatApproxCost(0);
      else if (costBranch === "exact") {
        costText = formatApproxCost(summary!.cost);
        rateLabel = provider !== null && model !== null ? rateKey(provider, model) : null;
      } else if (costBranch === "estimated") {
        // Estimated, never guessed (#126's rule): the headline is the median
        // session cost across the providers that publish this bare model,
        // and the range underneath names the spread. The title says which
        // providers and that no exact row exists.
        costText = formatApproxCost(summary!.cost);
        rangeLabel = formatApproxCost(summary!.min) + " – " + formatApproxCost(summary!.max);
        costDetail =
          "Estimated: no published row for " +
          rateKey(provider ?? "?", model ?? "?") +
          ". Median of " +
          summary!.providers.length +
          " provider rows (" +
          summary!.providers.join(", ") +
          "), ranging " +
          rangeLabel +
          ".";
      } else {
        // Still never a guessed rate and never a zero (#126's rule): the
        // figure is absent, and only the EXPLANATION is now specific.
        costText = missing.label;
        costDetail = missing.detail;
      }
    }

    // No dependency list: the composer row re-renders around us, so reassert the
    // order after every render rather than only on mount. Both shipped-class
    // lookups also retry here, because at boot they can run before the shipped
    // stylesheets exist.
    React.useEffect(() => {
      ensureShippedHidden();
      placeAfterModelSelect(rootRef.current);
    });

    const close = React.useCallback(() => setOpen(false), []);
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

    const trigger = React.createElement(
      "button",
      {
        type: "button",
        className: "ctx-meter-trigger",
        "aria-label": tipText,
        "aria-expanded": open,
        onClick: () => setOpen(!open),
      },
      React.createElement(
        "svg",
        { width: 18, height: 18, viewBox: "0 0 18 18", "aria-hidden": true },
        [
          React.createElement("circle", {
            key: "track",
            className: "ctx-meter-track",
            cx: 9,
            cy: 9,
            r: RADIUS,
          }),
          React.createElement("circle", {
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

    const trueHalf = React.createElement("div", { className: "ctx-meter-half" }, [
      React.createElement("div", { key: "head", className: "ctx-meter-head" }, [
        React.createElement(
          "span",
          { key: "t", className: "ctx-meter-title" },
          "Prompt, as measured",
        ),
        React.createElement(
          "span",
          { key: "f", className: "ctx-meter-figures" },
          formatTokens(trueTotal) + " / " + formatTokens(contextWindow) + "  " + percent + "%",
        ),
      ]),
      React.createElement(
        "div",
        { key: "bar", className: "ctx-meter-bar" },
        segments.map((part) =>
          React.createElement("span", {
            key: part.key,
            className: "ctx-meter-segment " + part.color,
            style: { width: part.width + "%" },
          }),
        ),
      ),
      React.createElement(
        "dl",
        { key: "rows", className: "ctx-meter-rows" },
        TRUE_ROWS.map((part) =>
          React.createElement("div", { key: part.key, className: "ctx-meter-row" }, [
            React.createElement("dt", { key: "dt" }, [
              React.createElement("span", {
                key: "s",
                className: "ctx-meter-swatch " + part.color,
              }),
              part.label,
            ]),
            React.createElement("dd", { key: "dd" }, formatTokens(breakdown[part.key])),
          ]),
        ),
      ),
    ]);

    let providerBody;
    if (usage === undefined) {
      providerBody = React.createElement(
        "div",
        { className: "ctx-meter-note" },
        "No usage reported yet.",
      );
    } else {
      const billed = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
      providerBody = [
        React.createElement("dl", { key: "last", className: "ctx-meter-rows" }, [
          row("claim", "Prompt it says it read", formatTokens(pressure.pressureTokens)),
        ]),
        React.createElement(
          "div",
          { key: "g", className: "ctx-meter-group" },
          "Session totals, every call summed",
        ),
        React.createElement("dl", { key: "totals", className: "ctx-meter-rows" }, [
          row("in", "Prompt, billed", formatTokens(billed)),
          row("cr", "of which cache read", formatTokens(usage.cacheReadTokens), true),
          row("cw", "of which cache write", formatTokens(usage.cacheWriteTokens), true),
          row("out", "Output", formatTokens(usage.outputTokens)),
        ]),
        React.createElement(
          "div",
          { key: "cg", className: "ctx-meter-group" },
          "Session cost, approximate",
        ),
        React.createElement("dl", { key: "cost", className: "ctx-meter-rows" }, [
          // The label is now specific (prices unavailable / prices not
          // received / no model reported / unpriced model) and the sentence
          // a reader can act on rides in the title, so the panel explains
          // itself without a console. An estimate adds its range underneath
          // the median headline, with the providers in the hover.
          row("cost", "Whole session", costText ?? missing.label, false, costDetail ?? missing.detail),
          ...(rateLabel !== null ? [row("rate", "Priced at", rateLabel, true)] : []),
          ...(rangeLabel !== null
            ? [row("range", "Est. range", rangeLabel, true, costDetail)]
            : []),
        ]),
        React.createElement(
          "div",
          { key: "cn", className: "ctx-meter-note" },
          "Per-model cache rates from models.dev. The runtime exposes no " +
            "subagent or since-compaction split, so the panel shows the " +
            "whole-session total only.",
        ),
      ];
    }

    const providerHalf = React.createElement("div", { className: "ctx-meter-half" }, [
      React.createElement("div", { key: "head", className: "ctx-meter-head" }, [
        React.createElement(
          "span",
          { key: "t", className: "ctx-meter-title" },
          "Provider claims, last call",
        ),
      ]),
      React.createElement("div", { key: "body" }, providerBody),
      React.createElement(
        "div",
        { key: "note", className: "ctx-meter-note" },
        "Reported by the provider, not measured here. Some providers report these as running totals, which makes them larger than the prompt above.",
      ),
    ]);

    const children = [trigger];
    if (open)
      children.push(
        React.createElement("div", { key: "panel", className: "ctx-meter-panel" }, [
          trueHalf,
          providerHalf,
        ]),
      );
    else if (hovering)
      children.push(
        React.createElement("div", { key: "tip", className: "ctx-meter-tip" }, tipText),
      );

    return React.createElement(
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
