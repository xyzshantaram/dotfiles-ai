/**
 * W18 — combined subscription panel (OpenCode GO + Claude/meridian).
 *
 * The panel. A settings.section view (order 26, right after ds-api-usage at
 * 25) that shows four things:
 *   1. OpenCode GO windows from /opencode-go/usage (owned by
 *      dsh-opencode-go-usage; never duplicated here).
 *   2. Claude (meridian) windows from /subscriptions/meridian-quota and a
 *      telemetry line from /subscriptions/meridian-telemetry.
 *   3. The OpenCode GO balance from /subscriptions/opencode-balance, a
 *      cookie-based route owned by this package's host half.
 *   4. A weekly pace line for both subscriptions, with +/- points and a
 *      projected run-out date.
 *
 * The seam. This file is the package's `./client` source. build.mjs
 * bundles it with esbuild (browser, cjs, es2022): react external, wrapped
 * in the `window.__ModuleLoader__.load` facade with the loader id
 * `subscriptions`. The host row in cordis.patch.yml keeps the loader entry
 * alive so the client-module registry serves this bundle.
 */
var react = require("react");

/** Stable plugin identity, also the loader entry id in cordis.patch.yml. */
var PLUGIN_NAME = "subscriptions";

/** One stylesheet for this panel. Class names are kebab-case only. */
var STYLE_TAG_ID = "subscriptions/settings.css";
var CSS_TEXT = [
  ".ocgs-root{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:6px 2px;color:var(--dsw-alias-label-primary)}",
  ".ocgs-head{display:flex;align-items:center;justify-content:space-between;gap:8px}",
  ".ocgs-title{font-size:16px;font-weight:600;margin:0}",
  ".ocgs-refresh{cursor:pointer;border:none;background:none;padding:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px}",
  ".ocgs-refresh:hover{color:var(--dsw-alias-label-primary)}",
  ".ocgs-section{display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px}",
  ".ocgs-section-title{font-size:13px;font-weight:600;margin:0}",
  ".ocgs-balance{font-size:13px;font-weight:600}",
  ".ocgs-telemetry{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}",
  ".ocgs-rows{display:flex;flex-direction:column;gap:8px}",
  ".ocgs-row{display:flex;flex-direction:column;gap:4px;min-width:0}",
  ".ocgs-row-label{display:flex;justify-content:space-between;gap:8px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary)}",
  ".ocgs-row-label b{font-weight:600;color:var(--dsw-alias-label-primary)}",
  ".ocgs-meta{display:flex;align-items:center;gap:6px;min-width:0}",
  ".ocgs-meta>span{font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none}",
  ".ocgs-track{box-sizing:border-box;flex:1;min-width:0;height:6px;border-radius:3px;background:var(--dsw-alias-border-l2);overflow:hidden}",
  ".ocgs-fill{height:100%;border-radius:3px;transition:width .4s ease}",
  ".ocgs-pace{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}",
  ".ocgs-err{font-size:12px;line-height:16px;color:var(--dsw-alias-state-error-primary)}"
].join("");

/** OpenCode GO windows, in the same order as the sidebar widget. */
var GO_WINDOWS = [
  { key: "rolling", label: "Rolling (5h)", hint: "5h" },
  { key: "weekly", label: "Weekly", hint: null },
  { key: "monthly", label: "Monthly", hint: null }
];

/** Claude (meridian) windows from the localhost quota service. */
var CLAUDE_WINDOWS = [
  { key: "five_hour", label: "5-hour", hint: null },
  { key: "seven_day", label: "7-day", hint: null },
  { key: "seven_day_fable", label: "7-day fable", hint: null }
];

/** Fill color by usage percent — themed alias tokens, light/dark safe. */
function fillColor(percent) {
  if (percent >= 90) return "var(--dsw-alias-state-error-primary)";
  if (percent >= 70) return "var(--dsw-alias-state-warn-primary)";
  return "var(--dsw-alias-state-success-primary)";
}

