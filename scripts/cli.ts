#!/usr/bin/env -S deno run --no-lock -A
// One command line entry over the push core. An agent or a person runs
// the whole job with no browser: gather, validate, push, aggregate,
// share, or wizard. gather, validate and wizard dispatch to a
// subprocess. push, aggregate and share run in process. The dispatch
// targets resolve through import.meta.url, so this file also runs
// straight from a raw GitHub URL. This module never imports the wizard
// engine, which drags in the browser session stores.

import { parseArgs } from "jsr:@std/cli@^1.0.32/parse-args";
import { formatMoney, type OutputDoc } from "../src/common.ts";
import { splitwiseEnvPath } from "../src/paths.ts";
import { buildNameMap, type PushApi, runPush } from "../src/pushcore.ts";
import { buildAggregateSummary, groupOrders, inferPayer } from "../src/render.ts";
import { loadSettings } from "../src/settings.ts";
import { createShareLink } from "../src/share.ts";
import { writeLastPush } from "../src/lastpush.ts";
import { loadCredentials, loadPushed, savePushed, SplitwiseAPI } from "../src/splitwise.ts";

// Short usage block naming all six verbs.
export function usageText(): string {
  return [
    "Usage: cli.ts <verb> [options]",
    "",
    "Verbs:",
    "  gather     collect orders through the gatherer",
    "  validate   check a split file against the schema",
    "  push       send a split file to Splitwise (dry run unless --yes)",
    "  aggregate  print the hand-entry summary, no account needed",
    "  share      make a share link for a split file",
    "  wizard     serve the browser app",
  ].join("\n");
}

// Parsed push flags. A push is a dry run unless yes is true.
export interface PushFlags {
  split: string;
  group: number;
  map: string | null;
  yes: boolean;
}

// Parse push flags. Throws a plain Error on any bad flag. The parser
// itself comes from @std/cli, so this file owns the meaning of each
// flag and none of the tokenising.
export function parsePushFlags(args: string[]): PushFlags {
  const parsed = parseArgs(args, {
    string: ["split", "group", "map"],
    boolean: ["yes"],
    default: { group: "0" },
    unknown: (arg) => {
      // A bare word is not a flag, so reject options alone.
      if (arg.startsWith("-")) throw new Error('Unknown push flag "' + arg + '".');
      return false;
    },
  });
  if (parsed.split === undefined) throw new Error("Flag --split is required.");
  if (parsed.split === "") throw new Error("Flag --split needs a file path.");
  const group = Number(parsed.group);
  if (!Number.isInteger(group) || group < 0) {
    throw new Error('Flag --group needs a whole id number, got "' + parsed.group + '".');
  }
  return {
    split: parsed.split,
    group,
    map: parsed.map === undefined || parsed.map === "" ? null : parsed.map,
    yes: parsed.yes,
  };
}

// Parse --map text into name resolutions. Throws on a malformed entry.
export function parseNameMap(raw: string | null | undefined): Map<string, number> {
  const out = new Map<string, number>();
  if (raw === null || raw === undefined || raw.trim() === "") return out;
  for (const entry of raw.split(",")) {
    const cut = entry.indexOf("=");
    if (cut < 0) throw new Error('Bad --map entry "' + entry + '". Use Name=id,Other=id.');
    const name = entry.slice(0, cut).trim();
    const idText = entry.slice(cut + 1).trim();
    const id = Number(idText);
    if (name === "" || !Number.isInteger(id) || id <= 0) {
      throw new Error('Bad --map entry "' + entry + '". Use Name=id,Other=id.');
    }
    out.set(name, id);
  }
  return out;
}

// Extra inputs the push input builder needs beside the document.
export interface BuildPushOpts {
  groupId: number;
  currency: string;
  nameMap: Record<string, number>;
  pushed: Record<string, number>;
  api: PushApi | null;
  dry: boolean;
}

