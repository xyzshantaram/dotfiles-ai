// Durable todos panel. Shows the session todo projection in the input dock.
// The card stays visible so the Remind button stays reachable.
import * as react from "react";
import type { DurableTodosView, TodoItem } from "./projection.js";
import { injectStyle } from "../../shared/client-util";
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
  sessionId: string;
  t(key: string): string;
}

var GLYPHS: Record<TodoItem["status"], string> = {
  pending: "○",
  in_progress: "◐",
  completed: "●",
};

function isUnfinished(item: TodoItem): boolean {
  return item.status === "pending" || item.status === "in_progress";
}

/** Reminder text for the unfinished items, in order. */
function reminderText(items: TodoItem[]): string {
  var lines = items.filter(isUnfinished).map(function (item) {
    return "- " + item.content;
  });
  return "Reminder — unfinished todos:\n" + lines.join("\n");
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

    var onRemind = function () {
      var text = reminderText(unfinished);
      props.inputActions.setDraft(text);
      props.inputActions.submit();
    };

    return (
      <div className="durable-todos-card">
        <div className="durable-todos-header">
          <div className="durable-todos-title">Todos</div>
          {carriedOver ? <span className="durable-todos-carried">carried over</span> : null}
          {unfinished.length > 0 ? (
            <button
              type="button"
              className="durable-todos-remind"
              disabled={running}
              onClick={onRemind}
            >
              Remind
            </button>
          ) : null}
        </div>
        {todos === null || todos.length === 0 ? (
          <div className="durable-todos-empty">No todos</div>
        ) : (
          <div className="durable-todos-rows">
            {todos.map(function (item, index) {
              return (
                <div
                  key={index}
                  className={
                    item.status === "completed"
                      ? "durable-todos-row durable-todos-row-completed"
                      : "durable-todos-row"
                  }
                >
                  <span className="durable-todos-glyph">{GLYPHS[item.status]}</span>
                  <span>{item.content}</span>
                </div>
              );
            })}
          </div>
        )}
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
