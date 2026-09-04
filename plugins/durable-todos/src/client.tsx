// Durable todos panel. Shows the session todo projection in the input dock.
// The card stays visible so the Remind button stays reachable.
import * as react from "react";
import type { DurableTodosView, TodoItem } from "./projection.js";
import { injectStyle, PLAN_ROW_CSS } from "../../shared/client-util";
import localCss from "./client.module.css";

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

/** Reminder text for the unfinished items, as a markdown checkbox list. */
function reminderText(items: TodoItem[]): string {
  var lines = items.filter(isUnfinished).map(function (item) {
    return "- [ ] " + item.content;
  });
  return "Reminder — unfinished todos:\n" + lines.join("\n");
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
    var carriedOver = value !== null && value !== undefined ? value.carriedOver : false;
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

    var buildSummary = function () {
      // An empty list still says something, so the collapsed header never
      // reads as a bare title with no state beside it.
      if (totalCount === 0) return "No work items";
      var parts = [totalCount + " total"];
      if (inProgressCount > 0) parts.push(inProgressCount + " in progress");
      if (pendingCount > 0) parts.push(pendingCount + " pending");
      if (completedCount > 0) parts.push(completedCount + " done");
      return parts.join(" · ");
    };

    return (
      <div className="durable-todos-card">
        <div className="durable-todos-header">
          <button
            type="button"
            className="durable-todos-toggle"
            aria-expanded={!collapsed}
            onClick={function () {
              setCollapsed(!collapsed);
            }}
          >
            <span className="durable-todos-chevron" aria-hidden={true}>
              {collapsed ? "▶" : "▼"}
            </span>
            <span className="durable-todos-title">To-do list</span>
            <span className="durable-todos-summary">{buildSummary()}</span>
          </button>
          {carriedOver ? <span className="durable-todos-carried">carried over</span> : null}
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
          <>
            {todos === null || todos.length === 0 ? (
              <div className="durable-todos-empty">No work items</div>
            ) : (
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
            )}
          </>
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