/** Short human relative time until `iso`. Returns "" when invalid. */
function timeUntil(iso) {
  var target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return "";
  var diff = target - Date.now();
  if (diff <= 0) return "resets soon";
  var mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + "m";
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h" + (mins % 60) + "m";
  return Math.floor(hours / 24) + "d" + (hours % 24) + "h";
}

/** Short month/day date, e.g. "Aug 26". */
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Compact count, e.g. 199043123 -> "199.0M". */
function fmtCount(n) {
  if (n === null || n === undefined || isNaN(n)) return "—";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}

/** The 24h telemetry summary line. */
function renderTelemetry(t) {
  var usage = t.tokenUsage || {};
  var totalTokens = (usage.totalInputTokens || 0)
    + (usage.totalOutputTokens || 0)
    + (usage.totalCacheReadTokens || 0)
    + (usage.totalCacheCreationTokens || 0);
  var usd = t.costEstimate && typeof t.costEstimate.totalUsd === "number"
    ? "$" + t.costEstimate.totalUsd.toFixed(2) + " est"
    : "— est";
  var req = typeof t.totalRequests === "number" ? String(t.totalRequests) : "—";
  return "24h: " + req + " req · " + usd + " · " + fmtCount(totalTokens) + " tokens";
}

/** Usage percent of a window: go sends percent, meridian sends utilization. */
function windowPercent(win) {
  if (typeof win.percent === "number") return win.percent;
  if (typeof win.utilization === "number") return win.utilization * 100;
  return null;
}

/** Right-hand status text: a failing status wins, else the reset countdown. */
function statusText(win, hint) {
  if (typeof win.status === "string" && win.status !== "ok") return win.status;
  if (win.resetsAt) return timeUntil(win.resetsAt);
  return hint || "";
}

const SEVEN_DAYS_MS = 7 * 86400000
const PACE_ON_BAND = 5          // delta percentage points that still count as "on pace"
const PROJECT_MIN_ELAPSED = 0.1 // only project run-out after >=10% of window elapsed

function computeWeeklyPace(utilization, resetsAt, now = Date.now()) {
  if (utilization == null || !Number.isFinite(utilization)) return null
  if (resetsAt == null || !Number.isFinite(resetsAt)) return null
  const windowStart = resetsAt - SEVEN_DAYS_MS
  const elapsedFraction = Math.max(0, Math.min(1, (now - windowStart) / SEVEN_DAYS_MS))
  const actualPct = Math.round(Math.max(0, utilization) * 100)
  const expectedPct = Math.round(elapsedFraction * 100)
  const deltaPct = actualPct - expectedPct
  const status = deltaPct > PACE_ON_BAND ? "ahead" : deltaPct < -PACE_ON_BAND ? "under" : "on"
  const projectedPct = elapsedFraction >= PROJECT_MIN_ELAPSED
    ? Math.round((Math.max(0, utilization) / elapsedFraction) * 100)
    : null
  return { actualPct, expectedPct, deltaPct, projectedPct, status, elapsedFraction }
}

/**
 * One pace line: used percent, +/- points, and the run-out or reset date.
 * utilization is the raw 0..1 fraction the projection scales from.
 */
function renderPaceLine(label, pace, resetsAtMs, utilization) {
  if (pace === null) return label + " pace: —";
  var parts = [label + " pace: " + pace.actualPct + "% used"];
  if (pace.status === "on") {
    parts.push("on pace");
  } else if (pace.deltaPct > 0) {
    parts.push("+" + pace.deltaPct + " pts over");
  } else {
    parts.push(pace.deltaPct + " pts under");
  }
  if (pace.projectedPct !== null && pace.projectedPct >= 100) {
    var windowStart = resetsAtMs - SEVEN_DAYS_MS;
    var runOutAt = windowStart + SEVEN_DAYS_MS * (pace.elapsedFraction / (utilization || 1e-9));
    if (runOutAt < resetsAtMs) parts.push("runs out " + fmtDate(runOutAt));
    else parts.push("resets " + fmtDate(resetsAtMs));
  } else {
    parts.push("resets " + fmtDate(resetsAtMs));
  }
  return parts.join(" · ");
}

