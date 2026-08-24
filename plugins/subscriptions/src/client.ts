/**
 * W18+W28 — subscription usage panel (Command Code, Claude/meridian, DeepSeek,
 * OpenCode GO, OpenCode Zen). Which sections render is gated by the plugin
 * config's
 * `providers` map: a key set to false hides that section, an absent key shows
 * it. Default order below.
 *
 * The panel. A settings.section view (order 26, right after ds-api-usage at
 * 25) that shows, in order:
 *   0. Quota summary at the TOP: the active profile, the active orchestrator
 *      chain's name, the quota model (the chain head's provider/model), the
 *      chain head provider's window meters + pace line, and the 24h meridian
 *      telemetry line. The profile/chain data comes from /profiles/config
 *      (owned by the profiles plugin); the pick follows the active chain's
 *      head, so switching profiles moves the meters.
 *   1. Command Code balance + window limits from
 *      /subscriptions/commandcode-credits and the monthly cost from
 *      /subscriptions/commandcode-usage (Bearer CMD_API_KEY, /alpha surface).
 *   2. Claude (meridian) windows from /subscriptions/meridian-quota (the
 *      telemetry line moved up to the Quota summary).
 *   3. DeepSeek balance from /subscriptions/deepseek-balance (cookie-based).
 *   4. OpenCode GO windows from /opencode-go/usage (owned by
 *      dsh-opencode-go-usage; never duplicated here), the OpenCode GO balance
 *      from /subscriptions/opencode-balance, and a weekly pace line for the
 *      subscriptions, with +/- points and a projected run-out date.
 *   5. OpenCode Zen balance from /subscriptions/opencode-zen-balance.
 *
 * The seam. This file is the package's `./client` source. build.mjs
 * bundles it with esbuild (browser, cjs, es2022): react external, wrapped
 * in the `window.__ModuleLoader__.load` facade with the loader id
 * `subscriptions`. The host row in cordis.patch.yml keeps the loader entry
 * alive so the client-module registry serves this bundle.
 */
import react from "react";

/** Stable plugin identity, also the loader entry id in cordis.patch.yml. */
var PLUGIN_NAME = "subscriptions";

/** One stylesheet for this panel. Class names are kebab-case only. */
var STYLE_TAG_ID = "subscriptions/settings.css";
var CSS_TEXT = [
  ".ocgs-root{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:6px 2px;color:var(--dsw-alias-label-primary)}",
  ".ocgs-head{display:flex;align-items:center;justify-content:space-between;gap:8px}",
  ".ocgs-title{font-size:16px;font-weight:600;margin:0}",
  ".ocgs-head-title{display:flex;align-items:baseline;gap:8px;min-width:0;flex:1;overflow:hidden}",
  ".ocgs-stale{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);white-space:nowrap}",
  ".ocgs-refresh{cursor:pointer;border:none;background:none;padding:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px}",
  ".ocgs-refresh:hover{color:var(--dsw-alias-label-primary)}",
  ".ocgs-section{display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px}",
  ".ocgs-section-title{font-size:13px;font-weight:600;margin:0}",
  ".ocgs-balance{font-size:13px;font-weight:600}",
  ".ocgs-telemetry{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}",
  ".ocgs-rows{display:flex;flex-direction:column;gap:8px}",
  ".ocgs-row{display:flex;flex-direction:column;gap:4px;min-width:0}",
  ".ocgs-row-label{display:flex;align-items:baseline;gap:8px;font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary)}",
  ".ocgs-row-label b{font-weight:600;color:var(--dsw-alias-label-primary)}",
  ".ocgs-row-label b:last-child{margin-left:auto}",
  ".ocgs-meta{display:flex;align-items:center;gap:6px;min-width:0}",
  ".ocgs-meta>span{font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary);white-space:nowrap;flex:none}",
  ".ocgs-track{box-sizing:border-box;flex:1;min-width:0;height:6px;border-radius:3px;background:var(--dsw-alias-border-l2);overflow:hidden}",
  ".ocgs-fill{height:100%;border-radius:3px;transition:width .4s ease}",
  ".ocgs-pace{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}",
  ".ocgs-err{font-size:12px;line-height:16px;color:var(--dsw-alias-state-error-primary)}",
  ".ocgs-cookie{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0 6px}",
  ".ocgs-btn{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:12px;line-height:20px;padding:2px 10px;cursor:pointer}",
  ".ocgs-btn:disabled{opacity:.5;cursor:default}",
  ".ocgs-cookie-note{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}",
  // Provider visibility toggles
// Provider visibility toggles
  ".ocgs-toggles{display:flex;flex-direction:column;gap:8px}",
  ".ocgs-toggle{display:flex;align-items:center;gap:8px;min-width:0}",
  ".ocgs-toggle-label{flex:1;min-width:0;font-size:12px;line-height:16px;color:var(--dsw-alias-label-primary)}",
  ".ocgs-toggle input{flex:none;cursor:pointer}",
  ".ocgs-details{border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-tertiary);padding:8px 12px;margin-top:4px}",
  ".ocgs-summary{cursor:pointer;font-size:12px;font-weight:600;color:var(--dsw-alias-label-primary);list-style:none}",
  ".ocgs-summary::-webkit-details-marker{display:none}",
  ".ocgs-details[open] .ocgs-toggles{padding-top:8px}",
  // DeepSeek dashboard
  ".ds-dashboard{display:flex;flex-direction:column;gap:12px}",
  ".ds-hero{display:flex;flex-direction:column;gap:4px;padding:8px;background:var(--dsw-alias-bg-tertiary);border-radius:8px;border:1px solid var(--dsw-alias-border-l2)}",
  ".ds-hero-total{font-size:28px;font-weight:700;color:var(--dsw-alias-label-primary);line-height:1.2}",
  ".ds-hero-breakdown{font-size:12px;color:var(--dsw-alias-label-secondary)}",
  ".ds-usage-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px}",
  ".ds-usage-card{padding:10px;background:var(--dsw-alias-bg-tertiary);border-radius:8px;border:1px solid var(--dsw-alias-border-l2)}",
  ".ds-usage-label{font-size:10px;color:var(--dsw-alias-label-secondary);text-transform:uppercase;letter-spacing:0.5px}",
  ".ds-usage-value{font-size:18px;font-weight:600;color:var(--dsw-alias-label-primary);margin-top:4px}",
  ".ds-usage-sub{font-size:11px;color:var(--dsw-alias-label-secondary);margin-top:2px}",
  ".ds-token-row{display:flex;gap:12px;flex-wrap:wrap}",
  ".ds-token-card{flex:1;min-width:120px;padding:8px;background:var(--dsw-alias-bg-tertiary);border-radius:6px;border:1px solid var(--dsw-alias-border-l2)}",
  ".ds-token-label{font-size:10px;color:var(--dsw-alias-label-secondary)}",
  ".ds-token-value{font-size:16px;font-weight:600;color:var(--dsw-alias-state-success-primary)}",
  ".ds-token-value.out{color:var(--dsw-alias-state-error-primary)}",
  ".ds-empty{font-size:12px;color:var(--dsw-alias-label-secondary);font-style:italic}",
  ".ocgs-note{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary)}",
].join("");

