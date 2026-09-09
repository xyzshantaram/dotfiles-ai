/**
 * Tests for skill-gate's single-seam enforcement (#98).
 *
 * The plugin hides gated tools with ONE mechanism — the agent-scoped
 * `tools.restrict({ deny })` mask, applied at `agent/session-start` (before
 * the first prompt assembly) and reconciled at `agent/pre-step`. There is
 * deliberately no `system-prompt/assemble` filter: both model-facing surfaces
 * (the native tool list AND the Code Mode `tools:sdk` block) render from the
 * calling scope's restricted view upstream, so one mask covers both and two
 * filters would drift apart.
 *
 * The fakes below model the upstream contract faithfully (verified against
 * node_modules/@deepseek-ai/dsh-tools):
 *   - `restrict({ deny })` throws the upstream "unknown global tool" error,
 *     whose `known global tools: ...` trailer the plugin parses to retry;
 *   - `schemas()` called with no scope is the GLOBAL (unrestricted) view —
 *     the plugin uses it for `*` pattern expansion;
 *   - prompt assembly is simulated the way upstream renders it: BOTH the
 *     native list and the SDK block project the SAME scope-restricted view
 *     (wireSchemas/sdKSchemas read view(scope).visible), so asserting on both
 *     surfaces exercises the single seam, not a plugin-side filter.
 *
 * These tests fake the cordis `ctx` by recording `ctx.on` handlers in a map,
 * fake an `Agent` as a plain object with an id and a scope-faithful tools
 * handle, and call the exported `apply(ctx, config)` directly.
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

/**
 * Fake upstream tool registry with the scope semantics the plugin relies on.
 * Masks from successive restrict() calls union (upstream: "multiple masks
 * intersect"); each disposer lifts exactly its own mask.
 */
function makeRegistry(initial: string[]) {
  const globals = new Set(initial);
  const masks = new Map<string, Set<string>[]>();
  const restrictCalls: Array<{ agentId: string; deny: string[] }> = [];
  return {
    restrictCalls,
    register(name: string) {
      globals.add(name);
    },
    all(): string[] {
      return [...globals].sort();
    },
    visible(agentId: string): string[] {
      const deny = new Set<string>();
      for (const m of masks.get(agentId) ?? []) for (const n of m) deny.add(n);
      return [...globals].filter((n) => !deny.has(n)).sort();
    },
    restrict(agentId: string, filter: { deny: string[] }) {
      const unknown = filter.deny.filter((n) => !globals.has(n));
      if (unknown.length > 0) {
        // Verbatim upstream wording (dsh-tools lib/types/index.js): the
        // plugin's restrictKnown() parses the `known global tools:` trailer.
        throw new Error(
          `tools.restrict() names unknown global tool${unknown.length > 1 ? "s" : ""} ${unknown.map((n) => `"${n}"`).join(", ")}; known global tools: ${[...globals].sort().join(", ") || "(none)"}`,
        );
      }
      const mask = new Set(filter.deny);
      const list = masks.get(agentId) ?? [];
      list.push(mask);
      masks.set(agentId, list);
      restrictCalls.push({ agentId, deny: [...filter.deny] });
      return () => {
        const live = masks.get(agentId);
        if (live) {
          const i = live.indexOf(mask);
          if (i >= 0) live.splice(i, 1);
        }
      };
    },
  };
}

type Registry = ReturnType<typeof makeRegistry>;

/** Minimal fake agent: depth 0 unless `depth` says otherwise. */
function fakeAgent(id: string, reg: Registry, opts: { depth?: number } = {}) {
  const agent = {
    id,
    ...(opts.depth ? { options: { subagentDepth: opts.depth } } : {}),
    ctx: {
      tools: {
        // Unscoped call: the GLOBAL view, exactly what the plugin's pattern
        // expansion reads upstream.
        schemas: () => reg.all().map((name) => ({ name })),
        restrict: (filter: { deny: string[] }) => reg.restrict(id, filter),
      },
    },
  };
  return { agent: agent as never };
}

