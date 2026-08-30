#!/usr/bin/env node
// sync-models.mjs
//
// Manual model-seed tool for the personal dsh bundle.
//
// What it does:
//   1. Reads home/settings.yaml (the repo source of truth) with the `yaml`
//      package, keeping the source CST so comments and formatting survive.
//   2. For the two seeded providers (`command-code`, `opencode-zen`), calls
//      {baseURL}/models and learns the model ids the provider actually serves.
//      A provider listed in CATALOG_EXCLUDED (a gateway-extras route)
//      subtracts the pi-ai catalog's own models, so it only lists what the
//      catalog does not ship.
//   3. For `command-code` and `opencode-zen`, regenerates the entire
//      `models:` sequence between a `# sync-models:begin` / `# sync-models:end`
//      marker pair from a fresh {baseURL}/models fetch, on every run. It never
//      appends just the missing ids: the whole marked block is replaced from
//      scratch. Every other provider and everything outside the markers is left
//      byte-identical. Entries carry contextWindow, maxTokens, defaultInput
//      (image only when LiteLLM declares it), and reasoningEfforts (from
//      LiteLLM's per-level flags) when --with-meta is set.
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

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as YAML from "yaml";

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

// Curated vision models: neither the live /models endpoint (it exposes no
// modality field) nor LiteLLM nor the pi-ai catalog reliably advertise image
// input for these (too new / gateway-specific ids), yet the upstream gateway
// serves them with image input. Without this the `see` plugin vision gate
// would deny `read_image` for agents routed to them. sync-models emits
// `defaultInput: [text, image]` for them on every run, so the regenerated block
// keeps it and the runtime recognizes them as vision-capable. Add to this set as
// new vision models appear. See the see-plugin restriction bug:
// provider "command-code" model "Qwen/Qwen3.7-Flash" (the `see` chain head).
const VISION_MODELS = new Set([
  "Qwen/Qwen3.8-Max",
  "Qwen/Qwen3.8-27B",
  "Qwen/Qwen3.8-Flash",
  "Qwen/Qwen3.7-Max",
  "Qwen/Qwen3.7-Plus",
  "Qwen/Qwen3.7-Flash",
  "Qwen/Qwen3.6-Max-Preview",
  "Qwen/Qwen3.6-Plus",
  // Z.AI ships GLM-5.3-Flash as a VLM (docs.z.ai/guides/vlm/glm-5.3-flash),
  // but the gateway id carries the `z-ai/` prefix, which no catalog indexes.
  "z-ai/glm-5.3-flash",
]);

// The pi-ai provider catalogs bundled in node_modules are a second, local source
// of modality and reasoning-effort data. LiteLLM is incomplete for new models;
// the pi-ai catalogs carry `input` (modalities) and `thinkingLevelMap` (reasoning
// efforts) for thousands of models and need no network. We merge both with
// LiteLLM (and the curated VISION_MODELS override) when computing each model
// metadata, instead of trusting a single incomplete source. A model may appear
// under several APIs (e.g. openai-completions vs anthropic-messages) with
// differing `input`; we union the matches and prefer an image-capable variant.
const PI_AI_CATALOG_DIR = join(HERE, "node_modules/@earendil-works/pi-ai/dist/providers/data");

function buildPiAiIndex() {
  const all = [];
  if (existsSync(PI_AI_CATALOG_DIR)) {
    for (const f of readdirSync(PI_AI_CATALOG_DIR).filter((x) => x.endsWith(".json"))) {
      let json;
      try {
        json = JSON.parse(readFileSync(join(PI_AI_CATALOG_DIR, f), "utf8"));
      } catch {
        continue;
      }
      for (const api of Object.values(json)) {
        if (!api || typeof api !== "object") continue;
        for (const [id, e] of Object.entries(api)) {
          if (typeof id !== "string" || !e || typeof e !== "object") continue;
          all.push({
            id,
            input: Array.isArray(e.input) ? e.input : null,
            thinking:
              e.thinkingLevelMap && typeof e.thinkingLevelMap === "object"
                ? e.thinkingLevelMap
                : null,
          });
        }
      }
    }
  }
  const byId = new Map();
  for (const e of all) {
    if (!byId.has(e.id)) byId.set(e.id, []);
    byId.get(e.id).push(e);
  }
  const norm = new Map();
  const addNorm = (id, e) => {
    const n = id.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!norm.has(n)) norm.set(n, []);
    norm.get(n).push(e);
  };
  for (const e of all) addNorm(e.id, e);
  return { byId, norm };
}

