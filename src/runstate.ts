// Run state spine for split-utils. One dir holds one gather to push cycle.
// Meta lives in share runs. Archives live in cache runs.

import type { Order } from "./common.ts";
import { runsDir, stateRoot } from "./paths.ts";

export { runsDir, stateRoot };

// One run record stored as meta.json in the run dir.
export interface RunMeta {
  id: string;
  label: string;
  createdAt: string;
  platforms: string[];
  rangeDays: number;
  status: "gathered" | "assigned" | "pushed" | "failed";
  outputFile?: string;
  logFile?: string;
  failureReason?: string;
  // Last payer picked in the splitter. Seeds the next session default.
  lastPayer?: string;
  // Splitter progress. Partial sessions keep status gathered with counts.
  ordersDone?: number;
  ordersTotal?: number;
  // Indexes of the orders ticked on the gather pick screen.
  picked?: number[];
}

// Flag unsafe run ids and file names before disk use.
function isUnsafe(value: string): boolean {
  // Block empty values and parent climbs.
  if (value.length === 0) return true;
  // Block separators and parent climbs.
  if (value.includes("/")) return true;
  // Block parent climbs by name.
  if (value.includes("..")) return true;
  return false;
}

// Write a value as indented JSON with a trailing newline.
async function writeJson(path: string, value: unknown): Promise<void> {
  // Format with two spaces and end with a newline.
  await Deno.writeTextFile(path, JSON.stringify(value, null, 2) + "\n");
}

// Build the meta.json path for a run dir.
function metaPath(dir: string): string {
  // Append the fixed file name.
  return dir + "/meta.json";
}

// Compare runs newest first for list order.
export function compareRunsNewestFirst(a: RunMeta, b: RunMeta): number {
  // Parse both dates and count a bad date as the oldest value.
  const aTime = Date.parse(a.createdAt);
  const bTime = Date.parse(b.createdAt);
  const aSafe = Number.isNaN(aTime) ? Number.NEGATIVE_INFINITY : aTime;
  const bSafe = Number.isNaN(bTime) ? Number.NEGATIVE_INFINITY : bTime;
  // Compare creation times first.
  const time = bSafe - aSafe;
  // Break ties by id in reverse order.
  if (time !== 0) return time;
  if (a.id < b.id) return 1;
  if (a.id > b.id) return -1;
  return 0;
}

// One-line status for a run in the resume picker. The creation date
// keeps the newest-first list order readable. Failed runs carry their
// reason, like the old reportFailedRuns id-plus-reason list.
export function runHint(run: RunMeta): string {
  const base = run.label + " · " + run.createdAt + " · " +
    run.platforms.join(", ");
  if (run.status === "failed") {
    return "Failed: " + (run.failureReason ?? "no reason recorded") +
      " · " + base;
  }
  return run.status + " · " + base;
}

// List live runs newest first and skip broken dirs.
export async function listRuns(): Promise<RunMeta[]> {
  // Collect metas and skip dirs without one.
  const out: RunMeta[] = [];
  // Read the runs dir and return empty when absent.
  const names: string[] = [];
  try {
    // Gather child dir names in turn.
    for await (const entry of Deno.readDir(runsDir())) {
      // Keep directories only.
      if (entry.isDirectory) names.push(entry.name);
    }
  } catch {
    // Return empty when the dir does not exist.
    return [];
  }
  // Inspect each dir in turn.
  for (const name of names) {
    // Skip failed backups by suffix.
    if (name.endsWith("-failed-backup")) continue;
    // Skip unsafe names before touching the disk.
    if (isUnsafe(name)) continue;
    // Load meta.json and skip dirs without one.
    let text: string;
    try {
      text = await Deno.readTextFile(runsDir() + "/" + name + "/meta.json");
    } catch {
      continue;
    }
    // Skip records that do not parse.
    try {
      out.push(JSON.parse(text) as RunMeta);
    } catch {
      continue;
    }
  }
  // Sort newest first by time then id.
  out.sort(compareRunsNewestFirst);
  return out;
}

