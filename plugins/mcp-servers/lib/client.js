window.__ModuleLoader__.load({
	id: "mcp-servers",
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

// plugins/mcp-servers/src/client.tsx
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

// plugins/shared/settings-panel.tsx
var import_react = __toESM(require("react"));
function SettingsSection(props) {
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "dsp-root" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "dsp-head" }, /* @__PURE__ */ import_react.default.createElement("h3", { className: "dsp-title" }, props.title), props.onRefresh ? /* @__PURE__ */ import_react.default.createElement("button", { className: "dsp-refresh", onClick: props.onRefresh }, props.refreshLabel === void 0 ? "Refresh" : props.refreshLabel) : null), props.children);
}

// css-text:/home/sid/repos/dotfiles-ai/plugins/shared/settings.css
var settings_default = "/* Shared settings-page vocabulary, normalized from the session-archive,\n * subscriptions, and profiles settings panels. One rule set in one file so\n * the three panels cannot drift. Radius and padding disagreements are\n * normalized to the session-archive (or median) value; the var(--dsw-...)\n * aliases the current rules use are kept as-is. */\n\n/* Page-level container:airy vertical rhythm, no own box. */\n.dsp-root {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  padding: 0;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Header row (title + refresh). */\n.dsp-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 0.75rem;\n}\n\n.dsp-title {\n  font-size: 1.5rem;\n  font-weight: 650;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Refresh:session-archive/profiles form (no box, color shift only).\n * subscriptions pads and rounds the hit area; normalized away. */\n.dsp-refresh {\n  cursor: pointer;\n  border: none;\n  background: none;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n}\n.dsp-refresh:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.dsp-err {\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n/* Large setting card. Padding is the median of 16/20/24 (session-archive\n * 20px); the radius is the two-agreeing 20px, not profiles' 12px. */\n.dsp-section {\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.875rem;\n  padding: 1.25rem;\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n/* Card title:subscriptions' 1.5rem/700 matches the page-title vocabulary;\n * profiles' smaller 16px/600 card title normalized up. */\n.dsp-section-title {\n  font-size: 1.125rem;\n  font-weight: 600;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Setting row:horizontal in session-archive and profiles (subscriptions\n * stacks its label and meta vertically; normalized to the horizontal form). */\n.dsp-row {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  min-width: 0;\n}\n\n/* Row label:only subscriptions defines one; ported verbatim, with its\n * emphasized <b> children. */\n.dsp-row-label {\n  display: flex;\n  align-items: baseline;\n  gap: 0.625rem;\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.dsp-row-label b {\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  font-size: 0.9375rem;\n}\n.dsp-row-label b:last-child {\n  margin-left: auto;\n}\n";

// css-text:/home/sid/repos/dotfiles-ai/plugins/mcp-servers/src/client.module.css
var client_default = "/* mcp-servers panel styles. Class names are kebab-case only. */\n\n.mcp-root {\n  display: flex;\n  flex-direction: column;\n  gap: 0.5rem;\n}\n\n.mcp-row {\n  display: flex;\n  flex-direction: column;\n  gap: 0.25rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.875rem;\n  padding: 0.75rem 1rem;\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n.mcp-row-main {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  flex-wrap: wrap;\n}\n\n.mcp-name {\n  font-size: 0.875rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-primary);\n  font-weight: 600;\n}\n\n.mcp-type {\n  font-size: 0.75rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.mcp-status {\n  font-size: 0.75rem;\n  line-height: 1.25rem;\n}\n\n.mcp-status-connected {\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.mcp-status-error {\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.mcp-status-neutral {\n  color: var(--dsw-alias-label-secondary);\n}\n\n.mcp-tools {\n  font-size: 0.75rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.mcp-auth {\n  margin-left: auto;\n  font-size: 0.75rem;\n  line-height: 1.25rem;\n  padding: 0.125rem 0.75rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.625rem;\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n}\n\n.mcp-auth:disabled {\n  opacity: 0.5;\n  cursor: default;\n}\n\n.mcp-row-error {\n  font-size: 0.75rem;\n  line-height: 1.25rem;\n}\n\n.mcp-empty {\n  font-size: 0.875rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n  font-style: italic;\n}\n";