// Resolve one model id across the pi-ai catalogs. Returns the unioned modality
// and reasoning data, or null when the catalogs know nothing about the id.
function lookupPiAi(id, idx) {
  if (!idx) return null;
  const found = [];
  const push = (list) => {
    if (list) for (const e of list) found.push(e);
  };
  push(idx.byId.get(id));
  const n = id.toLowerCase().replace(/[^a-z0-9]/g, "");
  push(idx.norm.get(n));
  const slash = id.indexOf("/");
  const tail = slash >= 0 ? id.slice(slash + 1) : id;
  push(idx.byId.get(tail));
  push(idx.norm.get(tail.toLowerCase().replace(/[^a-z0-9]/g, "")));
  for (const p of [
    "Qwen/",
    "z-ai/",
    "zai-org/",
    "MiniMaxAI/",
    "minimax/",
    "tencent/",
    "meta/",
    "xai/",
    "google/",
    "moonshotai/",
    "xiaomi/",
    "stepfun/",
    "thinkingmachines/",
    "deepseek/",
    "sakana/",
    "nvidia/",
    "poolside/",
  ]) {
    if (id.startsWith(p)) {
      const t = id.slice(p.length);
      push(idx.byId.get(t));
      push(idx.norm.get(t.toLowerCase().replace(/[^a-z0-9]/g, "")));
    }
  }
  if (found.length === 0) return null;
  let vision = false;
  const efforts = {};
  for (const e of found) {
    if (e.input && e.input.includes("image")) vision = true;
    if (e.thinking)
      for (const [level, wire] of Object.entries(e.thinking)) {
        // The catalogs disagree about a level's wire value. For gpt-5.6-sol,
        // opencode.json gives "minimal": null while github-copilot.json gives
        // "low". Plain last-write-wins let the null win on readdir order, and
        // llm-pi-ai rejects a null on every level except "off"
        // (plugins/llm-pi-ai/lib/index.js:1236). So keep a real spelling once
        // one catalog supplies it, and never let a later null overwrite it.
        // "off" keeps the old behavior: a null there is legal and meaningful.
        if (wire === null && level !== "off" && efforts[level] != null) continue;
        efforts[level] = wire;
      }
  }
  // A non-"off" level that is still null means no catalog carried a spelling
  // for it. Fall back to the level name, the same literal choice the LiteLLM
  // path makes (see REASONING_FLAGS).
  for (const [level, wire] of Object.entries(efforts)) {
    if (wire === null && level !== "off") efforts[level] = level;
  }
  return { vision, reasoningEfforts: Object.keys(efforts).length ? efforts : null };
}


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
// The two providers this script seeds get their entire `models:` sequence
// regenerated between a marker pair on every run. Content outside the markers
// (the rest of the provider, every other provider, every other top-level key,
// hand-written comments and blank lines) is left byte-identical. Every other
// provider is untouched, exactly as before.
// Marker comment lines are written at the models value indent (6 spaces),
// matching the `- id:` entries, per the PLAN.md marker example.
const MARKER_BEGIN_COMMENT = "# sync-models:begin";
const MARKER_END_COMMENT = "# sync-models:end";
const MARKER_BEGIN = "      " + MARKER_BEGIN_COMMENT;
const MARKER_END = "      " + MARKER_END_COMMENT;
const SEEDED_PROVIDERS = new Set(["command-code", "opencode-zen"]);

// Largest source offset reachable from a CST token, so a block's end offset
// (inclusive of trailing newlines) can be computed for a safe text splice.
function maxTokenOffset(tok) {
  if (!tok || typeof tok !== "object") return -1;
  let m = (tok.offset ?? 0) + (tok.source?.length ?? 0);
  for (const key of ["start", "end", "items", "sep", "value", "key"]) {
    const v = tok[key];
    if (Array.isArray(v)) {
      for (const t of v) m = Math.max(m, maxTokenOffset(t));
    } else if (v && typeof v === "object") {
      m = Math.max(m, maxTokenOffset(v));
    }
  }
  return m;
}

