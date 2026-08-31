/**
 * session-archive — archived-session cleanup panel (client half).
 *
 * A settings.section view (order 28, right after profiles-client at 27) that
 * lists the archived session logs served by the host half:
 *
 *   - GET  /sessions/archived  -> { ok, sessions: [{ id, title, cwd,
 *     createdAt, size, live }] }
 *   - POST /sessions/archived/delete  (body { id }) -> { ok }
 *   - POST /sessions/archived/delete-batch  (body { ids }) ->
 *     { ok, results: [{ id, ok, error? }] }
 *
 * Each row shows the session title, its cwd, its createdAt as a locale date
 * string, and its log file size in KiB/MiB. A session with no title shows
 * its shortened id instead. Each non-live row has a selection checkbox.
 * A header row offers a select-all checkbox and a Delete selected button
 * that sends one batch request. A live session shows "live" instead of
 * a checkbox and Delete button.
 * A Refresh button re-fetches the list and clears the selection. An empty
 * list shows "No archived sessions".
 *
 * The seam. This file is the package's `./client` source. build.mjs
 * bundles it with esbuild (browser, cjs, es2022): react external, wrapped
 * in the `window.__ModuleLoader__.load` facade with the loader id
 * `session-archive`. The host row in cordis.patch.yml keeps the loader
 * entry alive so the client-module registry serves this bundle.
 */

import react from "react";
import { injectStyle, mergeCss, fetchJson, postJson } from "../../shared/client-util";
import { SettingsSection } from "../../shared/settings-panel";
import settingsCss from "../../shared/settings.css";
import localCss from "./client.module.css";

/** Stable plugin identity, also the loader entry id in cordis.patch.yml. */
var PLUGIN_NAME = "session-archive";

