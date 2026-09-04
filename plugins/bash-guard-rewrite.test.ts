/**
 * Contract tests for the rewrite-based `evaluate` outcome.
 *
 * The guard will stop denying rewritten commands and start running them. These
 * tests pin that contract before the implementation exists, so every case here
 * is EXPECTED TO FAIL against current main. Do not weaken a test to make it
 * pass.
 *
 * Contract summary (GuardOutcome):
 * - `evaluate` never returns null. A plain allow is
 *   { action: "run", command: <model's command>, rewritten: false }.
 * - `command` is always the string that should execute.
 * - `rewritten` is true only when `command` differs from the model's input.
 * - `reason` is present whenever a matched rule had a non-allow verdict.
 * - `action: "ask"` also carries `original`, the model's unmodified command.
 * - New rule fields under test: per-rule `readOnly`, and RewriteRule `add`,
 *   which inserts a flag only when absent and is idempotent.
 */

import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as bashGuard from "./bash-guard";

type GuardOutcome =
  | { action: "run"; command: string; rewritten: boolean; reason?: string }
  | { action: "ask"; command: string; original: string; rewritten: boolean; reason?: string }
  | { action: "deny"; reason: string };

/** The function under test. Not exported yet, so this throws until it lands. */
function evaluate(): (
  ctx: unknown,
  dirs: string[],
  command: string,
  safePaths: string[],
  workspaceRoot: string | undefined,
  templates: { deny?: string; ask?: string },
) => Promise<GuardOutcome> {
  const fn = (bashGuard as Record<string, unknown>).evaluate;
  if (typeof fn !== "function") {
    throw new Error("bash-guard does not export evaluate() yet");
  }
  return fn as never;
}

/** Same fake ctx the existing bash-guard.test.ts mounts the plugin with. */
function fakeCtx() {
  const noop = () => {};
  return {
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    on() {
      return () => {};
    },
    get() {
      return undefined;
    },
  };
}

/**
 * Write the given rule objects as JSON files into a fresh temp directory, run
 * one command through evaluate against that directory, and return the outcome.
 * safePaths is empty, so the scratch escape can never mask a rule verdict.
 */
