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

// plugins/subscriptions/src/client.tsx
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
function mergeCss(...parts) {
  return parts.flat().filter(Boolean).join("\n");
}
function request(method, url, body) {
  const hasBody = body !== void 0 && method !== "GET";
  console.debug("[client-util] " + method + " " + url);
  return fetch(url, {
    method,
    cache: "no-store",
    ...hasBody ? { headers: { "content-type": "application/json" } } : {},
    ...hasBody ? { body: JSON.stringify(body) } : {}
  }).then(function(res) {
    return res.json().catch(function() {
      return null;
    }).then(function(json) {
      return { ok: res.ok, status: res.status, json };
    });
  }).then(function(result) {
    if (result.json !== null && result.json.error) {
      console.error(
        "[client-util] " + method + " " + url + " failed: server error " + result.status
      );
      return { data: null, error: String(result.json.error) };
    }
    if (!result.ok) {
      console.error("[client-util] " + method + " " + url + " failed: HTTP " + result.status);
      return { data: null, error: "HTTP " + result.status };
    }
    console.info("[client-util] " + method + " " + url + " ok (HTTP " + result.status + ")");
    return { data: result.json, error: null };
  }).catch(function(e) {
    console.error("[client-util] " + method + " " + url + " failed: network error");
    return { data: null, error: String(e && e.message || e) };
  });
}
function fetchJson(url) {
  return request("GET", url);
}
function postJson(url, body) {
  return request("POST", url, body);
}
function putJson(url, body) {
  return request("PUT", url, body);
}

// plugins/shared/settings-panel.tsx
var import_react = __toESM(require("react"));
function SettingsSection(props) {
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dsp-root" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dsp-head" }, /* @__PURE__ */ import_react.default.createElement("h3", { className: "dsp-title" }, props.title), props.onRefresh ? /* @__PURE__ */ import_react.default.createElement("button", { className: "dsp-refresh", onClick: props.onRefresh }, props.refreshLabel === void 0 ? "Refresh" : props.refreshLabel) : null), props.children);
}

// css-text:/home/sid/repos/dotfiles-ai/plugins/shared/settings.css
var settings_default = "/* Shared settings-page vocabulary, normalized from the session-archive,\n * subscriptions, and profiles settings panels. One rule set in one file so\n * the three panels cannot drift. Radius and padding disagreements are\n * normalized to the session-archive (or median) value; the var(--dsw-...)\n * aliases the current rules use are kept as-is. */\n\n/* Page-level container:airy vertical rhythm, no own box. */\n.dsp-root {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  padding: 0;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Header row (title + refresh). */\n.dsp-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 0.75rem;\n}\n\n.dsp-title {\n  font-size: 1.5rem;\n  font-weight: 650;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Refresh:session-archive/profiles form (no box, color shift only).\n * subscriptions pads and rounds the hit area; normalized away. */\n.dsp-refresh {\n  cursor: pointer;\n  border: none;\n  background: none;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n}\n.dsp-refresh:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.dsp-err {\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n/* Large setting card. Padding is the median of 16/20/24 (session-archive\n * 20px); the radius is the two-agreeing 20px, not profiles' 12px. */\n.dsp-section {\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.875rem;\n  padding: 1.25rem;\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n/* Card title:subscriptions' 1.5rem/700 matches the page-title vocabulary;\n * profiles' smaller 16px/600 card title normalized up. */\n.dsp-section-title {\n  font-size: 1.125rem;\n  font-weight: 600;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Setting row:horizontal in session-archive and profiles (subscriptions\n * stacks its label and meta vertically; normalized to the horizontal form). */\n.dsp-row {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  min-width: 0;\n}\n\n/* Row label:only subscriptions defines one; ported verbatim, with its\n * emphasized <b> children. */\n.dsp-row-label {\n  display: flex;\n  align-items: baseline;\n  gap: 0.625rem;\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.dsp-row-label b {\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  font-size: 0.9375rem;\n}\n.dsp-row-label b:last-child {\n  margin-left: auto;\n}\n";

