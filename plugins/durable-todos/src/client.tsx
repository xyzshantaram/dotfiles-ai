// Durable todos panel. Shows the session todo projection in the input dock.
// The card stays visible so the Remind button stays reachable.
import * as react from "react";
import * as primitives from "@deepseek-ai/dsh-client-ui-primitives";
import type { DurableTodosView, TodoItem } from "./projection.js";
import { injectStyle, PLAN_ROW_CSS } from "../../shared/client-util";
import localCss from "./client.module.css";

var IconChevronDownOutline14 = primitives.IconChevronDownOutline14;
var IconChecklistOutline14 = primitives.IconChecklistOutline14;
var IconPlayOutline16 = primitives.IconPlayOutline16;
var IconQueueOutline14 = primitives.IconQueueOutline14;
var IconCheckOutline14 = primitives.IconCheckOutline14;

var PLUGIN_NAME = "durable-todos";
var STYLE_TAG_ID = "durable-todos-style";

/** Props the input dock slot hands to every registered component. */
interface DockProps {
  useProjection(key: "durable-todos/todos"): DurableTodosView | null | undefined;
  useSession(selector: (session: { running: boolean }) => boolean): boolean;
  inputActions: {
    setDraft(text: string): void;
    submit(): void;
    addImages: unknown;
    removeImage: unknown;
    pruneImages: unknown;
  };
  useInput(selector: (input: { draft: string }) => string): string;

  sessionId: string;
  t(key: string): string;
}

function isUnfinished(item: TodoItem): boolean {
  return item.status === "pending" || item.status === "in_progress";
}

/**
 * Reminder text for the unfinished items, as a markdown checkbox list.
 *
 * The trailing nudge exists because the reminder is a snapshot of a list the
 * agent may have stopped maintaining. Without it the agent tends to re-read
 * these lines as still-open work and repeat something already shipped, or
 * carry an item the user cancelled. Rewriting the whole list is the only
 * supported update, so the nudge asks for exactly that.
 */
function reminderText(items: TodoItem[]): string {
  var lines = items.filter(isUnfinished).map(function (item) {
    return "- [ ] " + item.content;
  });
  return (
    "Reminder — unfinished todos:\n" +
    lines.join("\n") +
    "\n\nRewrite the whole list before continuing: drop anything already done or" +
    " no longer wanted, and add what the user has asked for since."
  );
}

/** Append text to the existing draft with a blank line between them, or
 * return it bare when the draft is empty. Trailing whitespace on the
 * existing draft is dropped first so repeated clicks do not pile up blank
 * lines. */
function appendToDraft(existing: string, addition: string): string {
  var trimmed = existing.replace(/\s+$/, "");
  return trimmed.length === 0 ? addition : trimmed + "\n\n" + addition;
}

/** Build the panel once so React keeps its identity across slot re-renders. */
function makePanel() {
  return function Panel(props: DockProps) {
    var value = props.useProjection("durable-todos/todos");
    var running = props.useSession(function (session) {
      return session.running;
    });
    var todos = value === null || value === undefined ? null : value.todos;
    var unfinished = todos === null ? [] : todos.filter(isUnfinished);
    var [collapsed, setCollapsed] = react.useState(true);
    var draft = props.useInput(function (input) {
      return input.draft;
    });

    // Appends, never submits, so Remind works mid-turn and never clobbers a
    // message the user is already composing.
    var onRemind = function () {
      props.inputActions.setDraft(appendToDraft(draft, reminderText(unfinished)));
    };

    var inProgressItem =
      running && todos
        ? todos.find(function (item) {
            return item.status === "in_progress";
          })
        : null;

    var pendingCount = todos
      ? todos.filter(function (item) {
          return item.status === "pending";
        }).length
      : 0;
    var inProgressCount = todos
      ? todos.filter(function (item) {
          return item.status === "in_progress";
        }).length
      : 0;
    var completedCount = todos
      ? todos.filter(function (item) {
          return item.status === "completed";
        }).length
      : 0;
    var totalCount = todos ? todos.length : 0;

    var expandable = todos !== null && todos.length > 0;

    var countSegments = [
      { key: "doing", label: "DOING", value: inProgressCount, Icon: IconPlayOutline16, keep: inProgressCount > 0 },
      { key: "pending", label: "PENDING", value: pendingCount, Icon: IconQueueOutline14, keep: pendingCount > 0 },
      { key: "done", label: "DONE", value: completedCount, Icon: IconCheckOutline14, keep: completedCount > 0 },
    ].filter(function (segment) {
      return segment.keep;
    });

    return (
      <div className="durable-todos-card">
        <div className="durable-todos-header">
          <button
            type="button"
            className="durable-todos-toggle"
            aria-expanded={!collapsed}
            disabled={expandable ? undefined : true}
            onClick={function () {
              setCollapsed(!collapsed);
            }}
          >
            <IconChevronDownOutline14
              className={
                collapsed
                  ? expandable
                    ? "durable-todos-chevron"
                    : "durable-todos-chevron durable-todos-chevron-disabled"
                  : "durable-todos-chevron durable-todos-chevron-open"
              }
              aria-hidden={true}
            />
            <span className="durable-todos-name-badge">
              <IconChecklistOutline14 size={14} />
              <span>To-do list</span>
              {totalCount > 0 ? (
                <>
                  <span className="durable-todos-count-sep" aria-hidden={true}>
                    ·
                  </span>
                  <span className="durable-todos-count-value">{totalCount}</span>
                </>
              ) : null}
            </span>
            <span className="durable-todos-counts">
              {countSegments.map(function (segment) {
                return (
                  <span key={segment.key} className="durable-todos-count">
                    <segment.Icon size={14} />
                    <span className="durable-todos-count-label">{segment.label}</span>
                    <span className="durable-todos-count-sep" aria-hidden={true}>
                      ·
                    </span>
                    <span className="durable-todos-count-value">{segment.value}</span>
                  </span>
                );
              })}
            </span>
          </button>
          {unfinished.length > 0 ? (
            <button type="button" className="durable-todos-remind" onClick={onRemind}>
              Remind
            </button>
          ) : null}
        </div>
        {inProgressItem ? (
          <div className="durable-todos-running-line">{"Current: " + inProgressItem.content}</div>
        ) : null}
        {!collapsed ? (
          <div className="durable-todos-plan">
            {todos.map(function (item, index) {
              var attrs =
                item.status === "completed"
                  ? { "data-done": true }
                  : item.status === "in_progress"
                    ? { "data-active": true }
                    : { "data-pending": true };
              return (
                <div key={index} className="dsh-plan-item" {...attrs}>
                  <span className="dsh-plan-checkbox" aria-hidden={true} />
                  <span className="dsh-plan-content">{item.content}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };
}

/** Stable Cordis plugin name. */
var name = PLUGIN_NAME;
/** Services this bundle reaches through the plugin context. */
var inject = ["slots"];

/** Plugin body: inject the styles once and register the dock panel. */
function apply(ctx) {
  ctx.effect(function () {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, localCss);
    injectStyle(PLUGIN_NAME, "dsh-plan-row", PLAN_ROW_CSS);
  }, "durable-todos: styles");

  var Panel = makePanel();
  ctx.slots.inject("conversation.input.dock", function () {
    return ctx.slots.register(
      { name: "conversation.input.dock", id: "durable-todos", order: 10 },
      function (props) {
        return <Panel {...props} />;
      },
    );
  });
}

export { apply, inject, name };
