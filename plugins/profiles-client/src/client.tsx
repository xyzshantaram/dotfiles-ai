/**
 * W6 — profiles-client (browser half).
 *
 * What replaces what. The shipped model seat is a `single`-slot entry: the
 * shipped dsh-client-ui-model-selection registers `conversation.input.model`
 * with no priority, and the renderer renders entriesOfSlot(key)[0] — the
 * first live entry in ascending priority order (dsh-client-ui-renderer
 * lib/client.js, the `spec.kind === "single"` branch). This bundle registers
 * the SAME slot name at priority -100, so this seat sorts first and wins the
 * cell while the shipped entry stays registered underneath. No shipped
 * entries are patched out; same slot at a different priority never throws
 * (same key AND same priority is the only throw). The -100 value mirrors the
 * live dsh-better-markdown precedent against shipped default 0.
 *
 * Selecting a profile applies it through the exact wire path the shipped
 * selector uses: the shared per-session ModelDirectory from
 * ctx.modelDirectories, whose select() calls
 * connection.api.sessions.selectModel({ sessionId, provider, model }) —
 * dsh-client-ui-model-selection lib/client.js, ModelDirectory.select.
 * Providers therefore change for THIS session only; profile.active is left
 * alone (the host profiles plugin owns flips).
 *
 * Match dot: the pill dot is blue while directory.current equals the active
 * profile's chain head (the same normalizeEntry head rule
 * plugins/profile-routes.ts defines), orange while a manual override selects
 * another model or another profile's head.
 *
 * Title rewriter: the renderer's own DocumentTitle effect overwrites external
 * document.title writes on every title change, so this wins with a
 * MutationObserver on document.head that re-applies `dsh | <session title>`
 * after every mutation and stops when the value already matches.
 *
 * The seam. Same as approval-comment: this file is the package's ./client
 * export, executed by the browser module loader; the factory's `require`
 * resolves through the browser module table (react is a platform module).
 */

import {
  injectStyle,
  mergeCss,
  fetchJson,
  putJson,
  registerLocale,
} from "../../shared/client-util";
import { entryHead, normalizeEntry, chainNameForRoutes } from "../../profile-routes";
import settingsCss from "../../shared/settings.css";
import localCss from "./client.module.css";

