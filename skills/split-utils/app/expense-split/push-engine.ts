// Real push logic behind the browser push steps. Ported from
// the deleted wizards/pusher.ts: env discovery, cached-token auth, name mapping,
// cutoff filtering, per-order push with fingerprint dedup, the
// failPush path, the aggregate fallback, and archiveRun. The module
// holds one push session in memory between renders, like connect.ts
// holds the handshake. Tests drive the exports with a fake API.

import { formatDayISO, type OutputDoc, parseDate, type SplitEntry } from "../../src/common.ts";
import { buildNameMap, runPush } from "../../src/pushcore.ts";
import type { NamePick, PushApi, PushOutcome } from "../../src/pushcore.ts";
export type { NamePick, PushApi, PushOutcome } from "../../src/pushcore.ts";
export { buildNameMap } from "../../src/pushcore.ts";
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
import { writeLastPush } from "../../src/lastpush.ts";
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
  groupChoices: { id: number; name: string; members: Record<string, unknown>[] }[];
  api: PushApi | null;
  // Confirmation line after a share-link import. The setup step shows
  // it once, and any other source clears it.
  shareNote: string | null;
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
// and stage it for the push flow. Ported from the deleted wizards/meta.ts
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

// The people a name can match against: the chosen group's members when a
// group is picked, otherwise undefined so buildNameMap falls back to friends
// (#192). A group member need not be a Splitwise friend, which is why
// matching friends alone left real people with no candidate at all.
function matchPool(
  live: { groupId: number; groupChoices: { id: number; members: Record<string, unknown>[] }[] },
): Record<string, unknown>[] | undefined {
  if (!live.groupId) return undefined;
  const group = live.groupChoices.find((g) => g.id === live.groupId);
  return group !== undefined && group.members.length > 0 ? group.members : undefined;
}

type NameMapResult = Awaited<ReturnType<typeof buildNameMap>>;
type GroupChoice = PushSession["groupChoices"][number];

// The deferred name mapping (#192), shared by both prepareSplitwise
// branches: with skipNames the first pass maps nothing, otherwise names
// match against the chosen group's members. The ERROR PATHS stay with the
// callers — the override branch falls back to aggregate when mapping
// throws, the credentials branch lets it propagate.
async function mapNames(
  api: PushApi,
  live: PushSession,
  skipNames: boolean,
): Promise<NameMapResult> {
  if (skipNames) {
    return { ok: true as const, map: new Map<string, number>(), pending: [] };
  }
  return await buildNameMap(api, live.people, live.nameChoices, matchPool(live));
}

// Stash pending name picks and report the picker error. Same shape on both
// branches: mapping runs again once the group is known.
function stashNamePicks(
  live: PushSession,
  mapped: NameMapResult,
): { ok: false; error: string; needsNamePick: true } | null {
  if (mapped.pending.length === 0) return null;
  live.mode = "idle";
  live.namePicks = mapped.pending;
  return { ok: false, error: namePickError(mapped.pending), needsNamePick: true };
}

// The group list both branches refresh after mapping: the members ride
// along (#192) so the name step has something to offer, and a missing
// list degrades to empty rather than failing the setup.
async function loadGroupChoices(api: PushApi): Promise<GroupChoice[]> {
  try {
    return (await api.getGroups()).map((group) => ({
      id: Number(group.id),
      name: String(group.name ?? "group"),
      // KEEP THE MEMBERS (#192). get_groups already returns them and this
      // mapping used to discard them, so the name step had nothing to offer
      // and fell back to a hand-typed id.
      members: Array.isArray(group.members) ? (group.members as Record<string, unknown>[]) : [],
    }));
  } catch {
    return [];
  }
}

// Flip a mapped session live, keeping the group the owner picked across
// the prepareSplitwise rerun. A pick the refreshed list no longer offers
// still falls back to 0, because pushing into a group that is gone is
// worse than pushing into none.
function goLive(
  live: PushSession,
  api: PushApi,
  mapped: NameMapResult,
  signedInAs: string,
  choices: GroupChoice[],
): { ok: true } {
  Object.assign(live, {
    mode: "live",
    api,
    nameMap: mapped.map,
    namePicks: [],
    signedInAs,
    // KEEP THE PICK (#192 review). This used to be a flat `groupId: 0`, and
    // prepareSplitwise runs AGAIN after the group screen — so the group was
    // wiped moments after it was chosen, the member offer below found no
    // group, and executePush sent group_id "0": a plain expense, not the
    // group the owner picked.
    groupId: choices.some((g) => g.id === live.groupId) ? live.groupId : 0,
    groupChoices: choices,
  });
  return { ok: true };
}

/**
 * Sign in, list the groups, and map local people to Splitwise users.
 *
 * `skipNames` defers the name mapping (#192). Names are matched against the
 * chosen GROUP's members, and the group is picked on a later screen, so the
 * first pass sets up access and the group list and maps nothing. Mapping runs
 * again once the group is known, which is the only point at which the right
 * pool of people exists.
 */
export async function prepareSplitwise(
  sessionId: string,
  apiOverride?: PushApi,
  opts?: { skipNames?: boolean },
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
    let mapped: NameMapResult;
    try {
      mapped = await mapNames(apiOverride, live, opts?.skipNames === true);
    } catch (err) {
      live.mode = "aggregate";
      live.api = null;
      live.setupError = signInCheckError(err);
      return { ok: true };
    }
    const picks = stashNamePicks(live, mapped);
    if (picks !== null) return picks;
    return goLive(live, apiOverride, mapped, name, await loadGroupChoices(apiOverride));
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
  const mapped = await mapNames(api, live, opts?.skipNames === true);
  const picks = stashNamePicks(live, mapped);
  if (picks !== null) return picks;
  return goLive(live, api, mapped, live.signedInAs, await loadGroupChoices(api));
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
    try {
      // Stamp the run after the summary lands.
      await writeLastPush("aggregate");
    } catch {
      // A missed stamp never fails a good summary.
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
  try {
    // Stamp the run after the live push lands.
    await writeLastPush("splitwise");
  } catch {
    // A missed stamp never fails a good push.
  }
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
