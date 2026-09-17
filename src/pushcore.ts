// Pure push loop with no session store and no file writes. The wizard
// adapter in wizards/expense-split/push-engine.ts reads the session,
// calls runPush, then performs the I/O: saving fingerprints, writing
// the aggregate file, archiving the run, and storing the outcome.
import { fmtRs, formatMoney, type SplitEntry } from "./common.ts";
import { buildItemizedComment, formatTitle, orderFingerprint } from "./render.ts";

// One order groups split lines from one platform order.
export type Order = SplitEntry[];

// The part of the Splitwise API that the push needs. Tests pass a fake.
export interface PushApi {
  getCurrentUser(): Promise<Record<string, unknown>>;
  getFriends(): Promise<Record<string, unknown>[]>;
  getGroups(): Promise<Record<string, unknown>[]>;
  createExpense(data: Record<string, string>): Promise<{ expenses?: { id?: number }[] }>;
  createComment(expenseId: number, content: string): Promise<unknown>;
}

// Final counts and notes for the report step.
export interface PushOutcome {
  pushed: number;
  skippedDupes: number;
  skippedByChoice: number;
  failed: boolean;
  // True for a dry run. Counts name what would push; nothing lands.
  dry: boolean;
  totalRs: number;
  aggregateFile: string | null;
  archived: boolean;
  note: string;
}

// Sum one order to the currency units.
function orderTotal(order: Order): number {
  return order.reduce((sum, item) => sum + item.price, 0);
}

// Sum many orders.
function ordersTotalRs(orders: Order[]): number {
  return orders.reduce((sum, order) => sum + orderTotal(order), 0);
}

// Push one order: one expense per order, payer paid the total, comment
// holds the itemized split. Returns the expense id, or null when the
// API gave none. It writes no file and saves no fingerprint.
async function createOneExpense(
  api: PushApi,
  order: Order,
  people: string[],
  nameMap: Record<string, number>,
  payer: string,
  groupId: number,
  currency: string,
): Promise<string | null> {
  const total = orderTotal(order);
  const owed = new Map<string, number>();
  for (const item of order) {
    for (const [name, amount] of Object.entries(item.assignments)) {
      owed.set(name, (owed.get(name) ?? 0) + amount);
    }
  }
  const data: Record<string, string> = {
    cost: fmtRs(total),
    description: formatTitle(order, currency + " "),
    group_id: String(groupId),
    currency_code: currency,
  };
  people.forEach((person, i) => {
    data[`users__${i}__user_id`] = String(nameMap[person]);
    data[`users__${i}__paid_share`] = person === payer ? fmtRs(total) : "0.00";
    data[`users__${i}__owed_share`] = fmtRs(owed.get(person) ?? 0);
  });
  const result = await api.createExpense(data);
  const eid = result.expenses?.[0]?.id;
  if (eid === undefined || eid === null) return null;
  await api.createComment(eid, buildItemizedComment(order, people));
  return String(eid);
}

