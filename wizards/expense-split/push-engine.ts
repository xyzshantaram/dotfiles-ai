// Real push logic behind the browser push steps. Ported from
// wizards/pusher.ts: env discovery, cached-token auth, name mapping,
// cutoff filtering, per-order push with fingerprint dedup, the
// failPush path, the aggregate fallback, and archiveRun. The module
// holds one push session in memory between renders, like connect.ts
// holds the handshake. Tests drive the exports with a fake API.

import {
  fmtRs,
  formatDayISO,
  formatMoney,
  type OutputDoc,
  parseDate,
  type SplitEntry,
} from "../../src/common.ts";
import {
  buildAggregateSummary,
  buildItemizedComment,
  formatTitle,
  groupOrders,
  inferPayer,
  orderFingerprint,
} from "../../src/render.ts";
import { archiveRun, readRun, runFilePath, stateRoot } from "../../src/runstate.ts";
import { loadSettings } from "../../src/settings.ts";
import { fetchShareLink } from "../../src/share.ts";
import {
  type AccessToken,
  fullName,
  loadCredentials,
  loadPushed,
  loadToken,
  savePushed,
  SplitwiseAPI,
} from "../../src/splitwise.ts";
import { envPath } from "./connect.ts";
import { OUTPUT_FILE } from "../../src/splitstate.ts";

// One order groups split lines from one platform order.
type Order = SplitEntry[];

// The part of SplitwiseAPI that the push needs. Tests pass a fake.
export interface PushApi {
  getCurrentUser(): Promise<Record<string, unknown>>;
  getFriends(): Promise<Record<string, unknown>[]>;
  getGroups(): Promise<Record<string, unknown>[]>;
  createExpense(data: Record<string, string>): Promise<{ expenses?: { id?: number }[] }>;
  createComment(expenseId: number, content: string): Promise<unknown>;
}

// Everything one push attempt carries between steps.
export interface PushSession {
  mode: "idle" | "aggregate" | "live";
  // Set once the push ran. A failure message lands here too.
  outcome: PushOutcome | null;
  // Blocking problem from prepareSource or prepareSplitwise.
  setupError: string | null;
  file: string;
  runId: string | null;
  people: string[];
  splits: SplitEntry[];
  settlements: OutputDoc["settlements"];
  payer: string;
  groups: Order[];
  droppedByCutoff: number;
  cutoff: string;
  currency: string;
  nameMap: Map<string, number>;
  // People the auto-map could not settle, with their Splitwise
  // candidates. The name-picker step shows these.
  namePicks: NamePick[];
  // Resolutions the human gave in the name-picker step. They survive a
  // prepareSplitwise rerun, like the rest of the PushSession.
  nameChoices: Map<string, number>;
  signedInAs: string;
  // Fingerprints already on disk when the source loaded. The confirm
  // step shows these as auto-skips.
  dupes: Set<string>;
  groupId: number;
  groupChoices: { id: number; name: string }[];
  api: PushApi | null;
  // Confirmation line after a share-link import. The setup step shows
  // it once, and any other source clears it.
  shareNote: string | null;
}

// One person the auto name map could not settle. Empty candidates
// mean no Splitwise member matched at all.
export interface NamePick {
  person: string;
  candidates: { id: number; name: string }[];
}

// Final counts and notes for the report step.
export interface PushOutcome {
  pushed: number;
  skippedDupes: number;
  skippedByChoice: number;
  stopped: boolean;
  failed: boolean;
  // True for a dry run. Counts name what would push; nothing lands.
  dry: boolean;
  totalRs: number;
  aggregateFile: string | null;
  archived: boolean;
  note: string;
}

// One session per process. The wizard serves one human, so this stays
// simple. resetPush gives tests a clean slate.
export const session: PushSession = freshSession();

function freshSession(): PushSession {
  return {
    mode: "idle",
    outcome: null,
    setupError: null,
    file: "",
    runId: null,
    people: [],
    splits: [],
    settlements: [],
    payer: "",
    groups: [],
    droppedByCutoff: 0,
    cutoff: "",
    currency: "INR",
    nameMap: new Map(),
    namePicks: [],
    nameChoices: new Map(),
    signedInAs: "",
    dupes: new Set(),
    groupId: 0,
    groupChoices: [],
    api: null,
    shareNote: null,
  };
}

// Clear all push state. Tests call this between cases.
export function resetPush(): void {
  Object.assign(session, freshSession());
}