// Turn a parsed split document plus flags into the runPush input.
// Every order starts set to Push. The caller already checked that the
// document holds people and splits.
export function buildPushInput(
  doc: OutputDoc,
  opts: BuildPushOpts,
): Parameters<typeof runPush>[0] {
  const groups = groupOrders(doc.splits);
  const payer = inferPayer(groups[0], doc.settlements ?? []);
  const choices: Record<string, string> = {};
  for (const order of groups) {
    choices[order[0].order_id ?? "unknown"] = "Push";
  }
  return {
    api: opts.api,
    groups,
    people: doc.people,
    payer,
    currency: opts.currency,
    groupId: opts.groupId,
    nameMap: opts.nameMap,
    choices,
    pushed: opts.pushed,
    dry: opts.dry,
  };
}

// Build the exact command that would send a dry push for real.
export function buildRetryCommand(entry: string, flags: PushFlags): string {
  const quote = (value: string): string => '"' + value.replace(/"/g, "") + '"';
  const parts = [
    "deno run -A --no-lock",
    entry,
    "push",
    "--split " + quote(flags.split),
    "--group " + String(flags.group),
  ];
  if (flags.map !== null) parts.push("--map " + quote(flags.map));
  parts.push("--yes");
  return parts.join(" ");
}

// Print one plain line to stderr and exit non zero.
function fail(message: string): never {
  console.error(message);
  Deno.exit(1);
}

// Run a sibling entry in a subprocess with inherited stdio. The target
// resolves through import.meta.url, so a raw GitHub URL works: href
// keeps the remote base, where a plain relative path would not.
async function dispatch(targetPath: string, rest: string[]): Promise<never> {
  const target = new URL(targetPath, import.meta.url).href;
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "--no-lock", target, ...rest],
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await cmd.output();
  Deno.exit(code);
}

// Read and parse the split file. Fails naming the file when it misses,
// when it is not JSON, or when it holds no people or no splits.
async function readSplitFile(path: string): Promise<{ doc: OutputDoc; text: string }> {
  let text: string;
  try {
    text = await Deno.readTextFile(path);
  } catch {
    fail('Cannot read split file "' + path + '".');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text!);
  } catch {
    fail('Split file "' + path + '" is not valid JSON.');
  }
  const doc = parsed as Partial<OutputDoc>;
  if (
    !Array.isArray(doc.people) || doc.people.length === 0 ||
    !Array.isArray(doc.splits) || doc.splits.length === 0
  ) {
    fail('Split file "' + path + '" holds no people or no splits.');
  }
  return { doc: doc as OutputDoc, text: text! };
}

// One line per unresolved person, naming candidate ids and names.
function pendingLine(person: string, candidates: { id: number; name: string }[]): string {
  if (candidates.length === 0) return person + ": no member matched.";
  const names = candidates.map((c) => c.id + " (" + c.name + ")").join(", ");
  return person + ": matched " + names + ".";
}

// The push verb: dry run unless --yes is given.
async function runPushVerb(args: string[]): Promise<void> {
  let flags: PushFlags;
  try {
    flags = parsePushFlags(args);
  } catch (err) {
    fail(err instanceof Error ? err.message : "Bad push flags.");
  }
  const picked: PushFlags = flags!;
  const { doc } = await readSplitFile(picked.split);
  const currency = (await loadSettings()).currency;
  const envPath = splitwiseEnvPath();
  try {
    await Deno.stat(envPath);
  } catch {
    fail(
      'No Splitwise account found at "' + envPath + '". aggregate needs no account at all, ' +
        "and share sends the split to a friend whose account can push it.",
    );
  }
  let api: PushApi;
  try {
    api = new SplitwiseAPI(await loadCredentials(envPath)) as unknown as PushApi;
  } catch {
    fail('Splitwise keys at "' + envPath + '" cannot be read. Check the file and try again.');
  }
  let resolutions: Map<string, number>;
  try {
    resolutions = parseNameMap(picked.map);
  } catch (err) {
    fail(err instanceof Error ? err.message : "Bad --map value.");
  }
  let mapped: Awaited<ReturnType<typeof buildNameMap>>;
  try {
    mapped = await buildNameMap(api!, doc.people, resolutions!);
  } catch {
    fail("Splitwise did not answer. Check the account and try again.");
  }
  const settled = mapped!;
  if (settled.pending.length > 0) {
    for (const pick of settled.pending) {
      console.error(pendingLine(pick.person, pick.candidates));
    }
    console.error('Pass --map "Name=id,Other=id" to resolve them.');
    Deno.exit(1);
  }
  const onDisk = await loadPushed();
  const nameRecord: Record<string, number> = Object.fromEntries(settled.map);
  if (!picked.yes) {
    const { outcome } = await runPush(
      buildPushInput(doc, {
        groupId: picked.group,
        currency,
        nameMap: nameRecord,
        pushed: onDisk,
        api: api!,
        dry: true,
      }),
    );
    console.log(outcome.note);
    console.log("");
    console.log("To send it, run:");
    console.log("  " + buildRetryCommand(import.meta.url, picked));
    return;
  }
  const { outcome } = await runPush({
    ...buildPushInput(doc, {
      groupId: picked.group,
      currency,
      nameMap: nameRecord,
      pushed: onDisk,
      api: api!,
      dry: false,
    }),
    onExpense: async (fingerprint, expenseId) => {
      onDisk[fingerprint] = expenseId;
      await savePushed(onDisk);
    },
  });
  if (outcome.failed) fail(outcome.note);
  try {
    // Stamp the run after a real push lands. This verb reaches
    // Splitwise, so the record needs no later confirming.
    await writeLastPush("splitwise");
  } catch {
    // A missed stamp never fails a good push.
  }
  console.log("Pushed " + outcome.pushed + " expense(s).");
  console.log(
    "Skipped " + outcome.skippedDupes + " as already sent, " +
      outcome.skippedByChoice + " by choice.",
  );
  console.log("Total " + formatMoney(outcome.totalRs, currency) + " pushed.");
}

