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
 * Match badge: shown while directory.current equals the active profile's
 * chain head (the same normalizeEntry head rule plugins/profile-routes.ts
 * defines), so any manual override to another model or another non-active
 * profile hides it again.
 *
* Cost figure: one small entry on the `conversation.input.right` list slot,
 * the seam that renders alongside the context ring in the composer trailing
 * row (dsh-client-ui-conversation InputBar: rightItems = renderSlot
 * "conversation.input.right", then the model seat, then ContextMeter). The
 * ContextMeter tooltip is a bare string prop with no slot or extension seam
 * and the ring itself is not slot-mounted, so the figure sits beside the
 * ring instead of inside its tooltip. It folds settled assistant nodes'
 * requestConfig + usage into per-model totals priced by the `prices`
 * settings namespace (owned by this package's host half). Any used model
 * without a rate hides the whole figure.
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
window.__ModuleLoader__.load({
	id: "profiles-client",
	factory: function (require) {
		var module = { exports: {} };
		var exports = module.exports;

		/** React comes from the browser module table. */
		var react = require("react");
		var createElement = react.createElement;
		var useSyncExternalStore = react.useSyncExternalStore;
		var useState = react.useState;
		var useEffect = react.useEffect;
		var useRef = react.useRef;

		/** Stable plugin identity; also the loader entry id and CSS prefix root. */
		var PLUGIN_NAME = "profiles-client";
		/** Locale namespace owned by this bundle. */
		var LOCALE_NS = "profiles-client";
		/** Slot keys this bundle registers over (shipped owners keep default 0). */
		var MODEL_SEAT_SLOT = "conversation.input.model";
		/** Slot key for the cost figure: the row that renders beside the ring. */
		var COST_SLOT = "conversation.input.right";
		/** Lower than the shipped seat's default 0; lowest live entry renders. */
		var SEAT_PRIORITY = -100;

		/**
		 * One stylesheet for the seat, badge, menu, and cost chip. Class names
		 * use the kebab-case plugin prefix so they cannot collide.
		 */
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

		/** English dictionary. */
		var EN = {
			"seat.fallback": "Model",
			"seat.aria": "Select model or profile",
			"badge.match": "Matches active profile",
			"menu.profiles": "Profiles",
			"menu.models": "Models",
			"cost.tooltip": "$ per million tokens, summed per model"
		};

		/** Simplified Chinese dictionary, checked complete against the en key set. */
		var ZH = {
			"seat.fallback": "模型",
			"seat.aria": "选择模型或配置",
			"badge.match": "与当前配置一致",
			"menu.profiles": "配置",
			"menu.models": "模型",
			"cost.tooltip": "每百万 token 的费用，按模型汇总"
		};

		/** Static stand-in scope when the settings transport is unavailable. */
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
					subscribe: function () {
						return function () {};
					},
					getSnapshot: function () {
						return snapshot;
					}
				}
			};
		}
		/**
		 * Port of plugins/profile-routes.ts normalizeEntry: one route pair or an
		 * ordered routes chain; the FIRST valid pair is the orchestrator head.
		 */
		function headOf(entry) {
			function isPair(value) {
				return typeof value === "object" && value !== null &&
					typeof value.provider === "string" && typeof value.model === "string";
			}
			if (isPair(entry)) return { provider: entry.provider, model: entry.model };
			if (typeof entry === "object" && entry !== null && Array.isArray(entry.routes)) {
				for (var i = 0; i < entry.routes.length; i++) {
					if (isPair(entry.routes[i])) return { provider: entry.routes[i].provider, model: entry.routes[i].model };
				}
			}
			return void 0;
		}

		/** Active profile name and its expected orchestrator head. */
		function activeFace(profileValue) {
			var active = profileValue && typeof profileValue.active === "string" ? profileValue.active : "work";
			var entry = active === "personal" ? profileValue.personal : profileValue.work;
			return { active: active, head: headOf(entry) };
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
					var title = row !== void 0 && row !== null && typeof row.title === "string" ? row.title : void 0;
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

		// ── D4 helpers: cost fold ──────────────────────────────────────────

		function num(value) {
			return typeof value === "number" && isFinite(value) ? value : 0;
		}

		/**
		 * Fold settled assistant nodes into a session cost. Returns void 0 when
		 * nothing billable exists OR any used model lacks a rate row — the figure
		 * hides rather than lies.
		 */
		function foldCost(nodes, rates) {
			var total = 0;
			var anything = false;
			for (var i = 0; i < nodes.length; i++) {
				var node = nodes[i];
				if (!node || node.kind !== "assistant") continue;
				var usage = node.usage;
				var config = node.requestConfig;
				if (typeof usage !== "object" || usage === null || config === void 0 ||
					typeof config.provider !== "string" || typeof config.model !== "string") continue;
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

		/** The cost figure beside the context ring. Renders nothing until a fully rated cost exists. */
		function makeCostChip(pricesScope) {
			function CostChip(props) {
				var nodes = props.useSession(function (s) {
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

		// ── D1/D2/D3: the model seat ───────────────────────────────────────

		function makeModelSeat(profileScope) {
			function ProfileModelSeat(props) {
				var locked = props.locked;
				var available = props.available;
				var directory = props.directory;
				var load = props.load;
				var select = props.select;
				var t = props.t;

				var state = useSyncExternalStore(function (fn) {
					return directory.subscribe(fn);
				}, function () {
					return directory.getSnapshot();
				});
				var profileSnap = useSyncExternalStore(profileScope.store.subscribe, profileScope.store.getSnapshot);
				var profileValue = profileSnap.value;

				var openState = useState(false);
				var open = openState[0];
				var setOpen = openState[1];
				var rootRef = useRef(null);

				useEffect(function () {
					if (available) load();
				}, [available, load]);

				useEffect(function () {
					if (!open) return;
					var closeOutside = function (event) {
						if (rootRef.current !== null && !rootRef.current.contains(event.target)) setOpen(false);
					};
					document.addEventListener("mousedown", closeOutside);
					return function () {
						document.removeEventListener("mousedown", closeOutside);
					};
				}, [open]);

				if (!available) return null;

				var current = state.current;
				var face = activeFace(profileValue);
				var matched = current !== void 0 && current !== null && face.head !== void 0 &&
					current.provider === face.head.provider && current.model === face.head.model;

				/** Known profile entries, work first; only resolvable heads list. */
				var profileRows = [];
				if (profileValue !== void 0 && profileValue !== null) {
					var known = ["work", "personal"];
					for (var i = 0; i < known.length; i++) {
						var key = known[i];
						var head = headOf(profileValue[key]);
						if (head !== void 0) profileRows.push({ key: key, head: head });
					}
				}

				var modelRows = [];
				for (var g = 0; g < state.groups.length; g++) {
					var group = state.groups[g];
					for (var m = 0; m < group.models.length; m++) {
						modelRows.push({ provider: group.id, name: group.models[m].name, model: group.models[m].id });
					}
				}

				var pick = function (selection) {
					select(selection).then(function (accepted) {
						if (accepted) setOpen(false);
					}, function () {});
				};

				var onKeyDown = function (event) {
					if (event.key === "Escape" && open) {
						event.preventDefault();
						setOpen(false);
					}
				};

				var label = current !== void 0 && current !== null
					? current.provider + "/" + current.model
					: t("seat.fallback");

				return createElement("div", { className: "profiles-client-root", ref: rootRef, onKeyDown: onKeyDown },
					createElement("button", {
						type: "button",
						className: "profiles-client-trigger",
						"aria-haspopup": "listbox",
						"aria-expanded": open,
						"aria-label": t("seat.aria"),
						disabled: locked === true,
						onClick: function () {
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
						createElement("span", { className: "profiles-client-chevron", "aria-hidden": true }, "▾")
					),
					open ? createElement("div", { className: "profiles-client-menu", role: "listbox" },
						profileRows.length > 0 ? createElement(
							"div",
							null,
							createElement("div", { className: "profiles-client-section-label" }, t("menu.profiles")),
							profileRows.map(function (row) {
								var isActive = row.key === face.active;
								return createElement("button", {
									key: row.key,
									type: "button",
									className: "profiles-client-option",
									onClick: function () {
										pick(row.head);
									}
								},
									createElement("span", { className: "profiles-client-option-copy" },
										createElement("span", { className: "profiles-client-option-name" },
											row.key + (isActive ? " ·" : "")),
										createElement("span", { className: "profiles-client-option-detail" },
											row.head.provider + "/" + row.head.model)),
									isActive ? createElement("span", { className: "profiles-client-check", "aria-hidden": true }, "✓") : null
								);
							})
						) : null,
						createElement("div", null,
							createElement("div", { className: "profiles-client-section-label" }, t("menu.models")),
							state.status === "error" && state.error
								? createElement("div", { className: "profiles-client-strip" }, state.error)
								: null,
							modelRows.map(function (row) {
								var isActive = current !== void 0 && current !== null &&
									current.provider === row.provider && current.model === row.model;
								return createElement("button", {
									key: row.provider + "/" + row.model,
									type: "button",
									className: "profiles-client-option",
									onClick: function () {
										pick({ provider: row.provider, model: row.model });
									}
								},
									createElement("span", { className: "profiles-client-option-copy" },
										createElement("span", { className: "profiles-client-option-name" }, row.name),
										createElement("span", { className: "profiles-client-option-detail" }, row.provider)),
									isActive ? createElement("span", { className: "profiles-client-check", "aria-hidden": true }, "✓") : null
								);
							})
						)
					) : null
				);
			}
			return ProfileModelSeat;
		}

		// ── plugin body ────────────────────────────────────────────────────

		/** Services this bundle reaches through the client plugin context. */
		var inject = ["slots", "sessions", "locale", "connection"];

		function apply(ctx) {
			ctx.effect(function () {
				return ctx.locale.register(LOCALE_NS, { en: EN, zh: ZH });
			}, "profiles-client: dictionaries");

			// Settings arrive through the ui-settings shared describe mirror: each
			// namespace binds a derived scope over it, so this bundle is not a second
			// settings.describe reader. When that service is absent, inert scopes
			// keep the seat loadable with no profile data.
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
			// Parks until ui-model-selection's resolver service mounts, mirroring
			// how the shipped /model contribution consumes modelDirectories. If
			// that package is absent, this seat stays parked instead of throwing.
			ctx.inject(["slots", "sessions", "modelDirectories"], function (scope) {
				var models = scope.modelDirectories;
				var sessions = scope.sessions;
				scope.slots.inject(MODEL_SEAT_SLOT, function () {
					return scope.slots.register({
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
										? directory.select(selection).then(function () {
											return true;
										}, function () {
											return false;
										})
										: Promise.resolve(false);
								}
							};
						}
					}, seat);
				});
			});

			var chip = makeCostChip(pricesScope);
			ctx.slots.inject(COST_SLOT, function () {
				return ctx.slots.register({
					name: COST_SLOT,
					id: "profiles-cost",
					order: 0,
					locale: LOCALE_NS,
					registrant: PLUGIN_NAME
				}, chip);
			});
		}

		module.exports = { apply: apply, inject: inject, name: PLUGIN_NAME };
		return module.exports;
	}
});
