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
		/** Lower than the shipped seat's default 0; lowest live entry renders. */
		var SEAT_PRIORITY = -100;

		/**
		 * One stylesheet for the seat, badge, and menu. Class names
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
			".profiles-client-menu{z-index:20;border:1px solid var(--dsw-alias-border-inverted);background:var(--dsw-specific-menu);width:max-content;min-width:220px;max-width:min(420px,100vw - 32px);max-height:min(400px,100vh - 96px);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);border-radius:12px;flex-direction:column;padding:4px;display:flex;position:absolute;bottom:calc(100% + 8px);right:0;overflow-x:hidden;overflow-y:auto}",
			".profiles-client-section-label{color:var(--dsw-alias-label-secondary);padding:6px 8px 2px;font-size:11px;font-weight:600;line-height:16px;letter-spacing:.05em;text-transform:uppercase}",
			".profiles-client-option{box-sizing:border-box;width:auto;min-width:100%;min-height:34px;color:inherit;text-align:left;cursor:pointer;background:0 0;border:none;border-radius:10px;outline:none;align-items:center;gap:8px;padding:5px 8px;display:flex}",
			".profiles-client-option:hover:not(:disabled),.profiles-client-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}",
			".profiles-client-option-copy{flex-direction:column;flex:1;min-width:0;display:flex}",
			".profiles-client-option-name{color:inherit;text-overflow:ellipsis;white-space:nowrap;font-size:13px;font-weight:500;line-height:20px;overflow:hidden}",
			".profiles-client-option-profile{font-weight:700}",
			".profiles-client-option-model{font-size:12px;font-weight:500}",
			".profiles-client-option-detail{color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:16px;overflow:hidden}",
			".profiles-client-check{color:var(--dsw-alias-label-primary);flex:0 0 14px}",
			".profiles-client-strip{color:var(--dsw-alias-label-tertiary);padding:10px;font-size:13px;line-height:20px}",
			// W24 settings panel. pf- prefixed, themed alias tokens only.
			".pf-panel-root{box-sizing:border-box;display:flex;flex-direction:column;gap:14px;padding:6px 2px;color:var(--dsw-alias-label-primary)}",
			".pf-panel-head{display:flex;align-items:center;justify-content:space-between;gap:8px}",
			".pf-panel-title{font-size:16px;font-weight:600;margin:0}",
			".pf-panel-refresh{cursor:pointer;border:none;background:none;padding:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:16px}",
			".pf-panel-refresh:hover{color:var(--dsw-alias-label-primary)}",
			".pf-panel-err{font-size:12px;line-height:16px;color:var(--dsw-alias-state-error-primary)}",
			".pf-panel-active{display:flex;gap:6px;flex-wrap:wrap}",
			".pf-panel-active-btn{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:999px;font-size:12px;line-height:20px;padding:2px 10px;cursor:pointer}",
			".pf-panel-active-btn-on{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l3)}",
			".pf-panel-entry{display:flex;flex-direction:column;gap:6px;border:1px solid var(--dsw-alias-border-l2);border-radius:10px;padding:8px 12px}",
			".pf-panel-entry-title{font-size:13px;font-weight:600;margin:0}",
			".pf-panel-chain{display:flex;flex-direction:column;gap:6px}",
			".pf-panel-chain-title{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary);margin:0}",
			".pf-panel-row{display:flex;gap:6px;align-items:center;min-width:0}",
			".pf-panel-input{box-sizing:border-box;flex:1;min-width:0;height:26px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:0 8px;font-size:12px;line-height:18px}",
			".pf-panel-del{flex:none;cursor:pointer;border:none;background:none;padding:0 4px;color:var(--dsw-alias-label-secondary);font-size:14px;line-height:18px}",
			".pf-panel-del:hover{color:var(--dsw-alias-state-error-primary)}",
			".pf-panel-add{align-self:flex-start;color:var(--dsw-alias-label-secondary);background:none;border:1px dashed var(--dsw-alias-border-l2);border-radius:999px;font-size:11px;line-height:18px;padding:1px 10px;cursor:pointer}",
			".pf-panel-add:hover{color:var(--dsw-alias-label-primary)}",
			".pf-panel-meta{font-size:11px;line-height:15px;color:var(--dsw-alias-label-secondary)}",
			".pf-panel-ref{flex:none;color:var(--dsw-alias-label-tertiary);background:var(--dsw-alias-interactive-bg-hover);border-radius:999px;font-size:10px;line-height:14px;padding:1px 8px}",
			".pf-panel-actions{display:flex;align-items:center;gap:10px}",
			".pf-panel-save{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-interactive-bg-hover);border:1px solid var(--dsw-alias-border-l3);border-radius:999px;font-size:12px;line-height:20px;padding:2px 14px;cursor:pointer}",
			".pf-panel-save:disabled{opacity:.5;cursor:default}",
			".pf-panel-status{font-size:12px;line-height:16px}",
			".pf-panel-ok{color:var(--dsw-alias-state-success-primary)}",
			".pf-panel-bad{color:var(--dsw-alias-state-error-primary)}"
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
			"menu.default": "Default",
			"menu.models": "Models",
		};

		/** Simplified Chinese dictionary, checked complete against the en key set. */
		var ZH = {
			"seat.fallback": "模型",
			"seat.aria": "选择模型或配置",
			"badge.match": "与当前配置一致",
			"menu.profiles": "配置",
			"menu.default": "默认",
			"menu.models": "模型",
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
		 * A string entry names a key in the profile's `chains` map (name -> { routes }).
		 */
		function headOf(entry, chains) {
			function isPair(value) {
				return typeof value === "object" && value !== null &&
					typeof value.provider === "string" && typeof value.model === "string";
			}
			if (typeof entry === "string") {
				if (chains !== void 0 && chains !== null && chains[entry] !== void 0) {
					return headOf(chains[entry], chains);
				}
				return void 0;
			}
			// W21 nested entry { orchestrator, subagent }: the orchestrator
			// chain's head wins, the subagent chain is the fallback.
			if (typeof entry === "object" && entry !== null &&
					("orchestrator" in entry || "subagent" in entry)) {
				return headOf(entry.orchestrator, chains) ?? headOf(entry.subagent, chains);
			}
			if (isPair(entry)) return { provider: entry.provider, model: entry.model };
			// Composition array (W29): flatten steps, take the first route.
			if (Array.isArray(entry)) {
				var resolved = resolveChain(entry, chains);
				return resolved.length > 0 ? resolved[0] : void 0;
			}
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
			var chains = profileValue === void 0 || profileValue === null ? void 0 : profileValue.chains;
			var entry = profileValue === void 0 || profileValue === null ? void 0
				: (active === "personal" ? profileValue.personal : profileValue.work);
			return { active: active, head: headOf(entry, chains) };
		}
		/**
		 * The W24 entry field ref check: a STRING names a key in the
		 * profile `chains` map, an object is an inline { routes } chain.
		 */
		function refNameOf(field) {
			return typeof field === "string" ? field : void 0;
		}

		/**
		 * Resolve one chain value to its final route list for preview.
		 * Mirrors plugins/profile-routes.ts normalizeEntry: a `{ routes }`
		 * chain yields its pairs; a composition array flattens "provider/model"
		 * steps and follows "chain:<name>" refs in order, cycle-guarded.
		 */
		function resolveChain(value, chains, seen) {
			function isPair(v) {
				return typeof v === "object" && v !== null &&
					typeof v.provider === "string" && typeof v.model === "string";
			}
			var out = [];
			if (Array.isArray(value)) {
				var guard = new Set(seen || []);
				for (var i = 0; i < value.length; i++) {
					var step = value[i];
					if (typeof step === "string") {
						if (step.indexOf("chain:") === 0) {
							var name = step.slice(6);
							if (chains !== void 0 && chains !== null && chains[name] !== void 0 && !guard.has(name)) {
								guard.add(name);
								out = out.concat(resolveChain(chains[name], chains, guard));
							}
						} else {
							var slash = step.indexOf("/");
							if (slash > 0) {
								out.push({ provider: step.slice(0, slash), model: step.slice(slash + 1) });
							}
						}
					} else if (isPair(step)) {
						out.push({ provider: step.provider, model: step.model });
					} else if (Array.isArray(step)) {
						out = out.concat(resolveChain(step, chains, guard));
					}
				}
				return out;
			}
			if (typeof value === "object" && value !== null && Array.isArray(value.routes)) {
				for (var j = 0; j < value.routes.length; j++) {
					if (isPair(value.routes[j])) {
						out.push({ provider: value.routes[j].provider, model: value.routes[j].model });
					}
				}
			}
			return out;
		}
		/** True when the chain value is a composition array of steps. */
		function isCompositionChain(value) {
			return Array.isArray(value);
		}

		/** One step of a composition chain as display text: "provider/model" or "chain:<name>". */
		function stepTextOf(step) {
			if (typeof step === "string") return step;
			if (step !== void 0 && step !== null &&
					typeof step.provider === "string" && typeof step.model === "string") {
				return step.provider + "/" + step.model;
			}
			return "";
		}

		/** True when two resolved route lists are identical, in order. */
		function routesEqual(a, b) {
			if (a === b) return true;
			if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
			for (var i = 0; i < a.length; i++) {
				if (a[i].provider !== b[i].provider || a[i].model !== b[i].model) return false;
			}
			return true;
		}

		/**
		 * The named chain whose resolved routes equal the field, when one exists.
		 * The GET /profiles/config response resolves string refs server-side, so
		 * the original name is gone by the time the panel renders; this recovers
		 * it by comparing the canonical field against every named chain.
		 */
		function chainNameOf(field, chains) {
			if (chains === void 0 || chains === null) return void 0;
			var names = Object.keys(chains);
			for (var i = 0; i < names.length; i++) {
				if (routesEqual(resolveChain(chains[names[i]], chains), field.routes)) return names[i];
			}
			return void 0;
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
				var steps = field.map(stepTextOf).filter(function (t) { return t !== ""; });
				return steps.length > 0 ? steps.join(", ") : "(empty)";
			}
			if (field !== void 0 && field !== null && Array.isArray(field.routes)) {
				var name = chainNameOf(field, chains);
				if (name !== void 0) return name;
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
						var head = headOf(profileValue[key], profileValue.chains);
						if (head !== void 0) profileRows.push({ key: key, head: head });
					}
				}

				/** Resolve the pretty provider/model labels for one selection. */
				var prettyOf = function (provider, model) {
					for (var g = 0; g < state.groups.length; g++) {
						if (state.groups[g].id !== provider) continue;
						var plabel = typeof state.groups[g].name === "string" && state.groups[g].name !== "" ? state.groups[g].name : provider;
						for (var m = 0; m < state.groups[g].models.length; m++) {
							if (state.groups[g].models[m].id === model) {
								return { provider: plabel, model: state.groups[g].models[m].name };
							}
						}
						return { provider: plabel, model: model };
					}
					return { provider: provider, model: model };
				};

				/** Model options grouped by provider, pretty labels, in catalog order. */
				var modelGroups = [];
				for (var g = 0; g < state.groups.length; g++) {
					var group = state.groups[g];
					if (group.models === void 0 || group.models.length === 0) continue;
					var models = [];
					for (var m = 0; m < group.models.length; m++) {
						models.push({ id: group.models[m].id, name: group.models[m].name });
					}
					modelGroups.push({
						id: group.id,
						label: typeof group.name === "string" && group.name !== "" ? group.name : group.id,
						models: models
					});
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

				var currentPretty = current !== void 0 && current !== null
					? prettyOf(current.provider, current.model)
					: null;
				var label = currentPretty !== null
		? (face.active !== void 0 && face.active !== "" ? face.active + (matched ? "" : " *") + " · " : "") + currentPretty.model + " (" + currentPretty.provider + ")"

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
					createElement("button", {
						type: "button",
						className: "profiles-client-option",
						onClick: function () {
							if (face.head !== void 0) pick(face.head);
						}
					},
						createElement("span", { className: "profiles-client-option-copy" },
							createElement("span", { className: "profiles-client-option-name profiles-client-option-profile" },
								t("menu.default")),
							createElement("span", { className: "profiles-client-option-detail" },
								face.head !== void 0 ? prettyOf(face.head.provider, face.head.model).provider + "/" + prettyOf(face.head.provider, face.head.model).model : ""))
					),
						profileRows.length > 0 ? createElement(
							"div",
							null,
							createElement("div", { className: "profiles-client-section-label" }, t("menu.profiles")),
							profileRows.map(function (row) {
								var isActive = row.key === face.active;
								var headPretty = prettyOf(row.head.provider, row.head.model);
								return createElement("button", {
									key: row.key,
									type: "button",
									className: "profiles-client-option",
									onClick: function () {
										putJson("/profiles/switch", { active: row.key }).then(function (result) {
											if (!result.error) setOpen(false);
										});
									}
								},
									createElement("span", { className: "profiles-client-option-copy" },
									createElement("span", { className: "profiles-client-option-name profiles-client-option-profile" },
											row.key + (isActive ? " ·" : "")),
										createElement("span", { className: "profiles-client-option-detail" },
											headPretty.provider + "/" + headPretty.model)),
									isActive ? createElement("span", { className: "profiles-client-check", "aria-hidden": true }, "✓") : null
								);
							})
						) : null,
						createElement("div", null,
							createElement("div", { className: "profiles-client-section-label" }, t("menu.models")),
							state.status === "error" && state.error
								? createElement("div", { className: "profiles-client-strip" }, state.error)
								: null,
							modelGroups.map(function (grp) {
								return createElement("div", { key: grp.id },
									createElement("div", { className: "profiles-client-section-label" }, grp.label),
									grp.models.map(function (row) {
										var isActive = current !== void 0 && current !== null &&
											current.provider === grp.id && current.model === row.id;
										return createElement("button", {
											key: grp.id + "/" + row.id,
											type: "button",
											className: "profiles-client-option",
											onClick: function () {
												pick({ provider: grp.id, model: row.id });
											}
										},
											createElement("span", { className: "profiles-client-option-copy" },
												createElement("span", { className: "profiles-client-option-name profiles-client-option-model" }, row.name),
												createElement("span", { className: "profiles-client-option-detail" }, grp.label)),
											isActive ? createElement("span", { className: "profiles-client-check", "aria-hidden": true }, "✓") : null
										);
									})
								);
							})
						)
					) : null
				);
			}
			return ProfileModelSeat;
		}

		// ── W24: profiles settings panel ─────────────────────────────────

		/** GET one same-origin route; always resolves to {data, error}. */
		function fetchJson(url) {
			return fetch(url, { cache: "no-store" })
				.then(function (res) {
					return res.json().catch(function () { return null; }).then(function (json) {
						return { ok: res.ok, status: res.status, json: json };
					});
				})
				.then(function (result) {
					if (result.json !== null && result.json.error) {
						return { data: null, error: String(result.json.error) };
					}
					if (!result.ok) return { data: null, error: "HTTP " + result.status };
					return { data: result.json, error: null };
				})
				.catch(function (e) {
					return { data: null, error: String((e && e.message) || e) };
				});
		}

		/** PUT one same-origin route with a JSON body; same {data, error} shape. */
		function putJson(url, body) {
			return fetch(url, {
				method: "PUT",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(body),
				cache: "no-store"
			})
				.then(function (res) {
					return res.json().catch(function () { return null; }).then(function (json) {
						return { ok: res.ok, status: res.status, json: json };
					});
				})
				.then(function (result) {
					if (result.json !== null && result.json.error) {
						return { data: null, error: String(result.json.error) };
					}
					if (!result.ok) return { data: null, error: "HTTP " + result.status };
					return { data: result.json, error: null };
				})
				.catch(function (e) {
					return { data: null, error: String((e && e.message) || e) };
				});
		}

		/** Fresh editable copy of the canonical config the panel edits. */
		function cloneConfig(config) {
			function cloneRoutes(routes) {
				return (routes || []).map(function (r) {
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
				personal: cloneEntry(config && config.personal)
			};
		}

		/**
		 * The W24 profiles settings panel. Rides the profile namespace over
		 * /profiles/config (host routes in plugins/profiles.ts): shows both
		 * entries as condensed chain summaries. The named chains section
		 * below edits every chain. PUTs the whole canonical section back.
		 */
		function makeProfilesPanel() {
			function ProfilesPanel() {
				var loadState = useState(null);
				var load = loadState[0];
				var setLoad = loadState[1];
				var draftState = useState(null);
				var draft = draftState[0];
				var setDraft = draftState[1];
				var saveState = useState(null);
				var save = saveState[0];
				var setSave = saveState[1];

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
					return createElement("div", { className: "pf-panel-root" },
						createElement("div", { className: "pf-panel-head" },
							createElement("h3", { className: "pf-panel-title" }, "Profiles"),
							createElement("button", { className: "pf-panel-refresh", onClick: fetchConfig }, "Refresh")));
				}
				if (load.error) {
					return createElement("div", { className: "pf-panel-root" },
						createElement("div", { className: "pf-panel-head" },
							createElement("h3", { className: "pf-panel-title" }, "Profiles"),
							createElement("button", { className: "pf-panel-refresh", onClick: fetchConfig }, "Refresh")),
						createElement("div", { className: "pf-panel-err" }, "Profiles: " + load.error));
				}

				var config = draft;
				var quota = load.quota || {};
				var errorCache = load.errorCache || {};

				var setActive = function (name) {
					setDraft(function (prev) {
						var next = cloneConfig(prev);
						next.active = name;
						return next;
					});
				};
				var setChainField = function (chainName, index, field, value) {
					setDraft(function (prev) {
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
				var addChainRung = function (chainName) {
					setDraft(function (prev) {
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
							next.chains[key] = { routes: [{ provider: "", model: "" }] };
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
					setSave({ busy: true, note: null, ok: true });
					putJson("/profiles/config", config).then(function (result) {
						if (result.error) {
							setSave({ busy: false, note: result.error, ok: false });
							return;
						}
						setSave({ busy: false, note: "Saved", ok: true });
						setLoad(result.data);
						setDraft(cloneConfig(result.data.config));
					});
				};

				var quotaLine = "Quota pick: " +
					(quota.goLive ? "opencode-go live" : "opencode-go down") + " \u00b7 " +
					(quota.dsLive ? "deepseek live" : "deepseek down");
				var downRungs = (errorCache.down || []).length;
				var cacheLine = "Error cache: TTL " +
					Math.round((errorCache.ttlMs || 600000) / 60000) + " min" +
					(downRungs > 0 ? " \u00b7 " + downRungs + " rung(s) down" : " \u00b7 none down");

				var entries = ["work", "personal"];
				return createElement("div", { className: "pf-panel-root" },
					createElement("div", { className: "pf-panel-head" },
						createElement("h3", { className: "pf-panel-title" }, "Profiles"),
						createElement("button", { className: "pf-panel-refresh", onClick: fetchConfig }, "Refresh")),
					createElement("div", { className: "pf-panel-active" },
						entries.map(function (name) {
							return createElement("button", {
								key: name,
								type: "button",
								className: "pf-panel-active-btn" + (config.active === name ? " pf-panel-active-btn-on" : ""),
								onClick: function () { setActive(name); }
							}, name);
						})),
				entries.map(function (name) {
					var entry = config[name];
					return createElement("div", { className: "pf-panel-entry", key: name },
						createElement("h4", { className: "pf-panel-entry-title" },
							name === "work" ? "Work" : "Personal"),
						["orchestrator", "subagent"].map(function (chainKey) {
							var field = entry[chainKey];
							var label = chainKey === "orchestrator" ? "orchestrator" : "subagent";
							var summary = fieldSummary(field, config.chains);
							return createElement("div", { className: "pf-panel-meta", key: chainKey },
								label + ": " + summary);
						}));
				}),
				createElement("div", { className: "pf-panel-entry" },
					createElement("div", { className: "pf-panel-head" },
						createElement("h4", { className: "pf-panel-entry-title" }, "Named chains"),
						createElement("button", {
							type: "button",
							className: "pf-panel-add",
							onClick: addChain
						}, "+ Add chain")),
					Object.keys(config.chains).length === 0
						? createElement("div", { className: "pf-panel-meta" }, "No named chains")
						: Object.keys(config.chains).map(function (chainName) {
							var chain = config.chains[chainName];
							var isComposition = isCompositionChain(chain);
							var resolved = resolveChain(chain, config.chains);
							var steps = isComposition
								? chain.map(function (step) { return { step: step }; })
								: (chain !== void 0 && Array.isArray(chain.routes) ? chain.routes : []);
							return createElement("div", { className: "pf-panel-chain", key: chainName },
								createElement("div", { className: "pf-panel-row" },
									createElement("h5", { className: "pf-panel-chain-title" }, chainName),
									createElement("button", {
										type: "button",
										className: "pf-panel-del",
										title: "Remove chain",
										onClick: function () { removeChain(chainName); }
									}, "\u00d7")),
								isComposition
									? steps.map(function (row, index) {
										var stepText = typeof row.step === "string" ? row.step : "";
										var isRef = stepText.indexOf("chain:") === 0;
										return createElement("div", { className: "pf-panel-row", key: index },
											createElement("input", {
												className: "pf-panel-input",
												value: stepText,
												placeholder: isRef ? "chain:<name>" : "provider/model",
												onChange: function (event) {
													setChainField(chainName, index, null, event.target.value);
												}
											}),
											isRef
												? createElement("span", { className: "pf-panel-ref", title: "Extends another chain" },
													"extends")
												: null,
											createElement("button", {
												type: "button",
												className: "pf-panel-del",
												title: "Remove step",
												onClick: function () { removeChainRung(chainName, index); }
											}, "\u00d7"));
									})
									: steps.map(function (rung, index) {
										return createElement("div", { className: "pf-panel-row", key: index },
											createElement("input", {
												className: "pf-panel-input",
												value: rung.provider,
												placeholder: "provider",
												onChange: function (event) {
													setChainField(chainName, index, "provider", event.target.value);
												}
											}),
											createElement("input", {
												className: "pf-panel-input",
												value: rung.model,
												placeholder: "model",
												onChange: function (event) {
													setChainField(chainName, index, "model", event.target.value);
												}
											}),
												createElement("button", {
												type: "button",
												className: "pf-panel-del",
												title: "Remove rung",
												onClick: function () { removeChainRung(chainName, index); }
											}, "\u00d7"));
									}),
								createElement("button", {
									type: "button",
									className: "pf-panel-add",
									onClick: function () { addChainRung(chainName); }
								}, "+ Add " + (isComposition ? "step" : "rung")),
								resolved.length > 0
									? createElement("div", { className: "pf-panel-meta" },
										"Resolves to " + resolved.length + " route" + (resolved.length === 1 ? "" : "s") + ": " +
										resolved[0].provider + "/" + resolved[0].model +
										(resolved.length > 1 ? " \u2026" : ""))
									: null);
						})),
					createElement("div", { className: "pf-panel-meta" }, quotaLine),
					createElement("div", { className: "pf-panel-meta" }, cacheLine),
					createElement("div", { className: "pf-panel-actions" },
						createElement("button", {
							type: "button",
							className: "pf-panel-save",
							disabled: save.busy === true,
							onClick: saveConfig
						}, save.busy === true ? "Saving\u2026" : "Save"),
						save.note ? createElement("span", {
							className: "pf-panel-status " + (save.ok ? "pf-panel-ok" : "pf-panel-bad")
						}, save.note) : null));
			}
			return ProfilesPanel;
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

			// W24: the settings panel. Registered directly on the slots service
			// (no modelDirectories dependency), order 27 right after the W18
			// subscriptions panel at 26.
			var panel = makeProfilesPanel();
			ctx.slots.inject("settings.section", function () {
				return ctx.slots.register(
					{ name: "settings.section", id: PLUGIN_NAME, order: 27, label: "Profiles" },
					function () { return createElement(panel); }
				);
			});

		}

		module.exports = { apply: apply, inject: inject, name: PLUGIN_NAME };
		return module.exports;
	}
});
