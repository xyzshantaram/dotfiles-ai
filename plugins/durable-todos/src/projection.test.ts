// Tests for the durable todos session projection.
// The projection folds session events into a todo list that never clears.
import { describe, expect, it } from "vitest";
import { DURABLE_TODOS_KEY, durableTodosProjection, type TodoItem } from "./projection.js";

type SessionEvent = { type: string; data: unknown };

const todoWrite = (todos: TodoItem[]): SessionEvent => ({
  type: "todo/write",
  data: { todos },
});

const turnStart = (turn: number): SessionEvent => ({
  type: "turn/start",
  data: { turn },
});

const LIST: TodoItem[] = [
  { content: "first", status: "pending" },
  { content: "second", status: "in_progress" },
];

describe("durable todos projection", () => {
  it("exposes the key and state version", () => {
    expect(DURABLE_TODOS_KEY).toBe("durable-todos/todos");
    expect(durableTodosProjection.key).toBe(DURABLE_TODOS_KEY);
    expect(durableTodosProjection.stateVersion).toBe(1);
  });

  it("init returns an empty state and view returns null for it", () => {
    const state = durableTodosProjection.init();
    expect(state).toEqual({ todos: null, carriedOver: false });
    expect(durableTodosProjection.view(state)).toBeNull();
  });

  it("todo/write sets the list and clears the carried over flag", () => {
    const state = durableTodosProjection.apply(
      durableTodosProjection.init(),
      todoWrite(LIST) as never,
    );
    expect(durableTodosProjection.view(state)).toEqual({ todos: LIST, carriedOver: false });
  });

  it("turn/start keeps the items and marks them carried over", () => {
    const written = durableTodosProjection.apply(
      durableTodosProjection.init(),
      todoWrite(LIST) as never,
    );
    const state = durableTodosProjection.apply(written, turnStart(1) as never);
    expect(state.todos).toEqual(LIST);
    expect(state.carriedOver).toBe(true);
  });

  it("a second todo/write replaces the list and clears the flag", () => {
    const written = durableTodosProjection.apply(
      durableTodosProjection.init(),
      todoWrite(LIST) as never,
    );
    const started = durableTodosProjection.apply(written, turnStart(1) as never);
    const next: TodoItem[] = [{ content: "third", status: "completed" }];
    const state = durableTodosProjection.apply(started, todoWrite(next) as never);
    expect(durableTodosProjection.view(state)).toEqual({ todos: next, carriedOver: false });
  });

  it("turn/start on the initial state changes nothing", () => {
    const state = durableTodosProjection.apply(
      durableTodosProjection.init(),
      turnStart(1) as never,
    );
    expect(state).toEqual({ todos: null, carriedOver: false });
    expect(durableTodosProjection.view(state)).toBeNull();
  });

  it("returns the same reference when the event changes nothing", () => {
    const init = durableTodosProjection.init();
    expect(
      durableTodosProjection.apply(init, { type: "assistant/message", data: {} } as never),
    ).toBe(init);

    const carried = durableTodosProjection.apply(
      durableTodosProjection.apply(init, todoWrite(LIST) as never),
      turnStart(1) as never,
    );
    expect(durableTodosProjection.apply(carried, turnStart(2) as never)).toBe(carried);
  });

  it("schema accepts a written list and null and rejects a bad status", () => {
    const { schema } = durableTodosProjection;
    expect(() => schema.parse({ todos: LIST, carriedOver: false })).not.toThrow();
    expect(() => schema.parse(null)).not.toThrow();
    expect(() =>
      schema.parse({ todos: [{ content: "x", status: "bogus" }], carriedOver: false }),
    ).toThrow();
  });
});
