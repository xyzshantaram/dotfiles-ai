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
 * The seam. Same as tool-render: this file is the package's ./client
 * export in facade form, bundled by build.mjs through wrapClientBundle;
 * the wrapper calls window.__ModuleLoader__.load itself, so this file must
 * not. react, react-dom and @deepseek-ai/* stay external and resolve through
 * the factory's `require` (react is a platform module); @dnd-kit inlines.
 */

import {
  injectStyle,
  mergeCss,
  fetchJson,
  putJson,
  request,
  registerLocale,
} from "../../shared/client-util";
import { entryHead, normalizeEntry, chainNameForRoutes } from "../../profile-routes";
import settingsCss from "../../shared/settings.css";
import localCss from "./client.module.css";

import * as react from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import * as primitivesModule from "@deepseek-ai/dsh-client-ui-primitives";

var IconChevronDownOutline14 = primitivesModule.IconChevronDownOutline14;

/**
 * SortableContext through an untyped binding. @dnd-kit/sortable v10 types
 * Props with a REQUIRED `children`, which nested JSX cannot satisfy under
 * this repo's classic-JSX setup: every other client half types react as
 * `any` through the shared shims, while this bundle resolves the real
 * react 19 package (installed beside @dnd-kit) and gets strict JSX
 * checking instead. The any binding recovers the repo-wide behavior;
 * the runtime element is unchanged.
 */
var SortableCtx: any = SortableContext;

/** Custom brain mark: user-supplied brain and circuit artwork, 14px render. */
function BrainIcon14() {
  return (
    <svg width={14} height={14} viewBox="0 0 480 480" fill="none" aria-hidden={true}>
      <g transform="matrix(2.6933 0 0 2.808 -33.019 -25.795)">
        <g
          transform="rotate(90,100,100)"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={14}
        >
          <path d="m96 166v-132c0-12-12-20-23-16-9 3-15 10-16 19-12-5-25 3-27 16-1 8 2 14 6 18-14 6-21 20-18 33 3 14 15 23 28 21-8 11-6 25 4 32 6 4 14 5 21 2 5 11 15 17 25 7z" />
          <path d="m102 100h50" />
          <path d="m102 72h28l25-25" />
          <path d="m102 128h28l25 25" />
          <circle cx="161" cy="100" r="9" />
          <circle cx="161" cy="41" r="9" />
          <circle cx="161" cy="159" r="9" />
          <circle cx="122" cy="30" r="9" />
          <circle cx="122" cy="170" r="9" />
        </g>
      </g>
    </svg>
  );
}
/** Custom network mark: Lucide network artwork, 14px render. */
function NetworkIcon14() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={true}
    >
      <rect x="16" y="16" width="6" height="6" rx="1" />
      <rect x="2" y="16" width="6" height="6" rx="1" />
      <rect x="9" y="2" width="6" height="6" rx="1" />
      <path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3" />
      <path d="M12 12V8" />
    </svg>
  );
}
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
  "menu.default": "Profile default",
  "menu.models": "Models",
  "menu.searchPlaceholder": "Search models\u2026",
  "menu.noResults": "No models match",
};

