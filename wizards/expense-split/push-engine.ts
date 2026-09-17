// Real push logic behind the browser push steps. Ported from
// wizards/pusher.ts: env discovery, cached-token auth, name mapping,
// cutoff filtering, per-order push with fingerprint dedup, the
// failPush path, the aggregate fallback, and archiveRun. The module
// holds one push session in memory between renders, like connect.ts
// holds the handshake. Tests drive the exports with a fake API.

import { formatDayISO, type OutputDoc, parseDate, type SplitEntry } from "../../src/common.ts";
import { runPush } from "../../src/pushcore.ts";
import type { PushApi, PushOutcome } from "../../src/pushcore.ts";
export type { PushApi, PushOutcome } from "../../src/pushcore.ts";
import {
  buildAggregateSummary,
  groupOrders,
  inferPayer,
  orderFingerprint,
} from "../../src/render.ts";
import { archiveRun, readRun, runFilePath, stateRoot } from "../../src/runstate.ts";
import { loadSettings } from "../../src/settings.ts";
import { fetchShareLink } from "../../src/share.ts";
import {
  type Credentials,
  fullName,
  loadCredentials,
  loadPushed,
  savePushed,
  SplitwiseAPI,
} from "../../src/splitwise.ts";
import { splitwiseEnvPath } from "../../src/paths.ts";
import { OUTPUT_FILE } from "../../src/splitstate.ts";
import { sessionStore, sidOf } from "../../src/sessionstore.ts";

// One order groups split lines from one platform order.
type Order = SplitEntry[];

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

// Push sessions, one per browser session. The wizard serves many
// humans, so each browser keeps its own staged source, name map, and
// outcome. The store replaces the module level session value, which
// two browsers used to share.
const pushSessions = sessionStore(freshSession);

// Live push session for one session id.
export function pushSessionFor(sessionId: string): PushSession {
  return pushSessions.for(sidOf({ sessionId }));
}

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

// Clear push state for one session. Tests call this between cases.
export function resetPush(sessionId: string): void {
  Object.assign(pushSessionFor(sessionId), freshSession());
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
  sessionId: string,
  fields: Record<string, string[]>,
): { ok: true } | { ok: false; error: string } {
  const live = pushSessionFor(sessionId);
  for (const pick of live.namePicks) {
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
    live.nameChoices.set(person, value);
  }
  live.namePicks = [];
  return { ok: true };
}

// The third push-source choice: a share link from a friend. The menu
// advertises it, so the value lives here beside the engine.
export const SHARE_SOURCE = "Share link from a friend";