/**
 * Simulate upstream prompt assembly for one agent: BOTH the native tool list
 * and the Code Mode SDK block project the scope's restricted view, so both
 * read reg.visible(agentId). (dsh-tools: wireSchemas and sdkSchemas both read
 * view(scope).visible.)
 */
function assemble(reg: Registry, agent: { id: string }) {
  const v = reg.visible(agent.id);
  return { tools: [...v], sdk: [...v] };
}

function fireSessionStart(ctx: ReturnType<typeof fakeCtx>, agent: unknown) {
  ctx.handlers.get("agent/session-start")![0]!({ agent, source: "fresh" });
}

async function firePreStep(ctx: ReturnType<typeof fakeCtx>, agent: unknown, decision?: unknown) {
  await ctx.handlers.get("agent/pre-step")![0]!({ agent }, () => decision);
}

async function fireSkillLoad(ctx: ReturnType<typeof fakeCtx>, agent: unknown, skillName: string) {
  await ctx.handlers.get("tools/post-execute")![0]!(
    { name: "skill", agent, arguments: { name: skillName } },
    {},
    async () => ({}),
  );
}

/** Invalidate the plugin's module-level gates cache (its skills/change seam). */
function invalidate(ctx: ReturnType<typeof fakeCtx>) {
  ctx.handlers.get("skills/change")![0]!();
}

const tmpRoot = join("/tmp", "dsh", "skill-gate-test");

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