// plugins/mcp-servers/src/client.tsx
var PLUGIN_NAME = "mcp-servers";
var STYLE_TAG_ID = "mcp-servers/settings.css";
function statusClass(status) {
  if (status === "connected") return "mcp-status-connected";
  if (status === "error") return "mcp-status-error";
  return "mcp-status-neutral";
}
function makePanel() {
  return function Panel() {
    var listState = import_react2.default.useState(null);
    var list = listState[0];
    var setList = listState[1];
    var load = function() {
      console.debug("[mcp-servers] fetching server roster");
      fetchJson("/mcp-servers/api/servers").then(function(result) {
        if (result.error) {
          console.error("[mcp-servers] load failed " + result.error);
          setList(function(prev) {
            return { data: prev && prev.data ? prev.data : null, error: result.error };
          });
          return;
        }
        var servers = result.data && Array.isArray(result.data.servers) ? result.data.servers : [];
        console.info("[mcp-servers] servers loaded: " + servers.length);
        setList({ data: servers, error: null });
      });
    };
    import_react2.default.useEffect(function() {
      console.debug("[mcp-servers] panel mounted");
      load();
    }, []);
    var refresh = function() {
      console.info("[mcp-servers] refresh clicked");
      load();
    };
    var failRow = function(rowName, message) {
      setList(function(prev) {
        var rowErrors = {};
        rowErrors[rowName] = message;
        var failed = {
          data: prev && prev.data ? prev.data : [],
          error: prev ? prev.error : null,
          authing: null,
          rowErrors
        };
        return failed;
      });
    };
    var authenticate = function(name2) {
      console.info("[mcp-servers] authorize requested: " + name2);
      setList(function(prev) {
        var next = {
          data: prev && prev.data ? prev.data : [],
          error: prev ? prev.error : null,
          authing: name2,
          rowErrors: null
        };
        return next;
      });
      postJson("/mcp-servers/api/servers/" + encodeURIComponent(name2) + "/authorize").then(function(result) {
        if (result.error) {
          console.error("[mcp-servers] authorize failed for " + name2 + ": " + result.error);
          failRow(name2, result.error);
          return;
        }
        var target = result.data && result.data.authorizeUrl ? result.data.authorizeUrl : "";
        if (target === "") {
          console.error("[mcp-servers] no authorize URL returned for " + name2);
          failRow(name2, "The server did not return an authorization URL. Refresh to see its status.");
          return;
        }
        console.info("[mcp-servers] navigating to authorize URL for " + name2);
        window.location.href = target;
      });
    };
    var body = null;
    if (list === null) {
      body = /* @__PURE__ */ import_react2.default.createElement("div", { className: "mcp-empty" }, "Loading\u2026");
    } else if (list.error && (!list.data || list.data.length === 0)) {
      body = /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-err" }, list.error);
    } else if (!list.data || list.data.length === 0) {
      body = /* @__PURE__ */ import_react2.default.createElement("div", { className: "mcp-empty" }, "No MCP servers");
    } else {
      body = /* @__PURE__ */ import_react2.default.createElement("div", { className: "mcp-root" }, list.data.map(function(server) {
        var rowError = list.rowErrors && list.rowErrors[server.name];
        return /* @__PURE__ */ import_react2.default.createElement("div", { className: "mcp-row", key: server.name }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "mcp-row-main" }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "mcp-name" }, server.name), /* @__PURE__ */ import_react2.default.createElement("span", { className: "mcp-type" }, server.type), /* @__PURE__ */ import_react2.default.createElement("span", { className: "mcp-status " + statusClass(server.status) }, server.status), /* @__PURE__ */ import_react2.default.createElement("span", { className: "mcp-tools" }, server.toolCount, server.toolCount === 1 ? " tool" : " tools"), server.status === "needs-auth" ? /* @__PURE__ */ import_react2.default.createElement(
          "button",
          {
            className: "mcp-auth",
            disabled: list.authing === server.name,
            onClick: function() {
              authenticate(server.name);
            }
          },
          "Authenticate"
        ) : null), server.error ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "mcp-row-error dsp-err" }, server.error) : null, rowError ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "mcp-row-error dsp-err" }, rowError) : null);
      }), list.error ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "dsp-err" }, list.error) : null);
    }
    return /* @__PURE__ */ import_react2.default.createElement(SettingsSection, { title: "MCP servers", onRefresh: refresh, refreshLabel: "Refresh" }, body);
  };
}
var name = PLUGIN_NAME;
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(function() {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settings_default, client_default));
  }, "mcp-servers: styles");
  var Panel = makePanel();
  ctx.slots.inject("settings.section", function() {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 30, label: "MCP" },
      function() {
        return /* @__PURE__ */ import_react2.default.createElement(Panel, null);
      }
    );
  });
}
		return module.exports;
	}
});
