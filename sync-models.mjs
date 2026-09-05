#!/usr/bin/env node
// sync-models.mjs
//
// Manual model-seed tool for the personal dsh bundle.
//
// What it does:
//   1. Reads home/settings.yaml (the repo source of truth) with the `yaml`
//      package, keeping the source CST so comments and formatting survive.
//   2. For the seeded providers, calls {baseURL}/models and learns the model
//      ids the provider actually serves. A route listed in CATALOG_EXCLUDED
//      cuts the catalog's own ids but keeps chain-mentioned ids the live
//      endpoint serves, so chain refs never warn on a dup id.
//   3. For every seeded provider, regenerates the entire
//      `models:` sequence between a `# sync-models:begin` / `# sync-models:end`
//      marker pair from a fresh {baseURL}/models fetch, on every run. It never
//      appends just the missing ids: the whole marked block is replaced from
//      scratch. Every other provider and everything outside the markers is left
//      byte-identical. Entries carry contextWindow, maxTokens, defaultInput
//      (image when models.dev declares the model as vision-capable), and
//      reasoningEfforts derived from models.dev's per-level reasoning flags.
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
// Env:
//   SETTINGS_YAML   path to the settings file (default: ./home/settings.yaml)
//
// Credentials:
//   API keys come from the environment first (`apiKeyEnv` per provider). When
//   unset, the key is read from ~/.dsh/.credentials.yaml (same file the dsh
//   credentials service stores). A missing key is not fatal: the provider is
//   skipped with a warning, exactly like a failed fetch.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as YAML from "yaml";

const HERE = dirname(fileURLToPath(import.meta.url));
const SETTINGS = process.env.SETTINGS_YAML ?? join(HERE, "home", "settings.yaml");

const DRY_RUN = process.argv.includes("--dry-run") || process.argv.includes("-n");

// Fallback credential store: the dsh credentials domain. Flat YAML mapping
// NAME -> secret, optionally quoted. Only consulted when the env var named by
// the provider's `apiKeyEnv` is unset. A missing or unreadable file just means
// no fallback keys.
const CREDENTIALS_PATH = join(process.env.HOME ?? "", ".dsh", ".credentials.yaml");

