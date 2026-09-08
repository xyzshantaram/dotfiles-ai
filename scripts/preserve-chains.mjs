#!/usr/bin/env node
/**
 * preserve-chains.mjs — keep an instance's `profile.chains` across a sync (#77).
 *
 * THE PROBLEM. step_set_defaults regenerates $DSH_HOME/settings.yaml by copying
 * the repo template over it, preserving only `profile.active`. Its header used
 * to claim "the local file is stateless". That is false: chain config is
 * per-instance — different DSH instances legitimately route to different models
 * — so every local chain edit was silently destroyed on every sync.
 *
 * WHY A TEXT SPLICE AND NOT A YAML ROUND-TRIP. sync.sh already documents the
 * hazard it is avoiding: a full round-trip lets a YAML 1.1 loader rewrite the
 * file and mangle the `reasoningEfforts` key `off:` into `false: null`, which
 * the llm-pi-ai schema rejects and which would drop every pi-ai provider. That
 * is why `profile.active` is patched with sed rather than re-serialized. So
 * this script never re-serializes either: it moves the `chains:` block as raw
 * TEXT, leaving every other byte of the freshly copied template untouched.
 * Parsing happens only to VALIDATE, never to write.
 *
 * THE ADOPT PATH. Blind preservation has a failure mode of its own: once an
 * instance has chains, no future template change could ever reach it — the
 * chain overhaul in #82 would sit in the repo forever. So when the preserved
 * chains differ from the template's, this says so and prints how to take the
 * template's version:
 *
 *     SYNC_ADOPT_CHAINS=1 ./sync.sh
 *
 * Preserve is the default because losing local edits is the worse accident;
 * adopting is one explicit env var away.
 *
 * Usage: node preserve-chains.mjs <previous-settings.yaml> <target-settings.yaml>
 * A missing previous file is normal (fresh install) and seeds from the
 * template. Exit code is 0 unless the ARGUMENTS are unusable: invalid chains
 * WARN, they never fail the sync (owner: "only warn if they are invalid").
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { parse } from "yaml";

const [, , previousPath, targetPath] = process.argv;
if (previousPath === undefined || targetPath === undefined) {
  console.error("usage: preserve-chains.mjs <previous-settings.yaml> <target-settings.yaml>");
  process.exit(2);
}

/**
 * Extract the `  chains:` block as raw lines: the header line plus every line
 * indented more deeply than it, including blank lines and comments. Stops at
 * the next line at the same or shallower indent, which is the next sibling key.
 * @param {string[]} lines - the file's lines.
 * @returns {{start: number, end: number, text: string} | null} the block.
 */
function chainsBlock(lines) {
  const start = lines.findIndex((line) => /^ {2}chains:\s*$/.test(line));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() === "") {
      end += 1;
      continue;
    }
    const indent = line.length - line.trimStart().length;
    if (indent <= 2) break;
    end += 1;
  }
  // Walk back over trailing blank lines so the block ends on real content and
  // the splice cannot accumulate blank lines across repeated syncs.
  while (end > start + 1 && lines[end - 1].trim() === "") end -= 1;
  return { start, end, text: lines.slice(start, end).join("\n") };
}

/**
 * Expand one chain entry into concrete routes, mirroring
 * plugins/profile-routes.ts normalizeEntry closely enough to validate:
 * `chain:<name>` and bare chain names recurse, `provider/model` splits on the
 * FIRST slash (a sub-provider id legitimately contains more).
 * @param {unknown} entry - the chain entry.
 * @param {Record<string, unknown>} chains - the chains map.
 * @param {Set<string>} seen - cycle guard.
 * @param {string[]} problems - accumulator for human-readable findings.
 * @param {string} where - the chain being expanded, for messages.
 * @returns {{provider: string, model: string}[]} resolved routes.
 */
