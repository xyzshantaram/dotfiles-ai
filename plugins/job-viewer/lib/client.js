window.__ModuleLoader__.load({
	id: "job-viewer",
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

// plugins/job-viewer/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var import_react = __toESM(require("react"), 1);
var import_dsh_client_ui_primitives = __toESM(require("@deepseek-ai/dsh-client-ui-primitives"), 1);

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

// css-text:/home/sid/repos/dotfiles-ai/plugins/shared/settings.css
var settings_default = "/* Shared settings-page vocabulary, normalized from the session-archive,\n * subscriptions, and profiles settings panels. One rule set in one file so\n * the three panels cannot drift. Radius and padding disagreements are\n * normalized to the session-archive (or median) value; the var(--dsw-...)\n * aliases the current rules use are kept as-is. */\n\n/* Page-level container:airy vertical rhythm, no own box. */\n.dsp-root {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  padding: 0;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Header row (title + refresh). */\n.dsp-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 0.75rem;\n}\n\n.dsp-title {\n  font-size: 1.5rem;\n  font-weight: 650;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Refresh:session-archive/profiles form (no box, color shift only).\n * subscriptions pads and rounds the hit area; normalized away. */\n.dsp-refresh {\n  cursor: pointer;\n  border: none;\n  background: none;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n}\n.dsp-refresh:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.dsp-err {\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n/* Large setting card. Padding is the median of 16/20/24 (session-archive\n * 20px); the radius is the two-agreeing 20px, not profiles' 12px. */\n.dsp-section {\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.875rem;\n  padding: 1.25rem;\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n/* Card title:subscriptions' 1.5rem/700 matches the page-title vocabulary;\n * profiles' smaller 16px/600 card title normalized up. */\n.dsp-section-title {\n  font-size: 1.125rem;\n  font-weight: 600;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Setting row:horizontal in session-archive and profiles (subscriptions\n * stacks its label and meta vertically; normalized to the horizontal form). */\n.dsp-row {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  min-width: 0;\n}\n\n/* Row label:only subscriptions defines one; ported verbatim, with its\n * emphasized <b> children. */\n.dsp-row-label {\n  display: flex;\n  align-items: baseline;\n  gap: 0.625rem;\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.dsp-row-label b {\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  font-size: 0.9375rem;\n}\n.dsp-row-label b:last-child {\n  margin-left: auto;\n}\n";

// css-text:/home/sid/repos/dotfiles-ai/plugins/job-viewer/src/client.module.css
var client_default = "/* job-viewer dropdown and output modal styles. Class names are kebab-case only. */\n\n.jv-root {\n  position: relative;\n  display: inline-block;\n}\n\n.jv-trigger {\n  align-items: center;\n  background: transparent;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n  display: flex;\n  font-size: 0.8125rem;\n  gap: 0.375rem;\n  line-height: 1.375rem;\n  padding: 0.125rem 0.5rem;\n}\n\n.jv-trigger:hover {\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n.jv-chevron {\n  flex: none;\n  color: var(--dsw-alias-label-caption);\n  transform: rotate(-90deg);\n  transition: transform 0.12s;\n}\n\n.jv-chevron-open {\n  transform: rotate(0deg);\n}\n\n.jv-menu {\n  /* The popover needs the MENU token, not the generic page background: the\n     generic one is translucent in this theme, so the conversation showed\n     through the dropdown. This is the token the shipped jobs dropdown used. */\n  background: var(--dsw-specific-menu);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 20%);\n  list-style: none;\n  margin: 0.25rem 0 0;\n  max-height: 60vh;\n  max-width: 26rem;\n  min-width: 18rem;\n  overflow-y: auto;\n  padding: 0.25rem;\n  position: absolute;\n  right: 0;\n  top: 100%;\n  z-index: 10;\n}\n\n.jv-row {\n  align-items: center;\n  border-radius: 0.375rem;\n  cursor: pointer;\n  display: flex;\n  font-size: 0.8125rem;\n  gap: 0.5rem;\n  line-height: 1.375rem;\n  padding: 0.25rem 0.5rem;\n}\n\n.jv-row:hover {\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n.jv-dot {\n  border-radius: 50%;\n  flex: none;\n  height: 0.5rem;\n  width: 0.5rem;\n  background: var(--dsw-alias-label-tertiary);\n}\n\n.jv-dot[data-live] {\n  background: var(--dsw-alias-state-success-primary);\n}\n\n.jv-kind {\n  background: var(--dsw-alias-bg-tertiary);\n  border-radius: 0.25rem;\n  color: var(--dsw-alias-label-secondary);\n  flex: none;\n  font-size: 0.6875rem;\n  line-height: 1.125rem;\n  padding: 0 0.375rem;\n}\n\n.jv-label {\n  color: var(--dsw-alias-label-primary);\n  flex: 1 1 auto;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.jv-status {\n  color: var(--dsw-alias-label-secondary);\n  flex: none;\n}\n\n.jv-duration {\n  color: var(--dsw-alias-label-tertiary);\n  flex: none;\n  font-variant-numeric: tabular-nums;\n  text-align: right;\n}\n\n.jv-empty {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.875rem;\n  font-style: italic;\n  line-height: 1.375rem;\n}\n\n.jv-meta {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n}\n\n.jv-autoscroll {\n  align-items: center;\n  color: var(--dsw-alias-label-secondary);\n  display: flex;\n  font-size: 0.8125rem;\n  gap: 0.375rem;\n  line-height: 1.375rem;\n}\n\n.jv-output-wrap {\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.875rem;\n  margin-top: 0.5rem;\n  max-height: 50vh;\n  overflow-y: auto;\n}\n\n.jv-output {\n  background: var(--dsw-alias-bg-tertiary);\n  box-sizing: border-box;\n  color: var(--dsw-alias-label-primary);\n  font-family: var(--ds-font-family-code);\n  font-size: 0.8125rem;\n  line-height: 1.5;\n  margin: 0;\n  min-width: 100%;\n  padding: 1rem;\n  white-space: pre;\n}\n\n.jv-note {\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.8125rem;\n  line-height: 1.375rem;\n  margin-top: 0.5rem;\n}\n";

// plugins/job-viewer/src/client.tsx
var ui = import_dsh_client_ui_primitives.default;
var PLUGIN_NAME = "job-viewer";
var STYLE_TAG_ID = "job-viewer/client.css";
var POLL_MS = 2500;
var CONFIRM_MS = 3e3;
function isLive(job) {
  return job.status === "running" || job.status === "stopping";
}
function formatDuration(elapsedMs) {
  var total = Math.max(0, Math.floor(elapsedMs / 1e3));
  var seconds = total % 60;
  var minutes = Math.floor(total / 60) % 60;
  var hours = Math.floor(total / 3600);
  if (hours > 0) return hours + "h " + minutes + "m";
  if (minutes > 0) return minutes + "m " + seconds + "s";
  return seconds + "s";
}
function ordered(jobs) {
  return [...jobs].sort(function(left, right) {
    var liveLeft = isLive(left);
    if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1;
    if (liveLeft) return left.startedAt - right.startedAt;
    var finished = (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt);
    return finished !== 0 ? finished : left.startedAt - right.startedAt;
  });
}
function makeJobViewerAction() {
  return function JobViewerAction(props) {
    var sessionId = props.sessionId;
    var useSessions = props.useSessions;
    var jobs = useSessions(function(state) {
      return state.jobsBySession[sessionId] || [];
    });
    var liveCount = jobs.filter(isLive).length;
    var menuOpenState = import_react.default.useState(false);
    var menuOpen = menuOpenState[0];
    var setMenuOpen = menuOpenState[1];
    var nowState = import_react.default.useState(function() {
      return Date.now();
    });
    var now = nowState[0];
    var setNow = nowState[1];
    var openJobState = import_react.default.useState(null);
    var openJobId = openJobState[0];
    var setOpenJobId = openJobState[1];
    var outState = import_react.default.useState(null);
    var out = outState[0];
    var setOut = outState[1];
    var statusState = import_react.default.useState(null);
    var status = statusState[0];
    var setStatus = statusState[1];
    var statusRef = import_react.default.useRef(null);
    var autoscrollState = import_react.default.useState(true);
    var autoscroll = autoscrollState[0];
    var setAutoscroll = autoscrollState[1];
    var killPhaseState = import_react.default.useState("idle");
    var killPhase = killPhaseState[0];
    var setKillPhase = killPhaseState[1];
    var killErrorState = import_react.default.useState(null);
    var killError = killErrorState[0];
    var setKillError = killErrorState[1];
    var outputWrapRef = import_react.default.useRef(null);
    import_react.default.useEffect(
      function() {
        if (!menuOpen || liveCount === 0) return;
        setNow(Date.now());
        var timer = setInterval(function() {
          setNow(Date.now());
        }, 1e3);
        return function() {
          clearInterval(timer);
        };
      },
      [menuOpen, liveCount]
    );
    var openJob = function(job) {
      setMenuOpen(false);
      statusRef.current = job.status;
      setStatus(job.status);
      setOut(null);
      setKillPhase("idle");
      setKillError(null);
      setOpenJobId(job.id);
    };
    var closeJob = function() {
      setOpenJobId(null);
      setOut(null);
      setKillPhase("idle");
      setKillError(null);
    };
    import_react.default.useEffect(
      function() {
        if (openJobId === null) return;
        var cancelled = false;
        var timer = null;
        var tick = function() {
          fetchJson("/job-viewer/output?job_id=" + encodeURIComponent(openJobId)).then(
            function(result) {
              if (cancelled) return;
              if (result.error) {
                setOut({ error: result.error, text: null, truncated: false });
              } else {
                var data = result.data;
                setOut({
                  error: null,
                  text: data && typeof data.text === "string" ? data.text : "",
                  truncated: !!(data && data.truncated === true)
                });
                if (data && data.job && data.job.status) {
                  statusRef.current = data.job.status;
                  setStatus(data.job.status);
                }
              }
              if (statusRef.current === "running" || statusRef.current === "stopping") {
                timer = setTimeout(tick, POLL_MS);
              }
            }
          );
        };
        tick();
        return function() {
          cancelled = true;
          if (timer !== null) clearTimeout(timer);
        };
      },
      [openJobId]
    );
    import_react.default.useEffect(
      function() {
        if (!autoscroll) return;
        var wrap = outputWrapRef.current;
        if (wrap !== null) wrap.scrollTop = wrap.scrollHeight;
      },
      [out && out.text, autoscroll]
    );
    import_react.default.useEffect(
      function() {
        if (killPhase !== "confirming") return;
        var timer = setTimeout(function() {
          setKillPhase("idle");
        }, CONFIRM_MS);
        return function() {
          clearTimeout(timer);
        };
      },
      [killPhase]
    );
    var onKillClick = function() {
      if (openJobId === null) return;
      if (killPhase === "idle") {
        setKillError(null);
        setKillPhase("confirming");
        return;
      }
      if (killPhase !== "confirming") return;
      setKillPhase("killing");
      var jobId = openJobId;
      postJson("/job-viewer/kill", { job_id: jobId }).then(function(result) {
        if (result.error || !result.data || result.data.ok !== true) {
          setKillError(result.error || "Kill request failed");
          setKillPhase("idle");
          return;
        }
        if (result.data.job && result.data.job.status) {
          statusRef.current = result.data.job.status;
          setStatus(result.data.job.status);
        }
        fetchJson("/job-viewer/output?job_id=" + encodeURIComponent(jobId)).then(
          function(fresh) {
            if (fresh.error) {
              setKillError(fresh.error);
              return;
            }
            var data = fresh.data;
            setOut({
              error: null,
              text: data && typeof data.text === "string" ? data.text : "",
              truncated: !!(data && data.truncated === true)
            });
            if (data && data.job && data.job.status) {
              statusRef.current = data.job.status;
              setStatus(data.job.status);
            }
          }
        );
      });
    };
    if (jobs.length === 0) return null;
    var sorted = ordered(jobs);
    var triggerLabel = liveCount > 0 ? liveCount + " running" : jobs.length + " background jobs";
    var rows = sorted.map(function(job) {
      return /* @__PURE__ */ import_react.default.createElement(
        "li",
        {
          key: job.id,
          className: "jv-row",
          onClick: function() {
            openJob(job);
          }
        },
        /* @__PURE__ */ import_react.default.createElement("span", { className: "jv-dot", "data-live": isLive(job) ? "" : void 0 }),
        /* @__PURE__ */ import_react.default.createElement("span", { className: "jv-kind" }, job.kind),
        /* @__PURE__ */ import_react.default.createElement("span", { className: "jv-label" }, job.label),
        /* @__PURE__ */ import_react.default.createElement("span", { className: "jv-status" }, job.status),
        /* @__PURE__ */ import_react.default.createElement("span", { className: "jv-duration" }, formatDuration(
          (isLive(job) ? now : job.finishedAt ?? job.startedAt) - job.startedAt
        ))
      );
    });
    var modal = null;
    if (openJobId !== null) {
      var known = jobs.find(function(job) {
        return job.id === openJobId;
      });
      var live = status === "running" || status === "stopping";
      var killLabel = killPhase === "killing" ? "Stopping\u2026" : killPhase === "confirming" ? "Really stop?" : "Stop job";
      var body = null;
      if (out === null) {
        body = /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-empty" }, "Loading\u2026");
      } else {
        body = /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-meta" }, "status: " + status), /* @__PURE__ */ import_react.default.createElement("label", { className: "jv-autoscroll" }, /* @__PURE__ */ import_react.default.createElement(
          "input",
          {
            type: "checkbox",
            checked: autoscroll,
            onChange: function(event) {
              setAutoscroll(event.target.checked);
            }
          }
        ), "Auto-scroll"), /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-output-wrap", ref: outputWrapRef }, /* @__PURE__ */ import_react.default.createElement("pre", { className: "jv-output" }, out.text)), out.truncated ? /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-note" }, "Earlier output was dropped (buffer full).") : null, out.error ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dsp-err" }, out.error) : null, killError ? /* @__PURE__ */ import_react.default.createElement("div", { className: "dsp-err" }, killError) : null);
      }
      modal = /* @__PURE__ */ import_react.default.createElement(
        ui.Modal,
        {
          open: true,
          onClose: closeJob,
          title: known ? known.label : openJobId,
          description: known ? known.kind + " \xB7 " + status : "job status: " + status,
          closeLabel: "Close",
          footer: /* @__PURE__ */ import_react.default.createElement(import_react.default.Fragment, null, /* @__PURE__ */ import_react.default.createElement(ui.Button, { variant: "outline", onClick: closeJob }, "Close"), live ? /* @__PURE__ */ import_react.default.createElement(
            ui.Button,
            {
              variant: "outline",
              disabled: killPhase === "killing",
              onClick: onKillClick
            },
            killLabel
          ) : null)
        },
        body
      );
    }
    return /* @__PURE__ */ import_react.default.createElement("div", { className: "jv-root" }, /* @__PURE__ */ import_react.default.createElement(
      "button",
      {
        className: "jv-trigger",
        onClick: function() {
          setMenuOpen(!menuOpen);
        }
      },
      triggerLabel,
      /* @__PURE__ */ import_react.default.createElement(
        ui.IconChevronDownOutline14,
        {
          className: menuOpen ? "jv-chevron jv-chevron-open" : "jv-chevron",
          "aria-hidden": true
        }
      )
    ), menuOpen ? /* @__PURE__ */ import_react.default.createElement("ul", { className: "jv-menu" }, rows) : null, modal);
  };
}
var name = PLUGIN_NAME;
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(function() {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settings_default, client_default));
  }, "job-viewer: styles");
  var JobViewerAction = makeJobViewerAction();
  ctx.slots.inject("conversation.session.header.actions", function() {
    return ctx.slots.register(
      { name: "conversation.session.header.actions", id: PLUGIN_NAME, order: 20 },
      JobViewerAction
    );
  });
}
		return module.exports;
	}
});