/** OpenCode GO windows, in the same order as the sidebar widget. */
var GO_WINDOWS = [
  { key: "rolling", label: "Rolling (5h)", hint: "5h" },
  { key: "weekly", label: "Weekly", hint: null },
  { key: "monthly", label: "Monthly", hint: null },
];

/** Claude (meridian) windows from the localhost quota service. */
var CLAUDE_WINDOWS = [
  { key: "five_hour", label: "5-hour", hint: null },
  { key: "seven_day", label: "7-day", hint: null },
  { key: "seven_day_fable", label: "7-day fable", hint: null },
];

/** Provider visibility toggles, in the order they render in the panel. */
var PROVIDER_TOGGLES = [
  { key: "commandcode", label: "Command Code" },
  { key: "claude", label: "Claude (meridian)" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "opencode", label: "OpenCode GO" },
  { key: "opencode-zen", label: "OpenCode Zen" },
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
  var totalTokens =
    (usage.totalInputTokens || 0) +
    (usage.totalOutputTokens || 0) +
    (usage.totalCacheReadTokens || 0) +
    (usage.totalCacheCreationTokens || 0);
  var usd =
    t.costEstimate && typeof t.costEstimate.totalUsd === "number"
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

const SEVEN_DAYS_MS = 7 * 86400000;
const PACE_ON_BAND = 5; // delta percentage points that still count as "on pace"
const PROJECT_MIN_ELAPSED = 0.1; // only project run-out after >=10% of window elapsed

function computeWeeklyPace(utilization, resetsAt, now = Date.now()) {
  if (utilization == null || !Number.isFinite(utilization)) return null;
  if (resetsAt == null || !Number.isFinite(resetsAt)) return null;
  const windowStart = resetsAt - SEVEN_DAYS_MS;
  const elapsedFraction = Math.max(0, Math.min(1, (now - windowStart) / SEVEN_DAYS_MS));
  const actualPct = Math.round(Math.max(0, utilization) * 100);
  const expectedPct = Math.round(elapsedFraction * 100);
  const deltaPct = actualPct - expectedPct;
  const status = deltaPct > PACE_ON_BAND ? "ahead" : deltaPct < -PACE_ON_BAND ? "under" : "on";
  const projectedPct =
    elapsedFraction >= PROJECT_MIN_ELAPSED
      ? Math.round((Math.max(0, utilization) / elapsedFraction) * 100)
      : null;
  return { actualPct, expectedPct, deltaPct, projectedPct, status, elapsedFraction };
}

/**
 * One pace line: used percent, signed +/- points vs the linear burn, and the
 * run-out or reset date. utilization is the raw 0..1 fraction the projection
 * scales from. A 20-point overage reads "+20 pts".
 */
function renderPaceLine(label, pace, resetsAtMs, utilization) {
  if (pace === null) return label + " pace: —";
  var parts = [label + " pace: " + pace.actualPct + "% used"];
  parts.push((pace.deltaPct > 0 ? "+" : "") + pace.deltaPct + " pts");
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
      return res
        .json()
        .catch(function () {
          return null;
        })
        .then(function (json) {
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

/** POST one same-origin route (cookie extract/login), same {data,error} shape. */
function postJson(url) {
  return fetch(url, { method: "POST", cache: "no-store" })
    .then(function (res) {
      return res
        .json()
        .catch(function () {
          return null;
        })
        .then(function (json) {
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

/** PUT one same-origin route with a JSON body; same {data,error} shape. */
function putJson(url, body) {
  return fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  })
    .then(function (res) {
      return res
        .json()
        .catch(function () {
          return null;
        })
        .then(function (json) {
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
    rows.push(
      react.createElement(
        "div",
        { className: "ocgs-row", key: def.key },
        react.createElement(
          "div",
          { className: "ocgs-row-label" },
          react.createElement("b", null, def.label),
          statusText(win, def.hint)
            ? react.createElement(
                "span",
                { className: "ocgs-stale" },
                "resets in " + statusText(win, def.hint),
              )
            : null,
          react.createElement("b", null, percent + "%"),
        ),
        react.createElement(
          "div",
          { className: "ocgs-meta" },
          react.createElement(
            "div",
            { className: "ocgs-track" },
            react.createElement("div", {
              className: "ocgs-fill",
              style: {
                width: Math.max(0, Math.min(100, percent)) + "%",
                background: fillColor(percent),
              },
            }),
          ),
        ),
      ),
    );
  }
  return rows;
}

/** One DeepSeek balance line from `balance_infos[0]`. */
function renderDsBalance(info) {
  var total = parseFloat(info.total_balance);
  var granted = parseFloat(info.granted_balance);
  var topped = parseFloat(info.topped_up_balance);
  var currency = info.currency || "USD";
  var parts = [];
  if (Number.isFinite(total)) parts.push("$" + total.toFixed(2) + " " + currency + " balance");
  if (Number.isFinite(topped)) parts.push("top-up $" + topped.toFixed(2));
  if (Number.isFinite(granted)) parts.push("granted $" + granted.toFixed(2));
  return parts.join(" · ");
}

/** DeepSeek dashboard: big balance + monthly cost + token breakdown. */
function renderDsDashboard(bal, amount, cost) {
  var total = parseFloat(bal.total_balance);
  var granted = parseFloat(bal.granted_balance);
  var topped = parseFloat(bal.topped_up_balance);
  var currency = bal.currency || "USD";

  // Parse monthly usage amount (tokens)
  var inTokens = 0,
    outTokens = 0,
    cacheRead = 0,
    cacheWrite = 0,
    totalTokens = 0;
  var perModel = [];
  if (amount && !amount.error && amount.data) {
    // Expected shape: array of {model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens}
    var data = amount.data;
    if (Array.isArray(data)) {
      for (var mi = 0; mi < data.length; mi++) {
        var m = data[mi];
        var it = Number(m.input_tokens || 0),
          ot = Number(m.output_tokens || 0);
        var cr = Number(m.cache_read_tokens || 0),
          cw = Number(m.cache_write_tokens || 0);
        inTokens += it;
        outTokens += ot;
        cacheRead += cr;
        cacheWrite += cw;
        var mt = it + ot + cr + cw;
        if (mt > 0 && m.model)
          perModel.push({
            model: m.model,
            total: mt,
            input: it,
            output: ot,
            cacheRead: cr,
            cacheWrite: cw,
          });
      }
    }
  }
  totalTokens = inTokens + outTokens + cacheRead + cacheWrite;

  // Parse monthly cost
  var totalCost = 0;
  var costByModel = [];
  if (cost && !cost.error && cost.data) {
    var cdata = cost.data;
    if (Array.isArray(cdata)) {
      for (var ci = 0; ci < cdata.length; ci++) {
        var cm = cdata[ci];
        var cst = Number(cm.cost || cm.total_cost || cm.usd || 0);
        totalCost += cst;
        if (cst > 0 && cm.model) costByModel.push({ model: cm.model, cost: cst });
      }
    }
  }

  var heroLines = [];
  if (Number.isFinite(total)) heroLines.push("$" + total.toFixed(2) + " " + currency);
  var subLines = [];
  if (Number.isFinite(topped)) subLines.push("top-up $" + topped.toFixed(2));
  if (Number.isFinite(granted)) subLines.push("granted $" + granted.toFixed(2));

  var usageCards = [];
  if (totalTokens > 0 || totalCost > 0) {
    usageCards.push(
      react.createElement(
        "div",
        { className: "ds-usage-card" },
        react.createElement("div", { className: "ds-usage-label" }, "Total Cost"),
        react.createElement("div", { className: "ds-usage-value" }, "$" + totalCost.toFixed(2)),
      ),
    );
    usageCards.push(
      react.createElement(
        "div",
        { className: "ds-usage-card" },
        react.createElement("div", { className: "ds-usage-label" }, "Total Tokens"),
        react.createElement("div", { className: "ds-usage-value" }, fmtCount(totalTokens)),
        react.createElement(
          "div",
          { className: "ds-usage-sub" },
          "in " +
            fmtCount(inTokens) +
            " · out " +
            fmtCount(outTokens) +
            " · cache " +
            fmtCount(cacheRead + cacheWrite),
        ),
      ),
    );
    // Per-model cost
    for (var cmi = 0; cmi < costByModel.length; cmi++) {
      var cm = costByModel[cmi];
      usageCards.push(
        react.createElement(
          "div",
          { className: "ds-usage-card" },
          react.createElement("div", { className: "ds-usage-label" }, cm.model),
          react.createElement("div", { className: "ds-usage-value" }, "$" + cm.cost.toFixed(2)),
        ),
      );
    }
  } else {
    usageCards.push(
      react.createElement(
        "div",
        { className: "ds-usage-card ds-empty" },
        "No usage data (sign in to platform.deepseek.com)",
      ),
    );
  }

  return react.createElement(
    "div",
    { className: "ds-dashboard" },
    react.createElement(
      "div",
      { className: "ds-hero" },
      react.createElement("div", { className: "ds-hero-total" }, heroLines[0]),
      react.createElement("div", { className: "ds-hero-breakdown" }, subLines.join(" · ")),
    ),
    react.createElement("div", { className: "ds-usage-grid" }, usageCards),
  );
}

/**
 * Flatten one named-chain value to an ordered route list (client mirror of
 * the host chainOf in plugins/profile-routes.ts). Handles { routes: [...] },
 * composition arrays, "chain:<name>" refs, and "provider/model" strings.
 */
function chainRoutes(value, chains, seen) {
  var out = [];
  if (value === null || value === undefined) return out;
  if (typeof value === "string") {
    if (value.indexOf("chain:") === 0) {
      var refName = value.slice("chain:".length);
      if (chains && chains[refName] && (!seen || !seen.has(refName))) {
        var guard = new Set(seen || []);
        guard.add(refName);
        return chainRoutes(chains[refName], chains, guard);
      }
      return out;
    }
    var slash = value.indexOf("/");
    if (slash > 0) return [{ provider: value.slice(0, slash), model: value.slice(slash + 1) }];
    if (chains && chains[value] && (!seen || !seen.has(value))) {
      var guard2 = new Set(seen || []);
      guard2.add(value);
      return chainRoutes(chains[value], chains, guard2);
    }
    return out;
  }
  if (Array.isArray(value)) {
    for (var ci = 0; ci < value.length; ci++)
      out = out.concat(chainRoutes(value[ci], chains, seen));
    return out;
  }
  if (value && typeof value === "object" && Array.isArray(value.routes)) {
    for (var cj = 0; cj < value.routes.length; cj++) {
      var route = value.routes[cj];
      if (route && typeof route.provider === "string" && typeof route.model === "string") {
        out.push({ provider: route.provider, model: route.model });
      }
    }
  }
  return out;
}

/** True when two route lists carry the same provider/model pairs in order. */
function routesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (var ri = 0; ri < a.length; ri++) {
    if (a[ri].provider !== b[ri].provider || a[ri].model !== b[ri].model) return false;
  }
  return true;
}

/** Reverse-match a chain NAME from its flattened routes against the library. */
function chainNameFor(routes, chains) {
  if (!chains || typeof chains !== "object") return null;
  var keys = Object.keys(chains);
  for (var ki = 0; ki < keys.length; ki++) {
    var flat = chainRoutes(chains[keys[ki]], chains, new Set([keys[ki]]));
    if (routesEqual(flat, routes)) return keys[ki];
  }
  return null;
}

/** Command Code window meters (5-hour + weekly). [] when no usable data. */
function buildCcMeters(cc) {
  var meters = [];
  if (!cc || cc.error || !cc.data || cc.data.ok !== true) return meters;
  var wins = cc.data.windows || null;
  var ccDefs = [
    { key: "fiveHour", label: "5-hour" },
    { key: "weekly", label: "Weekly" },
  ];
  for (var mi = 0; mi < ccDefs.length; mi++) {
    var def = ccDefs[mi];
    var win = wins ? wins[def.key] : null;
    if (!win) continue;
    var used = typeof win.used === "number" ? win.used : null;
    var cap = typeof win.cap === "number" ? win.cap : null;
    if (used === null || cap === null || cap <= 0) continue;
    var pct = Math.round((used / cap) * 100);
    meters.push(
      react.createElement(
        "div",
        { className: "ocgs-row", key: def.key },
        react.createElement(
          "div",
          { className: "ocgs-row-label" },
          react.createElement("b", null, def.label),
          win.resetAt
            ? react.createElement(
                "span",
                { className: "ocgs-stale" },
                "resets in " + timeUntil(win.resetAt),
              )
            : null,
          react.createElement("b", null, pct + "%"),
        ),
        react.createElement(
          "div",
          { className: "ocgs-meta" },
          react.createElement(
            "div",
            { className: "ocgs-track" },
            react.createElement("div", {
              className: "ocgs-fill",
              style: { width: Math.max(0, Math.min(100, pct)) + "%", background: fillColor(pct) },
            }),
          ),
        ),
      ),
    );
  }
  return meters;
}
/**
 * Build the panel component. The plugin context is captured so the
 * interval (timer service) and the refresh state stay per-registration.
 */

/** Cached snap key: last successful fetch, for instant first paint. */
var SNAP_KEY = "subscriptions:lastSnap";

/** True when localStorage accepts writes. Probe with a throwaway key. */
function storageAvailable() {
  try {
    localStorage.setItem("subscriptions:probe", "1");
    localStorage.removeItem("subscriptions:probe");
    return true;
  } catch (e) {
    return false;
  }
}

/** Read the cached snap, or null when missing or unreadable. */
function readLastSnap() {
  try {
    var raw = localStorage.getItem(SNAP_KEY);
    if (!raw) return null;
    var parsed = JSON.parse(raw);
    if (!parsed || !Number.isFinite(parsed.ts) || !parsed.data || typeof parsed.data !== "object")
      return null;
    return { ts: parsed.ts, data: parsed.data };
  } catch (e) {
    return null;
  }
}

/** Write the snap with a timestamp. Failures are silent. */
function writeLastSnap(snap) {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify({ ts: Date.now(), data: snap }));
  } catch (e) {
    // storage full or blocked: ignore
  }
}

/** Relative age of a fetch: "Just now" up to "N days ago". */
function fmtStale(ts) {
  var mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 2) return "Just now";
  if (mins < 60) return mins + " minutes ago";
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + " hours ago";
  return Math.floor(hours / 24) + " days ago";
}

/** A provider section shows unless config.providers[<key>] is false. */
function providerVisible(config, key) {
  var providers = (config && config.providers) || {};
  return providers[key] !== false;
}

/** Command Code section: hero balance, two window meters, monthly cost. */
function renderCcSection(cc, ccUsage) {
  var errorLine = null;
  if (cc && cc.error) {
    errorLine = "Command Code: " + cc.error;
  } else if (cc && cc.data && cc.data.ok === false) {
    errorLine = "Command Code: " + (cc.data.error || "credits unavailable");
  } else if (ccUsage && ccUsage.error) {
    errorLine = "Command Code: " + ccUsage.error;
  } else if (ccUsage && ccUsage.data && ccUsage.data.ok === false) {
    errorLine = "Command Code: " + (ccUsage.data.error || "usage unavailable");
  }

  var creds = cc && cc.data && cc.data.ok === true ? cc.data.credits : null;
  var usage = ccUsage && ccUsage.data && ccUsage.data.ok === true ? ccUsage.data : null;

  var hero = null;
  var total = 0;
  var breakdown = [];
  if (creds) {
    if (typeof creds.monthly === "number") {
      total += creds.monthly;
      breakdown.push("monthly $" + creds.monthly.toFixed(2));
    }
    if (typeof creds.purchased === "number") {
      total += creds.purchased;
      breakdown.push("purchased $" + creds.purchased.toFixed(2));
    }
    if (typeof creds.free === "number") {
      total += creds.free;
      breakdown.push("free $" + creds.free.toFixed(2));
    }
  }
  if (breakdown.length > 0) {
    hero = react.createElement(
      "div",
      { className: "ds-hero" },
      react.createElement("div", { className: "ds-hero-total" }, "$" + total.toFixed(2)),
      react.createElement("div", { className: "ds-hero-breakdown" }, breakdown.join(" · ")),
    );
  }

  var meters = buildCcMeters(cc);

  var costCard = null;
  if (usage && typeof usage.totalCost === "number") {
    var period = usage.periodStart
      ? fmtDate(usage.periodStart) + (usage.periodEnd ? " – " + fmtDate(usage.periodEnd) : "")
      : "this period";
    costCard = react.createElement(
      "div",
      { className: "ds-usage-card" },
      react.createElement("div", { className: "ds-usage-label" }, "Monthly cost"),
      react.createElement("div", { className: "ds-usage-value" }, "$" + usage.totalCost.toFixed(2)),
      react.createElement("div", { className: "ds-usage-sub" }, period),
    );
  }

  return react.createElement(
    "div",
    { className: "ocgs-section" },
    react.createElement("h4", { className: "ocgs-section-title" }, "Command Code"),
    errorLine ? react.createElement("div", { className: "ocgs-err" }, errorLine) : null,
    hero,
    meters.length > 0 ? react.createElement("div", { className: "ocgs-rows" }, meters) : null,
    costCard ? react.createElement("div", { className: "ds-usage-grid" }, costCard) : null,
  );
}

function makePanel(ctx, config) {
  return function Panel() {
    var snapState = react.useState(null);
    var snap = snapState[0];
    var setSnap = snapState[1];

    var staleTsState = react.useState(null);
    var staleTs = staleTsState[0];
    var setStaleTs = staleTsState[1];

    var cacheOkState = react.useState(null);
    var cacheOk = cacheOkState[0];
    var setCacheOk = cacheOkState[1];

    // Cordis passes the composition entry config to client halves; when it is
    // absent, fetch the resolved namespace through the same-origin web route.
    var cfgState = react.useState(config);
    var cfg = cfgState[0];
    var setCfg = cfgState[1];
    react.useEffect(function () {
      if (config == null) {
        fetchJson("/subscriptions/config")
          .then(function (result) {
            if (result.data && result.data.config) setCfg(result.data.config);
          })
          .catch(function () {});
      }
    }, []);
    var load = async function () {
      var now = new Date();
      var month = now.getMonth() + 1;
      var year = now.getFullYear();
      var results = await Promise.all([
        fetchJson("/subscriptions/opencode-usage"),
        fetchJson("/subscriptions/meridian-quota"),
        fetchJson("/subscriptions/meridian-telemetry"),
        fetchJson("/subscriptions/opencode-balance"),
        fetchJson("/subscriptions/deepseek-balance"),
        fetchJson("/subscriptions/deepseek-usage/amount?month=" + month + "&year=" + year),
        fetchJson("/subscriptions/deepseek-usage/cost?month=" + month + "&year=" + year),
        fetchJson("/subscriptions/commandcode-credits"),
        fetchJson("/subscriptions/commandcode-usage"),
        fetchJson("/subscriptions/opencode-zen-balance"),
        fetchJson("/profiles/config"),
      ]);
      var snapData = {
        go: results[0],
        quota: results[1],
        telemetry: results[2],
        balance: results[3],
        ds: results[4],
        dsUsageAmount: results[5],
        dsUsageCost: results[6],
        cc: results[7],
        ccUsage: results[8],
        oz: results[9],
        profiles: results[10],
      };
      setSnap(snapData);
      setStaleTs(Date.now());
      writeLastSnap(snapData);
    };

    react.useEffect(function () {
      var ok = storageAvailable();
      setCacheOk(ok);
      if (ok) {
        var cached = readLastSnap();
        if (cached) {
          setSnap(cached.data);
          setStaleTs(cached.ts);
        }
      }
      load();
      var timer = window.setInterval(load, 60000);
      return function () {
        window.clearInterval(timer);
      };
    }, []);

    var go = snap ? snap.go : null;
    var quota = snap ? snap.quota : null;
    var telemetry = snap ? snap.telemetry : null;
    var balance = snap ? snap.balance : null;
    var ds = snap ? snap.ds : null;
    var dsUsageAmount = snap ? snap.dsUsageAmount : null;
    var dsUsageCost = snap ? snap.dsUsageCost : null;
    var cc = snap ? snap.cc : null;
    var ccUsage = snap ? snap.ccUsage : null;
    var profiles = snap ? snap.profiles : null;
    var oz = snap ? snap.oz : null;
    // Firefox cookie fetch state and handlers.
    var cookieState = react.useState({ busy: false, note: null, showLogin: false });
    var cookie = cookieState[0];
    var setCookie = cookieState[1];

    // Firefox DeepSeek platform token fetch state and handlers.
    var dsTokenState = react.useState({ busy: false, note: null, showLogin: false });
    var dsToken = dsTokenState[0];
    var setDsToken = dsTokenState[1];

    var fetchCookie = async function () {
      setCookie({ busy: true, note: null, showLogin: false });
      var result = await postJson("/subscriptions/opencode-cookie/extract");
      if (result.data && result.data.ok === true) {
        setCookie({ busy: false, note: "Cookie saved", showLogin: false });
        load();
      } else if (result.data && result.data.invalid === true) {
        setCookie({ busy: false, note: result.error || "Cookie is stale", showLogin: true });
      } else {
        setCookie({ busy: false, note: result.error || "Extract failed", showLogin: false });
      }
    };

    var openLogin = async function () {
      var result = await postJson("/subscriptions/opencode-cookie/login");
      setCookie({
        busy: false,
        note:
          result.data && result.data.ok
            ? "Login page opened in Firefox; sign in, then fetch the cookie again"
            : result.error || "Could not open Firefox",
        showLogin: false,
      });
    };

    var fetchDsToken = async function () {
      setDsToken({ busy: true, note: null, showLogin: false });
      var result = await postJson("/subscriptions/deepseek-token/extract");
      if (result.data && result.data.ok === true) {
        setDsToken({ busy: false, note: "Token saved", showLogin: false });
        load();
      } else {
        setDsToken({ busy: false, note: result.error || "Extract failed", showLogin: true });
      }
    };

    var openDsLogin = async function () {
      var result = await postJson("/subscriptions/deepseek-token/login");
      setDsToken({
        busy: false,
        note:
          result.data && result.data.ok
            ? "Login page opened in Firefox; sign in, then fetch the token again"
            : result.error || "Could not open Firefox",
        showLogin: false,
      });
    };

    var refreshOz = async function () {
      var result = await fetchJson("/subscriptions/opencode-zen-balance");
      setSnap(Object.assign({}, snap, { oz: result }));
      setStaleTs(Date.now());
    };

    // Provider visibility toggle state and persistence.
    var toggleState = react.useState(null);
    var toggleBusy = toggleState[0];
    var setToggleBusy = toggleState[1];

    var toggleProvider = function (key) {
      var providers = (cfg && cfg.providers) || {};
      var next = Object.assign({}, providers, { [key]: !(providers[key] !== false) });
      setToggleBusy(key);
      putJson("/subscriptions/config", { providers: next }).then(function (result) {
        setToggleBusy(null);
        if (result.data && result.data.config) {
          setCfg(result.data.config);
        } else if (result.error) {
          // Keep the local map unchanged on failure.
        }
      });
    };

    // OpenCode GO windows

    var goUsage = go && !go.error && go.data ? go.data.usage : null;

    // Claude (meridian) windows: the profile the service marks active (by
    // id first, then isActive), not just the first profile with windows. The
    // service returns windows as an array of {type, ...}; the row builder
    // and the pace code expect a keyed map, so normalize it here.
    var claudeWindows = null;
    if (quota && !quota.error && quota.data && Array.isArray(quota.data.profiles)) {
      var quotaProfiles = quota.data.profiles;
      var activeQuotaId =
        typeof quota.data.activeProfile === "string" ? quota.data.activeProfile : null;
      var pickedProfile = null;
      if (activeQuotaId) {
        for (var pj = 0; pj < quotaProfiles.length; pj++) {
          if (quotaProfiles[pj] && quotaProfiles[pj].id === activeQuotaId) {
            pickedProfile = quotaProfiles[pj];
            break;
          }
        }
      }
      if (pickedProfile === null) {
        for (var pk = 0; pk < quotaProfiles.length; pk++) {
          if (quotaProfiles[pk] && quotaProfiles[pk].isActive === true) {
            pickedProfile = quotaProfiles[pk];
            break;
          }
        }
      }
      if (pickedProfile === null && quotaProfiles.length > 0) pickedProfile = quotaProfiles[0];
      if (pickedProfile) {
        var pickedWindows = pickedProfile.windows;
        if (Array.isArray(pickedWindows)) {
          var wmap = {};
          for (var wj = 0; wj < pickedWindows.length; wj++) {
            var ww = pickedWindows[wj];
            if (ww && typeof ww.type === "string") wmap[ww.type] = ww;
          }
          claudeWindows = wmap;
        } else if (pickedWindows) {
          claudeWindows = pickedWindows;
        }
        // The picked profile may carry no windows yet (cold start); fall
        // back to the first profile that has some so a meter still renders.
        if (!claudeWindows || Object.keys(claudeWindows).length === 0) {
          for (var pl = 0; pl < quotaProfiles.length; pl++) {
            var fallback = quotaProfiles[pl];
            if (fallback && Array.isArray(fallback.windows) && fallback.windows.length > 0) {
              var fmap = {};
              for (var wl = 0; wl < fallback.windows.length; wl++) {
                var fw = fallback.windows[wl];
                if (fw && typeof fw.type === "string") fmap[fw.type] = fw;
              }
              claudeWindows = fmap;
              break;
            }
          }
        }
      }
    }

    // Balance line
    var balanceLine = null;
    if (balance) {
      if (balance.error) {
        balanceLine = "Balance: " + balance.error;
      } else if (
        balance.data &&
        balance.data.ok === true &&
        typeof balance.data.balance === "number"
      ) {
        balanceLine = "$" + balance.data.balance.toFixed(2) + " balance";
      }
    }

    // OpenCode Zen balance line
    var ozBalanceLine = null;
    if (oz) {
      if (oz.error) {
        ozBalanceLine = "Balance: " + oz.error;
      } else if (oz.data && oz.data.ok === true && typeof oz.data.balance === "number") {
        var ozCurrency = (oz.data.currency || "USD").toUpperCase();
        ozBalanceLine = "$" + oz.data.balance.toFixed(2) + " " + ozCurrency + " balance";
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
        goPaceLine = renderPaceLine(
          "weekly",
          computeWeeklyPace(goUtil, goResetsMs),
          goResetsMs,
          goUtil,
        );
      }
    }

    // Weekly pace for Claude (seven_day window, utilization 0..1)
    var claudePaceLine = null;
    var claudeSeven = claudeWindows ? claudeWindows.seven_day : null;
    if (claudeSeven && typeof claudeSeven.utilization === "number") {
      var claudeResetsMs = new Date(claudeSeven.resetsAt).getTime();
      if (Number.isFinite(claudeResetsMs)) {
        claudePaceLine = renderPaceLine(
          "7d",
          computeWeeklyPace(claudeSeven.utilization, claudeResetsMs),
          claudeResetsMs,
          claudeSeven.utilization,
        );
      }
    }
    // Active profile + chain: /profiles/config names the active profile and
    // its orchestrator chain. The top quota block shows that chain and picks
    // the windows of its head provider, so the pick follows the chain in use.
    var profileInfo = null;
    if (profiles && !profiles.error && profiles.data && profiles.data.config) {
      var pcfg = profiles.data.config;
      var activeName = typeof pcfg.active === "string" ? pcfg.active : "work";
      var profileEntry = activeName === "personal" ? pcfg.personal : pcfg.work;
      var orcRoutes =
        profileEntry && profileEntry.orchestrator && Array.isArray(profileEntry.orchestrator.routes)
          ? profileEntry.orchestrator.routes
          : [];
      profileInfo = {
        active: activeName,
        chain: chainNameFor(orcRoutes, pcfg.chains),
        head: orcRoutes.length > 0 ? orcRoutes[0] : null,
      };
    }

    // Quota pick: windows of the active orchestrator chain's head provider.
    var quotaPick = null;
    var headProvider = profileInfo && profileInfo.head ? String(profileInfo.head.provider) : null;
    if (headProvider === "command-code") {
      var ccPickRows = buildCcMeters(cc);
      if (ccPickRows.length > 0) quotaPick = { rows: ccPickRows, pace: null };
    } else if (headProvider === "meridian" && claudeWindows) {
      quotaPick = { rows: buildRows(CLAUDE_WINDOWS, claudeWindows), pace: claudePaceLine };
    } else if ((headProvider === "opencode-zen" || headProvider === "opencode-go") && goUsage) {
      quotaPick = { rows: buildRows(GO_WINDOWS, goUsage), pace: goPaceLine };
    }

    var staleText = null;
    if (cacheOk === true && staleTs !== null) {
      staleText = "Last fetched " + fmtStale(staleTs);
    }

    // Data health: when every fetch failed, tell the user instead of showing
    // a body of empty section shells.
    var allFailed = false;
    var firstError = null;
    if (snap) {
      var dataKeys = [
        "go",
        "quota",
        "telemetry",
        "balance",
        "ds",
        "dsUsageAmount",
        "dsUsageCost",
        "cc",
        "ccUsage",
        "oz",
        "profiles",
      ];
      var failCount = 0;
      for (var di = 0; di < dataKeys.length; di++) {
        var entry = snap[dataKeys[di]];
        if (entry && entry.error) {
          failCount++;
          if (firstError === null) firstError = entry.error;
        }
      }
      allFailed = failCount === dataKeys.length;
    }

    return react.createElement(
      "div",
      { className: "ocgs-root" },
      react.createElement(
        "div",
        { className: "ocgs-head" },
        react.createElement(
          "div",
          { className: "ocgs-head-title" },
          react.createElement("h3", { className: "ocgs-title" }, "Subscriptions"),
          staleText ? react.createElement("span", { className: "ocgs-stale" }, staleText) : null,
        ),
        react.createElement("button", { className: "ocgs-refresh", onClick: load }, "Refresh"),
      ),

react.createElement(
        "details",
        { className: "ocgs-details" },
        react.createElement("summary", { className: "ocgs-summary" }, "Show sections"),
        react.createElement(
          "div",
          { className: "ocgs-toggles" },
          PROVIDER_TOGGLES.map(function (def) {
            var providers = (cfg && cfg.providers) || {};
            var visible = providers[def.key] !== false;
            return react.createElement(
              "label",
              { className: "ocgs-toggle", key: def.key },
              react.createElement("input", {
                type: "checkbox",
                checked: visible,
                disabled: toggleBusy !== null,
                onChange: function () {
                  toggleProvider(def.key);
                },
              }),
              react.createElement("span", { className: "ocgs-toggle-label" }, def.label),
            );
          }),
        ),
      ),
      snap === null
        ? react.createElement("div", { className: "ocgs-note" }, "Loading subscription data…")
        : null,
      allFailed
        ? react.createElement(
            "div",
            { className: "ocgs-err" },
            "Could not load subscription data. " +
              (firstError || "Check that the subscriptions plugin is mounted."),
          )
        : null,

      profileInfo || quotaPick || telemetryLine
        ? react.createElement(
            "div",
            { className: "ocgs-section" },
            react.createElement("h4", { className: "ocgs-section-title" }, "Quota"),
            profileInfo
              ? react.createElement(
                  "div",
                  { className: "ocgs-rows" },
                  react.createElement(
                    "div",
                    { className: "ocgs-row" },
                    react.createElement(
                      "div",
                      { className: "ocgs-row-label" },
                      react.createElement("b", null, "Profile: " + profileInfo.active),
                      profileInfo.chain
                        ? react.createElement(
                            "span",
                            { className: "ocgs-stale" },
                            "chain: " + profileInfo.chain,
                          )
                        : null,
                    ),
                  ),
                )
              : null,
            quotaPick
              ? react.createElement("div", { className: "ocgs-rows" }, quotaPick.rows)
              : null,
            quotaPick && quotaPick.pace
              ? react.createElement("div", { className: "ocgs-pace" }, quotaPick.pace)
              : null,
            telemetryLine
              ? react.createElement("div", { className: "ocgs-telemetry" }, telemetryLine)
              : null,
          )
        : null,

      providerVisible(cfg, "commandcode") ? renderCcSection(cc, ccUsage) : null,

      providerVisible(cfg, "claude")
        ? react.createElement(
            "div",
            { className: "ocgs-section" },
            react.createElement("h4", { className: "ocgs-section-title" }, "Claude (meridian)"),
            quota && quota.error
              ? react.createElement(
                  "div",
                  { className: "ocgs-err" },
                  "Claude (meridian): " + quota.error,
                )
              : null,
            react.createElement(
              "div",
              { className: "ocgs-rows" },
              buildRows(CLAUDE_WINDOWS, claudeWindows),
            ),
            claudePaceLine
              ? react.createElement("div", { className: "ocgs-pace" }, claudePaceLine)
              : null,
          )
        : null,

      providerVisible(cfg, "deepseek")
        ? react.createElement(
            "div",
            { className: "ocgs-section" },
            react.createElement("h4", { className: "ocgs-section-title" }, "DeepSeek"),
            ds && ds.error
              ? react.createElement("div", { className: "ocgs-err" }, "DeepSeek: " + ds.error)
              : null,
            ds &&
              ds.data &&
              Array.isArray(ds.data.balance_infos) &&
              ds.data.balance_infos.length > 0
              ? renderDsDashboard(ds.data.balance_infos[0], dsUsageAmount, dsUsageCost)
              : null,
            react.createElement(
              "div",
              { className: "ocgs-cookie" },
              react.createElement(
                "button",
                { className: "ocgs-btn", disabled: dsToken.busy, onClick: fetchDsToken },
                dsToken.busy ? "Fetching…" : "Fetch token from Firefox",
              ),
              dsToken.showLogin
                ? react.createElement(
                    "button",
                    { className: "ocgs-btn", onClick: openDsLogin },
                    "Open platform.deepseek.com",
                  )
                : null,
              dsToken.note
                ? react.createElement("span", { className: "ocgs-cookie-note" }, dsToken.note)
                : null,
            ),
          )
        : null,

      providerVisible(cfg, "opencode")
        ? react.createElement(
            "div",
            { className: "ocgs-section" },
            react.createElement("h4", { className: "ocgs-section-title" }, "OpenCode GO"),
            balanceLine
              ? react.createElement("div", { className: "ocgs-balance" }, balanceLine)
              : null,
            go && go.error
              ? react.createElement("div", { className: "ocgs-err" }, "OpenCode GO: " + go.error)
              : null,
            react.createElement("div", { className: "ocgs-rows" }, buildRows(GO_WINDOWS, goUsage)),
            goPaceLine ? react.createElement("div", { className: "ocgs-pace" }, goPaceLine) : null,
            react.createElement(
              "div",
              { className: "ocgs-cookie" },
              react.createElement(
                "button",
                { className: "ocgs-btn", disabled: cookie.busy, onClick: fetchCookie },
                cookie.busy ? "Fetching…" : "Fetch cookie from Firefox",
              ),
              cookie.showLogin
                ? react.createElement(
                    "button",
                    { className: "ocgs-btn", onClick: openLogin },
                    "Open login page",
                  )
                : null,
              cookie.note
                ? react.createElement("span", { className: "ocgs-cookie-note" }, cookie.note)
                : null,
            ),
          )
        : null,

      providerVisible(cfg, "opencode-zen")
        ? react.createElement(
            "div",
            { className: "ocgs-section" },
            react.createElement(
              "div",
              { className: "ocgs-head" },
              react.createElement("h4", { className: "ocgs-section-title" }, "OpenCode Zen"),
              react.createElement(
                "button",
                { className: "ocgs-refresh", onClick: refreshOz },
                "Refresh",
              ),
            ),
            ozBalanceLine
              ? react.createElement("div", { className: "ocgs-balance" }, ozBalanceLine)
              : null,
            oz && oz.error
              ? react.createElement("div", { className: "ocgs-err" }, "OpenCode Zen: " + oz.error)
              : null,
            react.createElement(
              "div",
              { className: "ocgs-cookie" },
              react.createElement(
                "button",
                { className: "ocgs-btn", disabled: cookie.busy, onClick: fetchCookie },
                cookie.busy ? "Fetching…" : "Fetch cookie from Firefox",
              ),
              cookie.showLogin
                ? react.createElement(
                    "button",
                    { className: "ocgs-btn", onClick: openLogin },
                    "Open opencode.ai",
                  )
                : null,
              cookie.note
                ? react.createElement("span", { className: "ocgs-cookie-note" }, cookie.note)
                : null,
            ),
          )
        : null,
    );
  };
}

/** Stable Cordis plugin name. */
var name = PLUGIN_NAME;
/** Services this bundle reaches through the plugin context. */
var inject = ["slots"];
/** Plugin body: inject the styles once and register the settings section. */
function apply(ctx, config) {
  ctx.effect(function () {
    if (typeof document === "undefined") return;
    if (document.querySelector('style[data-plugin-css="' + STYLE_TAG_ID + '"]') !== null) return;
    var tag = document.createElement("style");
    tag.dataset.plugin = PLUGIN_NAME;
    tag.dataset.pluginCss = STYLE_TAG_ID;
    tag.textContent = CSS_TEXT;
    document.head.appendChild(tag);
  }, "subscriptions: styles");

  // The panel component is created once, so its identity stays stable across
  // slot re-renders and React keeps its state (data) between them.
  var Panel = makePanel(ctx, config);
  ctx.slots.inject("settings.section", function () {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 26, label: "Subscriptions" },
      function () {
        return react.createElement(Panel);
      },
    );
  });
}

export { apply, inject, name };
