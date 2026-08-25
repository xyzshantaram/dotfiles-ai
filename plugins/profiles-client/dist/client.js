(() => {
  // plugins/shared/client-util.ts
  function injectStyle(pluginName, styleId, cssText) {
    if (typeof document === "undefined") return;
    if (document.querySelector("style[data-plugin-css=" + JSON.stringify(styleId) + "]") !== null)
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
  function putJson(url, body) {
    return fetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store"
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
  function registerLocale(ctx, ns, en, zh) {
    return ctx.locale.register(ns, { en, zh });
  }

  // plugins/profile-routes.ts
  function isRouteCandidate(value) {
    return typeof value === "object" && value !== null && typeof value.provider === "string" && typeof value.model === "string";
  }
  function normalizeEntry(entry, chains, seen) {
    if (isRouteCandidate(entry)) return [entry];
    if (typeof entry === "string") {
      if (entry.startsWith("chain:")) {
        const name = entry.slice("chain:".length);
        if (chains?.[name] === void 0) return [];
        const guard = new Set(seen ?? []);
        if (guard.has(name)) return [];
        guard.add(name);
        return normalizeEntry(chains[name], chains, guard);
      }
      const slash = entry.indexOf("/");
      if (slash > 0) {
        return [{ provider: entry.slice(0, slash), model: entry.slice(slash + 1) }];
      }
      if (chains?.[entry] !== void 0) {
        const guard = new Set(seen ?? []);
        if (guard.has(entry)) return [];
        guard.add(entry);
        return normalizeEntry(chains[entry], chains, guard);
      }
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
                  out.push(...normalizeEntry(chains[name], chains, guard));
                }
              }
            } else if (step.indexOf("/") > 0) {
              const slash = step.indexOf("/");
              out.push({ provider: step.slice(0, slash), model: step.slice(slash + 1) });
            }
          } else {
            out.push(...normalizeEntry(step, chains, seen));
          }
        }
        return out;
      }
    }
    return [];
  }
  function entryHead(entry, chains) {
    if (typeof entry === "object" && entry !== null) {
      const obj = entry;
      if ("orchestrator" in obj || "subagent" in obj) {
        return entryHead(obj.orchestrator, chains) ?? entryHead(obj.subagent, chains);
      }
    }
    return normalizeEntry(entry, chains)[0];
  }
  function routesEqual(a, b) {
    if (a === b) return true;
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      const left = a[i];
      const right = b[i];
      if (left.provider !== right.provider || left.model !== right.model) return false;
    }
    return true;
  }
  function chainNameForRoutes(routes, chains) {
    if (chains === void 0 || chains === null) return void 0;
    for (const name of Object.keys(chains)) {
      if (routesEqual(normalizeEntry(chains[name], chains), routes)) return name;
    }
    return void 0;
  }

  // css-text:/home/sid/repos/dotfiles-ai/plugins/shared/settings.css
  var settings_default = "/* Shared settings-page vocabulary, normalized from the session-archive,\n * subscriptions, and profiles settings panels. One rule set in one file so\n * the three panels cannot drift. Radius and padding disagreements are\n * normalized to the session-archive (or median) value; the var(--dsw-...)\n * aliases the current rules use are kept as-is. */\n\n/* Page-level container: airy vertical rhythm, no own box. */\n.dsp-root {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  padding: 0;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Header row (title + refresh). */\n.dsp-head {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 12px;\n}\n\n.dsp-title {\n  font-size: 24px;\n  font-weight: 700;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Refresh: session-archive/profiles form (no box, color shift only).\n * subscriptions pads and rounds the hit area; normalized away. */\n.dsp-refresh {\n  cursor: pointer;\n  border: none;\n  background: none;\n  padding: 0;\n  color: var(--dsw-alias-label-secondary);\n  font-size: 15px;\n  line-height: 20px;\n}\n.dsp-refresh:hover {\n  color: var(--dsw-alias-label-primary);\n}\n\n.dsp-err {\n  font-size: 15px;\n  line-height: 22px;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n/* Large setting card. Padding is the median of 16/20/24 (session-archive\n * 20px); the radius is the two-agreeing 20px, not profiles' 12px. */\n.dsp-section {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 20px;\n  padding: 20px;\n  background: var(--dsw-alias-bg-tertiary);\n}\n\n/* Card title: subscriptions' 24px/700 matches the page-title vocabulary;\n * profiles' smaller 16px/600 card title normalized up. */\n.dsp-section-title {\n  font-size: 24px;\n  font-weight: 700;\n  margin: 0;\n  line-height: 1.2;\n  color: var(--dsw-alias-label-primary);\n}\n\n/* Setting row: horizontal in session-archive and profiles (subscriptions\n * stacks its label and meta vertically; normalized to the horizontal form). */\n.dsp-row {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  min-width: 0;\n}\n\n/* Row label: only subscriptions defines one; ported verbatim, with its\n * emphasized <b> children. */\n.dsp-row-label {\n  display: flex;\n  align-items: baseline;\n  gap: 10px;\n  font-size: 16px;\n  line-height: 22px;\n  color: var(--dsw-alias-label-secondary);\n}\n.dsp-row-label b {\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n  font-size: 16px;\n}\n.dsp-row-label b:last-child {\n  margin-left: auto;\n}\n";

  // css-text:/home/sid/repos/dotfiles-ai/plugins/profiles-client/src/client.module.css
  var client_default = ".profiles-client-root{min-width:0;position:relative}\n.profiles-client-trigger{min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:12px;outline:none;align-items:center;gap:5px;padding:0 7px;font-size:13px;font-weight:500;line-height:20px;display:flex}\n.profiles-client-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}\n.profiles-client-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}\n.profiles-client-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}\n.profiles-client-profile-pill{flex:none;box-sizing:border-box;display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 6px;border-radius:7px;background:var(--dsw-alias-interactive-bg-hover);color:#fff;font-size:12px;font-weight:700;line-height:18px;white-space:nowrap;text-transform:uppercase}\n.profiles-client-pill-dot{flex:none;width:6px;height:6px;border-radius:50%}\n.profiles-client-pill-dot.profiles-client-pill-dot-matched{background:var(--dsw-alias-state-info-primary,#3b82f6)}\n.profiles-client-pill-dot.profiles-client-pill-dot-changed{background:#f59e0b}\n.profiles-client-model-label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}\n.profiles-client-chevron{color:var(--dsw-alias-label-caption);flex:none}\n.profiles-client-menu{z-index:20;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:max-content;min-width:220px;max-width:min(420px,100vw - 32px);max-height:min(400px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:8px;flex-direction:column;padding:3px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow-x:hidden;overflow-y:auto}\n.profiles-client-option{box-sizing:border-box;width:auto;min-width:100%;min-height:34px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:8px;outline:none;align-items:center;gap:8px;padding:4px 7px;display:flex}\n.profiles-client-option-copy{flex-direction:column;flex:1;min-width:0;display:flex}\n.profiles-client-option-name{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:20px;overflow:hidden}\n.profiles-client-option-profile{font-weight:700}\n.profiles-client-option-model{font-size:12px;font-weight:500}\n.profiles-client-option-detail{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:16px;overflow:hidden}\n.profiles-client-check{color:var(--dsw-alias-label-primary);flex:0 0 14px}\n.profiles-client-model-row{display:flex;flex-direction:column;gap:2px}\n.profiles-client-effort{box-sizing:border-box;width:calc(100% - 16px);min-width:0;margin-left:8px;height:24px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 6px;font-size:11px;line-height:16px}\n.profiles-client-strip{color:var(--dsw-alias-label-tertiary);padding:10px;font-size:13px;line-height:20px}\n.pf-panel-head{display:flex;align-items:center;justify-content:space-between;gap:12px}\n.pf-panel-active{display:flex;gap:12px;flex-wrap:wrap}\n.pf-panel-active-btn{display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;font-size:15px;line-height:20px;padding:6px 11px;min-height:40px;cursor:pointer}\n.pf-panel-active-btn-on{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3)}\n.pf-panel-entry{display:flex;flex-direction:column;gap:12px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:16px;background:var(--dsw-alias-bg-tertiary)}\n.pf-panel-entry-title{font-size:16px;font-weight:600;margin:0;color:var(--dsw-alias-label-primary)}\n.pf-panel-chain{display:flex;flex-direction:column;gap:12px}\n.pf-panel-chain-title{font-size:16px;line-height:22px;color:var(--dsw-alias-label-secondary);margin:0}\n.pf-panel-row{display:flex;gap:12px;align-items:center;min-width:0}\n.pf-panel-input{box-sizing:border-box;flex:1;min-width:0;height:40px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 8px;font-size:15px;line-height:20px}\n.pf-panel-input:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}\n.pf-panel-del{flex:none;cursor:pointer;border:none;background:none;padding:0 4px;color:var(--dsw-alias-label-secondary);font-size:16px;line-height:20px}\n.pf-panel-add{align-self:flex-start;color:var(--dsw-alias-label-secondary);background:none;border:1px dashed var(--dsw-alias-border-l2);border-radius:7px;font-size:15px;line-height:20px;padding:3px 11px;cursor:pointer}\n.pf-panel-add:hover{color:var(--dsw-alias-label-primary)}\n.pf-panel-meta{font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary)}\n.pf-panel-ref{flex:none;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);border-radius:7px;font-size:13px;line-height:20px;padding:1px 8px}\n.pf-panel-actions{display:flex;align-items:center;gap:12px}\n.pf-panel-save{display:inline-flex;align-items:center;justify-content:center;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l3);border-radius:12px;font-size:15px;line-height:20px;padding:6px 11px;min-height:40px;cursor:pointer}\n.pf-panel-save:disabled{opacity:0.5;cursor:default}\n.pf-panel-status{font-size:15px;line-height:22px}\n.pf-panel-ok{color:var(--dsw-alias-state-success-primary)}\n.pf-panel-bad{color:var(--dsw-alias-state-error-primary)}\n.pf-panel-select{box-sizing:border-box;flex:1;min-width:0;height:40px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 8px;font-size:15px;line-height:20px;cursor:pointer}\n.pf-panel-select:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:-2px}\n.pf-panel-effort{box-sizing:border-box;flex:0 0 auto;min-width:0;margin-left:8px;height:40px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 8px;font-size:15px;line-height:20px;cursor:pointer}\n.pf-panel-select option,.pf-panel-effort option{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary)}\n.pf-panel-model-row{display:flex;flex-direction:column;gap:2px}\n.pf-panel-add-select{align-self:flex-start;border-style:dashed}\n";

  // plugins/profiles-client/src/client.tsx
  window.__ModuleLoader__.load({
    id: "profiles-client",
    factory: function(require2) {
      var module = { exports: {} };
      var exports = module.exports;
      var react = require2("react");
      var useSyncExternalStore = react.useSyncExternalStore;
      var useState = react.useState;
      var useEffect = react.useEffect;
      var useRef = react.useRef;
      var PLUGIN_NAME = "profiles-client";
      var LOCALE_NS = "profiles-client";
      var MODEL_SEAT_SLOT = "conversation.input.model";
      var SEAT_PRIORITY = -100;
      var STYLE_TAG_ID = "profiles-client/client.module.css";
      injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settings_default, client_default));
      var EN = {
        "seat.fallback": "Model",
        "seat.aria": "Select model or profile",
        "menu.profiles": "Profiles",
        "menu.default": "Default",
        "menu.models": "Models"
      };
      var ZH = {
        "seat.fallback": "\u6A21\u578B",
        "seat.aria": "\u9009\u62E9\u6A21\u578B\u6216\u914D\u7F6E",
        "menu.profiles": "\u914D\u7F6E",
        "menu.default": "\u9ED8\u8BA4",
        "menu.models": "\u6A21\u578B"
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
          var name = chainNameForRoutes(field.routes, chains);
          if (name !== void 0) return name;
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
          var state = useSyncExternalStore(
            function(fn) {
              return directory.subscribe(fn);
            },
            function() {
              return directory.getSnapshot();
            }
          );
          var profileSnap = useSyncExternalStore(
            profileScope.store.subscribe,
            profileScope.store.getSnapshot
          );
          var profileValue = profileSnap.value;
          var openState = useState(false);
          var open = openState[0];
          var setOpen = openState[1];
          var rootRef = useRef(null);
          var profileConfigState = useState(null);
          var profileConfig = profileConfigState[0];
          var setProfileConfig = profileConfigState[1];
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
          var modelGroups = [];
          for (var g = 0; g < state.groups.length; g++) {
            var group = state.groups[g];
            if (group.models === void 0 || group.models.length === 0) continue;
            var models = [];
            for (var m = 0; m < group.models.length; m++) {
              models.push({
                id: group.models[m].id,
                name: group.models[m].name
              });
            }
            modelGroups.push({
              id: group.id,
              label: typeof group.name === "string" && group.name !== "" ? group.name : group.id,
              models
            });
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
          var hasProfile = face.active !== void 0 && face.active !== "";
          var modelText = currentPretty !== null ? currentPretty.model + " (" + currentPretty.provider + ")" : t("seat.fallback");
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
          })) : null, /* @__PURE__ */ react.createElement("div", null, /* @__PURE__ */ react.createElement("div", { className: "dsp-section-title" }, t("menu.models")), state.status === "error" && state.error ? /* @__PURE__ */ react.createElement("div", { className: "profiles-client-strip" }, state.error) : null, modelGroups.map(function(grp) {
            return /* @__PURE__ */ react.createElement("div", { key: grp.id }, /* @__PURE__ */ react.createElement("div", { className: "dsp-section-title" }, grp.label), grp.models.map(function(row) {
              var isActive = current !== void 0 && current !== null && current.provider === grp.id && current.model === row.id;
              return /* @__PURE__ */ react.createElement("div", { key: grp.id + "/" + row.id, className: "profiles-client-model-row" }, /* @__PURE__ */ react.createElement(
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
              ));
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
            return { provider: r.provider, model: r.model };
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
              out[name] = value.slice();
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
          var catalogState = useSyncExternalStore(
            directory ? directory.store.subscribe : function() {
              return function() {
              };
            },
            directory ? directory.store.getSnapshot : function() {
              return null;
            }
          );
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
          var saveState = useState(null);
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
          var setChainField = function(chainName, index, field, value) {
            setDraft(function(prev) {
              var next = cloneConfig(prev);
              var chain = next.chains[chainName];
              if (chain === void 0) return next;
              if (Array.isArray(chain)) {
                chain[index] = value;
              } else if (chain.routes !== void 0) {
                chain.routes[index][field] = value;
              }
              return next;
            });
          };
          var addChainRung = function(chainName) {
            setDraft(function(prev) {
              var next = cloneConfig(prev);
              var chain = next.chains[chainName];
              if (chain === void 0) return next;
              if (Array.isArray(chain)) {
                chain.push("");
              } else if (chain.routes !== void 0) {
                chain.routes.push({ provider: "", model: "" });
              }
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
                next.chains[key] = { routes: [{ provider: "", model: "" }] };
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
              if (currentRef === void 0)
                currentRef = chainNameForRoutes(field.routes, config.chains);
              return /* @__PURE__ */ react.createElement("div", { className: "pf-panel-chain", key: chainKey }, /* @__PURE__ */ react.createElement("div", { className: "pf-panel-row" }, /* @__PURE__ */ react.createElement("h5", { className: "pf-panel-chain-title" }, label), /* @__PURE__ */ react.createElement(
                "select",
                {
                  className: "pf-panel-select",
                  value: currentRef !== void 0 ? currentRef : "",
                  onChange: function(event) {
                    var val = event.target.value;
                    if (val === "__detach__") {
                      detachEntryField(name, chainKey);
                    } else {
                      setEntryChain(name, chainKey, val);
                    }
                  }
                },
                /* @__PURE__ */ react.createElement("option", { value: "__detach__" }, "\u2014 none \u2014"),
                chainKeys.map(function(key) {
                  return /* @__PURE__ */ react.createElement("option", { key, value: key }, key);
                })
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
              var stepText = typeof row.step === "string" ? row.step : "";
              var isRef = stepText.indexOf("chain:") === 0;
              return /* @__PURE__ */ react.createElement("div", { className: "pf-panel-row", key: index }, isRef ? /* @__PURE__ */ react.createElement(
                "select",
                {
                  className: "pf-panel-select",
                  value: stepText,
                  onChange: function(event) {
                    setChainField(chainName, index, null, event.target.value);
                  }
                },
                chainKeys.map(function(key) {
                  return /* @__PURE__ */ react.createElement("option", { key, value: "chain:" + key }, "chain:" + key);
                })
              ) : /* @__PURE__ */ react.createElement(
                "input",
                {
                  className: "pf-panel-input",
                  value: stepText,
                  placeholder: "provider/model",
                  onChange: function(event) {
                    setChainField(chainName, index, null, event.target.value);
                  }
                }
              ), /* @__PURE__ */ react.createElement(
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
                catalogModels.map(function(m) {
                  return /* @__PURE__ */ react.createElement(
                    "option",
                    {
                      key: m.provider + "/" + m.model,
                      value: m.provider + "/" + m.model
                    },
                    m.label
                  );
                })
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
              isComposition ? chainKeys.map(function(key) {
                return /* @__PURE__ */ react.createElement("option", { key, value: "chain:" + key }, "chain:" + key);
              }) : catalogModels.map(function(m) {
                return /* @__PURE__ */ react.createElement(
                  "option",
                  {
                    key: m.provider + "/" + m.model,
                    value: m.provider + "/" + m.model
                  },
                  m.label
                );
              }),
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
