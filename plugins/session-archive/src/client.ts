/**
 * session-archive — archived-session cleanup panel (client half).
 *
 * A settings.section view (order 28, right after profiles-client at 27) that
 * lists the archived session logs served by the host half:
 *
 *   - GET  /sessions/archived  -> { ok, sessions: [{ id, title, cwd,
 *     createdAt, size, live }] }
 *   - POST /sessions/archived/delete  (body { id }) -> { ok }
 *
 * Each row shows the session title, its cwd, its createdAt as a locale date
 * string, and its log file size in KiB/MiB. A session with no title shows
 * its shortened id instead. A live session
 * shows "live" instead of a Delete button. A Refresh button re-fetches the
 * list. An empty list shows "No archived sessions".
 *
 * The seam. This file is the package's `./client` source. build.mjs
 * bundles it with esbuild (browser, cjs, es2022): react external, wrapped
 * in the `window.__ModuleLoader__.load` facade with the loader id
 * `session-archive`. The host row in cordis.patch.yml keeps the loader
 * entry alive so the client-module registry serves this bundle.
 */

import react from "react";
import { DESIGN_TOKENS, CONTROLS_CSS, mergeCss } from "../../design-system";

/** Stable plugin identity, also the loader entry id in cordis.patch.yml. */
var PLUGIN_NAME = "session-archive";

/** One stylesheet for this panel. Class names are kebab-case only. */
var STYLE_TAG_ID = "session-archive/settings.css";
var CSS_TEXT = mergeCss(DESIGN_TOKENS, CONTROLS_CSS, [
  ".sarch-root{box-sizing:border-box;display:flex;flex-direction:column;gap:12px;padding:0;color:var(--dsw-alias-label-primary)}",
  ".sarch-head{display:flex;align-items:center;justify-content:space-between;gap:12px}",
  ".sarch-title{font-size:24px;font-weight:700;margin:0;line-height:1.2;color:var(--dsw-alias-label-primary)}",
  ".sarch-refresh{cursor:pointer;border:none;background:none;padding:0;color:var(--dsw-alias-label-secondary);font-size:15px;line-height:20px}",
  ".sarch-refresh:hover{color:var(--dsw-alias-label-primary)}",
  ".sarch-section{display:flex;flex-direction:column;gap:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:20px;padding:20px;background:var(--dsw-alias-bg-tertiary)}",
  ".sarch-rows{display:flex;flex-direction:column;gap:12px}",
  ".sarch-row{display:flex;align-items:center;gap:12px;min-width:0}",
  ".sarch-row-main{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}",
  ".sarch-row-id{font-size:16px;line-height:22px;font-weight:600;color:var(--dsw-alias-label-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".sarch-row-meta{display:flex;align-items:center;gap:12px;min-width:0}",
  ".sarch-row-meta>span{font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}",
  ".sarch-live{font-size:15px;line-height:20px;color:var(--dsw-alias-state-success-primary);font-weight:600;flex:none}",
  ".sarch-btn{box-sizing:border-box;width:40px;height:40px;display:inline-grid;place-items:center;flex:none;border:0;border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font-size:28px;padding:0;cursor:pointer}",
  ".sarch-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
  ".sarch-btn:disabled{opacity:.5;cursor:default}",
  ".sarch-empty{font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary);font-style:italic}",
  ".sarch-err{font-size:15px;line-height:22px;color:var(--dsw-alias-state-error-primary)}",
].join(""));

/** Fetch one same-origin route and always resolve to a plain object. */
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

