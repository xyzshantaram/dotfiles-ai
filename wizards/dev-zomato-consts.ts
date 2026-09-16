#!/usr/bin/env -S deno run --no-lock --allow-read --allow-write --allow-run --allow-env --allow-sys --allow-net
// Refresh Zomato constants from an APK file.
// Accept one APK path plus an optional write flag.
// Print fresh values by default.
// Write the config file only with the write flag.

import { $ } from "zx";
import { legacyZomatoConfigPath, stateRoot, zomatoConfigPath } from "../src/paths.ts";
import { say } from "../src/wizardkit.ts";

// zx escape hatch: use $`cmd args` for shell, e.g. await $`gh auth status`.

// Dev script refreshes Zomato app constants from an APK file.
// It decodes the APK and writes the fresh values to a config file.
// Run with --selftest to check extraction against an offline tree.
const SELFTEST = Deno.args.includes("--selftest");

// Header names anchor the smali search for both secret values.
const API_HEADER = "X-Zomato-API-Key";
const CLIENT_HEADER = "X-Zomato-Client-Id";

// Offline decoded tree feeds the selftest path only.
const SELFTEST_ROOT = "/tmp/dsh/zomato-re/decoded";

// Shape pins for the selftest path only. No live values live here.
// The 32 char hex shape matches the api key literal.
// The uuid shape matches the client id literal.
const SELFTEST_API_KEY_RE = /^[0-9a-fA-F]{32}$/;
const SELFTEST_CLIENT_ID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// One raw hit pairs a value with its file path and line number.
interface Candidate {
  value: string;
  path: string;
  line: number;
}

// Hex shape matches the 32 char API key literal.
const API_KEY_RE = /const-string\s+\S+,\s*"([0-9a-fA-F]{32})"/;
// UUID shape matches the client id literal.
const CLIENT_ID_RE =
  /const-string\s+\S+,\s*"([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})"/;

// Scan one header and collect hits in the six lines above it.
// The window skips decoy literals placed far from the header.
function hitsFor(
  lines: string[],
  index: number,
  header: string,
  valueRe: RegExp,
  path: string,
): Candidate[] {
  const out: Candidate[] = [];
  if (!lines[index].includes(header)) return out;
  const start = Math.max(0, index - 6);
  for (let j = start; j < index; j++) {
    const m = lines[j].match(valueRe);
    if (m) out.push({ value: m[1], path, line: j + 1 });
  }
  return out;
}

// Collect hits for both headers across every given file.
// Callers prefilter files to those holding a header string.
function collectCandidates(
  files: Array<{ path: string; text: string }>,
): { apiKey: Candidate[]; clientId: Candidate[] } {
  const apiKey: Candidate[] = [];
  const clientId: Candidate[] = [];
  for (const f of files) {
    const lines = f.text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      apiKey.push(...hitsFor(lines, i, API_HEADER, API_KEY_RE, f.path));
      clientId.push(...hitsFor(lines, i, CLIENT_HEADER, CLIENT_ID_RE, f.path));
    }
  }
  return { apiKey, clientId };
}

// Dedupe hits across files into one value list per header.
// Exported pure function for unit tests without an APK.
export function extractCandidates(
  files: Array<{ path: string; text: string }>,
): { apiKey: string[]; clientId: string[] } {
  const raw = collectCandidates(files);
  return {
    apiKey: [...new Set(raw.apiKey.map((c) => c.value))],
    clientId: [...new Set(raw.clientId.map((c) => c.value))],
  };
}

// Derive APP_VERSION from versionName for the config file.
// A dash suffix falls off first so betas map cleanly.
// Dots drop out next, then the head trims to three digits.
export function deriveAppVersion(versionName: string): string {
  const base = versionName.split("-")[0];
  const digits = base.replace(/\./g, "");
  return digits.slice(-3);
}

// Read smali files holding either header under one smali root.
// String includes prefilters files before any regex runs.
function walkSmaliFiles(dir: string, out: Array<{ path: string; text: string }>): void {
  for (const entry of Deno.readDirSync(dir)) {
    const full = dir + "/" + entry.name;
    if (entry.isDirectory) {
      walkSmaliFiles(full, out);
    } else if (entry.isFile && entry.name.endsWith(".smali")) {
      const text = Deno.readTextFileSync(full);
      if (text.includes(API_HEADER) || text.includes(CLIENT_HEADER)) out.push({ path: full, text });
    }
  }
}

// Gather header files from every smali root at the decode root.
// A root without smali dirs falls back to a full walk.
function collectSmaliCandidates(root: string): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const roots: string[] = [];
  for (const entry of Deno.readDirSync(root)) {
    if (entry.isDirectory && entry.name.startsWith("smali")) roots.push(root + "/" + entry.name);
  }
  if (roots.length === 0) roots.push(root);
  for (const r of roots) walkSmaliFiles(r, out);
  return out;
}