window.__ModuleLoader__.load({
  id: "profiles-client",
  factory: function (require) {
    var module = { exports: {} };

    /** React comes from the browser module table. */
    var react = require("react");
    var useSyncExternalStore = react.useSyncExternalStore;
    var useCallback = react.useCallback;
    var useState = react.useState;
    var useEffect = react.useEffect;
    var useRef = react.useRef;

    /** Stable plugin identity; also the loader entry id and CSS prefix root. */
    var PLUGIN_NAME = "profiles-client";
    /** Locale namespace owned by this bundle. */
    var LOCALE_NS = "profiles-client";
    function emptySubscribe() {
      return function () {};
    }
    function emptySnapshot() {
      return null;
    }
    /** Slot keys this bundle registers over (shipped owners keep default 0). */
    var MODEL_SEAT_SLOT = "conversation.input.model";
    /** Lower than the shipped seat's default 0; lowest live entry renders. */
    var SEAT_PRIORITY = -100;

    /**
     * One stylesheet for the seat, pill, and menu. Class names
     * use the kebab-case plugin prefix so they cannot collide.
     */
    var STYLE_TAG_ID = "profiles-client/client.module.css";
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settingsCss, localCss));

    /** English dictionary. */
    var EN = {
      "seat.fallback": "Model",
      "seat.aria": "Select model or profile",
      "menu.profiles": "Profiles",
      "menu.default": "Default",
      "menu.models": "Models",
      "menu.searchPlaceholder": "Search models\u2026",
      "menu.noResults": "No models match",
    };

    /** Simplified Chinese dictionary, checked complete against the en key set. */
    var ZH = {
      "seat.fallback": "\u6a21\u578b",
      "seat.aria": "\u9009\u62e9\u6a21\u578b\u6216\u914d\u7f6e",
      "menu.profiles": "\u914d\u7f6e",
      "menu.default": "\u9ed8\u8ba4",
      "menu.models": "\u6a21\u578b",
      "menu.searchPlaceholder": "\u641c\u7d22\u6a21\u578b\u2026",
      "menu.noResults": "\u65e0\u5339\u914d\u6a21\u578b",
    };

    /** Static stand-in scope when the settings transport is unavailable. */
    function inertScope() {
      var snapshot = Object.freeze({
        status: "unavailable",
        value: void 0,
        base: void 0,
        user: void 0,
        revision: void 0,
        writable: false,
      });
      return {
        store: {
          subscribe: function () {
            return function () {};
          },
          getSnapshot: function () {
            return snapshot;
          },
        },
      };
    }

    /** Active profile name and its expected orchestrator head. */
    function activeFace(profileValue) {
      var active =
        profileValue && typeof profileValue.active === "string" ? profileValue.active : "work";
      var chains = profileValue === void 0 || profileValue === null ? void 0 : profileValue.chains;
      var entry =
        profileValue === void 0 || profileValue === null
          ? void 0
          : active === "personal"
            ? profileValue.personal
            : profileValue.work;
      return { active: active, head: entryHead(entry, chains) };
    }
    /**
     * The W24 entry field ref check: a STRING names a key in the
     * profile `chains` map, an object is an inline { routes } chain.
     */
    function refNameOf(field) {
      return typeof field === "string" ? field : void 0;
    }

    /** True when the chain value is a composition array of steps. */
    function isCompositionChain(value) {
      return Array.isArray(value);
    }

    /** One step of a composition chain as display text: "provider/model" or "chain:<name>". */
    function stepTextOf(step) {
      if (typeof step === "string") return step;
      if (
        step !== void 0 &&
        step !== null &&
        typeof step.provider === "string" &&
        typeof step.model === "string"
      ) {
        return step.provider + "/" + step.model;
      }
      return "";
    }

    /**
     * One condensed line for a chain field: the referenced chain NAME when the
     * field is a string or matches a named chain, the step names when it is a
     * composition array, else "inline (N routes)".
     */
    function fieldSummary(field, chains) {
      var refName = refNameOf(field);
      if (refName !== void 0) return refName;
      if (Array.isArray(field)) {
        var steps = field.map(stepTextOf).filter(function (t) {
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

    // ── D5: title rewriter ─────────────────────────────────────────────

    /**
     * Keep document.title at `dsh | <session title>` ("dsh" when untitled).
     * The renderer's DocumentTitle effect writes `${title} — DeepSeek Harness`
     * on every change; the MutationObserver re-fires after ANY title mutation
     * (including our own write, which then compares equal and stops), so this
     * always lands last.
     */
    function installTitleRewriter(ctx) {
      if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
      function desired() {
        try {
          var snap = ctx.sessions.list.getSnapshot();
          var id = snap.current;
          var row = id === void 0 ? void 0 : snap.byId[id];
          var title =
            row !== void 0 && row !== null && typeof row.title === "string" ? row.title : void 0;
          return title === void 0 ? "dsh" : "dsh | " + title;
        } catch (error) {
          return null;
        }
      }
      ctx.effect(function () {
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
        return function () {
          if (stopList !== void 0) stopList();
          observer.disconnect();
        };
      }, "profiles-client: title rewriter");
    }

    // ── D1/D2/D3: the model seat ───────────────────────────────────────

    function makeModelSeat(profileScope) {
      function ProfileModelSeat(props) {
        var locked = props.locked;
        var available = props.available;
        var directory = props.directory;
        var load = props.load;
        var select = props.select;
        var t = props.t;

        var seatSubscribe = useCallback(
          function (fn) {
            return directory.subscribe(fn);
          },
          [directory],
        );
        var seatGetSnapshot = useCallback(
          function () {
            return directory.getSnapshot();
          },
          [directory],
        );
        var state = useSyncExternalStore(seatSubscribe, seatGetSnapshot);
        var profileSnap = useSyncExternalStore(
          profileScope.store.subscribe,
          profileScope.store.getSnapshot,
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
          function () {
            if (open) {
              if (searchInputRef.current) searchInputRef.current.focus();
            } else {
              setModelQuery("");
            }
          },
          [open],
        );

        useEffect(
          function () {
            if (available) load();
          },
          [available, load],
        );

        useEffect(
          function () {
            if (!open) return;
            var closeOutside = function (event) {
              if (rootRef.current !== null && !rootRef.current.contains(event.target))
                setOpen(false);
            };
            document.addEventListener("mousedown", closeOutside);
            return function () {
              document.removeEventListener("mousedown", closeOutside);
            };
          },
          [open],
        );

        var fetchProfiles = function () {
          fetchJson("/profiles/config").then(function (result) {
            if (result.error) return;
            if (
              result.data !== null &&
              result.data !== void 0 &&
              result.data.config !== null &&
              result.data.config !== void 0
            ) {
              setProfileConfig(result.data.config);
            }
          });
        };
        useEffect(
          function () {
            if (available) fetchProfiles();
          },
          [available],
        );

        if (!available) return null;

        var current = state.current;
        var liveProfile = profileConfig !== null ? profileConfig : profileValue;
        var face = activeFace(liveProfile);
        var matched =
          current !== void 0 &&
          current !== null &&
          face.head !== void 0 &&
          current.provider === face.head.provider &&
          current.model === face.head.model;

        /** Known profile entries, work first; only resolvable heads list. */
        var profileRows = [];
        if (liveProfile !== void 0 && liveProfile !== null) {
          var known = ["work", "personal"];
          for (var i = 0; i < known.length; i++) {
            var key = known[i];
            var head = entryHead(liveProfile[key], liveProfile.chains);
            if (head !== void 0) profileRows.push({ key: key, head: head });
          }
        }

        /** Resolve the pretty provider/model labels for one selection. */
        var prettyOf = function (provider, model) {
          for (var g = 0; g < state.groups.length; g++) {
            if (state.groups[g].id !== provider) continue;
            var plabel =
              typeof state.groups[g].name === "string" && state.groups[g].name !== ""
                ? state.groups[g].name
                : provider;
            for (var m = 0; m < state.groups[g].models.length; m++) {
              if (state.groups[g].models[m].id === model) {
                return { provider: plabel, model: state.groups[g].models[m].name };
              }
            }
            return { provider: plabel, model: model };
          }
          return { provider: provider, model: model };
        };

        /** Model options grouped by provider, pretty labels, in catalog order; filtered by search. */
        var trimmedQuery = modelQuery.trim().toLowerCase();
        var modelGroups = [];
        for (var g = 0; g < state.groups.length; g++) {
          var group = state.groups[g];
          if (group.models === void 0 || group.models.length === 0) continue;
          var providerLabel =
            typeof group.name === "string" && group.name !== "" ? group.name : group.id;
          var models = [];
          for (var m = 0; m < group.models.length; m++) {
            var gm = group.models[m];
            if (trimmedQuery !== "") {
              var hay = (
                gm.name +
                " " +
                gm.id +
                " " +
                group.id +
                " " +
                providerLabel
              ).toLowerCase();
              if (hay.indexOf(trimmedQuery) === -1) continue;
            }
            models.push({ id: gm.id, name: gm.name });
          }
          if (models.length === 0) continue;
          modelGroups.push({ id: group.id, label: providerLabel, models: models });
        }

        var pick = function (selection) {
          select(selection).then(
            function (accepted) {
              if (accepted) setOpen(false);
            },
            function () {},
          );
        };

        var onKeyDown = function (event) {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            setOpen(false);
          }
        };

        var currentPretty =
          current !== void 0 && current !== null ? prettyOf(current.provider, current.model) : null;
        var headText =
          face.head !== void 0 && face.head !== null
            ? face.head.model + " (" + face.head.provider + ")"
            : null;
        var hasProfile = face.active !== void 0 && face.active !== "";
        var modelText =
          currentPretty !== null
            ? currentPretty.model + " (" + currentPretty.provider + ")"
            : headText !== null
              ? headText
              : t("seat.fallback");

        return (
          <div className="profiles-client-root" ref={rootRef} onKeyDown={onKeyDown}>
            <button
              type="button"
              className="profiles-client-trigger"
              aria-haspopup="listbox"
              aria-expanded={open}
              aria-label={t("seat.aria")}
              disabled={locked === true}
              onClick={function () {
                var next = !open;
                setOpen(next);
                if (next) fetchProfiles();
                load();
              }}
            >
              {hasProfile ? (
                <span className="profiles-client-profile-pill">
                  {face.active}
                  <span
                    className={
                      "profiles-client-pill-dot" +
                      (matched
                        ? " profiles-client-pill-dot-matched"
                        : " profiles-client-pill-dot-changed")
                    }
                    aria-hidden={true}
                  />
                </span>
              ) : null}
              <span className="profiles-client-model-label">{modelText}</span>
              <span className="profiles-client-chevron" aria-hidden={true}>
                ▾
              </span>
            </button>
            {open ? (
              <div className="profiles-client-menu" role="listbox">
                <button
                  type="button"
                  className="profiles-client-option"
                  onClick={function () {
                    if (face.head !== void 0) pick(face.head);
                  }}
                >
                  <span className="profiles-client-option-copy">
                    <span className="profiles-client-option-name profiles-client-option-profile">
                      {t("menu.default")}
                    </span>
                    <span className="profiles-client-option-detail">
                      {face.head !== void 0
                        ? prettyOf(face.head.provider, face.head.model).provider +
                          "/" +
                          prettyOf(face.head.provider, face.head.model).model
                        : ""}
                    </span>
                  </span>
                </button>
                {profileRows.length > 0 ? (
                  <div>
                    <div className="dsp-section-title">{t("menu.profiles")}</div>
                    {profileRows.map(function (row) {
                      var isActive = row.key === face.active;
                      var headPretty = prettyOf(row.head.provider, row.head.model);
                      return (
                        <button
                          key={row.key}
                          type="button"
                          className="profiles-client-option"
                          onClick={function () {
                            putJson("/profiles/switch", { active: row.key }).then(
                              function (result) {
                                if (!result.error) setOpen(false);
                              },
                            );
                          }}
                        >
                          <span className="profiles-client-option-copy">
                            <span className="profiles-client-option-name profiles-client-option-profile">
                              {row.key + (isActive ? " ·" : "")}
                            </span>
                            <span className="profiles-client-option-detail">
                              {headPretty.provider + "/" + headPretty.model}
                            </span>
                          </span>
                          {isActive ? (
                            <span className="profiles-client-check" aria-hidden={true}>
                              ✓
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div>
                  <div className="dsp-section-title">{t("menu.models")}</div>
                  <input
                    ref={searchInputRef}
                    className="profiles-client-search"
                    type="search"
                    placeholder={t("menu.searchPlaceholder")}
                    value={modelQuery}
                    aria-label={t("menu.searchPlaceholder")}
                    onChange={function (event) {
                      setModelQuery(event.target.value);
                    }}
                    onKeyDown={function (event) {
                      event.stopPropagation();
                    }}
                    onMouseDown={function (event) {
                      event.stopPropagation();
                    }}
                  />
                  {state.status === "error" && state.error ? (
                    <div className="profiles-client-strip">{state.error}</div>
                  ) : null}
                  {modelGroups.length === 0 && trimmedQuery !== "" ? (
                    <div className="profiles-client-strip">{t("menu.noResults")}</div>
                  ) : (
                    modelGroups.map(function (grp) {
                      return (
                        <div key={grp.id}>
                          <div className="dsp-section-title">{grp.label}</div>
                          {grp.models.map(function (row) {
                            var isActive =
                              current !== void 0 &&
                              current !== null &&
                              current.provider === grp.id &&
                              current.model === row.id;
                            return (
                              <div
                                key={grp.id + "/" + row.id}
                                className="profiles-client-model-row"
                              >
                                <button
                                  type="button"
                                  className="profiles-client-option"
                                  onClick={function () {
                                    pick({ provider: grp.id, model: row.id });
                                  }}
                                >
                                  <span className="profiles-client-option-copy">
                                    <span className="profiles-client-option-name profiles-client-option-model">
                                      {row.name}
                                    </span>
                                    <span className="profiles-client-option-detail">
                                      {grp.label}
                                    </span>
                                  </span>
                                  {isActive ? (
                                    <span className="profiles-client-check" aria-hidden={true}>
                                      &#x2713;
                                    </span>
                                  ) : null}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>
        );
      }
      return ProfileModelSeat;
    }

    /**
     * Local stand-in for the shared SettingsSection (../../shared/settings-panel.tsx):
     * this bundle is a bare IIFE with no facade wrapper, so importing that
     * module would hoist a top-level __require("react") that the browser
     * throws on. Renders the same dsp-* structure settings.css provides.
     */
    function SettingsSection(props) {
      return (
        <div className="dsp-root">
          <div className="dsp-head">
            <h3 className="dsp-title">{props.title}</h3>
            {props.onRefresh ? (
              <button className="dsp-refresh" onClick={props.onRefresh}>
                {props.refreshLabel === undefined ? "Refresh" : props.refreshLabel}
              </button>
            ) : null}
          </div>
          {props.children}
        </div>
      );
    }

    // ── W24: profiles settings panel ─────────────────────────────────

    /** Fresh editable copy of the canonical config the panel edits. */
    function cloneConfig(config) {
      function cloneRoutes(routes) {
        return (routes || []).map(function (r) {
          var out: Record<string, unknown> = {
            provider: (r as unknown as Record<string, unknown>).provider as string,
            model: (r as unknown as Record<string, unknown>).model as string,
          };
          if (
            typeof (r as unknown as Record<string, unknown>).reasoningEffort === "string" &&
            ((r as unknown as Record<string, unknown>).reasoningEffort as string) !== ""
          )
            out.reasoningEffort = (r as unknown as Record<string, unknown>)
              .reasoningEffort as string;
          return out;
        });
      }
      function cloneEntry(entry) {
        return {
          orchestrator: cloneEntryField(entry && entry.orchestrator),
          subagent: cloneEntryField(entry && entry.subagent),
        };
      }
      function cloneEntryField(field) {
        if (typeof field === "string") return field;
        return { routes: cloneRoutes(field && field.routes) };
      }
      function cloneChains(chains) {
        var out = {};
        if (chains === void 0 || chains === null) return out;
        Object.keys(chains).forEach(function (name) {
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
        personal: cloneEntry(config && config.personal),
      };
    }

    /**
     * The W24 profiles settings panel. Rides the profile namespace over
     * /profiles/config (host routes in plugins/profiles.ts): shows both
     * entries as condensed chain summaries. The named chains section
     * below edits every chain. PUTs the whole canonical section back.
     */
    function makeProfilesPanel(models, sessions) {
      function ProfilesPanel() {
        var sessionSnap = useSyncExternalStore(sessions.list.subscribe, sessions.list.getSnapshot);
        var sessionId = sessionSnap !== null && sessionSnap !== void 0 ? sessionSnap.current : null;
        var usable =
          sessionId !== null && sessionId !== void 0
            ? sessions.subagentAddress(sessionId) === void 0
            : false;
        var directory =
          sessionId !== null && sessionId !== void 0 ? models.directoryFor(sessionId) : null;
        var catalogSubscribe = useCallback(
          function (cb) {
            return directory ? directory.store.subscribe(cb) : emptySubscribe();
          },
          [directory],
        );
        var catalogGetSnapshot = useCallback(
          function () {
            return directory ? directory.store.getSnapshot() : null;
          },
          [directory],
        );
        var catalogState = useSyncExternalStore(catalogSubscribe, catalogGetSnapshot);
        useEffect(
          function () {
            if (directory && usable) directory.load().catch(function () {});
          },
          [directory, usable],
        );
        var catalogGroups =
          catalogState !== null && catalogState !== void 0 && Array.isArray(catalogState.groups)
            ? catalogState.groups
            : [];
        var loadState = useState(null);
        var load = loadState[0];
        var setLoad = loadState[1];
        var draftState = useState(null);
        var draft = draftState[0];
        var setDraft = draftState[1];
        var saveState = useState({ busy: false, note: null, ok: true });
        var save = saveState[0];
        var setSave = saveState[1];

        /** Flat model catalog for dropdowns, from the live directory. */
        var catalogModels = [];
        for (var cg = 0; cg < catalogGroups.length; cg++) {
          var cgrp = catalogGroups[cg];
          var cmodels = cgrp.models !== void 0 && cgrp.models !== null ? cgrp.models : [];
          for (var cm = 0; cm < cmodels.length; cm++) {
            var cmod = cmodels[cm];
            catalogModels.push({
              provider: cgrp.id,
              model: cmod.id,
              label:
                (typeof cgrp.name === "string" && cgrp.name !== "" ? cgrp.name : cgrp.id) +
                " / " +
                cmod.name,
              reasoning: cmod.reasoning,
            });
          }
        }
        /** Efforts of a catalog model (or [] when it advertises none). */
        function effortsOf(reasoning) {
          if (reasoning !== void 0 && reasoning !== null && Array.isArray(reasoning.efforts)) {
            return reasoning.efforts;
          }
          return [];
        }

        /** Set one entry field (work/personal × orchestrator/subagent) to a chain's routes. */
        var setEntryChain = function (name, chainKey, chainName) {
          setDraft(function (prev) {
            var next = cloneConfig(prev);
            next[name][chainKey] = chainName === "" ? { routes: [] } : chainName;
            return next;
          });
        };
        /** Detach one entry field (clear it to no routes). */
        var detachEntryField = function (name, chainKey) {
          setDraft(function (prev) {
            var next = cloneConfig(prev);
            next[name][chainKey] = { routes: [] };
            return next;
          });
        };
        /** Replace a chain rung's model from a "provider/model" value (or clear it). */
        var setChainRungModel = function (chainName, index, value) {
          setDraft(function (prev) {
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
                    model: value.slice(slash + 1),
                  };
                }
              }
            }
            return next;
          });
        };
        /** Set a chain rung's reasoning effort (empty = adapter default). */
        var setChainRungEffort = function (chainName, index, effort) {
          setDraft(function (prev) {
            var next = cloneConfig(prev);
            var chain = next.chains[chainName];
            if (chain === void 0) return next;
            if (Array.isArray(chain)) {
              // Composition string steps cannot carry an effort; ignore.
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
        /** Append a rung to a chain from the add-dropdown selection. */
        var appendChainRung = function (chainName, value) {
          setDraft(function (prev) {
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
                // A {routes} chain cannot hold a chain ref; keep it a model list.
                // Convert to composition so the ref is representable.
                var composed = chain.routes.map(function (r) {
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
                var composed2 = chain.routes.map(function (r) {
                  return r.provider + "/" + r.model;
                });
                composed2.push(value);
                next.chains[chainName] = composed2;
              }
              return next;
            }
            // provider/model value
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
        var fetchConfig = function () {
          setSave({ busy: false, note: null, ok: true });
          fetchJson("/profiles/config").then(function (result) {
            if (result.error) {
              setLoad({ error: result.error });
              return;
            }
            setLoad(result.data);
            setDraft(cloneConfig(result.data.config));
          });
        };

        useEffect(function () {
          fetchConfig();
        }, []);

        if (load === null) {
          return (
            <SettingsSection title={"Profiles"} onRefresh={fetchConfig} refreshLabel={"Refresh"} />
          );
        }
        if (load.error) {
          return (
            <SettingsSection title={"Profiles"} onRefresh={fetchConfig} refreshLabel={"Refresh"}>
              <div className="dsp-err">{"Profiles: " + load.error}</div>
            </SettingsSection>
          );
        }

        var config = draft;
        var errorCache = load.errorCache || {};

        var setActive = function (name) {
          setDraft(function (prev) {
            var next = cloneConfig(prev);
            next.active = name;
            return next;
          });
        };
        var setChainField = function (chainName, index, value) {
          setDraft(function (prev) {
            var next = cloneConfig(prev);
            var chain = next.chains[chainName];
            if (chain === void 0) return next;
            if (Array.isArray(chain)) {
              chain[index] = value;
            }
            return next;
          });
        };
        var removeChainRung = function (chainName, index) {
          setDraft(function (prev) {
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
        var addChain = function () {
          var name = window.prompt("New named chain name", "new-chain");
          if (name === null) return;
          var key = name.trim();
          if (key === "") return;
          setDraft(function (prev) {
            var next = cloneConfig(prev);
            if (next.chains[key] === void 0) {
              next.chains[key] = { routes: [] };
            }
            return next;
          });
        };
        var removeChain = function (chainName) {
          setDraft(function (prev) {
            var next = cloneConfig(prev);
            delete next.chains[chainName];
            return next;
          });
        };
        var saveConfig = function () {
          var body = {
            active: config.active,
            chains: config.chains,
            work: {
              orchestrator: config.work.orchestrator,
              subagent: config.work.subagent,
            },
            personal: {
              orchestrator: config.personal.orchestrator,
              subagent: config.personal.subagent,
            },
          };
          setSave({ busy: true, note: null, ok: true });
          putJson("/profiles/config", body).then(function (result) {
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
        /** Current directory selection and its catalog entry. */
        var currentModel =
          catalogState !== void 0 && catalogState !== null ? catalogState.current : void 0;
        var currentCat = null;
        if (currentModel !== void 0 && currentModel !== null) {
          for (var cmi = 0; cmi < catalogModels.length; cmi++) {
            if (
              catalogModels[cmi].provider === currentModel.provider &&
              catalogModels[cmi].model === currentModel.model
            ) {
              currentCat = catalogModels[cmi];
              break;
            }
          }
        }
        var currentEffortList = currentCat !== null ? effortsOf(currentCat.reasoning) : [];
        var currentEffortValue =
          currentModel !== void 0 &&
          currentModel !== null &&
          typeof currentModel.reasoningEffort === "string" &&
          currentModel.reasoningEffort !== ""
            ? currentModel.reasoningEffort
            : currentCat !== null &&
                currentCat.reasoning !== void 0 &&
                currentCat.reasoning !== null &&
                typeof currentCat.reasoning.defaultEffort === "string"
              ? currentCat.reasoning.defaultEffort
              : "";
        return (
          <SettingsSection title={"Profiles"} onRefresh={fetchConfig} refreshLabel={"Refresh"}>
            <div className="pf-panel-active">
              {entries.map(function (name) {
                return (
                  <button
                    key={name}
                    type="button"
                    className={
                      "pf-panel-active-btn" +
                      (config.active === name ? " pf-panel-active-btn-on" : "")
                    }
                    onClick={function () {
                      setActive(name);
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
            {currentEffortList.length > 0 && currentModel !== void 0 && currentModel !== null ? (
              <div className="pf-panel-model-row">
                <div className="pf-panel-row">
                  <span className="pf-panel-ref" title="Current model">
                    {currentCat !== null
                      ? currentCat.label
                      : currentModel.provider + "/" + currentModel.model}
                  </span>
                  <select
                    className="pf-panel-effort"
                    value={currentEffortValue}
                    aria-label="Current model reasoning effort"
                    onChange={function (event) {
                      var effort = event.target.value;
                      directory.select({
                        provider: currentModel.provider,
                        model: currentModel.model,
                        reasoningEffort: effort === "" ? undefined : effort,
                      });
                    }}
                  >
                    <option value="">Default</option>
                    {currentEffortList.map(function (eff) {
                      return (
                        <option
                          key={eff.id}
                          value={eff.id}
                          title={eff.description !== void 0 ? eff.description : undefined}
                        >
                          {eff.name}
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            ) : null}
            {entries.map(function (name) {
              var entry = config[name];
              return (
                <div className="pf-panel-entry" key={name}>
                  <h4 className="pf-panel-entry-title">{name === "work" ? "Work" : "Personal"}</h4>
                  {["orchestrator", "subagent"].map(function (chainKey) {
                    var field = entry[chainKey];
                    var label = chainKey === "orchestrator" ? "orchestrator" : "subagent";
                    var summary = fieldSummary(field, config.chains);
                    var currentRef = refNameOf(field);
                    var isInline = false;
                    if (currentRef === void 0 && field !== void 0 && field !== null) {
                      if (Array.isArray(field) && field.length > 0) isInline = true;
                      else if (
                        typeof field === "object" &&
                        Array.isArray(field.routes) &&
                        field.routes.length > 0
                      )
                        isInline = true;
                    }
                    var selectValue =
                      currentRef !== void 0 ? currentRef : isInline ? "__inline__" : "__detach__";
                    return (
                      <div className="pf-panel-chain" key={chainKey}>
                        <div className="pf-panel-row">
                          <h5 className="pf-panel-chain-title">{label}</h5>
                          <select
                            className="pf-panel-select"
                            value={selectValue}
                            onChange={function (event) {
                              var val = event.target.value;
                              if (val === "__detach__") {
                                detachEntryField(name, chainKey);
                              } else if (val === "__inline__") {
                                return;
                              } else {
                                setEntryChain(name, chainKey, val);
                              }
                            }}
                          >
                            <option value="__detach__">— none —</option>
                            {chainKeys.map(function (key) {
                              return (
                                <option key={key} value={key}>
                                  {key}
                                </option>
                              );
                            })}
                            {isInline ? (
                              <option value="__inline__">
                                {fieldSummary(field, config.chains)}
                              </option>
                            ) : null}
                          </select>
                          <button
                            type="button"
                            className="pf-panel-del"
                            title="Detach"
                            onClick={function () {
                              detachEntryField(name, chainKey);
                            }}
                          >
                            ×
                          </button>
                        </div>
                        <div className="pf-panel-meta">{label + " → " + summary}</div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
            <div className="pf-panel-entry">
              <div className="pf-panel-head">
                <h4 className="pf-panel-entry-title">Named chains</h4>
                <button type="button" className="pf-panel-add" onClick={addChain}>
                  + Add chain
                </button>
              </div>
              {Object.keys(config.chains).length === 0 ? (
                <div className="pf-panel-meta">No named chains</div>
              ) : (
                Object.keys(config.chains).map(function (chainName) {
                  var chain = config.chains[chainName];
                  var isComposition = isCompositionChain(chain);
                  var resolved = normalizeEntry(chain, config.chains);
                  var steps = isComposition
                    ? chain.map(function (step) {
                        return { step: step };
                      })
                    : chain !== void 0 && Array.isArray(chain.routes)
                      ? chain.routes
                      : [];
                  return (
                    <div className="pf-panel-chain" key={chainName}>
                      <div className="pf-panel-row">
                        <h5 className="pf-panel-chain-title">{chainName}</h5>
                        <button
                          type="button"
                          className="pf-panel-del"
                          title="Remove chain"
                          onClick={function () {
                            removeChain(chainName);
                          }}
                        >
                          ×
                        </button>
                      </div>
                      {isComposition
                        ? steps.map(function (row, index) {
                            var stepText = typeof row.step === "string" ? row.step : "";
                            var isRef = stepText.indexOf("chain:") === 0;
                            return (
                              <div className="pf-panel-row" key={index}>
                                {isRef ? (
                                  <select
                                    className="pf-panel-select"
                                    value={stepText}
                                    onChange={function (event) {
                                      setChainField(chainName, index, event.target.value);
                                    }}
                                  >
                                    {chainKeys.map(function (key) {
                                      return (
                                        <option key={key} value={"chain:" + key}>
                                          {"chain:" + key}
                                        </option>
                                      );
                                    })}
                                  </select>
                                ) : (
                                  <input
                                    className="pf-panel-input"
                                    value={stepText}
                                    placeholder="provider/model"
                                    onChange={function (event) {
                                      setChainField(chainName, index, event.target.value);
                                    }}
                                  />
                                )}
                                <button
                                  type="button"
                                  className="pf-panel-del"
                                  title="Remove step"
                                  onClick={function () {
                                    removeChainRung(chainName, index);
                                  }}
                                >
                                  ×
                                </button>
                              </div>
                            );
                          })
                        : steps.map(function (rung, index) {
                            var rungKey = rung.provider + "/" + rung.model;
                            var catModel = null;
                            for (var ci = 0; ci < catalogModels.length; ci++) {
                              if (
                                catalogModels[ci].provider === rung.provider &&
                                catalogModels[ci].model === rung.model
                              ) {
                                catModel = catalogModels[ci];
                                break;
                              }
                            }
                            var efforts = catModel !== null ? effortsOf(catModel.reasoning) : [];
                            var currentEffort =
                              typeof rung.reasoningEffort === "string" ? rung.reasoningEffort : "";
                            return (
                              <div className="pf-panel-model-row" key={index}>
                                <div className="pf-panel-row">
                                  <select
                                    className="pf-panel-select"
                                    value={rungKey}
                                    onChange={function (event) {
                                      setChainRungModel(chainName, index, event.target.value);
                                    }}
                                  >
                                    <option value="">— select model —</option>
                                    {catalogModels.map(function (m) {
                                      return (
                                        <option
                                          key={m.provider + "/" + m.model}
                                          value={m.provider + "/" + m.model}
                                        >
                                          {m.label}
                                        </option>
                                      );
                                    })}
                                  </select>
                                  {efforts.length > 0 ? (
                                    <select
                                      className="pf-panel-effort"
                                      value={currentEffort}
                                      onChange={function (event) {
                                        setChainRungEffort(chainName, index, event.target.value);
                                      }}
                                    >
                                      <option value="">Default effort</option>
                                      {efforts.map(function (eff) {
                                        return (
                                          <option
                                            key={eff.id}
                                            value={eff.id}
                                            title={
                                              eff.description !== void 0
                                                ? eff.description
                                                : undefined
                                            }
                                          >
                                            {eff.name}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  ) : null}
                                  <button
                                    type="button"
                                    className="pf-panel-del"
                                    title="Remove rung"
                                    onClick={function () {
                                      removeChainRung(chainName, index);
                                    }}
                                  >
                                    ×
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                      <div className="pf-panel-row">
                        <select
                          className="pf-panel-select pf-panel-add-select"
                          value=""
                          onChange={function (event) {
                            var val = event.target.value;
                            if (val !== "") appendChainRung(chainName, val);
                            event.target.value = "";
                          }}
                        >
                          <option value="">
                            {"+ Add " + (isComposition ? "step" : "rung") + " ▾"}
                          </option>
                          {isComposition
                            ? chainKeys.map(function (key) {
                                return (
                                  <option key={key} value={"chain:" + key}>
                                    {"chain:" + key}
                                  </option>
                                );
                              })
                            : catalogModels.map(function (m) {
                                return (
                                  <option
                                    key={m.provider + "/" + m.model}
                                    value={m.provider + "/" + m.model}
                                  >
                                    {m.label}
                                  </option>
                                );
                              })}
                          <option value="__new__">New named chain…</option>
                        </select>
                      </div>
                      {resolved.length > 0 ? (
                        <div className="pf-panel-meta">
                          {"Resolves to " +
                            resolved.length +
                            " route" +
                            (resolved.length === 1 ? "" : "s") +
                            ": " +
                            resolved[0].provider +
                            "/" +
                            resolved[0].model +
                            (resolved.length > 1 ? " …" : "")}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
            <div className="pf-panel-meta">
              {downRungs > 0 ? (
                <span>
                  {downRungs + " rung" + (downRungs === 1 ? "" : "s") + " cached down "}
                  <button type="button" className="dsp-refresh" onClick={fetchConfig}>
                    Retry now
                  </button>
                </span>
              ) : null}
            </div>
            <div className="pf-panel-actions">
              <button
                type="button"
                className="pf-panel-save"
                disabled={save.busy === true}
                onClick={saveConfig}
              >
                {save.busy === true ? "Saving…" : "Save"}
              </button>
              {save.note ? (
                <span className={"pf-panel-status " + (save.ok ? "pf-panel-ok" : "pf-panel-bad")}>
                  {save.note}
                </span>
              ) : null}
            </div>
          </SettingsSection>
        );
      }
      return ProfilesPanel;
    }

    // ── plugin body ────────────────────────────────────────────────────

    /** Services this bundle reaches through the client plugin context. */
    var inject = ["slots", "sessions", "locale", "connection"];

    function apply(ctx) {
      ctx.effect(function () {
        return registerLocale(ctx, LOCALE_NS, EN, ZH);
      }, "profiles-client: dictionaries");

      // Settings arrive through the ui-settings shared describe mirror: each
      // namespace binds a derived scope over it, so this bundle is not a second
      // settings.describe reader. When that service is absent, inert scopes
      // keep the seat loadable with no profile data.
      var profileScope;
      try {
        profileScope = ctx.settingsScope.bind({ namespace: "profile" });
      } catch (error) {
        profileScope = inertScope();
      }

      installTitleRewriter(ctx);

      var seat = makeModelSeat(profileScope);
      // Parks until ui-model-selection's resolver service mounts, mirroring
      // how the shipped /model contribution consumes modelDirectories. If
      // that package is absent, this seat stays parked instead of throwing.
      ctx.inject(["slots", "sessions", "modelDirectories"], function (scope) {
        var models = scope.modelDirectories;
        var sessions = scope.sessions;
        scope.slots.inject(MODEL_SEAT_SLOT, function () {
          return scope.slots.register(
            {
              name: MODEL_SEAT_SLOT,
              locale: LOCALE_NS,
              priority: SEAT_PRIORITY,
              registrant: PLUGIN_NAME,
              inject: function (sessionId) {
                var directory = models.directoryFor(sessionId);
                var usable = sessions.subagentAddress(sessionId) === void 0;
                return {
                  available: usable,
                  directory: directory.store,
                  load: function () {
                    if (usable) directory.load().catch(function () {});
                  },
                  select: function (selection) {
                    return usable
                      ? directory.select(selection).then(
                          function () {
                            return true;
                          },
                          function () {
                            return false;
                          },
                        )
                      : Promise.resolve(false);
                  },
                };
              },
            },
            seat,
          );
        });
        var Panel = makeProfilesPanel(models, sessions);
        ctx.slots.inject("settings.section", function () {
          return ctx.slots.register(
            { name: "settings.section", id: PLUGIN_NAME, order: 27, label: "Profiles" },
            function () {
              return <Panel />;
            },
          );
        });
      });
    }

    module.exports = { apply: apply, inject: inject, name: PLUGIN_NAME };
    return module.exports;
  },
});