// List live runs newest first and skip broken dirs. Sync twin of
// listRuns for step builders, which stay synchronous.
export function listRunsSync(): RunMeta[] {
  const out: RunMeta[] = [];
  const names: string[] = [];
  try {
    for (const entry of Deno.readDirSync(runsDir())) {
      if (entry.isDirectory) names.push(entry.name);
    }
  } catch {
    return [];
  }
  for (const name of names) {
    if (name.endsWith("-failed-backup")) continue;
    if (isUnsafe(name)) continue;
    let text: string;
    try {
      text = Deno.readTextFileSync(runsDir() + "/" + name + "/meta.json");
    } catch {
      continue;
    }
    try {
      out.push(JSON.parse(text) as RunMeta);
    } catch {
      continue;
    }
  }
  out.sort(compareRunsNewestFirst);
  return out;
}

export { isDryMap } from "./answers.ts";
export async function createRun(
  label: string,
  platforms: string[],
  rangeDays: number,
  logFile: string,
): Promise<{ id: string; dir: string }> {
  // Reject labels that escape the runs dir.
  if (isUnsafe(label)) throw new Error("bad label " + label);
  // Mint the base id from unix time and label.
  const unix = Math.floor(Date.now() / 1000);
  const base = unix + "-" + label;
  // Append a counter when the dir already exists.
  let id = base;
  let n = 2;
  // Probe for a free dir name.
  while (true) {
    try {
      // Claim the id when stat misses.
      await Deno.stat(runsDir() + "/" + id);
      // Move to the next suffix and probe again.
      id = base + "-" + n;
      n += 1;
    } catch {
      break;
    }
  }
  // Make the run dir with parents.
  const dir = runsDir() + "/" + id;
  await Deno.mkdir(dir, { recursive: true });
  // Build the gathered record with UTC time.
  const meta: RunMeta = {
    id,
    label,
    createdAt: new Date().toISOString(),
    platforms,
    rangeDays,
    status: "gathered",
    logFile,
  };
  // Persist the record to the run dir.
  await writeJson(metaPath(dir), meta);
  return { id, dir };
}

// Read one run record plus its dir path.
export async function readRun(
  id: string,
): Promise<{ meta: RunMeta; dir: string } | null> {
  // Return null for unsafe ids.
  if (isUnsafe(id)) return null;
  // Build the run dir path.
  const dir = runsDir() + "/" + id;
  // Return null when meta.json misses.
  let text: string;
  try {
    text = await Deno.readTextFile(metaPath(dir));
  } catch {
    return null;
  }
  // Parse the record and fail loudly on bad JSON.
  let meta: RunMeta;
  try {
    meta = JSON.parse(text) as RunMeta;
  } catch {
    // Name the dir and the bad field.
    throw new Error("bad run " + dir + ": bad field meta.json");
  }
  // Reject a missing or empty run id.
  if (typeof meta.id !== "string" || meta.id.length === 0) {
    // Name the dir and the bad field.
    throw new Error("bad run " + dir + ": bad field id");
  }
  // Reject a status outside the lifecycle set.
  if (
    meta.status !== "gathered" && meta.status !== "assigned" && meta.status !== "pushed" &&
    meta.status !== "failed"
  ) {
    // Name the dir and the bad field.
    throw new Error("bad run " + dir + ": bad field status");
  }
  // Reject people or platform lists that miss the array shape.
  const record = meta as unknown as Record<string, unknown>;
  for (const key of ["people", "platforms"]) {
    const value = record[key];
    if (value === undefined) continue;
    const bad = !Array.isArray(value) || value.some((p) => typeof p !== "string");
    if (bad) {
      // Name the dir and the bad field.
      throw new Error("bad run " + dir + ": bad field " + key);
    }
  }
  // Reject timestamp fields that are not strings.
  for (const key of ["createdAt", "updatedAt", "pushedAt"]) {
    const value = record[key];
    if (value !== undefined && typeof value !== "string") {
      // Name the dir and the bad field.
      throw new Error("bad run " + dir + ": bad field " + key);
    }
  }
  return { meta, dir };
}

// Patch one run record and persist the result.
export async function updateRun(id: string, patch: Partial<RunMeta>): Promise<void> {
  // Throw for unsafe ids.
  if (isUnsafe(id)) throw new Error("bad run id " + id);
  // Load the record and skip missing runs.
  const found = await readRun(id);
  if (found === null) return;
  // Merge the patch over the stored record.
  const meta: RunMeta = { ...found.meta, ...patch };
  // Persist the merged record.
  await writeJson(metaPath(found.dir), meta);
}