// css-text:/home/sid/repos/dotfiles-ai/plugins/subscriptions/src/client.module.css
var client_default = ".ocgs-stale {\n  font-size: 0.875rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n}\n.ocgs-section {\n  display: flex;\n  flex-direction: column;\n  gap: 0.8125rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.875rem;\n  padding: 1.25rem;\n  background: var(--dsw-alias-bg-tertiary);\n}\n.ocgs-section-title {\n  font-size: 1.125rem;\n  font-weight: 600;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n.ocgs-balance {\n  font-size: 1.125rem;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n.ocgs-rows {\n  display: flex;\n  flex-direction: column;\n  gap: 0.8125rem;\n}\n.ocgs-row {\n  display: flex;\n  flex-direction: column;\n  gap: 0.3125rem;\n  min-width: 0;\n}\n.ocgs-row-label {\n  display: flex;\n  align-items: baseline;\n  gap: 0.625rem;\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.ocgs-row-label b {\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  font-size: 0.9375rem;\n}\n.ocgs-row-label b:last-child {\n  margin-left: auto;\n}\n.ocgs-meta {\n  display: flex;\n  align-items: center;\n  gap: 0.625rem;\n  min-width: 0;\n}\n.ocgs-meta > span {\n  font-size: 0.8125rem;\n  line-height: 1.125rem;\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n  flex: none;\n}\n.ocgs-track {\n  box-sizing: border-box;\n  flex: 1;\n  min-width: 0;\n  height: 0.5rem;\n  border-radius: 0.4375rem;\n  background: var(--dsw-alias-border-l2);\n  overflow: hidden;\n}\n.ocgs-fill {\n  height: 100%;\n  border-radius: 0.4375rem;\n  transition: width 0.4s ease;\n}\n.ocgs-pace {\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.ocgs-cookie {\n  display: flex;\n  align-items: center;\n  gap: 0.625rem;\n  flex-wrap: wrap;\n  margin: 0.1875rem 0 0.375rem;\n}\n.ocgs-btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 62.4375rem;\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n  padding: 0.4375rem 0.9375rem;\n  cursor: pointer;\n  min-height: 2.25rem;\n}\n.ocgs-btn:hover {\n  color: var(--dsw-alias-label-primary);\n  border-color: var(--dsw-alias-border-l3);\n}\n.ocgs-btn:disabled {\n  opacity: 0.5;\n  cursor: default;\n}\n.ocgs-cookie-note {\n  font-size: 0.875rem;\n  line-height: 1.125rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.ocgs-toggles {\n  display: flex;\n  flex-direction: column;\n  gap: 0.625rem;\n}\n.ocgs-toggle {\n  display: flex;\n  align-items: center;\n  gap: 0.625rem;\n  min-width: 0;\n  cursor: pointer;\n}\n.ocgs-toggle-label {\n  flex: 1;\n  min-width: 0;\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.ocgs-toggle input {\n  flex: none;\n  width: 1.5rem;\n  height: 1.5rem;\n  cursor: pointer;\n  accent-color: var(--dsw-alias-state-business-primary);\n}\n.ocgs-details {\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.75rem;\n  background: var(--dsw-alias-bg-tertiary);\n  padding: 0.8125rem;\n  margin-top: 0.25rem;\n}\n.ocgs-summary {\n  cursor: pointer;\n  font-size: 0.9375rem;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  list-style: none;\n}\n.ocgs-summary::-webkit-details-marker {\n  display: none;\n}\n.ocgs-details[open] .ocgs-toggles {\n  padding-top: 0.625rem;\n}\n.ds-dashboard {\n  display: flex;\n  flex-direction: column;\n  gap: 0.8125rem;\n}\n.ds-hero {\n  display: flex;\n  flex-direction: column;\n  gap: 0.3125rem;\n  padding: 0.8125rem;\n  background: var(--dsw-alias-bg-tertiary);\n  border-radius: 0.75rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n}\n.ds-hero-total {\n  font-size: 2rem;\n  font-weight: 700;\n  color: var(--dsw-alias-label-primary);\n  line-height: 1.2;\n}\n.ds-hero-breakdown {\n  font-size: 0.9375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.ds-usage-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));\n  gap: 0.625rem;\n}\n.ds-usage-card {\n  padding: 0.8125rem;\n  background: var(--dsw-alias-bg-tertiary);\n  border-radius: 0.75rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n}\n.ds-usage-label {\n  font-size: 0.75rem;\n  color: var(--dsw-alias-label-secondary);\n  text-transform: uppercase;\n  letter-spacing: 0.0313rem;\n}\n.ds-usage-value {\n  font-size: 1.25rem;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  margin-top: 0.375rem;\n}\n.ds-usage-sub {\n  font-size: 0.875rem;\n  color: var(--dsw-alias-label-secondary);\n  margin-top: 0.25rem;\n}\n.ds-token-row {\n  display: flex;\n  gap: 0.625rem;\n  flex-wrap: wrap;\n}\n.ds-token-card {\n  flex: 1;\n  min-width: 8.75rem;\n  padding: 0.6875rem;\n  background: var(--dsw-alias-bg-tertiary);\n  border-radius: 0.75rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n}\n.ds-token-label {\n  font-size: 0.75rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.ds-token-value {\n  font-size: 1.125rem;\n  font-weight: 600;\n  color: var(--dsw-alias-state-success-primary);\n}\n.ds-token-value.out {\n  color: var(--dsw-alias-state-error-primary);\n}\n.ds-empty {\n  font-size: 0.875rem;\n  color: var(--dsw-alias-label-secondary);\n  font-style: italic;\n}\n.ocgs-note {\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -0.125rem;\n}\n";