/** Fetch one same-origin proxy route and always resolve to a plain object. */
function fetchJson(url) {
  return fetch(url, { cache: "no-store" })
    .then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        return { ok: res.ok, status: res.status, json: json };
      });
    })
    .then(function (result) {
      if (result.json !== null && result.json.error) {
        return { data: null, error: String(result.json.error) };
      }
      if (!result.ok) return { data: null, error: "HTTP " + result.status };
      return { data: result.json, error: null };
    })
    .catch(function (e) {
      return { data: null, error: String((e && e.message) || e) };
    });
}

/** One window row: label + percent, then a track with a fill and status. */
function buildRows(defs, windows) {
  var rows = [];
  for (var i = 0; i < defs.length; i++) {
    var def = defs[i];
    var win = windows ? windows[def.key] : null;
    if (!win) continue;
    var percent = windowPercent(win);
    if (percent === null) continue;
    rows.push(react.createElement("div", { className: "ocgs-row", key: def.key },
      react.createElement("div", { className: "ocgs-row-label" },
        react.createElement("b", null, def.label),
        react.createElement("b", null, percent + "%")
      ),
      react.createElement("div", { className: "ocgs-meta" },
        react.createElement("div", { className: "ocgs-track" },
          react.createElement("div", {
            className: "ocgs-fill",
            style: {
              width: Math.max(0, Math.min(100, percent)) + "%",
              background: fillColor(percent)
            }
          })
        ),
        react.createElement("span", null, statusText(win, def.hint))
      )
    ));
  }
  return rows;
}

/**
 * Build the panel component. The plugin context is captured so the
 * interval (timer service) and the refresh state stay per-registration.
 */
