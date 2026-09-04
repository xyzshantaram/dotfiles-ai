(() => {
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
        const name = entry.slice("chain:".length);
        if (chains?.[name] === void 0) {
          ctx?.logger?.debug(`unknown chain reference: ${name}`);
          return [];
        }
        const guard = new Set(seen ?? []);
        if (guard.has(name)) {
          ctx?.logger?.debug(`circular chain reference: ${name}`);
          return [];
        }
        guard.add(name);
        return normalizeEntry(chains[name], chains, guard, ctx);
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
              const name = step.slice("chain:".length);
              if (chains?.[name] !== void 0) {
                const guard = new Set(seen ?? []);
                if (!guard.has(name)) {
                  guard.add(name);
                  out.push(...normalizeEntry(chains[name], chains, guard, ctx));
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
  var client_default = ".profiles-client-root {\n  min-width: 0;\n  position: relative;\n}\n.profiles-client-trigger {\n  min-width: 0;\n  max-width: min(22.5rem, 45cqw);\n  height: 1.75rem;\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n  background: 0 0;\n  border: none;\n  border-radius: 0.75rem;\n  outline: none;\n  align-items: center;\n  gap: 0.3125rem;\n  padding: 0 0.4375rem;\n  font-size: 0.8125rem;\n  font-weight: 500;\n  line-height: 1.25rem;\n  display: flex;\n}\n.profiles-client-trigger:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.profiles-client-trigger:focus-visible {\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n.profiles-client-trigger:disabled {\n  color: var(--dsw-alias-label-dimmed);\n  cursor: default;\n}\n.profiles-client-profile-pill {\n  flex: none;\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  gap: 0.25rem;\n  height: 1.125rem;\n  padding: 0 0.375rem;\n  border-radius: 0.4375rem;\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: #fff;\n  font-size: 0.75rem;\n  font-weight: 700;\n  line-height: 1.125rem;\n  white-space: nowrap;\n  text-transform: uppercase;\n}\n.profiles-client-pill-dot {\n  flex: none;\n  width: 0.375rem;\n  height: 0.375rem;\n  border-radius: 50%;\n}\n.profiles-client-pill-dot.profiles-client-pill-dot-matched {\n  background: var(--dsw-alias-state-info-primary, #3b82f6);\n}\n.profiles-client-pill-dot.profiles-client-pill-dot-changed {\n  background: #f59e0b;\n}\n.profiles-client-model-label {\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  min-width: 0;\n  overflow: hidden;\n}\n.profiles-client-chevron {\n  color: var(--dsw-alias-label-caption);\n  flex: none;\n}\n.profiles-client-menu {\n  z-index: 20;\n  border: 1px solid var(--dsw-alias-border-inverted);\n  background: var(--dsw-specific-menu);\n  width: max-content;\n  min-width: 13.75rem;\n  max-width: min(26.25rem, 100vw - 2rem);\n  max-height: min(25rem, 100vh - 6rem);\n  box-shadow: var(--dsw-shadow-lv3);\n  color: var(--dsw-alias-label-primary);\n  border-radius: 0.5rem;\n  flex-direction: column;\n  padding: 0.1875rem;\n  display: flex;\n  position: absolute;\n  bottom: calc(100% + 0.5rem);\n  right: 0;\n  overflow-x: hidden;\n  overflow-y: auto;\n}\n.profiles-client-option {\n  box-sizing: border-box;\n  width: auto;\n  min-width: 100%;\n  min-height: 2.125rem;\n  color: inherit;\n  text-align: left;\n  cursor: pointer;\n  background: 0 0;\n  border: none;\n  border-radius: 0.5rem;\n  outline: none;\n  align-items: center;\n  gap: 0.5rem;\n  padding: 0.25rem 0.4375rem;\n  display: flex;\n}\n.profiles-client-option:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.profiles-client-option-copy {\n  flex-direction: column;\n  flex: 1;\n  min-width: 0;\n  display: flex;\n}\n.profiles-client-option-name {\n  color: inherit;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 0.8125rem;\n  font-weight: 500;\n  line-height: 1.25rem;\n  overflow: hidden;\n}\n.profiles-client-option-profile {\n  font-weight: 700;\n}\n.profiles-client-option-model {\n  font-size: 0.75rem;\n  font-weight: 500;\n}\n.profiles-client-option-detail {\n  color: var(--dsw-alias-label-tertiary);\n  text-overflow: ellipsis;\n  white-space: nowrap;\n  font-size: 0.75rem;\n  line-height: 1rem;\n  overflow: hidden;\n}\n.profiles-client-check {\n  color: var(--dsw-alias-label-primary);\n  flex: 0 0 0.875rem;\n}\n.profiles-client-model-row {\n  display: flex;\n  flex-direction: column;\n  gap: 0.125rem;\n}\n.profiles-client-effort {\n  box-sizing: border-box;\n  width: calc(100% - 1rem);\n  min-width: 0;\n  margin-left: 0.5rem;\n  height: 1.5rem;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  padding: 0 0.375rem;\n  font-size: 0.6875rem;\n  line-height: 1rem;\n}\n.profiles-client-search {\n  box-sizing: border-box;\n  width: 100%;\n  height: 2rem;\n  margin: 0.25rem 0 0.5rem;\n  padding: 0 0.625rem;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  outline: none;\n}\n.profiles-client-search::placeholder {\n  color: var(--dsw-alias-label-tertiary);\n}\n.profiles-client-search:focus-visible {\n  border-color: var(--dsw-alias-border-l3);\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n.profiles-client-strip {\n  color: var(--dsw-alias-label-tertiary);\n  padding: 0.625rem;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n}\n\n.pf-panel-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 0.75rem;\n}\n.pf-panel-active {\n  display: flex;\n  gap: 0.75rem;\n  flex-wrap: wrap;\n}\n.pf-panel-active-btn {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  font-size: 0.875rem;\n  line-height: 1.25rem;\n  padding: 0.3125rem 0.625rem;\n  min-height: 2.375rem;\n  cursor: pointer;\n}\n.pf-panel-active-btn-on {\n  color: var(--dsw-alias-label-primary);\n  border-color: var(--dsw-alias-border-l3);\n}\n.pf-panel-entry {\n  display: flex;\n  flex-direction: column;\n  gap: 0.625rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.625rem;\n  padding: 0.875rem;\n  background: var(--dsw-alias-bg-tertiary);\n}\n.pf-panel-entry-title {\n  font-size: 0.9375rem;\n  font-weight: 600;\n  margin: 0;\n  color: var(--dsw-alias-label-primary);\n}\n.pf-panel-chain {\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n}\n.pf-panel-chain-title {\n  font-size: 0.875rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-label-secondary);\n  margin: 0;\n}\n.pf-panel-row {\n  display: flex;\n  gap: 0.75rem;\n  align-items: center;\n  min-width: 0;\n}\n.pf-panel-input {\n  box-sizing: border-box;\n  flex: 1;\n  min-width: 0;\n  height: 2.5rem;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  padding: 0 0.5rem;\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n}\n.pf-panel-input:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -0.125rem;\n}\n.pf-panel-del {\n  flex: none;\n  cursor: pointer;\n  border: none;\n  background: none;\n  padding: 0 0.25rem;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 1rem;\n  line-height: 1.25rem;\n}\n.pf-panel-add {\n  align-self: flex-start;\n  color: var(--dsw-alias-label-secondary);\n  background: none;\n  border: 1px dashed var(--dsw-alias-border-l2);\n  border-radius: 0.4375rem;\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n  padding: 0.1875rem 0.6875rem;\n  cursor: pointer;\n}\n.pf-panel-add:hover {\n  color: var(--dsw-alias-label-primary);\n}\n.pf-panel-meta {\n  font-size: 0.875rem;\n  line-height: 1.375rem;\n  color: var(--dsw-alias-label-secondary);\n}\n.pf-panel-ref {\n  flex: none;\n  color: var(--dsw-alias-label-tertiary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border-radius: 0.4375rem;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  padding: 0.0625rem 0.5rem;\n}\n.pf-panel-actions {\n  display: flex;\n  align-items: center;\n  gap: 0.75rem;\n}\n.pf-panel-save {\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 0.5rem;\n  font-size: 0.875rem;\n  line-height: 1.25rem;\n  padding: 0.3125rem 0.625rem;\n  min-height: 2.375rem;\n  cursor: pointer;\n}\n.pf-panel-save:disabled {\n  opacity: 0.5;\n  cursor: default;\n}\n.pf-panel-status {\n  font-size: 0.9375rem;\n  line-height: 1.375rem;\n}\n.pf-panel-ok {\n  color: var(--dsw-alias-state-success-primary);\n}\n.pf-panel-bad {\n  color: var(--dsw-alias-state-error-primary);\n}\n.pf-panel-select {\n  box-sizing: border-box;\n  flex: 1;\n  min-width: 0;\n  height: 2.5rem;\n  color: var(--dsw-alias-label-primary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  padding: 0 0.5rem;\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n  cursor: pointer;\n}\n.pf-panel-select:focus-visible {\n  outline: 2px solid var(--dsw-alias-state-business-primary);\n  outline-offset: -0.125rem;\n}\n.pf-panel-effort {\n  box-sizing: border-box;\n  flex: 0 0 auto;\n  min-width: 0;\n  margin-left: 0.5rem;\n  height: 2.5rem;\n  color: var(--dsw-alias-label-secondary);\n  background: var(--dsw-alias-interactive-bg-hover);\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.5rem;\n  padding: 0 0.5rem;\n  font-size: 0.9375rem;\n  line-height: 1.25rem;\n  cursor: pointer;\n}\n.pf-panel-select option,\n.pf-panel-effort option {\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n}\n/* Dropdown group headings invert \u2014 black on white \u2014 so they never render\n   white-on-white against the dropdown surface in the dark theme. */\n.pf-panel-select optgroup,\n.pf-panel-effort optgroup {\n  color: #000;\n  background: #fff;\n  font-weight: 700;\n}\n.pf-panel-model-row {\n  display: flex;\n  flex-direction: column;\n  gap: 0.125rem;\n}\n.pf-panel-add-select {\n  align-self: flex-start;\n  border-style: dashed;\n}\n.profiles-client-menu .dsp-section-title {\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  font-weight: 700;\n  text-transform: uppercase;\n  margin: 0.25rem 0 0;\n  padding: 0.25rem 0.4375rem;\n}\n";

  // plugins/profiles-client/src/client.tsx
  window.__ModuleLoader__.load({
    id: "profiles-client",
    factory: function(require2) {
      var module = { exports: {} };
      var react = require2("react");
      var useSyncExternalStore = react.useSyncExternalStore;
      var useCallback = react.useCallback;
      var useState = react.useState;
      var useEffect = react.useEffect;
      var useRef = react.useRef;
      var PLUGIN_NAME = "profiles-client";
      var LOCALE_NS = "profiles-client";
      function emptySubscribe() {
        return function() {
        };
      }
      function emptySnapshot() {
        return null;
      }
      var MODEL_SEAT_SLOT = "conversation.input.model";
      var SEAT_PRIORITY = -100;
      var STYLE_TAG_ID = "profiles-client/client.module.css";
      injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settings_default, client_default));
      var EN = {
        "seat.fallback": "Model",
        "seat.aria": "Select model or profile",
        "menu.profiles": "Profiles",
        "menu.default": "Default",
        "menu.models": "Models",
        "menu.searchPlaceholder": "Search models\u2026",
        "menu.noResults": "No models match"
      };
      var ZH = {
        "seat.fallback": "\u6A21\u578B",
        "seat.aria": "\u9009\u62E9\u6A21\u578B\u6216\u914D\u7F6E",
        "menu.profiles": "\u914D\u7F6E",
        "menu.default": "\u9ED8\u8BA4",
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
          var seatSubscribe = useCallback(
            function(fn) {
              return directory.subscribe(fn);
            },
            [directory]
          );
          var seatGetSnapshot = useCallback(
            function() {
              return directory.getSnapshot();
            },
            [directory]
          );
          var state = useSyncExternalStore(seatSubscribe, seatGetSnapshot);
          var profileSnap = useSyncExternalStore(
            profileScope.store.subscribe,
            profileScope.store.getSnapshot
          );
          var profileValue = profileSnap.value;
          var openState = useState(false);
          var open = openState[0];
          var setOpen = openState[1];
          var rootRef = useRef(null);
          var searchState = useState("");
          var modelQuery = searchState[0];
          var setModelQuery = searchState[1];
          var searchInputRef = useRef(null);
          var profileConfigState = useState(null);
          var profileConfig = profileConfigState[0];
          var setProfileConfig = profileConfigState[1];
          useEffect(
            function() {
              if (open) {
                if (searchInputRef.current) searchInputRef.current.focus();
              } else {
                setModelQuery("");
              }
            },
            [open]
          );
          useEffect(
            function() {
              if (available) load();
            },
            [available, load]
          );
          useEffect(
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
          var fetchProfiles = function() {
            fetchJson("/profiles/config").then(function(result) {
              if (result.error) return;
              if (result.data !== null && result.data !== void 0 && result.data.config !== null && result.data.config !== void 0) {
                setProfileConfig(result.data.config);
              }
            });
          };
          useEffect(
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
              },
              function() {
              }
            );
          };
          var onKeyDown = function(event) {
            if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
            }
          };
          var currentPretty = current !== void 0 && current !== null ? prettyOf(current.provider, current.model) : null;
          var headText = face.head !== void 0 && face.head !== null ? face.head.model + " (" + face.head.provider + ")" : null;
          var hasProfile = face.active !== void 0 && face.active !== "";
          var modelText = currentPretty !== null ? currentPretty.model + " (" + currentPretty.provider + ")" : headText !== null ? headText : t("seat.fallback");
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
            hasProfile ? /* @__PURE__ */ react.createElement("span", { className: "profiles-client-profile-pill" }, face.active, /* @__PURE__ */ react.createElement(
              "span",
              {
                className: "profiles-client-pill-dot" + (matched ? " profiles-client-pill-dot-matched" : " profiles-client-pill-dot-changed"),
                "aria-hidden": true
              }
            )) : null,
            /* @__PURE__ */ react.createElement("span", { className: "profiles-client-model-label" }, modelText),
            /* @__PURE__ */ react.createElement("span", { className: "profiles-client-chevron", "aria-hidden": true }, "\u25BE")
          ), open ? /* @__PURE__ */ react.createElement("div", { className: "profiles-client-menu", role: "listbox" }, /* @__PURE__ */ react.createElement(
            "button",
            {
              type: "button",
              className: "profiles-client-option",
              onClick: function() {
                if (face.head !== void 0) pick(face.head);
              }
            },
            /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-copy" }, /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-name profiles-client-option-profile" }, t("menu.default")), /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-detail" }, face.head !== void 0 ? prettyOf(face.head.provider, face.head.model).provider + "/" + prettyOf(face.head.provider, face.head.model).model : ""))
          ), profileRows.length > 0 ? /* @__PURE__ */ react.createElement("div", null, /* @__PURE__ */ react.createElement("div", { className: "dsp-section-title" }, t("menu.profiles")), profileRows.map(function(row) {
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
                    }
                  );
                }
              },
              /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-copy" }, /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-name profiles-client-option-profile" }, row.key + (isActive ? " \xB7" : "")), /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-detail" }, headPretty.provider + "/" + headPretty.model)),
              isActive ? /* @__PURE__ */ react.createElement("span", { className: "profiles-client-check", "aria-hidden": true }, "\u2713") : null
            );
          })) : null, /* @__PURE__ */ react.createElement("div", null, /* @__PURE__ */ react.createElement("div", { className: "dsp-section-title" }, t("menu.models")), /* @__PURE__ */ react.createElement(
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
                "div",
                {
                  key: grp.id + "/" + row.id,
                  className: "profiles-client-model-row"
                },
                /* @__PURE__ */ react.createElement(
                  "button",
                  {
                    type: "button",
                    className: "profiles-client-option",
                    onClick: function() {
                      pick({ provider: grp.id, model: row.id });
                    }
                  },
                  /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-copy" }, /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-name profiles-client-option-model" }, row.name), /* @__PURE__ */ react.createElement("span", { className: "profiles-client-option-detail" }, grp.label)),
                  isActive ? /* @__PURE__ */ react.createElement("span", { className: "profiles-client-check", "aria-hidden": true }, "\u2713") : null
                )
              );
            }));
          }))) : null);
        }
        return ProfileModelSeat;
      }
      function SettingsSection(props) {
        return /* @__PURE__ */ react.createElement("div", { className: "dsp-root" }, /* @__PURE__ */ react.createElement("div", { className: "dsp-head" }, /* @__PURE__ */ react.createElement("h3", { className: "dsp-title" }, props.title), props.onRefresh ? /* @__PURE__ */ react.createElement("button", { className: "dsp-refresh", onClick: props.onRefresh }, props.refreshLabel === void 0 ? "Refresh" : props.refreshLabel) : null), props.children);
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
          Object.keys(chains).forEach(function(name) {
            var value = chains[name];
            if (Array.isArray(value)) {
              out[name] = value.map(function(step) {
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
              out[name] = { routes: cloneRoutes(value && value.routes) };
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
          var sessionSnap = useSyncExternalStore(sessions.list.subscribe, sessions.list.getSnapshot);
          var sessionId = sessionSnap !== null && sessionSnap !== void 0 ? sessionSnap.current : null;
          var usable = sessionId !== null && sessionId !== void 0 ? sessions.subagentAddress(sessionId) === void 0 : false;
          var directory = sessionId !== null && sessionId !== void 0 ? models.directoryFor(sessionId) : null;
          var catalogSubscribe = useCallback(
            function(cb) {
              return directory ? directory.store.subscribe(cb) : emptySubscribe();
            },
            [directory]
          );
          var catalogGetSnapshot = useCallback(
            function() {
              return directory ? directory.store.getSnapshot() : null;
            },
            [directory]
          );
          var catalogState = useSyncExternalStore(catalogSubscribe, catalogGetSnapshot);
          useEffect(
            function() {
              if (directory && usable) directory.load().catch(function() {
              });
            },
            [directory, usable]
          );
          var catalogGroups = catalogState !== null && catalogState !== void 0 && Array.isArray(catalogState.groups) ? catalogState.groups : [];
          var loadState = useState(null);
          var load = loadState[0];
          var setLoad = loadState[1];
          var draftState = useState(null);
          var draft = draftState[0];
          var setDraft = draftState[1];
          var saveState = useState({ busy: false, note: null, ok: true });
          var save = saveState[0];
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
          var setEntryChain = function(name, chainKey, chainName) {
            setDraft(function(prev) {
              var next = cloneConfig(prev);
              next[name][chainKey] = chainName === "" ? { routes: [] } : chainName;
              return next;
            });
          };
          var detachEntryField = function(name, chainKey) {
            setDraft(function(prev) {
              var next = cloneConfig(prev);
              next[name][chainKey] = { routes: [] };
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
              var slash = value.indexOf("/");
              if (slash <= 0) return next;
              var step = chain[index];
              if (step !== null && typeof step === "object") {
                chain[index] = { provider: value.slice(0, slash), model: value.slice(slash + 1) };
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
              if (value === "__new__") {
                var name = window.prompt("New named chain name", "new-chain");
                if (name === null) return next;
                var key = name.trim();
                if (key === "") return next;
                if (next.chains[key] === void 0) {
                  next.chains[key] = { routes: [] };
                }
                if (Array.isArray(chain)) {
                  chain.push("chain:" + key);
                } else if (chain.routes !== void 0) {
                  var composed = chain.routes.map(function(r) {
                    return r.provider + "/" + r.model;
                  });
                  composed.push("chain:" + key);
                  next.chains[chainName] = composed;
                }
                return next;
              }
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
          useEffect(function() {
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
          var setActive = function(name) {
            setDraft(function(prev) {
              var next = cloneConfig(prev);
              next.active = name;
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
          var addChain = function() {
            var name = window.prompt("New named chain name", "new-chain");
            if (name === null) return;
            var key = name.trim();
            if (key === "") return;
            setDraft(function(prev) {
              var next = cloneConfig(prev);
              if (next.chains[key] === void 0) {
                next.chains[key] = { routes: [] };
              }
              return next;
            });
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
          return /* @__PURE__ */ react.createElement(SettingsSection, { title: "Profiles", onRefresh: fetchConfig, refreshLabel: "Refresh" }, /* @__PURE__ */ react.createElement("div", { className: "pf-panel-active" }, entries.map(function(name) {
            return /* @__PURE__ */ react.createElement(
              "button",
              {
                key: name,
                type: "button",
                className: "pf-panel-active-btn" + (config.active === name ? " pf-panel-active-btn-on" : ""),
                onClick: function() {
                  setActive(name);
                }
              },
              name
            );
          })), currentEffortList.length > 0 && currentModel !== void 0 && currentModel !== null ? /* @__PURE__ */ react.createElement("div", { className: "pf-panel-model-row" }, /* @__PURE__ */ react.createElement("div", { className: "pf-panel-row" }, /* @__PURE__ */ react.createElement("span", { className: "pf-panel-ref", title: "Current model" }, currentCat !== null ? currentCat.label : currentModel.provider + "/" + currentModel.model), /* @__PURE__ */ react.createElement(
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
          ))) : null, entries.map(function(name) {
            var entry = config[name];
            return /* @__PURE__ */ react.createElement("div", { className: "pf-panel-entry", key: name }, /* @__PURE__ */ react.createElement("h4", { className: "pf-panel-entry-title" }, name === "work" ? "Work" : "Personal"), ["orchestrator", "subagent"].map(function(chainKey) {
              var field = entry[chainKey];
              var label = chainKey === "orchestrator" ? "orchestrator" : "subagent";
              var summary = fieldSummary(field, config.chains);
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
                      detachEntryField(name, chainKey);
                    } else if (val === "__inline__") {
                      return;
                    } else {
                      setEntryChain(name, chainKey, val);
                    }
                  }
                },
                /* @__PURE__ */ react.createElement("option", { value: "__detach__" }, "\u2014 none \u2014"),
                chainKeys.map(function(key) {
                  return /* @__PURE__ */ react.createElement("option", { key, value: key }, key);
                }),
                isInline ? /* @__PURE__ */ react.createElement("option", { value: "__inline__" }, fieldSummary(field, config.chains)) : null
              ), /* @__PURE__ */ react.createElement(
                "button",
                {
                  type: "button",
                  className: "pf-panel-del",
                  title: "Detach",
                  onClick: function() {
                    detachEntryField(name, chainKey);
                  }
                },
                "\xD7"
              )), /* @__PURE__ */ react.createElement("div", { className: "pf-panel-meta" }, label + " \u2192 " + summary));
            }));
          }), /* @__PURE__ */ react.createElement("div", { className: "pf-panel-entry" }, /* @__PURE__ */ react.createElement("div", { className: "pf-panel-head" }, /* @__PURE__ */ react.createElement("h4", { className: "pf-panel-entry-title" }, "Named chains"), /* @__PURE__ */ react.createElement("button", { type: "button", className: "pf-panel-add", onClick: addChain }, "+ Add chain")), Object.keys(config.chains).length === 0 ? /* @__PURE__ */ react.createElement("div", { className: "pf-panel-meta" }, "No named chains") : Object.keys(config.chains).map(function(chainName) {
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
                onClick: function() {
                  removeChain(chainName);
                }
              },
              "\xD7"
            )), isComposition ? steps.map(function(row, index) {
              var stepValue = typeof row.step === "string" ? row.step : row.step && row.step.provider && row.step.model ? row.step.provider + "/" + row.step.model : "";
              var step = row.step;
              var isPair = step !== null && typeof step === "object" && typeof step.provider === "string" && step.provider !== "" && typeof step.model === "string" && step.model !== "";
              var catModel = null;
              if (isPair) {
                for (var ci = 0; ci < catalogModels.length; ci++) {
                  if (catalogModels[ci].provider === step.provider && catalogModels[ci].model === step.model) {
                    catModel = catalogModels[ci];
                    break;
                  }
                }
              }
              var efforts = catModel !== null ? effortsOf(catModel.reasoning) : [];
              var currentEffort = isPair && typeof step.reasoningEffort === "string" ? step.reasoningEffort : "";
              return /* @__PURE__ */ react.createElement("div", { className: "pf-panel-row", key: index }, /* @__PURE__ */ react.createElement(
                "select",
                {
                  className: "pf-panel-select",
                  value: stepValue,
                  onChange: function(event) {
                    setChainStepModel(chainName, index, event.target.value);
                  }
                },
                /* @__PURE__ */ react.createElement("option", { value: "" }, "\u2014 select step \u2014"),
                modelChainOptions(true)
              ), efforts.length > 0 ? /* @__PURE__ */ react.createElement(
                "select",
                {
                  className: "pf-panel-effort",
                  value: currentEffort,
                  onChange: function(event) {
                    setChainRungEffort(chainName, index, event.target.value);
                  }
                },
                /* @__PURE__ */ react.createElement("option", { value: "" }, "Default effort"),
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
                  title: "Remove step",
                  onClick: function() {
                    removeChainRung(chainName, index);
                  }
                },
                "\xD7"
              ));
            }) : steps.map(function(rung, index) {
              var rungKey = rung.provider + "/" + rung.model;
              var catModel = null;
              for (var ci = 0; ci < catalogModels.length; ci++) {
                if (catalogModels[ci].provider === rung.provider && catalogModels[ci].model === rung.model) {
                  catModel = catalogModels[ci];
                  break;
                }
              }
              var efforts = catModel !== null ? effortsOf(catModel.reasoning) : [];
              var currentEffort = typeof rung.reasoningEffort === "string" ? rung.reasoningEffort : "";
              return /* @__PURE__ */ react.createElement("div", { className: "pf-panel-model-row", key: index }, /* @__PURE__ */ react.createElement("div", { className: "pf-panel-row" }, /* @__PURE__ */ react.createElement(
                "select",
                {
                  className: "pf-panel-select",
                  value: rungKey,
                  onChange: function(event) {
                    setChainRungModel(chainName, index, event.target.value);
                  }
                },
                /* @__PURE__ */ react.createElement("option", { value: "" }, "\u2014 select model \u2014"),
                modelChainOptions(false)
              ), efforts.length > 0 ? /* @__PURE__ */ react.createElement(
                "select",
                {
                  className: "pf-panel-effort",
                  value: currentEffort,
                  onChange: function(event) {
                    setChainRungEffort(chainName, index, event.target.value);
                  }
                },
                /* @__PURE__ */ react.createElement("option", { value: "" }, "Default effort"),
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
                  title: "Remove rung",
                  onClick: function() {
                    removeChainRung(chainName, index);
                  }
                },
                "\xD7"
              )));
            }), /* @__PURE__ */ react.createElement("div", { className: "pf-panel-row" }, /* @__PURE__ */ react.createElement(
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
              /* @__PURE__ */ react.createElement("option", { value: "" }, "+ Add " + (isComposition ? "step" : "rung") + " \u25BE"),
              isComposition ? modelChainOptions(true) : modelChainOptions(false),
              /* @__PURE__ */ react.createElement("option", { value: "__new__" }, "New named chain\u2026")
            )), resolved.length > 0 ? /* @__PURE__ */ react.createElement("div", { className: "pf-panel-meta" }, "Resolves to " + resolved.length + " route" + (resolved.length === 1 ? "" : "s") + ": " + resolved[0].provider + "/" + resolved[0].model + (resolved.length > 1 ? " \u2026" : "")) : null);
          })), /* @__PURE__ */ react.createElement("div", { className: "pf-panel-meta" }, downRungs > 0 ? /* @__PURE__ */ react.createElement("span", null, downRungs + " rung" + (downRungs === 1 ? "" : "s") + " cached down ", /* @__PURE__ */ react.createElement("button", { type: "button", className: "dsp-refresh", onClick: fetchConfig }, "Retry now")) : null), /* @__PURE__ */ react.createElement("div", { className: "pf-panel-actions" }, /* @__PURE__ */ react.createElement(
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
      module.exports = { apply, inject, name: PLUGIN_NAME };
      return module.exports;
    }
  });
})();
