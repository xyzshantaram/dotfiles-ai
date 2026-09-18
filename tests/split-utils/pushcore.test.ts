// Tests for the pure push core. runPush takes plain data and a fake
// api, with no session store and no file writes.
import { type PushApi, runPush } from "@app/src/pushcore.ts";
import { orderFingerprint } from "@app/src/render.ts";

// Fail the test when a condition misses.
function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error("assert failed: " + msg);
}

// One split line.
function line(
  item: string,
  orderId: string,
  date: string,
  price: number,
  a: number,
  b: number,
) {
  return {
    item,
    platform: "zepto",
    order_id: orderId,
    date,
    price,
    split_type: "custom",
    assignments: { Ann: a, Bob: b },
  };
}

// Fake API with scripted calls. Records createExpense payloads and
// comments, and hands out expense ids in sequence.
function fakeApi(options?: { failExpense?: boolean }) {
  const expenses: Record<string, string>[] = [];
  const comments: string[] = [];
  let nextId = 101;
  const api: PushApi = {
    getCurrentUser: () => Promise.resolve({ first_name: "Ann", last_name: "", id: 1 }),
    getFriends: () => Promise.resolve([{ first_name: "Bob", last_name: "", id: 2 }]),
    getGroups: () => Promise.resolve([{ name: "Trip", id: 7 }]),
    createExpense: (data) => {
      if (options?.failExpense) throw new Error("splitwise 500");
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

const order1 = [line("Milk", "o1", "2026-01-01T10:00:00", 100, 60, 40)];
const order2 = [line("Eggs", "o2", "2026-01-02T11:00:00", 50, 25, 25)];

function baseInput(overrides?: Partial<Parameters<typeof runPush>[0]>) {
  return {
    api: fakeApi().api as PushApi | null,
    groups: [order1, order2],
    people: ["Ann", "Bob"],
    payer: "Ann",
    currency: "INR",
    groupId: 7,
    nameMap: { Ann: 1, Bob: 2 },
    choices: { o1: "Push", o2: "Push" },
    pushed: {} as Record<string, number>,
    dry: false,
    ...overrides,
  };
}

Deno.test("pushcore: two pushed orders create two expenses and return both fingerprints", async () => {
  const { api, expenses, comments } = fakeApi();
  const { outcome, pushed } = await runPush(baseInput({ api }));
  assert(outcome.pushed === 2, "two orders pushed");
  assert(outcome.failed === false, "no failure");
  assert(outcome.totalRs === 150, "total is both orders");
  assert(expenses.length === 2, "two createExpense calls");
  assert(comments.length === 2, "two comments");
  const fp1 = orderFingerprint(order1);
  const fp2 = orderFingerprint(order2);
  assert(pushed[fp1] === 101, "first fingerprint saved");
  assert(pushed[fp2] === 102, "second fingerprint saved");
});

Deno.test("pushcore: a known fingerprint counts as a duplicate skip and is not sent", async () => {
  const { api, expenses } = fakeApi();
  const fp1 = orderFingerprint(order1);
  const { outcome, pushed } = await runPush(baseInput({ api, pushed: { [fp1]: 101 } }));
  assert(outcome.skippedDupes === 1, "one dupe skipped");
  assert(outcome.pushed === 1, "one order pushed");
  assert(expenses.length === 1, "one createExpense call");
  assert(pushed[fp1] === 101, "dupe fingerprint kept");
  assert(typeof pushed[orderFingerprint(order2)] === "number", "new fingerprint added");
});

Deno.test("pushcore: a dry run sends nothing, counts the plan, and leaves the map unchanged", async () => {
  const { api, expenses } = fakeApi();
  const { outcome, pushed } = await runPush(baseInput({ api, dry: true }));
  assert(expenses.length === 0, "no createExpense call");
  assert(outcome.dry === true, "outcome marked dry");
  assert(outcome.pushed === 2, "two orders would push");
  assert(outcome.totalRs === 150, "total is the would-push orders");
  assert(Object.keys(pushed).length === 0, "fingerprint map unchanged");
});

Deno.test("pushcore: a failing create halts the loop with no fingerprint for it", async () => {
  const base = fakeApi();
  let calls = 0;
  const api: PushApi = {
    ...base.api,
    createExpense: (_data) => {
      calls += 1;
      throw new Error("splitwise 500");
    },
  };
  const { outcome, pushed } = await runPush(baseInput({ api }));
  assert(outcome.failed === true, "outcome marked failed");
  assert(outcome.pushed === 0, "nothing counted as pushed");
  assert(calls === 1, "loop halted after the first failure");
  assert(Object.keys(pushed).length === 0, "no fingerprint saved");
  assert(outcome.note.length > 0, "note names the failure");
});

// A push of 38 orders takes half a minute of network calls. If the
// process dies part way, every fingerprint already earned must already
// be on disk, or the rerun sends those expenses a second time. The core
// therefore reports each expense as it lands, before it sends the next.
Deno.test("pushcore: each expense is reported before the next one is sent", async () => {
  const { api, expenses } = fakeApi();
  const seen: Array<{ fingerprint: string; expenseId: number; sentSoFar: number }> = [];
  const { outcome, pushed } = await runPush(baseInput({
    api,
    onExpense: (fingerprint: string, expenseId: number) => {
      seen.push({ fingerprint, expenseId, sentSoFar: expenses.length });
    },
  }));
  assert(outcome.pushed === 2, "two orders pushed");
  assert(seen.length === 2, "the core reported both expenses");
  assert(seen[0].sentSoFar === 1, "the first report lands before the second send");
  assert(seen[1].sentSoFar === 2, "the second report lands after the second send");
  assert(seen[0].fingerprint === orderFingerprint(order1), "first report names the first order");
  assert(seen[1].fingerprint === orderFingerprint(order2), "second report names the second order");
  assert(seen[0].expenseId === 101, "first report carries the expense id");
  assert(pushed[seen[1].fingerprint] === 102, "the returned map agrees with the reports");
});
