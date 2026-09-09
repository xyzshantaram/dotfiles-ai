#!/usr/bin/env node
// #122 (aidos board): compare the live (post-sync, patched) standard preset
// with the synced aidos preset, row by row, and fail on any divergence the
// committed allowlist does not name. An allowlisted divergence that no
// longer diverges also fails — the list cannot rot silently.
//
// Why: the aidos preset is a hand-maintained mirror of standard's tool
// rows. When standard changes an opinionated choice (a drop, a pin), aidos
// drifts silently and plugins break. This is the bridge until the new
// harness project replaces preset-forking.
//
// Shapes handled (verified against deployed presets):
//   - a row's children: a `group: true` row carries child rows in its
//     `config` ARRAY; children compare as their own rows under
//     "<group>/<id>". A group's own comparable config is its `isolate` map.
//   - agentOptions: standard nests it under `config`; aidos carries it as a
//     row-level sibling. Both mean the same to the loader, so the compare
//     normalizes them to config.agentOptions.
//   - `!!js` tags: resolved to their literal source text — a dynamic value
//     compares as the expression, which is exactly what drift means for an
//     opinion (the expression changed).
//
// Usage:
//   node scripts/check-preset-drift.mjs            # live check, exit 1 on drift
//   node scripts/check-preset-drift.mjs --json     # machine-readable result
//   --standard <path> --aidos <path> --allowlist <path>   # overrides
//
// Env: DSH_HOME (default ~/.dsh) locates the synced aidos preset.

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

// yaml warns TAG_RESOLVE_FAILED and nulls values for unknown !!js/* tags,
// which would mask expression drift — so every js-family tag resolves to
// its literal "<tag> <source>" form. Known tags are listed by full URI;
// node.tag carries the exact form that appeared in the file.
const jsTags = ["tag:yaml.org,2002:js/function", "tag:yaml.org,2002:js/eval", "tag:yaml.org,2002:js"];
const customTags = jsTags.map((tag) => ({
  tag,
  // yaml v2 scalar-tag contract: resolve receives the raw source string.
  resolve(source) {
    return `${tag} ${String(source)}`;
  },
}));

export function parsePresetText(text) {
  const doc = parse(text, { customTags, merge: false });
  if (Array.isArray(doc)) return doc;
  if (doc && Array.isArray(doc.tools)) return doc.tools;
  throw new Error("preset file is neither a row array nor { tools: [...] }");
}

// A stable, key-sorted canonical form so object key order never reads as drift.
function canon(v) {
  if (v === undefined) return "∅";
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? String(v);
  const walk = (x) => {
    if (x === null || typeof x !== "object") return x;
    if (Array.isArray(x)) return x.map(walk);
    const o = {};
    for (const k of Object.keys(x).sort()) o[k] = walk(x[k]);
    return o;
  };
  return JSON.stringify(walk(v));
}

export function flattenRows(rows, prefix = "") {
  const out = [];
  for (const row of rows ?? []) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
    const key = prefix + String(row.id ?? row.name ?? "<unnamed>");
    out.push([key, row]);
    if (row.group === true && Array.isArray(row.config)) {
      out.push(...flattenRows(row.config, key + "/"));
    }
  }
  return out;
}

// Comparable fields of one row: dotted config paths. Groups compare their
// isolate map; children under a group's config array compare as their own
// rows. agentOptions normalizes from the sibling shape into the nested one.
export function rowFields(row) {
  const flat = new Map();
  const setFlat = (obj, prefix) => {
    if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
      flat.set(prefix, obj);
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === "object" && !Array.isArray(v)) setFlat(v, key);
      else flat.set(key, v);
    }
  };
  if (row.group === true && Array.isArray(row.config)) {
    if (row.isolate !== undefined) setFlat(row.isolate, "isolate");
  } else {
    const config = { ...(row.config ?? {}) };
    if (config.agentOptions === undefined && row.agentOptions !== undefined) {
      config.agentOptions = row.agentOptions;
    }
    setFlat(config, "");
  }
  return flat;
}

export function comparePresets(stdDoc, aidosDoc) {
  const std = new Map(flattenRows(stdDoc));
  const aid = new Map(flattenRows(aidosDoc));
  const findings = [];
  for (const [key] of std) {
    if (!aid.has(key)) {
      findings.push({ key, kind: "missing-in-aidos", field: undefined, detail: "row exists only in the standard preset" });
    }
  }
  for (const [key] of aid) {
    if (!std.has(key)) {
      findings.push({ key, kind: "aidos-only", field: undefined, detail: "row exists only in the aidos preset" });
    }
  }
  for (const [key, sRow] of std) {
    const aRow = aid.get(key);
    if (!aRow) continue;
    const sDis = sRow.disabled === undefined ? false : sRow.disabled;
    const aDis = aRow.disabled === undefined ? false : aRow.disabled;
    if (canon(sDis) !== canon(aDis)) {
      findings.push({ key, kind: "disabled", field: "disabled", detail: `standard=${canon(sDis)} aidos=${canon(aDis)}` });
    }
    const sf = rowFields(sRow);
    const af = rowFields(aRow);
    const fields = new Set([...sf.keys(), ...af.keys()]);
    for (const field of fields) {
      if (canon(sf.get(field)) !== canon(af.get(field))) {
        findings.push({
          key,
          kind: "config",
          field,
          detail: `standard=${canon(sf.get(field))} aidos=${canon(af.get(field))}`,
        });
      }
    }
  }
  findings.sort((a, b) => (a.key + "\u0000" + (a.field ?? "")).localeCompare(b.key + "\u0000" + (b.field ?? "")));
  return findings;
}