/** Read one key from ~/.dsh/.credentials.yaml, or null when absent. */
function credentialsKey(name) {
  let text;
  try {
    text = readFileSync(CREDENTIALS_PATH, "utf8");
  } catch {
    return null;
  }
  const re = new RegExp(`^${name}:\\s*["']?([^"'\\n]+)["']?\\s*$`, "m");
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

// Single source of model metadata: models.dev. The response is a JSON object
// keyed by provider id, with each provider's `models` mapping model id to a
// record carrying `modalities.input`, `limit.context`, `limit.output`, and
// `reasoning_options`. We fetch it once per run and index it.
const MODELS_DEV_URL = "https://models.dev/api.json";

// Gateway-extras providers: a hand-declared route seeded from the live
// gateway MINUS the models.dev provider's model ids for a catalog route, so
// the block stays a small supplementary catalog. Key = the hand-declared
// provider route; value = the models.dev provider whose model ids are cut.
// Exemption: an id named by profile.chains for that route AND served live by
// it stays seeded even when the catalog ships it, so chain refs never warn.
// Billing differs per route, so that dup is valid.
const CATALOG_EXCLUDED = { "opencode-zen": "opencode", "opencode-go": "opencode" };
// Catalog routes: the settings block serves the installed models.dev provider
// as-is (no `models:` list to seed). The seed loop must not touch them, and
// the chain check verifies their refs against the models.dev provider.
const CATALOG_ROUTES = new Set(["opencode"]);

// Curated vision models: neither the live /models endpoint (it exposes no
// modality field) nor models.dev reliably advertise image input for these
// (too new or gateway-specific ids), yet the upstream gateway serves them
// with image input. Without this the `see` plugin vision gate would deny
// `read_image` for agents routed to them. sync-models emits
// `defaultInput: [text, image]` for them on every run, so the regenerated
// block keeps it and the runtime recognizes them as vision-capable. Add to
// this set as new vision models appear.
const VISION_MODELS = new Set([
  // Kept because the first-party vendor entry disagrees with the gateway.
  // alibaba reports Qwen3.7-Max as text-only while 28 reseller providers
  // report image input. The gateway serves images, so the override wins.
  "Qwen/Qwen3.7-Max",
  // Kept because only a tier-3 reseller matched these two, not the vendor.
  // A reseller entry is weaker evidence, so do not depend on it for a gate
  // that decides whether `read_image` is allowed.
  "Qwen/Qwen3.8-27B",
  "Qwen/Qwen3.7-Flash",
  // Dropped from this list because the models.dev first-party vendor entry now
  // declares image input for them, which is the source we trust most:
  // Qwen3.8-Max, Qwen3.8-Flash, Qwen3.7-Plus, Qwen3.6-Plus (all alibaba), and
  // z-ai/glm-5.3-flash (an exact `glm-5.3-flash` key under zai reporting
  // text, image, video, pdf). Re-add an entry here if a sync ever drops its
  // `defaultInput: [text, image]`.
]);

// Map our provider route to the models.dev provider we should look at first.
const TIER1_ROUTE = { "opencode-zen": "opencode", "opencode-go": "opencode" };
// Map a regex of model id to the first-party vendor's models.dev provider.
// Every value is confirmed present in models.dev. There is deliberately no
// tencent entry: models.dev has no tencent provider.
const TIER2_PREFIX = [
  ["^claude-", "anthropic"],
  ["^gpt-", "openai"],
  ["^z-ai/", "zai"],
  ["^zai-org/", "zai"],
  ["^Qwen/", "alibaba"],
  ["^deepseek/", "deepseek"],
  ["^moonshotai/", "moonshotai"],
  ["^MiniMaxAI/", "minimax"],
  ["^minimax/", "minimax"],
  ["^google/", "google"],
  ["^xai/", "xai"],
  ["^meta/", "meta"],
  ["^stepfun/", "stepfun"],
  ["^xiaomi/", "xiaomi"],
  ["^nvidia/", "nvidia"],
  ["^sakana/", "sakana"],
  ["^poolside/", "poolside"],
  ["^thinkingmachines/", "thinkingmachines"],
];
const TIER2_PREFIX_RE = TIER2_PREFIX.map(([pat, pid]) => [new RegExp(pat), pid]);

let modelsDevIndex = null;

function indexProviderModels(models) {
  const byId = new Map();
  const norm = new Map();
  for (const [id, m] of Object.entries(models || {})) {
    if (!m || typeof m !== "object") continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(m);
    const n = id.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!norm.has(n)) norm.set(n, []);
    norm.get(n).push(m);
  }
  return { byId, norm };
}

async function fetchModelsDev() {
  const res = await fetch(MODELS_DEV_URL);
  if (!res.ok) throw new Error(`models.dev HTTP ${res.status}`);
  const json = await res.json();
  const providers = {};
  for (const [pid, p] of Object.entries(json || {})) {
    if (!p || typeof p !== "object") continue;
    providers[pid] = indexProviderModels(p.models);
  }
  const unionById = new Map();
  const unionNorm = new Map();
  for (const idx of Object.values(providers)) {
    for (const [id, list] of idx.byId) {
      if (!unionById.has(id)) unionById.set(id, []);
      unionById.get(id).push(...list);
    }
    for (const [n, list] of idx.norm) {
      if (!unionNorm.has(n)) unionNorm.set(n, []);
      unionNorm.get(n).push(...list);
    }
  }
  return { providers, union: { byId: unionById, norm: unionNorm } };
}

