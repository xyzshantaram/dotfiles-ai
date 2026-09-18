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

// Write one record straight to disk. Both writers share this path,
// so a confirm keeps the same day and path.
async function saveLastPush(record: LastPush): Promise<void> {
  const path = lastPushFilePath();
  const parent = path.slice(0, path.lastIndexOf("/"));
  await Deno.mkdir(parent, { recursive: true });
  await Deno.writeTextFile(path, JSON.stringify(record, null, 2) + "\n");
}

// Write one last push record. Only a live Splitwise push counts as
// confirmed. A summary waits on hand entry, and a link waits on the
// friend. The now value pins the time in tests.
export async function writeLastPush(kind: PushKind, now: Date = new Date()): Promise<void> {
  await saveLastPush({ at: now.toISOString(), kind, confirmed: kind === "splitwise" });
}

// Mark the waiting push done. False when no record exists, and false
// when the record is already confirmed. True writes the same day and
// path back with the flag set, so the next gather still reaches back
// over the window the user worked through.
export async function confirmLastPush(): Promise<boolean> {
  const found = readLastPushSync();
  if (found === null || found.confirmed) return false;
  await saveLastPush({ at: found.at, kind: found.kind, confirmed: true });
  return true;
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

// Day and month for one record, as "15 Sep", in local time. The record
// holds UTC, and a push made late in the evening east of Greenwich
// falls on the day before in UTC. Reading UTC named a day the user
// never pushed on. Every screen that shows this date calls this, so the
// three of them cannot drift apart.
export function formatPushDay(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  return date.getDate() + " " + (MONTHS[date.getMonth()] ?? "");
}

// Name the path that wrote one record, for prose that reads plainly.
export function pushNoun(kind: PushKind): string {
  if (kind === "aggregate") return "summary";
  if (kind === "share") return "share";
  return "push";
}

// Radio label for one record. A summary or share names its own path,
// so the choice reads plainly.
export function lastPushLabel(entry: LastPush, now: Date): string {
  const days = daysSincePush(entry.at, now);
  return "Since your last " + pushNoun(entry.kind) + " (" + formatPushDay(entry.at) + ", " +
    days + (days === 1 ? " day)" : " days)");
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