// Run the push loop over plain data. It reads no session store and no
// settings, and it writes no file. It returns the updated fingerprint
// map instead of saving it, and it returns the outcome instead of
// storing it. A null api means no Splitwise access, so it counts the
// aggregate fallback plan and leaves aggregateFile null for the
// adapter to fill in when it writes the summary file.
export async function runPush(input: {
  api: PushApi | null;
  groups: Order[];
  people: string[];
  payer: string;
  currency: string;
  groupId: number;
  nameMap: Record<string, number>;
  choices: Record<string, string>;
  pushed: Record<string, number>;
  dry: boolean;
  // Called after each expense lands, before the next one is sent. The
  // caller persists the fingerprint here. Saving the whole map after
  // the loop instead would lose every fingerprint if the process died
  // mid push, and a rerun would then send every sent expense again.
  onExpense?: (fingerprint: string, expenseId: number) => Promise<void> | void;
}): Promise<{ outcome: PushOutcome; pushed: Record<string, number> }> {
  const groups = input.groups;
  if (input.dry) {
    // Mirror the live loop shape: dupes skip, Push counts, Skip and
    // unpicked orders stay out. Nothing is sent and the map is unchanged.
    const outcome: PushOutcome = {
      pushed: 0,
      skippedDupes: 0,
      skippedByChoice: 0,
      failed: false,
      dry: true,
      totalRs: 0,
      aggregateFile: null,
      archived: false,
      note: "",
    };
    for (const order of groups) {
      const fingerprint = orderFingerprint(order);
      const oid = order[0].order_id ?? "unknown";
      if (Object.hasOwn(input.pushed, fingerprint)) {
        outcome.skippedDupes += 1;
        continue;
      }
      const choice = input.choices[oid];
      if (choice !== "Push") {
        outcome.skippedByChoice += 1;
        continue;
      }
      outcome.pushed += 1;
      outcome.totalRs += orderTotal(order);
    }
    outcome.note = "Dry run. Nothing went to Splitwise. " + outcome.pushed +
      " order(s) would push, " +
      (outcome.skippedDupes + outcome.skippedByChoice) + " skipped. Total " +
      formatMoney(outcome.totalRs, input.currency) + " would push.";
    return { outcome, pushed: { ...input.pushed } };
  }
  if (input.api === null) {
    // Aggregate fallback plan: the orders the API never pushed.
    const remaining = groups.filter((order) =>
      !Object.hasOwn(input.pushed, orderFingerprint(order))
    );
    const outcome: PushOutcome = {
      pushed: 0,
      skippedDupes: groups.length - remaining.length,
      skippedByChoice: 0,
      failed: false,
      dry: false,
      totalRs: ordersTotalRs(remaining),
      aggregateFile: null,
      archived: false,
      note:
        "No Splitwise access, so a summary file took the place of a push. Enter the amounts in Splitwise by hand.",
    };
    return { outcome, pushed: { ...input.pushed } };
  }
  const api = input.api;
  const next: Record<string, number> = { ...input.pushed };
  const outcome: PushOutcome = {
    pushed: 0,
    skippedDupes: 0,
    skippedByChoice: 0,
    failed: false,
    dry: false,
    totalRs: 0,
    aggregateFile: null,
    archived: false,
    note: "",
  };
  for (const order of groups) {
    const fingerprint = orderFingerprint(order);
    const oid = order[0].order_id ?? "unknown";
    if (Object.hasOwn(next, fingerprint)) {
      outcome.skippedDupes += 1;
      continue;
    }
    const choice = input.choices[oid];
    if (choice === "Skip") {
      outcome.skippedByChoice += 1;
      continue;
    }
    // Unpicked orders stay out, like an explicit skip.
    if (choice !== "Push") {
      outcome.skippedByChoice += 1;
      continue;
    }
    try {
      const eid = await createOneExpense(
        api,
        order,
        input.people,
        input.nameMap,
        input.payer,
        input.groupId,
        input.currency,
      );
      if (eid === null) {
        // No expense id means the fingerprint stays unsaved, so a rerun
        // can push the order again. Stop before anything double lands.
        outcome.failed = true;
        outcome.note = "Splitwise gave no expense id for order " + oid +
          ". The order was not marked as sent. Check Splitwise, then push again.";
        return { outcome, pushed: next };
      }
      // loadPushed returns numeric ids, so store the id as a number.
      next[fingerprint] = Number(eid);
      // Persist before the next send, so a crash never re-sends this one.
      await input.onExpense?.(fingerprint, Number(eid));
      outcome.pushed += 1;
      outcome.totalRs += orderTotal(order);
    } catch {
      // failPush path: a plain message, no raw error text, no fingerprint.
      outcome.failed = true;
      outcome.note = "The push failed on order " + oid +
        ". The order was not marked as sent, so a rerun will offer it again. Check Splitwise before you retry.";
      return { outcome, pushed: next };
    }
  }
  return { outcome, pushed: next };
}
