// Shared fake PushApi for the push-flow tests. Records createExpense
// payloads and comments, and hands out expense ids in sequence from 101.
// With failExpense every createExpense throws instead. The failure text
// carries a hushhush-marked secret on purpose: the redaction tests prove
// it never reaches the user, and the pushcore tests pin the "splitwise
// 500" prefix surviving verbatim into each failure reason.
import type { PushApi } from "@app/src/pushcore.ts";

export function fakeApi(options?: { failExpense?: boolean }) {
  const expenses: Record<string, string>[] = [];
  const comments: string[] = [];
  let nextId = 101;
  const api: PushApi = {
    getCurrentUser: () =>
      Promise.resolve({ first_name: "Ann", last_name: "", id: 1 }),
    getFriends: () =>
      Promise.resolve([{ first_name: "Bob", last_name: "", id: 2 }]),
    getGroups: () => Promise.resolve([{ name: "Trip", id: 7 }]),
    createExpense: (data) => {
      if (options?.failExpense) {
        throw new Error("splitwise 500 secret=hushhush");
      }
      expenses.push({ ...data });
      return Promise.resolve({ expenses: [{ id: nextId++ }] });
    },
    createComment: (_eid, content) => {
      comments.push(content);
      return Promise.resolve();
    },
  };
  return { api, expenses, comments };
}