/** One stylesheet for this panel. Class names are kebab-case only. */
var STYLE_TAG_ID = "session-archive/settings.css";

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

    var selectedState = react.useState(function () {
      return new Set();
    });
    var selected = selectedState[0];
    var setSelected = selectedState[1];

    var batchBusyState = react.useState(false);
    var batchBusy = batchBusyState[0];
    var setBatchBusy = batchBusyState[1];
    var load = function () {
      console.debug("[session-archive] fetching archived sessions");
      fetchJson("/sessions/archived").then(function (result) {
        setSelected(new Set());
        if (result.error) {
          console.error("[session-archive] load failed", result.error);
          setList(function (prev) {
            return { data: prev && prev.data ? prev.data : null, error: result.error };
          });
          return;
        }
        var sessions =
          result.data && Array.isArray(result.data.sessions) ? result.data.sessions : [];
        console.info("[session-archive] loaded archived sessions:", sessions.length);
        setList({ data: sessions, error: null });
      });
    };

    react.useEffect(function () {
      console.debug("[session-archive] panel mounted");
      load();
    }, []);

    var remove = function (id) {
      if (busy !== null || batchBusy) return;
      setBusy(id);
      postJson("/sessions/archived/delete", { id: id })
        .then(function (result) {
          setBusy(null);
          if (result.error) {
            console.error("[session-archive] delete failed", id, result.error);
            setList(function (prev) {
              return { data: prev && prev.data ? prev.data : null, error: result.error };
            });
            return;
          }
          console.info("[session-archive] deleted archived session", id);
          load();
        })
        .catch(function (error) {
          setBusy(null);
          console.error("[session-archive] delete failed", id, error);
        });
    };

    var deleteSelected = function () {
      if (batchBusy || busy !== null || selected.size === 0) return;
      var ids = Array.from(selected);
      setBatchBusy(true);
      console.info("[session-archive] batch deleting archived sessions", ids.length);
      postJson("/sessions/archived/delete-batch", { ids: ids })
        .then(function (result) {
          setBatchBusy(false);
          if (result.error) {
            console.error("[session-archive] batch delete failed", result.error);
            setList(function (prev) {
              return { data: prev && prev.data ? prev.data : null, error: result.error };
            });
            return;
          }
          var results =
            result.data && Array.isArray(result.data.results) ? result.data.results : [];
          for (var i = 0; i < results.length; i++) {
            if (results[i].ok === false) {
              console.warn(
                "[session-archive] batch delete failed for session",
                results[i].id,
                results[i].error,
              );
            }
          }
          load();
        })
        .catch(function (error) {
          setBatchBusy(false);
          console.error("[session-archive] batch delete failed", error);
        });
    };

    var toggle = function (id) {
      setSelected(function (prev) {
        var next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    };

    var selectableIds = [];
    if (list && list.data) {
      for (var i = 0; i < list.data.length; i++) {
        if (list.data[i].live !== true) selectableIds.push(list.data[i].id);
      }
    }
    var allSelected = selectableIds.length > 0 && selected.size === selectableIds.length;
    var toggleAll = function () {
      setSelected(allSelected ? new Set() : new Set(selectableIds));
    };

    var batchControls = null;
    if (list && list.data && list.data.length > 0) {
      batchControls = (
        <div className="sarch-batch">
          <label className="sarch-select-all">
            <input
              type="checkbox"
              checked={allSelected}
              disabled={batchBusy || busy !== null}
              onChange={toggleAll}
            />
            Select all
          </label>
          <button
            className="sarch-btn sarch-batch-delete"
            disabled={selected.size === 0 || batchBusy || busy !== null}
            title="Delete selected archived sessions"
            onClick={deleteSelected}
          >
            {batchBusy
              ? "Deleting " + selected.size + "…"
              : "Delete selected (" + selected.size + ")"}
          </button>
        </div>
      );
    }

    var rows = [];
    if (list && list.data) {
      for (var i = 0; i < list.data.length; i++) {
        var session = list.data[i];
        var live = session.live === true;
        var action = live ? (
          <span className="sarch-live">live</span>
        ) : (
          <button
            className="sarch-btn"
            disabled={busy === session.id || batchBusy}
            title="Delete archived session"
            aria-label="Delete archived session"
            onClick={(function (id) {
              return function () {
                remove(id);
              };
            })(session.id)}
          >
            {busy === session.id ? "…" : "×"}
          </button>
        );
        var checkbox = live ? null : (
          <input
            type="checkbox"
            className="sarch-check"
            checked={selected.has(session.id)}
            disabled={batchBusy || busy !== null}
            aria-label="Select archived session"
            onChange={(function (id) {
              return function () {
                toggle(id);
              };
            })(session.id)}
          />
        );
        var label = session.title ? session.title : shortId(session.id);
        rows.push(
          <div className="sarch-row" key={session.id}>
            {checkbox}
            <div className="sarch-row-main">
              <div className="sarch-row-id">{label}</div>
              <div className="sarch-row-meta">
                <span>{session.cwd ? session.cwd : "no cwd"}</span>
                <span>{fmtDate(session.createdAt)}</span>
                <span>{fmtSize(session.size)}</span>
              </div>
            </div>
            {action}
          </div>,
        );
      }
    }

    var body = null;
    if (list === null) {
      body = <div className="sarch-empty">Loading…</div>;
    } else if (list.error && (!list.data || list.data.length === 0)) {
      body = <div className="dsp-err">{list.error}</div>;
    } else if (rows.length === 0) {
      body = <div className="sarch-empty">No archived sessions</div>;
    } else {
      body = (
        <div className="sarch-section">
          {batchControls}
          <div className="sarch-rows">{rows}</div>
          {list.error ? <div className="dsp-err">{list.error}</div> : null}
        </div>
      );
    }

    return (
      <SettingsSection title={"Archive"} onRefresh={load} refreshLabel={"Refresh"}>
        {body}
      </SettingsSection>
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
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settingsCss, localCss));
  }, "session-archive: styles");

  // The panel component is created once, so its identity stays stable across
  // slot re-renders and React keeps its state (data) between them.
  var Panel = makePanel();
  ctx.slots.inject("settings.section", function () {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 28, label: "Archive" },
      function () {
        return <Panel />;
      },
    );
  });
}

export { apply, inject, name };