function expand(entry, chains, seen, problems, where) {
  if (Array.isArray(entry)) {
    return entry.flatMap((step) => expand(step, chains, seen, problems, where));
  }
  if (typeof entry !== "string") {
    problems.push(`${where}: entry is not a string: ${JSON.stringify(entry)}`);
    return [];
  }
  const ref = entry.startsWith("chain:") ? entry.slice("chain:".length) : null;
  const name = ref ?? entry;
  if (ref !== null || (!entry.includes("/") && chains[name] !== undefined)) {
    if (chains[name] === undefined) {
      problems.push(`${where}: references unknown chain "${name}"`);
      return [];
    }
    if (seen.has(name)) {
      problems.push(`${where}: circular reference back to "${name}"`);
      return [];
    }
    return expand(chains[name], chains, new Set([...seen, name]), problems, where);
  }
  const slash = entry.indexOf("/");
  if (slash <= 0 || slash === entry.length - 1) {
    problems.push(`${where}: malformed rung "${entry}" (want provider/model)`);
    return [];
  }
  return [{ provider: entry.slice(0, slash), model: entry.slice(slash + 1) }];
}

/**
 * Validate every chain and print findings. Never throws, never exits non-zero.
 * @param {string} text - the settings text to validate.
 */
function validate(text) {
  let doc;
  try {
    doc = parse(text);
  } catch (error) {
    console.log(`  WARNING: could not parse the result for validation: ${error.message}`);
    return;
  }
  const chains = doc?.profile?.chains ?? {};
  const providers = doc?.["llm-pi-ai"]?.providers ?? {};
  // Only pi-ai providers are checkable here. A route naming a provider pi-ai
  // does not define is NOT an error: deepseek-official is a DSH builtin (it is
  // this very file's agent-default-model) and would otherwise produce a false
  // alarm on every run. So an unknown PROVIDER stays silent; a known provider
  // that lacks the named MODEL is a real, checkable finding.
  const known = new Map(
    Object.entries(providers).map(([name, p]) => [
      name,
      new Set((p?.models ?? []).map((m) => m?.id).filter((id) => typeof id === "string")),
    ]),
  );
  const problems = [];
  for (const [name, entry] of Object.entries(chains)) {
    const routes = expand(entry, chains, new Set([name]), problems, name);
    if (routes.length === 0) problems.push(`${name}: resolves to no usable rung`);
    for (const { provider, model } of routes) {
      const models = known.get(provider);
      if (models !== undefined && !models.has(model)) {
        problems.push(`${name}: provider "${provider}" does not serve "${model}"`);
      }
    }
  }
  if (problems.length === 0) {
    console.log(`  chains validated: ${Object.keys(chains).length} chains, no problems`);
    return;
  }
  for (const problem of problems) console.log(`  WARNING: ${problem}`);
  console.log("  (chains are preserved as written; sync never rewrites them)");
}

const targetText = readFileSync(targetPath, "utf8");
const targetLines = targetText.split("\n");
const targetBlock = chainsBlock(targetLines);

if (process.env.SYNC_ADOPT_CHAINS === "1") {
  console.log("  SYNC_ADOPT_CHAINS=1: taking the repo template's chains");
  validate(targetText);
  process.exit(0);
}
if (!existsSync(previousPath)) {
  console.log("  no previous settings.yaml: chains seeded from the template");
  validate(targetText);
  process.exit(0);
}

const previousBlock = chainsBlock(readFileSync(previousPath, "utf8").split("\n"));
if (previousBlock === null) {
  console.log("  previous settings.yaml had no profile.chains: seeded from the template");
  validate(targetText);
  process.exit(0);
}
if (targetBlock === null) {
  console.log("  WARNING: the template has no profile.chains; leaving the copy untouched");
  process.exit(0);
}
if (previousBlock.text === targetBlock.text) {
  console.log("  chains identical to the template; nothing to preserve");
  validate(targetText);
  process.exit(0);
}

const merged = [
  ...targetLines.slice(0, targetBlock.start),
  ...previousBlock.text.split("\n"),
  ...targetLines.slice(targetBlock.end),
].join("\n");
writeFileSync(targetPath, merged);

const count = previousBlock.text.split("\n").filter((line) => /^ {4}\S.*:\s*$/.test(line)).length;
console.log(`  preserved this instance's chains (${count}) over the template's`);
console.log("  the template's chains DIFFER — to take them instead: SYNC_ADOPT_CHAINS=1 ./sync.sh");
validate(merged);
