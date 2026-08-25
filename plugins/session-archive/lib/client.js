window.__ModuleLoader__.load({
	id: "session-archive",
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

// plugins/session-archive/src/client.tsx
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
function postJson(url, body) {
  const hasBody = body !== void 0;
  return fetch(url, {
    method: "POST",
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
      return { data: null, error: String(result.json.error) };
    }
    if (!result.ok) return { data: null, error: "HTTP " + result.status };
    return { data: result.json, error: null };
  }).catch(function(e) {
    return { data: null, error: String(e && e.message || e) };
  });
}

// plugins/shared/settings-panel.tsx
var import_react = __toESM(require("react"));
function SettingsSection(props) {
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dsp-root" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dsp-head" }, /* @__PURE__ */ import_react.default.createElement("h3", { className: "dsp-title" }, props.title), props.onRefresh ? /* @__PURE__ */ import_react.default.createElement("button", { className: "dsp-refresh", onClick: props.onRefresh }, props.refreshLabel === void 0 ? "Refresh" : props.refreshLabel) : null), props.children);
}

// css-text:/home/sid/repos/dotfiles-ai/plugins/shared/settings.css
var settings_default = "/* Shared settings-page vocabulary, normalized from the session-archive,\n * subscriptions, and profiles settings panels. One rule set in one file so\n * the three panels cannot drift. Radius and padding disagreements are\n * normalized to the session-archive (or median) value; the var(--dsw-...)\n * aliases the current rules use are kept as-is. */\n\n/* Page-level container:airy vertical rhythm, no own box. */\n.dsp-root {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  padding: 0;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Header row (title + refresh). */\n.dsp-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 0.75rem;\n}\n\n.dsp-title {\n  font-size: 1.5rem;\n  font-weight: 650;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Refresh:session-archive/profiles form (no box, color shift only).\n * subscriptions pads and rounds the hit area; normalized away. */\n.dsp-refresh {\n  cursor: pointer;\n  border: none;\n  background: none;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n}\n.dsp-refresh:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.dsp-err {\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n/* Large setting card. Padding is the median of 16/20/24 (session-archive\n * 20px); the radius is the two-agreeing 20px, not profiles' 12px. */\n.dsp-section {\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.875rem;\n  padding: 1.25rem;\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n/* Card title:subscriptions' 1.5rem/700 matches the page-title vocabulary;\n * profiles' smaller 16px/600 card title normalized up. */\n.dsp-section-title {\n  font-size: 1.125rem;\n  font-weight: 600;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Setting row:horizontal in session-archive and profiles (subscriptions\n * stacks its label and meta vertically; normalized to the horizontal form). */\n.dsp-row {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  min-width: 0;\n}\n\n/* Row label:only subscriptions defines one; ported verbatim, with its\n * emphasized <b> children. */\n.dsp-row-label {\n  display: flex;\n  align-items: baseline;\n  gap: 0.625rem;\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.dsp-row-label b {\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  font-size: 0.9375rem;\n}\n.dsp-row-label b:last-child {\n  margin-left: auto;\n}\n";

// css-text:/home/sid/repos/dotfiles-ai/plugins/session-archive/src/client.module.css
var client_default = ".sarch-section {\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.875rem;\n  padding: 1.25rem;\n  background: var(--dsw-alias-bg-tertiary);\n}\n.sarch-rows {\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n}\n.sarch-row {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  min-width: 0;\n}\n.sarch-row-main {\n  display: flex;\n  flex-direction: column;\n  gap: 0.125rem;\n  min-width: 0;\n  flex: 1;\n}\n.sarch-row-id {\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.sarch-row-meta {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  min-width: 0;\n}\n.sarch-row-meta > span {\n  font-size: 0.875rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n}\n.sarch-live {\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-state-success-primary);\n  font-weight: 600;\n  flex: none;\n}\n.sarch-btn {\n  box-sizing: border-box;\n  width: 2rem;\n  height: 2rem;\n  display: inline-grid;\n  place-items: center;\n  flex: none;\n  border: 0;\n  border-radius: 0.5rem;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 1.25rem;\n  padding: 0;\n  cursor: pointer;\n}\n.sarch-btn:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-primary);\n}\n.sarch-btn:disabled {\n  opacity: 0.5;\n  cursor: default;\n}\n.sarch-empty {\n  font-size: 0.875rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n  font-style: italic;\n}\n";

