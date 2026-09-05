#!/usr/bin/env -S deno run --allow-read --allow-net --allow-env
// scripts/rank-chains.ts
//
// Read-only chain rank wizard. It never writes settings.
// Flow: pnpm sync-models && pnpm rank-chains
//
// It parses any provider config, ranks served models by live
// Artificial Analysis skill and cost, then prints candidate chains
// plus a paste-ready agent prompt.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MepCLI, Pipeline } from "npm:mepcli@1.4.0";
import * as YAML from "npm:yaml@2.9.0";

// TRAINS_ON_DATA blocks models that train on user data.
// Grow this list when a new training model appears.
// Seed: Muse series only.
const TRAINS_ON_DATA = [/muse-spark/i];

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const AA_URL = "https://artificialanalysis.ai/api/v2/data/llms/models";
const AA_CREDIT = "https://artificialanalysis.ai/";
const CREDENTIALS_PATH = join(Deno.env.get("HOME") ?? "", ".dsh", ".credentials.yaml");

interface Strategy {
  name: string;
  explain: string;
}

const STRATEGIES: Strategy[] = [
  {
    name: "max skill",
    explain: "Smartest models first, cost ignored. Best for the orchestrator chain.",
  },
  {
    name: "min cost",
    explain: "Cheapest models first, skill ignored. Best when budget beats brains.",
  },
  {
    name: "best ratio",
    explain: "Most skill per dollar first. The value pick when you want both.",
  },
  {
    name: "balanced",
    explain: "Half skill, half savings. Middle ground when no priority wins.",
  },
  {
    name: "free guard first",
    explain:
      "Free and subscription ids first, usage-billed ids after. Spend stays zero until free rungs fail.",
  },
];

interface AaRow {
  slug?: unknown;
  name?: unknown;
  evaluations?: { artificial_analysis_intelligence_index?: unknown };
  pricing?: { price_1m_input_tokens?: unknown; price_1m_output_tokens?: unknown };
}

interface Candidate {
  id: string;
  slug: string;
  name: string;
  skill: number | null;
  cost: { inPrice: number; outPrice: number; blended: number } | null;
}

interface ProviderConfig {
  path: string;
  routes: string[];
  candidates: Candidate[];
  entries: Candidate[];
  unmatched: string[];
}

// One named Pipeline step per wizard stage, in run order.
interface RankCtx extends Record<string, unknown> {
  "provider config": ProviderConfig;
  "chain description": string;
  "skill targets": string[];
  "cost targets": string[];
  "provider rank": string[];
  "training flag": boolean;
  "model count": number;
  confirm: boolean;
  "print chains": Record<string, Candidate[]>;
  "agent prompt": string;
}

function settingsPath(): string {
  const argv = Deno.args;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--settings" && argv[i + 1]) return argv[i + 1];
    if (argv[i].startsWith("--settings=")) return argv[i].slice("--settings=".length);
  }
  return Deno.env.get("SETTINGS_YAML") ?? join(ROOT, "home", "settings.yaml");
}

function credentialsKey(name: string): string | null {
  let text: string;
  try {
    text = readFileSync(CREDENTIALS_PATH, "utf8");
  } catch {
    return null;
  }
  const re = new RegExp(`^${name}:\\s*["']?([^"'\\n]+)["']?\\s*$`, "m");
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

function resolveKey(): string | null {
  return Deno.env.get("ARTIF_ANALYSIS_API_KEY") ?? credentialsKey("ARTIF_ANALYSIS_API_KEY") ?? null;
}

// Normal form for fuzzy match: lower case, letters and digits only.
function norm(s: unknown): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Strip route suffixes that do not change the base model:
// -contributor, -free, :free. Vision tags stay: they mark real variants.
function stripSuffix(tail: string): string {
  let t = tail;
  t = t.replace(/:free$/i, "");
  t = t.replace(/-contributor$/i, "");
  t = t.replace(/-free$/i, "");
  return t;
}

// Last path segment of a served id, e.g. "z-ai/glm-5.3-flash" -> "glm-5.3-flash".
function servedTail(ref: string): string {
  const i = ref.lastIndexOf("/");
  return i >= 0 ? ref.slice(i + 1) : ref;
}

// Index AA rows by normalized slug and normalized name.
function buildAaIndex(rows: AaRow[]): Map<string, AaRow> {
  const byNorm = new Map<string, AaRow>();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const key of [row.slug, row.name]) {
      if (typeof key !== "string" || !key) continue;
      const n = norm(key);
      if (n && !byNorm.has(n)) byNorm.set(n, row);
    }
  }
  return byNorm;
}

