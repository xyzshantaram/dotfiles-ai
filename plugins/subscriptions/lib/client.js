window.__ModuleLoader__.load({
	id: "subscriptions",
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

// plugins/subscriptions/src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);
var PLUGIN_NAME = "subscriptions";
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
  ".ocgs-note{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary)}"
].join("");
var GO_WINDOWS = [
  { key: "rolling", label: "Rolling (5h)", hint: "5h" },
  { key: "weekly", label: "Weekly", hint: null },
  { key: "monthly", label: "Monthly", hint: null }
];
var CLAUDE_WINDOWS = [
  { key: "five_hour", label: "5-hour", hint: null },
  { key: "seven_day", label: "7-day", hint: null },
  { key: "seven_day_fable", label: "7-day fable", hint: null }
];
var PROVIDER_TOGGLES = [
  { key: "commandcode", label: "Command Code" },
  { key: "claude", label: "Claude (meridian)" },
  { key: "deepseek", label: "DeepSeek" },
  { key: "opencode", label: "OpenCode GO" },
  { key: "opencode-zen", label: "OpenCode Zen" }
];
function fillColor(percent) {
  if (percent >= 90) return "var(--dsw-alias-state-error-primary)";
  if (percent >= 70) return "var(--dsw-alias-state-warn-primary)";
  return "var(--dsw-alias-state-success-primary)";
}
function timeUntil(iso) {
  var target = new Date(iso).getTime();
  if (!Number.isFinite(target)) return "";
  var diff = target - Date.now();
  if (diff <= 0) return "resets soon";
  var mins = Math.floor(diff / 6e4);
  if (mins < 60) return mins + "m";
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + "h" + mins % 60 + "m";
  return Math.floor(hours / 24) + "d" + hours % 24 + "h";
}
function fmtDate(ts) {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtCount(n) {
  if (n === null || n === void 0 || isNaN(n)) return "\u2014";
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(Math.round(n));
}
function renderTelemetry(t) {
  var usage = t.tokenUsage || {};
  var totalTokens = (usage.totalInputTokens || 0) + (usage.totalOutputTokens || 0) + (usage.totalCacheReadTokens || 0) + (usage.totalCacheCreationTokens || 0);
  var usd = t.costEstimate && typeof t.costEstimate.totalUsd === "number" ? "$" + t.costEstimate.totalUsd.toFixed(2) + " est" : "\u2014 est";
  var req = typeof t.totalRequests === "number" ? String(t.totalRequests) : "\u2014";
  return "24h: " + req + " req \xB7 " + usd + " \xB7 " + fmtCount(totalTokens) + " tokens";
}
function windowPercent(win) {
  if (typeof win.percent === "number") return win.percent;
  if (typeof win.utilization === "number") return win.utilization * 100;
  return null;
}
function statusText(win, hint) {
  if (typeof win.status === "string" && win.status !== "ok") return win.status;
  if (win.resetsAt) return timeUntil(win.resetsAt);
  return hint || "";
}
var SEVEN_DAYS_MS = 7 * 864e5;
var PACE_ON_BAND = 5;
var PROJECT_MIN_ELAPSED = 0.1;
function computeWeeklyPace(utilization, resetsAt, now = Date.now()) {
  if (utilization == null || !Number.isFinite(utilization)) return null;
  if (resetsAt == null || !Number.isFinite(resetsAt)) return null;
  const windowStart = resetsAt - SEVEN_DAYS_MS;
  const elapsedFraction = Math.max(0, Math.min(1, (now - windowStart) / SEVEN_DAYS_MS));
  const actualPct = Math.round(Math.max(0, utilization) * 100);
  const expectedPct = Math.round(elapsedFraction * 100);
  const deltaPct = actualPct - expectedPct;
  const status = deltaPct > PACE_ON_BAND ? "ahead" : deltaPct < -PACE_ON_BAND ? "under" : "on";
  const projectedPct = elapsedFraction >= PROJECT_MIN_ELAPSED ? Math.round(Math.max(0, utilization) / elapsedFraction * 100) : null;
  return { actualPct, expectedPct, deltaPct, projectedPct, status, elapsedFraction };
}
function renderPaceLine(label, pace, resetsAtMs, utilization) {
  if (pace === null) return label + " pace: \u2014";
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
  return parts.join(" \xB7 ");
}
function fetchJson(url) {
  return fetch(url, { cache: "no-store" }).then(function(res) {
    return res.json().catch(function() {
      return null;
    }).then(function(json) {
      return { ok: res.ok, status: res.status, json };
    });
  }).then(function(result) {
    if (result.json !== null && result.json.error) {
      return { data: null, error: String(result.json.error) };
    }
    if (!result.ok) return { data: null, error: "HTTP " + result.status };
    return { data: result.json, error: null };
  }).catch(function(e) {
    return { data: null, error: String(e && e.message || e) };
  });
}
function postJson(url) {
  return fetch(url, { method: "POST", cache: "no-store" }).then(function(res) {
    return res.json().catch(function() {
      return null;
    }).then(function(json) {
      return { ok: res.ok, status: res.status, json };
    });
  }).then(function(result) {
    if (result.json !== null && result.json.error) {
      return { data: null, error: String(result.json.error) };
    }
    if (!result.ok) return { data: null, error: "HTTP " + result.status };
    return { data: result.json, error: null };
  }).catch(function(e) {
    return { data: null, error: String(e && e.message || e) };
  });
}
function putJson(url, body) {
  return fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store"
  }).then(function(res) {
    return res.json().catch(function() {
      return null;
    }).then(function(json) {
      return { ok: res.ok, status: res.status, json };
    });
  }).then(function(result) {
    if (result.json !== null && result.json.error) {
      return { data: null, error: String(result.json.error) };
    }
    if (!result.ok) return { data: null, error: "HTTP " + result.status };
    return { data: result.json, error: null };
  }).catch(function(e) {
    return { data: null, error: String(e && e.message || e) };
  });
}
function buildRows(defs, windows) {
  var rows = [];
  for (var i = 0; i < defs.length; i++) {
    var def = defs[i];
    var win = windows ? windows[def.key] : null;
    if (!win) continue;
    var percent = windowPercent(win);
    if (percent === null) continue;
    rows.push(
      import_react.default.createElement(
        "div",
        { className: "ocgs-row", key: def.key },
        import_react.default.createElement(
          "div",
          { className: "ocgs-row-label" },
          import_react.default.createElement("b", null, def.label),
          statusText(win, def.hint) ? import_react.default.createElement(
            "span",
            { className: "ocgs-stale" },
            "resets in " + statusText(win, def.hint)
          ) : null,
          import_react.default.createElement("b", null, percent + "%")
        ),
        import_react.default.createElement(
          "div",
          { className: "ocgs-meta" },
          import_react.default.createElement(
            "div",
            { className: "ocgs-track" },
            import_react.default.createElement("div", {
              className: "ocgs-fill",
              style: {
                width: Math.max(0, Math.min(100, percent)) + "%",
                background: fillColor(percent)
              }
            })
          )
        )
      )
    );
  }
  return rows;
}
function renderDsDashboard(bal, amount, cost) {
  var total = parseFloat(bal.total_balance);
  var granted = parseFloat(bal.granted_balance);
  var topped = parseFloat(bal.topped_up_balance);
  var currency = bal.currency || "USD";
  var inTokens = 0, outTokens = 0, cacheRead = 0, cacheWrite = 0, totalTokens = 0;
  var perModel = [];
  if (amount && !amount.error && amount.data) {
    var data = amount.data;
    if (Array.isArray(data)) {
      for (var mi = 0; mi < data.length; mi++) {
        var m = data[mi];
        var it = Number(m.input_tokens || 0), ot = Number(m.output_tokens || 0);
        var cr = Number(m.cache_read_tokens || 0), cw = Number(m.cache_write_tokens || 0);
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
            cacheWrite: cw
          });
      }
    }
  }
  totalTokens = inTokens + outTokens + cacheRead + cacheWrite;
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
      import_react.default.createElement(
        "div",
        { className: "ds-usage-card" },
        import_react.default.createElement("div", { className: "ds-usage-label" }, "Total Cost"),
        import_react.default.createElement("div", { className: "ds-usage-value" }, "$" + totalCost.toFixed(2))
      )
    );
    usageCards.push(
      import_react.default.createElement(
        "div",
        { className: "ds-usage-card" },
        import_react.default.createElement("div", { className: "ds-usage-label" }, "Total Tokens"),
        import_react.default.createElement("div", { className: "ds-usage-value" }, fmtCount(totalTokens)),
        import_react.default.createElement(
          "div",
          { className: "ds-usage-sub" },
          "in " + fmtCount(inTokens) + " \xB7 out " + fmtCount(outTokens) + " \xB7 cache " + fmtCount(cacheRead + cacheWrite)
        )
      )
    );
    for (var cmi = 0; cmi < costByModel.length; cmi++) {
      var cm = costByModel[cmi];
      usageCards.push(
        import_react.default.createElement(
          "div",
          { className: "ds-usage-card" },
          import_react.default.createElement("div", { className: "ds-usage-label" }, cm.model),
          import_react.default.createElement("div", { className: "ds-usage-value" }, "$" + cm.cost.toFixed(2))
        )
      );
    }
  } else {
    usageCards.push(
      import_react.default.createElement(
        "div",
        { className: "ds-usage-card ds-empty" },
        "No usage data (sign in to platform.deepseek.com)"
      )
    );
  }
  return import_react.default.createElement(
    "div",
    { className: "ds-dashboard" },
    import_react.default.createElement(
      "div",
      { className: "ds-hero" },
      import_react.default.createElement("div", { className: "ds-hero-total" }, heroLines[0]),
      import_react.default.createElement("div", { className: "ds-hero-breakdown" }, subLines.join(" \xB7 "))
    ),
    import_react.default.createElement("div", { className: "ds-usage-grid" }, usageCards)
  );
}
function chainRoutes(value, chains, seen) {
  var out = [];
  if (value === null || value === void 0) return out;
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
function routesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (var ri = 0; ri < a.length; ri++) {
    if (a[ri].provider !== b[ri].provider || a[ri].model !== b[ri].model) return false;
  }
  return true;
}
function chainNameFor(routes, chains) {
  if (!chains || typeof chains !== "object") return null;
  var keys = Object.keys(chains);
  for (var ki = 0; ki < keys.length; ki++) {
    var flat = chainRoutes(chains[keys[ki]], chains, /* @__PURE__ */ new Set([keys[ki]]));
    if (routesEqual(flat, routes)) return keys[ki];
  }
  return null;
}
function buildCcMeters(cc) {
  var meters = [];
  if (!cc || cc.error || !cc.data || cc.data.ok !== true) return meters;
  var wins = cc.data.windows || null;
  var ccDefs = [
    { key: "fiveHour", label: "5-hour" },
    { key: "weekly", label: "Weekly" }
  ];
  for (var mi = 0; mi < ccDefs.length; mi++) {
    var def = ccDefs[mi];
    var win = wins ? wins[def.key] : null;
    if (!win) continue;
    var used = typeof win.used === "number" ? win.used : null;
    var cap = typeof win.cap === "number" ? win.cap : null;
    if (used === null || cap === null || cap <= 0) continue;
    var pct = Math.round(used / cap * 100);
    meters.push(
      import_react.default.createElement(
        "div",
        { className: "ocgs-row", key: def.key },
        import_react.default.createElement(
          "div",
          { className: "ocgs-row-label" },
          import_react.default.createElement("b", null, def.label),
          win.resetAt ? import_react.default.createElement(
            "span",
            { className: "ocgs-stale" },
            "resets in " + timeUntil(win.resetAt)
          ) : null,
          import_react.default.createElement("b", null, pct + "%")
        ),
        import_react.default.createElement(
          "div",
          { className: "ocgs-meta" },
          import_react.default.createElement(
            "div",
            { className: "ocgs-track" },
            import_react.default.createElement("div", {
              className: "ocgs-fill",
              style: { width: Math.max(0, Math.min(100, pct)) + "%", background: fillColor(pct) }
            })
          )
        )
      )
    );
  }
  return meters;
}
var SNAP_KEY = "subscriptions:lastSnap";
function storageAvailable() {
  try {
    localStorage.setItem("subscriptions:probe", "1");
    localStorage.removeItem("subscriptions:probe");
    return true;
  } catch (e) {
    return false;
  }
}
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
function writeLastSnap(snap) {
  try {
    localStorage.setItem(SNAP_KEY, JSON.stringify({ ts: Date.now(), data: snap }));
  } catch (e) {
  }
}
function fmtStale(ts) {
  var mins = Math.floor((Date.now() - ts) / 6e4);
  if (mins < 2) return "Just now";
  if (mins < 60) return mins + " minutes ago";
  var hours = Math.floor(mins / 60);
  if (hours < 24) return hours + " hours ago";
  return Math.floor(hours / 24) + " days ago";
}
function providerVisible(config, key) {
  var providers = config && config.providers || {};
  return providers[key] !== false;
}
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
    hero = import_react.default.createElement(
      "div",
      { className: "ds-hero" },
      import_react.default.createElement("div", { className: "ds-hero-total" }, "$" + total.toFixed(2)),
      import_react.default.createElement("div", { className: "ds-hero-breakdown" }, breakdown.join(" \xB7 "))
    );
  }
  var meters = buildCcMeters(cc);
  var costCard = null;
  if (usage && typeof usage.totalCost === "number") {
    var period = usage.periodStart ? fmtDate(usage.periodStart) + (usage.periodEnd ? " \u2013 " + fmtDate(usage.periodEnd) : "") : "this period";
    costCard = import_react.default.createElement(
      "div",
      { className: "ds-usage-card" },
      import_react.default.createElement("div", { className: "ds-usage-label" }, "Monthly cost"),
      import_react.default.createElement("div", { className: "ds-usage-value" }, "$" + usage.totalCost.toFixed(2)),
      import_react.default.createElement("div", { className: "ds-usage-sub" }, period)
    );
  }
  return import_react.default.createElement(
    "div",
    { className: "ocgs-section" },
    import_react.default.createElement("h4", { className: "ocgs-section-title" }, "Command Code"),
    errorLine ? import_react.default.createElement("div", { className: "ocgs-err" }, errorLine) : null,
    hero,
    meters.length > 0 ? import_react.default.createElement("div", { className: "ocgs-rows" }, meters) : null,
    costCard ? import_react.default.createElement("div", { className: "ds-usage-grid" }, costCard) : null
  );
}
function makePanel(ctx, config) {
  return function Panel() {
    var snapState = import_react.default.useState(null);
    var snap = snapState[0];
    var setSnap = snapState[1];
    var staleTsState = import_react.default.useState(null);
    var staleTs = staleTsState[0];
    var setStaleTs = staleTsState[1];
    var cacheOkState = import_react.default.useState(null);
    var cacheOk = cacheOkState[0];
    var setCacheOk = cacheOkState[1];
    var cfgState = import_react.default.useState(config);
    var cfg = cfgState[0];
    var setCfg = cfgState[1];
    import_react.default.useEffect(function() {
      if (config == null) {
        fetchJson("/subscriptions/config").then(function(result) {
          if (result.data && result.data.config) setCfg(result.data.config);
        }).catch(function() {
        });
      }
    }, []);
    var load = async function() {
      var now = /* @__PURE__ */ new Date();
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
        fetchJson("/profiles/config")
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
        profiles: results[10]
      };
      setSnap(snapData);
      setStaleTs(Date.now());
      writeLastSnap(snapData);
    };
    import_react.default.useEffect(function() {
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
      var timer = window.setInterval(load, 6e4);
      return function() {
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
    var cookieState = import_react.default.useState({ busy: false, note: null, showLogin: false });
    var cookie = cookieState[0];
    var setCookie = cookieState[1];
    var dsTokenState = import_react.default.useState({ busy: false, note: null, showLogin: false });
    var dsToken = dsTokenState[0];
    var setDsToken = dsTokenState[1];
    var fetchCookie = async function() {
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
    var openLogin = async function() {
      var result = await postJson("/subscriptions/opencode-cookie/login");
      setCookie({
        busy: false,
        note: result.data && result.data.ok ? "Login page opened in Firefox; sign in, then fetch the cookie again" : result.error || "Could not open Firefox",
        showLogin: false
      });
    };
    var fetchDsToken = async function() {
      setDsToken({ busy: true, note: null, showLogin: false });
      var result = await postJson("/subscriptions/deepseek-token/extract");
      if (result.data && result.data.ok === true) {
        setDsToken({ busy: false, note: "Token saved", showLogin: false });
        load();
      } else {
        setDsToken({ busy: false, note: result.error || "Extract failed", showLogin: true });
      }
    };
    var openDsLogin = async function() {
      var result = await postJson("/subscriptions/deepseek-token/login");
      setDsToken({
        busy: false,
        note: result.data && result.data.ok ? "Login page opened in Firefox; sign in, then fetch the token again" : result.error || "Could not open Firefox",
        showLogin: false
      });
    };
    var refreshOz = async function() {
      var result = await fetchJson("/subscriptions/opencode-zen-balance");
      setSnap(Object.assign({}, snap, { oz: result }));
      setStaleTs(Date.now());
    };
    var toggleState = import_react.default.useState(null);
    var toggleBusy = toggleState[0];
    var setToggleBusy = toggleState[1];
    var toggleProvider = function(key) {
      var providers = cfg && cfg.providers || {};
      var next = Object.assign({}, providers, { [key]: !(providers[key] !== false) });
      setToggleBusy(key);
      putJson("/subscriptions/config", { providers: next }).then(function(result) {
        setToggleBusy(null);
        if (result.data && result.data.config) {
          setCfg(result.data.config);
        } else if (result.error) {
        }
      });
    };
    var goUsage = go && !go.error && go.data ? go.data.usage : null;
    var claudeWindows = null;
    if (quota && !quota.error && quota.data && Array.isArray(quota.data.profiles)) {
      var quotaProfiles = quota.data.profiles;
      var activeQuotaId = typeof quota.data.activeProfile === "string" ? quota.data.activeProfile : null;
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
    var balanceLine = null;
    if (balance) {
      if (balance.error) {
        balanceLine = "Balance: " + balance.error;
      } else if (balance.data && balance.data.ok === true && typeof balance.data.balance === "number") {
        balanceLine = "$" + balance.data.balance.toFixed(2) + " balance";
      }
    }
    var ozBalanceLine = null;
    if (oz) {
      if (oz.error) {
        ozBalanceLine = "Balance: " + oz.error;
      } else if (oz.data && oz.data.ok === true && typeof oz.data.balance === "number") {
        var ozCurrency = (oz.data.currency || "USD").toUpperCase();
        ozBalanceLine = "$" + oz.data.balance.toFixed(2) + " " + ozCurrency + " balance";
      }
    }
    var telemetryLine = null;
    if (telemetry) {
      if (telemetry.error) telemetryLine = "telemetry: " + telemetry.error;
      else if (telemetry.data) telemetryLine = renderTelemetry(telemetry.data);
    }
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
          goUtil
        );
      }
    }
    var claudePaceLine = null;
    var claudeSeven = claudeWindows ? claudeWindows.seven_day : null;
    if (claudeSeven && typeof claudeSeven.utilization === "number") {
      var claudeResetsMs = new Date(claudeSeven.resetsAt).getTime();
      if (Number.isFinite(claudeResetsMs)) {
        claudePaceLine = renderPaceLine(
          "7d",
          computeWeeklyPace(claudeSeven.utilization, claudeResetsMs),
          claudeResetsMs,
          claudeSeven.utilization
        );
      }
    }
    var profileInfo = null;
    if (profiles && !profiles.error && profiles.data && profiles.data.config) {
      var pcfg = profiles.data.config;
      var activeName = typeof pcfg.active === "string" ? pcfg.active : "work";
      var profileEntry = activeName === "personal" ? pcfg.personal : pcfg.work;
      var orcRoutes = profileEntry && profileEntry.orchestrator && Array.isArray(profileEntry.orchestrator.routes) ? profileEntry.orchestrator.routes : [];
      profileInfo = {
        active: activeName,
        chain: chainNameFor(orcRoutes, pcfg.chains),
        head: orcRoutes.length > 0 ? orcRoutes[0] : null
      };
    }
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
        "profiles"
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
    return import_react.default.createElement(
      "div",
      { className: "ocgs-root" },
      import_react.default.createElement(
        "div",
        { className: "ocgs-head" },
        import_react.default.createElement(
          "div",
          { className: "ocgs-head-title" },
          import_react.default.createElement("h3", { className: "ocgs-title" }, "Subscriptions"),
          staleText ? import_react.default.createElement("span", { className: "ocgs-stale" }, staleText) : null
        ),
        import_react.default.createElement("button", { className: "ocgs-refresh", onClick: load }, "Refresh")
      ),
      import_react.default.createElement(
        "details",
        { className: "ocgs-details" },
        import_react.default.createElement("summary", { className: "ocgs-summary" }, "Show sections"),
        import_react.default.createElement(
          "div",
          { className: "ocgs-toggles" },
          PROVIDER_TOGGLES.map(function(def) {
            var providers = cfg && cfg.providers || {};
            var visible = providers[def.key] !== false;
            return import_react.default.createElement(
              "label",
              { className: "ocgs-toggle", key: def.key },
              import_react.default.createElement("input", {
                type: "checkbox",
                checked: visible,
                disabled: toggleBusy !== null,
                onChange: function() {
                  toggleProvider(def.key);
                }
              }),
              import_react.default.createElement("span", { className: "ocgs-toggle-label" }, def.label)
            );
          })
        )
      ),
      snap === null ? import_react.default.createElement("div", { className: "ocgs-note" }, "Loading subscription data\u2026") : null,
      allFailed ? import_react.default.createElement(
        "div",
        { className: "ocgs-err" },
        "Could not load subscription data. " + (firstError || "Check that the subscriptions plugin is mounted.")
      ) : null,
      profileInfo || quotaPick || telemetryLine ? import_react.default.createElement(
        "div",
        { className: "ocgs-section" },
        import_react.default.createElement("h4", { className: "ocgs-section-title" }, "Quota"),
        profileInfo ? import_react.default.createElement(
          "div",
          { className: "ocgs-rows" },
          import_react.default.createElement(
            "div",
            { className: "ocgs-row" },
            import_react.default.createElement(
              "div",
              { className: "ocgs-row-label" },
              import_react.default.createElement("b", null, "Profile: " + profileInfo.active),
              profileInfo.chain ? import_react.default.createElement(
                "span",
                { className: "ocgs-stale" },
                "chain: " + profileInfo.chain
              ) : null
            )
          )
        ) : null,
        quotaPick ? import_react.default.createElement("div", { className: "ocgs-rows" }, quotaPick.rows) : null,
        quotaPick && quotaPick.pace ? import_react.default.createElement("div", { className: "ocgs-pace" }, quotaPick.pace) : null,
        telemetryLine ? import_react.default.createElement("div", { className: "ocgs-telemetry" }, telemetryLine) : null
      ) : null,
      providerVisible(cfg, "commandcode") ? renderCcSection(cc, ccUsage) : null,
      providerVisible(cfg, "claude") ? import_react.default.createElement(
        "div",
        { className: "ocgs-section" },
        import_react.default.createElement("h4", { className: "ocgs-section-title" }, "Claude (meridian)"),
        quota && quota.error ? import_react.default.createElement(
          "div",
          { className: "ocgs-err" },
          "Claude (meridian): " + quota.error
        ) : null,
        import_react.default.createElement(
          "div",
          { className: "ocgs-rows" },
          buildRows(CLAUDE_WINDOWS, claudeWindows)
        ),
        claudePaceLine ? import_react.default.createElement("div", { className: "ocgs-pace" }, claudePaceLine) : null
      ) : null,
      providerVisible(cfg, "deepseek") ? import_react.default.createElement(
        "div",
        { className: "ocgs-section" },
        import_react.default.createElement("h4", { className: "ocgs-section-title" }, "DeepSeek"),
        ds && ds.error ? import_react.default.createElement("div", { className: "ocgs-err" }, "DeepSeek: " + ds.error) : null,
        ds && ds.data && Array.isArray(ds.data.balance_infos) && ds.data.balance_infos.length > 0 ? renderDsDashboard(ds.data.balance_infos[0], dsUsageAmount, dsUsageCost) : null,
        import_react.default.createElement(
          "div",
          { className: "ocgs-cookie" },
          import_react.default.createElement(
            "button",
            { className: "ocgs-btn", disabled: dsToken.busy, onClick: fetchDsToken },
            dsToken.busy ? "Fetching\u2026" : "Fetch token from Firefox"
          ),
          dsToken.showLogin ? import_react.default.createElement(
            "button",
            { className: "ocgs-btn", onClick: openDsLogin },
            "Open platform.deepseek.com"
          ) : null,
          dsToken.note ? import_react.default.createElement("span", { className: "ocgs-cookie-note" }, dsToken.note) : null
        )
      ) : null,
      providerVisible(cfg, "opencode") ? import_react.default.createElement(
        "div",
        { className: "ocgs-section" },
        import_react.default.createElement("h4", { className: "ocgs-section-title" }, "OpenCode GO"),
        balanceLine ? import_react.default.createElement("div", { className: "ocgs-balance" }, balanceLine) : null,
        go && go.error ? import_react.default.createElement("div", { className: "ocgs-err" }, "OpenCode GO: " + go.error) : null,
        import_react.default.createElement("div", { className: "ocgs-rows" }, buildRows(GO_WINDOWS, goUsage)),
        goPaceLine ? import_react.default.createElement("div", { className: "ocgs-pace" }, goPaceLine) : null,
        import_react.default.createElement(
          "div",
          { className: "ocgs-cookie" },
          import_react.default.createElement(
            "button",
            { className: "ocgs-btn", disabled: cookie.busy, onClick: fetchCookie },
            cookie.busy ? "Fetching\u2026" : "Fetch cookie from Firefox"
          ),
          cookie.showLogin ? import_react.default.createElement(
            "button",
            { className: "ocgs-btn", onClick: openLogin },
            "Open login page"
          ) : null,
          cookie.note ? import_react.default.createElement("span", { className: "ocgs-cookie-note" }, cookie.note) : null
        )
      ) : null,
      providerVisible(cfg, "opencode-zen") ? import_react.default.createElement(
        "div",
        { className: "ocgs-section" },
        import_react.default.createElement(
          "div",
          { className: "ocgs-head" },
          import_react.default.createElement("h4", { className: "ocgs-section-title" }, "OpenCode Zen"),
          import_react.default.createElement(
            "button",
            { className: "ocgs-refresh", onClick: refreshOz },
            "Refresh"
          )
        ),
        ozBalanceLine ? import_react.default.createElement("div", { className: "ocgs-balance" }, ozBalanceLine) : null,
        oz && oz.error ? import_react.default.createElement("div", { className: "ocgs-err" }, "OpenCode Zen: " + oz.error) : null,
        import_react.default.createElement(
          "div",
          { className: "ocgs-cookie" },
          import_react.default.createElement(
            "button",
            { className: "ocgs-btn", disabled: cookie.busy, onClick: fetchCookie },
            cookie.busy ? "Fetching\u2026" : "Fetch cookie from Firefox"
          ),
          cookie.showLogin ? import_react.default.createElement(
            "button",
            { className: "ocgs-btn", onClick: openLogin },
            "Open opencode.ai"
          ) : null,
          cookie.note ? import_react.default.createElement("span", { className: "ocgs-cookie-note" }, cookie.note) : null
        )
      ) : null
    );
  };
}
var name = PLUGIN_NAME;
var inject = ["slots"];
function apply(ctx, config) {
  ctx.effect(function() {
    if (typeof document === "undefined") return;
    if (document.querySelector('style[data-plugin-css="' + STYLE_TAG_ID + '"]') !== null) return;
    var tag = document.createElement("style");
    tag.dataset.plugin = PLUGIN_NAME;
    tag.dataset.pluginCss = STYLE_TAG_ID;
    tag.textContent = CSS_TEXT;
    document.head.appendChild(tag);
  }, "subscriptions: styles");
  var Panel = makePanel(ctx, config);
  ctx.slots.inject("settings.section", function() {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 26, label: "Subscriptions" },
      function() {
        return import_react.default.createElement(Panel);
      }
    );
  });
}
		return module.exports;
	}
});
