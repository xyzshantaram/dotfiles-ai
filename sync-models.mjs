#!/usr/bin/env node
// sync-models.mjs
//
// Manual model-seed tool for the personal dsh bundle.
//
// What it does:
//   1. Reads home/settings.yaml (the repo source of truth).
//   2. For every provider whose `api` is `openai-completions` and that has a
//      `baseURL`, calls {baseURL}/models and learns the model ids the provider
//      actually serves. A provider listed in CATALOG_EXCLUDED (a gateway-extras
//      route) subtracts the pi-ai catalog's own models, so it only lists what
//      the catalog does not ship.
//   3. Appends any model id that is not already present to that provider's
//      `models:` list. It never deletes or rewrites existing entries, and it
//      is idempotent: a second run adds nothing. Entries carry contextWindow,
//      maxTokens, defaultInput (image only when LiteLLM declares it), and
//      reasoningEfforts (from LiteLLM's per-level flags) when --with-meta is
//      set.
//   4. Checks every model referenced by `profile.chains` and warns about any
//      that are missing from the (now seeded) providers.
//   5. Writes the sync time to `modelSync.lastRun` so the file records when it
//      was last seeded.
//
// This is a MANUAL tool. Run it, review the diff, commit, then run sync.sh.
// It is intentionally NOT part of sync.sh.
//
// Usage:
//   node sync-models.mjs                 # seed, then write home/settings.yaml
//   node sync-models.mjs --dry-run       # print what would change, write nothing
//   node sync-models.mjs --with-meta     # also fill contextWindow/maxTokens/reasoningEfforts from LiteLLM
//
// Env:
//   SETTINGS_YAML   path to the settings file (default: ./home/settings.yaml)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SETTINGS = process.env.SETTINGS_YAML ?? join(HERE, "home", "settings.yaml");

const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("-n");
const WITH_META = process.argv.includes("--with-meta");

const LITELLM_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

// Gateway-extras providers: a hand-declared route whose `models:` list is
// seeded from the live gateway MINUS the pi-ai catalog models for a catalog
// route, so the hand-declared route only lists what the catalog does not ship.
// Key = the hand-declared provider route; value = the pi-ai catalog provider
// whose model ids are excluded from the live listing before seeding.
const CATALOG_EXCLUDED = { "opencode-zen": "opencode" };
// Catalog routes: the settings block serves the installed pi-ai catalog as-is
// (no `models:` list to seed). The seed loop must not touch them, and the
// chain check verifies their refs against the catalog.
const CATALOG_ROUTES = new Set(["opencode"]);
// The pi-ai version the vendored fork declares; keep in sync with
// plugins/llm-pi-ai/package.json (dependencies["@earendil-works/pi-ai"]).
const PI_AI_VERSION = "0.82.1";
const PI_AI_CATALOG_BASE = `https://unpkg.com/@earendil-works/pi-ai@${PI_AI_VERSION}/dist/providers/data`;

