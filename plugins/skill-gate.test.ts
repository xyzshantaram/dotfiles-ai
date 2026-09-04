/**
 * Tests for the skill-gate `alwaysDeny` config field (PLAN Effort 9 T1).
 *
 * `alwaysDeny` denies tools to EVERY agent at any delegation depth and
 * regardless of loaded-skill state. These tests fake the cordis `ctx` by
 * recording `ctx.on` handlers in a map, fake an `Agent` as a plain object
 * with an id and a `ctx.tools.restrict` spy, and call the exported
 * `apply(ctx, config)` directly.
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { apply, Config } from "./skill-gate";

type Handler = (...args: unknown[]) => unknown;

/** Minimal fake cordis context: records handlers, no-ops the logger. */
function fakeCtx() {
  const handlers = new Map<string, Handler[]>();
  return {
    handlers,
    logger: {
      warn: () => {},
      error: () => {},
    },
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
  };
}

/** Minimal fake agent: depth 0 unless `depth` says otherwise. */
function fakeAgent(id: string, opts: { depth?: number; tools?: string[] } = {}) {
  const restrictCalls: string[][] = [];
  const toolNames = opts.tools ?? ["foo", "bar"];
  const agent = {
    id,
    ...(opts.depth
      ? { options: { subagentDepth: opts.depth } }
      : {}),
    ctx: {
      tools: {
        schemas: () => toolNames.map((name) => ({ name })),
        restrict({ deny }: { deny: string[] }) {
          restrictCalls.push(deny);
          return () => {};
        },
      },
    },
  };
  return { agent: agent as never, restrictCalls };
}

const tmpRoot = join("/tmp", "dsh", "skill-gate-test");

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

/** Write a skill whose `tools-gated` names `tools`. */
function writeGatedSkill(dir: string, skillName: string, tools: string[]): string {
  const skillDir = join(dir, skillName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${skillName}\ndescription: test skill.\ntools-gated: [${tools.join(", ")}]\n---\n\nbody\n`,
  );
  return dir;
}

describe("skill-gate alwaysDeny", () => {
  it("denies a fresh depth-0 agent even when no skill gates the tool", () => {
    const ctx = fakeCtx();
    apply(
      ctx as never,
      { alwaysDeny: ["foo"], skillDirs: [join(tmpRoot, "none")] },
    );
    const { agent, restrictCalls } = fakeAgent("fresh-depth-0");
    const preStep = ctx.handlers.get("agent/pre-step")![0]!;
    preStep({ agent }, () => {});
    expect(restrictCalls.length).toBe(1);
    expect(restrictCalls[0]).toContain("foo");
    // A non-denied tool stays visible.
    expect(restrictCalls[0]).not.toContain("bar");
  });

  it("strips alwaysDeny tools from the assembled system prompt for a depth-0 agent", () => {
    const ctx = fakeCtx();
    apply(ctx as never, { alwaysDeny: ["foo"] });
    const { agent } = fakeAgent("assemble-depth-0");
    const assemble = ctx.handlers.get("system-prompt/assemble")![0]!;
    const assembly = { tools: [{ name: "foo" }, { name: "bar" }] };
    assemble(assembly, { agent }, () => {});
    expect(assembly.tools.map((t) => (t as { name: string }).name)).toEqual(["bar"]);
  });

  it("keeps the tool denied when a skill that gates it is loaded", () => {
    const dir = writeGatedSkill(tmpRoot, "unlocker", ["foo"]);
    const ctx = fakeCtx();
    apply(ctx as never, { alwaysDeny: ["foo"], skillDirs: [dir] });
    const { agent, restrictCalls } = fakeAgent("unlock-attempt");
    const preStep = ctx.handlers.get("agent/pre-step")![0]!;
    preStep({ agent }, () => {});
    expect(restrictCalls[0]).toContain("foo");

    // Simulate a successful `skill` tool call via tools/post-execute.
    const postExecute = ctx.handlers.get("tools/post-execute")![0]!;
    postExecute(
      { name: "skill", agent, arguments: { name: "unlocker" } },
      {},
      async () => ({}),
    );

    // The next pre-step must still deny "foo" (the reconciler may skip the
    // restrict() call entirely when the deny set did not change, so assert
    // on the latest recorded mask).
    preStep({ agent }, () => {});
    expect(restrictCalls.at(-1)).toContain("foo");
  });

  it("still applies subagentDeny to subagents on top of alwaysDeny", () => {
    const ctx = fakeCtx();
    apply(ctx as never, { alwaysDeny: ["foo"], subagentDeny: ["cordis_define"] });
    const { agent, restrictCalls } = fakeAgent("sub", { depth: 1 });
    ctx.handlers.get("agent/pre-step")![0]!({ agent }, () => {});
    expect(restrictCalls[0]).toContain("foo");
    expect(restrictCalls[0]).toContain("cordis_define");
  });

  it("defaults alwaysDeny to an empty list", () => {
    expect((Config({}) as { alwaysDeny: string[] }).alwaysDeny).toEqual([]);
  });
});

describe("skill-gate slash-command invocation", () => {
  /** One pre-step decision carrying a slash-invoked skill body, shaped the
   * way dsh-tool-skill stamps it. */
  function slashDecision(skillName: string) {
    return {
      kind: "enter",
      messages: [
        {
          content: [{ type: "text", text: "<skill_content ...>" }],
          source: { kind: "skill-invocation", name: skillName, form: "instructions" },
        },
      ],
    };
  }

  it("unmasks a gated tool when the skill arrives by slash command, not the skill tool", async () => {
    const dir = writeGatedSkill(tmpRoot, "slashskill", ["foo"]);
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    // gatesCache is module-level, so an earlier test's discovery would
    // otherwise mask this test's own skill dir. skills/change is the
    // plugin's own cache-invalidation seam.
    ctx.handlers.get("skills/change")![0]!();
    const { agent, restrictCalls } = fakeAgent("slash-agent");
    const preStep = ctx.handlers.get("agent/pre-step")![0]!;

    // First step: no skill loaded yet, so the gated tool is denied.
    await preStep({ agent }, () => undefined);
    expect(restrictCalls.at(-1)).toContain("foo");

    // This step's decision carries the slash-invoked skill body.
    await preStep({ agent }, () => slashDecision("slashskill"));

    // The following step must no longer deny it.
    await preStep({ agent }, () => undefined);
    expect(restrictCalls.at(-1) ?? []).not.toContain("foo");
  });

  it("ignores a decision message that is not a skill invocation", async () => {
    const dir = writeGatedSkill(tmpRoot, "slashskill2", ["foo"]);
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    ctx.handlers.get("skills/change")![0]!();
    const { agent, restrictCalls } = fakeAgent("slash-agent-2");
    const preStep = ctx.handlers.get("agent/pre-step")![0]!;

    await preStep({ agent }, () => ({
      kind: "enter",
      messages: [{ content: [], source: { kind: "user" } }],
    }));
    await preStep({ agent }, () => undefined);
    expect(restrictCalls.at(-1)).toContain("foo");
  });
});