// Match one served id to one AA row. Try exact tail first,
// then the suffix-stripped tail. Return the row or null.
function matchServed(ref: string, byNorm: Map<string, AaRow>): AaRow | null {
  const tail = servedTail(ref);
  const exact = byNorm.get(norm(tail));
  if (exact) return exact;
  const stripped = stripSuffix(tail);
  if (stripped !== tail) {
    const hit = byNorm.get(norm(stripped));
    if (hit) return hit;
  }
  return null;
}

function readDoc(path: string): any {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    err(`rank-chains: bad settings path ${path}. Pass --settings <path> or set SETTINGS_YAML.`);
    Deno.exit(1);
  }
  try {
    return YAML.parse(text!);
  } catch (e) {
    err(`rank-chains: bad settings yaml ${path}: ${(e as Error).message}`);
    Deno.exit(1);
  }
}

function providerRoutes(doc: any): string[] {
  const providers = doc?.["llm-pi-ai"]?.providers ?? {};
  return Object.keys(providers).sort();
}

function allChainRefs(doc: any): string[] {
  const chains = doc?.profile?.chains ?? {};
  const refs: string[] = [];
  for (const node of Object.values(chains) as any[]) {
    if (!Array.isArray(node)) continue;
    for (const item of node) {
      if (typeof item === "string" && !item.startsWith("chain:")) refs.push(item);
      else if (item && typeof item === "object") {
        if (typeof item.provider === "string" && typeof item.model === "string") {
          refs.push(`${item.provider}/${item.model}`);
        }
      }
    }
  }
  return refs;
}

// Every model id the set up providers serve, as "provider/id" strings.
// Providers with no models list contribute their chain-mentioned ids.
function servedIds(doc: any): string[] {
  const set = new Set<string>();
  const providers = doc?.["llm-pi-ai"]?.providers ?? {};
  for (const [pname, p] of Object.entries(providers) as Array<[string, any]>) {
    const models = p?.models;
    if (Array.isArray(models)) {
      for (const m of models) {
        if (typeof m?.id === "string" && m.id) set.add(`${pname}/${m.id}`);
      }
    }
  }
  for (const ref of allChainRefs(doc)) {
    const prov = ref.slice(0, ref.indexOf("/"));
    if (providers[prov] && !Array.isArray(providers[prov]?.models)) set.add(ref);
  }
  return [...set].sort();
}

async function fetchModels(key: string): Promise<AaRow[]> {
  const res = await fetch(AA_URL, { headers: { "x-api-key": key } });
  if (!res.ok) throw new Error(`Artificial Analysis HTTP ${res.status}`);
  const json = await res.json();
  const rows = Array.isArray(json) ? json : (json.data ?? json.models ?? []);
  if (!Array.isArray(rows)) throw new Error("Artificial Analysis response had no model array");
  return rows;
}

function skillOf(row: AaRow): number | null {
  const v = row?.evaluations?.artificial_analysis_intelligence_index;
  return typeof v === "number" ? v : null;
}

function costOf(row: AaRow): Candidate["cost"] {
  const i = row?.pricing?.price_1m_input_tokens;
  const o = row?.pricing?.price_1m_output_tokens;
  if (typeof i !== "number" || typeof o !== "number") return null;
  return { inPrice: i, outPrice: o, blended: i + o };
}

function isFreeRef(ref: string): boolean {
  const slash = ref.indexOf("/");
  const rest = slash >= 0 ? ref.slice(slash + 1) : ref;
  return /-free$|:free$/i.test(rest);
}

function trainsOnData(ref: string): boolean {
  return TRAINS_ON_DATA.some((re) => re.test(ref));
}

const USE_COLOR = Deno.stdout.isTerminal() && !Deno.env.get("NO_COLOR");
const BOLD = USE_COLOR ? "\x1b[1m" : "";
const DIM = USE_COLOR ? "\x1b[2m" : "";
const RESET = USE_COLOR ? "\x1b[0m" : "";
const BLUE = USE_COLOR ? "\x1b[34m" : "";
const GREEN = USE_COLOR ? "\x1b[32m" : "";
const YELLOW = USE_COLOR ? "\x1b[33m" : "";
const RED = USE_COLOR ? "\x1b[31m" : "";
const CYAN = USE_COLOR ? "\x1b[36m" : "";

function err(text: string): void {
  console.error(`${RED}${text}${RESET}`);
}

function clear(): void {
  if (Deno.stdout.isTerminal()) console.clear();
}

function notEmpty(v: string): string | boolean {
  return v.trim() ? true : "Empty answer. Try again.";
}

