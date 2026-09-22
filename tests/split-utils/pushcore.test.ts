// Tests for the pure push core. runPush takes plain data and a fake
// api, with no session store and no file writes.
import { type PushApi, runPush } from "@app/src/pushcore.ts";
import { orderFingerprint } from "@app/src/render.ts";
import { assert } from "@std/assert";
import { fakeApi } from "./fake-push-api.ts";

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

// REWRITTEN, NOT DELETED. This test used to assert `calls === 1` —
// that one failure ENDED the run. That was the defect the owner hit:
// one refused order left a hundred and fifty untried. The facts the old
// test protected are all still pinned below (failed is set, nothing
// counts as pushed, no fingerprint is saved for a failed order); only
// the halt is gone, and the reason each failure gives is now pinned too.
Deno.test("pushcore: a failing create is recorded with its reason and the run goes on", async () => {
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
  assert(calls === 2, "every order was attempted, not just the first");
  assert(Object.keys(pushed).length === 0, "no fingerprint saved");
  assert(outcome.failures.length === 2, "one failure entry per attempted order");
  // The message must SURVIVE. A generic sentence in its place is what
  // left the owner with a failure and no way to learn its cause.
  assert(
    outcome.failures.every((f) => f.reason.includes("splitwise 500")),
    "each failure carries the thrown message verbatim",
  );
  assert(
    outcome.failures.every((f) => f.order !== ""),
    "each failure names its order",
  );
  assert(outcome.note.length > 0, "note names the failure");
});

// A failure is not a skip. The report sums the two skip kinds, so a
// failure counted as a skip would read as a decision the user made.
Deno.test("pushcore: a failure is not counted as a skip", async () => {
  const base = fakeApi();
  const api: PushApi = {
    ...base.api,
    createExpense: (_data) => {
      throw new Error("Splitwise create_expense: base: nope");
    },
  };
  const { outcome } = await runPush(baseInput({ api }));
  assert(outcome.skippedByChoice === 0, "a refused order is not a skip by choice");
  assert(outcome.skippedDupes === 0, "a refused order is not a duplicate");
  assert(outcome.failures.length === 2, "it is a failure");
});

// A person with no Splitwise id used to be sent as the string
// "undefined", and Splitwise then refused the expense while naming a
// user id the reader has never seen. The request must not leave at all,
// and the complaint must name the PERSON.
Deno.test("pushcore: an unmapped person fails before the request, by name", async () => {
  const base = fakeApi();
  const sent: Record<string, string>[] = [];
  const api: PushApi = {
    ...base.api,
    createExpense: (data) => {
      sent.push(data);
      return Promise.resolve({ expenses: [{ id: 1 }] });
    },
  };
  const { outcome } = await runPush(baseInput({ api, nameMap: {} }));
  assert(sent.length === 0, "nothing was sent");
  assert(outcome.failures.length > 0, "the order is recorded as failed");
  const reason = outcome.failures[0].reason;
  assert(!reason.includes("undefined"), "the reason never shows the string undefined");
  assert(reason.includes("No Splitwise id for"), "the reason names the missing mapping");
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

// THE DOUBLE-SEND. createExpense lands the expense; createComment then
// throws. This used to travel out as a whole-order failure: no
// fingerprint saved, so the next run created the SAME expense again.
// Found by review, not by the suite, because no fake had ever refused a
// comment. The pin is exactly-once ACROSS A RERUN, not merely a counter.
Deno.test("pushcore: a refused comment never re-sends the expense", async () => {
  const base = fakeApi();
  let created = 0;
  const api: PushApi = {
    ...base.api,
    createExpense: (_data) => {
      created += 1;
      return Promise.resolve({ expenses: [{ id: 500 + created }] });
    },
    createComment: () => {
      throw new Error("comment rejected");
    },
  };
  const first = await runPush(baseInput({ api }));
  assert(first.outcome.pushed === 2, "both expenses count as pushed");
  assert(first.outcome.failures.length === 0, "a landed expense is not a failure");
  assert(first.outcome.warnings.length === 2, "each carries a warning instead");
  assert(
    first.outcome.warnings.every((w) => w.reason.includes("comment rejected")),
    "the warning keeps the reason",
  );
  assert(Object.keys(first.pushed).length === 2, "both fingerprints are saved");
  // The rerun is the real proof: with those fingerprints in hand, the
  // same orders must not reach the API a second time.
  const second = await runPush(baseInput({ api, pushed: first.pushed }));
  assert(created === 2, "the expense was created exactly once, got " + created);
  assert(second.outcome.skippedDupes === 2, "the rerun skips both as duplicates");
});

// The saver persists the fingerprint. If it fails, the expense is still
// on Splitwise, so calling the order failed would invite a retry that
// sends it twice. It is a warning, and the fingerprint stays.
Deno.test("pushcore: a failing saver warns and still marks the order sent", async () => {
  const { api } = fakeApi();
  const { outcome, pushed } = await runPush(baseInput({
    api,
    onExpense: () => {
      throw new Error("disk full");
    },
  }));
  assert(outcome.pushed === 2, "the expenses landed and count as pushed");
  assert(outcome.failures.length === 0, "a landed expense is not a failure");
  assert(outcome.warnings.length === 2, "each order warns");
  assert(
    outcome.warnings.every((w) => w.reason.includes("disk full")),
    "the warning keeps the reason",
  );
  assert(Object.keys(pushed).length === 2, "the fingerprints survive the saver");
});

// A 200 whose expenses array is empty AND whose errors are empty: the
// API said nothing at all. This branch had no coverage, so deleting its
// failure record kept the suite green while a silently dropped order
// looked like a success.
Deno.test("pushcore: an id-less response is recorded and the run goes on", async () => {
  const base = fakeApi();
  let calls = 0;
  const api: PushApi = {
    ...base.api,
    createExpense: (_data) => {
      calls += 1;
      return Promise.resolve({ expenses: [] });
    },
  };
  const { outcome, pushed } = await runPush(baseInput({ api }));
  assert(calls === 2, "every order was attempted");
  assert(outcome.pushed === 0, "nothing counted as pushed");
  assert(outcome.failures.length === 2, "each id-less answer is a failure");
  assert(
    outcome.failures.every((f) => f.reason.includes("no expense id")),
    "the reason says the API gave nothing, got " + JSON.stringify(outcome.failures),
  );
  assert(Object.keys(pushed).length === 0, "no fingerprint saved");
});