// Resolve a file path inside a run dir.
export async function runFilePath(id: string, name: string): Promise<string | null> {
  // Return null for unsafe inputs.
  if (isUnsafe(id) || isUnsafe(name)) return null;
  // Build the candidate path.
  const path = runsDir() + "/" + id + "/" + name;
  // Return null when the file does not exist.
  try {
    const info = await Deno.stat(path);
    // Return null for non files.
    if (!info.isFile) return null;
    return path;
  } catch {
    return null;
  }
}

// Move a run dir to the cache archive.
export async function archiveRun(id: string): Promise<void> {
  // Throw for unsafe ids.
  if (isUnsafe(id)) throw new Error("bad run id " + id);
  // Skip missing runs without error.
  const src = runsDir() + "/" + id;
  try {
    await Deno.stat(src);
  } catch {
    return;
  }
  // Build the archive target under cache runs.
  const dest = stateRoot() + "/cache/runs/" + id;
  // Make the archive parent dirs.
  await Deno.mkdir(stateRoot() + "/cache/runs", { recursive: true });
  // Move the run dir to the archive.
  await Deno.rename(src, dest);
}

// Copy a dir tree to a new path.
async function copyDir(src: string, dest: string): Promise<void> {
  // Make the target dir with parents.
  await Deno.mkdir(dest, { recursive: true });
  // Copy each entry in turn.
  for await (const entry of Deno.readDir(src)) {
    // Recurse into child dirs.
    if (entry.isDirectory) {
      await copyDir(src + "/" + entry.name, dest + "/" + entry.name);
    } else if (entry.isFile) {
      // Copy plain files to the target.
      await Deno.copyFile(src + "/" + entry.name, dest + "/" + entry.name);
    }
  }
}

// Copy a run to a failed backup and mark the original.
export async function backupFailedRun(id: string, reason: string): Promise<void> {
  // Throw for unsafe ids.
  if (isUnsafe(id)) throw new Error("bad run id " + id);
  // Skip missing runs without error.
  const found = await readRun(id);
  if (found === null) return;
  // Name the backup beside the original.
  const backup = runsDir() + "/" + id + "-failed-backup";
  // Drop any stale backup before the copy.
  try {
    await Deno.remove(backup, { recursive: true });
  } catch {
    // Ignore removal errors for a missing backup.
  }
  // Copy the dir to the backup name first.
  await copyDir(found.dir, backup);
  // Mark the original record failed with the reason.
  const meta: RunMeta = { ...found.meta, status: "failed", failureReason: reason };
  // Persist the marked record to the original dir.
  await writeJson(metaPath(found.dir), meta);
}

// Read meta.json from a run dir path or a run id. Returns null when
// the record is missing or unreadable, because every caller treats a
// missing record as no saved state rather than as a fault.
export function readRunMetaSync(run: string): RunMeta | null {
  const clean = run.replace(/\/+$/, "");
  const candidates = [
    clean + "/meta.json",
    runsDir() + "/" + clean + "/meta.json",
  ];
  for (const path of candidates) {
    try {
      return JSON.parse(Deno.readTextFileSync(path)) as RunMeta;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

// Read orders.json from a run dir path or a run id.
export function readRunOrders(run: string): Order[] {
  const clean = run.replace(/\/+$/, "");
  const candidates = [
    clean + "/orders.json",
    runsDir() + "/" + clean + "/orders.json",
  ];
  for (const path of candidates) {
    try {
      return JSON.parse(Deno.readTextFileSync(path)) as Order[];
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error("no orders.json under " + run);
}

// Record the ticked order indexes on one run. Keeps every other field.
export function setRunPicked(runId: string, picked: number[]): void {
  // Throw for unsafe ids.
  if (isUnsafe(runId)) throw new Error("bad run id " + runId);
  // Load the stored record.
  const path = runsDir() + "/" + runId + "/meta.json";
  const meta = JSON.parse(Deno.readTextFileSync(path)) as RunMeta;
  // Set the picked indexes and write the record back.
  meta.picked = [...picked];
  Deno.writeTextFileSync(path, JSON.stringify(meta, null, 2) + "\n");
}
