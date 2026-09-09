window.__ModuleLoader__.load({
	id: "profiles-client",
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

// plugins/profiles-client/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);

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
function putJson(url, body) {
  return request("PUT", url, body);
}
function registerLocale(ctx, ns, en, zh) {
  return ctx.locale.register(ns, { en, zh });
}

// plugins/profile-routes.ts
function isRouteCandidate(value) {
  return typeof value === "object" && value !== null && typeof value.provider === "string" && value.provider.length > 0 && typeof value.model === "string" && value.model.length > 0;
}
function normalizeEntry(entry, chains, seen, ctx) {
  if (isRouteCandidate(entry)) return [entry];
  if (typeof entry === "string") {
    if (entry.startsWith("chain:")) {
      const name2 = entry.slice("chain:".length);
      if (chains?.[name2] === void 0) {
        ctx?.logger?.debug(`unknown chain reference: ${name2}`);
        return [];
      }
      const guard = new Set(seen ?? []);
      if (guard.has(name2)) {
        ctx?.logger?.debug(`circular chain reference: ${name2}`);
        return [];
      }
      guard.add(name2);
      return normalizeEntry(chains[name2], chains, guard, ctx);
    }
    const slash = entry.indexOf("/");
    if (slash > 0) {
      return [{ provider: entry.slice(0, slash), model: entry.slice(slash + 1) }];
    }
    if (chains?.[entry] !== void 0) {
      const guard = new Set(seen ?? []);
      if (guard.has(entry)) {
        ctx?.logger?.debug(`circular chain reference: ${entry}`);
        return [];
      }
      guard.add(entry);
      return normalizeEntry(chains[entry], chains, guard, ctx);
    }
    ctx?.logger?.debug(`unknown chain reference: ${entry}`);
    return [];
  }
  if (typeof entry === "object" && entry !== null) {
    if (Array.isArray(entry.routes)) {
      return entry.routes.filter(isRouteCandidate);
    }
    if (Array.isArray(entry)) {
      const out = [];
      for (const step of entry) {
        if (typeof step === "string") {
          if (step.startsWith("chain:")) {
            const name2 = step.slice("chain:".length);
            if (chains?.[name2] !== void 0) {
              const guard = new Set(seen ?? []);
              if (!guard.has(name2)) {
                guard.add(name2);
                out.push(...normalizeEntry(chains[name2], chains, guard, ctx));
              }
            }
          } else if (chains?.[step] !== void 0) {
            const guard = new Set(seen ?? []);
            if (!guard.has(step)) {
              guard.add(step);
              out.push(...normalizeEntry(chains[step], chains, guard, ctx));
            }
          } else if (step.indexOf("/") > 0) {
            const slash = step.indexOf("/");
            out.push({ provider: step.slice(0, slash), model: step.slice(slash + 1) });
          }
        } else {
          out.push(...normalizeEntry(step, chains, seen, ctx));
        }
      }
      return out;
    }
  }
  ctx?.logger?.debug("profile entry resolved to empty chain");
  return [];
}
function entryHead(entry, chains, ctx) {
  if (typeof entry === "object" && entry !== null) {
    const obj = entry;
    if ("orchestrator" in obj || "subagent" in obj) {
      return entryHead(obj.orchestrator, chains, ctx) ?? entryHead(obj.subagent, chains, ctx);
    }
  }
  const head = normalizeEntry(entry, chains, void 0, ctx)[0];
  if (head !== void 0) {
    ctx?.logger?.info(`route head: ${head.provider}/${head.model}`);
  } else {
    ctx?.logger?.debug("no route head resolved");
  }
  return head;
}

// css-text:/home/sid/repos/dotfiles-ai/plugins/shared/settings.css
var settings_default = "/* Shared settings-page vocabulary, normalized from the session-archive,\n * subscriptions, and profiles settings panels. One rule set in one file so\n * the three panels cannot drift. Radius and padding disagreements are\n * normalized to the session-archive (or median) value; the var(--dsw-...)\n * aliases the current rules use are kept as-is. */\n\n/* Page-level container:airy vertical rhythm, no own box. */\n.dsp-root {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  padding: 0;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Header row (title + refresh). */\n.dsp-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 0.75rem;\n}\n\n.dsp-title {\n  font-size: 1.5rem;\n  font-weight: 650;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Refresh:session-archive/profiles form (no box, color shift only).\n * subscriptions pads and rounds the hit area; normalized away. */\n.dsp-refresh {\n  cursor: pointer;\n  border: none;\n  background: none;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n}\n.dsp-refresh:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.dsp-err {\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n/* Large setting card. Padding is the median of 16/20/24 (session-archive\n * 20px); the radius is the two-agreeing 20px, not profiles' 12px. */\n.dsp-section {\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.875rem;\n  padding: 1.25rem;\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n/* Card title:subscriptions' 1.5rem/700 matches the page-title vocabulary;\n * profiles' smaller 16px/600 card title normalized up. */\n.dsp-section-title {\n  font-size: 1.125rem;\n  font-weight: 600;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Setting row:horizontal in session-archive and profiles (subscriptions\n * stacks its label and meta vertically; normalized to the horizontal form). */\n.dsp-row {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n  min-width: 0;\n}\n\n/* Row label:only subscriptions defines one; ported verbatim, with its\n * emphasized <b> children. */\n.dsp-row-label {\n  display: flex;\n  align-items: baseline;\n  gap: 0.625rem;\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.dsp-row-label b {\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  font-size: 0.9375rem;\n}\n.dsp-row-label b:last-child {\n  margin-left: auto;\n}\n";

// css-text:/home/sid/repos/dotfiles-ai/plugins/profiles-client/src/client.module.css
var client_default = ".profiles-client-root {\n  display: inline-block;\n  min-width: 0;\n  position: relative;\n}\n.profiles-client-trigger {\n  min-width: 0;\n  max-width: min(22.5rem, 45cqw);\n  height: 1.75rem;\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n  background: 0 0;\n  border: none;\n  border-radius: 0.75rem;\n  outline: none;\n  align-items: center;\n  gap: 0.3125rem;\n  padding: 0 0.4375rem;\n  font-size: 0.8125rem;\n  font-weight: 500;\n  line-height: 1.25rem;\n  display: flex;\n}\n.profiles-client-trigger:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.profiles-client-trigger:focus-visible {\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n.profiles-client-trigger:disabled {\n  color: var(--dsw-alias-label-dimmed);\n  cursor: default;\n}\n.profiles-client-badge {\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: stretch;\n  flex: 1;\n  min-width: 0;\n  height: 1.5rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.375rem;\n  overflow: hidden;\n}\n.profiles-client-badge-segment {\n  display: inline-flex;\n  align-items: center;\n  gap: 0.25rem;\n  padding: 0 0.375rem;\n  min-width: 0;\n  white-space: nowrap;\n}\n.profiles-client-badge-segment + .profiles-client-badge-segment {\n  border-left: 1px solid var(--dsw-alias-border-l2);\n}\n.profiles-client-badge-model {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n}\n.profiles-client-badge-segment svg {\n  flex: none;\n  width: 14px;\n  height: 14px;\n  color: var(--dsw-alias-label-caption);\n}\n.profiles-client-profile-name {\n  flex: none;\n  white-space: nowrap;\n  color: #fff;\n  font-size: 0.75rem;\n  font-weight: 700;\n  line-height: 1rem;\n  text-transform: uppercase;\n}\n.profiles-client-pill-dot {\n  flex: none;\n  width: 0.375rem;\n  height: 0.375rem;\n  border-radius: 50%;\n}\n.profiles-client-pill-dot.profiles-client-pill-dot-matched {\n  background: var(--dsw-alias-state-info-primary, #3b82f6);\n}\n.profiles-client-pill-dot.profiles-client-pill-dot-changed {\n  background: #f59e0b;\n}\n.profiles-client-model-name {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: #fff;\n  font-size: 0.75rem;\n  line-height: 1rem;\n}\n.profiles-client-model-provider {\n  flex: none;\n  min-width: 0;\n  max-width: 7rem;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  color: rgba(255, 255, 255, 0.75);\n  font-size: 0.6875rem;\n  line-height: 1rem;\n  /* Optical nudge: 11px glyphs center a hair high next to 12px model text. */\n  transform: translateY(1px);\n}\n.profiles-client-badge-failover {\n  cursor: pointer;\n}\n.profiles-client-failover-rung {\n  flex: none;\n  white-space: nowrap;\n  color: #fff;\n  font-size: 0.75rem;\n  font-weight: 500;\n  line-height: 1rem;\n}\n.profiles-client-chevron {\n  color: var(--dsw-alias-label-caption);\n  flex: none;\n  transform: rotate(0deg);\n  transition: transform 0.12s;\n}\n.profiles-client-chevron-open {\n  transform: rotate(180deg);\n}\n.profiles-client-menu {\n  z-index: 20;\n  border: 1px solid var(--dsw-alias-border-inverted);\n  background: var(--dsw-specific-menu);\n  width: max-content;\n  min-width: 13.75rem;\n  max-width: min(26.25rem, 100vw - 2rem);\n  max-height: min(25rem, 100vh - 6rem);\n  box-shadow: var(--dsw-shadow-lv3);\n  color: var(--dsw-alias-label-primary);\n  border-radius: 0.5rem;\n  flex-direction: column;\n  padding: 0.1875rem;\n  display: flex;\n  position: absolute;\n  bottom: calc(100% + 0.5rem);\n  left: 0;\n  right: 0;\n  width: max-content;\n  margin-left: auto;\n  margin-right: auto;\n  overflow-x: hidden;\n  overflow-y: auto;\n}\n.profiles-client-option {\n  box-sizing: border-box;\n  width: auto;\n  min-width: 100%;\n  min-height: 2.125rem;\n  color: inherit;\n  text-align: left;\n  cursor: pointer;\n  background: 0 0;\n  border: none;\n  border-radius: 0.5rem;\n  outline: none;\n  align-items: center;\n  gap: 0.5rem;\n  padding: 0.25rem 0.4375rem;\n  display: flex;\n}\n.profiles-client-option:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.profiles-client-option-copy {\n  flex-direction: column;\n  flex: 1;\n  min-width: 0;\n  display: flex;\n}\n.profiles-client-option-copy-model {\n  flex-direction: row;\n  align-items: baseline;\n  gap: 0.5rem;\n}\n.profiles-client-option-copy-model .profiles-client-option-name {\n  flex: 1;\n  min-width: 0;\n}\n.profiles-client-option-copy-model .profiles-client-option-detail {\n  flex: none;\n  flex-shrink: 0;\n}\n.profiles-client-option-name {\n  color: inherit;\n  flex: 1;\n  min-width: 0;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 0.8125rem;\n  font-weight: 500;\n  line-height: 1.25rem;\n  overflow: hidden;\n}\n.profiles-client-option-profile {\n  font-weight: 700;\n  text-transform: uppercase;\n}\n.profiles-client-option-model {\n  font-size: 0.75rem;\n  font-weight: 700;\n}\n.profiles-client-option-detail {\n  color: var(--dsw-alias-label-tertiary);\n  flex: none;\n  flex-shrink: 0;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 0.75rem;\n  line-height: 1rem;\n  overflow: hidden;\n}\n.profiles-client-check {\n  color: var(--dsw-alias-label-primary);\n  flex: 0 0 0.875rem;\n}\n.profiles-client-effort-row {\n  display: flex;\n  flex-direction: column;\n  align-items: stretch;\n  gap: 0.375rem;\n  box-sizing: border-box;\n  width: 100%;\n  min-width: 0;\n  padding: 0.25rem 0.4375rem;\n}\n.profiles-client-effort-title {\n  font-size: 0.75rem;\n  line-height: 1rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.profiles-client-error-row {\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n  min-width: 0;\n  padding: 0.25rem 0.4375rem;\n  font-size: 0.75rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.profiles-client-error-count {\n  flex: 1;\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.profiles-client-error-reset {\n  flex: none;\n  flex-shrink: 0;\n  cursor: pointer;\n  border: none;\n  background: none;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 0.75rem;\n  line-height: 1rem;\n}\n.profiles-client-error-reset:hover {\n  color: var(--dsw-alias-label-primary);\n}\n.profiles-client-effort {\n  box-sizing: border-box;\n  width: calc(100% - 1rem);\n  min-width: 0;\n  margin-left: 0.5rem;\n  height: 1.5rem;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  padding: 0 0.375rem;\n  font-size: 0.6875rem;\n  line-height: 1rem;\n}\n.profiles-client-effort-row .profiles-client-effort {\n  flex: 1;\n  width: auto;\n  margin-left: 0;\n}\n.profiles-client-effort-slider {\n  width: 100%;\n  min-width: 0;\n  height: 1.5rem;\n  margin: 0;\n  background: transparent;\n  cursor: pointer;\n  appearance: none;\n  -webkit-appearance: none;\n}\n.profiles-client-effort-slider::-webkit-slider-runnable-track {\n  height: 0.5rem;\n  background: linear-gradient(90deg, #0a5cff 0%, #ff8400 100%);\n  border-radius: 0.25rem;\n}\n.profiles-client-effort-slider::-webkit-slider-thumb {\n  width: 0.875rem;\n  height: 0.875rem;\n  margin-top: -0.1875rem;\n  background: #fff;\n  border: none;\n  border-radius: 50%;\n  appearance: none;\n  -webkit-appearance: none;\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);\n}\n.profiles-client-effort-slider::-moz-range-track {\n  height: 0.5rem;\n  background: linear-gradient(90deg, #0a5cff 0%, #ff8400 100%);\n  border-radius: 0.25rem;\n}\n.profiles-client-effort-slider::-moz-range-progress {\n  height: 0.5rem;\n  background: transparent;\n  border-radius: 0.25rem;\n}\n.profiles-client-effort-slider::-moz-range-thumb {\n  width: 0.875rem;\n  height: 0.875rem;\n  background: #fff;\n  border: none;\n  border-radius: 50%;\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);\n}\n.profiles-client-effort-slider-wrap {\n  position: relative;\n  width: 100%;\n}\n.profiles-client-effort-tick {\n  position: absolute;\n  top: calc(50% - 0.25rem);\n  transform: translate(-50%, -50%);\n  width: 2px;\n  height: 0.625rem;\n  background: #fff;\n  pointer-events: none;\n}\n.profiles-client-effort-labels {\n  position: relative;\n  width: 100%;\n  height: 1rem;\n}\n.profiles-client-effort-stop {\n  position: absolute;\n  top: 0;\n  transform: translateX(-50%);\n  text-transform: uppercase;\n  font-size: 0.625rem;\n  line-height: 1rem;\n  white-space: nowrap;\n  color: var(--dsw-alias-label-secondary);\n}\n.profiles-client-effort-stop-active {\n  color: var(--dsw-alias-label-primary);\n}\n.profiles-client-effort-chevron {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 1rem;\n  line-height: 1;\n}\n.profiles-client-effort-popover {\n  position: fixed;\n  z-index: 30;\n  box-sizing: border-box;\n  width: 15rem;\n  background: var(--dsw-specific-menu);\n  border: 1px solid var(--dsw-alias-border-inverted);\n  border-radius: 0.5rem;\n  box-shadow: var(--dsw-shadow-lv3);\n  padding: 0.5rem;\n  color: var(--dsw-alias-label-primary);\n}\n.profiles-client-search {\n  box-sizing: border-box;\n  width: 100%;\n  height: 2rem;\n  margin: 0.25rem 0 0.5rem;\n  padding: 0 0.625rem;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  outline: none;\n}\n.profiles-client-search::placeholder {\n  color: var(--dsw-alias-label-tertiary);\n}\n.profiles-client-search:focus-visible {\n  border-color: var(--dsw-alias-border-l3);\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n.profiles-client-strip {\n  color: var(--dsw-alias-label-tertiary);\n  padding: 0.625rem;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n}\n\n.pf-panel-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 0.75rem;\n}\n.pf-panel-active {\n  display: flex;\n  gap: 0.75rem;\n  flex-wrap: wrap;\n}\n.pf-panel-active-btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  font-size: 0.875rem;\n  line-height: 1.25rem;\n  padding: 0.3125rem 0.625rem;\n  min-height: 2.375rem;\n  cursor: pointer;\n}\n.pf-panel-active-btn-on {\n  color: var(--dsw-alias-label-primary);\n  border-color: var(--dsw-alias-border-l3);\n}\n.pf-panel-entry {\n  display: flex;\n  flex-direction: column;\n  gap: 0.625rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.625rem;\n  padding: 0.875rem;\n  background: var(--dsw-alias-bg-tertiary);\n}\n.pf-panel-entry-title {\n  font-size: 0.9375rem;\n  font-weight: 600;\n  margin: 0;\n  color: var(--dsw-alias-label-primary);\n}\n.pf-panel-chain {\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n}\n.pf-panel-chain-title {\n  font-size: 0.875rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-label-secondary);\n  margin: 0;\n}\n.pf-panel-row {\n  display: flex;\n  gap: 0.75rem;\n  align-items: center;\n  min-width: 0;\n}\n.pf-panel-input {\n  box-sizing: border-box;\n  flex: 1;\n  min-width: 0;\n  height: 2.5rem;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  padding: 0 0.5rem;\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n}\n.pf-panel-input:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -0.125rem;\n}\n.pf-panel-del {\n  flex: none;\n  cursor: pointer;\n  border: none;\n  background: none;\n  padding: 0 0.25rem;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 1rem;\n  line-height: 1.25rem;\n}\n/* Drag handle on each chain rung. Only the handle starts a drag, so the\n * row's selects and buttons keep working; touch-action lets pointer drags\n * begin on touch, and the focus ring marks the keyboard-reorder target. */\n.pf-panel-grip {\n  flex: none;\n  cursor: grab;\n  border: none;\n  background: none;\n  padding: 0 0.25rem;\n  color: var(--dsw-alias-label-tertiary);\n  font-size: 0.875rem;\n  line-height: 1.25rem;\n  touch-action: none;\n}\n.pf-panel-grip:active {\n  cursor: grabbing;\n}\n.pf-panel-grip:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -0.125rem;\n}\n/* A `chain:<name>` reference rung: visually distinct from provider/model\n * rungs, and reordering moves the reference itself, never its expansion. */\n.pf-panel-chainref {\n  border-left: 2px solid var(--dsw-alias-state-business-primary);\n  padding-left: 0.5rem;\n}\n.pf-panel-add {\n  align-self: flex-start;\n  color: var(--dsw-alias-label-secondary);\n  background: none;\n  border: 1px dashed var(--dsw-alias-border-l2);\n  border-radius: 0.4375rem;\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n  padding: 0.1875rem 0.6875rem;\n  cursor: pointer;\n}\n.pf-panel-add:hover {\n  color: var(--dsw-alias-label-primary);\n}\n.pf-panel-meta {\n  font-size: 0.875rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.pf-panel-ref {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border-radius: 0.4375rem;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  padding: 0.0625rem 0.5rem;\n}\n.pf-panel-actions {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n}\n.pf-panel-save {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 0.5rem;\n  font-size: 0.875rem;\n  line-height: 1.25rem;\n  padding: 0.3125rem 0.625rem;\n  min-height: 2.375rem;\n  cursor: pointer;\n}\n.pf-panel-save:disabled {\n  opacity: 0.5;\n  cursor: default;\n}\n.pf-panel-status {\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n}\n.pf-panel-ok {\n  color: var(--dsw-alias-state-success-primary);\n}\n.pf-panel-bad {\n  color: var(--dsw-alias-state-error-primary);\n}\n.pf-panel-select {\n  box-sizing: border-box;\n  flex: 1;\n  min-width: 0;\n  height: 2.5rem;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  padding: 0 0.5rem;\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n  cursor: pointer;\n}\n.pf-panel-select:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -0.125rem;\n}\n.pf-panel-effort {\n  box-sizing: border-box;\n  flex: 0 0 auto;\n  min-width: 0;\n  margin-left: 0.5rem;\n  height: 2.5rem;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  padding: 0 0.5rem;\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n  cursor: pointer;\n}\n.pf-panel-select option,\n.pf-panel-effort option {\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n}\n/* Dropdown group headings invert \u2014 black on white \u2014 so they never render\n   white-on-white against the dropdown surface in the dark theme. */\n.pf-panel-select optgroup,\n.pf-panel-effort optgroup {\n  color: #000;\n  background: #fff;\n  font-weight: 700;\n}\n.pf-panel-model-row {\n  display: flex;\n  flex-direction: column;\n  gap: 0.125rem;\n}\n.pf-panel-add-select {\n  align-self: flex-start;\n  border-style: dashed;\n}\n.profiles-client-menu .dsp-section-title {\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  font-weight: 700;\n  text-transform: uppercase;\n  color: var(--dsw-alias-label-tertiary);\n  margin: 0.25rem 0 0;\n  padding: 0.25rem 0.4375rem;\n}\n";

// plugins/profiles-client/src/client.tsx
var react = __toESM(require("react"), 1);

// plugins/profiles-client/node_modules/@dnd-kit/core/dist/core.esm.js
var import_react3 = __toESM(require("react"));
var import_react_dom = require("react-dom");

// plugins/profiles-client/node_modules/@dnd-kit/utilities/dist/utilities.esm.js
var import_react = require("react");
function useCombinedRefs() {
  for (var _len = arguments.length, refs = new Array(_len), _key = 0; _key < _len; _key++) {
    refs[_key] = arguments[_key];
  }
  return (0, import_react.useMemo)(
    () => (node) => {
      refs.forEach((ref) => ref(node));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    refs
  );
}
var canUseDOM = typeof window !== "undefined" && typeof window.document !== "undefined" && typeof window.document.createElement !== "undefined";
function isWindow(element) {
  const elementString = Object.prototype.toString.call(element);
  return elementString === "[object Window]" || // In Electron context the Window object serializes to [object global]
  elementString === "[object global]";
}
function isNode(node) {
  return "nodeType" in node;
}
function getWindow(target) {
  var _target$ownerDocument, _target$ownerDocument2;
  if (!target) {
    return window;
  }
  if (isWindow(target)) {
    return target;
  }
  if (!isNode(target)) {
    return window;
  }
  return (_target$ownerDocument = (_target$ownerDocument2 = target.ownerDocument) == null ? void 0 : _target$ownerDocument2.defaultView) != null ? _target$ownerDocument : window;
}
function isDocument(node) {
  const {
    Document
  } = getWindow(node);
  return node instanceof Document;
}
function isHTMLElement(node) {
  if (isWindow(node)) {
    return false;
  }
  return node instanceof getWindow(node).HTMLElement;
}
function isSVGElement(node) {
  return node instanceof getWindow(node).SVGElement;
}
function getOwnerDocument(target) {
  if (!target) {
    return document;
  }
  if (isWindow(target)) {
    return target.document;
  }
  if (!isNode(target)) {
    return document;
  }
  if (isDocument(target)) {
    return target;
  }
  if (isHTMLElement(target) || isSVGElement(target)) {
    return target.ownerDocument;
  }
  return document;
}
var useIsomorphicLayoutEffect = canUseDOM ? import_react.useLayoutEffect : import_react.useEffect;
function useEvent(handler) {
  const handlerRef = (0, import_react.useRef)(handler);
  useIsomorphicLayoutEffect(() => {
    handlerRef.current = handler;
  });
  return (0, import_react.useCallback)(function() {
    for (var _len = arguments.length, args = new Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }
    return handlerRef.current == null ? void 0 : handlerRef.current(...args);
  }, []);
}
function useInterval() {
  const intervalRef = (0, import_react.useRef)(null);
  const set = (0, import_react.useCallback)((listener, duration) => {
    intervalRef.current = setInterval(listener, duration);
  }, []);
  const clear = (0, import_react.useCallback)(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);
  return [set, clear];
}
function useLatestValue(value, dependencies) {
  if (dependencies === void 0) {
    dependencies = [value];
  }
  const valueRef = (0, import_react.useRef)(value);
  useIsomorphicLayoutEffect(() => {
    if (valueRef.current !== value) {
      valueRef.current = value;
    }
  }, dependencies);
  return valueRef;
}
function useLazyMemo(callback, dependencies) {
  const valueRef = (0, import_react.useRef)();
  return (0, import_react.useMemo)(
    () => {
      const newValue = callback(valueRef.current);
      valueRef.current = newValue;
      return newValue;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [...dependencies]
  );
}
function useNodeRef(onChange) {
  const onChangeHandler = useEvent(onChange);
  const node = (0, import_react.useRef)(null);
  const setNodeRef = (0, import_react.useCallback)(
    (element) => {
      if (element !== node.current) {
        onChangeHandler == null ? void 0 : onChangeHandler(element, node.current);
      }
      node.current = element;
    },
    //eslint-disable-next-line
    []
  );
  return [node, setNodeRef];
}
function usePrevious(value) {
  const ref = (0, import_react.useRef)();
  (0, import_react.useEffect)(() => {
    ref.current = value;
  }, [value]);
  return ref.current;
}
var ids = {};
function useUniqueId(prefix, value) {
  return (0, import_react.useMemo)(() => {
    if (value) {
      return value;
    }
    const id = ids[prefix] == null ? 0 : ids[prefix] + 1;
    ids[prefix] = id;
    return prefix + "-" + id;
  }, [prefix, value]);
}
function createAdjustmentFn(modifier) {
  return function(object) {
    for (var _len = arguments.length, adjustments = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
      adjustments[_key - 1] = arguments[_key];
    }
    return adjustments.reduce((accumulator, adjustment) => {
      const entries = Object.entries(adjustment);
      for (const [key, valueAdjustment] of entries) {
        const value = accumulator[key];
        if (value != null) {
          accumulator[key] = value + modifier * valueAdjustment;
        }
      }
      return accumulator;
    }, {
      ...object
    });
  };
}
var add = /* @__PURE__ */ createAdjustmentFn(1);
var subtract = /* @__PURE__ */ createAdjustmentFn(-1);
function hasViewportRelativeCoordinates(event) {
  return "clientX" in event && "clientY" in event;
}
function isKeyboardEvent(event) {
  if (!event) {
    return false;
  }
  const {
    KeyboardEvent
  } = getWindow(event.target);
  return KeyboardEvent && event instanceof KeyboardEvent;
}
function isTouchEvent(event) {
  if (!event) {
    return false;
  }
  const {
    TouchEvent
  } = getWindow(event.target);
  return TouchEvent && event instanceof TouchEvent;
}
function getEventCoordinates(event) {
  if (isTouchEvent(event)) {
    if (event.touches && event.touches.length) {
      const {
        clientX: x,
        clientY: y
      } = event.touches[0];
      return {
        x,
        y
      };
    } else if (event.changedTouches && event.changedTouches.length) {
      const {
        clientX: x,
        clientY: y
      } = event.changedTouches[0];
      return {
        x,
        y
      };
    }
  }
  if (hasViewportRelativeCoordinates(event)) {
    return {
      x: event.clientX,
      y: event.clientY
    };
  }
  return null;
}
var CSS2 = /* @__PURE__ */ Object.freeze({
  Translate: {
    toString(transform) {
      if (!transform) {
        return;
      }
      const {
        x,
        y
      } = transform;
      return "translate3d(" + (x ? Math.round(x) : 0) + "px, " + (y ? Math.round(y) : 0) + "px, 0)";
    }
  },
  Scale: {
    toString(transform) {
      if (!transform) {
        return;
      }
      const {
        scaleX,
        scaleY
      } = transform;
      return "scaleX(" + scaleX + ") scaleY(" + scaleY + ")";
    }
  },
  Transform: {
    toString(transform) {
      if (!transform) {
        return;
      }
      return [CSS2.Translate.toString(transform), CSS2.Scale.toString(transform)].join(" ");
    }
  },
  Transition: {
    toString(_ref) {
      let {
        property,
        duration,
        easing
      } = _ref;
      return property + " " + duration + "ms " + easing;
    }
  }
});
var SELECTOR = "a,frame,iframe,input:not([type=hidden]):not(:disabled),select:not(:disabled),textarea:not(:disabled),button:not(:disabled),*[tabindex]";
function findFirstFocusableNode(element) {
  if (element.matches(SELECTOR)) {
    return element;
  }
  return element.querySelector(SELECTOR);
}

// plugins/profiles-client/node_modules/@dnd-kit/accessibility/dist/accessibility.esm.js
var import_react2 = __toESM(require("react"));
var hiddenStyles = {
  display: "none"
};
function HiddenText(_ref) {
  let {
    id,
    value
  } = _ref;
  return import_react2.default.createElement("div", {
    id,
    style: hiddenStyles
  }, value);
}
function LiveRegion(_ref) {
  let {
    id,
    announcement,
    ariaLiveType = "assertive"
  } = _ref;
  const visuallyHidden = {
    position: "fixed",
    top: 0,
    left: 0,
    width: 1,
    height: 1,
    margin: -1,
    border: 0,
    padding: 0,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    clipPath: "inset(100%)",
    whiteSpace: "nowrap"
  };
  return import_react2.default.createElement("div", {
    id,
    style: visuallyHidden,
    role: "status",
    "aria-live": ariaLiveType,
    "aria-atomic": true
  }, announcement);
}
function useAnnouncement() {
  const [announcement, setAnnouncement] = (0, import_react2.useState)("");
  const announce = (0, import_react2.useCallback)((value) => {
    if (value != null) {
      setAnnouncement(value);
    }
  }, []);
  return {
    announce,
    announcement
  };
}

// plugins/profiles-client/node_modules/@dnd-kit/core/dist/core.esm.js
var DndMonitorContext = /* @__PURE__ */ (0, import_react3.createContext)(null);
function useDndMonitor(listener) {
  const registerListener = (0, import_react3.useContext)(DndMonitorContext);
  (0, import_react3.useEffect)(() => {
    if (!registerListener) {
      throw new Error("useDndMonitor must be used within a children of <DndContext>");
    }
    const unsubscribe = registerListener(listener);
    return unsubscribe;
  }, [listener, registerListener]);
}
function useDndMonitorProvider() {
  const [listeners] = (0, import_react3.useState)(() => /* @__PURE__ */ new Set());
  const registerListener = (0, import_react3.useCallback)((listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }, [listeners]);
  const dispatch = (0, import_react3.useCallback)((_ref) => {
    let {
      type,
      event
    } = _ref;
    listeners.forEach((listener) => {
      var _listener$type;
      return (_listener$type = listener[type]) == null ? void 0 : _listener$type.call(listener, event);
    });
  }, [listeners]);
  return [dispatch, registerListener];
}
var defaultScreenReaderInstructions = {
  draggable: "\n    To pick up a draggable item, press the space bar.\n    While dragging, use the arrow keys to move the item.\n    Press space again to drop the item in its new position, or press escape to cancel.\n  "
};
var defaultAnnouncements = {
  onDragStart(_ref) {
    let {
      active
    } = _ref;
    return "Picked up draggable item " + active.id + ".";
  },
  onDragOver(_ref2) {
    let {
      active,
      over
    } = _ref2;
    if (over) {
      return "Draggable item " + active.id + " was moved over droppable area " + over.id + ".";
    }
    return "Draggable item " + active.id + " is no longer over a droppable area.";
  },
  onDragEnd(_ref3) {
    let {
      active,
      over
    } = _ref3;
    if (over) {
      return "Draggable item " + active.id + " was dropped over droppable area " + over.id;
    }
    return "Draggable item " + active.id + " was dropped.";
  },
  onDragCancel(_ref4) {
    let {
      active
    } = _ref4;
    return "Dragging was cancelled. Draggable item " + active.id + " was dropped.";
  }
};
function Accessibility(_ref) {
  let {
    announcements = defaultAnnouncements,
    container,
    hiddenTextDescribedById,
    screenReaderInstructions = defaultScreenReaderInstructions
  } = _ref;
  const {
    announce,
    announcement
  } = useAnnouncement();
  const liveRegionId = useUniqueId("DndLiveRegion");
  const [mounted, setMounted] = (0, import_react3.useState)(false);
  (0, import_react3.useEffect)(() => {
    setMounted(true);
  }, []);
  useDndMonitor((0, import_react3.useMemo)(() => ({
    onDragStart(_ref2) {
      let {
        active
      } = _ref2;
      announce(announcements.onDragStart({
        active
      }));
    },
    onDragMove(_ref3) {
      let {
        active,
        over
      } = _ref3;
      if (announcements.onDragMove) {
        announce(announcements.onDragMove({
          active,
          over
        }));
      }
    },
    onDragOver(_ref4) {
      let {
        active,
        over
      } = _ref4;
      announce(announcements.onDragOver({
        active,
        over
      }));
    },
    onDragEnd(_ref5) {
      let {
        active,
        over
      } = _ref5;
      announce(announcements.onDragEnd({
        active,
        over
      }));
    },
    onDragCancel(_ref6) {
      let {
        active,
        over
      } = _ref6;
      announce(announcements.onDragCancel({
        active,
        over
      }));
    }
  }), [announce, announcements]));
  if (!mounted) {
    return null;
  }
  const markup = import_react3.default.createElement(import_react3.default.Fragment, null, import_react3.default.createElement(HiddenText, {
    id: hiddenTextDescribedById,
    value: screenReaderInstructions.draggable
  }), import_react3.default.createElement(LiveRegion, {
    id: liveRegionId,
    announcement
  }));
  return container ? (0, import_react_dom.createPortal)(markup, container) : markup;
}
var Action;
(function(Action2) {
  Action2["DragStart"] = "dragStart";
  Action2["DragMove"] = "dragMove";
  Action2["DragEnd"] = "dragEnd";
  Action2["DragCancel"] = "dragCancel";
  Action2["DragOver"] = "dragOver";
  Action2["RegisterDroppable"] = "registerDroppable";
  Action2["SetDroppableDisabled"] = "setDroppableDisabled";
  Action2["UnregisterDroppable"] = "unregisterDroppable";
})(Action || (Action = {}));
function noop() {
}
function useSensor(sensor, options) {
  return (0, import_react3.useMemo)(
    () => ({
      sensor,
      options: options != null ? options : {}
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sensor, options]
  );
}
function useSensors() {
  for (var _len = arguments.length, sensors = new Array(_len), _key = 0; _key < _len; _key++) {
    sensors[_key] = arguments[_key];
  }
  return (0, import_react3.useMemo)(
    () => [...sensors].filter((sensor) => sensor != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [...sensors]
  );
}
var defaultCoordinates = /* @__PURE__ */ Object.freeze({
  x: 0,
  y: 0
});
function distanceBetween(p1, p2) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}
function sortCollisionsAsc(_ref, _ref2) {
  let {
    data: {
      value: a
    }
  } = _ref;
  let {
    data: {
      value: b
    }
  } = _ref2;
  return a - b;
}
function sortCollisionsDesc(_ref3, _ref4) {
  let {
    data: {
      value: a
    }
  } = _ref3;
  let {
    data: {
      value: b
    }
  } = _ref4;
  return b - a;
}
function cornersOfRectangle(_ref5) {
  let {
    left,
    top,
    height,
    width
  } = _ref5;
  return [{
    x: left,
    y: top
  }, {
    x: left + width,
    y: top
  }, {
    x: left,
    y: top + height
  }, {
    x: left + width,
    y: top + height
  }];
}
function getFirstCollision(collisions, property) {
  if (!collisions || collisions.length === 0) {
    return null;
  }
  const [firstCollision] = collisions;
  return property ? firstCollision[property] : firstCollision;
}
function centerOfRectangle(rect, left, top) {
  if (left === void 0) {
    left = rect.left;
  }
  if (top === void 0) {
    top = rect.top;
  }
  return {
    x: left + rect.width * 0.5,
    y: top + rect.height * 0.5
  };
}
var closestCenter = (_ref) => {
  let {
    collisionRect,
    droppableRects,
    droppableContainers
  } = _ref;
  const centerRect = centerOfRectangle(collisionRect, collisionRect.left, collisionRect.top);
  const collisions = [];
  for (const droppableContainer of droppableContainers) {
    const {
      id
    } = droppableContainer;
    const rect = droppableRects.get(id);
    if (rect) {
      const distBetween = distanceBetween(centerOfRectangle(rect), centerRect);
      collisions.push({
        id,
        data: {
          droppableContainer,
          value: distBetween
        }
      });
    }
  }
  return collisions.sort(sortCollisionsAsc);
};
var closestCorners = (_ref) => {
  let {
    collisionRect,
    droppableRects,
    droppableContainers
  } = _ref;
  const corners = cornersOfRectangle(collisionRect);
  const collisions = [];
  for (const droppableContainer of droppableContainers) {
    const {
      id
    } = droppableContainer;
    const rect = droppableRects.get(id);
    if (rect) {
      const rectCorners = cornersOfRectangle(rect);
      const distances = corners.reduce((accumulator, corner, index) => {
        return accumulator + distanceBetween(rectCorners[index], corner);
      }, 0);
      const effectiveDistance = Number((distances / 4).toFixed(4));
      collisions.push({
        id,
        data: {
          droppableContainer,
          value: effectiveDistance
        }
      });
    }
  }
  return collisions.sort(sortCollisionsAsc);
};
function getIntersectionRatio(entry, target) {
  const top = Math.max(target.top, entry.top);
  const left = Math.max(target.left, entry.left);
  const right = Math.min(target.left + target.width, entry.left + entry.width);
  const bottom = Math.min(target.top + target.height, entry.top + entry.height);
  const width = right - left;
  const height = bottom - top;
  if (left < right && top < bottom) {
    const targetArea = target.width * target.height;
    const entryArea = entry.width * entry.height;
    const intersectionArea = width * height;
    const intersectionRatio = intersectionArea / (targetArea + entryArea - intersectionArea);
    return Number(intersectionRatio.toFixed(4));
  }
  return 0;
}
var rectIntersection = (_ref) => {
  let {
    collisionRect,
    droppableRects,
    droppableContainers
  } = _ref;
  const collisions = [];
  for (const droppableContainer of droppableContainers) {
    const {
      id
    } = droppableContainer;
    const rect = droppableRects.get(id);
    if (rect) {
      const intersectionRatio = getIntersectionRatio(rect, collisionRect);
      if (intersectionRatio > 0) {
        collisions.push({
          id,
          data: {
            droppableContainer,
            value: intersectionRatio
          }
        });
      }
    }
  }
  return collisions.sort(sortCollisionsDesc);
};
function adjustScale(transform, rect1, rect2) {
  return {
    ...transform,
    scaleX: rect1 && rect2 ? rect1.width / rect2.width : 1,
    scaleY: rect1 && rect2 ? rect1.height / rect2.height : 1
  };
}
function getRectDelta(rect1, rect2) {
  return rect1 && rect2 ? {
    x: rect1.left - rect2.left,
    y: rect1.top - rect2.top
  } : defaultCoordinates;
}
function createRectAdjustmentFn(modifier) {
  return function adjustClientRect(rect) {
    for (var _len = arguments.length, adjustments = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
      adjustments[_key - 1] = arguments[_key];
    }
    return adjustments.reduce((acc, adjustment) => ({
      ...acc,
      top: acc.top + modifier * adjustment.y,
      bottom: acc.bottom + modifier * adjustment.y,
      left: acc.left + modifier * adjustment.x,
      right: acc.right + modifier * adjustment.x
    }), {
      ...rect
    });
  };
}
var getAdjustedRect = /* @__PURE__ */ createRectAdjustmentFn(1);
function parseTransform(transform) {
  if (transform.startsWith("matrix3d(")) {
    const transformArray = transform.slice(9, -1).split(/, /);
    return {
      x: +transformArray[12],
      y: +transformArray[13],
      scaleX: +transformArray[0],
      scaleY: +transformArray[5]
    };
  } else if (transform.startsWith("matrix(")) {
    const transformArray = transform.slice(7, -1).split(/, /);
    return {
      x: +transformArray[4],
      y: +transformArray[5],
      scaleX: +transformArray[0],
      scaleY: +transformArray[3]
    };
  }
  return null;
}
function inverseTransform(rect, transform, transformOrigin) {
  const parsedTransform = parseTransform(transform);
  if (!parsedTransform) {
    return rect;
  }
  const {
    scaleX,
    scaleY,
    x: translateX,
    y: translateY
  } = parsedTransform;
  const x = rect.left - translateX - (1 - scaleX) * parseFloat(transformOrigin);
  const y = rect.top - translateY - (1 - scaleY) * parseFloat(transformOrigin.slice(transformOrigin.indexOf(" ") + 1));
  const w = scaleX ? rect.width / scaleX : rect.width;
  const h = scaleY ? rect.height / scaleY : rect.height;
  return {
    width: w,
    height: h,
    top: y,
    right: x + w,
    bottom: y + h,
    left: x
  };
}
var defaultOptions = {
  ignoreTransform: false
};
function getClientRect(element, options) {
  if (options === void 0) {
    options = defaultOptions;
  }
  let rect = element.getBoundingClientRect();
  if (options.ignoreTransform) {
    const {
      transform,
      transformOrigin
    } = getWindow(element).getComputedStyle(element);
    if (transform) {
      rect = inverseTransform(rect, transform, transformOrigin);
    }
  }
  const {
    top,
    left,
    width,
    height,
    bottom,
    right
  } = rect;
  return {
    top,
    left,
    width,
    height,
    bottom,
    right
  };
}
function getTransformAgnosticClientRect(element) {
  return getClientRect(element, {
    ignoreTransform: true
  });
}
function getWindowClientRect(element) {
  const width = element.innerWidth;
  const height = element.innerHeight;
  return {
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height
  };
}
function isFixed(node, computedStyle) {
  if (computedStyle === void 0) {
    computedStyle = getWindow(node).getComputedStyle(node);
  }
  return computedStyle.position === "fixed";
}
function isScrollable(element, computedStyle) {
  if (computedStyle === void 0) {
    computedStyle = getWindow(element).getComputedStyle(element);
  }
  const overflowRegex = /(auto|scroll|overlay)/;
  const properties2 = ["overflow", "overflowX", "overflowY"];
  return properties2.some((property) => {
    const value = computedStyle[property];
    return typeof value === "string" ? overflowRegex.test(value) : false;
  });
}
function getScrollableAncestors(element, limit) {
  const scrollParents = [];
  function findScrollableAncestors(node) {
    if (limit != null && scrollParents.length >= limit) {
      return scrollParents;
    }
    if (!node) {
      return scrollParents;
    }
    if (isDocument(node) && node.scrollingElement != null && !scrollParents.includes(node.scrollingElement)) {
      scrollParents.push(node.scrollingElement);
      return scrollParents;
    }
    if (!isHTMLElement(node) || isSVGElement(node)) {
      return scrollParents;
    }
    if (scrollParents.includes(node)) {
      return scrollParents;
    }
    const computedStyle = getWindow(element).getComputedStyle(node);
    if (node !== element) {
      if (isScrollable(node, computedStyle)) {
        scrollParents.push(node);
      }
    }
    if (isFixed(node, computedStyle)) {
      return scrollParents;
    }
    return findScrollableAncestors(node.parentNode);
  }
  if (!element) {
    return scrollParents;
  }
  return findScrollableAncestors(element);
}
function getFirstScrollableAncestor(node) {
  const [firstScrollableAncestor] = getScrollableAncestors(node, 1);
  return firstScrollableAncestor != null ? firstScrollableAncestor : null;
}
function getScrollableElement(element) {
  if (!canUseDOM || !element) {
    return null;
  }
  if (isWindow(element)) {
    return element;
  }
  if (!isNode(element)) {
    return null;
  }
  if (isDocument(element) || element === getOwnerDocument(element).scrollingElement) {
    return window;
  }
  if (isHTMLElement(element)) {
    return element;
  }
  return null;
}
function getScrollXCoordinate(element) {
  if (isWindow(element)) {
    return element.scrollX;
  }
  return element.scrollLeft;
}
function getScrollYCoordinate(element) {
  if (isWindow(element)) {
    return element.scrollY;
  }
  return element.scrollTop;
}
function getScrollCoordinates(element) {
  return {
    x: getScrollXCoordinate(element),
    y: getScrollYCoordinate(element)
  };
}
var Direction;
(function(Direction2) {
  Direction2[Direction2["Forward"] = 1] = "Forward";
  Direction2[Direction2["Backward"] = -1] = "Backward";
})(Direction || (Direction = {}));
function isDocumentScrollingElement(element) {
  if (!canUseDOM || !element) {
    return false;
  }
  return element === document.scrollingElement;
}
function getScrollPosition(scrollingContainer) {
  const minScroll = {
    x: 0,
    y: 0
  };
  const dimensions = isDocumentScrollingElement(scrollingContainer) ? {
    height: window.innerHeight,
    width: window.innerWidth
  } : {
    height: scrollingContainer.clientHeight,
    width: scrollingContainer.clientWidth
  };
  const maxScroll = {
    x: scrollingContainer.scrollWidth - dimensions.width,
    y: scrollingContainer.scrollHeight - dimensions.height
  };
  const isTop = scrollingContainer.scrollTop <= minScroll.y;
  const isLeft = scrollingContainer.scrollLeft <= minScroll.x;
  const isBottom = scrollingContainer.scrollTop >= maxScroll.y;
  const isRight = scrollingContainer.scrollLeft >= maxScroll.x;
  return {
    isTop,
    isLeft,
    isBottom,
    isRight,
    maxScroll,
    minScroll
  };
}
var defaultThreshold = {
  x: 0.2,
  y: 0.2
};
function getScrollDirectionAndSpeed(scrollContainer, scrollContainerRect, _ref, acceleration, thresholdPercentage) {
  let {
    top,
    left,
    right,
    bottom
  } = _ref;
  if (acceleration === void 0) {
    acceleration = 10;
  }
  if (thresholdPercentage === void 0) {
    thresholdPercentage = defaultThreshold;
  }
  const {
    isTop,
    isBottom,
    isLeft,
    isRight
  } = getScrollPosition(scrollContainer);
  const direction = {
    x: 0,
    y: 0
  };
  const speed = {
    x: 0,
    y: 0
  };
  const threshold = {
    height: scrollContainerRect.height * thresholdPercentage.y,
    width: scrollContainerRect.width * thresholdPercentage.x
  };
  if (!isTop && top <= scrollContainerRect.top + threshold.height) {
    direction.y = Direction.Backward;
    speed.y = acceleration * Math.abs((scrollContainerRect.top + threshold.height - top) / threshold.height);
  } else if (!isBottom && bottom >= scrollContainerRect.bottom - threshold.height) {
    direction.y = Direction.Forward;
    speed.y = acceleration * Math.abs((scrollContainerRect.bottom - threshold.height - bottom) / threshold.height);
  }
  if (!isRight && right >= scrollContainerRect.right - threshold.width) {
    direction.x = Direction.Forward;
    speed.x = acceleration * Math.abs((scrollContainerRect.right - threshold.width - right) / threshold.width);
  } else if (!isLeft && left <= scrollContainerRect.left + threshold.width) {
    direction.x = Direction.Backward;
    speed.x = acceleration * Math.abs((scrollContainerRect.left + threshold.width - left) / threshold.width);
  }
  return {
    direction,
    speed
  };
}
function getScrollElementRect(element) {
  if (element === document.scrollingElement) {
    const {
      innerWidth,
      innerHeight
    } = window;
    return {
      top: 0,
      left: 0,
      right: innerWidth,
      bottom: innerHeight,
      width: innerWidth,
      height: innerHeight
    };
  }
  const {
    top,
    left,
    right,
    bottom
  } = element.getBoundingClientRect();
  return {
    top,
    left,
    right,
    bottom,
    width: element.clientWidth,
    height: element.clientHeight
  };
}
function getScrollOffsets(scrollableAncestors) {
  return scrollableAncestors.reduce((acc, node) => {
    return add(acc, getScrollCoordinates(node));
  }, defaultCoordinates);
}
function getScrollXOffset(scrollableAncestors) {
  return scrollableAncestors.reduce((acc, node) => {
    return acc + getScrollXCoordinate(node);
  }, 0);
}
function getScrollYOffset(scrollableAncestors) {
  return scrollableAncestors.reduce((acc, node) => {
    return acc + getScrollYCoordinate(node);
  }, 0);
}
function scrollIntoViewIfNeeded(element, measure) {
  if (measure === void 0) {
    measure = getClientRect;
  }
  if (!element) {
    return;
  }
  const {
    top,
    left,
    bottom,
    right
  } = measure(element);
  const firstScrollableAncestor = getFirstScrollableAncestor(element);
  if (!firstScrollableAncestor) {
    return;
  }
  if (bottom <= 0 || right <= 0 || top >= window.innerHeight || left >= window.innerWidth) {
    element.scrollIntoView({
      block: "center",
      inline: "center"
    });
  }
}
var properties = [["x", ["left", "right"], getScrollXOffset], ["y", ["top", "bottom"], getScrollYOffset]];
var Rect = class {
  constructor(rect, element) {
    this.rect = void 0;
    this.width = void 0;
    this.height = void 0;
    this.top = void 0;
    this.bottom = void 0;
    this.right = void 0;
    this.left = void 0;
    const scrollableAncestors = getScrollableAncestors(element);
    const scrollOffsets = getScrollOffsets(scrollableAncestors);
    this.rect = {
      ...rect
    };
    this.width = rect.width;
    this.height = rect.height;
    for (const [axis, keys, getScrollOffset] of properties) {
      for (const key of keys) {
        Object.defineProperty(this, key, {
          get: () => {
            const currentOffsets = getScrollOffset(scrollableAncestors);
            const scrollOffsetsDeltla = scrollOffsets[axis] - currentOffsets;
            return this.rect[key] + scrollOffsetsDeltla;
          },
          enumerable: true
        });
      }
    }
    Object.defineProperty(this, "rect", {
      enumerable: false
    });
  }
};
var Listeners = class {
  constructor(target) {
    this.target = void 0;
    this.listeners = [];
    this.removeAll = () => {
      this.listeners.forEach((listener) => {
        var _this$target;
        return (_this$target = this.target) == null ? void 0 : _this$target.removeEventListener(...listener);
      });
    };
    this.target = target;
  }
  add(eventName, handler, options) {
    var _this$target2;
    (_this$target2 = this.target) == null ? void 0 : _this$target2.addEventListener(eventName, handler, options);
    this.listeners.push([eventName, handler, options]);
  }
};
function getEventListenerTarget(target) {
  const {
    EventTarget
  } = getWindow(target);
  return target instanceof EventTarget ? target : getOwnerDocument(target);
}
function hasExceededDistance(delta, measurement) {
  const dx = Math.abs(delta.x);
  const dy = Math.abs(delta.y);
  if (typeof measurement === "number") {
    return Math.sqrt(dx ** 2 + dy ** 2) > measurement;
  }
  if ("x" in measurement && "y" in measurement) {
    return dx > measurement.x && dy > measurement.y;
  }
  if ("x" in measurement) {
    return dx > measurement.x;
  }
  if ("y" in measurement) {
    return dy > measurement.y;
  }
  return false;
}
var EventName;
(function(EventName2) {
  EventName2["Click"] = "click";
  EventName2["DragStart"] = "dragstart";
  EventName2["Keydown"] = "keydown";
  EventName2["ContextMenu"] = "contextmenu";
  EventName2["Resize"] = "resize";
  EventName2["SelectionChange"] = "selectionchange";
  EventName2["VisibilityChange"] = "visibilitychange";
})(EventName || (EventName = {}));
function preventDefault(event) {
  event.preventDefault();
}
function stopPropagation(event) {
  event.stopPropagation();
}
var KeyboardCode;
(function(KeyboardCode2) {
  KeyboardCode2["Space"] = "Space";
  KeyboardCode2["Down"] = "ArrowDown";
  KeyboardCode2["Right"] = "ArrowRight";
  KeyboardCode2["Left"] = "ArrowLeft";
  KeyboardCode2["Up"] = "ArrowUp";
  KeyboardCode2["Esc"] = "Escape";
  KeyboardCode2["Enter"] = "Enter";
  KeyboardCode2["Tab"] = "Tab";
})(KeyboardCode || (KeyboardCode = {}));
var defaultKeyboardCodes = {
  start: [KeyboardCode.Space, KeyboardCode.Enter],
  cancel: [KeyboardCode.Esc],
  end: [KeyboardCode.Space, KeyboardCode.Enter, KeyboardCode.Tab]
};
var defaultKeyboardCoordinateGetter = (event, _ref) => {
  let {
    currentCoordinates
  } = _ref;
  switch (event.code) {
    case KeyboardCode.Right:
      return {
        ...currentCoordinates,
        x: currentCoordinates.x + 25
      };
    case KeyboardCode.Left:
      return {
        ...currentCoordinates,
        x: currentCoordinates.x - 25
      };
    case KeyboardCode.Down:
      return {
        ...currentCoordinates,
        y: currentCoordinates.y + 25
      };
    case KeyboardCode.Up:
      return {
        ...currentCoordinates,
        y: currentCoordinates.y - 25
      };
  }
  return void 0;
};
var KeyboardSensor = class {
  constructor(props) {
    this.props = void 0;
    this.autoScrollEnabled = false;
    this.referenceCoordinates = void 0;
    this.listeners = void 0;
    this.windowListeners = void 0;
    this.props = props;
    const {
      event: {
        target
      }
    } = props;
    this.props = props;
    this.listeners = new Listeners(getOwnerDocument(target));
    this.windowListeners = new Listeners(getWindow(target));
    this.handleKeyDown = this.handleKeyDown.bind(this);
    this.handleCancel = this.handleCancel.bind(this);
    this.attach();
  }
  attach() {
    this.handleStart();
    this.windowListeners.add(EventName.Resize, this.handleCancel);
    this.windowListeners.add(EventName.VisibilityChange, this.handleCancel);
    setTimeout(() => this.listeners.add(EventName.Keydown, this.handleKeyDown));
  }
  handleStart() {
    const {
      activeNode,
      onStart
    } = this.props;
    const node = activeNode.node.current;
    if (node) {
      scrollIntoViewIfNeeded(node);
    }
    onStart(defaultCoordinates);
  }
  handleKeyDown(event) {
    if (isKeyboardEvent(event)) {
      const {
        active,
        context,
        options
      } = this.props;
      const {
        keyboardCodes = defaultKeyboardCodes,
        coordinateGetter = defaultKeyboardCoordinateGetter,
        scrollBehavior = "smooth"
      } = options;
      const {
        code
      } = event;
      if (keyboardCodes.end.includes(code)) {
        this.handleEnd(event);
        return;
      }
      if (keyboardCodes.cancel.includes(code)) {
        this.handleCancel(event);
        return;
      }
      const {
        collisionRect
      } = context.current;
      const currentCoordinates = collisionRect ? {
        x: collisionRect.left,
        y: collisionRect.top
      } : defaultCoordinates;
      if (!this.referenceCoordinates) {
        this.referenceCoordinates = currentCoordinates;
      }
      const newCoordinates = coordinateGetter(event, {
        active,
        context: context.current,
        currentCoordinates
      });
      if (newCoordinates) {
        const coordinatesDelta = subtract(newCoordinates, currentCoordinates);
        const scrollDelta = {
          x: 0,
          y: 0
        };
        const {
          scrollableAncestors
        } = context.current;
        for (const scrollContainer of scrollableAncestors) {
          const direction = event.code;
          const {
            isTop,
            isRight,
            isLeft,
            isBottom,
            maxScroll,
            minScroll
          } = getScrollPosition(scrollContainer);
          const scrollElementRect = getScrollElementRect(scrollContainer);
          const clampedCoordinates = {
            x: Math.min(direction === KeyboardCode.Right ? scrollElementRect.right - scrollElementRect.width / 2 : scrollElementRect.right, Math.max(direction === KeyboardCode.Right ? scrollElementRect.left : scrollElementRect.left + scrollElementRect.width / 2, newCoordinates.x)),
            y: Math.min(direction === KeyboardCode.Down ? scrollElementRect.bottom - scrollElementRect.height / 2 : scrollElementRect.bottom, Math.max(direction === KeyboardCode.Down ? scrollElementRect.top : scrollElementRect.top + scrollElementRect.height / 2, newCoordinates.y))
          };
          const canScrollX = direction === KeyboardCode.Right && !isRight || direction === KeyboardCode.Left && !isLeft;
          const canScrollY = direction === KeyboardCode.Down && !isBottom || direction === KeyboardCode.Up && !isTop;
          if (canScrollX && clampedCoordinates.x !== newCoordinates.x) {
            const newScrollCoordinates = scrollContainer.scrollLeft + coordinatesDelta.x;
            const canScrollToNewCoordinates = direction === KeyboardCode.Right && newScrollCoordinates <= maxScroll.x || direction === KeyboardCode.Left && newScrollCoordinates >= minScroll.x;
            if (canScrollToNewCoordinates && !coordinatesDelta.y) {
              scrollContainer.scrollTo({
                left: newScrollCoordinates,
                behavior: scrollBehavior
              });
              return;
            }
            if (canScrollToNewCoordinates) {
              scrollDelta.x = scrollContainer.scrollLeft - newScrollCoordinates;
            } else {
              scrollDelta.x = direction === KeyboardCode.Right ? scrollContainer.scrollLeft - maxScroll.x : scrollContainer.scrollLeft - minScroll.x;
            }
            if (scrollDelta.x) {
              scrollContainer.scrollBy({
                left: -scrollDelta.x,
                behavior: scrollBehavior
              });
            }
            break;
          } else if (canScrollY && clampedCoordinates.y !== newCoordinates.y) {
            const newScrollCoordinates = scrollContainer.scrollTop + coordinatesDelta.y;
            const canScrollToNewCoordinates = direction === KeyboardCode.Down && newScrollCoordinates <= maxScroll.y || direction === KeyboardCode.Up && newScrollCoordinates >= minScroll.y;
            if (canScrollToNewCoordinates && !coordinatesDelta.x) {
              scrollContainer.scrollTo({
                top: newScrollCoordinates,
                behavior: scrollBehavior
              });
              return;
            }
            if (canScrollToNewCoordinates) {
              scrollDelta.y = scrollContainer.scrollTop - newScrollCoordinates;
            } else {
              scrollDelta.y = direction === KeyboardCode.Down ? scrollContainer.scrollTop - maxScroll.y : scrollContainer.scrollTop - minScroll.y;
            }
            if (scrollDelta.y) {
              scrollContainer.scrollBy({
                top: -scrollDelta.y,
                behavior: scrollBehavior
              });
            }
            break;
          }
        }
        this.handleMove(event, add(subtract(newCoordinates, this.referenceCoordinates), scrollDelta));
      }
    }
  }
  handleMove(event, coordinates) {
    const {
      onMove
    } = this.props;
    event.preventDefault();
    onMove(coordinates);
  }
  handleEnd(event) {
    const {
      onEnd
    } = this.props;
    event.preventDefault();
    this.detach();
    onEnd();
  }
  handleCancel(event) {
    const {
      onCancel
    } = this.props;
    event.preventDefault();
    this.detach();
    onCancel();
  }
  detach() {
    this.listeners.removeAll();
    this.windowListeners.removeAll();
  }
};
KeyboardSensor.activators = [{
  eventName: "onKeyDown",
  handler: (event, _ref, _ref2) => {
    let {
      keyboardCodes = defaultKeyboardCodes,
      onActivation
    } = _ref;
    let {
      active
    } = _ref2;
    const {
      code
    } = event.nativeEvent;
    if (keyboardCodes.start.includes(code)) {
      const activator = active.activatorNode.current;
      if (activator && event.target !== activator) {
        return false;
      }
      event.preventDefault();
      onActivation == null ? void 0 : onActivation({
        event: event.nativeEvent
      });
      return true;
    }
    return false;
  }
}];
function isDistanceConstraint(constraint) {
  return Boolean(constraint && "distance" in constraint);
}
function isDelayConstraint(constraint) {
  return Boolean(constraint && "delay" in constraint);
}
var AbstractPointerSensor = class {
  constructor(props, events2, listenerTarget) {
    var _getEventCoordinates;
    if (listenerTarget === void 0) {
      listenerTarget = getEventListenerTarget(props.event.target);
    }
    this.props = void 0;
    this.events = void 0;
    this.autoScrollEnabled = true;
    this.document = void 0;
    this.activated = false;
    this.initialCoordinates = void 0;
    this.timeoutId = null;
    this.listeners = void 0;
    this.documentListeners = void 0;
    this.windowListeners = void 0;
    this.props = props;
    this.events = events2;
    const {
      event
    } = props;
    const {
      target
    } = event;
    this.props = props;
    this.events = events2;
    this.document = getOwnerDocument(target);
    this.documentListeners = new Listeners(this.document);
    this.listeners = new Listeners(listenerTarget);
    this.windowListeners = new Listeners(getWindow(target));
    this.initialCoordinates = (_getEventCoordinates = getEventCoordinates(event)) != null ? _getEventCoordinates : defaultCoordinates;
    this.handleStart = this.handleStart.bind(this);
    this.handleMove = this.handleMove.bind(this);
    this.handleEnd = this.handleEnd.bind(this);
    this.handleCancel = this.handleCancel.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
    this.removeTextSelection = this.removeTextSelection.bind(this);
    this.attach();
  }
  attach() {
    const {
      events: events2,
      props: {
        options: {
          activationConstraint,
          bypassActivationConstraint
        }
      }
    } = this;
    this.listeners.add(events2.move.name, this.handleMove, {
      passive: false
    });
    this.listeners.add(events2.end.name, this.handleEnd);
    if (events2.cancel) {
      this.listeners.add(events2.cancel.name, this.handleCancel);
    }
    this.windowListeners.add(EventName.Resize, this.handleCancel);
    this.windowListeners.add(EventName.DragStart, preventDefault);
    this.windowListeners.add(EventName.VisibilityChange, this.handleCancel);
    this.windowListeners.add(EventName.ContextMenu, preventDefault);
    this.documentListeners.add(EventName.Keydown, this.handleKeydown);
    if (activationConstraint) {
      if (bypassActivationConstraint != null && bypassActivationConstraint({
        event: this.props.event,
        activeNode: this.props.activeNode,
        options: this.props.options
      })) {
        return this.handleStart();
      }
      if (isDelayConstraint(activationConstraint)) {
        this.timeoutId = setTimeout(this.handleStart, activationConstraint.delay);
        this.handlePending(activationConstraint);
        return;
      }
      if (isDistanceConstraint(activationConstraint)) {
        this.handlePending(activationConstraint);
        return;
      }
    }
    this.handleStart();
  }
  detach() {
    this.listeners.removeAll();
    this.windowListeners.removeAll();
    setTimeout(this.documentListeners.removeAll, 50);
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }
  handlePending(constraint, offset) {
    const {
      active,
      onPending
    } = this.props;
    onPending(active, constraint, this.initialCoordinates, offset);
  }
  handleStart() {
    const {
      initialCoordinates
    } = this;
    const {
      onStart
    } = this.props;
    if (initialCoordinates) {
      this.activated = true;
      this.documentListeners.add(EventName.Click, stopPropagation, {
        capture: true
      });
      this.removeTextSelection();
      this.documentListeners.add(EventName.SelectionChange, this.removeTextSelection);
      onStart(initialCoordinates);
    }
  }
  handleMove(event) {
    var _getEventCoordinates2;
    const {
      activated,
      initialCoordinates,
      props
    } = this;
    const {
      onMove,
      options: {
        activationConstraint
      }
    } = props;
    if (!initialCoordinates) {
      return;
    }
    const coordinates = (_getEventCoordinates2 = getEventCoordinates(event)) != null ? _getEventCoordinates2 : defaultCoordinates;
    const delta = subtract(initialCoordinates, coordinates);
    if (!activated && activationConstraint) {
      if (isDistanceConstraint(activationConstraint)) {
        if (activationConstraint.tolerance != null && hasExceededDistance(delta, activationConstraint.tolerance)) {
          return this.handleCancel();
        }
        if (hasExceededDistance(delta, activationConstraint.distance)) {
          return this.handleStart();
        }
      }
      if (isDelayConstraint(activationConstraint)) {
        if (hasExceededDistance(delta, activationConstraint.tolerance)) {
          return this.handleCancel();
        }
      }
      this.handlePending(activationConstraint, delta);
      return;
    }
    if (event.cancelable) {
      event.preventDefault();
    }
    onMove(coordinates);
  }
  handleEnd() {
    const {
      onAbort,
      onEnd
    } = this.props;
    this.detach();
    if (!this.activated) {
      onAbort(this.props.active);
    }
    onEnd();
  }
  handleCancel() {
    const {
      onAbort,
      onCancel
    } = this.props;
    this.detach();
    if (!this.activated) {
      onAbort(this.props.active);
    }
    onCancel();
  }
  handleKeydown(event) {
    if (event.code === KeyboardCode.Esc) {
      this.handleCancel();
    }
  }
  removeTextSelection() {
    var _this$document$getSel;
    (_this$document$getSel = this.document.getSelection()) == null ? void 0 : _this$document$getSel.removeAllRanges();
  }
};
var events = {
  cancel: {
    name: "pointercancel"
  },
  move: {
    name: "pointermove"
  },
  end: {
    name: "pointerup"
  }
};
var PointerSensor = class extends AbstractPointerSensor {
  constructor(props) {
    const {
      event
    } = props;
    const listenerTarget = getOwnerDocument(event.target);
    super(props, events, listenerTarget);
  }
};
PointerSensor.activators = [{
  eventName: "onPointerDown",
  handler: (_ref, _ref2) => {
    let {
      nativeEvent: event
    } = _ref;
    let {
      onActivation
    } = _ref2;
    if (!event.isPrimary || event.button !== 0) {
      return false;
    }
    onActivation == null ? void 0 : onActivation({
      event
    });
    return true;
  }
}];
var events$1 = {
  move: {
    name: "mousemove"
  },
  end: {
    name: "mouseup"
  }
};
var MouseButton;
(function(MouseButton2) {
  MouseButton2[MouseButton2["RightClick"] = 2] = "RightClick";
})(MouseButton || (MouseButton = {}));
var MouseSensor = class extends AbstractPointerSensor {
  constructor(props) {
    super(props, events$1, getOwnerDocument(props.event.target));
  }
};
MouseSensor.activators = [{
  eventName: "onMouseDown",
  handler: (_ref, _ref2) => {
    let {
      nativeEvent: event
    } = _ref;
    let {
      onActivation
    } = _ref2;
    if (event.button === MouseButton.RightClick) {
      return false;
    }
    onActivation == null ? void 0 : onActivation({
      event
    });
    return true;
  }
}];
var events$2 = {
  cancel: {
    name: "touchcancel"
  },
  move: {
    name: "touchmove"
  },
  end: {
    name: "touchend"
  }
};
var TouchSensor = class extends AbstractPointerSensor {
  constructor(props) {
    super(props, events$2);
  }
  static setup() {
    window.addEventListener(events$2.move.name, noop2, {
      capture: false,
      passive: false
    });
    return function teardown() {
      window.removeEventListener(events$2.move.name, noop2);
    };
    function noop2() {
    }
  }
};
TouchSensor.activators = [{
  eventName: "onTouchStart",
  handler: (_ref, _ref2) => {
    let {
      nativeEvent: event
    } = _ref;
    let {
      onActivation
    } = _ref2;
    const {
      touches
    } = event;
    if (touches.length > 1) {
      return false;
    }
    onActivation == null ? void 0 : onActivation({
      event
    });
    return true;
  }
}];
var AutoScrollActivator;
(function(AutoScrollActivator2) {
  AutoScrollActivator2[AutoScrollActivator2["Pointer"] = 0] = "Pointer";
  AutoScrollActivator2[AutoScrollActivator2["DraggableRect"] = 1] = "DraggableRect";
})(AutoScrollActivator || (AutoScrollActivator = {}));
var TraversalOrder;
(function(TraversalOrder2) {
  TraversalOrder2[TraversalOrder2["TreeOrder"] = 0] = "TreeOrder";
  TraversalOrder2[TraversalOrder2["ReversedTreeOrder"] = 1] = "ReversedTreeOrder";
})(TraversalOrder || (TraversalOrder = {}));
function useAutoScroller(_ref) {
  let {
    acceleration,
    activator = AutoScrollActivator.Pointer,
    canScroll,
    draggingRect,
    enabled,
    interval = 5,
    order = TraversalOrder.TreeOrder,
    pointerCoordinates,
    scrollableAncestors,
    scrollableAncestorRects,
    delta,
    threshold
  } = _ref;
  const scrollIntent = useScrollIntent({
    delta,
    disabled: !enabled
  });
  const [setAutoScrollInterval, clearAutoScrollInterval] = useInterval();
  const scrollSpeed = (0, import_react3.useRef)({
    x: 0,
    y: 0
  });
  const scrollDirection = (0, import_react3.useRef)({
    x: 0,
    y: 0
  });
  const rect = (0, import_react3.useMemo)(() => {
    switch (activator) {
      case AutoScrollActivator.Pointer:
        return pointerCoordinates ? {
          top: pointerCoordinates.y,
          bottom: pointerCoordinates.y,
          left: pointerCoordinates.x,
          right: pointerCoordinates.x
        } : null;
      case AutoScrollActivator.DraggableRect:
        return draggingRect;
    }
  }, [activator, draggingRect, pointerCoordinates]);
  const scrollContainerRef = (0, import_react3.useRef)(null);
  const autoScroll = (0, import_react3.useCallback)(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }
    const scrollLeft = scrollSpeed.current.x * scrollDirection.current.x;
    const scrollTop = scrollSpeed.current.y * scrollDirection.current.y;
    scrollContainer.scrollBy(scrollLeft, scrollTop);
  }, []);
  const sortedScrollableAncestors = (0, import_react3.useMemo)(() => order === TraversalOrder.TreeOrder ? [...scrollableAncestors].reverse() : scrollableAncestors, [order, scrollableAncestors]);
  (0, import_react3.useEffect)(
    () => {
      if (!enabled || !scrollableAncestors.length || !rect) {
        clearAutoScrollInterval();
        return;
      }
      for (const scrollContainer of sortedScrollableAncestors) {
        if ((canScroll == null ? void 0 : canScroll(scrollContainer)) === false) {
          continue;
        }
        const index = scrollableAncestors.indexOf(scrollContainer);
        const scrollContainerRect = scrollableAncestorRects[index];
        if (!scrollContainerRect) {
          continue;
        }
        const {
          direction,
          speed
        } = getScrollDirectionAndSpeed(scrollContainer, scrollContainerRect, rect, acceleration, threshold);
        for (const axis of ["x", "y"]) {
          if (!scrollIntent[axis][direction[axis]]) {
            speed[axis] = 0;
            direction[axis] = 0;
          }
        }
        if (speed.x > 0 || speed.y > 0) {
          clearAutoScrollInterval();
          scrollContainerRef.current = scrollContainer;
          setAutoScrollInterval(autoScroll, interval);
          scrollSpeed.current = speed;
          scrollDirection.current = direction;
          return;
        }
      }
      scrollSpeed.current = {
        x: 0,
        y: 0
      };
      scrollDirection.current = {
        x: 0,
        y: 0
      };
      clearAutoScrollInterval();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      acceleration,
      autoScroll,
      canScroll,
      clearAutoScrollInterval,
      enabled,
      interval,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      JSON.stringify(rect),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      JSON.stringify(scrollIntent),
      setAutoScrollInterval,
      scrollableAncestors,
      sortedScrollableAncestors,
      scrollableAncestorRects,
      // eslint-disable-next-line react-hooks/exhaustive-deps
      JSON.stringify(threshold)
    ]
  );
}
var defaultScrollIntent = {
  x: {
    [Direction.Backward]: false,
    [Direction.Forward]: false
  },
  y: {
    [Direction.Backward]: false,
    [Direction.Forward]: false
  }
};
function useScrollIntent(_ref2) {
  let {
    delta,
    disabled
  } = _ref2;
  const previousDelta = usePrevious(delta);
  return useLazyMemo((previousIntent) => {
    if (disabled || !previousDelta || !previousIntent) {
      return defaultScrollIntent;
    }
    const direction = {
      x: Math.sign(delta.x - previousDelta.x),
      y: Math.sign(delta.y - previousDelta.y)
    };
    return {
      x: {
        [Direction.Backward]: previousIntent.x[Direction.Backward] || direction.x === -1,
        [Direction.Forward]: previousIntent.x[Direction.Forward] || direction.x === 1
      },
      y: {
        [Direction.Backward]: previousIntent.y[Direction.Backward] || direction.y === -1,
        [Direction.Forward]: previousIntent.y[Direction.Forward] || direction.y === 1
      }
    };
  }, [disabled, delta, previousDelta]);
}
function useCachedNode(draggableNodes, id) {
  const draggableNode = id != null ? draggableNodes.get(id) : void 0;
  const node = draggableNode ? draggableNode.node.current : null;
  return useLazyMemo((cachedNode) => {
    var _ref;
    if (id == null) {
      return null;
    }
    return (_ref = node != null ? node : cachedNode) != null ? _ref : null;
  }, [node, id]);
}
function useCombineActivators(sensors, getSyntheticHandler) {
  return (0, import_react3.useMemo)(() => sensors.reduce((accumulator, sensor) => {
    const {
      sensor: Sensor
    } = sensor;
    const sensorActivators = Sensor.activators.map((activator) => ({
      eventName: activator.eventName,
      handler: getSyntheticHandler(activator.handler, sensor)
    }));
    return [...accumulator, ...sensorActivators];
  }, []), [sensors, getSyntheticHandler]);
}
var MeasuringStrategy;
(function(MeasuringStrategy2) {
  MeasuringStrategy2[MeasuringStrategy2["Always"] = 0] = "Always";
  MeasuringStrategy2[MeasuringStrategy2["BeforeDragging"] = 1] = "BeforeDragging";
  MeasuringStrategy2[MeasuringStrategy2["WhileDragging"] = 2] = "WhileDragging";
})(MeasuringStrategy || (MeasuringStrategy = {}));
var MeasuringFrequency;
(function(MeasuringFrequency2) {
  MeasuringFrequency2["Optimized"] = "optimized";
})(MeasuringFrequency || (MeasuringFrequency = {}));
var defaultValue = /* @__PURE__ */ new Map();
function useDroppableMeasuring(containers, _ref) {
  let {
    dragging,
    dependencies,
    config
  } = _ref;
  const [queue, setQueue] = (0, import_react3.useState)(null);
  const {
    frequency,
    measure,
    strategy
  } = config;
  const containersRef = (0, import_react3.useRef)(containers);
  const disabled = isDisabled();
  const disabledRef = useLatestValue(disabled);
  const measureDroppableContainers = (0, import_react3.useCallback)(function(ids2) {
    if (ids2 === void 0) {
      ids2 = [];
    }
    if (disabledRef.current) {
      return;
    }
    setQueue((value) => {
      if (value === null) {
        return ids2;
      }
      return value.concat(ids2.filter((id) => !value.includes(id)));
    });
  }, [disabledRef]);
  const timeoutId = (0, import_react3.useRef)(null);
  const droppableRects = useLazyMemo((previousValue) => {
    if (disabled && !dragging) {
      return defaultValue;
    }
    if (!previousValue || previousValue === defaultValue || containersRef.current !== containers || queue != null) {
      const map = /* @__PURE__ */ new Map();
      for (let container of containers) {
        if (!container) {
          continue;
        }
        if (queue && queue.length > 0 && !queue.includes(container.id) && container.rect.current) {
          map.set(container.id, container.rect.current);
          continue;
        }
        const node = container.node.current;
        const rect = node ? new Rect(measure(node), node) : null;
        container.rect.current = rect;
        if (rect) {
          map.set(container.id, rect);
        }
      }
      return map;
    }
    return previousValue;
  }, [containers, queue, dragging, disabled, measure]);
  (0, import_react3.useEffect)(() => {
    containersRef.current = containers;
  }, [containers]);
  (0, import_react3.useEffect)(
    () => {
      if (disabled) {
        return;
      }
      measureDroppableContainers();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dragging, disabled]
  );
  (0, import_react3.useEffect)(
    () => {
      if (queue && queue.length > 0) {
        setQueue(null);
      }
    },
    //eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(queue)]
  );
  (0, import_react3.useEffect)(
    () => {
      if (disabled || typeof frequency !== "number" || timeoutId.current !== null) {
        return;
      }
      timeoutId.current = setTimeout(() => {
        measureDroppableContainers();
        timeoutId.current = null;
      }, frequency);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [frequency, disabled, measureDroppableContainers, ...dependencies]
  );
  return {
    droppableRects,
    measureDroppableContainers,
    measuringScheduled: queue != null
  };
  function isDisabled() {
    switch (strategy) {
      case MeasuringStrategy.Always:
        return false;
      case MeasuringStrategy.BeforeDragging:
        return dragging;
      default:
        return !dragging;
    }
  }
}
function useInitialValue(value, computeFn) {
  return useLazyMemo((previousValue) => {
    if (!value) {
      return null;
    }
    if (previousValue) {
      return previousValue;
    }
    return typeof computeFn === "function" ? computeFn(value) : value;
  }, [computeFn, value]);
}
function useInitialRect(node, measure) {
  return useInitialValue(node, measure);
}
function useMutationObserver(_ref) {
  let {
    callback,
    disabled
  } = _ref;
  const handleMutations = useEvent(callback);
  const mutationObserver = (0, import_react3.useMemo)(() => {
    if (disabled || typeof window === "undefined" || typeof window.MutationObserver === "undefined") {
      return void 0;
    }
    const {
      MutationObserver: MutationObserver2
    } = window;
    return new MutationObserver2(handleMutations);
  }, [handleMutations, disabled]);
  (0, import_react3.useEffect)(() => {
    return () => mutationObserver == null ? void 0 : mutationObserver.disconnect();
  }, [mutationObserver]);
  return mutationObserver;
}
function useResizeObserver(_ref) {
  let {
    callback,
    disabled
  } = _ref;
  const handleResize = useEvent(callback);
  const resizeObserver = (0, import_react3.useMemo)(
    () => {
      if (disabled || typeof window === "undefined" || typeof window.ResizeObserver === "undefined") {
        return void 0;
      }
      const {
        ResizeObserver
      } = window;
      return new ResizeObserver(handleResize);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [disabled]
  );
  (0, import_react3.useEffect)(() => {
    return () => resizeObserver == null ? void 0 : resizeObserver.disconnect();
  }, [resizeObserver]);
  return resizeObserver;
}
function defaultMeasure(element) {
  return new Rect(getClientRect(element), element);
}
function useRect(element, measure, fallbackRect) {
  if (measure === void 0) {
    measure = defaultMeasure;
  }
  const [rect, setRect] = (0, import_react3.useState)(null);
  function measureRect() {
    setRect((currentRect) => {
      if (!element) {
        return null;
      }
      if (element.isConnected === false) {
        var _ref;
        return (_ref = currentRect != null ? currentRect : fallbackRect) != null ? _ref : null;
      }
      const newRect = measure(element);
      if (JSON.stringify(currentRect) === JSON.stringify(newRect)) {
        return currentRect;
      }
      return newRect;
    });
  }
  const mutationObserver = useMutationObserver({
    callback(records) {
      if (!element) {
        return;
      }
      for (const record of records) {
        const {
          type,
          target
        } = record;
        if (type === "childList" && target instanceof HTMLElement && target.contains(element)) {
          measureRect();
          break;
        }
      }
    }
  });
  const resizeObserver = useResizeObserver({
    callback: measureRect
  });
  useIsomorphicLayoutEffect(() => {
    measureRect();
    if (element) {
      resizeObserver == null ? void 0 : resizeObserver.observe(element);
      mutationObserver == null ? void 0 : mutationObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    } else {
      resizeObserver == null ? void 0 : resizeObserver.disconnect();
      mutationObserver == null ? void 0 : mutationObserver.disconnect();
    }
  }, [element]);
  return rect;
}
function useRectDelta(rect) {
  const initialRect = useInitialValue(rect);
  return getRectDelta(rect, initialRect);
}
var defaultValue$1 = [];
function useScrollableAncestors(node) {
  const previousNode = (0, import_react3.useRef)(node);
  const ancestors = useLazyMemo((previousValue) => {
    if (!node) {
      return defaultValue$1;
    }
    if (previousValue && previousValue !== defaultValue$1 && node && previousNode.current && node.parentNode === previousNode.current.parentNode) {
      return previousValue;
    }
    return getScrollableAncestors(node);
  }, [node]);
  (0, import_react3.useEffect)(() => {
    previousNode.current = node;
  }, [node]);
  return ancestors;
}
function useScrollOffsets(elements) {
  const [scrollCoordinates, setScrollCoordinates] = (0, import_react3.useState)(null);
  const prevElements = (0, import_react3.useRef)(elements);
  const handleScroll = (0, import_react3.useCallback)((event) => {
    const scrollingElement = getScrollableElement(event.target);
    if (!scrollingElement) {
      return;
    }
    setScrollCoordinates((scrollCoordinates2) => {
      if (!scrollCoordinates2) {
        return null;
      }
      scrollCoordinates2.set(scrollingElement, getScrollCoordinates(scrollingElement));
      return new Map(scrollCoordinates2);
    });
  }, []);
  (0, import_react3.useEffect)(() => {
    const previousElements = prevElements.current;
    if (elements !== previousElements) {
      cleanup(previousElements);
      const entries = elements.map((element) => {
        const scrollableElement = getScrollableElement(element);
        if (scrollableElement) {
          scrollableElement.addEventListener("scroll", handleScroll, {
            passive: true
          });
          return [scrollableElement, getScrollCoordinates(scrollableElement)];
        }
        return null;
      }).filter((entry) => entry != null);
      setScrollCoordinates(entries.length ? new Map(entries) : null);
      prevElements.current = elements;
    }
    return () => {
      cleanup(elements);
      cleanup(previousElements);
    };
    function cleanup(elements2) {
      elements2.forEach((element) => {
        const scrollableElement = getScrollableElement(element);
        scrollableElement == null ? void 0 : scrollableElement.removeEventListener("scroll", handleScroll);
      });
    }
  }, [handleScroll, elements]);
  return (0, import_react3.useMemo)(() => {
    if (elements.length) {
      return scrollCoordinates ? Array.from(scrollCoordinates.values()).reduce((acc, coordinates) => add(acc, coordinates), defaultCoordinates) : getScrollOffsets(elements);
    }
    return defaultCoordinates;
  }, [elements, scrollCoordinates]);
}
function useScrollOffsetsDelta(scrollOffsets, dependencies) {
  if (dependencies === void 0) {
    dependencies = [];
  }
  const initialScrollOffsets = (0, import_react3.useRef)(null);
  (0, import_react3.useEffect)(
    () => {
      initialScrollOffsets.current = null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    dependencies
  );
  (0, import_react3.useEffect)(() => {
    const hasScrollOffsets = scrollOffsets !== defaultCoordinates;
    if (hasScrollOffsets && !initialScrollOffsets.current) {
      initialScrollOffsets.current = scrollOffsets;
    }
    if (!hasScrollOffsets && initialScrollOffsets.current) {
      initialScrollOffsets.current = null;
    }
  }, [scrollOffsets]);
  return initialScrollOffsets.current ? subtract(scrollOffsets, initialScrollOffsets.current) : defaultCoordinates;
}
function useSensorSetup(sensors) {
  (0, import_react3.useEffect)(
    () => {
      if (!canUseDOM) {
        return;
      }
      const teardownFns = sensors.map((_ref) => {
        let {
          sensor
        } = _ref;
        return sensor.setup == null ? void 0 : sensor.setup();
      });
      return () => {
        for (const teardown of teardownFns) {
          teardown == null ? void 0 : teardown();
        }
      };
    },
    // TO-DO: Sensors length could theoretically change which would not be a valid dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
    sensors.map((_ref2) => {
      let {
        sensor
      } = _ref2;
      return sensor;
    })
  );
}
function useSyntheticListeners(listeners, id) {
  return (0, import_react3.useMemo)(() => {
    return listeners.reduce((acc, _ref) => {
      let {
        eventName,
        handler
      } = _ref;
      acc[eventName] = (event) => {
        handler(event, id);
      };
      return acc;
    }, {});
  }, [listeners, id]);
}
function useWindowRect(element) {
  return (0, import_react3.useMemo)(() => element ? getWindowClientRect(element) : null, [element]);
}
var defaultValue$2 = [];
function useRects(elements, measure) {
  if (measure === void 0) {
    measure = getClientRect;
  }
  const [firstElement] = elements;
  const windowRect = useWindowRect(firstElement ? getWindow(firstElement) : null);
  const [rects, setRects] = (0, import_react3.useState)(defaultValue$2);
  function measureRects() {
    setRects(() => {
      if (!elements.length) {
        return defaultValue$2;
      }
      return elements.map((element) => isDocumentScrollingElement(element) ? windowRect : new Rect(measure(element), element));
    });
  }
  const resizeObserver = useResizeObserver({
    callback: measureRects
  });
  useIsomorphicLayoutEffect(() => {
    resizeObserver == null ? void 0 : resizeObserver.disconnect();
    measureRects();
    elements.forEach((element) => resizeObserver == null ? void 0 : resizeObserver.observe(element));
  }, [elements]);
  return rects;
}
function getMeasurableNode(node) {
  if (!node) {
    return null;
  }
  if (node.children.length > 1) {
    return node;
  }
  const firstChild = node.children[0];
  return isHTMLElement(firstChild) ? firstChild : node;
}
function useDragOverlayMeasuring(_ref) {
  let {
    measure
  } = _ref;
  const [rect, setRect] = (0, import_react3.useState)(null);
  const handleResize = (0, import_react3.useCallback)((entries) => {
    for (const {
      target
    } of entries) {
      if (isHTMLElement(target)) {
        setRect((rect2) => {
          const newRect = measure(target);
          return rect2 ? {
            ...rect2,
            width: newRect.width,
            height: newRect.height
          } : newRect;
        });
        break;
      }
    }
  }, [measure]);
  const resizeObserver = useResizeObserver({
    callback: handleResize
  });
  const handleNodeChange = (0, import_react3.useCallback)((element) => {
    const node = getMeasurableNode(element);
    resizeObserver == null ? void 0 : resizeObserver.disconnect();
    if (node) {
      resizeObserver == null ? void 0 : resizeObserver.observe(node);
    }
    setRect(node ? measure(node) : null);
  }, [measure, resizeObserver]);
  const [nodeRef, setRef] = useNodeRef(handleNodeChange);
  return (0, import_react3.useMemo)(() => ({
    nodeRef,
    rect,
    setRef
  }), [rect, nodeRef, setRef]);
}
var defaultSensors = [{
  sensor: PointerSensor,
  options: {}
}, {
  sensor: KeyboardSensor,
  options: {}
}];
var defaultData = {
  current: {}
};
var defaultMeasuringConfiguration = {
  draggable: {
    measure: getTransformAgnosticClientRect
  },
  droppable: {
    measure: getTransformAgnosticClientRect,
    strategy: MeasuringStrategy.WhileDragging,
    frequency: MeasuringFrequency.Optimized
  },
  dragOverlay: {
    measure: getClientRect
  }
};
var DroppableContainersMap = class extends Map {
  get(id) {
    var _super$get;
    return id != null ? (_super$get = super.get(id)) != null ? _super$get : void 0 : void 0;
  }
  toArray() {
    return Array.from(this.values());
  }
  getEnabled() {
    return this.toArray().filter((_ref) => {
      let {
        disabled
      } = _ref;
      return !disabled;
    });
  }
  getNodeFor(id) {
    var _this$get$node$curren, _this$get;
    return (_this$get$node$curren = (_this$get = this.get(id)) == null ? void 0 : _this$get.node.current) != null ? _this$get$node$curren : void 0;
  }
};
var defaultPublicContext = {
  activatorEvent: null,
  active: null,
  activeNode: null,
  activeNodeRect: null,
  collisions: null,
  containerNodeRect: null,
  draggableNodes: /* @__PURE__ */ new Map(),
  droppableRects: /* @__PURE__ */ new Map(),
  droppableContainers: /* @__PURE__ */ new DroppableContainersMap(),
  over: null,
  dragOverlay: {
    nodeRef: {
      current: null
    },
    rect: null,
    setRef: noop
  },
  scrollableAncestors: [],
  scrollableAncestorRects: [],
  measuringConfiguration: defaultMeasuringConfiguration,
  measureDroppableContainers: noop,
  windowRect: null,
  measuringScheduled: false
};
var defaultInternalContext = {
  activatorEvent: null,
  activators: [],
  active: null,
  activeNodeRect: null,
  ariaDescribedById: {
    draggable: ""
  },
  dispatch: noop,
  draggableNodes: /* @__PURE__ */ new Map(),
  over: null,
  measureDroppableContainers: noop
};
var InternalContext = /* @__PURE__ */ (0, import_react3.createContext)(defaultInternalContext);
var PublicContext = /* @__PURE__ */ (0, import_react3.createContext)(defaultPublicContext);
function getInitialState() {
  return {
    draggable: {
      active: null,
      initialCoordinates: {
        x: 0,
        y: 0
      },
      nodes: /* @__PURE__ */ new Map(),
      translate: {
        x: 0,
        y: 0
      }
    },
    droppable: {
      containers: new DroppableContainersMap()
    }
  };
}
function reducer(state, action) {
  switch (action.type) {
    case Action.DragStart:
      return {
        ...state,
        draggable: {
          ...state.draggable,
          initialCoordinates: action.initialCoordinates,
          active: action.active
        }
      };
    case Action.DragMove:
      if (state.draggable.active == null) {
        return state;
      }
      return {
        ...state,
        draggable: {
          ...state.draggable,
          translate: {
            x: action.coordinates.x - state.draggable.initialCoordinates.x,
            y: action.coordinates.y - state.draggable.initialCoordinates.y
          }
        }
      };
    case Action.DragEnd:
    case Action.DragCancel:
      return {
        ...state,
        draggable: {
          ...state.draggable,
          active: null,
          initialCoordinates: {
            x: 0,
            y: 0
          },
          translate: {
            x: 0,
            y: 0
          }
        }
      };
    case Action.RegisterDroppable: {
      const {
        element
      } = action;
      const {
        id
      } = element;
      const containers = new DroppableContainersMap(state.droppable.containers);
      containers.set(id, element);
      return {
        ...state,
        droppable: {
          ...state.droppable,
          containers
        }
      };
    }
    case Action.SetDroppableDisabled: {
      const {
        id,
        key,
        disabled
      } = action;
      const element = state.droppable.containers.get(id);
      if (!element || key !== element.key) {
        return state;
      }
      const containers = new DroppableContainersMap(state.droppable.containers);
      containers.set(id, {
        ...element,
        disabled
      });
      return {
        ...state,
        droppable: {
          ...state.droppable,
          containers
        }
      };
    }
    case Action.UnregisterDroppable: {
      const {
        id,
        key
      } = action;
      const element = state.droppable.containers.get(id);
      if (!element || key !== element.key) {
        return state;
      }
      const containers = new DroppableContainersMap(state.droppable.containers);
      containers.delete(id);
      return {
        ...state,
        droppable: {
          ...state.droppable,
          containers
        }
      };
    }
    default: {
      return state;
    }
  }
}
function RestoreFocus(_ref) {
  let {
    disabled
  } = _ref;
  const {
    active,
    activatorEvent,
    draggableNodes
  } = (0, import_react3.useContext)(InternalContext);
  const previousActivatorEvent = usePrevious(activatorEvent);
  const previousActiveId = usePrevious(active == null ? void 0 : active.id);
  (0, import_react3.useEffect)(() => {
    if (disabled) {
      return;
    }
    if (!activatorEvent && previousActivatorEvent && previousActiveId != null) {
      if (!isKeyboardEvent(previousActivatorEvent)) {
        return;
      }
      if (document.activeElement === previousActivatorEvent.target) {
        return;
      }
      const draggableNode = draggableNodes.get(previousActiveId);
      if (!draggableNode) {
        return;
      }
      const {
        activatorNode,
        node
      } = draggableNode;
      if (!activatorNode.current && !node.current) {
        return;
      }
      requestAnimationFrame(() => {
        for (const element of [activatorNode.current, node.current]) {
          if (!element) {
            continue;
          }
          const focusableNode = findFirstFocusableNode(element);
          if (focusableNode) {
            focusableNode.focus();
            break;
          }
        }
      });
    }
  }, [activatorEvent, disabled, draggableNodes, previousActiveId, previousActivatorEvent]);
  return null;
}
function applyModifiers(modifiers, _ref) {
  let {
    transform,
    ...args
  } = _ref;
  return modifiers != null && modifiers.length ? modifiers.reduce((accumulator, modifier) => {
    return modifier({
      transform: accumulator,
      ...args
    });
  }, transform) : transform;
}
function useMeasuringConfiguration(config) {
  return (0, import_react3.useMemo)(
    () => ({
      draggable: {
        ...defaultMeasuringConfiguration.draggable,
        ...config == null ? void 0 : config.draggable
      },
      droppable: {
        ...defaultMeasuringConfiguration.droppable,
        ...config == null ? void 0 : config.droppable
      },
      dragOverlay: {
        ...defaultMeasuringConfiguration.dragOverlay,
        ...config == null ? void 0 : config.dragOverlay
      }
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config == null ? void 0 : config.draggable, config == null ? void 0 : config.droppable, config == null ? void 0 : config.dragOverlay]
  );
}
function useLayoutShiftScrollCompensation(_ref) {
  let {
    activeNode,
    measure,
    initialRect,
    config = true
  } = _ref;
  const initialized = (0, import_react3.useRef)(false);
  const {
    x,
    y
  } = typeof config === "boolean" ? {
    x: config,
    y: config
  } : config;
  useIsomorphicLayoutEffect(() => {
    const disabled = !x && !y;
    if (disabled || !activeNode) {
      initialized.current = false;
      return;
    }
    if (initialized.current || !initialRect) {
      return;
    }
    const node = activeNode == null ? void 0 : activeNode.node.current;
    if (!node || node.isConnected === false) {
      return;
    }
    const rect = measure(node);
    const rectDelta = getRectDelta(rect, initialRect);
    if (!x) {
      rectDelta.x = 0;
    }
    if (!y) {
      rectDelta.y = 0;
    }
    initialized.current = true;
    if (Math.abs(rectDelta.x) > 0 || Math.abs(rectDelta.y) > 0) {
      const firstScrollableAncestor = getFirstScrollableAncestor(node);
      if (firstScrollableAncestor) {
        firstScrollableAncestor.scrollBy({
          top: rectDelta.y,
          left: rectDelta.x
        });
      }
    }
  }, [activeNode, x, y, initialRect, measure]);
}
var ActiveDraggableContext = /* @__PURE__ */ (0, import_react3.createContext)({
  ...defaultCoordinates,
  scaleX: 1,
  scaleY: 1
});
var Status;
(function(Status2) {
  Status2[Status2["Uninitialized"] = 0] = "Uninitialized";
  Status2[Status2["Initializing"] = 1] = "Initializing";
  Status2[Status2["Initialized"] = 2] = "Initialized";
})(Status || (Status = {}));
var DndContext = /* @__PURE__ */ (0, import_react3.memo)(function DndContext2(_ref) {
  var _sensorContext$curren, _dragOverlay$nodeRef$, _dragOverlay$rect, _over$rect;
  let {
    id,
    accessibility,
    autoScroll = true,
    children,
    sensors = defaultSensors,
    collisionDetection = rectIntersection,
    measuring,
    modifiers,
    ...props
  } = _ref;
  const store = (0, import_react3.useReducer)(reducer, void 0, getInitialState);
  const [state, dispatch] = store;
  const [dispatchMonitorEvent, registerMonitorListener] = useDndMonitorProvider();
  const [status, setStatus] = (0, import_react3.useState)(Status.Uninitialized);
  const isInitialized = status === Status.Initialized;
  const {
    draggable: {
      active: activeId,
      nodes: draggableNodes,
      translate
    },
    droppable: {
      containers: droppableContainers
    }
  } = state;
  const node = activeId != null ? draggableNodes.get(activeId) : null;
  const activeRects = (0, import_react3.useRef)({
    initial: null,
    translated: null
  });
  const active = (0, import_react3.useMemo)(() => {
    var _node$data;
    return activeId != null ? {
      id: activeId,
      // It's possible for the active node to unmount while dragging
      data: (_node$data = node == null ? void 0 : node.data) != null ? _node$data : defaultData,
      rect: activeRects
    } : null;
  }, [activeId, node]);
  const activeRef = (0, import_react3.useRef)(null);
  const [activeSensor, setActiveSensor] = (0, import_react3.useState)(null);
  const [activatorEvent, setActivatorEvent] = (0, import_react3.useState)(null);
  const latestProps = useLatestValue(props, Object.values(props));
  const draggableDescribedById = useUniqueId("DndDescribedBy", id);
  const enabledDroppableContainers = (0, import_react3.useMemo)(() => droppableContainers.getEnabled(), [droppableContainers]);
  const measuringConfiguration = useMeasuringConfiguration(measuring);
  const {
    droppableRects,
    measureDroppableContainers,
    measuringScheduled
  } = useDroppableMeasuring(enabledDroppableContainers, {
    dragging: isInitialized,
    dependencies: [translate.x, translate.y],
    config: measuringConfiguration.droppable
  });
  const activeNode = useCachedNode(draggableNodes, activeId);
  const activationCoordinates = (0, import_react3.useMemo)(() => activatorEvent ? getEventCoordinates(activatorEvent) : null, [activatorEvent]);
  const autoScrollOptions = getAutoScrollerOptions();
  const initialActiveNodeRect = useInitialRect(activeNode, measuringConfiguration.draggable.measure);
  useLayoutShiftScrollCompensation({
    activeNode: activeId != null ? draggableNodes.get(activeId) : null,
    config: autoScrollOptions.layoutShiftCompensation,
    initialRect: initialActiveNodeRect,
    measure: measuringConfiguration.draggable.measure
  });
  const activeNodeRect = useRect(activeNode, measuringConfiguration.draggable.measure, initialActiveNodeRect);
  const containerNodeRect = useRect(activeNode ? activeNode.parentElement : null);
  const sensorContext = (0, import_react3.useRef)({
    activatorEvent: null,
    active: null,
    activeNode,
    collisionRect: null,
    collisions: null,
    droppableRects,
    draggableNodes,
    draggingNode: null,
    draggingNodeRect: null,
    droppableContainers,
    over: null,
    scrollableAncestors: [],
    scrollAdjustedTranslate: null
  });
  const overNode = droppableContainers.getNodeFor((_sensorContext$curren = sensorContext.current.over) == null ? void 0 : _sensorContext$curren.id);
  const dragOverlay = useDragOverlayMeasuring({
    measure: measuringConfiguration.dragOverlay.measure
  });
  const draggingNode = (_dragOverlay$nodeRef$ = dragOverlay.nodeRef.current) != null ? _dragOverlay$nodeRef$ : activeNode;
  const draggingNodeRect = isInitialized ? (_dragOverlay$rect = dragOverlay.rect) != null ? _dragOverlay$rect : activeNodeRect : null;
  const usesDragOverlay = Boolean(dragOverlay.nodeRef.current && dragOverlay.rect);
  const nodeRectDelta = useRectDelta(usesDragOverlay ? null : activeNodeRect);
  const windowRect = useWindowRect(draggingNode ? getWindow(draggingNode) : null);
  const scrollableAncestors = useScrollableAncestors(isInitialized ? overNode != null ? overNode : activeNode : null);
  const scrollableAncestorRects = useRects(scrollableAncestors);
  const modifiedTranslate = applyModifiers(modifiers, {
    transform: {
      x: translate.x - nodeRectDelta.x,
      y: translate.y - nodeRectDelta.y,
      scaleX: 1,
      scaleY: 1
    },
    activatorEvent,
    active,
    activeNodeRect,
    containerNodeRect,
    draggingNodeRect,
    over: sensorContext.current.over,
    overlayNodeRect: dragOverlay.rect,
    scrollableAncestors,
    scrollableAncestorRects,
    windowRect
  });
  const pointerCoordinates = activationCoordinates ? add(activationCoordinates, translate) : null;
  const scrollOffsets = useScrollOffsets(scrollableAncestors);
  const scrollAdjustment = useScrollOffsetsDelta(scrollOffsets);
  const activeNodeScrollDelta = useScrollOffsetsDelta(scrollOffsets, [activeNodeRect]);
  const scrollAdjustedTranslate = add(modifiedTranslate, scrollAdjustment);
  const collisionRect = draggingNodeRect ? getAdjustedRect(draggingNodeRect, modifiedTranslate) : null;
  const collisions = active && collisionRect ? collisionDetection({
    active,
    collisionRect,
    droppableRects,
    droppableContainers: enabledDroppableContainers,
    pointerCoordinates
  }) : null;
  const overId = getFirstCollision(collisions, "id");
  const [over, setOver] = (0, import_react3.useState)(null);
  const appliedTranslate = usesDragOverlay ? modifiedTranslate : add(modifiedTranslate, activeNodeScrollDelta);
  const transform = adjustScale(appliedTranslate, (_over$rect = over == null ? void 0 : over.rect) != null ? _over$rect : null, activeNodeRect);
  const activeSensorRef = (0, import_react3.useRef)(null);
  const instantiateSensor = (0, import_react3.useCallback)(
    (event, _ref2) => {
      let {
        sensor: Sensor,
        options
      } = _ref2;
      if (activeRef.current == null) {
        return;
      }
      const activeNode2 = draggableNodes.get(activeRef.current);
      if (!activeNode2) {
        return;
      }
      const activatorEvent2 = event.nativeEvent;
      const sensorInstance = new Sensor({
        active: activeRef.current,
        activeNode: activeNode2,
        event: activatorEvent2,
        options,
        // Sensors need to be instantiated with refs for arguments that change over time
        // otherwise they are frozen in time with the stale arguments
        context: sensorContext,
        onAbort(id2) {
          const draggableNode = draggableNodes.get(id2);
          if (!draggableNode) {
            return;
          }
          const {
            onDragAbort
          } = latestProps.current;
          const event2 = {
            id: id2
          };
          onDragAbort == null ? void 0 : onDragAbort(event2);
          dispatchMonitorEvent({
            type: "onDragAbort",
            event: event2
          });
        },
        onPending(id2, constraint, initialCoordinates, offset) {
          const draggableNode = draggableNodes.get(id2);
          if (!draggableNode) {
            return;
          }
          const {
            onDragPending
          } = latestProps.current;
          const event2 = {
            id: id2,
            constraint,
            initialCoordinates,
            offset
          };
          onDragPending == null ? void 0 : onDragPending(event2);
          dispatchMonitorEvent({
            type: "onDragPending",
            event: event2
          });
        },
        onStart(initialCoordinates) {
          const id2 = activeRef.current;
          if (id2 == null) {
            return;
          }
          const draggableNode = draggableNodes.get(id2);
          if (!draggableNode) {
            return;
          }
          const {
            onDragStart
          } = latestProps.current;
          const event2 = {
            activatorEvent: activatorEvent2,
            active: {
              id: id2,
              data: draggableNode.data,
              rect: activeRects
            }
          };
          (0, import_react_dom.unstable_batchedUpdates)(() => {
            onDragStart == null ? void 0 : onDragStart(event2);
            setStatus(Status.Initializing);
            dispatch({
              type: Action.DragStart,
              initialCoordinates,
              active: id2
            });
            dispatchMonitorEvent({
              type: "onDragStart",
              event: event2
            });
            setActiveSensor(activeSensorRef.current);
            setActivatorEvent(activatorEvent2);
          });
        },
        onMove(coordinates) {
          dispatch({
            type: Action.DragMove,
            coordinates
          });
        },
        onEnd: createHandler(Action.DragEnd),
        onCancel: createHandler(Action.DragCancel)
      });
      activeSensorRef.current = sensorInstance;
      function createHandler(type) {
        return async function handler() {
          const {
            active: active2,
            collisions: collisions2,
            over: over2,
            scrollAdjustedTranslate: scrollAdjustedTranslate2
          } = sensorContext.current;
          let event2 = null;
          if (active2 && scrollAdjustedTranslate2) {
            const {
              cancelDrop
            } = latestProps.current;
            event2 = {
              activatorEvent: activatorEvent2,
              active: active2,
              collisions: collisions2,
              delta: scrollAdjustedTranslate2,
              over: over2
            };
            if (type === Action.DragEnd && typeof cancelDrop === "function") {
              const shouldCancel = await Promise.resolve(cancelDrop(event2));
              if (shouldCancel) {
                type = Action.DragCancel;
              }
            }
          }
          activeRef.current = null;
          (0, import_react_dom.unstable_batchedUpdates)(() => {
            dispatch({
              type
            });
            setStatus(Status.Uninitialized);
            setOver(null);
            setActiveSensor(null);
            setActivatorEvent(null);
            activeSensorRef.current = null;
            const eventName = type === Action.DragEnd ? "onDragEnd" : "onDragCancel";
            if (event2) {
              const handler2 = latestProps.current[eventName];
              handler2 == null ? void 0 : handler2(event2);
              dispatchMonitorEvent({
                type: eventName,
                event: event2
              });
            }
          });
        };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draggableNodes]
  );
  const bindActivatorToSensorInstantiator = (0, import_react3.useCallback)((handler, sensor) => {
    return (event, active2) => {
      const nativeEvent = event.nativeEvent;
      const activeDraggableNode = draggableNodes.get(active2);
      if (
        // Another sensor is already instantiating
        activeRef.current !== null || // No active draggable
        !activeDraggableNode || // Event has already been captured
        nativeEvent.dndKit || nativeEvent.defaultPrevented
      ) {
        return;
      }
      const activationContext = {
        active: activeDraggableNode
      };
      const shouldActivate = handler(event, sensor.options, activationContext);
      if (shouldActivate === true) {
        nativeEvent.dndKit = {
          capturedBy: sensor.sensor
        };
        activeRef.current = active2;
        instantiateSensor(event, sensor);
      }
    };
  }, [draggableNodes, instantiateSensor]);
  const activators = useCombineActivators(sensors, bindActivatorToSensorInstantiator);
  useSensorSetup(sensors);
  useIsomorphicLayoutEffect(() => {
    if (activeNodeRect && status === Status.Initializing) {
      setStatus(Status.Initialized);
    }
  }, [activeNodeRect, status]);
  (0, import_react3.useEffect)(
    () => {
      const {
        onDragMove
      } = latestProps.current;
      const {
        active: active2,
        activatorEvent: activatorEvent2,
        collisions: collisions2,
        over: over2
      } = sensorContext.current;
      if (!active2 || !activatorEvent2) {
        return;
      }
      const event = {
        active: active2,
        activatorEvent: activatorEvent2,
        collisions: collisions2,
        delta: {
          x: scrollAdjustedTranslate.x,
          y: scrollAdjustedTranslate.y
        },
        over: over2
      };
      (0, import_react_dom.unstable_batchedUpdates)(() => {
        onDragMove == null ? void 0 : onDragMove(event);
        dispatchMonitorEvent({
          type: "onDragMove",
          event
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scrollAdjustedTranslate.x, scrollAdjustedTranslate.y]
  );
  (0, import_react3.useEffect)(
    () => {
      const {
        active: active2,
        activatorEvent: activatorEvent2,
        collisions: collisions2,
        droppableContainers: droppableContainers2,
        scrollAdjustedTranslate: scrollAdjustedTranslate2
      } = sensorContext.current;
      if (!active2 || activeRef.current == null || !activatorEvent2 || !scrollAdjustedTranslate2) {
        return;
      }
      const {
        onDragOver
      } = latestProps.current;
      const overContainer = droppableContainers2.get(overId);
      const over2 = overContainer && overContainer.rect.current ? {
        id: overContainer.id,
        rect: overContainer.rect.current,
        data: overContainer.data,
        disabled: overContainer.disabled
      } : null;
      const event = {
        active: active2,
        activatorEvent: activatorEvent2,
        collisions: collisions2,
        delta: {
          x: scrollAdjustedTranslate2.x,
          y: scrollAdjustedTranslate2.y
        },
        over: over2
      };
      (0, import_react_dom.unstable_batchedUpdates)(() => {
        setOver(over2);
        onDragOver == null ? void 0 : onDragOver(event);
        dispatchMonitorEvent({
          type: "onDragOver",
          event
        });
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overId]
  );
  useIsomorphicLayoutEffect(() => {
    sensorContext.current = {
      activatorEvent,
      active,
      activeNode,
      collisionRect,
      collisions,
      droppableRects,
      draggableNodes,
      draggingNode,
      draggingNodeRect,
      droppableContainers,
      over,
      scrollableAncestors,
      scrollAdjustedTranslate
    };
    activeRects.current = {
      initial: draggingNodeRect,
      translated: collisionRect
    };
  }, [active, activeNode, collisions, collisionRect, draggableNodes, draggingNode, draggingNodeRect, droppableRects, droppableContainers, over, scrollableAncestors, scrollAdjustedTranslate]);
  useAutoScroller({
    ...autoScrollOptions,
    delta: translate,
    draggingRect: collisionRect,
    pointerCoordinates,
    scrollableAncestors,
    scrollableAncestorRects
  });
  const publicContext = (0, import_react3.useMemo)(() => {
    const context = {
      active,
      activeNode,
      activeNodeRect,
      activatorEvent,
      collisions,
      containerNodeRect,
      dragOverlay,
      draggableNodes,
      droppableContainers,
      droppableRects,
      over,
      measureDroppableContainers,
      scrollableAncestors,
      scrollableAncestorRects,
      measuringConfiguration,
      measuringScheduled,
      windowRect
    };
    return context;
  }, [active, activeNode, activeNodeRect, activatorEvent, collisions, containerNodeRect, dragOverlay, draggableNodes, droppableContainers, droppableRects, over, measureDroppableContainers, scrollableAncestors, scrollableAncestorRects, measuringConfiguration, measuringScheduled, windowRect]);
  const internalContext = (0, import_react3.useMemo)(() => {
    const context = {
      activatorEvent,
      activators,
      active,
      activeNodeRect,
      ariaDescribedById: {
        draggable: draggableDescribedById
      },
      dispatch,
      draggableNodes,
      over,
      measureDroppableContainers
    };
    return context;
  }, [activatorEvent, activators, active, activeNodeRect, dispatch, draggableDescribedById, draggableNodes, over, measureDroppableContainers]);
  return import_react3.default.createElement(DndMonitorContext.Provider, {
    value: registerMonitorListener
  }, import_react3.default.createElement(InternalContext.Provider, {
    value: internalContext
  }, import_react3.default.createElement(PublicContext.Provider, {
    value: publicContext
  }, import_react3.default.createElement(ActiveDraggableContext.Provider, {
    value: transform
  }, children)), import_react3.default.createElement(RestoreFocus, {
    disabled: (accessibility == null ? void 0 : accessibility.restoreFocus) === false
  })), import_react3.default.createElement(Accessibility, {
    ...accessibility,
    hiddenTextDescribedById: draggableDescribedById
  }));
  function getAutoScrollerOptions() {
    const activeSensorDisablesAutoscroll = (activeSensor == null ? void 0 : activeSensor.autoScrollEnabled) === false;
    const autoScrollGloballyDisabled = typeof autoScroll === "object" ? autoScroll.enabled === false : autoScroll === false;
    const enabled = isInitialized && !activeSensorDisablesAutoscroll && !autoScrollGloballyDisabled;
    if (typeof autoScroll === "object") {
      return {
        ...autoScroll,
        enabled
      };
    }
    return {
      enabled
    };
  }
});
var NullContext = /* @__PURE__ */ (0, import_react3.createContext)(null);
var defaultRole = "button";
var ID_PREFIX = "Draggable";
function useDraggable(_ref) {
  let {
    id,
    data,
    disabled = false,
    attributes
  } = _ref;
  const key = useUniqueId(ID_PREFIX);
  const {
    activators,
    activatorEvent,
    active,
    activeNodeRect,
    ariaDescribedById,
    draggableNodes,
    over
  } = (0, import_react3.useContext)(InternalContext);
  const {
    role = defaultRole,
    roleDescription = "draggable",
    tabIndex = 0
  } = attributes != null ? attributes : {};
  const isDragging = (active == null ? void 0 : active.id) === id;
  const transform = (0, import_react3.useContext)(isDragging ? ActiveDraggableContext : NullContext);
  const [node, setNodeRef] = useNodeRef();
  const [activatorNode, setActivatorNodeRef] = useNodeRef();
  const listeners = useSyntheticListeners(activators, id);
  const dataRef = useLatestValue(data);
  useIsomorphicLayoutEffect(
    () => {
      draggableNodes.set(id, {
        id,
        key,
        node,
        activatorNode,
        data: dataRef
      });
      return () => {
        const node2 = draggableNodes.get(id);
        if (node2 && node2.key === key) {
          draggableNodes.delete(id);
        }
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draggableNodes, id]
  );
  const memoizedAttributes = (0, import_react3.useMemo)(() => ({
    role,
    tabIndex,
    "aria-disabled": disabled,
    "aria-pressed": isDragging && role === defaultRole ? true : void 0,
    "aria-roledescription": roleDescription,
    "aria-describedby": ariaDescribedById.draggable
  }), [disabled, role, tabIndex, isDragging, roleDescription, ariaDescribedById.draggable]);
  return {
    active,
    activatorEvent,
    activeNodeRect,
    attributes: memoizedAttributes,
    isDragging,
    listeners: disabled ? void 0 : listeners,
    node,
    over,
    setNodeRef,
    setActivatorNodeRef,
    transform
  };
}
function useDndContext() {
  return (0, import_react3.useContext)(PublicContext);
}
var ID_PREFIX$1 = "Droppable";
var defaultResizeObserverConfig = {
  timeout: 25
};
function useDroppable(_ref) {
  let {
    data,
    disabled = false,
    id,
    resizeObserverConfig
  } = _ref;
  const key = useUniqueId(ID_PREFIX$1);
  const {
    active,
    dispatch,
    over,
    measureDroppableContainers
  } = (0, import_react3.useContext)(InternalContext);
  const previous = (0, import_react3.useRef)({
    disabled
  });
  const resizeObserverConnected = (0, import_react3.useRef)(false);
  const rect = (0, import_react3.useRef)(null);
  const callbackId = (0, import_react3.useRef)(null);
  const {
    disabled: resizeObserverDisabled,
    updateMeasurementsFor,
    timeout: resizeObserverTimeout
  } = {
    ...defaultResizeObserverConfig,
    ...resizeObserverConfig
  };
  const ids2 = useLatestValue(updateMeasurementsFor != null ? updateMeasurementsFor : id);
  const handleResize = (0, import_react3.useCallback)(
    () => {
      if (!resizeObserverConnected.current) {
        resizeObserverConnected.current = true;
        return;
      }
      if (callbackId.current != null) {
        clearTimeout(callbackId.current);
      }
      callbackId.current = setTimeout(() => {
        measureDroppableContainers(Array.isArray(ids2.current) ? ids2.current : [ids2.current]);
        callbackId.current = null;
      }, resizeObserverTimeout);
    },
    //eslint-disable-next-line react-hooks/exhaustive-deps
    [resizeObserverTimeout]
  );
  const resizeObserver = useResizeObserver({
    callback: handleResize,
    disabled: resizeObserverDisabled || !active
  });
  const handleNodeChange = (0, import_react3.useCallback)((newElement, previousElement) => {
    if (!resizeObserver) {
      return;
    }
    if (previousElement) {
      resizeObserver.unobserve(previousElement);
      resizeObserverConnected.current = false;
    }
    if (newElement) {
      resizeObserver.observe(newElement);
    }
  }, [resizeObserver]);
  const [nodeRef, setNodeRef] = useNodeRef(handleNodeChange);
  const dataRef = useLatestValue(data);
  (0, import_react3.useEffect)(() => {
    if (!resizeObserver || !nodeRef.current) {
      return;
    }
    resizeObserver.disconnect();
    resizeObserverConnected.current = false;
    resizeObserver.observe(nodeRef.current);
  }, [nodeRef, resizeObserver]);
  (0, import_react3.useEffect)(
    () => {
      dispatch({
        type: Action.RegisterDroppable,
        element: {
          id,
          key,
          disabled,
          node: nodeRef,
          rect,
          data: dataRef
        }
      });
      return () => dispatch({
        type: Action.UnregisterDroppable,
        key,
        id
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id]
  );
  (0, import_react3.useEffect)(() => {
    if (disabled !== previous.current.disabled) {
      dispatch({
        type: Action.SetDroppableDisabled,
        id,
        key,
        disabled
      });
      previous.current.disabled = disabled;
    }
  }, [id, key, disabled, dispatch]);
  return {
    active,
    rect,
    isOver: (over == null ? void 0 : over.id) === id,
    node: nodeRef,
    over,
    setNodeRef
  };
}

// plugins/profiles-client/node_modules/@dnd-kit/sortable/dist/sortable.esm.js
var import_react4 = __toESM(require("react"));
function arrayMove(array, from, to) {
  const newArray = array.slice();
  newArray.splice(to < 0 ? newArray.length + to : to, 0, newArray.splice(from, 1)[0]);
  return newArray;
}
function getSortedRects(items, rects) {
  return items.reduce((accumulator, id, index) => {
    const rect = rects.get(id);
    if (rect) {
      accumulator[index] = rect;
    }
    return accumulator;
  }, Array(items.length));
}
function isValidIndex(index) {
  return index !== null && index >= 0;
}
function itemsEqual(a, b) {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
function normalizeDisabled(disabled) {
  if (typeof disabled === "boolean") {
    return {
      draggable: disabled,
      droppable: disabled
    };
  }
  return disabled;
}
var rectSortingStrategy = (_ref) => {
  let {
    rects,
    activeIndex,
    overIndex,
    index
  } = _ref;
  const newRects = arrayMove(rects, overIndex, activeIndex);
  const oldRect = rects[index];
  const newRect = newRects[index];
  if (!newRect || !oldRect) {
    return null;
  }
  return {
    x: newRect.left - oldRect.left,
    y: newRect.top - oldRect.top,
    scaleX: newRect.width / oldRect.width,
    scaleY: newRect.height / oldRect.height
  };
};
var defaultScale$1 = {
  scaleX: 1,
  scaleY: 1
};
var verticalListSortingStrategy = (_ref) => {
  var _rects$activeIndex;
  let {
    activeIndex,
    activeNodeRect: fallbackActiveRect,
    index,
    rects,
    overIndex
  } = _ref;
  const activeNodeRect = (_rects$activeIndex = rects[activeIndex]) != null ? _rects$activeIndex : fallbackActiveRect;
  if (!activeNodeRect) {
    return null;
  }
  if (index === activeIndex) {
    const overIndexRect = rects[overIndex];
    if (!overIndexRect) {
      return null;
    }
    return {
      x: 0,
      y: activeIndex < overIndex ? overIndexRect.top + overIndexRect.height - (activeNodeRect.top + activeNodeRect.height) : overIndexRect.top - activeNodeRect.top,
      ...defaultScale$1
    };
  }
  const itemGap = getItemGap$1(rects, index, activeIndex);
  if (index > activeIndex && index <= overIndex) {
    return {
      x: 0,
      y: -activeNodeRect.height - itemGap,
      ...defaultScale$1
    };
  }
  if (index < activeIndex && index >= overIndex) {
    return {
      x: 0,
      y: activeNodeRect.height + itemGap,
      ...defaultScale$1
    };
  }
  return {
    x: 0,
    y: 0,
    ...defaultScale$1
  };
};
function getItemGap$1(clientRects, index, activeIndex) {
  const currentRect = clientRects[index];
  const previousRect = clientRects[index - 1];
  const nextRect = clientRects[index + 1];
  if (!currentRect) {
    return 0;
  }
  if (activeIndex < index) {
    return previousRect ? currentRect.top - (previousRect.top + previousRect.height) : nextRect ? nextRect.top - (currentRect.top + currentRect.height) : 0;
  }
  return nextRect ? nextRect.top - (currentRect.top + currentRect.height) : previousRect ? currentRect.top - (previousRect.top + previousRect.height) : 0;
}
var ID_PREFIX2 = "Sortable";
var Context = /* @__PURE__ */ import_react4.default.createContext({
  activeIndex: -1,
  containerId: ID_PREFIX2,
  disableTransforms: false,
  items: [],
  overIndex: -1,
  useDragOverlay: false,
  sortedRects: [],
  strategy: rectSortingStrategy,
  disabled: {
    draggable: false,
    droppable: false
  }
});
function SortableContext(_ref) {
  let {
    children,
    id,
    items: userDefinedItems,
    strategy = rectSortingStrategy,
    disabled: disabledProp = false
  } = _ref;
  const {
    active,
    dragOverlay,
    droppableRects,
    over,
    measureDroppableContainers
  } = useDndContext();
  const containerId = useUniqueId(ID_PREFIX2, id);
  const useDragOverlay = Boolean(dragOverlay.rect !== null);
  const items = (0, import_react4.useMemo)(() => userDefinedItems.map((item) => typeof item === "object" && "id" in item ? item.id : item), [userDefinedItems]);
  const isDragging = active != null;
  const activeIndex = active ? items.indexOf(active.id) : -1;
  const overIndex = over ? items.indexOf(over.id) : -1;
  const previousItemsRef = (0, import_react4.useRef)(items);
  const itemsHaveChanged = !itemsEqual(items, previousItemsRef.current);
  const disableTransforms = overIndex !== -1 && activeIndex === -1 || itemsHaveChanged;
  const disabled = normalizeDisabled(disabledProp);
  useIsomorphicLayoutEffect(() => {
    if (itemsHaveChanged && isDragging) {
      measureDroppableContainers(items);
    }
  }, [itemsHaveChanged, items, isDragging, measureDroppableContainers]);
  (0, import_react4.useEffect)(() => {
    previousItemsRef.current = items;
  }, [items]);
  const contextValue = (0, import_react4.useMemo)(
    () => ({
      activeIndex,
      containerId,
      disabled,
      disableTransforms,
      items,
      overIndex,
      useDragOverlay,
      sortedRects: getSortedRects(items, droppableRects),
      strategy
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeIndex, containerId, disabled.draggable, disabled.droppable, disableTransforms, items, overIndex, droppableRects, useDragOverlay, strategy]
  );
  return import_react4.default.createElement(Context.Provider, {
    value: contextValue
  }, children);
}
var defaultNewIndexGetter = (_ref) => {
  let {
    id,
    items,
    activeIndex,
    overIndex
  } = _ref;
  return arrayMove(items, activeIndex, overIndex).indexOf(id);
};
var defaultAnimateLayoutChanges = (_ref2) => {
  let {
    containerId,
    isSorting,
    wasDragging,
    index,
    items,
    newIndex,
    previousItems,
    previousContainerId,
    transition
  } = _ref2;
  if (!transition || !wasDragging) {
    return false;
  }
  if (previousItems !== items && index === newIndex) {
    return false;
  }
  if (isSorting) {
    return true;
  }
  return newIndex !== index && containerId === previousContainerId;
};
var defaultTransition = {
  duration: 200,
  easing: "ease"
};
var transitionProperty = "transform";
var disabledTransition = /* @__PURE__ */ CSS2.Transition.toString({
  property: transitionProperty,
  duration: 0,
  easing: "linear"
});
var defaultAttributes = {
  roleDescription: "sortable"
};
function useDerivedTransform(_ref) {
  let {
    disabled,
    index,
    node,
    rect
  } = _ref;
  const [derivedTransform, setDerivedtransform] = (0, import_react4.useState)(null);
  const previousIndex = (0, import_react4.useRef)(index);
  useIsomorphicLayoutEffect(() => {
    if (!disabled && index !== previousIndex.current && node.current) {
      const initial = rect.current;
      if (initial) {
        const current = getClientRect(node.current, {
          ignoreTransform: true
        });
        const delta = {
          x: initial.left - current.left,
          y: initial.top - current.top,
          scaleX: initial.width / current.width,
          scaleY: initial.height / current.height
        };
        if (delta.x || delta.y) {
          setDerivedtransform(delta);
        }
      }
    }
    if (index !== previousIndex.current) {
      previousIndex.current = index;
    }
  }, [disabled, index, node, rect]);
  (0, import_react4.useEffect)(() => {
    if (derivedTransform) {
      setDerivedtransform(null);
    }
  }, [derivedTransform]);
  return derivedTransform;
}
function useSortable(_ref) {
  let {
    animateLayoutChanges = defaultAnimateLayoutChanges,
    attributes: userDefinedAttributes,
    disabled: localDisabled,
    data: customData,
    getNewIndex = defaultNewIndexGetter,
    id,
    strategy: localStrategy,
    resizeObserverConfig,
    transition = defaultTransition
  } = _ref;
  const {
    items,
    containerId,
    activeIndex,
    disabled: globalDisabled,
    disableTransforms,
    sortedRects,
    overIndex,
    useDragOverlay,
    strategy: globalStrategy
  } = (0, import_react4.useContext)(Context);
  const disabled = normalizeLocalDisabled(localDisabled, globalDisabled);
  const index = items.indexOf(id);
  const data = (0, import_react4.useMemo)(() => ({
    sortable: {
      containerId,
      index,
      items
    },
    ...customData
  }), [containerId, customData, index, items]);
  const itemsAfterCurrentSortable = (0, import_react4.useMemo)(() => items.slice(items.indexOf(id)), [items, id]);
  const {
    rect,
    node,
    isOver,
    setNodeRef: setDroppableNodeRef
  } = useDroppable({
    id,
    data,
    disabled: disabled.droppable,
    resizeObserverConfig: {
      updateMeasurementsFor: itemsAfterCurrentSortable,
      ...resizeObserverConfig
    }
  });
  const {
    active,
    activatorEvent,
    activeNodeRect,
    attributes,
    setNodeRef: setDraggableNodeRef,
    listeners,
    isDragging,
    over,
    setActivatorNodeRef,
    transform
  } = useDraggable({
    id,
    data,
    attributes: {
      ...defaultAttributes,
      ...userDefinedAttributes
    },
    disabled: disabled.draggable
  });
  const setNodeRef = useCombinedRefs(setDroppableNodeRef, setDraggableNodeRef);
  const isSorting = Boolean(active);
  const displaceItem = isSorting && !disableTransforms && isValidIndex(activeIndex) && isValidIndex(overIndex);
  const shouldDisplaceDragSource = !useDragOverlay && isDragging;
  const dragSourceDisplacement = shouldDisplaceDragSource && displaceItem ? transform : null;
  const strategy = localStrategy != null ? localStrategy : globalStrategy;
  const finalTransform = displaceItem ? dragSourceDisplacement != null ? dragSourceDisplacement : strategy({
    rects: sortedRects,
    activeNodeRect,
    activeIndex,
    overIndex,
    index
  }) : null;
  const newIndex = isValidIndex(activeIndex) && isValidIndex(overIndex) ? getNewIndex({
    id,
    items,
    activeIndex,
    overIndex
  }) : index;
  const activeId = active == null ? void 0 : active.id;
  const previous = (0, import_react4.useRef)({
    activeId,
    items,
    newIndex,
    containerId
  });
  const itemsHaveChanged = items !== previous.current.items;
  const shouldAnimateLayoutChanges = animateLayoutChanges({
    active,
    containerId,
    isDragging,
    isSorting,
    id,
    index,
    items,
    newIndex: previous.current.newIndex,
    previousItems: previous.current.items,
    previousContainerId: previous.current.containerId,
    transition,
    wasDragging: previous.current.activeId != null
  });
  const derivedTransform = useDerivedTransform({
    disabled: !shouldAnimateLayoutChanges,
    index,
    node,
    rect
  });
  (0, import_react4.useEffect)(() => {
    if (isSorting && previous.current.newIndex !== newIndex) {
      previous.current.newIndex = newIndex;
    }
    if (containerId !== previous.current.containerId) {
      previous.current.containerId = containerId;
    }
    if (items !== previous.current.items) {
      previous.current.items = items;
    }
  }, [isSorting, newIndex, containerId, items]);
  (0, import_react4.useEffect)(() => {
    if (activeId === previous.current.activeId) {
      return;
    }
    if (activeId != null && previous.current.activeId == null) {
      previous.current.activeId = activeId;
      return;
    }
    const timeoutId = setTimeout(() => {
      previous.current.activeId = activeId;
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [activeId]);
  return {
    active,
    activeIndex,
    attributes,
    data,
    rect,
    index,
    newIndex,
    items,
    isOver,
    isSorting,
    isDragging,
    listeners,
    node,
    overIndex,
    over,
    setNodeRef,
    setActivatorNodeRef,
    setDroppableNodeRef,
    setDraggableNodeRef,
    transform: derivedTransform != null ? derivedTransform : finalTransform,
    transition: getTransition()
  };
  function getTransition() {
    if (
      // Temporarily disable transitions for a single frame to set up derived transforms
      derivedTransform || // Or to prevent items jumping to back to their "new" position when items change
      itemsHaveChanged && previous.current.newIndex === index
    ) {
      return disabledTransition;
    }
    if (shouldDisplaceDragSource && !isKeyboardEvent(activatorEvent) || !transition) {
      return void 0;
    }
    if (isSorting || shouldAnimateLayoutChanges) {
      return CSS2.Transition.toString({
        ...transition,
        property: transitionProperty
      });
    }
    return void 0;
  }
}
function normalizeLocalDisabled(localDisabled, globalDisabled) {
  var _localDisabled$dragga, _localDisabled$droppa;
  if (typeof localDisabled === "boolean") {
    return {
      draggable: localDisabled,
      // Backwards compatibility
      droppable: false
    };
  }
  return {
    draggable: (_localDisabled$dragga = localDisabled == null ? void 0 : localDisabled.draggable) != null ? _localDisabled$dragga : globalDisabled.draggable,
    droppable: (_localDisabled$droppa = localDisabled == null ? void 0 : localDisabled.droppable) != null ? _localDisabled$droppa : globalDisabled.droppable
  };
}
function hasSortableData(entry) {
  if (!entry) {
    return false;
  }
  const data = entry.data.current;
  if (data && "sortable" in data && typeof data.sortable === "object" && "containerId" in data.sortable && "items" in data.sortable && "index" in data.sortable) {
    return true;
  }
  return false;
}
var directions = [KeyboardCode.Down, KeyboardCode.Right, KeyboardCode.Up, KeyboardCode.Left];
var sortableKeyboardCoordinates = (event, _ref) => {
  let {
    context: {
      active,
      collisionRect,
      droppableRects,
      droppableContainers,
      over,
      scrollableAncestors
    }
  } = _ref;
  if (directions.includes(event.code)) {
    event.preventDefault();
    if (!active || !collisionRect) {
      return;
    }
    const filteredContainers = [];
    droppableContainers.getEnabled().forEach((entry) => {
      if (!entry || entry != null && entry.disabled) {
        return;
      }
      const rect = droppableRects.get(entry.id);
      if (!rect) {
        return;
      }
      switch (event.code) {
        case KeyboardCode.Down:
          if (collisionRect.top < rect.top) {
            filteredContainers.push(entry);
          }
          break;
        case KeyboardCode.Up:
          if (collisionRect.top > rect.top) {
            filteredContainers.push(entry);
          }
          break;
        case KeyboardCode.Left:
          if (collisionRect.left > rect.left) {
            filteredContainers.push(entry);
          }
          break;
        case KeyboardCode.Right:
          if (collisionRect.left < rect.left) {
            filteredContainers.push(entry);
          }
          break;
      }
    });
    const collisions = closestCorners({
      active,
      collisionRect,
      droppableRects,
      droppableContainers: filteredContainers,
      pointerCoordinates: null
    });
    let closestId = getFirstCollision(collisions, "id");
    if (closestId === (over == null ? void 0 : over.id) && collisions.length > 1) {
      closestId = collisions[1].id;
    }
    if (closestId != null) {
      const activeDroppable = droppableContainers.get(active.id);
      const newDroppable = droppableContainers.get(closestId);
      const newRect = newDroppable ? droppableRects.get(newDroppable.id) : null;
      const newNode = newDroppable == null ? void 0 : newDroppable.node.current;
      if (newNode && newRect && activeDroppable && newDroppable) {
        const newScrollAncestors = getScrollableAncestors(newNode);
        const hasDifferentScrollAncestors = newScrollAncestors.some((element, index) => scrollableAncestors[index] !== element);
        const hasSameContainer = isSameContainer(activeDroppable, newDroppable);
        const isAfterActive = isAfter(activeDroppable, newDroppable);
        const offset = hasDifferentScrollAncestors || !hasSameContainer ? {
          x: 0,
          y: 0
        } : {
          x: isAfterActive ? collisionRect.width - newRect.width : 0,
          y: isAfterActive ? collisionRect.height - newRect.height : 0
        };
        const rectCoordinates = {
          x: newRect.left,
          y: newRect.top
        };
        const newCoordinates = offset.x && offset.y ? rectCoordinates : subtract(rectCoordinates, offset);
        return newCoordinates;
      }
    }
  }
  return void 0;
};
function isSameContainer(a, b) {
  if (!hasSortableData(a) || !hasSortableData(b)) {
    return false;
  }
  return a.data.current.sortable.containerId === b.data.current.sortable.containerId;
}
function isAfter(a, b) {
  if (!hasSortableData(a) || !hasSortableData(b)) {
    return false;
  }
  if (!isSameContainer(a, b)) {
    return false;
  }
  return a.data.current.sortable.index < b.data.current.sortable.index;
}

// plugins/profiles-client/src/client.tsx
var primitivesModule = __toESM(require("@deepseek-ai/dsh-client-ui-primitives"), 1);
var IconChevronDownOutline142 = primitivesModule.IconChevronDownOutline14;
var SortableCtx = SortableContext;
function BrainIcon14() {
  return /* @__PURE__ */ react.createElement("svg", { width: 14, height: 14, viewBox: "0 0 480 480", fill: "none", "aria-hidden": true }, /* @__PURE__ */ react.createElement("g", { transform: "matrix(2.6933 0 0 2.808 -33.019 -25.795)" }, /* @__PURE__ */ react.createElement(
    "g",
    {
      transform: "rotate(90,100,100)",
      fill: "none",
      stroke: "currentColor",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      strokeWidth: 14
    },
    /* @__PURE__ */ react.createElement("path", { d: "m96 166v-132c0-12-12-20-23-16-9 3-15 10-16 19-12-5-25 3-27 16-1 8 2 14 6 18-14 6-21 20-18 33 3 14 15 23 28 21-8 11-6 25 4 32 6 4 14 5 21 2 5 11 15 17 25 7z" }),
    /* @__PURE__ */ react.createElement("path", { d: "m102 100h50" }),
    /* @__PURE__ */ react.createElement("path", { d: "m102 72h28l25-25" }),
    /* @__PURE__ */ react.createElement("path", { d: "m102 128h28l25 25" }),
    /* @__PURE__ */ react.createElement("circle", { cx: "161", cy: "100", r: "9" }),
    /* @__PURE__ */ react.createElement("circle", { cx: "161", cy: "41", r: "9" }),
    /* @__PURE__ */ react.createElement("circle", { cx: "161", cy: "159", r: "9" }),
    /* @__PURE__ */ react.createElement("circle", { cx: "122", cy: "30", r: "9" }),
    /* @__PURE__ */ react.createElement("circle", { cx: "122", cy: "170", r: "9" })
  )));
}
function NetworkIcon14() {
  return /* @__PURE__ */ react.createElement(
    "svg",
    {
      width: 14,
      height: 14,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": true
    },
    /* @__PURE__ */ react.createElement("rect", { x: "16", y: "16", width: "6", height: "6", rx: "1" }),
    /* @__PURE__ */ react.createElement("rect", { x: "2", y: "16", width: "6", height: "6", rx: "1" }),
    /* @__PURE__ */ react.createElement("rect", { x: "9", y: "2", width: "6", height: "6", rx: "1" }),
    /* @__PURE__ */ react.createElement("path", { d: "M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" }),
    /* @__PURE__ */ react.createElement("path", { d: "M12 12V8" })
  );
}
var useSyncExternalStore2 = react.useSyncExternalStore;
var useCallback5 = react.useCallback;
var useState5 = react.useState;
var useEffect5 = react.useEffect;
var useRef5 = react.useRef;
var PLUGIN_NAME = "profiles-client";
var LOCALE_NS = "profiles-client";
function emptySubscribe() {
  return function() {
  };
}
var MODEL_SEAT_SLOT = "conversation.input.model";
var SEAT_PRIORITY = -100;
var STYLE_TAG_ID = "profiles-client/client.module.css";
injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settings_default, client_default));
var EN = {
  "seat.fallback": "Model",
  "seat.aria": "Select model or profile",
  "menu.profiles": "Profiles",
  "menu.default": "Profile default",
  "menu.models": "Models",
  "menu.searchPlaceholder": "Search models\u2026",
  "menu.noResults": "No models match"
};
var ZH = {
  "seat.fallback": "\u6A21\u578B",
  "seat.aria": "\u9009\u62E9\u6A21\u578B\u6216\u914D\u7F6E",
  "menu.profiles": "\u914D\u7F6E",
  "menu.default": "\u914D\u7F6E\u9ED8\u8BA4",
  "menu.models": "\u6A21\u578B",
  "menu.searchPlaceholder": "\u641C\u7D22\u6A21\u578B\u2026",
  "menu.noResults": "\u65E0\u5339\u914D\u6A21\u578B"
};
function inertScope() {
  var snapshot = Object.freeze({
    status: "unavailable",
    value: void 0,
    base: void 0,
    user: void 0,
    revision: void 0,
    writable: false
  });
  return {
    store: {
      subscribe: function() {
        return function() {
        };
      },
      getSnapshot: function() {
        return snapshot;
      }
    }
  };
}
function activeFace(profileValue) {
  var active = profileValue && typeof profileValue.active === "string" ? profileValue.active : "work";
  var chains = profileValue === void 0 || profileValue === null ? void 0 : profileValue.chains;
  var entry = profileValue === void 0 || profileValue === null ? void 0 : active === "personal" ? profileValue.personal : profileValue.work;
  return { active, head: entryHead(entry, chains) };
}
function refNameOf(field) {
  return typeof field === "string" ? field : void 0;
}
function isCompositionChain(value) {
  return Array.isArray(value);
}
function stepTextOf(step) {
  if (typeof step === "string") return step;
  if (step !== void 0 && step !== null && typeof step.provider === "string" && typeof step.model === "string") {
    return step.provider + "/" + step.model;
  }
  return "";
}
function fieldSummary(field, chains) {
  var refName = refNameOf(field);
  if (refName !== void 0) return refName;
  if (Array.isArray(field)) {
    var steps = field.map(stepTextOf).filter(function(t) {
      return t !== "";
    });
    return steps.length > 0 ? steps.join(", ") : "(empty)";
  }
  if (field !== void 0 && field !== null && Array.isArray(field.routes)) {
    var count = field.routes.length;
    return "inline (" + count + " route" + (count === 1 ? "" : "s") + ")";
  }
  return "inline (0 routes)";
}
function installTitleRewriter(ctx) {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  function desired() {
    try {
      var snap = ctx.sessions.list.getSnapshot();
      var id = snap.current;
      var row = id === void 0 ? void 0 : snap.byId[id];
      var title = row !== void 0 && row !== null && typeof row.title === "string" ? row.title : void 0;
      return title === void 0 ? "dsh" : "dsh | " + title;
    } catch (error) {
      return null;
    }
  }
  ctx.effect(function() {
    function enforce() {
      var want = desired();
      if (want !== null && document.title !== want) document.title = want;
    }
    enforce();
    var stopList = void 0;
    try {
      stopList = ctx.sessions.list.subscribe(enforce);
    } catch (error) {
      stopList = void 0;
    }
    var observer = new MutationObserver(enforce);
    observer.observe(document.head, { subtree: true, childList: true, characterData: true });
    return function() {
      if (stopList !== void 0) stopList();
      observer.disconnect();
    };
  }, "profiles-client: title rewriter");
}
function makeModelSeat(profileScope) {
  function ProfileModelSeat(props) {
    var locked = props.locked;
    var available = props.available;
    var directory = props.directory;
    var load = props.load;
    var select = props.select;
    var t = props.t;
    var seatSubscribe = useCallback5(
      function(fn) {
        return directory.subscribe(fn);
      },
      [directory]
    );
    var seatGetSnapshot = useCallback5(
      function() {
        return directory.getSnapshot();
      },
      [directory]
    );
    var state = useSyncExternalStore2(seatSubscribe, seatGetSnapshot);
    var profileSnap = useSyncExternalStore2(
      profileScope.store.subscribe,
      profileScope.store.getSnapshot
    );
    var profileValue = profileSnap.value;
    var openState = useState5(false);
    var open = openState[0];
    var setOpen = openState[1];
    var rootRef = useRef5(null);
    var searchState = useState5("");
    var modelQuery = searchState[0];
    var setModelQuery = searchState[1];
    var searchInputRef = useRef5(null);
    var profileConfigState = useState5(null);
    var profileConfig = profileConfigState[0];
    var setProfileConfig = profileConfigState[1];
    var errorDownState = useState5([]);
    var errorDown = errorDownState[0];
    var setErrorDown = errorDownState[1];
    var effortOpenState = useState5(false);
    var effortOpen = effortOpenState[0];
    var setEffortOpen = effortOpenState[1];
    var effortPosState = useState5(null);
    var effortPos = effortPosState[0];
    var setEffortPos = effortPosState[1];
    var effortRowRef = useRef5(null);
    var menuRef = useRef5(null);
    var effortPanelRef = useRef5(null);
    useEffect5(
      function() {
        if (open) {
          if (searchInputRef.current) searchInputRef.current.focus();
        } else {
          setModelQuery("");
        }
      },
      [open]
    );
    useEffect5(
      function() {
        if (available) load();
      },
      [available, load]
    );
    useEffect5(
      function() {
        if (!open) return;
        var closeOutside = function(event) {
          if (rootRef.current !== null && !rootRef.current.contains(event.target))
            setOpen(false);
        };
        document.addEventListener("mousedown", closeOutside);
        return function() {
          document.removeEventListener("mousedown", closeOutside);
        };
      },
      [open]
    );
    useEffect5(
      function() {
        if (!open) {
          setEffortOpen(false);
          setEffortPos(null);
        }
      },
      [open]
    );
    useEffect5(
      function() {
        if (!effortOpen) return;
        if (effortPanelRef.current === null) return;
        if (effortPos === null) return;
        var rect = effortPanelRef.current.getBoundingClientRect();
        var nextTop = effortPos.top;
        var nextLeft = effortPos.left;
        var changed = false;
        if (rect.bottom > window.innerHeight - 8) {
          nextTop = Math.max(8, window.innerHeight - rect.height - 8);
          changed = true;
        }
        if (rect.top < 8) {
          nextTop = 8;
          changed = true;
        }
        if (rect.right > window.innerWidth - 8) {
          nextLeft = Math.max(8, window.innerWidth - rect.width - 8);
          changed = true;
        }
        if (rect.left < 8) {
          nextLeft = 8;
          changed = true;
        }
        if (changed) setEffortPos({ top: nextTop, left: nextLeft });
      },
      [effortOpen]
    );
    var fetchProfiles = function() {
      fetchJson("/profiles/config").then(function(result) {
        if (result.error) return;
        if (result.data !== null && result.data !== void 0 && result.data.config !== null && result.data.config !== void 0) {
          setProfileConfig(result.data.config);
        }
        var down = result.data !== null && result.data !== void 0 && result.data.errorCache !== null && result.data.errorCache !== void 0 && Array.isArray(result.data.errorCache.down) ? result.data.errorCache.down : [];
        setErrorDown(down);
      });
    };
    var resetErrorCache = function() {
      request("DELETE", "/profiles/error-cache").then(function() {
        fetchProfiles();
      });
    };
    useEffect5(
      function() {
        if (available) fetchProfiles();
      },
      [available]
    );
    if (!available) return null;
    var current = state.current;
    var liveProfile = profileConfig !== null ? profileConfig : profileValue;
    var face = activeFace(liveProfile);
    var matched = current !== void 0 && current !== null && face.head !== void 0 && current.provider === face.head.provider && current.model === face.head.model;
    var profileRows = [];
    if (liveProfile !== void 0 && liveProfile !== null) {
      var known = ["work", "personal"];
      for (var i = 0; i < known.length; i++) {
        var key = known[i];
        var head = entryHead(liveProfile[key], liveProfile.chains);
        if (head !== void 0) profileRows.push({ key, head });
      }
    }
    var prettyOf = function(provider, model) {
      for (var g2 = 0; g2 < state.groups.length; g2++) {
        if (state.groups[g2].id !== provider) continue;
        var plabel = typeof state.groups[g2].name === "string" && state.groups[g2].name !== "" ? state.groups[g2].name : provider;
        for (var m2 = 0; m2 < state.groups[g2].models.length; m2++) {
          if (state.groups[g2].models[m2].id === model) {
            return { provider: plabel, model: state.groups[g2].models[m2].name };
          }
        }
        return { provider: plabel, model };
      }
      return { provider, model };
    };
    var trimmedQuery = modelQuery.trim().toLowerCase();
    var modelGroups = [];
    for (var g = 0; g < state.groups.length; g++) {
      var group = state.groups[g];
      if (group.models === void 0 || group.models.length === 0) continue;
      var providerLabel = typeof group.name === "string" && group.name !== "" ? group.name : group.id;
      var models = [];
      for (var m = 0; m < group.models.length; m++) {
        var gm = group.models[m];
        if (trimmedQuery !== "") {
          var hay = (gm.name + " " + gm.id + " " + group.id + " " + providerLabel).toLowerCase();
          if (hay.indexOf(trimmedQuery) === -1) continue;
        }
        models.push({ id: gm.id, name: gm.name });
      }
      if (models.length === 0) continue;
      modelGroups.push({ id: group.id, label: providerLabel, models });
    }
    var pick = function(selection) {
      select(selection).then(
        function(accepted) {
          if (accepted) setOpen(false);
          if (accepted) {
            request("DELETE", "/profiles/error-cache").then(function() {
              fetchProfiles();
            });
          }
        },
        function() {
        }
      );
    };
    function seatEffortsOf(reasoning) {
      if (reasoning !== void 0 && reasoning !== null && Array.isArray(reasoning.efforts)) {
        return reasoning.efforts;
      }
      return [];
    }
    var onKeyDown = function(event) {
      if (event.key === "Escape" && open) {
        if (effortOpen) {
          event.preventDefault();
          event.stopPropagation();
          setEffortOpen(false);
          setEffortPos(null);
          return;
        }
        event.preventDefault();
        setOpen(false);
      }
    };
    var currentPretty = current !== void 0 && current !== null ? prettyOf(current.provider, current.model) : null;
    var headText = face.head !== void 0 && face.head !== null ? face.head.model + " (" + face.head.provider + ")" : null;
    var hasProfile = face.active !== void 0 && face.active !== "";
    var triggerModelText = currentPretty !== null ? currentPretty.model : face.head !== void 0 && face.head !== null ? prettyOf(face.head.provider, face.head.model).model : t("seat.fallback");
    var triggerProviderText = currentPretty !== null ? currentPretty.provider : face.head !== void 0 && face.head !== null ? prettyOf(face.head.provider, face.head.model).provider : null;
    var triggerModelRaw = current !== void 0 && current !== null ? current.provider + "/" + current.model : face.head !== void 0 && face.head !== null ? face.head.provider + "/" + face.head.model : triggerModelText;
    var triggerProviderRaw = current !== void 0 && current !== null ? current.provider : face.head !== void 0 && face.head !== null ? face.head.provider : "";
    var seatCurrentCat = null;
    if (current !== void 0 && current !== null) {
      for (var sgi = 0; sgi < state.groups.length; sgi++) {
        if (state.groups[sgi].id !== current.provider) continue;
        var sgModels = state.groups[sgi].models !== void 0 && state.groups[sgi].models !== null ? state.groups[sgi].models : [];
        for (var smi = 0; smi < sgModels.length; smi++) {
          if (sgModels[smi].id === current.model) {
            seatCurrentCat = sgModels[smi];
            break;
          }
        }
        break;
      }
    }
    var seatEffortList = seatCurrentCat !== null ? seatEffortsOf(seatCurrentCat.reasoning) : [];
    var seatEffortValue = current !== void 0 && current !== null && typeof current.reasoningEffort === "string" && current.reasoningEffort !== "" ? current.reasoningEffort : "";
    var seatEffortStops = [{ id: "", name: "Default" }].concat(
      seatEffortList.map(function(eff) {
        return { id: eff.id, name: eff.name };
      })
    );
    var seatEffortIndex = 0;
    for (var sei = 0; sei < seatEffortStops.length; sei++) {
      if (seatEffortStops[sei].id === seatEffortValue) {
        seatEffortIndex = sei;
        break;
      }
    }
    var seatEffortName = seatEffortStops[seatEffortIndex].name;
    var stopLeftOf = function(index) {
      if (seatEffortStops.length <= 1) return "50%";
      return "calc(0.4375rem + (100% - 0.875rem) * " + index + " / " + (seatEffortStops.length - 1) + ")";
    };
    var closeEffort = function() {
      setEffortOpen(false);
      setEffortPos(null);
    };
    var toggleEffort = function() {
      if (effortOpen) {
        closeEffort();
        return;
      }
      var rowRect = effortRowRef.current !== null ? effortRowRef.current.getBoundingClientRect() : null;
      var menuRect = menuRef.current !== null ? menuRef.current.getBoundingClientRect() : null;
      var panelWidth = 240;
      var gap = 8;
      var top = rowRect !== null ? rowRect.top : 100;
      var left = 100;
      if (menuRect !== null) {
        if (menuRect.left >= panelWidth + gap + 8) {
          left = menuRect.left - panelWidth - gap;
        } else {
          left = menuRect.right + gap;
          if (left + panelWidth > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - panelWidth - 8);
          }
        }
      } else if (rowRect !== null) {
        if (rowRect.left >= panelWidth + gap + 8) {
          left = rowRect.left - panelWidth - gap;
        } else {
          left = rowRect.right + gap;
        }
      }
      var estHeight = 160;
      var maxTop = window.innerHeight - estHeight - 8;
      if (maxTop < 8) maxTop = 8;
      if (top < 8) top = 8;
      if (top > maxTop) top = maxTop;
      setEffortPos({ top, left });
      setEffortOpen(true);
    };
    var onMenuScroll = function() {
      if (effortOpen) closeEffort();
    };
    return /* @__PURE__ */ react.createElement("div", { className: "profiles-client-root", ref: rootRef, onKeyDown }, /* @__PURE__ */ react.createElement(
      "button",
      {
        type: "button",
        className: "profiles-client-trigger",
        "aria-haspopup": "listbox",
        "aria-expanded": open,
        "aria-label": t("seat.aria"),
        disabled: locked === true,
        onClick: function() {
          var next = !open;
          setOpen(next);
          if (next) fetchProfiles();
          load();
        }
      },
      /* @__PURE__ */ react.createElement("span", { className: "profiles-client-badge" }, hasProfile ? /* @__PURE__ */ react.createElement(
        "span",
        {
          className: "profiles-client-badge-segment",
          title: "profile " + face.active + (matched ? "" : " (off profile head)"),
          "data-dsh-tip": ""
        },
        /* @__PURE__ */ react.createElement(
          "span",
          {
            className: "profiles-client-pill-dot" + (matched ? " profiles-client-pill-dot-matched" : " profiles-client-pill-dot-changed"),
            "aria-hidden": true
          }
        ),
        /* @__PURE__ */ react.createElement("span", { className: "profiles-client-profile-name" }, face.active)
      ) : null, triggerProviderText !== null ? /* @__PURE__ */ react.createElement(
        "span",
        {
          className: "profiles-client-badge-segment",
          title: "provider " + triggerProviderRaw,
          "data-dsh-tip": ""
        },
        /* @__PURE__ */ react.createElement(NetworkIcon14, null),
        /* @__PURE__ */ react.createElement("span", { className: "profiles-client-model-provider" }, triggerProviderText)
      ) : null, /* @__PURE__ */ react.createElement(
        "span",
        {
          className: "profiles-client-badge-segment profiles-client-badge-model",
          title: "model " + triggerModelRaw,
          "data-dsh-tip": ""
        },
        /* @__PURE__ */ react.createElement(BrainIcon14, null),
        /* @__PURE__ */ react.createElement("span", { className: "profiles-client-model-name" }, triggerModelText)
      ), !matched && current !== void 0 && current !== null ? /* @__PURE__ */ react.createElement(
        "span",
        {
          className: "profiles-client-badge-segment",
          title: "override: " + current.provider + "/" + current.model,
          "data-dsh-tip": "",
          onAuxClick: function(event) {
            if (event.button === 1) {
              event.preventDefault();
              event.stopPropagation();
              resetErrorCache();
            }
          }
        },
        /* @__PURE__ */ react.createElement("span", { className: "profiles-client-model-name" }, "~")
      ) : null),
      /* @__PURE__ */ react.createElement(
        IconChevronDownOutline142,
        {
          className: open ? "profiles-client-chevron profiles-client-chevron-open" : "profiles-client-chevron",
          "aria-hidden": true
        }
      )
    ), open ? /* @__PURE__ */ react.createElement(
      "div",
      {
        className: "profiles-client-menu",
        role: "listbox",
        ref: menuRef,
        onScroll: onMenuScroll
      },
      seatEffortList.length > 0 && current !== void 0 && current !== null ? /* @__PURE__ */ react.createElement("div", null, /* @__PURE__ */ react.createElement(
        "button",
        {
          type: "button",
          className: "profiles-client-option",
          ref: effortRowRef,
          "aria-expanded": effortOpen,
          "aria-haspopup": "dialog",
          onClick: toggleEffort
        },
        /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-copy" }, /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-name" }, "Reasoning"), /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-detail" }, seatEffortName)),
        /* @__PURE__ */ react.createElement("span", { className: "profiles-client-effort-chevron", "aria-hidden": true }, "\u203A")
      ), effortOpen ? /* @__PURE__ */ react.createElement(
        "div",
        {
          className: "profiles-client-effort-popover",
          ref: effortPanelRef,
          role: "dialog",
          "aria-label": "Model reasoning effort",
          style: {
            top: effortPos !== null ? effortPos.top : 0,
            left: effortPos !== null ? effortPos.left : 0
          }
        },
        /* @__PURE__ */ react.createElement("div", { className: "profiles-client-effort-row" }, /* @__PURE__ */ react.createElement("div", { className: "profiles-client-effort-slider-wrap" }, /* @__PURE__ */ react.createElement(
          "input",
          {
            type: "range",
            className: "profiles-client-effort-slider",
            min: 0,
            max: seatEffortStops.length - 1,
            step: 1,
            value: seatEffortIndex,
            "aria-label": "Model reasoning effort",
            onChange: function(event) {
              var index = Number(event.target.value);
              var stop = seatEffortStops[index];
              select({
                provider: current.provider,
                model: current.model,
                reasoningEffort: stop !== void 0 && stop.id !== "" ? stop.id : void 0
              });
            }
          }
        ), seatEffortStops.map(function(stop, tickIndex) {
          return /* @__PURE__ */ react.createElement(
            "span",
            {
              key: stop.id !== "" ? stop.id : "default",
              className: "profiles-client-effort-tick",
              "aria-hidden": true,
              style: { left: stopLeftOf(tickIndex) }
            }
          );
        })), /* @__PURE__ */ react.createElement("div", { className: "profiles-client-effort-labels" }, seatEffortStops.map(function(stop, labelIndex) {
          return /* @__PURE__ */ react.createElement(
            "span",
            {
              key: stop.id !== "" ? stop.id : "default",
              className: labelIndex === seatEffortIndex ? "profiles-client-effort-stop profiles-client-effort-stop-active" : "profiles-client-effort-stop",
              style: { left: stopLeftOf(labelIndex) }
            },
            stop.name
          );
        })))
      ) : null) : null,
      profileRows.length > 0 ? /* @__PURE__ */ react.createElement("div", null, /* @__PURE__ */ react.createElement("div", { className: "dsp-section-title" }, t("menu.profiles")), profileRows.map(function(row) {
        var isActive = row.key === face.active;
        var headPretty = prettyOf(row.head.provider, row.head.model);
        return /* @__PURE__ */ react.createElement(
          "button",
          {
            key: row.key,
            type: "button",
            className: "profiles-client-option",
            onClick: function() {
              putJson("/profiles/switch", { active: row.key }).then(
                function(result) {
                  if (!result.error) setOpen(false);
                  if (!result.error) {
                    request("DELETE", "/profiles/error-cache").then(function() {
                      fetchProfiles();
                    });
                  }
                }
              );
            }
          },
          /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-copy" }, /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-name profiles-client-option-profile" }, row.key + (isActive ? " \xB7" : "")), /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-detail" }, headPretty.provider + "/" + headPretty.model)),
          isActive ? /* @__PURE__ */ react.createElement("span", { className: "profiles-client-check", "aria-hidden": true }, "\u2713") : null
        );
      })) : null,
      /* @__PURE__ */ react.createElement("div", null, /* @__PURE__ */ react.createElement("div", { className: "dsp-section-title" }, t("menu.models")), /* @__PURE__ */ react.createElement(
        "button",
        {
          type: "button",
          className: "profiles-client-option",
          onClick: function() {
            if (face.head !== void 0) pick(face.head);
          }
        },
        /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-copy" }, /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-name profiles-client-option-profile" }, t("menu.default")), /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-detail" }, face.head !== void 0 ? prettyOf(face.head.provider, face.head.model).provider + "/" + prettyOf(face.head.provider, face.head.model).model : ""))
      ), /* @__PURE__ */ react.createElement(
        "input",
        {
          ref: searchInputRef,
          className: "profiles-client-search",
          type: "search",
          placeholder: t("menu.searchPlaceholder"),
          value: modelQuery,
          "aria-label": t("menu.searchPlaceholder"),
          onChange: function(event) {
            setModelQuery(event.target.value);
          },
          onKeyDown: function(event) {
            event.stopPropagation();
          },
          onMouseDown: function(event) {
            event.stopPropagation();
          }
        }
      ), state.status === "error" && state.error ? /* @__PURE__ */ react.createElement("div", { className: "profiles-client-strip" }, state.error) : null, modelGroups.length === 0 && trimmedQuery !== "" ? /* @__PURE__ */ react.createElement("div", { className: "profiles-client-strip" }, t("menu.noResults")) : modelGroups.map(function(grp) {
        return /* @__PURE__ */ react.createElement("div", { key: grp.id }, /* @__PURE__ */ react.createElement("div", { className: "dsp-section-title" }, grp.label), grp.models.map(function(row) {
          var isActive = current !== void 0 && current !== null && current.provider === grp.id && current.model === row.id;
          return /* @__PURE__ */ react.createElement(
            "button",
            {
              key: grp.id + "/" + row.id,
              type: "button",
              className: "profiles-client-option",
              onClick: function() {
                pick({ provider: grp.id, model: row.id });
              }
            },
            /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-copy profiles-client-option-copy-model" }, /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-name profiles-client-option-model" }, row.name), /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-detail" }, grp.label)),
            isActive ? /* @__PURE__ */ react.createElement("span", { className: "profiles-client-check", "aria-hidden": true }, "\u2713") : null
          );
        }));
      })),
      errorDown.length > 0 ? /* @__PURE__ */ react.createElement("div", { className: "profiles-client-error-row" }, /* @__PURE__ */ react.createElement("span", { className: "profiles-client-error-count" }, errorDown.length + " cached down"), /* @__PURE__ */ react.createElement(
        "button",
        {
          type: "button",
          className: "profiles-client-error-reset",
          onClick: function() {
            resetErrorCache();
          }
        },
        "Reset"
      )) : null
    ) : null);
  }
  return ProfileModelSeat;
}
function SettingsSection(props) {
  return /* @__PURE__ */ react.createElement("div", { className: "dsp-root" }, /* @__PURE__ */ react.createElement("div", { className: "dsp-head" }, /* @__PURE__ */ react.createElement("h3", { className: "dsp-title" }, props.title), props.onRefresh ? /* @__PURE__ */ react.createElement("button", { className: "dsp-refresh", onClick: props.onRefresh }, props.refreshLabel === void 0 ? "Refresh" : props.refreshLabel) : null), props.children);
}
function SortableRung(props) {
  var sort = useSortable({ id: props.id });
  var style = {
    transition: sort.transition === null || sort.transition === void 0 ? void 0 : sort.transition
  };
  if (sort.transform !== null && sort.transform !== void 0) {
    style.transform = "translate3d(" + sort.transform.x + "px, " + sort.transform.y + "px, 0)";
  }
  if (sort.isDragging) {
    style.opacity = 0.4;
  }
  return /* @__PURE__ */ react.createElement("div", { ref: sort.setNodeRef, style, className: props.className }, props.children({ attributes: sort.attributes, listeners: sort.listeners }));
}
function cloneConfig(config) {
  function cloneRoutes(routes) {
    return (routes || []).map(function(r) {
      var out = {
        provider: r.provider,
        model: r.model
      };
      if (typeof r.reasoningEffort === "string" && r.reasoningEffort !== "")
        out.reasoningEffort = r.reasoningEffort;
      return out;
    });
  }
  function cloneEntry(entry) {
    return {
      orchestrator: cloneEntryField(entry && entry.orchestrator),
      subagent: cloneEntryField(entry && entry.subagent)
    };
  }
  function cloneEntryField(field) {
    if (typeof field === "string") return field;
    return { routes: cloneRoutes(field && field.routes) };
  }
  function cloneChains(chains) {
    var out = {};
    if (chains === void 0 || chains === null) return out;
    Object.keys(chains).forEach(function(name2) {
      var value = chains[name2];
      if (Array.isArray(value)) {
        out[name2] = value.map(function(step) {
          if (step === null || typeof step !== "object") return step;
          var copy = {
            provider: step.provider,
            model: step.model
          };
          if (typeof step.reasoningEffort === "string" && step.reasoningEffort !== "")
            copy.reasoningEffort = step.reasoningEffort;
          return copy;
        });
      } else {
        out[name2] = { routes: cloneRoutes(value && value.routes) };
      }
    });
    return out;
  }
  return {
    active: config && config.active ? config.active : "work",
    chains: cloneChains(config && config.chains),
    work: cloneEntry(config && config.work),
    personal: cloneEntry(config && config.personal)
  };
}
function makeProfilesPanel(models, sessions) {
  function ProfilesPanel() {
    var sessionSnap = useSyncExternalStore2(sessions.list.subscribe, sessions.list.getSnapshot);
    var sessionId = sessionSnap !== null && sessionSnap !== void 0 ? sessionSnap.current : null;
    var usable = sessionId !== null && sessionId !== void 0 ? sessions.subagentAddress(sessionId) === void 0 : false;
    var directory = sessionId !== null && sessionId !== void 0 ? models.directoryFor(sessionId) : null;
    var catalogSubscribe = useCallback5(
      function(cb) {
        return directory ? directory.store.subscribe(cb) : emptySubscribe();
      },
      [directory]
    );
    var catalogGetSnapshot = useCallback5(
      function() {
        return directory ? directory.store.getSnapshot() : null;
      },
      [directory]
    );
    var catalogState = useSyncExternalStore2(catalogSubscribe, catalogGetSnapshot);
    useEffect5(
      function() {
        if (directory && usable) directory.load().catch(function() {
        });
      },
      [directory, usable]
    );
    var catalogGroups = catalogState !== null && catalogState !== void 0 && Array.isArray(catalogState.groups) ? catalogState.groups : [];
    var loadState = useState5(null);
    var load = loadState[0];
    var setLoad = loadState[1];
    var draftState = useState5(null);
    var draft = draftState[0];
    var setDraft = draftState[1];
    var saveState = useState5({ busy: false, note: null, ok: true });
    var save = saveState[0];
    var sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );
    var addingState = useState5(false);
    var addingChain = addingState[0];
    var setAddingChain = addingState[1];
    var chainNameState = useState5("");
    var chainNameInput = chainNameState[0];
    var setChainNameInput = chainNameState[1];
    var setSave = saveState[1];
    var catalogModels = [];
    for (var cg = 0; cg < catalogGroups.length; cg++) {
      var cgrp = catalogGroups[cg];
      var cmodels = cgrp.models !== void 0 && cgrp.models !== null ? cgrp.models : [];
      for (var cm = 0; cm < cmodels.length; cm++) {
        var cmod = cmodels[cm];
        catalogModels.push({
          provider: cgrp.id,
          model: cmod.id,
          label: (typeof cgrp.name === "string" && cgrp.name !== "" ? cgrp.name : cgrp.id) + " / " + cmod.name,
          reasoning: cmod.reasoning
        });
      }
    }
    function effortsOf(reasoning) {
      if (reasoning !== void 0 && reasoning !== null && Array.isArray(reasoning.efforts)) {
        return reasoning.efforts;
      }
      return [];
    }
    var setEntryChain = function(name2, chainKey, chainName) {
      setDraft(function(prev) {
        var next = cloneConfig(prev);
        next[name2][chainKey] = chainName === "" ? { routes: [] } : chainName;
        return next;
      });
    };
    var detachEntryField = function(name2, chainKey) {
      setDraft(function(prev) {
        var next = cloneConfig(prev);
        next[name2][chainKey] = { routes: [] };
        return next;
      });
    };
    var setChainRungModel = function(chainName, index, value) {
      setDraft(function(prev) {
        var next = cloneConfig(prev);
        var chain = next.chains[chainName];
        if (chain === void 0) return next;
        if (Array.isArray(chain)) {
          chain[index] = value === "" ? "" : value;
        } else if (chain.routes !== void 0) {
          if (value === "") {
            chain.routes[index] = { provider: "", model: "" };
          } else {
            var slash = value.indexOf("/");
            if (slash > 0) {
              chain.routes[index] = {
                provider: value.slice(0, slash),
                model: value.slice(slash + 1)
              };
            }
          }
        }
        return next;
      });
    };
    var setChainRungEffort = function(chainName, index, effort) {
      setDraft(function(prev) {
        var next = cloneConfig(prev);
        var chain = next.chains[chainName];
        if (chain === void 0) return next;
        if (Array.isArray(chain)) {
          var step = chain[index];
          if (typeof step === "string") {
            if (effort === "") return next;
            if (step.indexOf("chain:") === 0) return next;
            if (next.chains[step] !== void 0) return next;
            var slash = step.indexOf("/");
            if (slash <= 0) return next;
            chain[index] = {
              provider: step.slice(0, slash),
              model: step.slice(slash + 1),
              reasoningEffort: effort
            };
            return next;
          }
          if (step !== null && typeof step === "object" && step.provider !== void 0) {
            if (effort === "") {
              chain[index] = step.provider + "/" + step.model;
            } else {
              step.reasoningEffort = effort;
            }
          }
          return next;
        }
        if (chain.routes !== void 0 && chain.routes[index] !== void 0) {
          if (effort === "") {
            delete chain.routes[index].reasoningEffort;
          } else {
            chain.routes[index].reasoningEffort = effort;
          }
        }
        return next;
      });
    };
    var setChainStepModel = function(chainName, index, value) {
      setDraft(function(prev) {
        var next = cloneConfig(prev);
        var chain = next.chains[chainName];
        if (chain === void 0 || !Array.isArray(chain)) return next;
        if (value === "") {
          chain[index] = "";
          return next;
        }
        if (value.indexOf("chain:") === 0) {
          chain[index] = value;
          return next;
        }
        var slash = value.indexOf("/");
        if (slash <= 0) {
          chain[index] = value;
          return next;
        }
        var step = chain[index];
        if (step !== null && typeof step === "object") {
          var newProvider = value.slice(0, slash);
          var newModel = value.slice(slash + 1);
          var oldEffort = typeof step.reasoningEffort === "string" ? step.reasoningEffort : "";
          var keepEffort = false;
          if (oldEffort !== "") {
            for (var kci = 0; kci < catalogModels.length; kci++) {
              if (catalogModels[kci].provider === newProvider && catalogModels[kci].model === newModel) {
                var advertised = effortsOf(catalogModels[kci].reasoning);
                for (var kei = 0; kei < advertised.length; kei++) {
                  if (advertised[kei].id === oldEffort) {
                    keepEffort = true;
                    break;
                  }
                }
                break;
              }
            }
          }
          if (keepEffort) {
            chain[index] = {
              provider: newProvider,
              model: newModel,
              reasoningEffort: oldEffort
            };
          } else {
            chain[index] = { provider: newProvider, model: newModel };
          }
        } else {
          chain[index] = value;
        }
        return next;
      });
    };
    var appendChainRung = function(chainName, value) {
      setDraft(function(prev) {
        var next = cloneConfig(prev);
        var chain = next.chains[chainName];
        if (chain === void 0) return next;
        if (value.indexOf("chain:") === 0) {
          if (Array.isArray(chain)) {
            chain.push(value);
          } else if (chain.routes !== void 0) {
            var composed2 = chain.routes.map(function(r) {
              return r.provider + "/" + r.model;
            });
            composed2.push(value);
            next.chains[chainName] = composed2;
          }
          return next;
        }
        var slash = value.indexOf("/");
        if (slash <= 0) return next;
        var rung = { provider: value.slice(0, slash), model: value.slice(slash + 1) };
        if (Array.isArray(chain)) {
          chain.push(value);
        } else if (chain.routes !== void 0) {
          chain.routes.push(rung);
        }
        return next;
      });
    };
    var fetchConfig = function() {
      setSave({ busy: false, note: null, ok: true });
      fetchJson("/profiles/config").then(function(result) {
        if (result.error) {
          setLoad({ error: result.error });
          return;
        }
        setLoad(result.data);
        setDraft(cloneConfig(result.data.config));
      });
    };
    useEffect5(function() {
      fetchConfig();
    }, []);
    if (load === null) {
      return /* @__PURE__ */ react.createElement(SettingsSection, { title: "Profiles", onRefresh: fetchConfig, refreshLabel: "Refresh" });
    }
    if (load.error) {
      return /* @__PURE__ */ react.createElement(SettingsSection, { title: "Profiles", onRefresh: fetchConfig, refreshLabel: "Refresh" }, /* @__PURE__ */ react.createElement("div", { className: "dsp-err" }, "Profiles: " + load.error));
    }
    var config = draft;
    var errorCache = load.errorCache || {};
    var setActive = function(name2) {
      setDraft(function(prev) {
        var next = cloneConfig(prev);
        next.active = name2;
        return next;
      });
    };
    var removeChainRung = function(chainName, index) {
      setDraft(function(prev) {
        var next = cloneConfig(prev);
        var chain = next.chains[chainName];
        if (chain === void 0) return next;
        if (Array.isArray(chain)) {
          chain.splice(index, 1);
        } else if (chain.routes !== void 0) {
          chain.routes.splice(index, 1);
        }
        return next;
      });
    };
    var moveChainRung = function(chainName, from, to) {
      setDraft(function(prev) {
        var next = cloneConfig(prev);
        var chain = next.chains[chainName];
        if (chain === void 0 || from === to) return next;
        var list = Array.isArray(chain) ? chain : chain.routes;
        if (list === void 0 || from < 0 || to < 0 || from >= list.length || to >= list.length) {
          return next;
        }
        var moved = list.splice(from, 1)[0];
        list.splice(to, 0, moved);
        return next;
      });
    };
    var commitChain = function() {
      var key = chainNameInput.trim();
      if (key === "") return;
      setDraft(function(prev) {
        var next = cloneConfig(prev);
        if (next.chains[key] === void 0) {
          next.chains[key] = { routes: [] };
        }
        return next;
      });
      setChainNameInput("");
      setAddingChain(false);
    };
    var removeChain = function(chainName) {
      setDraft(function(prev) {
        var next = cloneConfig(prev);
        delete next.chains[chainName];
        return next;
      });
    };
    var saveConfig = function() {
      var body = {
        active: config.active,
        chains: config.chains,
        work: {
          orchestrator: config.work.orchestrator,
          subagent: config.work.subagent
        },
        personal: {
          orchestrator: config.personal.orchestrator,
          subagent: config.personal.subagent
        }
      };
      setSave({ busy: true, note: null, ok: true });
      putJson("/profiles/config", body).then(function(result) {
        if (result.error) {
          setSave({ busy: false, note: result.error, ok: false });
          return;
        }
        setSave({ busy: false, note: "Saved", ok: true });
        setLoad(result.data);
        setDraft(cloneConfig(result.data.config));
      });
    };
    var downRungs = (errorCache.down || []).length;
    var chainKeys = Object.keys(config.chains);
    function catalogHasRoute(value) {
      if (typeof value !== "string") return false;
      var slash = value.indexOf("/");
      if (slash <= 0) return false;
      var provider = value.slice(0, slash);
      var model = value.slice(slash + 1);
      for (var hi = 0; hi < catalogModels.length; hi++) {
        if (catalogModels[hi].provider === provider && catalogModels[hi].model === model) {
          return true;
        }
      }
      return false;
    }
    function stepIsKnown(value) {
      if (value === "" || value === void 0) return true;
      if (typeof value !== "string") return true;
      if (value.indexOf("chain:") === 0) {
        return chainKeys.indexOf(value.slice("chain:".length)) !== -1;
      }
      if (chainKeys.indexOf(value) !== -1) return true;
      return catalogHasRoute(value);
    }
    function staleStepOption(value) {
      if (value === "" || value === void 0 || stepIsKnown(value)) return null;
      return /* @__PURE__ */ react.createElement("option", { value }, value + " (not in catalog)");
    }
    function entryRefIsKnown(ref) {
      if (ref === void 0) return true;
      return chainKeys.indexOf(ref) !== -1;
    }
    function modelChainOptions(includeChains) {
      var groups = [];
      if (includeChains && chainKeys.length > 0) {
        groups.push(
          /* @__PURE__ */ react.createElement("optgroup", { key: "chains", label: "Chains" }, chainKeys.map(function(key) {
            return /* @__PURE__ */ react.createElement("option", { key: "chain:" + key, value: "chain:" + key }, "chain:" + key);
          }))
        );
      }
      for (var g = 0; g < catalogGroups.length; g++) {
        var group = catalogGroups[g];
        if (group.models === void 0 || group.models.length === 0) continue;
        groups.push(
          /* @__PURE__ */ react.createElement("optgroup", { key: group.id, label: group.name || group.id }, group.models.map(function(m) {
            return /* @__PURE__ */ react.createElement("option", { key: group.id + "/" + m.id, value: group.id + "/" + m.id }, (group.name || group.id) + " / " + m.name);
          }))
        );
      }
      return groups;
    }
    var entries = ["work", "personal"];
    var currentModel = catalogState !== void 0 && catalogState !== null ? catalogState.current : void 0;
    var currentCat = null;
    if (currentModel !== void 0 && currentModel !== null) {
      for (var cmi = 0; cmi < catalogModels.length; cmi++) {
        if (catalogModels[cmi].provider === currentModel.provider && catalogModels[cmi].model === currentModel.model) {
          currentCat = catalogModels[cmi];
          break;
        }
      }
    }
    var currentEffortList = currentCat !== null ? effortsOf(currentCat.reasoning) : [];
    var currentEffortValue = currentModel !== void 0 && currentModel !== null && typeof currentModel.reasoningEffort === "string" && currentModel.reasoningEffort !== "" ? currentModel.reasoningEffort : currentCat !== null && currentCat.reasoning !== void 0 && currentCat.reasoning !== null && typeof currentCat.reasoning.defaultEffort === "string" ? currentCat.reasoning.defaultEffort : "";
    return /* @__PURE__ */ react.createElement(SettingsSection, { title: "Profiles", onRefresh: fetchConfig, refreshLabel: "Refresh" }, /* @__PURE__ */ react.createElement("div", { className: "pf-panel-active" }, entries.map(function(name2) {
      return /* @__PURE__ */ react.createElement(
        "button",
        {
          key: name2,
          type: "button",
          className: "pf-panel-active-btn" + (config.active === name2 ? " pf-panel-active-btn-on" : ""),
          onClick: function() {
            setActive(name2);
          }
        },
        name2
      );
    })), currentEffortList.length > 0 && currentModel !== void 0 && currentModel !== null ? /* @__PURE__ */ react.createElement("div", { className: "pf-panel-model-row" }, /* @__PURE__ */ react.createElement("div", { className: "pf-panel-row" }, /* @__PURE__ */ react.createElement("span", { className: "pf-panel-ref", title: "Current model", "data-dsh-tip": "" }, currentCat !== null ? currentCat.label : currentModel.provider + "/" + currentModel.model), /* @__PURE__ */ react.createElement(
      "select",
      {
        className: "pf-panel-effort",
        value: currentEffortValue,
        "aria-label": "Current model reasoning effort",
        onChange: function(event) {
          var effort = event.target.value;
          directory.select({
            provider: currentModel.provider,
            model: currentModel.model,
            reasoningEffort: effort === "" ? void 0 : effort
          });
        }
      },
      /* @__PURE__ */ react.createElement("option", { value: "" }, "Default"),
      currentEffortList.map(function(eff) {
        return /* @__PURE__ */ react.createElement(
          "option",
          {
            key: eff.id,
            value: eff.id,
            title: eff.description !== void 0 ? eff.description : void 0
          },
          eff.name
        );
      })
    ))) : null, entries.map(function(name2) {
      var entry = config[name2];
      return /* @__PURE__ */ react.createElement("div", { className: "pf-panel-entry", key: name2 }, /* @__PURE__ */ react.createElement("h4", { className: "pf-panel-entry-title" }, name2 === "work" ? "Work" : "Personal"), ["orchestrator", "subagent"].map(function(chainKey) {
        var field = entry[chainKey];
        var label = chainKey === "orchestrator" ? "orchestrator" : "subagent";
        var currentRef = refNameOf(field);
        var isInline = false;
        if (currentRef === void 0 && field !== void 0 && field !== null) {
          if (Array.isArray(field) && field.length > 0) isInline = true;
          else if (typeof field === "object" && Array.isArray(field.routes) && field.routes.length > 0)
            isInline = true;
        }
        var selectValue = currentRef !== void 0 ? currentRef : isInline ? "__inline__" : "__detach__";
        return /* @__PURE__ */ react.createElement("div", { className: "pf-panel-chain", key: chainKey }, /* @__PURE__ */ react.createElement("div", { className: "pf-panel-row" }, /* @__PURE__ */ react.createElement("h5", { className: "pf-panel-chain-title" }, label), /* @__PURE__ */ react.createElement(
          "select",
          {
            className: "pf-panel-select",
            value: selectValue,
            onChange: function(event) {
              var val = event.target.value;
              if (val === "__detach__") {
                detachEntryField(name2, chainKey);
              } else if (val === "__inline__") {
                return;
              } else {
                setEntryChain(name2, chainKey, val);
              }
            }
          },
          /* @__PURE__ */ react.createElement("option", { value: "__detach__" }, "\u2014 none \u2014"),
          chainKeys.map(function(key) {
            return /* @__PURE__ */ react.createElement("option", { key, value: key }, key);
          }),
          currentRef !== void 0 && !entryRefIsKnown(currentRef) ? /* @__PURE__ */ react.createElement("option", { value: currentRef }, currentRef + " (not in catalog)") : null,
          isInline ? /* @__PURE__ */ react.createElement("option", { value: "__inline__" }, fieldSummary(field, config.chains)) : null
        ), /* @__PURE__ */ react.createElement(
          "button",
          {
            type: "button",
            className: "pf-panel-del",
            title: "Detach",
            "data-dsh-tip": "",
            onClick: function() {
              detachEntryField(name2, chainKey);
            }
          },
          "\xD7"
        )));
      }));
    }), /* @__PURE__ */ react.createElement("div", { className: "pf-panel-entry" }, /* @__PURE__ */ react.createElement("div", { className: "pf-panel-head" }, /* @__PURE__ */ react.createElement("h4", { className: "pf-panel-entry-title" }, "Chains"), addingChain ? null : /* @__PURE__ */ react.createElement(
      "button",
      {
        type: "button",
        className: "pf-panel-add",
        onClick: function() {
          setAddingChain(true);
        }
      },
      "+ Add"
    )), addingChain ? /* @__PURE__ */ react.createElement("div", { className: "pf-panel-row" }, /* @__PURE__ */ react.createElement(
      "input",
      {
        className: "pf-panel-input",
        value: chainNameInput,
        placeholder: "chain name",
        "aria-label": "New chain name",
        onChange: function(event) {
          setChainNameInput(event.target.value);
        },
        onKeyDown: function(event) {
          if (event.key === "Enter") commitChain();
          else if (event.key === "Escape") {
            setChainNameInput("");
            setAddingChain(false);
          }
        }
      }
    ), /* @__PURE__ */ react.createElement("button", { type: "button", className: "pf-panel-save", onClick: commitChain }, "Add")) : null, Object.keys(config.chains).length === 0 && !addingChain ? /* @__PURE__ */ react.createElement("div", { className: "pf-panel-meta" }, "None") : Object.keys(config.chains).map(function(chainName) {
      var chain = config.chains[chainName];
      var isComposition = isCompositionChain(chain);
      var resolved = normalizeEntry(chain, config.chains);
      var steps = isComposition ? chain.map(function(step) {
        return { step };
      }) : chain !== void 0 && Array.isArray(chain.routes) ? chain.routes : [];
      return /* @__PURE__ */ react.createElement("div", { className: "pf-panel-chain", key: chainName }, /* @__PURE__ */ react.createElement("div", { className: "pf-panel-row" }, /* @__PURE__ */ react.createElement("h5", { className: "pf-panel-chain-title" }, chainName), /* @__PURE__ */ react.createElement(
        "button",
        {
          type: "button",
          className: "pf-panel-del",
          title: "Remove chain",
          "data-dsh-tip": "",
          onClick: function() {
            removeChain(chainName);
          }
        },
        "\xD7"
      )), /* @__PURE__ */ react.createElement(
        DndContext,
        {
          sensors,
          collisionDetection: closestCenter,
          onDragEnd: function(event) {
            if (event.over === void 0 || event.over === null) return;
            var from = Number(event.active.id);
            var to = Number(event.over.id);
            if (from !== to) moveChainRung(chainName, from, to);
          }
        },
        /* @__PURE__ */ react.createElement(
          SortableCtx,
          {
            items: steps.map(function(_, i) {
              return String(i);
            }),
            strategy: verticalListSortingStrategy
          },
          isComposition ? steps.map(function(row, index) {
            var stepValue = typeof row.step === "string" ? row.step : row.step && row.step.provider && row.step.model ? row.step.provider + "/" + row.step.model : "";
            var step = row.step;
            var isPair = step !== null && typeof step === "object" && typeof step.provider === "string" && step.provider !== "" && typeof step.model === "string" && step.model !== "";
            var lookupProvider = null;
            var lookupModel = null;
            if (isPair) {
              lookupProvider = step.provider;
              lookupModel = step.model;
            } else if (typeof step === "string" && step !== "" && step.indexOf("chain:") !== 0 && chainKeys.indexOf(step) === -1) {
              var sslash = step.indexOf("/");
              if (sslash > 0) {
                lookupProvider = step.slice(0, sslash);
                lookupModel = step.slice(sslash + 1);
              }
            }
            var catModel = null;
            if (lookupProvider !== null) {
              for (var ci = 0; ci < catalogModels.length; ci++) {
                if (catalogModels[ci].provider === lookupProvider && catalogModels[ci].model === lookupModel) {
                  catModel = catalogModels[ci];
                  break;
                }
              }
            }
            var efforts = catModel !== null ? effortsOf(catModel.reasoning) : [];
            var currentEffort = isPair && typeof step.reasoningEffort === "string" ? step.reasoningEffort : "";
            var isChainRef = typeof stepValue === "string" && stepValue.indexOf("chain:") === 0;
            return /* @__PURE__ */ react.createElement(
              SortableRung,
              {
                id: String(index),
                key: index,
                className: "pf-panel-row" + (isChainRef ? " pf-panel-chainref" : "")
              },
              function(handle) {
                return /* @__PURE__ */ react.createElement(react.Fragment, null, /* @__PURE__ */ react.createElement(
                  "button",
                  {
                    type: "button",
                    className: "pf-panel-grip",
                    title: "Drag to reorder",
                    "aria-label": "Move rung " + (index + 1),
                    ...handle.attributes,
                    ...handle.listeners
                  },
                  "\u283F"
                ), /* @__PURE__ */ react.createElement(
                  "select",
                  {
                    className: "pf-panel-select",
                    value: stepValue,
                    onChange: function(event) {
                      setChainStepModel(chainName, index, event.target.value);
                    }
                  },
                  /* @__PURE__ */ react.createElement("option", { value: "" }, "Select\u2026"),
                  modelChainOptions(true),
                  staleStepOption(stepValue)
                ), efforts.length > 0 ? /* @__PURE__ */ react.createElement(
                  "select",
                  {
                    className: "pf-panel-effort",
                    value: currentEffort,
                    onChange: function(event) {
                      setChainRungEffort(chainName, index, event.target.value);
                    }
                  },
                  /* @__PURE__ */ react.createElement("option", { value: "" }, "Default"),
                  efforts.map(function(eff) {
                    return /* @__PURE__ */ react.createElement(
                      "option",
                      {
                        key: eff.id,
                        value: eff.id,
                        title: eff.description !== void 0 ? eff.description : void 0
                      },
                      eff.name
                    );
                  })
                ) : null, /* @__PURE__ */ react.createElement(
                  "button",
                  {
                    type: "button",
                    className: "pf-panel-del",
                    title: "Remove",
                    "data-dsh-tip": "",
                    onClick: function() {
                      removeChainRung(chainName, index);
                    }
                  },
                  "\xD7"
                ));
              }
            );
          }) : steps.map(function(rung, index) {
            var rungKey = rung.provider + "/" + rung.model;
            var rungSelectValue = rung.provider !== "" && rung.model !== "" ? rungKey : "";
            var catModel = null;
            for (var ci = 0; ci < catalogModels.length; ci++) {
              if (catalogModels[ci].provider === rung.provider && catalogModels[ci].model === rung.model) {
                catModel = catalogModels[ci];
                break;
              }
            }
            var efforts = catModel !== null ? effortsOf(catModel.reasoning) : [];
            var currentEffort = typeof rung.reasoningEffort === "string" ? rung.reasoningEffort : "";
            var rungStale = rungSelectValue !== "" && !catalogHasRoute(rungSelectValue);
            return /* @__PURE__ */ react.createElement(
              SortableRung,
              {
                id: String(index),
                key: index,
                className: "pf-panel-model-row"
              },
              function(handle) {
                return /* @__PURE__ */ react.createElement("div", { className: "pf-panel-row" }, /* @__PURE__ */ react.createElement(
                  "button",
                  {
                    type: "button",
                    className: "pf-panel-grip",
                    title: "Drag to reorder",
                    "aria-label": "Move rung " + (index + 1),
                    ...handle.attributes,
                    ...handle.listeners
                  },
                  "\u283F"
                ), /* @__PURE__ */ react.createElement(
                  "select",
                  {
                    className: "pf-panel-select",
                    value: rungSelectValue,
                    onChange: function(event) {
                      setChainRungModel(chainName, index, event.target.value);
                    }
                  },
                  /* @__PURE__ */ react.createElement("option", { value: "" }, "Select\u2026"),
                  modelChainOptions(false),
                  rungStale ? /* @__PURE__ */ react.createElement("option", { value: rungSelectValue }, rungSelectValue + " (not in catalog)") : null
                ), efforts.length > 0 ? /* @__PURE__ */ react.createElement(
                  "select",
                  {
                    className: "pf-panel-effort",
                    value: currentEffort,
                    onChange: function(event) {
                      setChainRungEffort(chainName, index, event.target.value);
                    }
                  },
                  /* @__PURE__ */ react.createElement("option", { value: "" }, "Default"),
                  efforts.map(function(eff) {
                    return /* @__PURE__ */ react.createElement(
                      "option",
                      {
                        key: eff.id,
                        value: eff.id,
                        title: eff.description !== void 0 ? eff.description : void 0
                      },
                      eff.name
                    );
                  })
                ) : null, /* @__PURE__ */ react.createElement(
                  "button",
                  {
                    type: "button",
                    className: "pf-panel-del",
                    title: "Remove",
                    "data-dsh-tip": "",
                    onClick: function() {
                      removeChainRung(chainName, index);
                    }
                  },
                  "\xD7"
                ));
              }
            );
          })
        )
      ), /* @__PURE__ */ react.createElement("div", { className: "pf-panel-row" }, /* @__PURE__ */ react.createElement(
        "select",
        {
          className: "pf-panel-select pf-panel-add-select",
          value: "",
          onChange: function(event) {
            var val = event.target.value;
            if (val !== "") appendChainRung(chainName, val);
            event.target.value = "";
          }
        },
        /* @__PURE__ */ react.createElement("option", { value: "" }, "+ Add \u25BE"),
        isComposition ? modelChainOptions(true) : modelChainOptions(false)
      )), resolved.length > 0 ? /* @__PURE__ */ react.createElement("div", { className: "pf-panel-meta" }, "\u2192 " + resolved[0].provider + "/" + resolved[0].model + (resolved.length > 1 ? " +" + (resolved.length - 1) : "")) : null);
    })), /* @__PURE__ */ react.createElement("div", { className: "pf-panel-meta" }, downRungs > 0 ? /* @__PURE__ */ react.createElement("span", null, downRungs + " down ", /* @__PURE__ */ react.createElement(
      "button",
      {
        type: "button",
        className: "dsp-refresh",
        onClick: function() {
          request("DELETE", "/profiles/error-cache").then(function() {
            fetchConfig();
          });
        }
      },
      "Reset"
    )) : null), /* @__PURE__ */ react.createElement("div", { className: "pf-panel-actions" }, /* @__PURE__ */ react.createElement(
      "button",
      {
        type: "button",
        className: "pf-panel-save",
        disabled: save.busy === true,
        onClick: saveConfig
      },
      save.busy === true ? "Saving\u2026" : "Save"
    ), save.note ? /* @__PURE__ */ react.createElement("span", { className: "pf-panel-status " + (save.ok ? "pf-panel-ok" : "pf-panel-bad") }, save.note) : null));
  }
  return ProfilesPanel;
}
var inject = ["slots", "sessions", "locale", "connection"];
function apply(ctx) {
  ctx.effect(function() {
    return registerLocale(ctx, LOCALE_NS, EN, ZH);
  }, "profiles-client: dictionaries");
  var profileScope;
  try {
    profileScope = ctx.settingsScope.bind({ namespace: "profile" });
  } catch (error) {
    profileScope = inertScope();
  }
  installTitleRewriter(ctx);
  var seat = makeModelSeat(profileScope);
  ctx.inject(["slots", "sessions", "modelDirectories"], function(scope) {
    var models = scope.modelDirectories;
    var sessions = scope.sessions;
    scope.slots.inject(MODEL_SEAT_SLOT, function() {
      return scope.slots.register(
        {
          name: MODEL_SEAT_SLOT,
          locale: LOCALE_NS,
          priority: SEAT_PRIORITY,
          registrant: PLUGIN_NAME,
          inject: function(sessionId) {
            var directory = models.directoryFor(sessionId);
            var usable = sessions.subagentAddress(sessionId) === void 0;
            return {
              available: usable,
              directory: directory.store,
              load: function() {
                if (usable) directory.load().catch(function() {
                });
              },
              select: function(selection) {
                return usable ? directory.select(selection).then(
                  function() {
                    return true;
                  },
                  function() {
                    return false;
                  }
                ) : Promise.resolve(false);
              }
            };
          }
        },
        seat
      );
    });
    var Panel = makeProfilesPanel(models, sessions);
    ctx.slots.inject("settings.section", function() {
      return ctx.slots.register(
        { name: "settings.section", id: PLUGIN_NAME, order: 27, label: "Profiles" },
        function() {
          return /* @__PURE__ */ react.createElement(Panel, null);
        }
      );
    });
  });
}
var name = PLUGIN_NAME;
		return module.exports;
	}
});