// Within a single index, try exact id, normalized id, exact tail-after-slash,
// normalized tail. The first strategy that yields a non-empty list wins.
function matchId(idx, id) {
  const candidates = [
    idx.byId.get(id),
    idx.norm.get(id.toLowerCase().replace(/[^a-z0-9]/g, "")),
  ];
  const slash = id.indexOf("/");
  const tail = slash >= 0 ? id.slice(slash + 1) : id;
  candidates.push(idx.byId.get(tail));
  candidates.push(idx.norm.get(tail.toLowerCase().replace(/[^a-z0-9]/g, "")));
  for (const list of candidates) if (list && list.length) return list[0];
  return null;
}

// Three-tier ordered lookup. First hit wins, never unioned across tiers.
function lookupModelsDev(id, db, routeProviderId) {
  if (!db) return null;
  const t1 = TIER1_ROUTE[routeProviderId];
  if (t1 && db.providers[t1]) {
    const hit = matchId(db.providers[t1], id);
    if (hit) return { entry: hit, tier: 1 };
  }
  for (const [re, pid] of TIER2_PREFIX_RE) {
    if (!re.test(id)) continue;
    if (!db.providers[pid]) continue;
    const hit = matchId(db.providers[pid], id);
    if (hit) return { entry: hit, tier: 2 };
  }
  const hit = matchId(db.union, id);
  if (hit) return { entry: hit, tier: 3 };
  return null;
}

function isVisionEntry(entry) {
  const mods = entry?.modalities?.input;
  return Array.isArray(mods) && mods.includes("image");
}

// Build a pi-ai `reasoningEfforts` dict from one models.dev entry, taking
// only `effort` reasoning options. `toggle` and `budget_tokens` are ignored.
// "none" becomes the pi-ai "off" level with a null wire value. The caller is
// responsible for the "only off" suppression rule.
function reasoningEffortsForEntry(entry) {
  if (!entry) return null;
  const opts = Array.isArray(entry.reasoning_options) ? entry.reasoning_options : null;
  if (!opts) return null;
  const out = {};
  for (const opt of opts) {
    if (!opt || opt.type !== "effort") continue;
    const values = Array.isArray(opt.values) ? opt.values : [];
    for (const v of values) {
      if (typeof v !== "string") continue;
      const key = v === "none" ? "off" : v;
      out[key] = v === "none" ? null : v;
    }
  }
  return Object.keys(out).length ? out : null;
}