// Sum one order to the currency units.
function orderTotal(order: Order): number {
  return order.reduce((sum, item) => sum + item.price, 0);
}

// Sum many orders.
function ordersTotalRs(orders: Order[]): number {
  return orders.reduce((sum, order) => sum + orderTotal(order), 0);
}

// Check the cutoff shape and confirm the date is real. The noon parse
// keeps the check in local time, and the round trip rejects impossible
// dates like 2026-02-30. A blank value never reaches here: applyCutoff
// clears the cutoff before this runs.
function validCutoff(value: string): boolean {
  const parsed = parseDate(value + " 12:00 PM");
  return parsed !== null && formatDayISO(parsed) === value;
}

// First instant past the cutoff day. From pusher.ts.
function cutoffEnd(cutoff: string): number {
  const base = parseDate(cutoff + " 12:00 PM")!;
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + 1);
  return base.getTime();
}

// Read the numeric id from a Splitwise user record.
function userId(user: Record<string, unknown>): number {
  return Number(user.id);
}

// Append one user to a name lookup list. From pusher.ts.
function pushTo(
  map: Map<string, Record<string, unknown>[]>,
  key: string,
  user: Record<string, unknown>,
): void {
  const list = map.get(key) ?? [];
  list.push(user);
  map.set(key, list);
}

// Map each local person to a Splitwise user id. Ported from pusher.ts
// buildNameMap. A unique full-name or first-name match maps straight
// away. An ambiguous or unmatched person lands in `pending` so the
// name-picker step can ask, like the pusher pick list did. A stored
// resolution from `resolutions` wins over the search.
export async function buildNameMap(
  api: PushApi,
  people: string[],
  resolutions?: Map<string, number>,
): Promise<{ ok: true; map: Map<string, number>; pending: NamePick[] }> {
  const me = await api.getCurrentUser();
  const friends = await api.getFriends();
  const all: Record<string, unknown>[] = [me, ...friends];
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

// Read the name-picker answers and stash one resolution per pending
// person. A hand-typed id wins over the radio, like pusher.ts. Every
// pending person needs a whole positive id.
export function resolveNamePicks(
  fields: Record<string, string[]>,
): { ok: true } | { ok: false; error: string } {
  for (const pick of session.namePicks) {
    const person = pick.person;
    const manual = (fields["manual:" + person]?.[0] ?? "").trim();
    let value: number;
    if (manual !== "") {
      const parsed = Number(manual);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        return {
          ok: false,
          error: "Type a whole positive Splitwise id number for " + person + ".",
        };
      }
      value = parsed;
    } else {
      const picked = (fields["pick:" + person]?.[0] ?? "").trim();
      if (picked === "") {
        return { ok: false, error: "Pick a member or type an id for " + person + "." };
      }
      value = Number(picked);
    }
    session.nameChoices.set(person, value);
  }
  session.namePicks = [];
  return { ok: true };
}

// Push one order and save its fingerprint. Ported from pusher.ts
// pushOneOrder: one expense per order, payer paid the total, comment
// holds the itemized split, and the fingerprint records the expense id.
export async function pushOneOrder(
  api: PushApi,
  order: Order,
  people: string[],
  nameMap: Map<string, number>,
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
    data[`users__${i}__user_id`] = String(nameMap.get(person));
    data[`users__${i}__paid_share`] = person === payer ? fmtRs(total) : "0.00";
    data[`users__${i}__owed_share`] = fmtRs(owed.get(person) ?? 0);
  });
  const result = await api.createExpense(data);
  const eid = result.expenses?.[0]?.id;
  if (eid === undefined || eid === null) return null;
  await api.createComment(eid, buildItemizedComment(order, people));
  const merged = await loadPushed();
  merged[orderFingerprint(order)] = eid;
  await savePushed(merged);
  return String(eid);
}

// The third push-source choice: a share link from a friend. The menu
// advertises it, so the value lives here beside the engine.
export const SHARE_SOURCE = "Share link from a friend";

