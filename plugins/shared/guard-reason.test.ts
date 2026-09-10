/**
 * #130 — approval-comment's composer-ring classification, single-sourced.
 *
 * approval-comment's selectApproval paints the composer ring from
 * isBashGuardReason: true rides to the marker as data-rewrite (BLUE) and
 * anything else as data-escalated (YELLOW). The plugin used to carry a
 * hand-copied twin of tool-render's classifier that missed the `kind` stamp
 * and both escalation exclusions, so escalation YAML — stamped AND legacy —
 * classified true here and painted escalations blue. That is the #105 bug,
 * still firing, in a plugin nobody looked at because the fix landed next
 * door.
 *
 * The fix is single-sourcing, not a patched twin: both consumers import the
 * binding below. So these tests do two jobs. The behavioural half calls the
 * exact binding approval-comment's selectApproval calls — approval-comment's
 * client half cannot be imported in node (`react` does not resolve there),
 * so this shared module IS its classification path — with the real builder
 * output for stamped shapes and literal log text for legacy ones. The
 * single-source half reads the consumers' sources the way
 * shared/plugin-modal.test.ts does and fails if a second copy reappears.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildEscalationApprovalReason, buildGuardApprovalReason } from "../bash-guard";
import {
  isBashGuardReason,
  isHostEscalationReason,
  isRetiredEscalationPrompt,
} from "./guard-reason";

const here = dirname(fileURLToPath(import.meta.url));
const plugins = dirname(here);

const read = (relative: string) => readFileSync(join(plugins, relative), "utf8");

/**
 * Source with its comments removed. The single-source tests must read the
 * CODE: a comment mentioning the classifier (this file's own explanations
 * do) is not a copy.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("approval-comment ring classification (#130)", () => {
  it("does not call the repo-built escalation YAML a guard rewrite", () => {
    // The FIRING shape: the old twin read the `summary` key and returned
    // true, painting the escalation blue. The real builder output, through
    // the binding selectApproval calls, must read false (yellow).
    const reason = buildEscalationApprovalReason({
      standingMode: "read-only",
      escalateTo: "workspace-write",
      justification: "need to write the migration",
      runs: "npx migrate",
    });
    expect(isBashGuardReason(reason)).toBe(false);
  });

  it("does not call legacy (pre-stamp) escalation YAML a guard rewrite", () => {
    // Written as the literal text a real log holds, not via the builder —
    // the builder can no longer produce this shape.
    const legacyEscalation = [
      `summary: 'bash-guard: escalate from "read-only" to "workspace-write"'`,
      "justification: need to write the migration",
      "runs: npx migrate",
      "",
    ].join("\n");
    expect(legacyEscalation).not.toContain("kind:");
    expect(isBashGuardReason(legacyEscalation)).toBe(false);
  });

  it("does not call the host's plain-string escalation a guard rewrite", () => {
    // The justification is free-form prose and the whole string is parsed as
    // YAML, so the exclusion keys on the prefix, not the shape. The embedded
    // summary/runs lines are the point: without the prefix exclusion this
    // string walks the legacy path and reads true.
    const reason =
      "escalate sandbox to danger-full-access: needs files\nsummary: needs files\nruns: echo hi";
    expect(isHostEscalationReason(reason)).toBe(true);
    expect(isBashGuardReason(reason)).toBe(false);
  });

  it("does not call the retired plain-text escalation prompt a guard rewrite", () => {
    // Opens with "bash-guard:", so without its carve-out the plain-text
    // branch adopts it and old logs replay blue.
    const reason =
      'bash-guard: escalate this bash command from "workspace-write" to "danger-full-access". Justification: write outside';
    expect(isRetiredEscalationPrompt(reason)).toBe(true);
    expect(isBashGuardReason(reason)).toBe(false);
  });

  it("still calls the repo-built guard YAML a guard rewrite", () => {
    // The blue ring must survive for real rewrites: the stamp declares it.
    const reason = buildGuardApprovalReason({
      summary: "bash-guard: this command runs in a different form.",
      wrote: "grep -n foo",
      runs: "rg -n foo",
      why: "rg is faster",
    });
    expect(isBashGuardReason(reason)).toBe(true);
  });

  it("still calls legacy (pre-stamp) guard YAML a guard rewrite", () => {
    // History keeps its banner here too — the property 5f4d0e2 restored for
    // tool-render. Literal log text: the builder can no longer produce it.
    const legacy = [
      'summary: "bash-guard: git blocked by 1 filter (commit is blocked)"',
      "wrote: git commit -m x",
      "runs: git commit -m x",
      "why: commit is blocked",
      "",
    ].join("\n");
    expect(legacy).not.toContain("kind:");
    expect(isBashGuardReason(legacy)).toBe(true);
  });

  it("still calls the legacy plain-text rewrite prompt a guard rewrite", () => {
    expect(
      isBashGuardReason(
        "bash-guard: the following command needs approval:\n\n  git push\n\nMatched rule(s):\n  • git (push): denied.\n",
      ),
    ).toBe(true);
  });

  it("calls anything else an escalation, not a rewrite", () => {
    // selectApproval treats false as escalated, so foreign prose and
    // non-strings must read false — never blue, and never crashing the ring.
    expect(isBashGuardReason("please approve")).toBe(false);
    expect(isBashGuardReason(undefined)).toBe(false);
    expect(isBashGuardReason(null)).toBe(false);
    expect(isBashGuardReason(42)).toBe(false);
  });
});

describe("each escalation exclusion pinned independently (#130)", () => {
  it("excludes an escalation summary even with no justification field", () => {
    // Pins LEGACY_ESCALATION_SUMMARY_PREFIX alone: the only tell this record
    // carries is the fixed literal summary.
    const summaryOnly = [
      `summary: 'bash-guard: escalate from "read-only" to "workspace-write"'`,
      "runs: 'true'",
      "",
    ].join("\n");
    expect(isBashGuardReason(summaryOnly)).toBe(false);
  });

  it("excludes a justification-carrying record even with an ordinary summary", () => {
    // Pins the `justification` check alone: a guard reason has never carried
    // that field, so any record with it is not a legacy guard reason.
    const justificationOnly = [
      'summary: "bash-guard: something else entirely"',
      "justification: j",
      "runs: 'true'",
      "",
    ].join("\n");
    expect(isBashGuardReason(justificationOnly)).toBe(false);
  });

  it("excludes a kind-stamped non-guard record even when guard-shaped", () => {
    // Pins the `"kind" in record` check alone: anything declaring a kind
    // that is not "bash-guard" is not a legacy guard reason, no matter how
    // guard-shaped the rest is.
    const foreignKind = [
      "kind: escalation",
      'summary: "bash-guard: something else entirely"',
      "runs: 'true'",
      "",
    ].join("\n");
    expect(isBashGuardReason(foreignKind)).toBe(false);
  });

  it("needs no classifier change for a future third kind of ask", () => {
    // Pins the positive stamp: only `kind: bash-guard` declares a guard.
    expect(isBashGuardReason("kind: audit-trail\nsummary: something new\n")).toBe(false);
  });
});

describe("the predicate exists once (#130)", () => {
  it("approval-comment imports the shared classifier", () => {
    expect(read("approval-comment/src/client.tsx")).toContain(
      'import { isBashGuardReason } from "../../shared/guard-reason";',
    );
  });

  it("approval-comment carries no local copy of the classifier", () => {
    // The removed twin matched purely by bare shape
    // (`typeof parsed.summary === "string"`). If a copy reappears here, the
    // next classification fix can desynchronise again.
    const client = code(read("approval-comment/src/client.tsx"));
    expect(client).not.toContain("function isBashGuardReason");
    expect(client).not.toContain("typeof parsed.summary");
    expect(client).not.toContain('from "yaml"');
  });

  it("tool-render re-exports the shared classifier and defines nothing", () => {
    // Every existing `./guard` / `./guard.js` importer keeps working, but
    // the definition lives in shared: this file must stay a re-export.
    const guard = read("tool-render/src/guard.ts");
    expect(guard).toContain('export * from "../../shared/guard-reason";');
    expect(code(guard)).not.toContain("function isBashGuardReason");
  });

  it("the shared module defines the predicate exactly once", () => {
    const shared = read("shared/guard-reason.ts");
    expect(shared.match(/export function isBashGuardReason/g)).toHaveLength(1);
    expect(shared.match(/export function isLegacyGuardReasonRecord/g)).toHaveLength(1);
  });
});