// plugins/subscriptions/src/client.tsx
var PLUGIN_NAME = "subscriptions";
var STYLE_TAG_ID = "subscriptions/client.css";
var GO_WINDOWS = [
  { key: "rolling", label: "Rolling (5h)", hint: "5h" },
  { key: "weekly", label: "Weekly", hint: null },
  { key: "monthly", label: "Monthly", hint: null }
];
var ZAI_WINDOWS = [
  { key: "fiveHour", label: "5-hour", hint: "5h" },
  { key: "weekly", label: "Weekly", hint: null }
];
function windowLabel(type) {
  return String(type || "").split("_").filter(Boolean).map(function(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }).join(" ") || "Window";
}
var PROVIDER_TOGGLES = [
  { key: "commandcode", label: "Command Code" },
  { key: "zai", label: "Z.ai (GLM)" },
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
function windowPercent(win) {
  var pct = null;
  if (typeof win.percent === "number") pct = win.percent;
  else if (typeof win.utilization === "number") pct = win.utilization * 100;
  else if (typeof win.used === "number" && typeof win.cap === "number" && win.cap > 0)
    pct = win.used / win.cap * 100;
  if (pct === null) return null;
  return Math.max(0, Math.min(100, pct));
}
function statusText(win, hint) {
  if (typeof win.status === "string" && win.status !== "ok") return win.status;
  if (win.resetsAt) return timeUntil(win.resetsAt);
  if (win.resetAt) return timeUntil(win.resetAt);
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
function buildRows(defs, windows, labelOf) {
  var rows = [];
  var keys = defs ? defs.map(function(d) {
    return d.key;
  }) : Object.keys(windows || {});
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var def = defs ? defs[i] : null;
    var win = windows ? windows[key] : null;
    if (!win) continue;
    var percent = windowPercent(win);
    if (percent === null) continue;
    var label = def ? def.label : labelOf ? labelOf(key) : key;
    var hint = def ? def.hint : null;
    var status = statusText(win, hint);
    rows.push(
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-row", key }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-row-label" }, /* @__PURE__ */ import_react2.default.createElement("b", null, label), status ? /* @__PURE__ */ import_react2.default.createElement("span", { className: "ocgs-stale" }, "resets in " + status) : null, /* @__PURE__ */ import_react2.default.createElement("b", null, percent.toFixed(2) + "%")), /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-meta" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-track" }, /* @__PURE__ */ import_react2.default.createElement(
        "div",
        {
          className: "ocgs-fill",
          style: {
            width: percent.toFixed(2) + "%",
            background: fillColor(percent)
          }
        }
      ))))
    );
  }
  return rows;
}
function renderDsDashboard(bal, amount, cost) {
  var balObj = bal && typeof bal === "object" ? bal : {};
  var total = parseFloat(balObj.total_balance);
  var granted = parseFloat(balObj.granted_balance);
  var topped = parseFloat(balObj.topped_up_balance);
  var currency = balObj.currency || "USD";
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
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-card" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-label" }, "Total Cost"), /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-value" }, "$" + totalCost.toFixed(2)))
    );
    usageCards.push(
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-card" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-label" }, "Total Tokens"), /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-value" }, fmtCount(totalTokens)), /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-sub" }, "in " + fmtCount(inTokens) + " \xB7 out " + fmtCount(outTokens) + " \xB7 cache " + fmtCount(cacheRead + cacheWrite)))
    );
    for (var cmi = 0; cmi < costByModel.length; cmi++) {
      var cm = costByModel[cmi];
      usageCards.push(
        /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-card" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-label" }, cm.model), /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-value" }, "$" + cm.cost.toFixed(2)))
      );
    }
  } else {
    usageCards.push(
      /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-card ds-empty" }, "No usage data (sign in to platform.deepseek.com)")
    );
  }
  return /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-dashboard" }, heroLines.length > 0 ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-hero" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-hero-total" }, heroLines[0]), /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-hero-breakdown" }, subLines.join(" \xB7 "))) : null, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-grid" }, usageCards));
}
function buildCcMeters(cc) {
  if (!cc || cc.error || !cc.data || cc.data.ok !== true) return [];
  var wins = cc.data.windows || null;
  var ccDefs = [
    { key: "fiveHour", label: "5-hour" },
    { key: "weekly", label: "Weekly" }
  ];
  var windows = {};
  for (var ci = 0; ci < ccDefs.length; ci++) {
    var win = wins ? wins[ccDefs[ci].key] : null;
    if (!win) continue;
    var used = typeof win.used === "number" ? win.used : null;
    var cap = typeof win.cap === "number" ? win.cap : null;
    if (used === null || cap === null || cap <= 0) continue;
    windows[ccDefs[ci].key] = {
      key: ccDefs[ci].key,
      used,
      cap,
      resetAt: win.resetAt || null
    };
  }
  return buildRows(ccDefs, windows, void 0);
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
    hero = /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-hero" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-hero-total" }, "$" + total.toFixed(2)), /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-hero-breakdown" }, breakdown.join(" \xB7 ")));
  }
  var meters = buildCcMeters(cc);
  var costCard = null;
  if (usage && typeof usage.totalCost === "number") {
    var period = usage.periodStart ? fmtDate(usage.periodStart) + (usage.periodEnd ? " \u2013 " + fmtDate(usage.periodEnd) : "") : "this period";
    costCard = /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-card" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-label" }, "Monthly cost"), /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-value" }, "$" + usage.totalCost.toFixed(2)), /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-sub" }, period));
  }
  return /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-section" }, /* @__PURE__ */ import_react2.default.createElement("h4", { className: "ocgs-section-title" }, "Command Code"), errorLine ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-err" }, errorLine) : null, hero, meters.length > 0 ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-rows" }, meters) : null, costCard ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ds-usage-grid" }, costCard) : null);
}
function makePanel(ctx, config) {
  return function Panel() {
    var snapState = import_react2.default.useState(null);
    var snap = snapState[0];
    var setSnap = snapState[1];
    var staleTsState = import_react2.default.useState(null);
    var staleTs = staleTsState[0];
    var setStaleTs = staleTsState[1];
    var cacheOkState = import_react2.default.useState(null);
    var cacheOk = cacheOkState[0];
    var setCacheOk = cacheOkState[1];
    var cfgState = import_react2.default.useState(config);
    var cfg = cfgState[0];
    var setCfg = cfgState[1];
    import_react2.default.useEffect(function() {
      if (config == null) {
        fetchJson("/subscriptions/config").then(function(result) {
          if (result.data && result.data.config) setCfg(result.data.config);
        }).catch(function() {
        });
      }
    }, []);
    import_react2.default.useEffect(function() {
      console.debug("[subscriptions] panel mounted");
      return function() {
        console.debug("[subscriptions] panel unmounted");
      };
    }, []);
    var load = async function() {
      console.debug("[subscriptions] load: fetching subscription data");
      var now = /* @__PURE__ */ new Date();
      var month = now.getMonth() + 1;
      var year = now.getFullYear();
      var results = await Promise.all([
        fetchJson("/subscriptions/opencode-usage"),
        fetchJson("/subscriptions/meridian-quota"),
        fetchJson("/subscriptions/opencode-balance"),
        fetchJson("/subscriptions/deepseek-balance"),
        fetchJson("/subscriptions/deepseek-usage/amount?month=" + month + "&year=" + year),
        fetchJson("/subscriptions/deepseek-usage/cost?month=" + month + "&year=" + year),
        fetchJson("/subscriptions/commandcode-credits"),
        fetchJson("/subscriptions/commandcode-usage"),
        fetchJson("/subscriptions/opencode-zen-balance"),
        fetchJson("/subscriptions/zai-quota"),
        fetchJson("/subscriptions/zai-usage")
      ]);
      var loadKeys = [
        "go",
        "quota",
        "balance",
        "ds",
        "dsUsageAmount",
        "dsUsageCost",
        "cc",
        "ccUsage",
        "oz",
        "zaiQuota",
        "zaiUsage"
      ];
      var failedKeys = [];
      for (var li = 0; li < loadKeys.length; li++) {
        if (results[li] && results[li].error) failedKeys.push(loadKeys[li]);
      }
      if (failedKeys.length === 0) {
        console.info("[subscriptions] load: subscription data loaded");
      } else if (failedKeys.length === loadKeys.length) {
        console.error("[subscriptions] load: all fetches failed", failedKeys.join(", "));
      } else {
        console.warn(
          "[subscriptions] load: " + failedKeys.length + " of " + loadKeys.length + " fetches failed",
          failedKeys.join(", ")
        );
      }
      var snapData = {
        go: results[0],
        quota: results[1],
        balance: results[2],
        ds: results[3],
        dsUsageAmount: results[4],
        dsUsageCost: results[5],
        cc: results[6],
        ccUsage: results[7],
        oz: results[8],
        zaiQuota: results[9],
        zaiUsage: results[10]
      };
      setSnap(snapData);
      setStaleTs(Date.now());
      writeLastSnap(snapData);
    };
    import_react2.default.useEffect(function() {
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
    var balance = snap ? snap.balance : null;
    var ds = snap ? snap.ds : null;
    var dsUsageAmount = snap ? snap.dsUsageAmount : null;
    var dsUsageCost = snap ? snap.dsUsageCost : null;
    var cc = snap ? snap.cc : null;
    var ccUsage = snap ? snap.ccUsage : null;
    var oz = snap ? snap.oz : null;
    var zaiQuota = snap ? snap.zaiQuota : null;
    var zaiUsage = snap ? snap.zaiUsage : null;
    var cookieState = import_react2.default.useState({ busy: false, note: null, showLogin: false });
    var cookie = cookieState[0];
    var setCookie = cookieState[1];
    var dsTokenState = import_react2.default.useState({ busy: false, note: null, showLogin: false });
    var dsToken = dsTokenState[0];
    var setDsToken = dsTokenState[1];
    var fetchCookie = async function() {
      setCookie({ busy: true, note: null, showLogin: false });
      console.info("[subscriptions] action: fetch OpenCode GO cookie from Firefox");
      var result = await postJson("/subscriptions/opencode-cookie/extract");
      if (result.data && result.data.ok === true) {
        setCookie({ busy: false, note: "Cookie saved", showLogin: false });
        console.info("[subscriptions] OpenCode GO cookie saved");
        load();
      } else if (result.data && result.data.invalid === true) {
        setCookie({ busy: false, note: result.error || "Cookie is stale", showLogin: true });
        console.warn(
          "[subscriptions] OpenCode GO cookie is stale, login required",
          result.error || "stale"
        );
      } else {
        setCookie({ busy: false, note: result.error || "Extract failed", showLogin: false });
        console.error(
          "[subscriptions] OpenCode GO cookie extract failed",
          result.error || "unknown error"
        );
      }
    };
    var openLogin = async function() {
      console.info("[subscriptions] action: open OpenCode GO login page in Firefox");
      var result = await postJson("/subscriptions/opencode-cookie/login");
      setCookie({
        busy: false,
        note: result.data && result.data.ok ? "Login page opened in Firefox; sign in, then fetch the cookie again" : result.error || "Could not open Firefox",
        showLogin: false
      });
      if (result.data && result.data.ok) {
        console.info("[subscriptions] OpenCode GO login page opened");
      } else {
        console.error(
          "[subscriptions] failed to open OpenCode GO login page",
          result.error || "unknown error"
        );
      }
    };
    var fetchDsToken = async function() {
      setDsToken({ busy: true, note: null, showLogin: false });
      console.info("[subscriptions] action: fetch DeepSeek token from Firefox");
      var result = await postJson("/subscriptions/deepseek-token/extract");
      if (result.data && result.data.ok === true) {
        setDsToken({ busy: false, note: "Token saved", showLogin: false });
        console.info("[subscriptions] DeepSeek token saved");
        load();
      } else {
        setDsToken({ busy: false, note: result.error || "Extract failed", showLogin: true });
        console.error(
          "[subscriptions] DeepSeek token extract failed",
          result.error || "unknown error"
        );
      }
    };
    var openDsLogin = async function() {
      console.info("[subscriptions] action: open DeepSeek platform login page in Firefox");
      var result = await postJson("/subscriptions/deepseek-token/login");
      setDsToken({
        busy: false,
        note: result.data && result.data.ok ? "Login page opened in Firefox; sign in, then fetch the token again" : result.error || "Could not open Firefox",
        showLogin: false
      });
      if (result.data && result.data.ok) {
        console.info("[subscriptions] DeepSeek platform login page opened");
      } else {
        console.error(
          "[subscriptions] failed to open DeepSeek platform login page",
          result.error || "unknown error"
        );
      }
    };
    var refreshOz = async function() {
      console.info("[subscriptions] action: refresh OpenCode Zen balance");
      var result = await fetchJson("/subscriptions/opencode-zen-balance");
      setSnap(Object.assign({}, snap, { oz: result }));
      setStaleTs(Date.now());
      if (result.error) {
        console.error("[subscriptions] OpenCode Zen balance refresh failed", result.error);
      } else {
        console.info("[subscriptions] OpenCode Zen balance refreshed");
      }
    };
    var toggleState = import_react2.default.useState(null);
    var toggleBusy = toggleState[0];
    var setToggleBusy = toggleState[1];
    var toggleProvider = function(key) {
      var providers = cfg && cfg.providers || {};
      var next = Object.assign({}, providers, { [key]: !(providers[key] !== false) });
      setToggleBusy(key);
      console.info(
        "[subscriptions] action: toggle provider " + key + " to " + (next[key] ? "visible" : "hidden")
      );
      putJson("/subscriptions/config", { providers: next }).then(function(result) {
        setToggleBusy(null);
        if (result.data && result.data.config) {
          setCfg(result.data.config);
          console.info("[subscriptions] provider " + key + " toggle saved");
        } else if (result.error) {
          console.error("[subscriptions] provider " + key + " toggle failed", result.error);
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
        "balance",
        "ds",
        "dsUsageAmount",
        "dsUsageCost",
        "cc",
        "ccUsage",
        "oz",
        "zaiQuota",
        "zaiUsage"
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
    return /* @__PURE__ */ import_react2.default.createElement(SettingsSection, { title: "Subscriptions", onRefresh: load, refreshLabel: "Refresh" }, staleText ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-stale" }, staleText) : null, /* @__PURE__ */ import_react2.default.createElement("details", { className: "ocgs-details" }, /* @__PURE__ */ import_react2.default.createElement("summary", { className: "ocgs-summary" }, "Show sections"), /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-toggles" }, PROVIDER_TOGGLES.map(function(def) {
      var providers = cfg && cfg.providers || {};
      var visible = providers[def.key] !== false;
      return /* @__PURE__ */ import_react2.default.createElement("label", { className: "ocgs-toggle", key: def.key }, /* @__PURE__ */ import_react2.default.createElement(
        "input",
        {
          type: "checkbox",
          checked: visible,
          disabled: toggleBusy !== null,
          onChange: function() {
            toggleProvider(def.key);
          }
        }
      ), /* @__PURE__ */ import_react2.default.createElement("span", { className: "ocgs-toggle-label" }, def.label));
    }))), snap === null ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-note" }, "Loading subscription data\u2026") : null, allFailed ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-err" }, "Could not load subscription data. " + (firstError || "Check that the subscriptions plugin is mounted.")) : null, providerVisible(cfg, "commandcode") ? renderCcSection(cc, ccUsage) : null, providerVisible(cfg, "zai") ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-section" }, /* @__PURE__ */ import_react2.default.createElement("h4", { className: "ocgs-section-title" }, "Z.ai (GLM)"), zaiQuota && zaiQuota.error ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-err" }, "Z.ai: " + zaiQuota.error) : null, zaiQuota && zaiQuota.data && zaiQuota.data.ok === false ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-err" }, "Z.ai: " + (zaiQuota.data.error || "quota unavailable")) : null, zaiQuota && zaiQuota.data && zaiQuota.data.ok === true ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-balance" }, "Z.ai Coding Plan" + (typeof zaiQuota.data.level === "string" && zaiQuota.data.level !== "" ? " \xB7 " + zaiQuota.data.level : "")) : null, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-rows" }, buildRows(
      ZAI_WINDOWS,
      zaiQuota && zaiQuota.data && zaiQuota.data.ok === true ? { fiveHour: zaiQuota.data.fiveHour, weekly: zaiQuota.data.weekly } : null
    )), zaiUsage && zaiUsage.data && zaiUsage.data.ok === true ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-pace" }, "7d " + fmtCount(zaiUsage.data.totalCalls) + " calls \xB7 " + fmtCount(zaiUsage.data.totalTokens) + " tokens") : null) : null, providerVisible(cfg, "claude") ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-section" }, /* @__PURE__ */ import_react2.default.createElement("h4", { className: "ocgs-section-title" }, "Claude (meridian)"), quota && quota.error ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-err" }, "Claude (meridian): " + quota.error) : null, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-rows" }, buildRows(null, claudeWindows, windowLabel)), claudePaceLine ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-pace" }, claudePaceLine) : null) : null, providerVisible(cfg, "deepseek") ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-section" }, /* @__PURE__ */ import_react2.default.createElement("h4", { className: "ocgs-section-title" }, "DeepSeek"), ds && ds.error ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-err" }, "DeepSeek: " + ds.error) : null, ds || dsUsageAmount || dsUsageCost ? renderDsDashboard(
      ds && ds.data && Array.isArray(ds.data.balance_infos) && ds.data.balance_infos.length > 0 ? ds.data.balance_infos[0] : null,
      dsUsageAmount,
      dsUsageCost
    ) : null, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-cookie" }, /* @__PURE__ */ import_react2.default.createElement("button", { className: "ocgs-btn", disabled: dsToken.busy, onClick: fetchDsToken }, dsToken.busy ? "Fetching\u2026" : "Fetch token from Firefox"), dsToken.showLogin ? /* @__PURE__ */ import_react2.default.createElement("button", { className: "ocgs-btn", onClick: openDsLogin }, "Open platform.deepseek.com") : null, dsToken.note ? /* @__PURE__ */ import_react2.default.createElement("span", { className: "ocgs-cookie-note" }, dsToken.note) : null)) : null, providerVisible(cfg, "opencode") ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-section" }, /* @__PURE__ */ import_react2.default.createElement("h4", { className: "ocgs-section-title" }, "OpenCode GO"), balanceLine ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-balance" }, balanceLine) : null, go && go.error ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-err" }, "OpenCode GO: " + go.error) : null, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-rows" }, buildRows(GO_WINDOWS, goUsage)), goPaceLine ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-pace" }, goPaceLine) : null, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-cookie" }, /* @__PURE__ */ import_react2.default.createElement("button", { className: "ocgs-btn", disabled: cookie.busy, onClick: fetchCookie }, cookie.busy ? "Fetching\u2026" : "Fetch cookie from Firefox"), cookie.showLogin ? /* @__PURE__ */ import_react2.default.createElement("button", { className: "ocgs-btn", onClick: openLogin }, "Open login page") : null, cookie.note ? /* @__PURE__ */ import_react2.default.createElement("span", { className: "ocgs-cookie-note" }, cookie.note) : null)) : null, providerVisible(cfg, "opencode-zen") ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-section" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-head" }, /* @__PURE__ */ import_react2.default.createElement("h4", { className: "ocgs-section-title" }, "OpenCode Zen"), /* @__PURE__ */ import_react2.default.createElement("button", { className: "dsp-refresh", onClick: refreshOz }, "Refresh")), ozBalanceLine ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-balance" }, ozBalanceLine) : null, oz && oz.error ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-err" }, "OpenCode Zen: " + oz.error) : null, /* @__PURE__ */ import_react2.default.createElement("div", { className: "ocgs-cookie" }, /* @__PURE__ */ import_react2.default.createElement("button", { className: "ocgs-btn", disabled: cookie.busy, onClick: fetchCookie }, cookie.busy ? "Fetching\u2026" : "Fetch cookie from Firefox"), cookie.showLogin ? /* @__PURE__ */ import_react2.default.createElement("button", { className: "ocgs-btn", onClick: openLogin }, "Open opencode.ai") : null, cookie.note ? /* @__PURE__ */ import_react2.default.createElement("span", { className: "ocgs-cookie-note" }, cookie.note) : null)) : null);
  };
}
var name = PLUGIN_NAME;
var inject = ["slots"];
function apply(ctx, config) {
  ctx.effect(function() {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settings_default, client_default));
  }, "subscriptions: styles");
  var Panel = makePanel(ctx, config);
  ctx.slots.inject("settings.section", function() {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 26, label: "Subscriptions" },
      function() {
        return /* @__PURE__ */ import_react2.default.createElement(Panel, null);
      }
    );
  });
}
		return module.exports;
	}
});
