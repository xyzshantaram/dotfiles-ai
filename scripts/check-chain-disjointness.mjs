#!/usr/bin/env node
// #50 (aidos board): enforce the partner-chain invariants on settings.yaml.
//
// The aidos gate accepts a review_pass only when its provenance stamp shows
// a partner-chain run (SPEC-batch-review.md, Gate rule). That makes the
// partner chain in profile.chains a security boundary: editing a cheap
// model into it weakens the review gate silently — no gate error, no
// warning, just reviews that look partner-grade while running on a cheap
// tier. This guard makes such an edit LOUD.
//
// Invariants (deliberate owner decisions, 2026-09-07):
//   1. partner rungs are disjoint from the orchestrator chain's rungs — a
//      rung the orchestrator rides is not partner-grade by definition.
//   2. partner rungs are disjoint from the subagent chain's rungs —
//      subagents must never burn the partner tier, and the partner tier
//      must never ride a rung trusted for cheap work.
//   3. partner contains only owner-approved rungs (meridian today). Adding
//      a rung is an explicit owner decision, recorded by updating
//      ALLOWED_PARTNER_RUNGS below with a reason.
//
// A red run is the check working: fix the chain (drift) or make an explicit
// owner decision (deliberate), never absorb silently. Same philosophy as
// check-preset-drift.mjs (#122).
//
// Usage:
//   node scripts/check-chain-disjointness.mjs           # live check
//   node scripts/check-chain-disjointness.mjs --json    # machine-readable
//   --settings <path>   override the settings.yaml path
//
// Env: DSH_HOME (default ~/.dsh) is NOT used — this checks the REPO
// template (home/settings.yaml), the source of truth sync.sh regenerates
// the live file from.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse } from "yaml";

/** Owner-approved partner rungs. Add only with an explicit owner decision. */
const ALLOWED_PARTNER_RUNGS = [
  { rung: "meridian/", reason: "partner-grade tier, owner-approved 2026-09-07" },
];

function fail(message) {
  console.error(`FAIL chain disjointness: ${message}`);
  console.error("Fix the chain (drift) or record an explicit owner decision in ALLOWED_PARTNER_RUNGS (deliberate).");
  return 1;
}

/** Expand a chain: resolve `chain:<name>` references recursively with cycle detection. */
function expandChain(chains, name, seen = new Set()) {
  const rungs = chains?.[name];
  if (!Array.isArray(rungs)) return null;
  if (seen.has(name)) return { error: `cycle at chain:${name}` };
  seen.add(name);
  const out = [];
  for (const rung of rungs) {
    if (typeof rung !== "string" || rung === "") return { error: `bad rung ${JSON.stringify(rung)} in chain ${name}` };
    if (rung.startsWith("chain:")) {
      const ref = expandChain(chains, rung.slice(6), seen);
      if (ref === null) return { error: `unknown chain reference ${rung}` };
      if (ref.error) return ref;
      out.push(...ref.rungs.map((r) => `${r} (via ${rung})`));
    } else {
      out.push(rung);
    }
  }
  return { rungs: out };
}

function runCheck({ settingsPath }) {
  const doc = parse(readFileSync(settingsPath, "utf8"));
  const chains = doc?.profile?.chains;
  const failures = [];
  if (!chains || typeof chains !== "object") {
    return { ok: false, failures: [{ invariant: "chains-exist", detail: "profile.chains missing from settings" }], settingsPath };
  }
  for (const name of ["partner", "personal-orchestrator", "subagent"]) {
    if (!Array.isArray(chains[name])) {
      failures.push({ invariant: "chains-exist", detail: `profile.chains.${name} missing` });
    }
  }
  if (failures.length > 0) return { ok: false, failures, settingsPath };

  const partner = expandChain(chains, "partner");
  const orchestrator = expandChain(chains, "personal-orchestrator");
  const subagent = expandChain(chains, "subagent");
  for (const r of [partner, orchestrator, subagent]) {
    if (r === null || r.error) {
      failures.push({ invariant: "chains-expand", detail: r?.error ?? "chain expansion failed" });
    }
  }
  if (failures.length > 0) return { ok: false, failures, settingsPath };

  // Invariant 1: partner ∩ orchestrator = ∅
  const orchSet = new Set(orchestrator.rungs.map((r) => r.split(" (via")[0]));
  for (const p of partner.rungs) {
    const bare = p.split(" (via")[0];
    if (orchSet.has(bare)) {
      failures.push({ invariant: "partner-disjoint-from-orchestrator", detail: `rung "${bare}" appears in both partner and personal-orchestrator` });
    }
  }
  // Invariant 2: partner ∩ subagent = ∅
  const subSet = new Set(subagent.rungs.map((r) => r.split(" (via")[0]));
  for (const p of partner.rungs) {
    const bare = p.split(" (via")[0];
    if (subSet.has(bare)) {
      failures.push({ invariant: "partner-disjoint-from-subagent", detail: `rung "${bare}" appears in both partner and subagent` });
    }
  }
  // Invariant 3: partner rungs are owner-approved only
  const allowed = new Set(ALLOWED_PARTNER_RUNGS.map((a) => a.rung));
  for (const p of partner.rungs) {
    const bare = p.split(" (via")[0];
    if (!allowed.has(bare)) {
      failures.push({ invariant: "partner-rungs-approved", detail: `rung "${bare}" in partner is not in ALLOWED_PARTNER_RUNGS — adding one is an explicit owner decision` });
    }
  }
  return { ok: failures.length === 0, failures, settingsPath };
}

function main(argv) {
  let settingsPath;
  let json = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--json") json = true;
    else if (a === "--settings") settingsPath = argv[++i];
    else {
      console.error(`unknown argument: ${a}`);
      return 2;
    }
  }
  const opts = {
    settingsPath:
      settingsPath ?? join(dirname(fileURLToPath(import.meta.url)), "..", "home", "settings.yaml"),
  };
  const result = runCheck(opts);
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return result.ok ? 0 : 1;
  }
  if (result.ok) {
    console.log("chain disjointness: partner chain invariants hold (disjoint, owner-approved rungs)");
    return 0;
  }
  for (const f of result.failures) {
    console.error(`  INVARIANT ${f.invariant}: ${f.detail}`);
  }
  return fail(`${result.failures.length} violation(s)`);
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exit(main(process.argv.slice(2)));
}
