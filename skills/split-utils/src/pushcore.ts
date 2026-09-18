// Pure push loop with no session store and no file writes. The wizard
// adapter in app/expense-split/push-engine.ts reads the session,
// calls runPush, then performs the I/O: saving fingerprints, writing
// the aggregate file, archiving the run, and storing the outcome.
import { fmtRs, formatMoney, type SplitEntry } from "./common.ts";
import { buildItemizedComment, formatTitle, orderFingerprint } from "./render.ts";
import { fullName } from "./splitwise.ts";

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
  // One entry per order that was ATTEMPTED and did not land. A failure
  // is not a skip: a skip is a decision, a failure is an accident, and
  // summing them together (as the report used to) tells the reader that
  // nothing is wrong. Each carries the reason Splitwise gave, because
  // the reason is the only part the reader can act on.
  failures: { order: string; reason: string }[];
}

// One person the auto name map could not settle. Empty candidates
// mean no Splitwise member matched at all.
export interface NamePick {
  person: string;
  candidates: { id: number; name: string }[];
}

// Read the numeric id from a Splitwise user record.
function userId(user: Record<string, unknown>): number {
  return Number(user.id);
}

// Append one user to a name lookup list.
function pushTo(
  map: Map<string, Record<string, unknown>[]>,
  key: string,
  user: Record<string, unknown>,
): void {
  const list = map.get(key) ?? [];
  list.push(user);
  map.set(key, list);
}

// Map each local person to a Splitwise user id. A unique full-name or
// first-name match maps straight away. An ambiguous or unmatched
// person lands in `pending` so the caller can ask, because a guess
// would push money to the wrong person. A stored resolution from
// `resolutions` wins over the search.
export async function buildNameMap(
  api: PushApi,
  people: string[],
  resolutions?: Map<string, number>,
  pool?: Record<string, unknown>[],
): Promise<{ ok: true; map: Map<string, number>; pending: NamePick[] }> {
  const me = await api.getCurrentUser();
  // MATCH AGAINST THE CHOSEN GROUP WHEN THERE IS ONE (#192). The people you
  // split a bill with are, nearly always, the members of the group you are
  // pushing into, and a group member need not be a Splitwise "friend".
  // Matching friends only left a real person with NO candidate and asked the
  // user to type a numeric id by hand, which is the screen this replaces.
  // With no group picked there is no member list, so friends remain the pool.
  const others = pool ?? await api.getFriends();
  const all: Record<string, unknown>[] = [me, ...others];
  const byFull = new Map<string, Record<string, unknown>[]>();
  const byFirst = new Map<string, Record<string, unknown>[]>();
  for (const user of all) {
    pushTo(byFull, fullName(user), user);
    pushTo(byFirst, String(user.first_name ?? ""), user);
  }
  const out = new Map<string, number>();
  const pending: NamePick[] = [];
  for (const person of people) {
    const resolved = resolutions?.get(person);
    if (resolved !== undefined) {
      out.set(person, resolved);
      continue;
    }
    const fullHit = byFull.get(person) ?? [];
    if (fullHit.length === 1) {
      out.set(person, userId(fullHit[0]));
      continue;
    }
    // A unique first name maps straight away. A first name shared by
    // more than one member stays pending: a guess there would push
    // money to the wrong person.
    const first = person.split(/\s+/)[0];
    const firstHit = byFirst.get(first) ?? [];
    if (firstHit.length === 1) {
      out.set(person, userId(firstHit[0]));
      continue;
    }
    const hits = fullHit.length > 1 ? fullHit : firstHit.length > 1 ? firstHit : [];
    if (hits.length > 0) {
      pending.push({
        person,
        candidates: hits.map((user) => ({ id: userId(user), name: fullName(user) })),
      });
    } else {
      pending.push({ person, candidates: [] });
    }
  }
  return { ok: true, map: out, pending };
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
  // A person with no Splitwise id would otherwise be sent as the literal
  // string "undefined", because String(undefined) is a perfectly good
  // string. Splitwise then rejects the whole expense, and its complaint
  // names a user id rather than the person the reader knows. Catch it
  // here, where the person's NAME is still in hand: that name is the one
  // thing the reader can act on.
  const unmapped = people.filter((person) => typeof nameMap[person] !== "number");
  if (unmapped.length > 0) {
    throw new Error(
      "No Splitwise id for " + unmapped.join(", ") +
        ". Add them in Splitwise, or map them on the names step, then push again.",
    );
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
      failures: [],
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
      failures: [],
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
    failures: [],
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
        // Reaching here now means a 200 with an empty `expenses` array and
        // no `errors` either — the API said nothing at all. Rare, and the
        // note says exactly that rather than implying a reason.
        outcome.failed = true;
        outcome.failures.push({
          order: oid,
          reason: "Splitwise returned no expense id and gave no reason.",
        });
        continue;
      }
      // loadPushed returns numeric ids, so store the id as a number.
      next[fingerprint] = Number(eid);
      // Persist before the next send, so a crash never re-sends this one.
      await input.onExpense?.(fingerprint, Number(eid));
      outcome.pushed += 1;
      outcome.totalRs += orderTotal(order);
    } catch (err) {
      // KEEP THE MESSAGE. This catch used to replace it with a generic
      // sentence, on a rule borrowed from the SHARE path, where the link,
      // the key fragment and the plaintext must never be logged. Nothing
      // of that kind is in reach here: the bearer token rides an
      // Authorization header, and this message is Splitwise describing
      // what it refused. Dropping it left the owner with a failure and no
      // way to learn its cause.
      outcome.failed = true;
      outcome.failures.push({
        order: oid,
        reason: err instanceof Error ? err.message : String(err),
      });
      // CARRY ON. This used to return, so one bad order ended the run and
      // every later order went unattempted. What stops a double send is
      // the fingerprint staying unsaved for THIS order, which has already
      // happened; the next order is a different expense and cannot be
      // double sent by trying it.
      continue;
    }
  }
  if (outcome.failures.length > 0) {
    outcome.note = outcome.failures.length + " order(s) did not go through. " +
      "None of them was marked as sent, so a rerun offers them again.";
  }
  return { outcome, pushed: next };
}