function makePanel(ctx) {
  return function Panel() {
    var snapState = react.useState(null);
    var snap = snapState[0];
    var setSnap = snapState[1];

    var load = async function () {
      var results = await Promise.all([
        fetchJson("/opencode-go/usage"),
        fetchJson("/subscriptions/meridian-quota"),
        fetchJson("/subscriptions/meridian-telemetry"),
        fetchJson("/subscriptions/opencode-balance")
      ]);
      setSnap({
        go: results[0],
        quota: results[1],
        telemetry: results[2],
        balance: results[3]
      });
    };

    react.useEffect(function () {
      load();
      var dispose = ctx.interval(load, 60000);
      return function () { dispose(); };
    }, []);

    var go = snap ? snap.go : null;
    var quota = snap ? snap.quota : null;
    var telemetry = snap ? snap.telemetry : null;
    var balance = snap ? snap.balance : null;

    // OpenCode GO windows
    var goUsage = go && !go.error && go.data ? go.data.usage : null;

    // Claude (meridian) windows: first profile that carries windows
    var claudeWindows = null;
    if (quota && !quota.error && quota.data && Array.isArray(quota.data.profiles)) {
      for (var pi = 0; pi < quota.data.profiles.length; pi++) {
        var profile = quota.data.profiles[pi];
        if (profile && profile.windows) { claudeWindows = profile.windows; break; }
      }
    }

    // Balance line
    var balanceLine = null;
    if (balance) {
      if (balance.error) {
        balanceLine = "Balance: " + balance.error;
      } else if (balance.data && balance.data.ok === true && typeof balance.data.balance === "number") {
        balanceLine = "$" + balance.data.balance.toFixed(2) + " balance";
      }
    }

    // Telemetry line
    var telemetryLine = null;
    if (telemetry) {
      if (telemetry.error) telemetryLine = "telemetry: " + telemetry.error;
      else if (telemetry.data) telemetryLine = renderTelemetry(telemetry.data);
    }

    // Weekly pace for OpenCode GO (weekly window, percent/100)
    var goPaceLine = null;
    var goWeekly = goUsage ? goUsage.weekly : null;
    if (goWeekly && windowPercent(goWeekly) !== null) {
      var goResetsMs = new Date(goWeekly.resetsAt).getTime();
      if (Number.isFinite(goResetsMs)) {
        var goUtil = windowPercent(goWeekly) / 100;
        goPaceLine = renderPaceLine("weekly", computeWeeklyPace(goUtil, goResetsMs), goResetsMs, goUtil);
      }
    }

    // Weekly pace for Claude (seven_day window, utilization 0..1)
    var claudePaceLine = null;
    var claudeSeven = claudeWindows ? claudeWindows.seven_day : null;
    if (claudeSeven && typeof claudeSeven.utilization === "number") {
      var claudeResetsMs = new Date(claudeSeven.resetsAt).getTime();
      if (Number.isFinite(claudeResetsMs)) {
        claudePaceLine = renderPaceLine(
          "7d", computeWeeklyPace(claudeSeven.utilization, claudeResetsMs), claudeResetsMs, claudeSeven.utilization
        );
      }
    }

    return react.createElement("div", { className: "ocgs-root" },
      react.createElement("div", { className: "ocgs-head" },
        react.createElement("h3", { className: "ocgs-title" }, "Subscriptions"),
        react.createElement("button", { className: "ocgs-refresh", onClick: load }, "Refresh")
      ),

      react.createElement("div", { className: "ocgs-section" },
        react.createElement("h4", { className: "ocgs-section-title" }, "OpenCode GO"),
        balanceLine ? react.createElement("div", { className: "ocgs-balance" }, balanceLine) : null,
        go && go.error ? react.createElement("div", { className: "ocgs-err" }, "OpenCode GO: " + go.error) : null,
        react.createElement("div", { className: "ocgs-rows" }, buildRows(GO_WINDOWS, goUsage)),
        goPaceLine ? react.createElement("div", { className: "ocgs-pace" }, goPaceLine) : null
      ),

      react.createElement("div", { className: "ocgs-section" },
        react.createElement("h4", { className: "ocgs-section-title" }, "Claude (meridian)"),
        telemetryLine ? react.createElement("div", { className: "ocgs-telemetry" }, telemetryLine) : null,
        quota && quota.error ? react.createElement("div", { className: "ocgs-err" }, "Claude (meridian): " + quota.error) : null,
        react.createElement("div", { className: "ocgs-rows" }, buildRows(CLAUDE_WINDOWS, claudeWindows)),
        claudePaceLine ? react.createElement("div", { className: "ocgs-pace" }, claudePaceLine) : null
      )
    );
  };
}

/** Stable Cordis plugin name. */
var name = PLUGIN_NAME;
/** Services this bundle reaches through the plugin context. */
var inject = ["slots", "timer"];

/** Plugin body: inject the styles once and register the settings section. */
function apply(ctx) {
  ctx.effect(function () {
    if (typeof document === "undefined") return;
    if (document.querySelector("style[data-plugin-css=\"" + STYLE_TAG_ID + "\"]") !== null) return;
    var tag = document.createElement("style");
    tag.dataset.plugin = PLUGIN_NAME;
    tag.dataset.pluginCss = STYLE_TAG_ID;
    tag.textContent = CSS_TEXT;
    document.head.appendChild(tag);
  }, "subscriptions: styles");

  // The panel component is created once, so its identity stays stable across
  // slot re-renders and React keeps its state (data) between them.
  var Panel = makePanel(ctx);
  ctx.slots.inject("settings.section", function () {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 26, label: "Subscriptions" },
      function () { return react.createElement(Panel); }
    );
  });
}

module.exports = { apply: apply, inject: inject, name: name };
