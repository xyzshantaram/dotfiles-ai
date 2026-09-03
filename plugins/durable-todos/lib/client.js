window.__ModuleLoader__.load({
	id: "durable-todos",
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

// plugins/durable-todos/src/client.tsx
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);
var react = __toESM(require("react"), 1);

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

// css-text:/home/sid/repos/dotfiles-ai/plugins/durable-todos/src/client.module.css
var client_default = '.durable-todos-card {\n  box-sizing: border-box;\n  width: 100%;\n  max-width: var(--dsh-composer-card-max-width);\n  margin-inline: auto;\n  display: flex;\n  flex-direction: column;\n  gap: 0.375rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.625rem;\n  padding: 0.5rem 0.625rem;\n  background: var(--dsw-alias-bg-layer-1);\n}\n.durable-todos-header {\n  display: flex;\n  align-items: center;\n  gap: 0.5rem;\n  min-width: 0;\n}\n.durable-todos-toggle {\n  flex: 1;\n  display: flex;\n  align-items: center;\n  gap: 0.375rem;\n  min-width: 0;\n  background: none;\n  border: none;\n  cursor: pointer;\n  color: inherit;\n  text-align: left;\n  padding: 0;\n  font: inherit;\n}\n.durable-todos-toggle:hover {\n  opacity: 0.7;\n}\n.durable-todos-chevron {\n  flex: none;\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n}\n.durable-todos-title {\n  flex: none;\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-label-primary);\n}\n.durable-todos-summary {\n  flex: 1;\n  font-size: 0.75rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-label-caption);\n  min-width: 0;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n.durable-todos-carried {\n  flex: none;\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  color: var(--dsw-alias-label-caption);\n}\n.durable-todos-remind {\n  box-sizing: border-box;\n  flex: none;\n  white-space: nowrap;\n  font-size: 0.75rem;\n  line-height: 1.125rem;\n  font-weight: 600;\n  padding: 0.125rem 0.5rem;\n  border: 1px solid var(--dsw-alias-border-l2);\n  border-radius: 0.375rem;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n  cursor: pointer;\n}\n.durable-todos-remind:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n.durable-todos-remind:disabled {\n  opacity: 0.5;\n  cursor: default;\n}\n.durable-todos-running-line {\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-label-secondary);\n  white-space: nowrap;\n  overflow: hidden;\n  text-overflow: ellipsis;\n  padding: 0.125rem 0.25rem;\n}\n/* The list scrolls, the header does not. A long plan therefore never pushes\n   the counts, the Remind button or the current-item line out of view. */\n.durable-todos-plan {\n  flex-direction: column;\n  display: flex;\n  max-height: 30vh;\n  overflow-y: auto;\n}\n.durable-todos-plan-item {\n  align-items: baseline;\n  display: flex;\n  gap: 0.375rem;\n  padding: 0.125rem 0 0.125rem 0.25rem;\n}\n.durable-todos-checkbox {\n  align-self: center;\n  border: 1px solid var(--dsw-alias-border-l3);\n  border-radius: 0.1875rem;\n  flex: none;\n  height: 0.875rem;\n  position: relative;\n  width: 0.875rem;\n}\n.durable-todos-plan-item[data-done] .durable-todos-checkbox {\n  border-color: var(--dsw-alias-state-success-primary);\n}\n.durable-todos-plan-item[data-done] .durable-todos-checkbox::after {\n  color: var(--dsw-alias-state-success-primary);\n  content: "\u2713";\n  display: block;\n  font-size: 0.6875rem;\n  line-height: 0.8125rem;\n  text-align: center;\n}\n.durable-todos-plan-item[data-active] .durable-todos-checkbox::after {\n  background: var(--dsw-alias-label-tertiary);\n  content: "";\n  height: 0.09375rem;\n  left: 0.1875rem;\n  position: absolute;\n  right: 0.1875rem;\n  top: 50%;\n}\n.durable-todos-plan-content {\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  overflow-wrap: anywhere;\n}\n.durable-todos-plan-item[data-done] .durable-todos-plan-content {\n  color: var(--dsw-alias-label-tertiary);\n}\n.durable-todos-plan-item[data-active] .durable-todos-plan-content {\n  color: var(--dsw-alias-label-primary);\n  font-weight: 500;\n}\n.durable-todos-plan-item[data-pending] .durable-todos-plan-content {\n  color: var(--dsw-alias-label-secondary);\n}\n.durable-todos-empty {\n  font-size: 0.8125rem;\n  line-height: 1.25rem;\n  color: var(--dsw-alias-label-caption);\n}\n/* Hide shipped todo panel; replaced by this plugin. */\n[data-testid="todo-panel"] {\n  display: none !important;\n}\n';

// plugins/durable-todos/src/client.tsx
var PLUGIN_NAME = "durable-todos";
var STYLE_TAG_ID = "durable-todos-style";
function isUnfinished(item) {
  return item.status === "pending" || item.status === "in_progress";
}
function reminderText(items) {
  var lines = items.filter(isUnfinished).map(function(item) {
    return "- " + item.content;
  });
  return "Reminder \u2014 unfinished todos:\n" + lines.join("\n");
}
function makePanel() {
  return function Panel(props) {
    var value = props.useProjection("durable-todos/todos");
    var running = props.useSession(function(session) {
      return session.running;
    });
    var todos = value === null || value === void 0 ? null : value.todos;
    var carriedOver = value !== null && value !== void 0 ? value.carriedOver : false;
    var unfinished = todos === null ? [] : todos.filter(isUnfinished);
    var [collapsed, setCollapsed] = react.useState(true);
    var onRemind = function() {
      var text = reminderText(unfinished);
      props.inputActions.setDraft(text);
      props.inputActions.submit();
    };
    var inProgressItem = running && todos ? todos.find(function(item) {
      return item.status === "in_progress";
    }) : null;
    var pendingCount = todos ? todos.filter(function(item) {
      return item.status === "pending";
    }).length : 0;
    var inProgressCount = todos ? todos.filter(function(item) {
      return item.status === "in_progress";
    }).length : 0;
    var completedCount = todos ? todos.filter(function(item) {
      return item.status === "completed";
    }).length : 0;
    var totalCount = todos ? todos.length : 0;
    var buildSummary = function() {
      if (totalCount === 0) return "No work items";
      var parts = [totalCount + " total"];
      if (inProgressCount > 0) parts.push(inProgressCount + " in progress");
      if (pendingCount > 0) parts.push(pendingCount + " pending");
      if (completedCount > 0) parts.push(completedCount + " done");
      return parts.join(" \xB7 ");
    };
    return /* @__PURE__ */ react.createElement("div", { className: "durable-todos-card" }, /* @__PURE__ */ react.createElement("div", { className: "durable-todos-header" }, /* @__PURE__ */ react.createElement(
      "button",
      {
        type: "button",
        className: "durable-todos-toggle",
        "aria-expanded": !collapsed,
        onClick: function() {
          setCollapsed(!collapsed);
        }
      },
      /* @__PURE__ */ react.createElement("span", { className: "durable-todos-chevron", "aria-hidden": true }, collapsed ? "\u25B6" : "\u25BC"),
      /* @__PURE__ */ react.createElement("span", { className: "durable-todos-title" }, "To-do"),
      /* @__PURE__ */ react.createElement("span", { className: "durable-todos-summary" }, buildSummary())
    ), carriedOver ? /* @__PURE__ */ react.createElement("span", { className: "durable-todos-carried" }, "carried over") : null, unfinished.length > 0 ? /* @__PURE__ */ react.createElement(
      "button",
      {
        type: "button",
        className: "durable-todos-remind",
        disabled: running,
        onClick: onRemind
      },
      "Remind"
    ) : null), inProgressItem ? /* @__PURE__ */ react.createElement("div", { className: "durable-todos-running-line" }, "Current: " + inProgressItem.content) : null, !collapsed ? /* @__PURE__ */ react.createElement(react.Fragment, null, todos === null || todos.length === 0 ? /* @__PURE__ */ react.createElement("div", { className: "durable-todos-empty" }, "No work items") : /* @__PURE__ */ react.createElement("div", { className: "durable-todos-plan" }, todos.map(function(item, index) {
      var attrs = item.status === "completed" ? { "data-done": true } : item.status === "in_progress" ? { "data-active": true } : { "data-pending": true };
      return /* @__PURE__ */ react.createElement("div", { key: index, className: "durable-todos-plan-item", ...attrs }, /* @__PURE__ */ react.createElement("span", { className: "durable-todos-checkbox", "aria-hidden": true }), /* @__PURE__ */ react.createElement("span", { className: "durable-todos-plan-content" }, item.content));
    }))) : null);
  };
}
var name = PLUGIN_NAME;
var inject = ["slots"];
function apply(ctx) {
  ctx.effect(function() {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, client_default);
  }, "durable-todos: styles");
  var Panel = makePanel();
  ctx.slots.inject("conversation.input.dock", function() {
    return ctx.slots.register(
      { name: "conversation.input.dock", id: "durable-todos", order: 10 },
      function(props) {
        return /* @__PURE__ */ react.createElement(Panel, { ...props });
      }
    );
  });
}
		return module.exports;
	}
});
