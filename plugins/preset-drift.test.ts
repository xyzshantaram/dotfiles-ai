import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { comparePresets, evaluate, parsePresetText, runCheck } from "../scripts/check-preset-drift.mjs";

const here = dirname(fileURLToPath(import.meta.url));

describe("the default allowlist path", () => {
  // Every other test in this file passes --allowlist explicitly, so until
  // #128 the DEFAULT path was exercised by nothing. That is precisely why
  // moving the file could have broken the live check silently: the suite
  // would stay green while `node scripts/check-preset-drift.mjs` with no
  // arguments read a path that no longer existed.
  it("resolves to a file that exists and parses as the expected shape", () => {
    const defaultPath = join(here, "..", "scripts", "preset-drift.json");
    const parsed = JSON.parse(readFileSync(defaultPath, "utf8")) as unknown;
    expect(Array.isArray(parsed)).toBe(true);
    for (const entry of parsed as Array<Record<string, unknown>>) {
      expect(typeof entry.row).toBe("string");
      expect(typeof entry.reason).toBe("string");
    }
  });

  it("is NOT in guards/, which bash-guard parses as rule files (#128)", () => {
    // guards/*.json must every one be a bash-guard rule file carrying
    // commands[]. This file is a different schema, so its presence there made
    // bash-guard warn on every single bash call. Keep it out.
    const guardsCopy = join(here, "..", "guards", "preset-drift.json");
    expect(() => readFileSync(guardsCopy, "utf8")).toThrow();
  });
});

const STD = `
- id: persona
  config:
    id: builtin-persona
    systemPrompt: |
      You are an agent.
- id: tool-bash
  config:
    id: builtin-bash
  agentOptions:
    provider: dsh-bash
- group: true
  id: delegation
  config:
    - id: tool-subagent
      config:
        id: builtin-subagent
        agentOptions:
          provider: subagent
          model: default
    - id: tool-subagent-fork
      config:
        id: builtin-subagent-fork
  isolate:
    tool-subagent: true
- id: tool-presentation
  config:
    id: builtin-presentation
    mode: !!js/function 'require("x").mode'
`;

// Mirrors STD with: agentOptions as a row-level sibling (loader-equivalent),
// one deliberate config divergence (persona systemPrompt), and tool-presentation dropped.
const AIDOS_EQUIV = `
- id: persona
  config:
    id: builtin-persona
    systemPrompt: |
      You are an aidos agent.
- id: tool-bash
  agentOptions:
    provider: dsh-bash
  config:
    id: builtin-bash
- group: true
  id: delegation
  config:
    - id: tool-subagent
      config:
        agentOptions:
          model: default
          provider: subagent
        id: builtin-subagent
    - id: tool-subagent-fork
      config:
        id: builtin-subagent-fork
  isolate:
    tool-subagent: true
- id: aidos-loader
  config:
    path: ./aidos-loader.js
`;

describe("parsePresetText", () => {
  it("resolves !!js tags to their literal source text", () => {
    const rows = parsePresetText(STD);
    const pres = rows.find((r) => r.id === "tool-presentation");
    expect(pres.config.mode).toBe('tag:yaml.org,2002:js/function require("x").mode');
  });
});

describe("comparePresets", () => {
  const findings = comparePresets(parsePresetText(STD), parsePresetText(AIDOS_EQUIV));

  it("reports missing and extra rows", () => {
    expect(findings.find((f) => f.key === "tool-presentation" && f.kind === "missing-in-aidos")).toBeTruthy();
    expect(findings.find((f) => f.key === "aidos-loader" && f.kind === "aidos-only")).toBeTruthy();
  });

  it("normalizes sibling agentOptions so placement alone is not drift", () => {
    expect(findings.find((f) => f.key === "tool-bash")).toBeUndefined();
  });

  it("compares group children under group-prefixed keys and key order does not matter", () => {
    expect(findings.find((f) => f.key === "delegation/tool-subagent")).toBeUndefined();
    expect(findings.find((f) => f.key === "delegation/tool-subagent-fork")).toBeUndefined();
  });

  it("flags real config divergence with both values", () => {
    const persona = findings.find((f) => f.key === "persona" && f.field === "systemPrompt");
    expect(persona?.kind).toBe("config");
    expect(persona?.detail).toContain("You are an aidos agent.");
  });

  it("flags disabled divergence with undefined normalized to false", () => {
    const stdRows = parsePresetText(STD);
    stdRows.find((r) => r.id === "tool-bash").disabled = true;
    const f = comparePresets(stdRows, parsePresetText(AIDOS_EQUIV)).find(
      (x) => x.key === "tool-bash" && x.kind === "disabled",
    );
    expect(f?.detail).toBe("standard=true aidos=false");
  });
});