/** Write a skill whose `tools-gated` is an inline array naming `tools`. */
function writeGatedSkill(dir: string, skillName: string, tools: string[]): string {
  const skillDir = join(dir, skillName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${skillName}\ndescription: test skill.\ntools-gated: [${tools.join(", ")}]\n---\n\nbody\n`,
  );
  return dir;
}

/** Write a skill whose `tools-gated` is a bare block list (the nostr form). */
function writeGatedSkillBlock(dir: string, skillName: string, tools: string[]): string {
  const skillDir = join(dir, skillName);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    `---\nname: ${skillName}\ndescription: test skill.\ntools-gated:\n${tools.map((t) => `  - ${t}`).join("\n")}\n---\n\nbody\n`,
  );
  return dir;
}

describe("skill-gate alwaysDeny", () => {
  it("denies a fresh depth-0 agent even when no skill gates the tool", () => {
    const reg = makeRegistry(["foo", "bar"]);
    const ctx = fakeCtx();
    apply(ctx as never, { alwaysDeny: ["foo"], skillDirs: [join(tmpRoot, "none")] });
    const { agent } = fakeAgent("fresh-depth-0", reg);
    fireSessionStart(ctx, agent);
    const calls = reg.restrictCalls.filter((c) => c.agentId === "fresh-depth-0");
    expect(calls.length).toBe(1);
    expect(calls[0]!.deny).toContain("foo");
    // A non-denied tool stays visible.
    expect(calls[0]!.deny).not.toContain("bar");
  });

  it("keeps alwaysDeny tools off both assembled surfaces for a depth-0 agent", () => {
    const reg = makeRegistry(["foo", "bar"]);
    const ctx = fakeCtx();
    apply(ctx as never, { alwaysDeny: ["foo"] });
    const { agent } = fakeAgent("assemble-depth-0", reg);
    fireSessionStart(ctx, agent);
    const asm = assemble(reg, agent as { id: string });
    expect(asm.tools).toEqual(["bar"]);
    expect(asm.sdk).toEqual(["bar"]);
  });

  it("keeps the tool denied when a skill that gates it is loaded", async () => {
    const reg = makeRegistry(["foo", "bar"]);
    const dir = writeGatedSkill(join(tmpRoot, "unlock"), "unlocker", ["foo"]);
    const ctx = fakeCtx();
    apply(ctx as never, { alwaysDeny: ["foo"], skillDirs: [dir] });
    invalidate(ctx);
    const { agent } = fakeAgent("unlock-attempt", reg);
    fireSessionStart(ctx, agent);
    expect(reg.visible("unlock-attempt")).not.toContain("foo");

    // Simulate a successful `skill` tool call via tools/post-execute.
    await fireSkillLoad(ctx, agent, "unlocker");

    // The next pre-step must still deny "foo".
    await firePreStep(ctx, agent);
    expect(reg.visible("unlock-attempt")).not.toContain("foo");
    const asm = assemble(reg, agent as { id: string });
    expect(asm.tools).not.toContain("foo");
    expect(asm.sdk).not.toContain("foo");
  });

  it("still applies subagentDeny to subagents on top of alwaysDeny", () => {
    const reg = makeRegistry(["foo", "bar", "cordis_define"]);
    const ctx = fakeCtx();
    apply(ctx as never, { alwaysDeny: ["foo"], subagentDeny: ["cordis_define"] });
    const { agent } = fakeAgent("sub", reg, { depth: 1 });
    fireSessionStart(ctx, agent);
    const calls = reg.restrictCalls.filter((c) => c.agentId === "sub");
    expect(calls[0]!.deny).toContain("foo");
    expect(calls[0]!.deny).toContain("cordis_define");
    const asm = assemble(reg, agent as { id: string });
    expect(asm.tools).toEqual(["bar"]);
    expect(asm.sdk).toEqual(["bar"]);
  });

  it("defaults alwaysDeny to an empty list", () => {
    expect((Config({}) as { alwaysDeny: string[] }).alwaysDeny).toEqual([]);
  });
});

describe("skill-gate first prompt (#98)", () => {
  it("hides a gated exact name AND a gated prefix pattern from both surfaces before any pre-step", () => {
    const reg = makeRegistry(["secret_exact", "mcp__acme__one", "mcp__acme__two", "plain"]);
    const dir = join(tmpRoot, "first");
    writeGatedSkill(dir, "exactskill", ["secret_exact"]);
    writeGatedSkill(dir, "prefixskill", ["mcp__acme__*"]);
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    invalidate(ctx);
    const { agent } = fakeAgent("first-clean", reg);
    // Session start is the first enforcement: NO pre-step has run, yet the
    // very first assembly must already be clean on both surfaces. (Before the
    // fix, the Code Mode SDK block shipped every gated tool here because the
    // mask was only applied at pre-step, after assembly.)
    fireSessionStart(ctx, agent);
    const asm = assemble(reg, agent as { id: string });
    expect(asm.tools).toEqual(["plain"]);
    expect(asm.sdk).toEqual(["plain"]);
  });

  it("makes the exact tool and the prefix tools APPEAR on both surfaces after their skills load", async () => {
    const reg = makeRegistry(["secret_exact", "mcp__acme__one", "mcp__acme__two", "plain"]);
    const dir = join(tmpRoot, "appear");
    writeGatedSkill(dir, "exactskill", ["secret_exact"]);
    writeGatedSkill(dir, "prefixskill", ["mcp__acme__*"]);
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    invalidate(ctx);
    const { agent } = fakeAgent("appear", reg);
    fireSessionStart(ctx, agent);
    expect(assemble(reg, agent as { id: string }).sdk).toEqual(["plain"]);

    await fireSkillLoad(ctx, agent, "exactskill");
    await firePreStep(ctx, agent);
    let asm = assemble(reg, agent as { id: string });
    expect(asm.tools).toEqual(["plain", "secret_exact"]);
    expect(asm.sdk).toEqual(["plain", "secret_exact"]);

    await fireSkillLoad(ctx, agent, "prefixskill");
    await firePreStep(ctx, agent);
    asm = assemble(reg, agent as { id: string });
    expect(asm.tools).toEqual(["mcp__acme__one", "mcp__acme__two", "plain", "secret_exact"]);
    expect(asm.sdk).toEqual(asm.tools);

    // Steady state issues no further restrict() round trips: the deny mark
    // and the registry fingerprint both match, so reconciliation is free.
    const callsBefore = reg.restrictCalls.length;
    await firePreStep(ctx, agent);
    expect(reg.restrictCalls.length).toBe(callsBefore);
  });

  it("parses a bare block-list tools-gated (the nostr skill form) and gates its prefix", () => {
    const reg = makeRegistry(["mcp__nostrbook__read_nip", "plain"]);
    const dir = writeGatedSkillBlock(join(tmpRoot, "blockform"), "nostr", ["mcp__nostrbook__*"]);
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    invalidate(ctx);
    const { agent } = fakeAgent("blockform", reg);
    fireSessionStart(ctx, agent);
    const asm = assemble(reg, agent as { id: string });
    expect(asm.tools).toEqual(["plain"]);
    expect(asm.sdk).toEqual(["plain"]);
  });

  it("picks up tools that register after session start on the next reconcile", async () => {
    // An MCP server connecting after session start: its tools are unknown
    // when the first mask is applied, so they cannot be denied yet — but the
    // next pre-step must hide them (exact names via the registry
    // fingerprint, prefix patterns via expansion).
    const reg = makeRegistry(["plain"]);
    const dir = join(tmpRoot, "late");
    writeGatedSkill(dir, "lateskill", ["late_exact", "mcp__late__*"]);
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    invalidate(ctx);
    const { agent } = fakeAgent("late", reg);
    fireSessionStart(ctx, agent);
    expect(assemble(reg, agent as { id: string }).sdk).toEqual(["plain"]);

    reg.register("late_exact");
    reg.register("mcp__late__x");
    await firePreStep(ctx, agent);
    const asm = assemble(reg, agent as { id: string });
    expect(asm.tools).toEqual(["plain"]);
    expect(asm.sdk).toEqual(["plain"]);
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
    const reg = makeRegistry(["foo", "bar"]);
    const dir = writeGatedSkill(join(tmpRoot, "slash"), "slashskill", ["foo"]);
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    // gatesCache is module-level, so an earlier test's discovery would
    // otherwise mask this test's own skill dir. skills/change is the
    // plugin's own cache-invalidation seam.
    invalidate(ctx);
    const { agent } = fakeAgent("slash-agent", reg);

    // Session start: no skill loaded yet, so the gated tool is denied.
    fireSessionStart(ctx, agent);
    expect(reg.visible("slash-agent")).toContain("bar");
    expect(reg.visible("slash-agent")).not.toContain("foo");

    // This step's decision carries the slash-invoked skill body.
    await firePreStep(ctx, agent, slashDecision("slashskill"));

    // The following step must no longer deny it.
    await firePreStep(ctx, agent);
    expect(reg.visible("slash-agent")).toContain("foo");
  });

  it("ignores a decision message that is not a skill invocation", async () => {
    const reg = makeRegistry(["foo", "bar"]);
    const dir = writeGatedSkill(join(tmpRoot, "slash2"), "slashskill2", ["foo"]);
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    invalidate(ctx);
    const { agent } = fakeAgent("slash-agent-2", reg);

    fireSessionStart(ctx, agent);
    await firePreStep(ctx, agent, {
      kind: "enter",
      messages: [{ content: [], source: { kind: "user" } }],
    });
    await firePreStep(ctx, agent);
    expect(reg.visible("slash-agent-2")).not.toContain("foo");
  });
});

describe("skill-gate compaction survival (#89 follow-up)", () => {
  it("a skill's gated tools survive compaction, and a skill never loaded stays denied", async () => {
    const reg = makeRegistry(["foo", "bar"]);
    const dir = writeGatedSkill(join(tmpRoot, "keeper"), "keeper", ["foo"]);
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    // gatesCache is module-level: invalidate so this test's own skill dir
    // is discovered, not an earlier test's.
    invalidate(ctx);
    // Module-level active/applied/disposer maps are keyed by agent id, so
    // these ids must be unique across the file.
    const loaded = fakeAgent("compact-loaded", reg);
    const stranger = fakeAgent("compact-stranger", reg);

    // Before the load, the gate denies the tool to both agents.
    fireSessionStart(ctx, loaded.agent);
    fireSessionStart(ctx, stranger.agent);
    expect(reg.visible("compact-loaded")).not.toContain("foo");
    expect(reg.visible("compact-stranger")).not.toContain("foo");

    // Load the skill on ONE agent via the `skill` tool path. The claim runs
    // after next() resolves, so the post-execute MUST be awaited — without
    // the await the activation has not landed when the next step runs.
    // (The slash path shares activateSkill/activeById below this seam.)
    await fireSkillLoad(ctx, loaded.agent, "keeper");
    await firePreStep(ctx, loaded.agent);
    expect(reg.visible("compact-loaded")).toContain("foo");

    // Compaction drops the applied masks; the next pre-step reconciles each
    // agent from its preserved active set.
    ctx.handlers.get("compaction/start")![0]!();
    await firePreStep(ctx, loaded.agent);
    await firePreStep(ctx, stranger.agent);

    // SURVIVAL half: the loader keeps its tool. Against the old clearAll(),
    // which wiped activeById, this denies again and the test fails here.
    expect(reg.visible("compact-loaded")).toContain("foo");
    // LEAK half (security-relevant): an agent that never loaded the skill
    // still gets the full deny. A test that only checked survival would pass
    // even if the gate leaked wide open.
    expect(reg.visible("compact-stranger")).not.toContain("foo");

    // Same story at the prompt-assembly surfaces, which render the
    // scope-restricted view upstream.
    const asmLoaded = assemble(reg, loaded.agent as { id: string });
    expect(asmLoaded.tools).toEqual(["bar", "foo"]);
    expect(asmLoaded.sdk).toEqual(["bar", "foo"]);
    const asmStranger = assemble(reg, stranger.agent as { id: string });
    expect(asmStranger.tools).toEqual(["bar"]);
    expect(asmStranger.sdk).toEqual(["bar"]);
  });
});

describe("skill-gate first post-compaction prompt (#102)", () => {
  it("hides gated tools on BOTH surfaces when assembly follows compaction with NO intervening pre-step", async () => {
    // The window #98's sequencing leaves behind: clearAll() on
    // compaction/start lifts every mask, and each step assembles BEFORE its
    // pre-step waterfall (see the pre-step comment in skill-gate.ts), so the
    // first post-compaction assembly renders with no mask in force. Against
    // the current code this assembly ships the gated tools on both surfaces.
    const reg = makeRegistry(["secret_exact", "mcp__acme__one", "plain"]);
    const dir = join(tmpRoot, "window");
    writeGatedSkill(dir, "exactskill", ["secret_exact"]);
    writeGatedSkill(dir, "prefixskill", ["mcp__acme__*"]);
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    invalidate(ctx);
    const { agent } = fakeAgent("compact-window-stranger", reg);

    fireSessionStart(ctx, agent);
    expect(assemble(reg, agent as { id: string }).sdk).toEqual(["plain"]);

    // Compaction lifts the masks; the very next assembly — with NO pre-step
    // reconcile in between — must still be clean on both surfaces.
    ctx.handlers.get("compaction/start")![0]!();
    const asm = assemble(reg, agent as { id: string });
    expect(asm.tools).toEqual(["plain"]);
    expect(asm.sdk).toEqual(["plain"]);

    // The following reconcile must keep the deny in force, not just the
    // window assembly.
    await firePreStep(ctx, agent);
    const after = assemble(reg, agent as { id: string });
    expect(after.tools).toEqual(["plain"]);
    expect(after.sdk).toEqual(["plain"]);
  });

  it("a loaded skill's tools stay visible across compaction with NO intervening pre-step", async () => {
    // Guard against the over-correction (wiping actives, pre-#89): the loader
    // must see its tool immediately after compaction, not only once a
    // pre-step has re-applied it.
    const reg = makeRegistry(["foo", "bar"]);
    const dir = writeGatedSkill(join(tmpRoot, "window-keeper"), "windowkeeper", ["foo"]);
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    invalidate(ctx);
    const { agent } = fakeAgent("compact-window-loaded", reg);

    fireSessionStart(ctx, agent);
    await fireSkillLoad(ctx, agent, "windowkeeper");
    await firePreStep(ctx, agent);
    expect(assemble(reg, agent as { id: string }).sdk).toEqual(["bar", "foo"]);

    ctx.handlers.get("compaction/start")![0]!();
    const asm = assemble(reg, agent as { id: string });
    expect(asm.tools).toEqual(["bar", "foo"]);
    expect(asm.sdk).toEqual(["bar", "foo"]);
  });
});
