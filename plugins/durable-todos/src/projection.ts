// Durable todos projection.
// Keeps the todo list across turns. Marks a list that outlived the turn
// that wrote it.
import type {} from "@deepseek-ai/dsh-session-projection/types";
import type { ProjectionDefinition } from "@deepseek-ai/dsh-session-projection";
import type { SessionEvent, TodoItem } from "@deepseek-ai/dsh-session";
import { z } from "zod";

export const DURABLE_TODOS_KEY = "durable-todos/todos";
export type { TodoItem };
export interface DurableTodosState {
  todos: TodoItem[] | null;
  carriedOver: boolean;
}

export interface DurableTodosView {
  todos: TodoItem[];
  carriedOver: boolean;
}

declare module "@deepseek-ai/dsh-session-projection/types" {
  interface SessionProjectionMap {
    "durable-todos/todos": DurableTodosView | null;
  }
}

export const durableTodosProjection: ProjectionDefinition<
  typeof DURABLE_TODOS_KEY,
  DurableTodosState
> = {
  key: DURABLE_TODOS_KEY,
  stateVersion: 1,
  schema: z
    .object({
      todos: z.array(
        z.object({
          content: z.string(),
          status: z.enum(["pending", "in_progress", "completed"]),
        }),
      ),
      carriedOver: z.boolean(),
    })
    .nullable(),
  init(): DurableTodosState {
    return { todos: null, carriedOver: false };
  },
  apply(state: DurableTodosState, event: SessionEvent): DurableTodosState {
    if (event.type === "todo/write") {
      return { todos: event.data.todos, carriedOver: false };
    }
    if (event.type === "turn/start") {
      if (state.todos === null || state.carriedOver) return state;
      return { todos: state.todos, carriedOver: true };
    }
    return state;
  },
  view(state: DurableTodosState): DurableTodosView | null {
    if (state.todos === null) return null;
    return { todos: state.todos, carriedOver: state.carriedOver };
  },
};