// The 0-based line number containing a source offset.
function lineOfOffset(text, offset) {
  let n = 0;
  for (let i = 0; i < offset; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}

// Extract the structured data the rest of the script needs from the parsed
// YAML document: provider metadata (with model id sets), the chain-referenced
// "provider/model" strings, and the modelSync section line range. Unlike the
// old line parser, this reads the real document tree, so it never mis-attrib
// -utes entries and it needs no assumptions about indentation width.
function analyzeDocument(doc, text) {
  const providers = [];
  const chainRefs = [];
  const byName = new Map();

  const lp = doc.get("llm-pi-ai");
  const provs = lp?.get?.("providers");
  if (provs && provs.items) {
    for (const pair of provs.items) {
      const map = pair.value;
      const name = pair.key.value;
      const modelIds = new Set();
      const models = map?.get?.("models");
      if (models && models.items) {
        for (const item of models.items) {
          const id = item?.get?.("id");
          if (typeof id === "string") modelIds.add(id);
        }
      }
      const p = {
        name,
        map,
        api: map?.get?.("api"),
        baseURL: map?.get?.("baseURL"),
        apiKeyEnv: map?.get?.("apiKeyEnv"),
        modelIds,
        models,
      };
      providers.push(p);
      byName.set(name, p);
    }
  }

  const profileChains = doc.get("profile")?.get?.("chains");
  if (profileChains && profileChains.items) {
    for (const pair of profileChains.items) {
      const chain = pair.value;
      const routes = chain?.get?.("routes");
      if (routes && routes.items) {
        for (const r of routes.items) {
          const prov = r?.get?.("provider");
          const model = r?.get?.("model");
          if (typeof prov === "string" && typeof model === "string") {
            chainRefs.push(`${prov}/${model}`);
          }
        }
      } else if (chain && chain.items) {
        // A plain list of "provider/model" or "chain:name" strings.
        for (const item of chain.items) {
          const val = item?.value;
          if (typeof val === "string" && val.includes("/") && !val.startsWith("chain:")) {
            chainRefs.push(val);
          }
        }
      }
    }
  }

  // modelSync is a top-level block. Its line range starts at the `modelSync:`
  // key and ends (exclusive) where the next top-level line begins, or at EOF.
  const root = doc.contents;
  let modelSyncRange = null;
  const msPair = root?.items?.find((p) => p.key?.value === "modelSync");
  if (msPair) {
    const start = lineOfOffset(text, msPair.key.srcToken.offset);
    const lines = text.split("\n");
    let end = lines.length; // exclusive; the section runs to EOF by default
    for (let i = start + 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed !== "" && !/^\s/.test(lines[i])) {
        end = i;
        break;
      }
    }
    modelSyncRange = { start, end };
  }

  return { providers, byName, chainRefs, modelSyncRange };
}