// The aggregate verb: print the hand-entry summary, no account needed.
async function runAggregateVerb(args: string[]): Promise<void> {
  const parsed = parseArgs(args, {
    string: ["split", "out"],
    unknown: (arg) => {
      if (arg.startsWith("-")) fail('Unknown aggregate flag "' + arg + '".');
      return false;
    },
  });
  if (parsed.split === undefined || parsed.split === "") fail("Flag --split is required.");
  const out = parsed.out === undefined || parsed.out === "" ? null : parsed.out;
  const { doc } = await readSplitFile(parsed.split);
  const groups = groupOrders(doc.splits);
  const payer = inferPayer(groups[0], doc.settlements ?? []);
  const currency = (await loadSettings()).currency;
  const block = buildAggregateSummary(
    groups,
    doc.people,
    payer,
    doc.settlements ?? [],
    currency + " ",
  );
  console.log(block);
  if (out !== null) {
    try {
      await Deno.writeTextFile(out, block + "\n");
    } catch {
      fail('Cannot write summary file "' + out + '".');
    }
  }
  try {
    // Stamp the run after the summary lands.
    await writeLastPush("aggregate");
  } catch {
    // A missed stamp never fails a good summary.
  }
}

// The share verb: make a share link for a split file.
async function runShareVerb(args: string[]): Promise<void> {
  const path = args[0];
  if (path === undefined || path.startsWith("--")) fail("Share needs a split file path.");
  let text: string;
  try {
    text = await Deno.readTextFile(path!);
  } catch {
    fail('Cannot read split file "' + path + '".');
  }
  try {
    const { link } = await createShareLink(text!);
    console.log(link);
  } catch {
    fail("Share upload failed. Try again later.");
  }
  try {
    // Stamp the run after the link lands.
    await writeLastPush("share");
  } catch {
    // A missed stamp never fails a good link.
  }
}

// Route one verb. No verb or an unknown verb prints usage and exits
// non zero. Dispatch verbs run in a subprocess; the rest run here.
async function main(args: string[]): Promise<void> {
  const [verb, ...rest] = args;
  if (verb === "gather") await dispatch("./gatherer.ts", rest);
  else if (verb === "validate") await dispatch("./validate.ts", rest);
  else if (verb === "wizard") await dispatch("../app/expense-split.ts", rest);
  else if (verb === "push") await runPushVerb(rest);
  else if (verb === "aggregate") await runAggregateVerb(rest);
  else if (verb === "share") await runShareVerb(rest);
  else {
    console.error(usageText());
    Deno.exit(2);
  }
}

if (import.meta.main) {
  await main(Deno.args);
}