// Read the finished output doc and stage the orders. Shared by
// prepareSource and prepareShareImport after each resolves its file.
async function stageFile(
  file: string,
  id: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let doc: OutputDoc;
  try {
    doc = JSON.parse(await Deno.readTextFile(file)) as OutputDoc;
  } catch {
    return { ok: false, error: "No finished splits found at " + file + ". Split first." };
  }
  if (!doc.people || !doc.splits || doc.splits.length === 0) {
    return { ok: false, error: "The source file lacks people or splits. Split first." };
  }
  const groups = groupOrders(doc.splits);
  const onDisk = await loadPushed();
  const dupes = new Set<string>();
  for (const order of groups) {
    const fp = orderFingerprint(order);
    if (Object.hasOwn(onDisk, fp)) dupes.add(fp);
  }
  Object.assign(session, {
    file,
    runId: id,
    people: doc.people,
    splits: doc.splits,
    settlements: doc.settlements ?? [],
    payer: inferPayer(groups[0], doc.settlements ?? []),
    groups,
    droppedByCutoff: 0,
    cutoff: "",
    outcome: null,
    dupes,
  });
  return { ok: true };
}

// Read the finished output doc and stage the orders. `source` picks the
// run-id entry or the file entry, mirroring pusher.ts source resolution.
export async function prepareSource(
  source: string,
  runId: string,
  splitFile: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  let file = "";
  let id: string | null = null;
  if (source === "Split JSON file") {
    file = splitFile.trim();
    if (file === "") {
      return { ok: false, error: "Enter the split JSON file path in the source step." };
    }
  } else {
    const rid = runId.trim();
    if (rid === "") return { ok: false, error: "Enter the run id in the source step." };
    const found = await readRun(rid);
    const path = found && await runFilePath(rid, found.meta.outputFile ?? OUTPUT_FILE);
    if (!found || !path) {
      return { ok: false, error: "No run named " + rid + " with a finished split was found." };
    }
    file = path;
    id = rid;
  }
  const staged = await stageFile(file, id);
  if (staged.ok) session.shareNote = null;
  return staged;
}

// Fetch a friend's share link, save the import under the state root,
// and stage it for the push flow. Ported from wizards/meta.ts
// pushTheirs, minus the log lines: the link, the key fragment, and the
// plaintext never reach any log. `fetchFn` stands in for fetchShareLink
// in tests so no network call happens.
export async function prepareShareImport(
  link: string,
  fetchFn: (link: string) => Promise<string> = fetchShareLink,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = link.trim();
  if (trimmed === "") {
    return { ok: false, error: "Nothing pasted. Try again when ready." };
  }
  let plaintext: string;
  try {
    plaintext = await fetchFn(trimmed);
  } catch {
    return { ok: false, error: "That link did not open. Check it and try again." };
  }
  const dir = stateRoot() + "/share/imports";
  await Deno.mkdir(dir, { recursive: true });
  const unix = Math.floor(Date.now() / 1000);
  let target = dir + "/" + unix + "-import.json";
  let n = 2;
  while (true) {
    try {
      await Deno.stat(target);
      target = dir + "/" + unix + "-import-" + n + ".json";
      n += 1;
    } catch {
      break;
    }
  }
  await Deno.writeTextFile(target, plaintext);
  const staged = await stageFile(target, null);
  if (!staged.ok) return staged;
  session.shareNote = "Link opened. Starting the push flow.";
  return { ok: true };
}

// Short reason text for a setup failure. Keeps long bodies off screen.
function shortReason(value: unknown): string {
  const raw = value instanceof Error ? value.message : String(value);
  return raw.trim().slice(0, 120);
}

// Message when saved keys exist but fail to load.
function credentialsReadError(value: unknown): string {
  return "Splitwise keys are saved, but they cannot be read: " + shortReason(value) +
    ". The push writes a summary file instead.";
}

// Message when the sign in check fails after setup.
function signInCheckError(value: unknown): string {
  return "Splitwise access is set up, but the sign in check failed: " + shortReason(value) +
    ". The push writes a summary file instead. Try again in a moment.";
}

