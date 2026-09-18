// Last push memory for split-utils. The gather screen offers the days
// since the last push, so a repeat user skips the count.

import { lastPushFilePath } from "./paths.ts";

// Push path that wrote the record.
export type PushKind = "splitwise" | "aggregate" | "share";

// One record of the last finished push. Confirmed stays true only for
// a live Splitwise push. A summary waits on hand entry, and a share
// link waits on the friend.
export interface LastPush {
  at: string;
  kind: PushKind;
  confirmed: boolean;
}

// One day in milliseconds.
const DAY_MS = 24 * 60 * 60 * 1000;

// Short month names for the radio label.
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Read the last push record. Null when the file misses, breaks, or
// names an unknown kind. A missing confirmed flag reads as false.
export function readLastPushSync(): LastPush | null {
  let raw: unknown;
  try {
    raw = JSON.parse(Deno.readTextFileSync(lastPushFilePath()));
  } catch {
    // A missing or unreadable file means no record yet.
    return null;
  }
  if (raw === null || typeof raw !== "object") return null;
  const fields = raw as Record<string, unknown>;
  const at = fields["at"];
  const kind = fields["kind"];
  if (typeof at !== "string") return null;
  if (kind !== "splitwise" && kind !== "aggregate" && kind !== "share") return null;
  const confirmed = fields["confirmed"];
  return { at, kind, confirmed: confirmed === true };
}

// Write one last push record. Only a live Splitwise push counts as
// confirmed. A summary waits on hand entry, and a link waits on the
// friend. The now value pins the time in tests.
export async function writeLastPush(kind: PushKind, now: Date = new Date()): Promise<void> {
  const path = lastPushFilePath();
  const parent = path.slice(0, path.lastIndexOf("/"));
  await Deno.mkdir(parent, { recursive: true });
  const record: LastPush = { at: now.toISOString(), kind, confirmed: kind === "splitwise" };
  await Deno.writeTextFile(path, JSON.stringify(record, null, 2) + "\n");
}

// Whole days from one ISO date to now. Rounds up, never drops below
// one. A bad or future date reads as one.
export function daysSincePush(at: string, now: Date): number {
  const then = Date.parse(at);
  if (!Number.isFinite(then)) return 1;
  const diff = now.getTime() - then;
  if (diff <= 0) return 1;
  return Math.max(1, Math.ceil(diff / DAY_MS));
}

// Radio label for one record. A summary or share names its own path,
// so the choice reads plainly.
export function lastPushLabel(entry: LastPush, now: Date): string {
  // Read the date in local time. The record holds UTC, and a push made
  // late in the evening east of Greenwich falls on the day before in
  // UTC. The label named a day the user never pushed on.
  const date = new Date(entry.at);
  const day = date.getDate();
  const month = MONTHS[date.getMonth()] ?? "";
  const days = daysSincePush(entry.at, now);
  let noun = "push";
  if (entry.kind === "aggregate") noun = "summary";
  if (entry.kind === "share") noun = "share";
  return "Since your last " + noun + " (" + day + " " + month + ", " + days +
    (days === 1 ? " day)" : " days)");
}

// Day count for one posted gather range. The last push wins when the
// user picked it. The typed value wins when it parses above zero.
// Anything else falls back to thirty.
export function resolveRangeDays(
  mode: string | undefined,
  typed: string | undefined,
  last: LastPush | null,
  now: Date,
): number {
  if (mode === "last" && last !== null) return daysSincePush(last.at, now);
  const count = Number((typed ?? "").trim());
  if (Number.isFinite(count) && count > 0) return count;
  return 30;
}