describe("evaluate", () => {
  const findings = comparePresets(parsePresetText(STD), parsePresetText(AIDOS_EQUIV));

  it("names deliberate divergences and fails on the rest", () => {
    const allowlist = [
      { row: "persona", field: "systemPrompt", reason: "aidos-specific system prompt" },
      { row: "tool-presentation", reason: "presentation pinned to code mode in aidos" },
    ];
    const { failures, deliberate, stale } = evaluate(findings, allowlist);
    expect(deliberate.map((d) => d.key).sort()).toEqual(["persona", "tool-presentation"]);
    expect(stale).toEqual([]);
    expect(failures.map((f) => f.key)).toEqual(["aidos-loader"]);
  });

  it("does not let a field entry swallow a row-level finding", () => {
    const { failures } = evaluate(findings, [{ row: "tool-presentation", field: "mode", reason: "x" }]);
    expect(failures.find((f) => f.key === "tool-presentation")).toBeTruthy();
  });

  it("lets a wildcard field entry cover a row's config findings", () => {
    const { failures } = evaluate(findings, [
      { row: "persona", field: "*", reason: "aidos owns the whole persona row" },
    ]);
    expect(failures.find((f) => f.key === "persona")).toBeUndefined();
  });

  it("reports stale allowlist entries as their own failure class", () => {
    const { failures, stale } = evaluate(findings, [{ row: "tool-goal", reason: "never diverged" }]);
    expect(failures.length).toBeGreaterThan(0);
    expect(stale).toEqual([{ row: "tool-goal", reason: "never diverged" }]);
  });
});

describe("runCheck / CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "preset-drift-"));
  const standardPath = join(dir, "std.yml");
  const aidosPath = join(dir, "aidos.yml");
  const allowlistPath = join(dir, "drift.json");
  writeFileSync(standardPath, STD);
  writeFileSync(aidosPath, AIDOS_EQUIV);
  writeFileSync(
    allowlistPath,
    JSON.stringify([
      { row: "persona", field: "systemPrompt", reason: "aidos-specific system prompt" },
      { row: "tool-presentation", reason: "presentation pinned to code mode in aidos" },
      { row: "aidos-loader", reason: "the aidos plugin loader row" },
    ]),
  );

  it("passes when every divergence is named", () => {
    const result = runCheck({ standardPath, aidosPath, allowlistPath });
    expect(result.ok).toBe(true);
    expect(result.deliberate.length).toBe(3); // persona prompt diff, missing tool-presentation, aidos-only loader
  });

  it("exits 0 on a clean run and 1 with a DRIFT line on an unnamed divergence", () => {
    const cleanOut = execFileSync("node", [join(here, "..", "scripts", "check-preset-drift.mjs"), "--json", "--standard", standardPath, "--aidos", aidosPath, "--allowlist", allowlistPath], {
      encoding: "utf8",
    });
    expect(JSON.parse(cleanOut).ok).toBe(true);

    const shortList = join(dir, "short.json");
    writeFileSync(shortList, JSON.stringify([{ row: "tool-presentation", reason: "pinned" }]));
    let failed = false;
    let stderr = "";
    try {
      execFileSync("node", [join(here, "..", "scripts", "check-preset-drift.mjs"), "--standard", standardPath, "--aidos", aidosPath, "--allowlist", shortList], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (err) {
      failed = true;
      stderr = err.stderr?.toString() ?? "";
    }
    expect(failed).toBe(true);
    expect(stderr).toContain("DRIFT persona [systemPrompt]");
    expect(stderr).toContain("DRIFT aidos-loader");
  });
});