// plugins/session-archive/src/client.tsx
var PLUGIN_NAME = "session-archive";
var STYLE_TAG_ID = "session-archive/settings.css";
function shortId(id) {
  if (typeof id !== "string") return "";
  if (id.length <= 16) return id;
  return id.slice(0, 8) + "\u2026" + id.slice(-6);
}
function fmtDate(value) {
  var date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString();
}
function fmtSize(bytes) {
  if (bytes === null || bytes === void 0 || bytes < 0 || isNaN(bytes)) return "\u2014";
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MiB";
  return Math.max(1, Math.round(bytes / 1024)) + " KiB";
}
function makePanel() {
  return function Panel() {
    var listState = import_react2.default.useState(null);
    var list = listState[0];
    var setList = listState[1];
    var busyState = import_react2.default.useState(null);
    var busy = busyState[0];
    var setBusy = busyState[1];
    var load = function() {
      fetchJson("/sessions/archived").then(function(result) {
        if (result.error) {
          setList(function(prev) {
            return { data: prev && prev.data ? prev.data : null, error: result.error };
          });
          return;
        }
        var sessions = result.data && Array.isArray(result.data.sessions) ? result.data.sessions : [];
        setList({ data: sessions, error: null });
      });
    };
    import_react2.default.useEffect(function() {
      load();
    }, []);
    var remove = function(id) {
      if (busy !== null) return;
      setBusy(id);
      postJson("/sessions/archived/delete", { id }).then(function(result) {
        setBusy(null);
        if (result.error) {
          setList(function(prev) {
            return { data: prev && prev.data ? prev.data : null, error: result.error };
          });
          return;
        }
        load();
      });
    };
    var rows = [];
    if (list && list.data) {
      for (var i = 0; i < list.data.length; i++) {
        var session = list.data[i];
        var live = session.live === true;
        var action = live ? /* @__PURE__ */ import_react2.default.createElement("span", { className: "sarch-live" }, "live") : /* @__PURE__ */ import_react2.default.createElement(
          "button",
          {
            className: "sarch-btn",
            disabled: busy === session.id,
            title: "Delete archived session",
            "aria-label": "Delete archived session",
            onClick: /* @__PURE__ */ (function(id) {
              return function() {
                remove(id);
              };
            })(session.id)
          },
          busy === session.id ? "\u2026" : "\xD7"
        );
        var label = session.title ? session.title : shortId(session.id);
        rows.push(
          /* @__PURE__ */ import_react2.default.createElement("div", { className: "sarch-row", key: session.id }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "sarch-row-main" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "sarch-row-id" }, label), /* @__PURE__ */ import_react2.default.createElement("div", { className: "sarch-row-meta" }, /* @__PURE__ */ import_react2.default.createElement("span", null, session.cwd ? session.cwd : "no cwd"), /* @__PURE__ */ import_react2.default.createElement("span", null, fmtDate(session.createdAt)), /* @__PURE__ */ import_react2.default.createElement("span", null, fmtSize(session.size)))), action)
        );
      }
    }
    var body = null;
    if (list === null) {
      body = /* @__PURE__ */ import_react2.default.createElement("div", { className: "sarch-empty" }, "Loading\u2026");
    } else if (list.error && (!list.data || list.data.length === 0)) {
      body = /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-err" }, list.error);
    } else if (rows.length === 0) {
      body = /* @__PURE__ */ import_react2.default.createElement("div", { className: "sarch-empty" }, "No archived sessions");
    } else {
      body = /* @__PURE__ */ import_react2.default.createElement("div", { className: "sarch-section" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "sarch-rows" }, rows), list.error ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-err" }, list.error) : null);
    }
    return /* @__PURE__ */ import_react2.default.createElement(SettingsSection, { title: "Archive", onRefresh: load, refreshLabel: "Refresh" }, body);
  };
}
var name = PLUGIN_NAME;
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(function() {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settings_default, client_default));
  }, "session-archive: styles");
  var Panel = makePanel();
  ctx.slots.inject("settings.section", function() {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 28, label: "Archive" },
      function() {
        return /* @__PURE__ */ import_react2.default.createElement(Panel, null);
      }
    );
  });
}
		return module.exports;
	}
});
