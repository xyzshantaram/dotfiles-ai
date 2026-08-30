/**
 * log-viewer — dsh-web server log viewer panel (client half).
 *
 * A settings.section view (order 29, right after session-archive at 28) that
 * shows the output lines served by the host half:
 *
 *   - GET /log-viewer/lines -> { ok, lines: string[], truncated: boolean }
 *
 * The panel fetches once on mount and again on Refresh. No streaming, no
 * polling. The host runs a configurable command (no shell: whitespace
 * splitting only) and returns the last 2000 lines; a note appears when the
 * log was capped.
 *
 * The seam. This file is the package's `./client` source. build.mjs
 * bundles it with esbuild (browser, cjs, es2022): react external, wrapped
 * in the `window.__ModuleLoader__.load` facade with the loader id
 * `log-viewer`. The host row in cordis.patch.yml keeps the loader entry
 * alive so the client-module registry serves this bundle.
 */

import react from "react";
import { injectStyle, mergeCss, fetchJson } from "../../shared/client-util";
import { SettingsSection } from "../../shared/settings-panel";
import settingsCss from "../../shared/settings.css";
import localCss from "./client.module.css";

/** Stable plugin identity, also the loader entry id in cordis.patch.yml. */
var PLUGIN_NAME = "log-viewer";

/** One stylesheet for this panel. Class names are kebab-case only. */
var STYLE_TAG_ID = "log-viewer/settings.css";

/** Build the panel component. State stays per-registration. */
function makePanel() {
  return function Panel() {
    var viewState = react.useState(null);
    var view = viewState[0];
    var setView = viewState[1];

    var load = function () {
      console.debug("[log-viewer] fetching log lines");
      fetchJson("/log-viewer/lines").then(function (result) {
        if (result.error) {
          console.error("[log-viewer] load failed " + result.error);
          setView(function (prev) {
            return { data: prev && prev.data ? prev.data : null, error: result.error };
          });
          return;
        }
        var lines = result.data && Array.isArray(result.data.lines) ? result.data.lines : [];
        var truncated = result.data && result.data.truncated === true;
        console.info("[log-viewer] log lines loaded: " + lines.length);
        setView({ data: lines, truncated: truncated, error: null });
      });
    };

    react.useEffect(function () {
      console.debug("[log-viewer] panel mounted");
      load();
    }, []);

    var refresh = function () {
      console.info("[log-viewer] refresh clicked");
      load();
    };

    var body = null;
    if (view === null) {
      body = <div className="lv-empty">Loading…</div>;
    } else if (view.error && (!view.data || view.data.length === 0)) {
      body = <div className="dsp-err">{view.error}</div>;
    } else if (!view.data || view.data.length === 0) {
      body = <div className="lv-empty">No log lines</div>;
    } else {
      body = (
        <div className="lv-root">
          <pre className="lv-body">{view.data.join("\n")}</pre>
          {view.truncated ? (
            <div className="lv-note">Log truncated to the last 2000 lines</div>
          ) : null}
          {view.error ? <div className="dsp-err">{view.error}</div> : null}
        </div>
      );
    }

    return (
      <SettingsSection title={"Log viewer"} onRefresh={refresh} refreshLabel={"Refresh"}>
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
  }, "log-viewer: styles");

  // The panel component is created once, so its identity stays stable across
  // slot re-renders and React keeps its state (data) between them.
  var Panel = makePanel();
  ctx.slots.inject("settings.section", function () {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 29, label: "Log viewer" },
      function () {
        return <Panel />;
      },
    );
  });
}

export { apply, inject, name };
