(() => {
  // plugins/profiles-client/src/client.js
  window.__ModuleLoader__.load({
    id: "profiles-client",
    factory: function(require2) {
      var module = { exports: {} };
      var exports = module.exports;
      var react = require2("react");
      var createElement = react.createElement;
      var useSyncExternalStore = react.useSyncExternalStore;
      var useState = react.useState;
      var useEffect = react.useEffect;
      var useRef = react.useRef;
      var PLUGIN_NAME = "profiles-client";
      var LOCALE_NS = "profiles-client";
      var MODEL_SEAT_SLOT = "conversation.input.model";
      var COST_SLOT = "conversation.input.right";
      var SEAT_PRIORITY = -100;
      var STYLE_TAG_ID = "profiles-client/client.module.css";
      var CSS_TEXT = [
        ".profiles-client-root{min-width:0;position:relative}",
        ".profiles-client-trigger{min-width:0;max-width:min(360px,45cqw);height:28px;color:var(--dsw-alias-label-secondary);cursor:pointer;background:0 0;border:none;border-radius:24px;outline:none;align-items:center;gap:5px;padding:0 8px;font-size:13px;font-weight:500;line-height:20px;display:flex}",
        ".profiles-client-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
        ".profiles-client-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}",
        ".profiles-client-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}",
        ".profiles-client-label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}",
        ".profiles-client-badge{flex:none;width:7px;height:7px;border-radius:50%;background:var(--dsw-alias-state-success-primary)}",
        ".profiles-client-chevron{color:var(--dsw-alias-label-caption);flex:none}",
        ".profiles-client-menu{z-index:20;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:max-content;min-width:220px;max-width:min(420px,100vw - 32px);max-height:min(400px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow:hidden}",
        ".profiles-client-section-label{color:var(--dsw-alias-label-tertiary);padding:6px 8px 2px;font-size:12px;font-weight:500;line-height:18px}",
        ".profiles-client-option{box-sizing:border-box;width:auto;min-width:100%;min-height:34px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:10px;outline:none;align-items:center;gap:8px;padding:5px 8px;display:flex}",
        ".profiles-client-option:hover:not(:disabled),.profiles-client-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}",
        ".profiles-client-option-copy{flex-direction:column;flex:1;min-width:0;display:flex}",
        ".profiles-client-option-name{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:20px;overflow:hidden}",
        ".profiles-client-option-detail{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:16px;overflow:hidden}",
        ".profiles-client-check{color:var(--dsw-alias-label-primary);flex:0 0 14px}",
        ".profiles-client-strip{color:var(--dsw-alias-label-tertiary);padding:10px;font-size:13px;line-height:20px}",
        ".profiles-client-cost{box-sizing:border-box;height:28px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap;align-items:center;justify-content:flex-end;padding:0 6px;font-size:12px;line-height:18px;display:inline-flex}"
      ].join("");
      if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(STYLE_TAG_ID) + "]") === null) {
        var tag = document.createElement("style");
        tag.dataset.plugin = PLUGIN_NAME;
        tag.dataset.pluginCss = STYLE_TAG_ID;
        tag.textContent = CSS_TEXT;
        document.head.appendChild(tag);
      }
      var EN = {
        "seat.fallback": "Model",
        "seat.aria": "Select model or profile",
        "badge.match": "Matches active profile",
        "menu.profiles": "Profiles",
        "menu.models": "Models",
        "cost.tooltip": "$ per million tokens, summed per model"
      };
      var ZH = {
        "seat.fallback": "\u6A21\u578B",
        "seat.aria": "\u9009\u62E9\u6A21\u578B\u6216\u914D\u7F6E",
        "badge.match": "\u4E0E\u5F53\u524D\u914D\u7F6E\u4E00\u81F4",
        "menu.profiles": "\u914D\u7F6E",
        "menu.models": "\u6A21\u578B",
        "cost.tooltip": "\u6BCF\u767E\u4E07 token \u7684\u8D39\u7528\uFF0C\u6309\u6A21\u578B\u6C47\u603B"
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
      function headOf(entry) {
        function isPair(value) {
          return typeof value === "object" && value !== null && typeof value.provider === "string" && typeof value.model === "string";
        }
        if (isPair(entry)) return { provider: entry.provider, model: entry.model };
        if (typeof entry === "object" && entry !== null && Array.isArray(entry.routes)) {
          for (var i = 0; i < entry.routes.length; i++) {
            if (isPair(entry.routes[i])) return { provider: entry.routes[i].provider, model: entry.routes[i].model };
          }
        }
        return void 0;
      }
      function activeFace(profileValue) {
        var active = profileValue && typeof profileValue.active === "string" ? profileValue.active : "work";
        var entry = active === "personal" ? profileValue.personal : profileValue.work;
        return { active, head: headOf(entry) };
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
      function num(value) {
        return typeof value === "number" && isFinite(value) ? value : 0;
      }
      function foldCost(nodes, rates) {
        var total = 0;
        var anything = false;
        for (var i = 0; i < nodes.length; i++) {
          var node = nodes[i];
          if (!node || node.kind !== "assistant") continue;
          var usage = node.usage;
          var config = node.requestConfig;
          if (typeof usage !== "object" || usage === null || config === void 0 || typeof config.provider !== "string" || typeof config.model !== "string") continue;
          var inputTokens = num(usage.inputTokens);
          var outputTokens = num(usage.outputTokens);
          if (inputTokens === 0 && outputTokens === 0) continue;
          var rate = rates[config.provider + "/" + config.model];
          if (typeof rate !== "object" || rate === null) return void 0;
          anything = true;
          total += (inputTokens * num(rate.input) + outputTokens * num(rate.output)) / 1e6;
        }
        return anything && total > 0 ? total : void 0;
      }
      function makeCostChip(pricesScope) {
        function CostChip(props) {
          var nodes = props.useSession(function(s) {
            return s.chat.legacy.nodes;
          });
          var t = props.t;
          var pricesSnap = useSyncExternalStore(pricesScope.store.subscribe, pricesScope.store.getSnapshot);
          var rates = pricesSnap.value !== void 0 && pricesSnap.value !== null ? pricesSnap.value.rates : void 0;
          var total = foldCost(nodes, rates === void 0 ? {} : rates);
          if (total === void 0) return null;
          return createElement("span", {
            className: "profiles-client-cost",
            title: t("cost.tooltip")
          }, "$" + total.toFixed(2));
        }
        return CostChip;
      }
      function makeModelSeat(profileScope) {
        function ProfileModelSeat(props) {
          var locked = props.locked;
          var available = props.available;
          var directory = props.directory;
          var load = props.load;
          var select = props.select;
          var t = props.t;
          var state = useSyncExternalStore(function(fn) {
            return directory.subscribe(fn);
          }, function() {
            return directory.getSnapshot();
          });
          var profileSnap = useSyncExternalStore(profileScope.store.subscribe, profileScope.store.getSnapshot);
          var profileValue = profileSnap.value;
          var openState = useState(false);
          var open = openState[0];
          var setOpen = openState[1];
          var rootRef = useRef(null);
          useEffect(function() {
            if (available) load();
          }, [available, load]);
          useEffect(function() {
            if (!open) return;
            var closeOutside = function(event) {
              if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false);
            };
            document.addEventListener("mousedown", closeOutside);
            return function() {
              document.removeEventListener("mousedown", closeOutside);
            };
          }, [open]);
          if (!available) return null;
          var current = state.current;
          var face = activeFace(profileValue);
          var matched = current !== void 0 && current !== null && face.head !== void 0 && current.provider === face.head.provider && current.model === face.head.model;
          var profileRows = [];
          if (profileValue !== void 0 && profileValue !== null) {
            var known = ["work", "personal"];
            for (var i = 0; i < known.length; i++) {
              var key = known[i];
              var head = headOf(profileValue[key]);
              if (head !== void 0) profileRows.push({ key, head });
            }
          }
          var modelRows = [];
          for (var g = 0; g < state.groups.length; g++) {
            var group = state.groups[g];
            for (var m = 0; m < group.models.length; m++) {
              modelRows.push({ provider: group.id, name: group.models[m].name, model: group.models[m].id });
            }
          }
          var pick = function(selection) {
            select(selection).then(function(accepted) {
              if (accepted) setOpen(false);
            }, function() {
            });
          };
          var onKeyDown = function(event) {
            if (event.key === "Escape" && open) {
              event.preventDefault();
              setOpen(false);
            }
          };
          var label = current !== void 0 && current !== null ? current.provider + "/" + current.model : t("seat.fallback");
          return createElement(
            "div",
            { className: "profiles-client-root", ref: rootRef, onKeyDown },
            createElement(
              "button",
              {
                type: "button",
                className: "profiles-client-trigger",
                "aria-haspopup": "listbox",
                "aria-expanded": open,
                "aria-label": t("seat.aria"),
                disabled: locked === true,
                onClick: function() {
                  setOpen(!open);
                  load();
                }
              },
              createElement("span", { className: "profiles-client-label" }, label),
              matched ? createElement("span", {
                className: "profiles-client-badge",
                title: t("badge.match"),
                "aria-label": t("badge.match")
              }) : null,
              createElement("span", { className: "profiles-client-chevron", "aria-hidden": true }, "\u25BE")
            ),
            open ? createElement(
              "div",
              { className: "profiles-client-menu", role: "listbox" },
              profileRows.length > 0 ? createElement(
                "div",
                null,
                createElement("div", { className: "profiles-client-section-label" }, t("menu.profiles")),
                profileRows.map(function(row) {
                  var isActive = row.key === face.active;
                  return createElement(
                    "button",
                    {
                      key: row.key,
                      type: "button",
                      className: "profiles-client-option",
                      onClick: function() {
                        pick(row.head);
                      }
                    },
                    createElement(
                      "span",
                      { className: "profiles-client-option-copy" },
                      createElement(
                        "span",
                        { className: "profiles-client-option-name" },
                        row.key + (isActive ? " \xB7" : "")
                      ),
                      createElement(
                        "span",
                        { className: "profiles-client-option-detail" },
                        row.head.provider + "/" + row.head.model
                      )
                    ),
                    isActive ? createElement("span", { className: "profiles-client-check", "aria-hidden": true }, "\u2713") : null
                  );
                })
              ) : null,
              createElement(
                "div",
                null,
                createElement("div", { className: "profiles-client-section-label" }, t("menu.models")),
                state.status === "error" && state.error ? createElement("div", { className: "profiles-client-strip" }, state.error) : null,
                modelRows.map(function(row) {
                  var isActive = current !== void 0 && current !== null && current.provider === row.provider && current.model === row.model;
                  return createElement(
                    "button",
                    {
                      key: row.provider + "/" + row.model,
                      type: "button",
                      className: "profiles-client-option",
                      onClick: function() {
                        pick({ provider: row.provider, model: row.model });
                      }
                    },
                    createElement(
                      "span",
                      { className: "profiles-client-option-copy" },
                      createElement("span", { className: "profiles-client-option-name" }, row.name),
                      createElement("span", { className: "profiles-client-option-detail" }, row.provider)
                    ),
                    isActive ? createElement("span", { className: "profiles-client-check", "aria-hidden": true }, "\u2713") : null
                  );
                })
              )
            ) : null
          );
        }
        return ProfileModelSeat;
      }
      var inject = ["slots", "sessions", "locale", "connection"];
      function apply(ctx) {
        ctx.effect(function() {
          return ctx.locale.register(LOCALE_NS, { en: EN, zh: ZH });
        }, "profiles-client: dictionaries");
        var profileScope;
        var pricesScope;
        try {
          profileScope = ctx.settingsScope.bind({ namespace: "profile" });
          pricesScope = ctx.settingsScope.bind({ namespace: "prices" });
        } catch (error) {
          profileScope = inertScope();
          pricesScope = inertScope();
        }
        installTitleRewriter(ctx);
        var seat = makeModelSeat(profileScope);
        ctx.inject(["slots", "sessions", "modelDirectories"], function(scope) {
          var models = scope.modelDirectories;
          var sessions = scope.sessions;
          scope.slots.inject(MODEL_SEAT_SLOT, function() {
            return scope.slots.register({
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
                    return usable ? directory.select(selection).then(function() {
                      return true;
                    }, function() {
                      return false;
                    }) : Promise.resolve(false);
                  }
                };
              }
            }, seat);
          });
        });
        var chip = makeCostChip(pricesScope);
        ctx.slots.inject(COST_SLOT, function() {
          return ctx.slots.register({
            name: COST_SLOT,
            id: "profiles-cost",
            order: 0,
            locale: LOCALE_NS,
            registrant: PLUGIN_NAME
          }, chip);
        });
      }
      module.exports = { apply, inject, name: PLUGIN_NAME };
      return module.exports;
    }
  });
})();