function skillDesc(e: Candidate): string {
  return `skill ${YELLOW}${e.skill ?? "?"}${RESET}, ${GREEN}$${e.cost?.blended ?? "?"}${RESET} per 1M in+out, e.g. ${CYAN}${e.id}${RESET}`;
}

function costDesc(e: Candidate): string {
  return `${GREEN}$${e.cost?.blended ?? "?"}${RESET} per 1M in+out, skill ${YELLOW}${e.skill ?? "?"}${RESET}, e.g. ${CYAN}${e.id}${RESET}`;
}

function buildPool(candidates: Candidate[], allowTraining: boolean): Candidate[] {
  return candidates.filter((c) => (allowTraining ? true : !trainsOnData(c.id)));
}

function poolBounds(pool: Candidate[]): {
  skillMin: number;
  skillMax: number;
  costMin: number;
  costMax: number;
} {
  const skills = pool.map((c) => c.skill).filter((v): v is number => typeof v === "number");
  const costs = pool.map((c) => c.cost?.blended).filter((v): v is number => typeof v === "number");
  return {
    skillMin: skills.length ? Math.min(...skills) : 0,
    skillMax: skills.length ? Math.max(...skills) : 1,
    costMin: costs.length ? Math.min(...costs) : 0,
    costMax: costs.length ? Math.max(...costs) : 1,
  };
}

function normSkillOf(c: Candidate, min: number, max: number): number {
  if (typeof c.skill !== "number") return 0;
  if (max <= min) return 1;
  return (c.skill - min) / (max - min);
}

function normCostOf(c: Candidate, min: number, max: number): number {
  const b = c.cost?.blended;
  if (typeof b !== "number") return 1;
  if (max <= min) return 0;
  return (b - min) / (max - min);
}

function ratioOf(c: Candidate): number {
  const s = c.skill ?? 0;
  const b = c.cost?.blended;
  if (typeof b !== "number" || b <= 0) return typeof c.skill === "number" ? c.skill : 0;
  return s / b;
}

function sortChain(pool: Candidate[], providerRank: string[], mode: string): Candidate[] {
  const provIdx = (id: string) => {
    const prov = id.slice(0, id.indexOf("/"));
    const i = providerRank.indexOf(prov);
    return i < 0 ? 999 : i;
  };
  const { skillMin, skillMax, costMin, costMax } = poolBounds(pool);
  const arr = [...pool];
  if (mode === "max skill") {
    arr.sort(
      (a, b) =>
        normSkillOf(b, skillMin, skillMax) - normSkillOf(a, skillMin, skillMax) ||
        provIdx(a.id) - provIdx(b.id),
    );
  } else if (mode === "min cost") {
    arr.sort(
      (a, b) =>
        normCostOf(a, costMin, costMax) - normCostOf(b, costMin, costMax) ||
        provIdx(a.id) - provIdx(b.id),
    );
  } else if (mode === "best ratio") {
    arr.sort((a, b) => ratioOf(b) - ratioOf(a) || provIdx(a.id) - provIdx(b.id));
  } else if (mode === "balanced") {
    const score = (c: Candidate) =>
      0.5 * normSkillOf(c, skillMin, skillMax) + 0.5 * (1 - normCostOf(c, costMin, costMax));
    arr.sort((a, b) => score(b) - score(a) || provIdx(a.id) - provIdx(b.id));
  } else {
    arr.sort((a, b) => {
      const af = isFreeRef(a.id) ? 0 : 1;
      const bf = isFreeRef(b.id) ? 0 : 1;
      if (af !== bf) return af - bf;
      return (b.skill ?? -1) - (a.skill ?? -1) || provIdx(a.id) - provIdx(b.id);
    });
  }
  return arr;
}

function prioritizeTargets(sorted: Candidate[], targets: string[]): Candidate[] {
  if (!targets.length) return sorted;
  const want = new Set(targets);
  return [...sorted.filter((c) => want.has(c.slug)), ...sorted.filter((c) => !want.has(c.slug))];
}

