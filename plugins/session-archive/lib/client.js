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

// plugins/session-archive/src/client.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);
var PLUGIN_NAME = "session-archive";
var STYLE_TAG_ID = "session-archive/settings.css";
var CSS_TEXT = [
  ".sarch-root{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:6px 2px;color:var(--dsw-alias-label-primary)}",
  ".sarch-head{display:flex;align-items:center;justify-content:space-between;gap:8px}",
  ".sarch-title{font-size:16px;font-weight:600;margin:0}",
  ".sarch-refresh{cursor:pointer;border:none;background:none;padding:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px}",
  ".sarch-refresh:hover{color:var(--dsw-alias-label-primary)}",
  ".sarch-section{display:flex;flex-direction:column;gap:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:12px 14px}",
  ".sarch-rows{display:flex;flex-direction:column;gap:8px}",
  ".sarch-row{display:flex;align-items:center;gap:10px;min-width:0}",
  ".sarch-row-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
  ".sarch-row-id{font-size:12px;line-height:16px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".sarch-row-meta{display:flex;align-items:center;gap:6px;min-width:0}",
  ".sarch-row-meta>span{font-size:10px;line-height:14px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".sarch-live{font-size:11px;line-height:15px;color:var(--dsw-alias-state-success-primary);font-weight:600;flex:none}",
  ".sarch-btn{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:12px;line-height:20px;padding:2px 10px;cursor:pointer;flex:none}",
  ".sarch-btn:disabled{opacity:.5;cursor:default}",
  ".sarch-empty{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary);font-style:italic}",
  ".sarch-err{font-size:12px;line-height:16px;color:var(--dsw-alias-state-error-primary)}"
].join("");
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
  return fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
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
    var listState = import_react.default.useState(null);
    var list = listState[0];
    var setList = listState[1];
    var busyState = import_react.default.useState(null);
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
    import_react.default.useEffect(function() {
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
        var action = live ? import_react.default.createElement("span", { className: "sarch-live" }, "live") : import_react.default.createElement(
          "button",
          {
            className: "sarch-btn",
            disabled: busy === session.id,
            onClick: /* @__PURE__ */ (function(id) {
              return function() {
                remove(id);
              };
            })(session.id)
          },
          busy === session.id ? "Deleting\u2026" : "Delete"
        );
        var label = session.title ? session.title : shortId(session.id);
        rows.push(
          import_react.default.createElement(
            "div",
            { className: "sarch-row", key: session.id },
            import_react.default.createElement(
              "div",
              { className: "sarch-row-main" },
              import_react.default.createElement("div", { className: "sarch-row-id" }, label),
              import_react.default.createElement(
                "div",
                { className: "sarch-row-meta" },
                import_react.default.createElement("span", null, session.cwd ? session.cwd : "no cwd"),
                import_react.default.createElement("span", null, fmtDate(session.createdAt)),
                import_react.default.createElement("span", null, fmtSize(session.size))
              )
            ),
            action
          )
        );
      }
    }
    var body = null;
    if (list === null) {
      body = import_react.default.createElement("div", { className: "sarch-empty" }, "Loading\u2026");
    } else if (list.error && (!list.data || list.data.length === 0)) {
      body = import_react.default.createElement("div", { className: "sarch-err" }, list.error);
    } else if (rows.length === 0) {
      body = import_react.default.createElement("div", { className: "sarch-empty" }, "No archived sessions");
    } else {
      body = import_react.default.createElement(
        "div",
        { className: "sarch-section" },
        import_react.default.createElement("div", { className: "sarch-rows" }, rows),
        list.error ? import_react.default.createElement("div", { className: "sarch-err" }, list.error) : null
      );
    }
    return import_react.default.createElement(
      "div",
      { className: "sarch-root" },
      import_react.default.createElement(
        "div",
        { className: "sarch-head" },
        import_react.default.createElement("h3", { className: "sarch-title" }, "Archive"),
        import_react.default.createElement("button", { className: "sarch-refresh", onClick: load }, "Refresh")
      ),
      body
    );
  };
}
var name = PLUGIN_NAME;
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(function() {
    if (typeof document === "undefined") return;
    if (document.querySelector('style[data-plugin-css="' + STYLE_TAG_ID + '"]') !== null) return;
    var tag = document.createElement("style");
    tag.dataset.plugin = PLUGIN_NAME;
    tag.dataset.pluginCss = STYLE_TAG_ID;
    tag.textContent = CSS_TEXT;
    document.head.appendChild(tag);
  }, "session-archive: styles");
  var Panel = makePanel();
  ctx.slots.inject("settings.section", function() {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 28, label: "Archive" },
      function() {
        return import_react.default.createElement(Panel);
      }
    );
  });
}
		return module.exports;
	}
});