// Read the finished output doc and stage the orders. Shared by
// prepareSource and prepareShareImport after each resolves its file.
async function stageFile(
  sessionId: string,
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
  Object.assign(pushSessionFor(sessionId), {
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
  sessionId: string,
  source: string,
  runId: string,
  splitFile: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = sidOf({ sessionId });
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
  const staged = await stageFile(sid, file, id);
  if (staged.ok) pushSessionFor(sid).shareNote = null;
  return staged;
}

// Fetch a friend's share link, save the import under the state root,
// and stage it for the push flow. Ported from wizards/meta.ts
// pushTheirs, minus the log lines: the link, the key fragment, and the
// plaintext never reach any log. `fetchFn` stands in for fetchShareLink
// in tests so no network call happens.
export async function prepareShareImport(
  sessionId: string,
  link: string,
  fetchFn: (link: string) => Promise<string> = fetchShareLink,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = sidOf({ sessionId });
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
  const staged = await stageFile(sid, target, null);
  if (!staged.ok) return staged;
  pushSessionFor(sid).shareNote = "Link opened. Starting the push flow.";
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
  sessionId: string,
  apiOverride?: PushApi,
): Promise<{ ok: true } | { ok: false; error: string; needsNamePick?: true }> {
  const live = pushSessionFor(sessionId);
  live.setupError = null;
  const currency = (await loadSettings()).currency;
  live.currency = currency;
  if (apiOverride !== undefined) {
    let name = "";
    try {
      name = fullName(await apiOverride.getCurrentUser());
    } catch {
      name = "";
    }
    let mapped: Awaited<ReturnType<typeof buildNameMap>>;
    try {
      mapped = await buildNameMap(apiOverride, live.people, live.nameChoices);
    } catch (err) {
      live.mode = "aggregate";
      live.api = null;
      live.setupError = signInCheckError(err);
      return { ok: true };
    }
    if (mapped.pending.length > 0) {
      live.mode = "idle";
      live.namePicks = mapped.pending;
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
    Object.assign(live, {
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
  // Discover the key pair at the shared config path only.
  let discovered = splitwiseEnvPath();
  try {
    const info = await Deno.stat(discovered);
    if (!info.isFile) discovered = "";
  } catch {
    discovered = "";
  }
  if (discovered === "") {
    // No Splitwise access at all: the aggregate fallback.
    live.mode = "aggregate";
    live.api = null;
    return { ok: true };
  }
  let credentials: Credentials;
  try {
    credentials = await loadCredentials(discovered);
  } catch (err) {
    live.mode = "aggregate";
    live.api = null;
    live.setupError = credentialsReadError(err);
    return { ok: true };
  }
  const api = new SplitwiseAPI(credentials) as unknown as PushApi;
  try {
    const me = await api.getCurrentUser();
    live.signedInAs = fullName(me);
  } catch (err) {
    live.mode = "aggregate";
    live.api = null;
    live.setupError = signInCheckError(err);
    return { ok: true };
  }
  const mapped = await buildNameMap(api, live.people, live.nameChoices);
  if (mapped.pending.length > 0) {
    live.mode = "idle";
    live.namePicks = mapped.pending;
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
  Object.assign(live, {
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
export function applyCutoff(
  sessionId: string,
  raw: string,
): { ok: true } | { ok: false; error: string } {
  const live = pushSessionFor(sessionId);
  const cutoff = raw.trim();
  if (cutoff === "") {
    live.cutoff = "";
    live.groups = groupOrders(live.splits);
    live.droppedByCutoff = 0;
    return { ok: true };
  }
  if (!validCutoff(cutoff)) {
    return { ok: false, error: "Use the form YYYY-MM-DD for the cutoff date." };
  }
  const end = cutoffEnd(cutoff);
  const kept: Order[] = [];
  let dropped = 0;
  for (const order of live.groups) {
    const date = parseDate(order[0].date);
    if (date && date.getTime() >= end) {
      dropped += 1;
      continue;
    }
    kept.push(order);
  }
  live.cutoff = cutoff;
  live.groups = kept;
  live.droppedByCutoff = dropped;
  return { ok: true };
}

// Thin adapter over the pure push core. It reads the session, calls
// runPush, then performs the I/O the core no longer does: saving the
// fingerprints, writing the aggregate file in aggregate mode,
// archiving the run, and storing the outcome on the session. The
// wizard sees the same screens in the same order.
export async function executePush(
  sessionId: string,
  choices: Record<string, string>,
  opts?: { dry?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const live = pushSessionFor(sessionId);
  const dry = opts?.dry === true;
  const onDisk = await loadPushed();
  const nameRecord: Record<string, number> = Object.fromEntries(live.nameMap);
  if (dry) {
    const { outcome } = await runPush({
      api: live.api,
      groups: live.groups,
      people: live.people,
      payer: live.payer,
      currency: live.currency,
      groupId: live.groupId,
      nameMap: nameRecord,
      choices,
      pushed: onDisk,
      dry: true,
    });
    live.outcome = outcome;
    return { ok: true };
  }
  if (live.mode !== "live") {
    // Aggregate fallback: the core counts the plan, and this adapter
    // writes the summary beside the source file.
    const { outcome } = await runPush({
      api: null,
      groups: live.groups,
      people: live.people,
      payer: live.payer,
      currency: live.currency,
      groupId: live.groupId,
      nameMap: nameRecord,
      choices,
      pushed: onDisk,
      dry: false,
    });
    const remaining = live.groups.filter((order) =>
      !Object.hasOwn(onDisk, orderFingerprint(order))
    );
    if (remaining.length > 0) {
      const block = buildAggregateSummary(
        remaining,
        live.people,
        live.payer,
        live.settlements,
        live.currency + " ",
      );
      const dir = live.file.includes("/") ? live.file.slice(0, live.file.lastIndexOf("/")) : ".";
      const path = dir + "/aggregate-" + Math.floor(Date.now() / 1000) + ".txt";
      try {
        await Deno.writeTextFile(path, block + "\n");
      } catch {
        live.outcome = { ...outcome, failed: true, note: "Could not write the summary file." };
        return { ok: false, error: "Could not write the summary file at " + path + "." };
      }
      outcome.aggregateFile = path;
    }
    live.outcome = outcome;
    return { ok: true };
  }
  const api = live.api;
  if (api === null) {
    return { ok: false, error: "Splitwise access is missing. Set it up in Settings first." };
  }
  const { outcome, pushed: updated } = await runPush({
    api,
    groups: live.groups,
    people: live.people,
    payer: live.payer,
    currency: live.currency,
    groupId: live.groupId,
    nameMap: nameRecord,
    choices,
    pushed: onDisk,
    dry: false,
    // Save after every expense, the way the loop did before the core
    // was split out. A batch save after the loop would lose the lot on
    // a crash, and the rerun would send every sent expense again.
    onExpense: async (fingerprint, expenseId) => {
      onDisk[fingerprint] = expenseId;
      await savePushed(onDisk);
    },
  });
  if (outcome.failed) {
    await savePushed(updated);
    live.outcome = outcome;
    return { ok: false, error: outcome.note };
  }
  await savePushed(updated);
  if (live.runId !== null) {
    try {
      await archiveRun(live.runId);
      outcome.archived = true;
    } catch {
      outcome.note = "The push finished but the run could not be archived.";
    }
  }
  live.outcome = outcome;
  return { ok: true };
}