// Env discovery, cached-token auth, name mapping, and the group list.
// No key pair, or no cached token, falls back to the aggregate summary
// path, like the pusher no-access fallback. A hand-built api overrides
// discovery so tests never touch the network.
export async function prepareSplitwise(
  apiOverride?: PushApi,
): Promise<{ ok: true } | { ok: false; error: string; needsNamePick?: true }> {
  session.setupError = null;
  const currency = (await loadSettings()).currency;
  session.currency = currency;
  if (apiOverride !== undefined) {
    let name = "";
    try {
      name = fullName(await apiOverride.getCurrentUser());
    } catch {
      name = "";
    }
    let mapped: Awaited<ReturnType<typeof buildNameMap>>;
    try {
      mapped = await buildNameMap(apiOverride, session.people, session.nameChoices);
    } catch (err) {
      session.mode = "aggregate";
      session.api = null;
      session.setupError = signInCheckError(err);
      return { ok: true };
    }
    if (mapped.pending.length > 0) {
      session.mode = "idle";
      session.namePicks = mapped.pending;
      return { ok: false, error: namePickError(mapped.pending), needsNamePick: true };
    }
    let choices: { id: number; name: string }[] = [];
    try {
      choices = (await apiOverride.getGroups()).map((group) => ({
        id: Number(group.id),
        name: String(group.name ?? "group"),
      }));
    } catch {
      choices = [];
    }
    Object.assign(session, {
      mode: "live",
      api: apiOverride,
      nameMap: mapped.map,
      namePicks: [],
      signedInAs: name,
      groupId: 0,
      groupChoices: choices,
    });
    return { ok: true };
  }
  // Discover the key pair: state config first, then SPLITWISE_ENV.
  let discovered = envPath();
  try {
    const info = await Deno.stat(discovered);
    if (!info.isFile) discovered = "";
  } catch {
    discovered = "";
  }
  if (discovered === "") {
    const override = Deno.env.get("SPLITWISE_ENV");
    if (override) discovered = override;
  }
  if (discovered === "") {
    // No Splitwise access at all: the aggregate fallback.
    session.mode = "aggregate";
    session.api = null;
    return { ok: true };
  }
  let credentials: { consumerKey: string; consumerSecret: string };
  try {
    credentials = await loadCredentials(discovered);
  } catch (err) {
    session.mode = "aggregate";
    session.api = null;
    session.setupError = credentialsReadError(err);
    return { ok: true };
  }
  // The F2 handshake owns auth. Push reuses the cached token only.
  const token: AccessToken | null = await loadToken();
  if (token === null) {
    session.mode = "aggregate";
    session.api = null;
    return { ok: true };
  }
  const api = new SplitwiseAPI(credentials, token) as unknown as PushApi;
  try {
    const me = await api.getCurrentUser();
    session.signedInAs = fullName(me);
  } catch (err) {
    session.mode = "aggregate";
    session.api = null;
    session.setupError = signInCheckError(err);
    return { ok: true };
  }
  const mapped = await buildNameMap(api, session.people, session.nameChoices);
  if (mapped.pending.length > 0) {
    session.mode = "idle";
    session.namePicks = mapped.pending;
    return { ok: false, error: namePickError(mapped.pending), needsNamePick: true };
  }
  let choices: { id: number; name: string }[] = [];
  try {
    choices = (await api.getGroups()).map((group) => ({
      id: Number(group.id),
      name: String(group.name ?? "group"),
    }));
  } catch {
    choices = [];
  }
  Object.assign(session, {
    mode: "live",
    api,
    nameMap: mapped.map,
    namePicks: [],
    groupId: 0,
    groupChoices: choices,
  });
  return { ok: true };
}

// One plain line naming the people who need a pick. No raw error text.
function namePickError(pending: NamePick[]): string {
  return "Pick the Splitwise member for: " +
    pending.map((pick) => pick.person).join(", ") + ".";
}

// Validate the cutoff and drop later orders. From pusher.ts cutoff.
// A blank value clears the cutoff and keeps every order.
export function applyCutoff(raw: string): { ok: true } | { ok: false; error: string } {
  const cutoff = raw.trim();
  if (cutoff === "") {
    session.cutoff = "";
    session.groups = groupOrders(session.splits);
    session.droppedByCutoff = 0;
    return { ok: true };
  }
  if (!validCutoff(cutoff)) {
    return { ok: false, error: "Use the form YYYY-MM-DD for the cutoff date." };
  }
  const end = cutoffEnd(cutoff);
  const kept: Order[] = [];
  let dropped = 0;
  for (const order of session.groups) {
    const date = parseDate(order[0].date);
    if (date && date.getTime() >= end) {
      dropped += 1;
      continue;
    }
    kept.push(order);
  }
  session.cutoff = cutoff;
  session.groups = kept;
  session.droppedByCutoff = dropped;
  return { ok: true };
}

