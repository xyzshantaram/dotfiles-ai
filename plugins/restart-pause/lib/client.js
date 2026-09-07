window.__ModuleLoader__.load({
	id: "restart-pause",
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

// plugins/restart-pause/src/client.tsx
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
var HLJS_THEME_CSS = [
  ".hljs-doctag,.hljs-keyword,.hljs-meta .hljs-keyword,.hljs-template-tag,.hljs-template-variable,.hljs-type,.hljs-variable.language_{color:#ff7b72}",
  ".hljs-title,.hljs-title.class_,.hljs-title.class_.inherited__,.hljs-title.function_{color:#d2a8ff}",
  ".hljs-attr,.hljs-attribute,.hljs-literal,.hljs-meta,.hljs-number,.hljs-operator,.hljs-variable,.hljs-selector-attr,.hljs-selector-class,.hljs-selector-id{color:#79c0ff}",
  ".hljs-regexp,.hljs-string,.hljs-meta .hljs-string{color:#a5d6ff}",
  ".hljs-built_in,.hljs-symbol{color:#ffa657}",
  ".hljs-comment,.hljs-code,.hljs-formula{color:#8b949e}",
  ".hljs-name,.hljs-quote,.hljs-selector-tag,.hljs-selector-pseudo{color:#7ee787}",
  ".hljs-subst{color:#c9d1d9}",
  ".hljs-section{color:#1f6feb;font-weight:bold}",
  ".hljs-bullet{color:#f2cc60}",
  ".hljs-emphasis{color:#c9d1d9;font-style:italic}",
  ".hljs-strong{color:#c9d1d9;font-weight:bold}",
  ".hljs-addition{color:#aff5b4;background-color:#033a16}",
  ".hljs-deletion{color:#ffdcd7;background-color:#67060c}"
].join("");
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

// css-text:/home/sid/repos/dotfiles-ai/plugins/restart-pause/src/client.module.css
var client_default = ".rpRow {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  flex-wrap: wrap;\n  margin-bottom: 10px;\n}\n\n.rpNote {\n  opacity: 0.75;\n  font-size: 12px;\n  line-height: 1.5;\n  margin: 6px 0;\n}\n\n.rpSessions {\n  margin: 6px 0 10px;\n  padding-left: 18px;\n  font-size: 12px;\n  line-height: 1.6;\n}\n\n.rpCheck {\n  display: flex;\n  gap: 8px;\n  align-items: baseline;\n  font-size: 12px;\n  padding: 4px 0;\n  border-top: 1px solid var(--dsh-border, rgba(128, 128, 128, 0.25));\n}\n\n.rpCheckMark {\n  flex: none;\n  font-family: var(--dsh-font-mono, monospace);\n}\n\n.rpCheckBody {\n  min-width: 0;\n}\n\n.rpCheckCmd {\n  font-family: var(--dsh-font-mono, monospace);\n  word-break: break-all;\n}\n\n.rpCheckOut {\n  white-space: pre-wrap;\n  word-break: break-word;\n  opacity: 0.75;\n  margin-top: 2px;\n  max-height: 140px;\n  overflow: auto;\n}\n\n.rpFail {\n  color: var(--dsh-danger, #e06c75);\n}\n\n.rpVerdict {\n  margin-top: 10px;\n  font-size: 13px;\n  line-height: 1.5;\n}\n";

// plugins/restart-pause/src/reload-check.ts
function verdictFrom(probes, opts) {
  if (probes.length === 0) return { kind: "waiting", sawDown: false };
  const started = probes[0].at;
  let firstDownAt;
  let outages = 0;
  let wasDown = false;
  let upSince;
  for (const probe of probes) {
    if (!probe.ok) {
      if (!wasDown) {
        outages += 1;
        wasDown = true;
      }
      if (firstDownAt === void 0) firstDownAt = probe.at;
      upSince = void 0;
      if (outages >= 2) return { kind: "flapping", downCount: outages };
      continue;
    }
    wasDown = false;
    if (firstDownAt === void 0) continue;
    if (upSince === void 0) upSince = probe.at;
    if (probe.at - upSince >= opts.settleMs) {
      return { kind: "back", downMs: upSince - firstDownAt };
    }
  }
  const last = probes[probes.length - 1];
  const waitedMs = last.at - started;
  if (waitedMs >= opts.timeoutMs) {
    return { kind: "timeout", sawDown: firstDownAt !== void 0, waitedMs };
  }
  return { kind: "waiting", sawDown: firstDownAt !== void 0 };
}
function describeVerdict(verdict) {
  switch (verdict.kind) {
    case "back":
      return `dsh is back (down for ${Math.round(verdict.downMs / 1e3)}s).`;
    case "flapping":
      return `dsh came back and went down again (${verdict.downCount} outages). Your change may have broken startup -- check the service log.`;
    case "timeout":
      return verdict.sawDown ? `dsh went down and has not come back after ${Math.round(verdict.waitedMs / 1e3)}s. Check the service log.` : `No restart was observed after ${Math.round(verdict.waitedMs / 1e3)}s. The restart command may not have run.`;
    case "waiting":
      return verdict.sawDown ? "dsh is down, waiting for it to come back..." : "Waiting for dsh to go down...";
  }
}

// plugins/restart-pause/src/client.tsx
var PLUGIN_NAME = "restart-pause";
var STYLE_TAG_ID = "restart-pause-styles";
var PROBE_INTERVAL_MS = 1e3;
var PROBE_TIMEOUT_MS = 4e3;
var PROBE_WINDOW_MS = 18e4;
async function probeOnce(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(path, { cache: "no-store", signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
function makePanel() {
  return function DebugPanel() {
    const [status, setStatus] = import_react2.default.useState(null);
    const [checks, setChecks] = import_react2.default.useState(null);
    const [busy, setBusy] = import_react2.default.useState(false);
    const [message, setMessage] = import_react2.default.useState(null);
    const [verdict, setVerdict] = import_react2.default.useState(null);
    const probing = import_react2.default.useRef(false);
    const refresh = import_react2.default.useCallback(() => {
      fetchJson("/restart-pause/status").then((result) => {
        const r = result;
        if (r && r.ok !== false) setStatus(r);
      });
    }, []);
    import_react2.default.useEffect(() => {
      refresh();
    }, [refresh]);
    const watch = import_react2.default.useCallback(
      (healthPath, settleMs) => {
        if (probing.current) return;
        probing.current = true;
        const probes = [];
        const started = Date.now();
        const tick = () => {
          void probeOnce(healthPath).then((ok) => {
            probes.push({ ok, at: Date.now() });
            const v = verdictFrom(probes, { settleMs, timeoutMs: PROBE_WINDOW_MS });
            setVerdict(describeVerdict(v));
            if (v.kind === "back" || v.kind === "flapping" || v.kind === "timeout") {
              probing.current = false;
              if (v.kind === "back") refresh();
              return;
            }
            if (Date.now() - started > PROBE_WINDOW_MS) {
              probing.current = false;
              return;
            }
            setTimeout(tick, PROBE_INTERVAL_MS);
          });
        };
        tick();
      },
      [refresh]
    );
    const runChecks = import_react2.default.useCallback(() => {
      setBusy(true);
      setMessage(null);
      postJson("/restart-pause/checks", {}).then((result) => {
        const r = result;
        setChecks(r.results ?? []);
      }).finally(() => setBusy(false));
    }, []);
    const restart = import_react2.default.useCallback(
      (force) => {
        if (status === null) return;
        setBusy(true);
        setMessage(
          force ? "Restarting without checks..." : "Running checks, then waiting for sessions to finish..."
        );
        setVerdict(null);
        postJson("/restart-pause/restart", { force }).then((result) => {
          const r = result;
          if (r.ok) {
            setMessage("Restart requested. Waiting for dsh to go down...");
            watch(status.healthPath, status.settleMs);
            return;
          }
          if (r.reason === "checks") {
            setChecks(r.results ?? []);
            setMessage("Blocked: a check failed. Fix it, or use Restart anyway.");
            return;
          }
          if (r.reason === "busy") {
            const names = (r.stillRunning ?? []).join(", ");
            setMessage(
              `Still working after ${Math.round((r.waitedMs ?? 0) / 1e3)}s: ${names}. Nothing was restarted.`
            );
            return;
          }
          setMessage("Restart refused.");
        }).finally(() => {
          setBusy(false);
          refresh();
        });
      },
      [status, watch, refresh]
    );
    const toggleArm = import_react2.default.useCallback(() => {
      if (status === null) return;
      postJson("/restart-pause/arm", { armed: !status.armed }).then(() => refresh());
    }, [status, refresh]);
    if (status === null) {
      return /* @__PURE__ */ import_react2.default.createElement(SettingsSection, { title: "Debug" }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "rpNote" }, "Loading..."));
    }
    const idle = status.running === 0;
    return /* @__PURE__ */ import_react2.default.createElement(SettingsSection, { title: "Debug", onRefresh: refresh }, /* @__PURE__ */ import_react2.default.createElement("div", { className: "rpNote" }, "Restart dsh to apply composition or plugin changes. Running turns are allowed to finish first; nothing is cancelled."), /* @__PURE__ */ import_react2.default.createElement("div", { className: "rpNote" }, /* @__PURE__ */ import_react2.default.createElement("code", { className: "rpCheckCmd" }, status.command)), idle ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "rpNote" }, "No sessions are working.") : /* @__PURE__ */ import_react2.default.createElement("div", null, /* @__PURE__ */ import_react2.default.createElement("div", { className: "rpNote" }, status.running, " session", status.running === 1 ? "" : "s", " still working:"), /* @__PURE__ */ import_react2.default.createElement("ul", { className: "rpSessions" }, status.runningLabels.map((label) => /* @__PURE__ */ import_react2.default.createElement("li", { key: label }, label)))), /* @__PURE__ */ import_react2.default.createElement("div", { className: "rpRow" }, /* @__PURE__ */ import_react2.default.createElement("button", { disabled: busy, onClick: () => restart(false) }, "Restart dsh"), /* @__PURE__ */ import_react2.default.createElement("button", { disabled: busy, onClick: () => restart(true) }, "Restart anyway"), status.checks.length > 0 ? /* @__PURE__ */ import_react2.default.createElement("button", { disabled: busy, onClick: runChecks }, "Run checks") : null, /* @__PURE__ */ import_react2.default.createElement("label", null, /* @__PURE__ */ import_react2.default.createElement("input", { type: "checkbox", checked: status.armed, onChange: toggleArm }), " Restart when idle and checks pass")), status.armed ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "rpNote" }, "Armed. dsh will restart the next time nothing is working and every check passes.") : null, message === null ? null : /* @__PURE__ */ import_react2.default.createElement("div", { className: "rpVerdict" }, message), verdict === null ? null : /* @__PURE__ */ import_react2.default.createElement("div", { className: "rpVerdict" }, verdict), checks === null ? null : checks.map((check) => /* @__PURE__ */ import_react2.default.createElement("div", { className: "rpCheck", key: check.command }, /* @__PURE__ */ import_react2.default.createElement("span", { className: check.ok ? "rpCheckMark" : "rpCheckMark rpFail" }, check.ok ? "ok" : "!!"), /* @__PURE__ */ import_react2.default.createElement("span", { className: "rpCheckBody" }, /* @__PURE__ */ import_react2.default.createElement("span", { className: "rpCheckCmd" }, check.command), /* @__PURE__ */ import_react2.default.createElement("div", { className: "rpCheckOut" }, check.output)))), status.checks.length === 0 ? /* @__PURE__ */ import_react2.default.createElement("div", { className: "rpNote" }, "No preflight checks configured. Add commands to this plugin's `checks` list to block a restart while, for example, a worktree is dirty.") : null);
  };
}
var name = PLUGIN_NAME;
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(function() {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settings_default, client_default));
  }, "restart-pause: styles");
  var Panel = makePanel();
  ctx.slots.inject("settings.section", function() {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 40, label: "Debug" },
      function() {
        return /* @__PURE__ */ import_react2.default.createElement(Panel, null);
      }
    );
  });
}
		return module.exports;
	}
});