/** Simplified Chinese dictionary, checked complete against the en key set. */
var ZH = {
  "seat.fallback": "\u6a21\u578b",
  "seat.aria": "\u9009\u62e9\u6a21\u578b\u6216\u914d\u7f6e",
  "menu.profiles": "\u914d\u7f6e",
  "menu.default": "配置默认",
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
    var errorDownState = useState([]);
    var errorDown = errorDownState[0];
    var setErrorDown = errorDownState[1];
    var effortOpenState = useState(false);
    var effortOpen = effortOpenState[0];
    var setEffortOpen = effortOpenState[1];
    var effortPosState = useState(null);
    var effortPos = effortPosState[0];
    var setEffortPos = effortPosState[1];
    var effortRowRef = useRef(null);
    var menuRef = useRef(null);
    var effortPanelRef = useRef(null);

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

    useEffect(
      function () {
        if (!open) {
          setEffortOpen(false);
          setEffortPos(null);
        }
      },
      [open],
    );

    useEffect(
      function () {
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
      [effortOpen],
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
        var down =
          result.data !== null &&
          result.data !== void 0 &&
          result.data.errorCache !== null &&
          result.data.errorCache !== void 0 &&
          Array.isArray(result.data.errorCache.down)
            ? result.data.errorCache.down
            : [];
        setErrorDown(down);
      });
    };
    var resetErrorCache = function () {
      request("DELETE", "/profiles/error-cache").then(function () {
        fetchProfiles();
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
          if (accepted) {
            request("DELETE", "/profiles/error-cache").then(function () {
              fetchProfiles();
            });
          }
        },
        function () {},
      );
    };

    /** Efforts of a catalog model (or [] when it advertises none). */
    function seatEffortsOf(reasoning) {
      if (reasoning !== void 0 && reasoning !== null && Array.isArray(reasoning.efforts)) {
        return reasoning.efforts;
      }
      return [];
    }

    var onKeyDown = function (event) {
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

    var currentPretty =
      current !== void 0 && current !== null ? prettyOf(current.provider, current.model) : null;
    var headText =
      face.head !== void 0 && face.head !== null
        ? face.head.model + " (" + face.head.provider + ")"
        : null;
    var hasProfile = face.active !== void 0 && face.active !== "";
    var triggerModelText =
      currentPretty !== null
        ? currentPretty.model
        : face.head !== void 0 && face.head !== null
          ? prettyOf(face.head.provider, face.head.model).model
          : t("seat.fallback");
    var triggerProviderText =
      currentPretty !== null
        ? currentPretty.provider
        : face.head !== void 0 && face.head !== null
          ? prettyOf(face.head.provider, face.head.model).provider
          : null;
    // Raw identifiers for the segment tooltips: the badge text shows the
    // pretty catalog labels, the tooltip shows the exact provider/model.
    var triggerModelRaw =
      current !== void 0 && current !== null
        ? current.provider + "/" + current.model
        : face.head !== void 0 && face.head !== null
          ? face.head.provider + "/" + face.head.model
          : triggerModelText;
    var triggerProviderRaw =
      current !== void 0 && current !== null
        ? current.provider
        : face.head !== void 0 && face.head !== null
          ? face.head.provider
          : "";
    /** Current directory selection's catalog entry and advertised efforts. */
    var seatCurrentCat = null;
    if (current !== void 0 && current !== null) {
      for (var sgi = 0; sgi < state.groups.length; sgi++) {
        if (state.groups[sgi].id !== current.provider) continue;
        var sgModels =
          state.groups[sgi].models !== void 0 && state.groups[sgi].models !== null
            ? state.groups[sgi].models
            : [];
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
    var seatEffortValue =
      current !== void 0 &&
      current !== null &&
      typeof current.reasoningEffort === "string" &&
      current.reasoningEffort !== ""
        ? current.reasoningEffort
        : "";
    var seatEffortStops = [{ id: "", name: "Default" }].concat(
      seatEffortList.map(function (eff) {
        return { id: eff.id, name: eff.name };
      }),
    );
    var seatEffortIndex = 0;
    for (var sei = 0; sei < seatEffortStops.length; sei++) {
      if (seatEffortStops[sei].id === seatEffortValue) {
        seatEffortIndex = sei;
        break;
      }
    }
    var seatEffortName = seatEffortStops[seatEffortIndex].name;
    var stopLeftOf = function (index) {
      if (seatEffortStops.length <= 1) return "50%";
      return (
        "calc(0.4375rem + (100% - 0.875rem) * " +
        index +
        " / " +
        (seatEffortStops.length - 1) +
        ")"
      );
    };
    var closeEffort = function () {
      setEffortOpen(false);
      setEffortPos(null);
    };
    var toggleEffort = function () {
      if (effortOpen) {
        closeEffort();
        return;
      }
      var rowRect =
        effortRowRef.current !== null ? effortRowRef.current.getBoundingClientRect() : null;
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
      setEffortPos({ top: top, left: left });
      setEffortOpen(true);
    };
    var onMenuScroll = function () {
      if (effortOpen) closeEffort();
    };

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
          <span className="profiles-client-badge">
            {hasProfile ? (
              <span
                className="profiles-client-badge-segment"
                title={
                  "profile " +
                  face.active +
                  (matched
                    ? ""
                    : " (off profile head)")
                }
                data-dsh-tip=""
              >
                <span
                  className={
                    "profiles-client-pill-dot" +
                    (matched
                      ? " profiles-client-pill-dot-matched"
                      : " profiles-client-pill-dot-changed")
                  }
                  aria-hidden={true}
                />
                <span className="profiles-client-profile-name">{face.active}</span>
              </span>
            ) : null}
            {triggerProviderText !== null ? (
              <span
                className="profiles-client-badge-segment"
                title={"provider " + triggerProviderRaw}
                data-dsh-tip=""
              >
                <NetworkIcon14 />
                <span className="profiles-client-model-provider">{triggerProviderText}</span>
              </span>
            ) : null}
            <span
              className="profiles-client-badge-segment profiles-client-badge-model"
              title={"model " + triggerModelRaw}
              data-dsh-tip=""
            >
              <BrainIcon14 />
              <span className="profiles-client-model-name">{triggerModelText}</span>
            </span>
            {!matched && current !== void 0 && current !== null ? (
              <span
                className="profiles-client-badge-segment"
                title={"override: " + current.provider + "/" + current.model}
                data-dsh-tip=""
                onAuxClick={function (event) {
                  if (event.button === 1) {
                    event.preventDefault();
                    event.stopPropagation();
                    resetErrorCache();
                  }
                }}
              >
                <span className="profiles-client-model-name">~</span>
              </span>
            ) : null}
          </span>
          <IconChevronDownOutline14
            className={
              open
                ? "profiles-client-chevron profiles-client-chevron-open"
                : "profiles-client-chevron"
            }
            aria-hidden={true}
          />
        </button>
        {open ? (
          <div
            className="profiles-client-menu"
            role="listbox"
            ref={menuRef}
            onScroll={onMenuScroll}
          >
            {seatEffortList.length > 0 && current !== void 0 && current !== null ? (
              <div>
                <button
                  type="button"
                  className="profiles-client-option"
                  ref={effortRowRef}
                  aria-expanded={effortOpen}
                  aria-haspopup="dialog"
                  onClick={toggleEffort}
                >
                  <span className="profiles-client-option-copy">
                    <span className="profiles-client-option-name">Reasoning</span>
                    <span className="profiles-client-option-detail">{seatEffortName}</span>
                  </span>
                  <span className="profiles-client-effort-chevron" aria-hidden={true}>
                    ›
                  </span>
                </button>
                {effortOpen ? (
                  <div
                    className="profiles-client-effort-popover"
                    ref={effortPanelRef}
                    role="dialog"
                    aria-label="Model reasoning effort"
                    style={{
                      top: effortPos !== null ? effortPos.top : 0,
                      left: effortPos !== null ? effortPos.left : 0,
                    }}
                  >
                    <div className="profiles-client-effort-row">
                      <div className="profiles-client-effort-slider-wrap">
                        <input
                          type="range"
                          className="profiles-client-effort-slider"
                          min={0}
                          max={seatEffortStops.length - 1}
                          step={1}
                          value={seatEffortIndex}
                          aria-label="Model reasoning effort"
                          onChange={function (event) {
                            var index = Number(event.target.value);
                            var stop = seatEffortStops[index];
                            select({
                              provider: current.provider,
                              model: current.model,
                              reasoningEffort:
                                stop !== void 0 && stop.id !== "" ? stop.id : undefined,
                            });
                          }}
                        />
                        {seatEffortStops.map(function (stop, tickIndex) {
                          return (
                            <span
                              key={stop.id !== "" ? stop.id : "default"}
                              className="profiles-client-effort-tick"
                              aria-hidden={true}
                              style={{ left: stopLeftOf(tickIndex) }}
                            />
                          );
                        })}
                      </div>
                      <div className="profiles-client-effort-labels">
                        {seatEffortStops.map(function (stop, labelIndex) {
                          return (
                            <span
                              key={stop.id !== "" ? stop.id : "default"}
                              className={
                                labelIndex === seatEffortIndex
                                  ? "profiles-client-effort-stop profiles-client-effort-stop-active"
                                  : "profiles-client-effort-stop"
                              }
                              style={{ left: stopLeftOf(labelIndex) }}
                            >
                              {stop.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
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
                            if (!result.error) {
                              request("DELETE", "/profiles/error-cache").then(function () {
                                fetchProfiles();
                              });
                            }
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
                          <button
                            key={grp.id + "/" + row.id}
                            type="button"
                            className="profiles-client-option"
                            onClick={function () {
                              pick({ provider: grp.id, model: row.id });
                            }}
                          >
                            <span className="profiles-client-option-copy profiles-client-option-copy-model">
                              <span className="profiles-client-option-name profiles-client-option-model">
                                {row.name}
                              </span>
                              <span className="profiles-client-option-detail">{grp.label}</span>
                            </span>
                            {isActive ? (
                              <span className="profiles-client-check" aria-hidden={true}>
                                &#x2713;
                              </span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
            {errorDown.length > 0 ? (
              <div className="profiles-client-error-row">
                <span className="profiles-client-error-count">
                  {errorDown.length + " cached down"}
                </span>
                <button
                  type="button"
                  className="profiles-client-error-reset"
                  onClick={function () {
                    resetErrorCache();
                  }}
                >
                  Reset
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }
  return ProfileModelSeat;
}

/**
 * Local stand-in for the shared SettingsSection (../../shared/settings-panel.tsx):
 * kept local so this panel renders the same dsp-* structure settings.css
 * provides without pulling in that module's own dependency closure.
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

/**
 * One draggable chain rung row. Only the grip carries the drag listeners,
 * so the selects and buttons in the row keep working; the parent
 * DndContext pairs PointerSensor with KeyboardSensor +
 * sortableKeyboardCoordinates, so the same grip reorders with arrow keys
 * and no mouse. The step value itself is never touched by the move — a
 * `chain:<name>` reference survives reordering as a reference.
 */
function SortableRung(props: any) {
  var sort = useSortable({ id: props.id });
  var style: Record<string, unknown> = {
    transition: sort.transition === null || sort.transition === void 0 ? void 0 : sort.transition,
  };
  if (sort.transform !== null && sort.transform !== void 0) {
    style.transform =
      "translate3d(" + sort.transform.x + "px, " + sort.transform.y + "px, 0)";
  }
  if (sort.isDragging) {
    style.opacity = 0.4;
  }
  return (
    <div ref={sort.setNodeRef} style={style} className={props.className}>
      {props.children({ attributes: sort.attributes, listeners: sort.listeners })}
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
        // Deep-copy steps: object route pairs must not alias the
        // previous draft, or effort edits would mutate server state.
        out[name] = value.map(function (step) {
          if (step === null || typeof step !== "object") return step;
          var copy: Record<string, unknown> = {
            provider: step.provider,
            model: step.model,
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
    /** Drag reorder sensors: pointer for the mouse, keyboard for arrow keys. */
    var sensors = useSensors(
      useSensor(PointerSensor),
      useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );
    /** Inline new-chain form state (replaces window.prompt). */
    var addingState = useState(false);
    var addingChain = addingState[0];
    var setAddingChain = addingState[1];
    var chainNameState = useState("");
    var chainNameInput = chainNameState[0];
    var setChainNameInput = chainNameState[1];
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
          // A route-pair step carries its own effort; picking one on a
          // "provider/model" string step converts it to a pair that keeps
          // the model, and clearing converts it back to the compact
          // string form.
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
              reasoningEffort: effort,
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
    /**
     * Replace a composition step's model. A pair step stays a pair, keeping
     * the old effort when the new model advertises it and dropping it
     * otherwise; a string step stays a string. Chain refs pass through
     * untouched so draft values are never cleared.
     */
    var setChainStepModel = function (chainName, index, value) {
      setDraft(function (prev) {
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
              if (
                catalogModels[kci].provider === newProvider &&
                catalogModels[kci].model === newModel
              ) {
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
              reasoningEffort: oldEffort,
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
    /** Append a rung to a chain from the add-dropdown selection. */
    var appendChainRung = function (chainName, value) {
      setDraft(function (prev) {
        var next = cloneConfig(prev);
        var chain = next.chains[chainName];
        if (chain === void 0) return next;
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
    /** Move one rung within its chain (drag or keyboard reorder). */
    var moveChainRung = function (chainName, from, to) {
      setDraft(function (prev) {
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
    /** Commit the inline new-chain form. */
    var commitChain = function () {
      var key = chainNameInput.trim();
      if (key === "") return;
      setDraft(function (prev) {
        var next = cloneConfig(prev);
        if (next.chains[key] === void 0) {
          next.chains[key] = { routes: [] };
        }
        return next;
      });
      setChainNameInput("");
      setAddingChain(false);
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
    /** True when a "provider/model" value exists in the live catalog. */
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
    /** True when a composition step value resolves to a chain ref or catalog model. */
    function stepIsKnown(value) {
      if (value === "" || value === void 0) return true;
      if (typeof value !== "string") return true;
      if (value.indexOf("chain:") === 0) {
        return chainKeys.indexOf(value.slice("chain:".length)) !== -1;
      }
      if (chainKeys.indexOf(value) !== -1) return true;
      return catalogHasRoute(value);
    }
    /** Extra option that carries a stale raw value so the row shows data. */
    function staleStepOption(value) {
      if (value === "" || value === void 0 || stepIsKnown(value)) return null;
      return <option value={value}>{value + " (not in catalog)"}</option>;
    }
    /** True when an entry string ref names a live chain. */
    function entryRefIsKnown(ref) {
      if (ref === void 0) return true;
      return chainKeys.indexOf(ref) !== -1;
    }
    /**
     * One optgroup per catalog provider (skipping empty groups), with an
     * optional leading Chains optgroup for composition-step references.
     */
    function modelChainOptions(includeChains) {
      var groups = [];
      if (includeChains && chainKeys.length > 0) {
        groups.push(
          <optgroup key="chains" label="Chains">
            {chainKeys.map(function (key) {
              return (
                <option key={"chain:" + key} value={"chain:" + key}>
                  {"chain:" + key}
                </option>
              );
            })}
          </optgroup>,
        );
      }
      for (var g = 0; g < catalogGroups.length; g++) {
        var group = catalogGroups[g];
        if (group.models === void 0 || group.models.length === 0) continue;
        groups.push(
          <optgroup key={group.id} label={group.name || group.id}>
            {group.models.map(function (m) {
              return (
                <option key={group.id + "/" + m.id} value={group.id + "/" + m.id}>
                  {(group.name || group.id) + " / " + m.name}
                </option>
              );
            })}
          </optgroup>,
        );
      }
      return groups;
    }
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
              <span className="pf-panel-ref" title="Current model" data-dsh-tip="">
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
                        {currentRef !== void 0 && !entryRefIsKnown(currentRef) ? (
                          <option value={currentRef}>{currentRef + " (not in catalog)"}</option>
                        ) : null}
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
                        data-dsh-tip=""
                        onClick={function () {
                          detachEntryField(name, chainKey);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
        <div className="pf-panel-entry">
          <div className="pf-panel-head">
            <h4 className="pf-panel-entry-title">Chains</h4>
            {addingChain ? null : (
              <button
                type="button"
                className="pf-panel-add"
                onClick={function () {
                  setAddingChain(true);
                }}
              >
                + Add
              </button>
            )}
          </div>
          {addingChain ? (
            <div className="pf-panel-row">
              <input
                className="pf-panel-input"
                value={chainNameInput}
                placeholder="chain name"
                aria-label="New chain name"
                onChange={function (event) {
                  setChainNameInput(event.target.value);
                }}
                onKeyDown={function (event) {
                  if (event.key === "Enter") commitChain();
                  else if (event.key === "Escape") {
                    setChainNameInput("");
                    setAddingChain(false);
                  }
                }}
              />
              <button type="button" className="pf-panel-save" onClick={commitChain}>
                Add
              </button>
            </div>
          ) : null}
          {Object.keys(config.chains).length === 0 && !addingChain ? (
            <div className="pf-panel-meta">None</div>
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
                      data-dsh-tip=""
                      onClick={function () {
                        removeChain(chainName);
                      }}
                    >
                      ×
                    </button>
                  </div>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={function (event) {
                      if (event.over === void 0 || event.over === null) return;
                      var from = Number(event.active.id);
                      var to = Number(event.over.id);
                      if (from !== to) moveChainRung(chainName, from, to);
                    }}
                  >
                    <SortableCtx
                      items={steps.map(function (_, i) {
                        return String(i);
                      })}
                      strategy={verticalListSortingStrategy}
                    >
                      {isComposition
                        ? steps.map(function (row, index) {
                        var stepValue =
                          typeof row.step === "string"
                            ? row.step
                            : row.step && row.step.provider && row.step.model
                              ? row.step.provider + "/" + row.step.model
                              : "";
                        var step = row.step;
                        var isPair =
                          step !== null &&
                          typeof step === "object" &&
                          typeof step.provider === "string" &&
                          step.provider !== "" &&
                          typeof step.model === "string" &&
                          step.model !== "";
                        var lookupProvider = null;
                        var lookupModel = null;
                        if (isPair) {
                          lookupProvider = step.provider;
                          lookupModel = step.model;
                        } else if (
                          typeof step === "string" &&
                          step !== "" &&
                          step.indexOf("chain:") !== 0 &&
                          chainKeys.indexOf(step) === -1
                        ) {
                          var sslash = step.indexOf("/");
                          if (sslash > 0) {
                            lookupProvider = step.slice(0, sslash);
                            lookupModel = step.slice(sslash + 1);
                          }
                        }
                        var catModel = null;
                        if (lookupProvider !== null) {
                          for (var ci = 0; ci < catalogModels.length; ci++) {
                            if (
                              catalogModels[ci].provider === lookupProvider &&
                              catalogModels[ci].model === lookupModel
                            ) {
                              catModel = catalogModels[ci];
                              break;
                            }
                          }
                        }
                        var efforts = catModel !== null ? effortsOf(catModel.reasoning) : [];
                        var currentEffort =
                          isPair && typeof step.reasoningEffort === "string"
                            ? step.reasoningEffort
                            : "";
                        var isChainRef =
                          typeof stepValue === "string" && stepValue.indexOf("chain:") === 0;
                        return (
                          <SortableRung
                            id={String(index)}
                            key={index}
                            className={
                              "pf-panel-row" + (isChainRef ? " pf-panel-chainref" : "")
                            }
                          >
                            {function (handle) {
                              return (
                                <react.Fragment>
                                  <button
                                    type="button"
                                    className="pf-panel-grip"
                                    title="Drag to reorder"
                                    aria-label={"Move rung " + (index + 1)}
                                    {...handle.attributes}
                                    {...handle.listeners}
                                  >
                                    ⠿
                                  </button>
                                  <select
                                    className="pf-panel-select"
                                    value={stepValue}
                                    onChange={function (event) {
                                      setChainStepModel(chainName, index, event.target.value);
                                    }}
                                  >
                                    <option value="">Select…</option>
                              {modelChainOptions(true)}
                              {staleStepOption(stepValue)}
                            </select>
                            {efforts.length > 0 ? (
                              <select
                                className="pf-panel-effort"
                                value={currentEffort}
                                onChange={function (event) {
                                  setChainRungEffort(chainName, index, event.target.value);
                                }}
                              >
                                <option value="">Default</option>
                                {efforts.map(function (eff) {
                                  return (
                                    <option
                                      key={eff.id}
                                      value={eff.id}
                                      title={
                                        eff.description !== void 0 ? eff.description : undefined
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
                              title="Remove"
                              data-dsh-tip=""
                              onClick={function () {
                                removeChainRung(chainName, index);
                              }}
                            >
                              ×
                            </button>
                                </react.Fragment>
                              );
                            }}
                          </SortableRung>
                        );
                      })
                    : steps.map(function (rung, index) {
                        var rungKey = rung.provider + "/" + rung.model;
                        var rungSelectValue =
                          rung.provider !== "" && rung.model !== "" ? rungKey : "";
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
                        var rungStale =
                          rungSelectValue !== "" && !catalogHasRoute(rungSelectValue);
                        return (
                          <SortableRung
                            id={String(index)}
                            key={index}
                            className="pf-panel-model-row"
                          >
                            {function (handle) {
                              return (
                                <div className="pf-panel-row">
                                  <button
                                    type="button"
                                    className="pf-panel-grip"
                                    title="Drag to reorder"
                                    aria-label={"Move rung " + (index + 1)}
                                    {...handle.attributes}
                                    {...handle.listeners}
                                  >
                                    ⠿
                                  </button>
                                  <select
                                    className="pf-panel-select"
                                    value={rungSelectValue}
                                    onChange={function (event) {
                                      setChainRungModel(chainName, index, event.target.value);
                                    }}
                                  >
                                    <option value="">Select…</option>
                                {modelChainOptions(false)}
                                {rungStale ? (
                                  <option value={rungSelectValue}>
                                    {rungSelectValue + " (not in catalog)"}
                                  </option>
                                ) : null}
                              </select>
                              {efforts.length > 0 ? (
                                <select
                                  className="pf-panel-effort"
                                  value={currentEffort}
                                  onChange={function (event) {
                                    setChainRungEffort(chainName, index, event.target.value);
                                  }}
                                >
                                  <option value="">Default</option>
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
                                title="Remove"
                                data-dsh-tip=""
                                onClick={function () {
                                  removeChainRung(chainName, index);
                                }}
                              >
                                ×
                              </button>
                                </div>
                              );
                            }}
                          </SortableRung>
                        );
                      })}
                    </SortableCtx>
                  </DndContext>
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
                      <option value="">+ Add ▾</option>
                      {isComposition ? modelChainOptions(true) : modelChainOptions(false)}
                    </select>
                  </div>
                  {resolved.length > 0 ? (
                    <div className="pf-panel-meta">
                      {"→ " +
                        resolved[0].provider +
                        "/" +
                        resolved[0].model +
                        (resolved.length > 1 ? " +" + (resolved.length - 1) : "")}
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
              {downRungs + " down "}
              <button
                type="button"
                className="dsp-refresh"
                onClick={function () {
                  request("DELETE", "/profiles/error-cache").then(function () {
                    fetchConfig();
                  });
                }}
              >
                Reset
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


var name = PLUGIN_NAME;

export { apply, inject, name };