// Run the push loop. `choices` maps order id to the radio value. Orders
// already sent (fingerprint on disk) skip without asking. Stop ends the
// loop early and keeps the run unarchived. A failed call takes the
// failPush path: a plain error, no fingerprint saved, push halted.
// A dry run walks the same loop and counts the would-push plan, but it
// writes nothing: no expense, no fingerprint, no summary file, no
// archive, no run meta change.
export async function executePush(
  choices: Record<string, string>,
  opts?: { dry?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const groups = session.groups;
  const pushed = await loadPushed();
  const outcome: PushOutcome = {
    pushed: 0,
    skippedDupes: 0,
    skippedByChoice: 0,
    stopped: false,
    failed: false,
    dry: opts?.dry === true,
    totalRs: 0,
    aggregateFile: null,
    archived: false,
    note: "",
  };
  if (outcome.dry) {
    // Mirror the live loop shape: dupes skip, Push counts, Skip and
    // Stop end or skip, unpicked orders stay out.
    for (const order of groups) {
      const fingerprint = orderFingerprint(order);
      const oid = order[0].order_id ?? "unknown";
      if (Object.hasOwn(pushed, fingerprint)) {
        outcome.skippedDupes += 1;
        continue;
      }
      const choice = choices[oid];
      if (choice === "Stop") {
        outcome.stopped = true;
        outcome.skippedByChoice += 1;
        break;
      }
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
      formatMoney(outcome.totalRs, session.currency) + " would push.";
    session.outcome = outcome;
    return { ok: true };
  }
  if (session.mode !== "live") {
    // Aggregate fallback: rebuild the summary from the orders the API
    // never pushed, and write it beside the source file.
    const remaining = groups.filter((order) => !Object.hasOwn(pushed, orderFingerprint(order)));
    outcome.skippedDupes = groups.length - remaining.length;
    outcome.totalRs = ordersTotalRs(remaining);
    if (remaining.length > 0) {
      const block = buildAggregateSummary(
        remaining,
        session.people,
        session.payer,
        session.settlements,
        session.currency + " ",
      );
      const dir = session.file.includes("/")
        ? session.file.slice(0, session.file.lastIndexOf("/"))
        : ".";
      const path = dir + "/aggregate-" + Math.floor(Date.now() / 1000) + ".txt";
      try {
        await Deno.writeTextFile(path, block + "\n");
      } catch {
        session.outcome = { ...outcome, failed: true, note: "Could not write the summary file." };
        return { ok: false, error: "Could not write the summary file at " + path + "." };
      }
      outcome.aggregateFile = path;
    }
    outcome.note =
      "No Splitwise access, so a summary file took the place of a push. Enter the amounts in Splitwise by hand.";
    session.outcome = outcome;
    return { ok: true };
  }
  const api = session.api;
  if (api === null) {
    return { ok: false, error: "Splitwise access is missing. Set it up in Settings first." };
  }
  let stop = false;
  for (const order of groups) {
    const fingerprint = orderFingerprint(order);
    const oid = order[0].order_id ?? "unknown";
    if (Object.hasOwn(pushed, fingerprint)) {
      outcome.skippedDupes += 1;
      continue;
    }
    const choice = choices[oid];
    if (choice === "Stop") {
      outcome.stopped = true;
      outcome.skippedByChoice += 1;
      stop = true;
      break;
    }
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
      const eid = await pushOneOrder(
        api,
        order,
        session.people,
        session.nameMap,
        session.payer,
        session.groupId,
        session.currency,
      );
      if (eid === null) {
        // No expense id means the fingerprint stays unsaved, so a rerun
        // can push the order again. Stop before anything double lands.
        outcome.failed = true;
        outcome.note = "Splitwise gave no expense id for order " + oid +
          ". The order was not marked as sent. Check Splitwise, then push again.";
        session.outcome = outcome;
        return { ok: false, error: outcome.note };
      }
      // loadPushed returns numeric ids, so store the id as a number.
      pushed[fingerprint] = Number(eid);
      outcome.pushed += 1;
      outcome.totalRs += orderTotal(order);
    } catch {
      // failPush path: a plain message, no raw error text, no fingerprint.
      outcome.failed = true;
      outcome.note = "The push failed on order " + oid +
        ". The order was not marked as sent, so a rerun will offer it again. Check Splitwise before you retry.";
      session.outcome = outcome;
      return { ok: false, error: outcome.note };
    }
  }
  if (session.runId !== null && !stop && !outcome.failed) {
    try {
      await archiveRun(session.runId);
      outcome.archived = true;
    } catch {
      outcome.note = "The push finished but the run could not be archived.";
    }
  } else if (stop) {
    outcome.note = "The run stopped early and stays in place. Push again to send the rest.";
  }
  session.outcome = outcome;
  return { ok: true };
}
