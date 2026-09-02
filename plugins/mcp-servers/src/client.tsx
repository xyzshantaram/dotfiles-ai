/**
 * mcp-servers — MCP server list panel (client half).
 *
 * A settings.section view (order 30, after log-viewer at 29) that shows the
 * live server roster served by the host half:
 *
 *   - GET  /mcp-servers/api/servers                       -> { servers: LiveServer[] }
 *   - POST /mcp-servers/api/servers/<name>/authorize      -> { authorizeUrl } | { error }
 *
 * The panel fetches once on mount and again on Refresh. One row per server
 * shows the name, the transport type, the status, and the tool count. A row
 * with status "needs-auth" shows an Authenticate button. The button starts a
 * top level navigation to the OAuth authorize URL. A top level navigation is
 * required because the fetch is asynchronous and a popup opened after it is
 * blocked by the browser. The host callback page renders a Back link.
 *
 * The seam. This file is the package's `./client` source. build.mjs
 * bundles it with esbuild (browser, cjs, es2022): react external, wrapped
 * in the `window.__ModuleLoader__.load` facade with the loader id
 * `mcp-servers`.
 */

/** Shape of one panel view state. The auth fields stay optional. */
type ListView = {
  data: Array<{
    name: string;
    type: string;
    status: string;
    error: string;
    toolCount: number;
  }> | null;
  error: string | null;
  authing?: string | null;
  rowErrors?: Record<string, string> | null;
};

import react from "react";
import { injectStyle, mergeCss, fetchJson, postJson } from "../../shared/client-util";
import { SettingsSection } from "../../shared/settings-panel";
import settingsCss from "../../shared/settings.css";
import localCss from "./client.module.css";

/** Stable plugin identity, also the loader entry id. */
var PLUGIN_NAME = "mcp-servers";

/** One stylesheet for this panel. Class names are kebab-case only. */
var STYLE_TAG_ID = "mcp-servers/settings.css";

/** Map a server status to its CSS class. Unknown states use the neutral class. */
function statusClass(status) {
  if (status === "connected") return "mcp-status-connected";
  if (status === "error") return "mcp-status-error";
  return "mcp-status-neutral";
}

/** Build the panel component. State stays per-registration. */
function makePanel() {
  return function Panel() {
    var listState = react.useState(null);
    var list: ListView | null = listState[0];
    var setList = listState[1];

    var load = function () {
      console.debug("[mcp-servers] fetching server roster");
      fetchJson("/mcp-servers/api/servers").then(function (result) {
        if (result.error) {
          console.error("[mcp-servers] load failed " + result.error);
          setList(function (prev) {
            return { data: prev && prev.data ? prev.data : null, error: result.error };
          });
          return;
        }
        var servers = result.data && Array.isArray(result.data.servers) ? result.data.servers : [];
        console.info("[mcp-servers] servers loaded: " + servers.length);
        setList({ data: servers, error: null });
      });
    };

    react.useEffect(function () {
      console.debug("[mcp-servers] panel mounted");
      load();
    }, []);

    var refresh = function () {
      console.info("[mcp-servers] refresh clicked");
      load();
    };

    // Record one row's failure and clear its in-flight flag. Both failure
    // paths below share this, so they cannot drift apart.
    var failRow = function (rowName: string, message: string) {
      setList(function (prev) {
        var rowErrors: Record<string, string> = {};
        rowErrors[rowName] = message;
        var failed: ListView = {
          data: prev && prev.data ? prev.data : [],
          error: prev ? prev.error : null,
          authing: null,
          rowErrors: rowErrors,
        };
        return failed;
      });
    };

    // Start the OAuth flow for one server. Each row holds its own in-flight
    // flag, so only that row's button is disabled while its request runs.
    var authenticate = function (name) {
      console.info("[mcp-servers] authorize requested: " + name);
      setList(function (prev) {
        var next: ListView = {
          data: prev && prev.data ? prev.data : [],
          error: prev ? prev.error : null,
          authing: name,
          rowErrors: null,
        };
        return next;
      });
      postJson("/mcp-servers/api/servers/" + encodeURIComponent(name) + "/authorize").then(function (result) {
        if (result.error) {
          console.error("[mcp-servers] authorize failed for " + name + ": " + result.error);
          failRow(name, result.error);
          return;
        }
        // The host can answer with no error and no URL, when the reconnect
        // failed for a reason other than a missing login. Assigning an empty
        // string to location.href reloads the page and hides that cause.
        var target = result.data && result.data.authorizeUrl ? result.data.authorizeUrl : "";
        if (target === "") {
          console.error("[mcp-servers] no authorize URL returned for " + name);
          failRow(name, "The server did not return an authorization URL. Refresh to see its status.");
          return;
        }
        console.info("[mcp-servers] navigating to authorize URL for " + name);
        window.location.href = target;
      });
    };

    var body = null;
    if (list === null) {
      body = <div className="mcp-empty">Loading…</div>;
    } else if (list.error && (!list.data || list.data.length === 0)) {
      body = <div className="dsp-err">{list.error}</div>;
    } else if (!list.data || list.data.length === 0) {
      body = <div className="mcp-empty">No MCP servers</div>;
    } else {
      body = (
        <div className="mcp-root">
          {list.data.map(function (server) {
            var rowError = list.rowErrors && list.rowErrors[server.name];
            return (
              <div className="mcp-row" key={server.name}>
                <div className="mcp-row-main">
                  <span className="mcp-name">{server.name}</span>
                  <span className="mcp-type">{server.type}</span>
                  <span className={"mcp-status " + statusClass(server.status)}>{server.status}</span>
                  <span className="mcp-tools">
                    {server.toolCount}
                    {server.toolCount === 1 ? " tool" : " tools"}
                  </span>
                  {server.status === "needs-auth" ? (
                    <button
                      className="mcp-auth"
                      disabled={list.authing === server.name}
                      onClick={function () {
                        authenticate(server.name);
                      }}
                    >
                      Authenticate
                    </button>
                  ) : null}
                </div>
                {server.error ? <div className="mcp-row-error dsp-err">{server.error}</div> : null}
                {rowError ? <div className="mcp-row-error dsp-err">{rowError}</div> : null}
              </div>
            );
          })}
          {list.error ? <div className="dsp-err">{list.error}</div> : null}
        </div>
      );
    }

    return (
      <SettingsSection title={"MCP servers"} onRefresh={refresh} refreshLabel={"Refresh"}>
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
  }, "mcp-servers: styles");

  // The panel component is created once, so its identity stays stable across
  // slot re-renders and React keeps its state (data) between them.
  var Panel = makePanel();
  ctx.slots.inject("settings.section", function () {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 30, label: "MCP" },
      function () {
        return <Panel />;
      },
    );
  });
}

export { apply, inject, name };