/** The model ids models.dev lists for one provider. */
async function fetchCatalogModelIds(providerId) {
  if (!modelsDevIndex) throw new Error("models.dev metadata not loaded");
  const idx = modelsDevIndex.providers[providerId];
  if (!idx) throw new Error(`models.dev has no provider ${providerId}`);
  return new Set(idx.byId.keys());
}
// The seeded providers get their entire `models:` sequence
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
const SEEDED_PROVIDERS = new Set(["command-code", "opencode-zen", "opencode-go", "meridian", "zai"]);
// Model-listing path for a provider whose endpoint is not at `{baseURL}/models`.
// meridian proxies the Anthropic API and serves an OpenAI-shaped list at
// /v1/models; a GET on /models returns "Endpoint not supported".
const LISTING_PATH = { meridian: "/v1/models" };

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
  // Refs that reach the `see` tool. see.ts picks chain `see` (personal) or
  // `see-<profile>`, so only those chains must resolve to a vision model.
  // Every other chain is allowed to be text-only.
  const visionChainRefs = [];
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
        keyOffset: pair.key.srcToken.offset,
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
      const chainName = pair.key?.value;
      const needsVision = typeof chainName === "string" && /^see(-|$)/.test(chainName);
      const routes = chain?.get?.("routes");
      if (routes && routes.items) {
        for (const r of routes.items) {
          const prov = r?.get?.("provider");
          const model = r?.get?.("model");
          if (typeof prov === "string" && typeof model === "string") {
            chainRefs.push(`${prov}/${model}`);
            if (needsVision) visionChainRefs.push(`${prov}/${model}`);
          }
        }
      } else if (chain && chain.items) {
        // A plain list of "provider/model" or "chain:name" strings.
        for (const item of chain.items) {
          const val = item?.value;
          if (typeof val === "string" && val.includes("/") && !val.startsWith("chain:")) {
            chainRefs.push(val);
            if (needsVision) visionChainRefs.push(val);
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

  return { providers, byName, chainRefs, visionChainRefs, modelSyncRange };
}

// Locate a provider's `models:` block as line indices: the line of the
// `models:` key and the last line of the block. The block ends at the first
// non-blank line whose indentation drops below the models value indent (6);
// if none appears, the block runs to EOF. This line scan is stable even when
// marker comments are present inside the block, which the CST seq range is
// not. Returns null when the provider has no `models:` list.
function modelsBlockLines(providerMap, text) {
  const pair = providerMap?.items?.find((p) => p.key?.value === "models");
  // Only the key must exist. A `models:` key whose value is empty (the key
  // followed by nothing but marker comments) still parses to a null value, and
  // treating that as "no block" would make the caller insert a second
  // `models:` key beside the first. The line scan below finds the real extent
  // either way.
  if (!pair) return null;
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

// Line extent of a whole provider block: its key line through its last
// property line. A provider key sits at indent 4 and its properties at 6.
function providerBlockLines(p, text) {
  const lines = text.split("\n");
  const keyLine = lineOfOffset(text, p.keyOffset);
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
async function fetchModelIds(baseURL, apiKey, path = "/models") {
  const url = baseURL.replace(/\/+$/, "") + path;
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

// Display name for one model. models.dev carries a curated name ("Claude
// Sonnet 4.6"), which beats anything derived from the id: prettyName splits on
// dashes and turns `claude-sonnet-4-6` into "Claude Sonnet 4 6". Some entries
// carry a " (latest)" suffix that means nothing once the id is pinned, so drop
// it. Fall back to prettyName when models.dev has no entry.
function displayName(id, entry) {
  const n = entry?.name;
  if (typeof n === "string" && n.trim()) return n.replace(/\s*\(latest\)$/i, "").trim();
  return prettyName(id);
}

function prettyName(id) {
  const tail = id.includes("/") ? id.slice(id.lastIndexOf("/") + 1) : id;
  return tail
    .split(/[-_]/)
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}


function entryText(id, name, meta) {
  const out = [`      - id: ${id}`, `        name: ${name}`];
  if (meta) {
    if (typeof meta.contextWindow === "number")
      out.push(`        contextWindow: ${meta.contextWindow}`);
    if (typeof meta.maxTokens === "number") out.push(`        maxTokens: ${meta.maxTokens}`);
    // A models entry declares its modalities as `input`, NOT `defaultInput`.
    // `defaultInput` is a PROVIDER-level key that supplies the fallback for
    // entries that declare no `input` (dsh-llm-pi-ai `modelFields` vs
    // `profile`). Writing `defaultInput` on an entry is silently ignored, so
    // every model inherited its provider default instead.
    // Always emit `input`, text-only included. Leaving it off would make the
    // entry fall back to the provider default, and meridian defaults to
    // [text, image], which would report a text-only model as vision-capable.
    out.push(`        input:`, `        - text`);
    if (meta.image) out.push(`        - image`);
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
  const { providers, byName, chainRefs, visionChainRefs, modelSyncRange } =
    analyzeDocument(doc, text);
  // Chain-mentioned model ids per provider route. The catalog cut exempts
  // these when the live endpoint serves them.
  const chainByProvider = new Map();
  for (const ref of chainRefs) {
    const slash = ref.indexOf("/");
    if (slash < 0) continue;
    const prov = ref.slice(0, slash);
    const model = ref.slice(slash + 1);
    if (!chainByProvider.has(prov)) chainByProvider.set(prov, new Set());
    chainByProvider.get(prov).add(model);
  }
  const lines = text.split("\n");

  // Single source of metadata: models.dev. Fetched once and indexed.
  try {
    modelsDevIndex = await fetchModelsDev();
  } catch (e) {
    console.warn(`! could not fetch models.dev metadata: ${e.message}`);
  }

  // Counters and trackers for the dry-run report.
  const tierCounts = { 1: 0, 2: 0, 3: 0, none: 0 };
  const defaultInputChanges = { gained: 0, lost: 0 };
  // Map of `prov/model` -> vision result from the resolved tier alone
  // (true = image input declared, false = entry found but text-only,
  // null = no tier resolved the id). The chain warning pass flags refs
  // whose value is not true and that VISION_MODELS does not cover.
  const chainVision = new Map();

  const edits = []; // { at, deleteCount, block: string[] } in line space
  const summary = [];

  for (const p of providers) {
    if (CATALOG_ROUTES.has(p.name)) continue; // catalog route: never seeded
    if (!p.baseURL) continue;
    // SEEDED_PROVIDERS is the explicit allowlist, so it alone decides what gets
    // marker-region regeneration. Do not also gate on `api`: meridian speaks
    // anthropic-messages and still serves an OpenAI-shaped model list. Any
    // provider outside the allowlist is left byte-identical.
    if (!SEEDED_PROVIDERS.has(p.name)) continue;

    // Env var first, then the dsh credentials file fallback. Both may be
    // absent; fetchModelIds treats an absent key as an anonymous request and
    // the skip below reports the failure.
    const key = p.apiKeyEnv
      ? (process.env[p.apiKeyEnv] ?? credentialsKey(p.apiKeyEnv) ?? undefined)
      : undefined;
    const listPath = LISTING_PATH[p.name] ?? "/models";
    console.log(`\n→ ${p.name} (${p.baseURL.replace(/\/+$/, "")}${listPath})`);
    let ids;
    try {
      ids = await fetchModelIds(p.baseURL, key, listPath);
    } catch (e) {
      console.warn(`  ! skip: ${e.message}`);
      continue;
    }
    console.log(`  provider exposes ${ids.length} model id(s)`);
    // Gateway-extras: cut the catalog provider's own models so this route
    // only lists what the catalog does not ship, except chain-mentioned ids
    // the live endpoint serves: those stay seeded so chain refs never warn.
    // Fail closed: if the catalog cannot be resolved, do not seed, because
    // seeding everything would duplicate the catalog's models here.
    const excludeCatalog = CATALOG_EXCLUDED[p.name];
    if (excludeCatalog) {
      try {
        const catalogIds = await fetchCatalogModelIds(excludeCatalog);
        const mentioned = chainByProvider.get(p.name);
        ids = ids.filter((id) => !catalogIds.has(id) || (mentioned && mentioned.has(id)));
        const exempt = ids.filter((id) => catalogIds.has(id)).length;
        console.log(`  excluding ${catalogIds.size} catalog model id(s) (${excludeCatalog}), ${exempt} chain-mentioned exempt`);
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
      // Single source: models.dev. Tier 1 is our route's own provider, tier 2
      // is the first-party vendor chosen from the model id prefix, tier 3 is
      // the union across every models.dev provider. First hit wins.
      const hit = lookupModelsDev(id, modelsDevIndex, p.name);
      tierCounts[hit ? hit.tier : "none"]++;
      const entry = hit?.entry;
      // models.dev reports vision via `modalities.input` containing "image".
      const tierVision = entry ? isVisionEntry(entry) : null;
      const vision = tierVision === true || VISION_MODELS.has(id);
      // Mirror the `see` plugin rule: a reasoning-efforts map that contains
      // only `off` is not real reasoning support, so emit nothing for it.
      let reasoningEfforts = reasoningEffortsForEntry(entry);
      if (reasoningEfforts && Object.keys(reasoningEfforts).length === 1 && "off" in reasoningEfforts) reasoningEfforts = null;
      const meta = {
        contextWindow: entry?.limit?.context,
        maxTokens: entry?.limit?.output,
        image: vision,
        reasoningEfforts,
      };
      block.push(...entryText(id, displayName(id, entry), meta));
      chainVision.set(`${p.name}/${id}`, tierVision);
      // Track the image-input delta against the file's current entries. Read
      // both key names: `input` is what we write now, `defaultInput` is the
      // wrong key older runs wrote, and a file mid-migration can hold either.
      const existing = p.models?.items?.find((it) => it?.get?.("id") === id);
      if (existing) {
        const di = existing.get("input") ?? existing.get("defaultInput");
        const hadImage = !!di?.items?.some((n) => n?.value === "image");
        if (vision && !hadImage) defaultInputChanges.gained++;
        if (!vision && hadImage) defaultInputChanges.lost++;
      }
    }
    const markerBlock = [MARKER_BEGIN, ...block, MARKER_END];

    const blockLines = modelsBlockLines(p.map, text);
    // A gateway-extras route whose extras set is empty leaves nothing to
    // declare. pi-ai rejects any provider that resolves no models ("resolves
    // no models; the installed catalog does not describe this route"), and the
    // schema is no help: it coerces a null `models:` to `[]`, then the
    // emptiness check runs later and fails. Removing only the `models:` key
    // does not save it either, because the provider still resolves nothing.
    if (ids.length === 0) {
      // Delete the WHOLE provider block, not just its `models:` key. pi-ai
      // rejects any provider that resolves no models, so a provider left
      // behind with no models breaks startup exactly as an empty list does.
      const pb = providerBlockLines(p, text);
      edits.push({
        at: pb.keyLine,
        deleteCount: pb.last - pb.keyLine + 1,
        block: [],
      });
      console.log(
        `  + would remove the whole ${p.name} provider block (catalog covers every id it serves)`,
      );
      summary.push({ provider: p.name, added: 0 });
      p.modelIds = new Set();
      byName.delete(p.name);
      continue;
    }

    if (!blockLines) {
      // The provider has no `models:` list yet. Create one directly after the
      // provider's last property line. providerBlockLines scans by indent, so
      // it returns the true last property line even when the provider is the
      // last one before the next sibling key (the CST-token end offset used
      // here before included the trailing newline and landed on the next
      // provider's key, which nested the new models block inside that
      // sibling and produced a duplicate `models:` key).
      const pb = providerBlockLines(p, text);
      const at = pb.last + 1;
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
    // verify against the models.dev provider instead. Keyed by the route
    // name, which is the models.dev provider id (e.g. `opencode`).
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
  // Warn for `see`-chain models that no tier declared as vision-capable and
  // that VISION_MODELS does not cover. Such a model would sync as text-only
  // and the `see` plugin would deny `read_image` for it. Other chains are
  // expected to hold text-only models, so they are not checked here.
  for (const ref of new Set(visionChainRefs)) {
    const slash = ref.indexOf("/");
    const model = slash >= 0 ? ref.slice(slash + 1) : "";
    // chainVision only gets an entry inside the seed loop, so this check also
    // covers catalog routes and external providers whose tier we never look up.
    if (!chainVision.has(ref)) continue; // not a seeded provider: skip
    if (chainVision.get(ref) === true) continue; // a tier declared image input
    if (VISION_MODELS.has(model)) continue; // curated override covers it
    console.warn(
      `  ⚠ chain references ${ref} but no metadata tier reports vision input`,
    );
    warnings++;
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
  console.log(
    `  metadata tiers: ${tierCounts[1]} tier-1, ${tierCounts[2]} tier-2, ${tierCounts[3]} tier-3, ${tierCounts.none} unmatched.`,
  );
  console.log(
    `  image input: ${defaultInputChanges.gained} gained, ${defaultInputChanges.lost} lost.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