function printChains(chains: Record<string, Candidate[]>, unmatched: string[]): void {
  const explainOf = (name: string): string =>
    STRATEGIES.find((s) => s.name === name)?.explain ?? "";
  console.log(`\n${BOLD}Candidate chains:${RESET}`);
  for (const [name, list] of Object.entries(chains)) {
    console.log(`\n${BOLD}${GREEN}## ${name}${RESET}`);
    console.log(`${DIM}${explainOf(name)}${RESET}`);
    if (!list.length) console.log("- none");
    for (const c of list) {
      console.log(
        `- ${CYAN}${c.id}${RESET} (slug ${CYAN}${c.slug}${RESET}, skill ${YELLOW}${c.skill ?? "?"}${RESET}, cost ${GREEN}$${c.cost?.blended ?? "?"}${RESET})`,
      );
    }
  }
  console.log(`\n${YELLOW}Unmatched served ids (no live AA row): ${unmatched.length}${RESET}`);
  for (const u of unmatched.slice(0, 10)) console.log(`- ${DIM}${u}${RESET}`);
  console.log(`\n${DIM}Data: ${AA_CREDIT} (one API call per run).${RESET}`);
}

function buildChains(
  deduped: Candidate[],
  providerRank: string[],
  skill: string[],
  cost: string[],
  count: number,
): Record<string, Candidate[]> {
  const both = [...skill, ...cost];
  return {
    "max skill": prioritizeTargets(sortChain(deduped, providerRank, "max skill"), skill).slice(
      0,
      count,
    ),
    "min cost": prioritizeTargets(sortChain(deduped, providerRank, "min cost"), cost).slice(
      0,
      count,
    ),
    "best ratio": prioritizeTargets(sortChain(deduped, providerRank, "best ratio"), both).slice(
      0,
      count,
    ),
    balanced: prioritizeTargets(sortChain(deduped, providerRank, "balanced"), both).slice(0, count),
    "free guard first": prioritizeTargets(
      sortChain(deduped, providerRank, "free guard first"),
      both,
    ).slice(0, count),
  };
}