/** The model ids pi-ai ships for one catalog provider (union across protocols). */
async function fetchCatalogModelIds(providerId) {
  const url = `${PI_AI_CATALOG_BASE}/${providerId}.json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`catalog ${providerId} HTTP ${res.status}`);
  const json = await res.json();
  const ids = new Set();
  for (const api of Object.values(json)) {
    if (api && typeof api === "object") {
      for (const id of Object.keys(api)) ids.add(id);
    }
  }
  return ids;
}
const indentOf = (line) => {
  // Empty or whitespace-only lines carry no structure: -1 skips every indent
  // test instead of faking a top-level (ind 0) section boundary, which would
  // reset in-progress provider/chain state.
  if (line.trim() === "") return -1;
  // Tabs count as one char here, matching this file's spaces-only indentation.
  return (line.match(/^(\s*)/) || ["", ""])[1].length;
};

// Parse settings.yaml into (a) provider metadata with line indices and
// (b) the set of "provider/model" strings referenced by chains.
//
// This is a purpose-built parser, not a general YAML reader. It assumes the
// file keeps a fixed shape: section keys at indent 0, `providers:`/`chains:`
// at 2, provider/chain names at 4, properties at 6, model entries at 6/8, and
// spaces (never tabs) for indentation. It does not handle folded or literal
// scalars, quoted strings, inline lists, anchors, or comment text that looks
// like a key. Any formatting drift can silently mis-attribute entries.
//
// The parser is knowingly fragile. A real `yaml` dependency would replace it
// (the code review that flagged this wheel reinvention recommends that), but
// PLAN.md requires user approval before adding a dependency, so this
// hand-rolled version stays for now.
function analyze(text) {
  const lines = text.split("\n");
  const providers = [];
  const chainRefs = [];

  let inProviders = false;
  let inChains = false;
  let cur = null; // current provider
  let inModels = false;
  let curChain = null;
  let curRouteProvider = null;
  let inModelSync = false;
  let modelSyncStart = null;
  let modelSyncEnd = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const ind = indentOf(line);
    const trimmed = line.trim();

    // Section boundaries.
    if (ind === 0) {
      if (inModelSync && trimmed !== "modelSync:") {
        modelSyncEnd = i;
        inModelSync = false;
      }
      inProviders = false;
      inChains = false;
      cur = null;
      inModels = false;
      if (trimmed === "modelSync:") {
        inModelSync = true;
        modelSyncStart = i;
      }
      continue;
    }
    if (ind === 2 && trimmed === "providers:") {
      inProviders = true;
      continue;
    }
    if (ind === 2 && trimmed === "chains:") {
      inChains = true;
      continue;
    }

    // Provider block.
    if (
      inProviders &&
      ind === 4 &&
      /^[A-Za-z0-9_-]+:/.test(trimmed) &&
      !trimmed.startsWith("#") &&
      !trimmed.includes(" ")
    ) {
      cur = {
        name: trimmed.slice(0, -1),
        api: null,
        baseURL: null,
        apiKeyEnv: null,
        modelIds: new Set(),
        modelsKeyLine: null,
        lastModelLine: null,
        headerLine: i,
      };
      providers.push(cur);
      inModels = false;
      continue;
    }
    if (inProviders && cur) {
      const dedent = ind <= 4 && trimmed !== "";
      if (dedent) {
        cur = null;
        inModels = false;
        // Re-evaluate this line as a potential new provider header below.
      } else if (ind === 6) {
        if (trimmed.startsWith("api:")) cur.api = trimmed.slice(4).trim();
        else if (trimmed.startsWith("baseURL:")) cur.baseURL = trimmed.slice(8).trim();
        else if (trimmed.startsWith("apiKeyEnv:")) cur.apiKeyEnv = trimmed.slice(9).trim();
        else if (trimmed === "models:") {
          cur.modelsKeyLine = i;
          inModels = true;
        } else if (trimmed.startsWith("- id:")) {
          cur.modelIds.add(trimmed.slice(5).trim());
          cur.lastModelLine = i;
        }
      } else if (ind >= 8 && inModels) {
        cur.lastModelLine = i;
      }
      // Lines that dedented also fall through to the top-level check next loop
      // iteration only if they are a new header; here we just continue.
      if (!dedent) continue;
    }

    // Chains block.
    if (ind === 2 && trimmed === "chains:") {
      inChains = true;
      continue;
    }
    if (
      ind === 4 &&
      /^[A-Za-z0-9_-]+:/.test(trimmed) &&
      !trimmed.startsWith("#") &&
      !trimmed.includes(" ")
    ) {
      if (ind === 4 && /^[A-Za-z0-9_-]+:/.test(trimmed) && !trimmed.includes(" ")) {
        curChain = { name: trimmed.slice(0, -1), mode: null };
        curRouteProvider = null;
        continue;
      }
      if (!curChain) continue;
      if (ind === 6) {
        if (trimmed === "routes:") {
          curChain.mode = "routes";
          continue;
        }
        if (trimmed.startsWith("- ")) {
          const val = trimmed.slice(2).trim();
          if (curChain.mode === null) curChain.mode = "list";
          if (val.startsWith("provider:")) {
            curRouteProvider = val.slice(9).trim();
            continue;
          }
          if (val.startsWith("model:")) {
            const m = val.slice(6).trim();
            if (curRouteProvider) chainRefs.push(`${curRouteProvider}/${m}`);
            curRouteProvider = null;
            continue;
          }
          if (val.includes("/") && !val.startsWith("chain:")) chainRefs.push(val);
          continue;
        }
      }
      if (ind === 8) {
        if (trimmed.startsWith("provider:")) {
          curRouteProvider = trimmed.slice(9).trim();
          continue;
        }
        if (trimmed.startsWith("model:")) {
          const m = trimmed.slice(6).trim();
          if (curRouteProvider) chainRefs.push(`${curRouteProvider}/${m}`);
          curRouteProvider = null;
          continue;
        }
      }
    }
  }

  if (inModelSync) modelSyncEnd = lines.length;
  const modelSyncRange =
    modelSyncStart != null && modelSyncEnd != null
      ? { start: modelSyncStart, end: modelSyncEnd }
      : null;
  return { lines, providers, chainRefs, modelSyncRange };
}

async function fetchModelIds(baseURL, apiKey) {
  const url = baseURL.replace(/\/+$/, "") + "/models";
  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  let arr = null;
  if (Array.isArray(json)) arr = json;
  else if (Array.isArray(json.data)) arr = json.data;
  else if (Array.isArray(json.models)) arr = json.models;
  if (!arr) throw new Error("response had no model array");
  const ids = [];
  for (const m of arr) {
    const id = typeof m === "string" ? m : (m.id ?? m.name ?? m.model);
    if (typeof id === "string" && id.length > 0) ids.push(id);
  }
  return ids;
}

function prettyName(id) {
  const tail = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  return tail
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

// LiteLLM's per-level reasoning-effort flags -> pi-ai thinking levels, in
// escalation order. LiteLLM publishes no "medium" or "high" flag, so those two
// levels are never derived from it. "none" maps to pi-ai's "off" (supported,
// send nothing). Each derived level's wire spelling is the level name itself:
// the openai-completions catalog pi-ai ships uses literal spellings for these
// gateways ("high":"high", "max":"max"), and LiteLLM carries no wire value, so
// literal is the only automatable choice. A model with `supports_reasoning`
// but no per-level flags yields nothing (no level set to emit).
const REASONING_FLAGS = [
  ["none", "off"],
  ["minimal", "minimal"],
  ["low", "low"],
  ["xhigh", "xhigh"],
  ["max", "max"],
];

/** Derive a pi-ai `reasoningEfforts` dict from one LiteLLM model entry. */
function reasoningEffortsFor(entry) {
  if (!entry) return null;
  const out = {};
  let hasThinking = false;
  for (const [flag, level] of REASONING_FLAGS) {
    if (entry["supports_" + flag + "_reasoning_effort"] === true) {
      out[level] = level === "off" ? null : level;
      if (level !== "off") hasThinking = true;
    }
  }
  // A dict with only "off" is invalid to pi-ai (it demands a thinking level);
  // a model that only supports "none" stays undeclared.
  return hasThinking ? out : null;
}

let liteLLMCache = null;
async function getLiteLLM() {
  if (liteLLMCache) return liteLLMCache;
  const res = await fetch(LITELLM_URL);
  if (!res.ok) throw new Error(`LiteLLM HTTP ${res.status}`);
  liteLLMCache = await res.json();
  return liteLLMCache;
}

function lookupMeta(id, db) {
  if (!db) return null;
  const variants = [id];
  const slash = id.indexOf("/");
  if (slash >= 0) variants.push(id.slice(slash + 1));
  for (const v of variants) {
    const e = db[v];
    if (!e) continue;
    const out = {};
    if (typeof e.max_input_tokens === "number") out.contextWindow = e.max_input_tokens;
    if (typeof e.max_output_tokens === "number") out.maxTokens = e.max_output_tokens;
    const params = e.supported_openai_params || [];
    out.image = Array.isArray(params) && params.includes("image");
    const efforts = reasoningEffortsFor(e);
    if (efforts) out.reasoningEfforts = efforts;
    return out;
  }
  return null;
}

function entryText(id, name, meta) {
  const out = [`      - id: ${id}`, `        name: ${name}`];
  if (meta) {
    if (typeof meta.contextWindow === "number")
      out.push(`        contextWindow: ${meta.contextWindow}`);
    if (typeof meta.maxTokens === "number") out.push(`        maxTokens: ${meta.maxTokens}`);
    if (meta.image) out.push(`        defaultInput:`, `        - text`, `        - image`);
    if (meta.reasoningEfforts) {
      out.push(`        reasoningEfforts:`);
      for (const [level, wire] of Object.entries(meta.reasoningEfforts)) {
        out.push(wire === null ? `          ${level}:` : `          ${level}: ${wire}`);
      }
    }
  }
  return out;
}

async function main() {
  const text = readFileSync(SETTINGS, "utf8");
  const { lines, providers, chainRefs, modelSyncRange } = analyze(text);

  let metaDB = null;
  if (WITH_META) {
    try {
      metaDB = await getLiteLLM();
    } catch (e) {
      console.warn(`! could not fetch LiteLLM metadata: ${e.message}`);
    }
  }

  const edits = []; // { at, block: string[] }
  const summary = [];

  for (const p of providers) {
    if (CATALOG_ROUTES.has(p.name)) continue; // catalog route: never seeded
    if (p.api !== "openai-completions" || !p.baseURL) continue;
    const key = p.apiKeyEnv ? process.env[p.apiKeyEnv] : undefined;
    console.log(`\n→ ${p.name} (${p.baseURL.replace(/\/+$/, "")}/models)`);
    let ids;
    try {
      ids = await fetchModelIds(p.baseURL, key);
    } catch (e) {
      console.warn(`  ! skip: ${e.message}`);
      continue;
    }
    console.log(`  provider exposes ${ids.length} model id(s)`);
    // Gateway-extras: subtract the pi-ai catalog's own models so this route
    // only lists models the catalog does not already ship. Fail closed: if the
    // catalog cannot be fetched, do not seed (seeding everything would duplicate
    // the catalog's models here).
    const excludeCatalog = CATALOG_EXCLUDED[p.name];
    if (excludeCatalog) {
      try {
        const catalogIds = await fetchCatalogModelIds(excludeCatalog);
        ids = ids.filter((id) => !catalogIds.has(id));
        console.log(`  excluding ${catalogIds.size} catalog model id(s) (${excludeCatalog})`);
      } catch (e) {
        console.warn(
          `  ! could not fetch ${excludeCatalog} catalog: ${e.message}; skipping ${p.name}`,
        );
        continue;
      }
    }
    const newIds = ids.filter((id) => !p.modelIds.has(id));
    if (newIds.length === 0) {
      console.log("  nothing new to add");
      continue;
    }
    const block = [];
    for (const id of newIds) {
      const meta = WITH_META && metaDB ? lookupMeta(id, metaDB) : null;
      block.push(...entryText(id, prettyName(id), meta));
    }
    let at;
    if (p.lastModelLine != null) {
      at = p.lastModelLine + 1;
    } else {
      at = lines.length;
      for (let i = p.headerLine + 1; i < lines.length; i++) {
        if (indentOf(lines[i]) <= 4 && lines[i].trim() !== "") {
          at = i;
          break;
        }
      }
      block.unshift("      models:");
    }
    edits.push({ at, block });
    p.modelIds = new Set([...p.modelIds, ...newIds]);
    summary.push({ provider: p.name, added: newIds.length, ids: newIds });
    console.log(`  + would add ${newIds.length}: ${newIds.join(", ")}`);
  }

  // Chain consistency check (against the seeded model sets plus the pi-ai
  // catalog for catalog-backed routes, which have no `models:` list here).
  console.log("\n=== chain consistency ===");
  const byName = new Map(providers.map((p) => [p.name, p]));
  const catalogCache = new Map();
  let warnings = 0;
  for (const ref of [...new Set(chainRefs)]) {
    const slash = ref.indexOf("/");
    const prov = slash >= 0 ? ref.slice(0, slash) : ref;
    const model = slash >= 0 ? ref.slice(slash + 1) : "";
    const p = byName.get(prov);
    if (!p) continue; // built-in provider with no block here: cannot verify
    let present = p.modelIds.has(model);
    // Catalog-backed route: the settings block carries no `models:` list, so
    // verify against the installed pi-ai catalog instead. Keyed by the route
    // name, which is the catalog provider id (e.g. `opencode`).
    if (!present && CATALOG_ROUTES.has(prov)) {
      let catalogIds = catalogCache.get(prov);
      if (catalogIds === undefined) {
        try {
          catalogIds = await fetchCatalogModelIds(prov);
        } catch {
          catalogIds = null; // catalog unreachable: cannot verify
        }
        catalogCache.set(prov, catalogIds);
      }
      if (catalogIds !== null) present = catalogIds.has(model);
    }
    if (!present) {
      console.warn(`  ⚠ chain references ${ref} but it is NOT in ${prov}'s models`);
      warnings++;
    }
  }
  if (warnings === 0) console.log("  all chain-referenced models are present");
  // Record the last sync time in the file's modelSync section.
  const now = new Date().toISOString();
  let modelSyncAppend = false;
  if (!DRY_RUN) {
    if (modelSyncRange) {
      edits.push({
        at: modelSyncRange.start,
        deleteCount: modelSyncRange.end - modelSyncRange.start,
        block: ["modelSync:", `  lastRun: ${now}`],
      });
    } else {
      modelSyncAppend = true;
    }
  }

  // Apply edits from the bottom up so earlier indices stay valid.
  if (DRY_RUN) {
    console.log("\n[dry-run] no changes written.");
    console.log(
      modelSyncRange
        ? `  (modelSync.lastRun would be updated to ${now})`
        : `  (modelSync.lastRun would be set to ${now})`,
    );
  } else if (edits.length > 0 || modelSyncAppend) {
    edits.sort((a, b) => b.at - a.at);
    for (const e of edits) {
      if (e.deleteCount != null) lines.splice(e.at, e.deleteCount, ...(e.block || []));
      else lines.splice(e.at, 0, ...e.block);
    }
    if (modelSyncAppend) lines.push("modelSync:", `  lastRun: ${now}`);
    writeFileSync(SETTINGS, lines.join("\n"), "utf8");
    console.log(`\nwrote ${SETTINGS} (lastRun ${now})`);
  } else {
    console.log("\nno changes.");
  }

  const total = summary.reduce((n, s) => n + s.added, 0);
  console.log(
    `\nsummary: ${summary.length} provider(s) updated (+${total} models), ${warnings} chain warning(s).`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