// Locate a provider's `models:` block as line indices: the line of the
// `models:` key and the last line of the block. The block ends at the first
// non-blank line whose indentation drops below the models value indent (6);
// if none appears, the block runs to EOF. This line scan is stable even when
// marker comments are present inside the block, which the CST seq range is
// not. Returns null when the provider has no `models:` list.
function modelsBlockLines(providerMap, text) {
  const pair = providerMap?.items?.find((p) => p.key?.value === "models");
  if (!pair || !pair.value) return null;
  const keyLine = lineOfOffset(text, pair.key.srcToken.offset);
  const lines = text.split("\n");
  let last = keyLine;
  for (let i = keyLine + 1; i < lines.length; i++) {
    const t = lines[i];
    if (t.trim() === "") continue;
    const ind = (t.match(/^\s*/) || [""])[0].length;
    if (ind < 6) break;
    last = i;
  }
  return { keyLine, last };
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
    // LiteLLM reports vision as a top-level `supports_vision` boolean, not a
    // `supported_openai_params` array containing "image" (that field does not
    // exist anywhere in LiteLLM's model_prices_and_context_window.json;
    // confirmed against a live fetch, 0 of ~3200 entries carry it). The
    // previous check always evaluated to `[] .includes("image")` -> false, so
    // no model synced through --with-meta ever got defaultInput: [text, image].
    out.image = e.supports_vision === true;
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
  const doc = YAML.parseDocument(text, { keepSourceTokens: true });
  const { providers, byName, chainRefs, modelSyncRange } = analyzeDocument(doc, text);
  const lines = text.split("\n");

  let metaDB = null;
  if (WITH_META) {
    try {
      metaDB = await getLiteLLM();
    } catch (e) {
      console.warn(`! could not fetch LiteLLM metadata: ${e.message}`);
    }
  }
  // The pi-ai catalogs are a local, network-free supplement to LiteLLM for
  // modalities and reasoning efforts. Build the index once, up front.
  let piAi = null;
  try {
    piAi = buildPiAiIndex();
  } catch (e) {
    console.warn(`! could not read pi-ai catalogs: ${e.message}`);
  }

  const edits = []; // { at, deleteCount, block: string[] } in line space
  const summary = [];

  for (const p of providers) {
    if (CATALOG_ROUTES.has(p.name)) continue; // catalog route: never seeded
    if (p.api !== "openai-completions" || !p.baseURL) continue;
    // Only the seeded providers get marker-region regeneration. Every other
    // provider (catalog routes, non-openai-completions, no baseURL) is skipped
    // by the guards above; any future provider that passes them but is not in
    // SEEDED_PROVIDERS is left byte-identical too.
    if (!SEEDED_PROVIDERS.has(p.name)) continue;

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

    // Build the full regenerated entry set from the fresh fetch, not just the
    // ids missing from the current list. The whole marker region is replaced
    // from scratch on every run.
    const block = [];
    for (const id of ids) {
      // Merge metadata from every source we have: LiteLLM (when --with-meta),
      // the pi-ai catalogs (local), and the curated VISION_MODELS override.
      // Vision is the union of any source claiming it; reasoning efforts union
      // the declared thinking levels. This closes the single-source gap that
      // left new gateway models (e.g. Qwen) reporting text-only, which made the
      // `see` plugin deny `read_image` for them.
      const lite = WITH_META && metaDB ? lookupMeta(id, metaDB) : null;
      const pai = lookupPiAi(id, piAi);
      const vision =
        (lite?.image === true) || (pai && pai.vision) || VISION_MODELS.has(id);
      let reasoningEfforts = null;
      const le = lite?.reasoningEfforts;
      const pe = pai && pai.reasoningEfforts;
      if (le || pe) reasoningEfforts = { ...(le ?? {}), ...(pe ?? {}) };
      // Mirror the `see` plugin rule: a reasoning-efforts map that contains
      // only `off` is not real reasoning support, so emit nothing for it.
      if (reasoningEfforts && Object.keys(reasoningEfforts).length === 1 && "off" in reasoningEfforts) reasoningEfforts = null;
      const meta = {
        contextWindow: lite?.contextWindow,
        maxTokens: lite?.maxTokens,
        image: vision,
        reasoningEfforts,
      };
      block.push(...entryText(id, prettyName(id), meta));
    }
    const markerBlock = [MARKER_BEGIN, ...block, MARKER_END];

    const blockLines = modelsBlockLines(p.map, text);
    if (!blockLines) {
      // The provider has no `models:` list yet. Create one (with markers) after
      // the provider's last property line, before the next sibling or EOF.
      const providerEnd = lineOfOffset(text, maxTokenOffset(p.map.srcToken));
      // Insert right before the next sibling line (skipping blank lines), or
      // at EOF. A trailing empty split element is kept last.
      let at = providerEnd + 1;
      while (at < lines.length && lines[at].trim() === "") at++;
      if (at === lines.length && lines[lines.length - 1] === "") at = lines.length - 1;
      edits.push({ at, deleteCount: 0, block: ["      models:", ...markerBlock] });
      console.info(`  [${p.name}] no models list: creating markers for the first time`);
      console.debug(`  [${p.name}] insert at line ${at + 1}`);
      summary.push({ provider: p.name, added: ids.length });
      console.log(`  + would write ${ids.length} model(s): ${ids.join(", ")}`);
      p.modelIds = new Set(ids);
      continue;
    }

    const { keyLine, last } = blockLines;

    // Find the marker comment lines within the models block, if present.
    let beginLine = -1;
    let endMarkerLine = -1;
    for (let i = keyLine; i <= last; i++) {
      const t = lines[i].trim();
      if (t === MARKER_BEGIN_COMMENT) beginLine = i;
      else if (t === MARKER_END_COMMENT) endMarkerLine = i;
    }

    if (beginLine >= 0 && endMarkerLine > beginLine) {
      // Markers already present: replace only the entries between them. The
      // marker lines and everything outside them (the `models:` key, comments,
      // blank lines) stay byte-identical.
      console.debug(
        `  [${p.name}] markers found at lines ${beginLine + 1}..${endMarkerLine + 1}; replacing entries between them`,
      );
      edits.push({
        at: beginLine + 1,
        deleteCount: endMarkerLine - beginLine - 1,
        block,
      });
    } else {
      // First-time marker insertion: replace the entries region (everything
      // after `models:` up to the block end) with markers wrapping the
      // regenerated set. The `models:` key line is kept.
      console.info(
        `  [${p.name}] no markers yet: wrapping models entries (lines ${keyLine + 2}..${last + 1}) with markers`,
      );
      edits.push({
        at: keyLine + 1,
        deleteCount: last - keyLine,
        block: markerBlock,
      });
    }
    summary.push({ provider: p.name, added: ids.length });
    console.log(`  + would write ${ids.length} model(s): ${ids.join(", ")}`);
    // The whole marker block becomes exactly the freshly fetched ids, so the
    // chain check below must validate against that post-seed set.
    p.modelIds = new Set(ids);
  }

  // Chain consistency check (against the seeded model sets plus the pi-ai
  // catalog for catalog-backed routes, which have no `models:` list here).
  console.log("\n=== chain consistency ===");
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