/** POST one same-origin route with a JSON body, same {data,error} shape. */
function postJson(url, body) {
  return fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
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

/** Shorten a session id for display: head + ellipsis + tail. */
function shortId(id) {
  if (typeof id !== "string") return "";
  if (id.length <= 16) return id;
  return id.slice(0, 8) + "…" + id.slice(-6);
}

/** createdAt as a locale date string; "" when unparseable. */
function fmtDate(value) {
  var date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

/** Log file size in KiB/MiB; "—" for unknown (-1) or missing. */
function fmtSize(bytes) {
  if (bytes === null || bytes === undefined || bytes < 0 || isNaN(bytes)) return "—";
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + " MiB";
  return Math.max(1, Math.round(bytes / 1024)) + " KiB";
}

/** Build the panel component. State stays per-registration. */
function makePanel() {
  return function Panel() {
    var listState = react.useState(null);
    var list = listState[0];
    var setList = listState[1];

    var busyState = react.useState(null);
    var busy = busyState[0];
    var setBusy = busyState[1];

    var load = function () {
      fetchJson("/sessions/archived").then(function (result) {
        if (result.error) {
          setList(function (prev) {
            return { data: prev && prev.data ? prev.data : null, error: result.error };
          });
          return;
        }
        var sessions =
          result.data && Array.isArray(result.data.sessions) ? result.data.sessions : [];
        setList({ data: sessions, error: null });
      });
    };

    react.useEffect(function () {
      load();
    }, []);

    var remove = function (id) {
      if (busy !== null) return;
      setBusy(id);
      postJson("/sessions/archived/delete", { id: id }).then(function (result) {
        setBusy(null);
        if (result.error) {
          setList(function (prev) {
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
        var action = live
          ? react.createElement("span", { className: "sarch-live" }, "live")
          : react.createElement(
              "button",
              {
                className: "sarch-btn",
                disabled: busy === session.id,
                title: "Delete archived session",
                "aria-label": "Delete archived session",
                onClick: (function (id) {
                  return function () {
                    remove(id);
                  };
                })(session.id),
              },
              busy === session.id ? "…" : "×",
            );
        var label = session.title ? session.title : shortId(session.id);
        rows.push(
          react.createElement(
            "div",
            { className: "sarch-row", key: session.id },
            react.createElement(
              "div",
              { className: "sarch-row-main" },
              react.createElement("div", { className: "sarch-row-id" }, label),
              react.createElement(
                "div",
                { className: "sarch-row-meta" },
                react.createElement("span", null, session.cwd ? session.cwd : "no cwd"),
                react.createElement("span", null, fmtDate(session.createdAt)),
                react.createElement("span", null, fmtSize(session.size)),
              ),
            ),
            action,
          ),
        );
      }
    }

    var body = null;
    if (list === null) {
      body = react.createElement("div", { className: "sarch-empty" }, "Loading…");
    } else if (list.error && (!list.data || list.data.length === 0)) {
      body = react.createElement("div", { className: "sarch-err" }, list.error);
    } else if (rows.length === 0) {
      body = react.createElement("div", { className: "sarch-empty" }, "No archived sessions");
    } else {
      body = react.createElement(
        "div",
        { className: "sarch-section" },
        react.createElement("div", { className: "sarch-rows" }, rows),
        list.error ? react.createElement("div", { className: "sarch-err" }, list.error) : null,
      );
    }

    return react.createElement(
      "div",
      { className: "sarch-root" },
      react.createElement(
        "div",
        { className: "sarch-head" },
        react.createElement("h3", { className: "sarch-title" }, "Archive"),
        react.createElement("button", { className: "sarch-refresh", onClick: load }, "Refresh"),
      ),
      body,
    );
  };
}

/** Stable Cordis plugin name. */
var name = PLUGIN_NAME;
/** Services this bundle reaches through the plugin context. */
var inject = ["slots"];

/** Plugin body: inject the styles once and register the settings section. */
function apply(ctx) {
  ctx.effect(function () {
    if (typeof document === "undefined") return;
    if (document.querySelector('style[data-plugin-css="' + STYLE_TAG_ID + '"]') !== null) return;
    var tag = document.createElement("style");
    tag.dataset.plugin = PLUGIN_NAME;
    tag.dataset.pluginCss = STYLE_TAG_ID;
    tag.textContent = CSS_TEXT;
    document.head.appendChild(tag);
  }, "session-archive: styles");

  // The panel component is created once, so its identity stays stable across
  // slot re-renders and React keeps its state (data) between them.
  var Panel = makePanel();
  ctx.slots.inject("settings.section", function () {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 28, label: "Archive" },
      function () {
        return react.createElement(Panel);
      },
    );
  });
}

export { apply, inject, name };