// Pull versionName and versionCode from apktool yml text.
// A small regex beats a yaml dep for two flat keys.
function parseApktoolYml(text: string): { versionName: string; versionCode: string } {
  const name = text.match(/versionName:\s*["']?([^\s"']+)/)?.[1] ?? "";
  const code = text.match(/versionCode:\s*["']?([^\s"']+)/)?.[1] ?? "";
  return { versionName: name, versionCode: code };
}

// Fail fast on one bad check and name it plainly.
function check(cond: boolean, label: string): void {
  if (!cond) {
    console.log("FAIL: " + label);
    Deno.exit(1);
  }
}

// Exercise extraction against the offline decoded tree.
// This path never touches the drop folder or the source file.
async function runSelftest(): Promise<void> {
  // Stop early when the decoded tree is missing.
  try {
    await Deno.stat(SELFTEST_ROOT);
  } catch {
    console.log("No decoded tree at " + SELFTEST_ROOT + ".");
    console.log("Run this script on an APK first.");
    Deno.exit(1);
  }
  const files = collectSmaliCandidates(SELFTEST_ROOT);
  const found = extractCandidates(files);
  check(found.apiKey.length === 1, "selftest found one api key value.");
  check(SELFTEST_API_KEY_RE.test(found.apiKey[0]), "selftest api key holds hex shape.");
  check(found.clientId.length === 1, "selftest found one client id value.");
  check(SELFTEST_CLIENT_ID_RE.test(found.clientId[0]), "selftest client id holds uuid shape.");
  check(deriveAppVersion("19.8.6") === "986", "selftest version strips dots.");
  check(deriveAppVersion("19.8.6-beta") === "986", "selftest version drops suffix.");
  console.log("PASS");
}

// Config file shape holds the four live values under fixed keys.
interface ZomatoConfig {
  apiKey: string;
  clientId: string;
  appVersion: string;
  appVersionCode: string;
}

// Accept only files starting with the zip magic bytes.
// Anything else fails the package check.
async function startsWithPk(path: string): Promise<boolean> {
  const f = await Deno.open(path);
  try {
    const buf = new Uint8Array(2);
    await f.read(buf);
    return buf[0] === 0x50 && buf[1] === 0x4b;
  } finally {
    f.close();
  }
}

// Probe apktool on PATH first, then the known wrapper path.
// Exit with a one line hint when neither probe lands.
async function findApktool(): Promise<string> {
  try {
    await $`apktool --version`;
    return "apktool";
  } catch {
    // Fall through to the wrapper path.
  }
  try {
    await $`/tmp/dsh/bin/apktool --version`;
    return "/tmp/dsh/bin/apktool";
  } catch {
    // Fall through to the install hint.
  }
  say("Apktool is missing. Install it from apktool.org.");
  Deno.exit(1);
}

// Run one apktool decode and abort loudly on failure.
// Stderr prints raw so the real cause stays visible.
async function decodeOrAbort(
  apktool: string,
  outDir: string,
  apk: string,
  skipRes: boolean,
): Promise<void> {
  try {
    if (skipRes) {
      await $`${apktool} d -r -f -o ${outDir} ${apk}`;
    } else {
      await $`${apktool} d -f -o ${outDir} ${apk}`;
    }
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    say("Apktool decode failed.");
    console.log(err.stderr ?? err.message ?? String(e));
    Deno.exit(1);
  }
}

// Read the current config file when it exists.
// A missing file yields null and the review shows blanks.
async function readOldConfig(path: string): Promise<Partial<ZomatoConfig> | null> {
  try {
    const raw = await Deno.readTextFile(path);
    return JSON.parse(raw) as Partial<ZomatoConfig>;
  } catch {
    return null;
  }
}

// Read the package path and the write flag.
const WRITE = Deno.args.includes("--write");
const packagePath = Deno.args.find((arg) => !arg.startsWith("--"));

if (SELFTEST) {
  await runSelftest();
} else {
  // Show usage when the package path is missing.
  if (!packagePath) {
    console.log("Refresh the Zomato constants from an APK.");
    console.log("Usage: dev-zomato-consts.ts <file.apk|file.xapk> [--write]");
    console.log("Download the latest Zomato Android APK from apkmirror.com or apkpure.com.");
    console.log("Without --write the script prints the new values and writes nothing.");
    Deno.exit(1);
  }
  // Resolve the package file and unpack xapk files.
  let apk: string = packagePath;
  try {
    await Deno.stat(apk);
  } catch {
    console.log("No file at " + apk + ".");
    Deno.exit(1);
  }
  if (apk.toLowerCase().endsWith(".xapk")) {
    const workDir = stateRoot() + "/tmp/zomato-apk";
    await Deno.mkdir(workDir, { recursive: true });
    try {
      await $`unzip -o ${apk} base.apk -d ${workDir}`;
    } catch {
      console.log("Could not unpack base.apk from the xapk file.");
      Deno.exit(1);
    }
    apk = workDir + "/base.apk";
  } else {
    if (!(await startsWithPk(apk))) {
      console.log("That file is not an APK, because it lacks the zip magic bytes.");
      Deno.exit(1);
    }
  }
  // Decode the APK with apktool.
  const apktool = await findApktool();
  const root = stateRoot() + "/tmp/zomato-apk";
  const decodedDir = root + "/decoded";
  await decodeOrAbort(apktool, decodedDir, apk, true);
  let yml = "";
  try {
    yml = await Deno.readTextFile(decodedDir + "/apktool.yml");
  } catch {
    yml = "";
  }
  let ymlDir = decodedDir;
  const first = parseApktoolYml(yml);
  if (!first.versionName || !first.versionCode) {
    const fullDir = root + "/decoded-full";
    await decodeOrAbort(apktool, fullDir, apk, false);
    ymlDir = fullDir;
  }
  say("Decode finished.");
  // Extract fresh constants from the decoded tree.
  const files = collectSmaliCandidates(decodedDir);
  const found = extractCandidates(files);
  if (found.apiKey.length !== 1 || found.clientId.length !== 1) {
    const raw = collectCandidates(files);
    for (const c of raw.apiKey) {
      say("Candidate " + c.value + " at " + c.path + ":" + c.line + ".");
    }
    for (const c of raw.clientId) {
      say("Candidate " + c.value + " at " + c.path + ":" + c.line + ".");
    }
    say("Review the hits above and pick the right value by hand.");
    Deno.exit(1);
  }
  let versionYml = "";
  try {
    versionYml = await Deno.readTextFile(ymlDir + "/apktool.yml");
  } catch {
    versionYml = "";
  }
  const parsed = parseApktoolYml(versionYml);
  if (!parsed.versionName || !parsed.versionCode) {
    say("Apktool yml lacks versionName or versionCode.");
    Deno.exit(1);
  }
  const appVersion = deriveAppVersion(parsed.versionName);
  say("API key is " + found.apiKey[0] + ".");
  say("Client id is " + found.clientId[0] + ".");
  say("App version is " + appVersion + ".");
  say("App version code is " + parsed.versionCode + ".");
  const fresh = {
    apiKey: found.apiKey[0],
    clientId: found.clientId[0],
    appVersion,
    appVersionCode: parsed.versionCode,
  };
  // Compare fresh values with the stored config.
  const configPath = zomatoConfigPath();
  // Old installs keep values under state/config. Read that path
  // as a fallback so they migrate on first write.
  const legacyPath = legacyZomatoConfigPath();
  // Read old values from the config file only.
  const old = await readOldConfig(configPath) ?? await readOldConfig(legacyPath);
  const rows: Array<{ key: string; was: string; next: string }> = [
    { key: "apiKey", was: old?.apiKey ?? "", next: fresh.apiKey },
    { key: "clientId", was: old?.clientId ?? "", next: fresh.clientId },
    { key: "appVersion", was: old?.appVersion ?? "", next: fresh.appVersion },
    { key: "appVersionCode", was: old?.appVersionCode ?? "", next: fresh.appVersionCode },
  ];
  let changed = false;
  for (const r of rows) {
    if (r.was === r.next) {
      say(r.key + ": " + r.was + " -> " + r.next + " unchanged.");
    } else {
      say(r.key + ": " + (r.was || "missing") + " -> " + r.next + ".");
      changed = true;
    }
  }
  if (!changed) {
    say("Config file already holds the new values.");
    Deno.exit(0);
  }
  if (!WRITE) {
    say("Rerun with --write to save the new values.");
    Deno.exit(0);
  }
  const out: ZomatoConfig = {
    apiKey: fresh.apiKey,
    clientId: fresh.clientId,
    appVersion: fresh.appVersion,
    appVersionCode: fresh.appVersionCode,
  };
  // Make the parent dir before the write.
  await Deno.mkdir(configPath.slice(0, configPath.lastIndexOf("/")), { recursive: true });
  // Write owner only so secrets stay private.
  await Deno.writeTextFile(configPath, JSON.stringify(out, null, 2) + "\n", { mode: 0o600 });
  // Fix the mode again for existing files.
  try {
    await Deno.chmod(configPath, 0o600);
  } catch {
    // Ignore chmod errors on non posix disks.
  }
  const back = await readOldConfig(configPath);
  if (
    !back || back.apiKey !== out.apiKey || back.clientId !== out.clientId ||
    back.appVersion !== out.appVersion || back.appVersionCode !== out.appVersionCode
  ) {
    say("Config round trip failed.");
    Deno.exit(1);
  }
  say("Wrote " + configPath + ".");
}