async function main(): Promise<void> {
  const path = settingsPath();
  const doc = readDoc(path);
  const routes = providerRoutes(doc);

  if (!routes.length) {
    err("rank-chains: no provider routes found under llm-pi-ai.providers.");
    Deno.exit(1);
  }

  const key = resolveKey();
  if (!key) {
    err(
      "rank-chains: missing ARTIF_ANALYSIS_API_KEY. Set ARTIF_ANALYSIS_API_KEY in the env or in ~/.dsh/.credentials.yaml as `ARTIF_ANALYSIS_API_KEY: <value>`.",
    );
    Deno.exit(1);
  }

  // Step counter tracks executed steps, so the two conditional
  // steps never skew the display on a no answer.
  let done = 0;
  const pipe = new Pipeline<RankCtx>({
    onStepStart: (meta) => {
      clear();
      done += 1;
      console.log(`\n${BOLD}${BLUE}--- Step ${done}: ${meta.name ?? "step"} ---${RESET}`);
    },
  });

  const ctx = await pipe
    .step("provider config", async () => {
      console.log(`${DIM}Settings: ${path}${RESET}`);
      console.log(`Routes: ${CYAN}${routes.join(", ")}${RESET}`);
      let rows: AaRow[];
      try {
        rows = await fetchModels(key);
      } catch (e) {
        err(`rank-chains: Artificial Analysis fetch failed: ${(e as Error).message}`);
        Deno.exit(1);
      }
      // Config-agnostic pool: every served id that matches a live AA row.
      const byNorm = buildAaIndex(rows!);
      const candidates: Candidate[] = [];
      const unmatched: string[] = [];
      for (const id of servedIds(doc)) {
        const row = matchServed(id, byNorm);
        if (!row || typeof row.slug !== "string") {
          unmatched.push(id);
          continue;
        }
        candidates.push({
          id,
          slug: row.slug,
          name: (row.name as string) ?? row.slug,
          skill: skillOf(row),
          cost: costOf(row),
        });
      }
      if (!candidates.length) {
        err("rank-chains: no served ids match live Artificial Analysis rows.");
        Deno.exit(1);
      }
      // One row per slug for the target pickers.
      const perSlug = new Map<string, Candidate>();
      for (const c of candidates) {
        if (!perSlug.has(c.slug)) perSlug.set(c.slug, c);
      }
      return { path, routes, candidates, entries: [...perSlug.values()], unmatched };
    })
    .step("chain description", async () => {
      return await MepCLI.text({
        message: "Describe the chain:",
        placeholder: "personal subagent chain",
        validate: notEmpty,
      });
    })
    .step("skill targets", async (ctx) => {
      const offer = [...ctx["provider config"].entries].sort(
        (a, b) => (b.skill ?? -1) - (a.skill ?? -1),
      );
      return await MepCLI.multiSelect<string>({
        message: "Which models lead on skill?",
        choices: offer.map((e) => ({ title: e.slug, value: e.slug, description: skillDesc(e) })),
        min: 1,
      });
    })
    .step("cost targets", async (ctx) => {
      const offer = [...ctx["provider config"].entries].sort(
        (a, b) => (a.cost?.blended ?? 9999) - (b.cost?.blended ?? 9999),
      );
      return await MepCLI.multiSelect<string>({
        message: "Which models lead on cost?",
        choices: offer.map((e) => ({ title: e.slug, value: e.slug, description: costDesc(e) })),
        min: 1,
      });
    })
    .step("provider rank", async (ctx) => {
      return await MepCLI.sort({
        message: "Rank providers first to last:",
        items: ctx["provider config"].routes,
      });
    })
    .step("training flag", async () => {
      return await MepCLI.confirm({
        message: "Is training on user data ok? (no filters out: Muse series)",
      });
    })
    .step("model count", async () => {
      return await MepCLI.number({
        message: "How many models per chain?",
        min: 2,
        max: 12,
        initial: 8,
      });
    })
    .step("confirm", async (ctx) => {
      console.log(`Chain: ${CYAN}${ctx["chain description"]}${RESET}`);
      console.log(`Skill: ${CYAN}${ctx["skill targets"].join(", ") || "none"}${RESET}`);
      console.log(`Cost: ${CYAN}${ctx["cost targets"].join(", ") || "none"}${RESET}`);
      console.log(`Rank: ${CYAN}${ctx["provider rank"].join(" > ")}${RESET}`);
      console.log(`Training ok: ${YELLOW}${ctx["training flag"] ? "yes" : "no"}${RESET}`);
      console.log(`Count: ${GREEN}${ctx["model count"]}${RESET}`);
      return await MepCLI.confirm({ message: "Print chains?" });
    })
    .stepIf(
      (ctx) => ctx["confirm"],
      "print chains",
      async (ctx) => {
        const cfg = ctx["provider config"];
        const rank = ctx["provider rank"];
        const pool = buildPool(cfg.candidates, ctx["training flag"]);
        if (!pool.length) {
          console.log(`${YELLOW}No models remain after the training filter.${RESET}`);
          return {};
        }
        // Dedupe pool to one row per slug, keeping the best provider-ranked id.
        const rankPos = (id: string) => {
          const i = rank.indexOf(id.slice(0, id.indexOf("/")));
          return i < 0 ? 999 : i;
        };
        const best = new Map<string, Candidate>();
        for (const c of pool) {
          const cur = best.get(c.slug);
          if (!cur || rankPos(c.id) < rankPos(cur.id)) best.set(c.slug, c);
        }
        const chains = buildChains(
          [...best.values()],
          rank,
          ctx["skill targets"],
          ctx["cost targets"],
          ctx["model count"],
        );
        printChains(chains, cfg.unmatched);
        return chains;
      },
    )
    .stepIf(
      (ctx) => ctx["confirm"] && Object.keys(ctx["print chains"] ?? {}).length > 0,
      "agent prompt",
      async (ctx) => {
        const cfg = ctx["provider config"];
        const chains = ctx["print chains"];
        const chosen = await MepCLI.select<string>({
          message: "Which strategy wins?",
          choices: STRATEGIES.map((s) => ({
            title: s.name,
            value: s.name,
            description: s.explain,
          })),
        });
        const picked = chains[chosen] ?? [];
        // Paste block stays plain text: no color codes, so a redirect
        // to file keeps the prompt copy clean.
        const desc = ctx["chain description"];
        const rankText = ctx["provider rank"].join(" > ");
        const skillText = ctx["skill targets"].join(", ") || "none";
        const costText = ctx["cost targets"].join(", ") || "none";
        const trainingText = ctx["training flag"] ? "yes" : "no";
        const count = ctx["model count"];
        console.log("\n```text");
        console.log(`Chain to edit: "${desc}" in ${cfg.path} profile.chains.`);
        console.log(`Resolve that description to the matching chain key.`);
        console.log(`Use strategy: ${chosen}.`);
        console.log(`Provider rank: ${rankText}.`);
        console.log(`Skill targets: ${skillText}.`);
        console.log(`Cost targets: ${costText}.`);
        console.log(`Training on user data ok: ${trainingText}.`);
        console.log(`Keep ${count} rows in this order:`);
        for (const c of picked) console.log(`- ${c.id}`);
        console.log(
          "Change chains only. Keep the change read only until the user approves output.",
        );
        console.log("```");
        return chosen;
      },
    )
    .run();

  if (!ctx["confirm"]) {
    console.log("Stopped. No chains printed.");
  }
}

main().catch((e) => {
  err(`rank-chains: ${(e as Error).message}`);
  Deno.exit(1);
});