// An entry matches a finding when rows are equal and the entry's field is
// absent (row-level kinds only), exact, or "*". An entry matching nothing is
// stale and fails the check alongside unlisted drift.
export function evaluate(findings, allowlist) {
  const used = new Set();
  const failures = [];
  const deliberate = [];
  for (const f of findings) {
    let idx = -1;
    for (let i = 0; i < allowlist.length; i++) {
      const e = allowlist[i];
      if (e.row !== f.key) continue;
      const fieldOk =
        f.field === undefined
          ? e.field === undefined || e.field === null || e.field === "*"
          : e.field === f.field || e.field === "*";
      if (fieldOk) {
        idx = i;
        break;
      }
    }
    if (idx >= 0) {
      deliberate.push({ ...f, reason: allowlist[idx].reason });
      used.add(idx);
    } else {
      failures.push(f);
    }
  }
  const stale = allowlist.filter((_, i) => !used.has(i));
  return { failures, deliberate, stale };
}

function defaultStandardPath() {
  const which = execFileSync("bash", ["-lc", "command -v dsh"], { encoding: "utf8" }).trim();
  if (!which) throw new Error("dsh not on PATH; pass --standard explicitly");
  const pkg = dirname(dirname(realpathSync(which)));
  return join(pkg, "config", "agent-presets", "standard", "agent.cordis.yml");
}

function defaultAidosPath() {
  const home = process.env.DSH_HOME ?? join(homedir(), ".dsh");
  return join(home, ".agent-presets", "aidos", "agent.cordis.yml");
}

export function runCheck({ standardPath, aidosPath, allowlistPath }) {
  const stdDoc = parsePresetText(readFileSync(standardPath, "utf8"));
  const aidosDoc = parsePresetText(readFileSync(aidosPath, "utf8"));
  const allowlist = JSON.parse(readFileSync(allowlistPath, "utf8"));
  if (!Array.isArray(allowlist)) throw new Error("allowlist must be a JSON array");
  for (const e of allowlist) {
    if (!e || typeof e.row !== "string") throw new Error(`bad allowlist entry: ${JSON.stringify(e)}`);
  }
  const result = evaluate(comparePresets(stdDoc, aidosDoc), allowlist);
  result.standardPath = standardPath;
  result.aidosPath = aidosPath;
  result.allowlistPath = allowlistPath;
  result.ok = result.failures.length === 0 && result.stale.length === 0;
  return result;
}

function printHuman(result) {
  const where = `standard: ${result.standardPath}\naidos:    ${result.aidosPath}`;
  if (result.deliberate.length > 0) {
    console.log(`preset drift: ${result.deliberate.length} deliberate divergence(s) named in the allowlist`);
    for (const d of result.deliberate) {
      console.log(`  [deliberate] ${d.key}${d.field ? ` (${d.field})` : ""} — ${d.reason}`);
    }
  } else {
    console.log("preset drift: no allowlisted divergences (presets match or drift is unnamed)");
  }
  if (result.failures.length > 0) {
    console.error(`\nFAIL preset drift: ${result.failures.length} divergence(s) NOT named in the allowlist:`);
    for (const f of result.failures) {
      console.error(`  DRIFT ${f.key}${f.field ? ` [${f.field}]` : ""}: ${f.detail}`);
    }
    console.error("\nFix the aidos preset (drift) or name the divergence in scripts/preset-drift.json (deliberate).");
  }
  if (result.stale.length > 0) {
    console.error(`\nFAIL preset drift: ${result.stale.length} stale allowlist entries (no such divergence today — remove them):`);
    for (const s of result.stale) {
      console.error(`  STALE ${s.row}${s.field ? ` [${s.field}]` : ""}`);
    }
  }
  console.error(where);
  return result.ok ? 0 : 1;
}

function main(argv) {
  const args = { standardPath: undefined, aidosPath: undefined, allowlistPath: undefined, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") args.json = true;
    else if (a === "--standard") args.standardPath = argv[++i];
    else if (a === "--aidos") args.aidosPath = argv[++i];
    else if (a === "--allowlist") args.allowlistPath = argv[++i];
    else {
      console.error(`unknown argument: ${a}`);
      return 2;
    }
  }
  const opts = {
    standardPath: args.standardPath ?? defaultStandardPath(),
    aidosPath: args.aidosPath ?? defaultAidosPath(),
    // Beside this script, NOT in guards/. That directory is bash-guard's
    // rule dir: sync.sh copies all of it to $DSH_HOME/plugins/guards and
    // bash-guard parses every *.json there as a rule file, so this
    // differently-shaped file was reported as "malformed" on every bash call
    // (#128). Nothing at runtime reads it -- this script and its test are the
    // only consumers -- so it belongs next to them.
    allowlistPath:
      args.allowlistPath ?? join(dirname(fileURLToPath(import.meta.url)), "preset-drift.json"),
  };
  const result = runCheck(opts);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  return printHuman(result);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