async function guard(command: string, rules: Record<string, unknown>): Promise<GuardOutcome> {
  const dir = await mkdtemp(join(tmpdir(), "bash-guard-rewrite-"));
  try {
    await writeFile(join(dir, "rules.json"), JSON.stringify(rules));
    return await evaluate()(fakeCtx(), [dir], command, [], undefined, {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Same as `guard`, but writes several rule files so one command can match more
 * than one rule. Rules are keyed by command name, so each needs its own file.
 */
async function guardRules(
  command: string,
  rules: Record<string, unknown>[],
): Promise<GuardOutcome> {
  const dir = await mkdtemp(join(tmpdir(), "bash-guard-rewrite-"));
  try {
    for (let i = 0; i < rules.length; i++) {
      await writeFile(join(dir, `rule-${i}.json`), JSON.stringify(rules[i]));
    }
    return await evaluate()(fakeCtx(), [dir], command, [], undefined, {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const TRANSLATE_RULE = {
  commands: ["grep"],
  verdict: "ask",
  reason: "grep is translated to rg",
  translate: "grep",
};

const DROP_RULE = {
  commands: ["rg"],
  verdict: "ask",
  reason: "rg drops --stats",
  rewrites: [{ drop: ["--stats"], because: "--stats is noise" }],
};

const ADD_RULE = {
  commands: ["jq"],
  verdict: "ask",
  reason: "jq runs with --tab",
  rewrites: [{ add: [{ flag: "--tab" }] }],
};

describe("bash-guard evaluate GuardOutcome contract", () => {
  it("clause 1: a clean translate on a readOnly rule returns run with the translated command and rewritten true", async () => {
    const outcome = await guard("grep -rn foo src/", { ...TRANSLATE_RULE, readOnly: true });
    expect(outcome.action).toBe("run");
    expect(outcome).toMatchObject({
      action: "run",
      command: "rg -n foo src/",
      rewritten: true,
    });
  });

  it("clause 2: a clean translate without readOnly returns ask with the translated command, the original, and rewritten true", async () => {
    const outcome = await guard("grep -rn foo src/", TRANSLATE_RULE);
    expect(outcome.action).toBe("ask");
    expect(outcome).toMatchObject({
      action: "ask",
      command: "rg -n foo src/",
      original: "grep -rn foo src/",
      rewritten: true,
    });
  });

  it("clause 3: a drop rewrite auto-runs under readOnly", async () => {
    const outcome = await guard("rg --stats foo .", { ...DROP_RULE, readOnly: true });
    expect(outcome).toMatchObject({
      action: "run",
      command: "rg foo .",
      rewritten: true,
    });
  });

  it("clause 3: a drop rewrite asks when the rule is not readOnly", async () => {
    const outcome = await guard("rg --stats foo .", DROP_RULE);
    expect(outcome).toMatchObject({
      action: "ask",
      command: "rg foo .",
      original: "rg --stats foo .",
      rewritten: true,
    });
  });

  it("clause 4: an add rewrite inserts a missing flag and auto-runs under readOnly", async () => {
    const outcome = await guard("jq .", { ...ADD_RULE, readOnly: true });
    expect(outcome).toMatchObject({
      action: "run",
      command: "jq --tab .",
      rewritten: true,
    });
  });

  it("clause 4: an add rewrite asks when the rule is not readOnly", async () => {
    const outcome = await guard("jq .", ADD_RULE);
    expect(outcome).toMatchObject({
      action: "ask",
      command: "jq --tab .",
      original: "jq .",
      rewritten: true,
    });
  });

  it("clause 4: an add rewrite is idempotent when the flag is already present, so rewritten is false and the command is unchanged", async () => {
    const outcome = await guard("jq --tab .", { ...ADD_RULE, readOnly: true });
    expect(outcome).toMatchObject({
      action: "run",
      command: "jq --tab .",
      rewritten: false,
    });
  });

  it("clause 4: an idempotent add on a non-readOnly rule asks with the unmodified original", async () => {
    const outcome = await guard("jq --tab .", ADD_RULE);
    expect(outcome).toMatchObject({
      action: "ask",
      command: "jq --tab .",
      original: "jq --tab .",
      rewritten: false,
    });
  });

  it("clause 4: an add rewrite can insert a flag together with its value", async () => {
    const rule = {
      commands: ["jq"],
      verdict: "ask",
      reason: "jq runs with a bounded output",
      rewrites: [{ add: [{ flag: "--indent", value: "2" }] }],
    };
    const outcome = await guard("jq .", { ...rule, readOnly: true });
    expect(outcome).toMatchObject({
      action: "run",
      command: "jq --indent 2 .",
      rewritten: true,
    });
  });

  it("clause 5: a translator blocker denies even when the rule is readOnly", async () => {
    const outcome = await guard("grep --color=always foo .", { ...TRANSLATE_RULE, readOnly: true });
    expect(outcome).toMatchObject({ action: "deny" });
    expect(outcome).toHaveProperty("reason");
  });

  it("clause 6: a verdict deny rule returns deny with its reason", async () => {
    const rule = { commands: ["git"], verdict: "deny", reason: "git writes are blocked" };
    const outcome = await guard("git push --force", rule);
    expect(outcome).toMatchObject({ action: "deny" });
    expect(outcome).toHaveProperty("reason");
    expect((outcome as { reason: string }).reason).toContain("git writes are blocked");
  });

  it("clause 7: a run outcome from a matched readOnly rule carries the rule reason", async () => {
    const outcome = await guard("grep -rn foo src/", { ...TRANSLATE_RULE, readOnly: true });
    expect(outcome).toHaveProperty("reason");
    expect((outcome as { reason?: string }).reason).toContain("grep is translated to rg");
  });

  it("clause 7: a plain allow carries no reason", async () => {
    const outcome = await guard("rg -n foo src/", {});
    expect(outcome).toEqual({ action: "run", command: "rg -n foo src/", rewritten: false });
    expect(outcome).not.toHaveProperty("reason");
  });

  it("clause 8: an unparseable command denies, because the guard is fail-closed", async () => {
    const outcome = await guard("echo 'unclosed", {});
    expect(outcome).toMatchObject({ action: "deny" });
    expect(outcome).toHaveProperty("reason");
  });

  // The readOnly gate is most-restrictive-wins across every rule that
  // contributed a rewrite. One command can match several rules, so a single
  // permissive rule must not carry the whole pipeline.
  it("readOnly is all-or-nothing: one non-readOnly contributor forces an ask", async () => {
    const outcome = await guardRules("rg --stats foo | jq .", [
      { ...DROP_RULE, readOnly: true },
      { ...ADD_RULE, readOnly: false },
    ]);
    expect(outcome.action).toBe("ask");
    expect(outcome).toMatchObject({ rewritten: true });
    const ran = (outcome as { command: string }).command;
    expect(ran).not.toContain("--stats");
    expect(ran).toContain("--tab");
  });

  // Regression. unbash-walker reports inner-parse offsets for a ref inside a
  // command substitution, so editing by absolute offset shredded unrelated
  // bytes: `cd /x && echo "A"; for s in $(rg --stats foo)` came back as
  // `cd /x && eo; ...`. Harmless while a rewrite only ever became a deny
  // message, and dangerous once readOnly makes it run. The ref is skipped, so
  // the rule's base verdict still applies and the command is untouched.
  it("a rewrite inside a command substitution never edits the command", async () => {
    const command = `for s in $(rg --stats foo); do echo $s; done`;
    const outcome = await guard(command, { ...DROP_RULE, readOnly: true });
    expect((outcome as { command: string }).command).toBe(command);
    expect(outcome).toMatchObject({ rewritten: false });
  });

  it("a nested rewrite does not corrupt an unrelated earlier command", async () => {
    const command = `cd /x && echo "A"; for s in $(rg --stats foo); do echo $s; done`;
    const outcome = await guard(command, { ...DROP_RULE, readOnly: true });
    const ran = (outcome as { command: string }).command;
    expect(ran).toBe(command);
    expect(ran).toContain('echo "A"');
  });

  it("readOnly is all-or-nothing: every contributor readOnly auto-runs", async () => {
    const outcome = await guardRules("rg --stats foo | jq .", [
      { ...DROP_RULE, readOnly: true },
      { ...ADD_RULE, readOnly: true },
    ]);
    expect(outcome.action).toBe("run");
    expect(outcome).toMatchObject({ rewritten: true });
    const ran = (outcome as { command: string }).command;
    expect(ran).not.toContain("--stats");
    expect(ran).toContain("--tab");
  });
});
