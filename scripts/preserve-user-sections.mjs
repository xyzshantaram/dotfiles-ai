#!/usr/bin/env node
/**
 * preserve-user-sections.mjs — keep runtime-written plugin settings across a sync (#159).
 *
 * THE PROBLEM. step_set_defaults regenerates $DSH_HOME/settings.yaml by
 * copying the repo template over it. Before #159 it preserved exactly TWO
 * pieces of runtime state — profile.active (sed) and profile.chains
 * (preserve-chains.mjs) — and silently destroyed every other namespace a
 * plugin persists there. The subscriptions panel writes provider visibility
 * into a `subscriptions` section (PUT /subscriptions/config -> settings
 * .replace); the next sync erased it, so the panel forgot on every sync.
 *
 * ENUMERATED RUNTIME-WRITTEN NAMESPACES (rg installSettingsSection /
 * settings.replace across plugins/, 2026-09-17):
 *   - `profile` — profiles.ts PUT /profiles/config + PUT /profiles/switch
 *     (active flip, whole-section replace). Covered by the two existing
 *     preservations, NOT by this script.
 *   - `subscriptions` — subscriptions PUT /subscriptions/config writes
 *     { providers }. Covered by this script (absent from the template).
 * Registered but NOT runtime-written in this repo (no PUT/replace path):
 *   `prices` (context-meter; rates rebuilt by sync-models, overrides
 *   hand-kept), `log-viewer` (command default only). Upstream-owned sections
 *   present in the template (`llm-pi-ai`, `agent-default-model`,
 *   `ui-onboarding`, `agent-presets`, `modelSync`) are managed by their own
 *   writers and stay template-authoritative here.
 *
 * STRATEGY: preserve user layers generically, not per-namespace. Any
 * top-level section present in the previous file but ABSENT from the freshly
 * copied template is carried over wholesale. That covers `subscriptions`
 * today and the next plugin's new namespace automatically — no third,
 * fourth, fifth sed-style special case. Sections the template owns stay
 * template-authoritative: the copy wins, so sync still updates settings.
 * The two existing preservations are untouched; this script SKIPS `profile`
 * explicitly so it can never fight them, and SKIPS `modelSync`, which the
 * step strips deliberately one line above (re-adding it would resurrect the
 * build-time stamp M18 removes).
 *
 * WHY A TEXT SPLICE AND NOT A YAML ROUND-TRIP. Same hazard preserve-chains
 * documents: a full round-trip lets a YAML 1.1 loader rewrite the file and
 * mangle the bare `reasoningEfforts` key `off:` into `false: null`, which
 * the llm-pi-ai schema rejects. This script never parses YAML at all — top
 * -level keys are found with a line regexp, blocks move as raw text — so
 * there is nothing to mangle. Parsing happens nowhere; validation is
 * unnecessary because bytes are never interpreted.
 *
 * KNOWN LIMIT. A future plugin that writes into a section the template
 * OWNS (like `profile`) needs its own preservation logic; this script only
 * carries over sections the template does not define. And if the template
 * later GAINS a section a user already has (e.g. the repo starts shipping
 * `subscriptions:`), that section becomes template-owned and the user's
 * values stop carrying over — the template author takes responsibility at
 * that point, exactly like SYNC_ADOPT_CHAINS for chains.
 *
 * Usage: node preserve-user-sections.mjs <previous-settings.yaml> <target-settings.yaml>
 * A missing previous file is normal (fresh install): nothing to carry over.
 * Exit code is 0 unless the ARGUMENTS are unusable. Findings WARN, they
 * never fail the sync (sync.sh calls this with `|| true` either way).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [, , previousPath, targetPath] = process.argv;
if (previousPath === undefined || targetPath === undefined) {
  console.error("usage: preserve-user-sections.mjs <previous-settings.yaml> <target-settings.yaml>");
  process.exit(2);
}

/**
 * Sections this script must never carry over, even when absent from the
 * template copy. `profile` belongs to the two existing preservations;
 * `modelSync` is stripped deliberately by the step itself (M18).
 */
const SKIP = new Set(["profile", "modelSync"]);

/**
 * A top-level key line: starts at column 0, is not a comment or blank
 * line, and has a colon terminating the key. Returns the key, or null.
 * @param {string} line - one source line.
 * @returns {string | null} the top-level key, or null for any other line.
 */
function topKey(line) {
  if (line === "" || line.startsWith(" ") || line.startsWith("\t") || line.startsWith("#")) {
    return null;
  }
  const colon = line.indexOf(":");
  if (colon <= 0) return null;
  const key = line.slice(0, colon).trim();
  if (key === "" || /[\s]/.test(key)) return null;
  return key;
}

/**
 * Split lines into top-level sections: each key line plus everything up to
 * the next key line. Trailing blank lines are trimmed so repeated syncs
 * cannot accumulate blank separators.
 * @param {string[]} lines - the file's lines.
 * @returns {{ key: string, start: number, end: number }[]} the sections.
 */
function sections(lines) {
  const found = [];
  for (let i = 0; i < lines.length; i++) {
    const key = topKey(lines[i]);
    if (key !== null) found.push({ key, start: i, end: lines.length });
  }
  for (let s = 0; s < found.length; s++) {
    if (s + 1 < found.length) found[s].end = found[s + 1].start;
    let end = found[s].end;
    while (end > found[s].start + 1 && lines[end - 1].trim() === "") end -= 1;
    found[s].end = end;
  }
  return found;
}

if (!existsSync(previousPath)) {
  console.log("  no previous settings.yaml: no user sections to preserve");
  process.exit(0);
}

const previousLines = readFileSync(previousPath, "utf8").split("\n");
const targetText = readFileSync(targetPath, "utf8");
const targetLines = targetText.split("\n");
const targetKeys = new Set(
  sections(targetLines).map((s) => s.key),
);

const carry = sections(previousLines).filter(
  (s) => !targetKeys.has(s.key) && !SKIP.has(s.key),
);

if (carry.length === 0) {
  console.log("  no extra user sections in the previous settings.yaml; nothing to preserve");
  process.exit(0);
}

const blocks = carry.map((s) => previousLines.slice(s.start, s.end).join("\n"));
let merged = targetText;
if (!merged.endsWith("\n")) merged += "\n";
merged += "\n" + blocks.join("\n\n") + "\n";
writeFileSync(targetPath, merged);

console.log(
  `  preserved user sections over the template's (${carry.map((s) => s.key).join(", ")})`,
);
