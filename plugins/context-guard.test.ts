/**
 * Tests for context-guard's single-seam enforcement (#98).
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
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { apply, Config, name, renderCompactSdk } from "./context-guard";

type Handler = (...args: unknown[]) => unknown;

/** Minimal fake cordis context: records handlers, no-ops the logger. */
function fakeCtx(tools?: unknown) {
  const handlers = new Map<string, Handler[]>();
  const errors: string[] = [];
  return {
    handlers,
    errors,
    logger: {
      warn: () => {},
      error: (message?: unknown) => {
        errors.push(String(message));
      },
    },
    on(event: string, handler: Handler) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
    },
    // The lookup tool registers at mount; tests that do not care capture
    // into the void, tests that do pass their own handle.
    tools: tools ?? {
      register: () => () => {},
      schemas: () => [],
      restrict: () => () => {},
      get: () => undefined,
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

const tmpRoot = join("/tmp", "dsh", "context-guard-test");

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

describe("context-guard alwaysDeny", () => {
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

describe("context-guard first prompt (#98)", () => {
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

describe("context-guard slash-command invocation", () => {
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

describe("context-guard compaction survival (#89 follow-up)", () => {
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

describe("context-guard first post-compaction prompt (#102)", () => {
  it("hides gated tools on BOTH surfaces when assembly follows compaction with NO intervening pre-step", async () => {
    // The window #98's sequencing leaves behind: clearAll() on
    // compaction/start lifts every mask, and each step assembles BEFORE its
    // pre-step waterfall (see the pre-step comment in context-guard.ts), so the
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

describe("context-guard rename parity: every shipped gate still masks", () => {
  // The rename (skill-gate -> context-guard) is mechanical and
  // behaviour-identical; its main risk is silently dropping a gate. This
  // block proves otherwise with the REAL shipped frontmatter, not synthetic
  // skills: it copies the six gating SKILL.md files out of the repo's own
  // skills/ directory (covering all three tools-gated forms — inline array,
  // bare block list, and the multi-line flow array the
  // cordis-plugin-development skill uses) and asserts each gate hides its
  // tools before its skill loads and restores them after.
  const repoSkills = join(fileURLToPath(new URL(".", import.meta.url)), "..", "skills");
  const gatedSkills = [
    "util",
    "session-search",
    "resume",
    "nostr",
    "easyeda",
    "editing-cordis-compositions",
    "cordis-plugin-development",
  ];
  const expectedHidden: Record<string, string[]> = {
    util: ["time", "regex", "markdown", "encoding"],
    "session-search": ["agent_session_search", "agent_session_read"],
    resume: ["resume_search", "resume_read"],
    nostr: ["mcp__nostrbook__read_nip", "mcp__nostrbook__read_kind"],
    easyeda: ["mcp__easyeda__get_board", "mcp__easyeda__list_layers"],
    "editing-cordis-compositions": [
      "cordis_inspect_list",
      "cordis_inspect_query",
      "cordis_inspect_self",
    ],
    "cordis-plugin-development": [
      "cordis_inspect_list",
      "cordis_inspect_query",
      "cordis_inspect_self",
      "cordis_define",
      "cordis_run",
      "cordis_stop",
      "cordis_undefine",
    ],
  };

  function copyRealSkills(dir: string): string {
    for (const skillName of gatedSkills) {
      const bundle = join(dir, skillName);
      mkdirSync(bundle, { recursive: true });
      copyFileSync(join(repoSkills, skillName, "SKILL.md"), join(bundle, "SKILL.md"));
    }
    return dir;
  }

  it("hides every shipped gate's tools on both surfaces before any skill loads", () => {
    const allGated = [...new Set(Object.values(expectedHidden).flat())];
    const reg = makeRegistry([...allGated, "plain"]);
    const dir = copyRealSkills(join(tmpRoot, "parity-real"));
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    invalidate(ctx);
    const { agent } = fakeAgent("parity-stranger", reg);
    fireSessionStart(ctx, agent);
    const asm = assemble(reg, agent as { id: string });
    expect(asm.tools).toEqual(["plain"]);
    expect(asm.sdk).toEqual(["plain"]);
  });

  it("restores each gate's tools after its own skill loads, and only those", async () => {
    const allGated = [...new Set(Object.values(expectedHidden).flat())];
    const reg = makeRegistry([...allGated, "plain"]);
    const dir = copyRealSkills(join(tmpRoot, "parity-unlock"));
    const ctx = fakeCtx();
    apply(ctx as never, { skillDirs: [dir] });
    invalidate(ctx);
    const { agent } = fakeAgent("parity-loader", reg);
    fireSessionStart(ctx, agent);

    // Each skill unlocks exactly its own tools; everything else stays masked.
    for (const skillName of gatedSkills) {
      await fireSkillLoad(ctx, agent, skillName);
      await firePreStep(ctx, agent);
      const visible = reg.visible((agent as { id: string }).id);
      for (const tool of expectedHidden[skillName]!) {
        expect(visible).toContain(tool);
      }
    }
    expect(reg.visible((agent as { id: string }).id).sort()).toEqual(
      [...allGated, "plain"].sort(),
    );
  });
});

type SdkSchema = { name: string; description: string; parameters: unknown; output: unknown };

/**
 * Fake agent carrying the SDK surface the compact section reads: scoped
 * sdkSchemas/modeFor/get plus a per-agent systemPrompt section table that
 * throws the upstream duplicate error verbatim.
 */
function makeSdkAgent(
  id: string,
  opts: {
    schemas: SdkSchema[];
    mode?: string;
    depth?: number;
    preseed?: Array<{ name: string; order: number; text: unknown }>;
  },
) {
  const sections: Array<{ name: string; order: number; text: unknown }> = [...(opts.preseed ?? [])];
  const tools = {
    register: () => () => {},
    schemas: () => [],
    restrict: () => () => {},
    get: () => undefined,
    sdkSchemas: (_scope?: unknown) => opts.schemas.map((s) => ({ ...s })),
    modeFor: (_scope?: unknown) => opts.mode ?? "both",
  };
  const agent = {
    id,
    ...(opts.depth ? { options: { subagentDepth: opts.depth } } : {}),
    ctx: {
      tools,
      systemPrompt: {
        section: (s: { name: string; order: number; text: unknown }) => {
          if (sections.some((e) => e.name === s.name)) {
            throw new Error(`prompt section "${s.name}" is already registered in this scope`);
          }
          sections.push(s);
          return () => {};
        },
      },
    },
  };
  return { agent: agent as never, sections, tools };
}

/** Fake host tools handle for the lookup tests: global sees all, scoped hides masked. */
function makeLookupTools(defs: SdkSchema[], visibleNames: Set<string>) {
  const registered: unknown[] = [];
  // Production get() returns full definitions (output wrapped in {schema});
  // sdkSchemas() returns bare schemas. The fakes store bare schemas and wrap
  // on the get() path, exactly like the two upstream projections.
  const toDefinition = (def: SdkSchema) => ({ ...def, output: { schema: def.output } });
  const tools = {
    registered,
    register: (def: unknown) => {
      registered.push(def);
      return () => {};
    },
    schemas: () => [],
    restrict: () => () => {},
    get: (name: string, scope?: unknown) => {
      const def = defs.find((d) => d.name === name);
      if (!def) return undefined;
      if (scope === undefined) return toDefinition(def);
      return visibleNames.has(name) ? toDefinition(def) : undefined;
    },
  };
  return tools;
}

type LookupDef = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  output: { schema: unknown };
  execute: (args: { name: string }, exec: { agent?: unknown }) => Promise<string>;
};

function lookupDef(tools: { registered: unknown[] }): LookupDef {
  const def = (tools.registered as LookupDef[]).find((d) => d.name === "schema_lookup");
  if (!def) throw new Error("schema_lookup was not registered at apply");
  return def;
}

describe("context-guard compact tools:sdk section", () => {
  const deep: SdkSchema = {
    name: "deep_tool",
    description: "A tool with a deep output.",
    parameters: { type: "object", properties: {} },
    output: { type: "object", properties: { item: { type: "object", properties: { id: { type: "string" } } } } },
  };
  const shallow: SdkSchema = {
    name: "shallow_tool",
    description: "A tool with a shallow output.",
    parameters: { type: "object", properties: {} },
    output: { type: "string" },
  };

  it("registers an agent-scoped tools:sdk shadow rendering the compact view", () => {
    const ctx = fakeCtx();
    apply(ctx as never, {});
    const { agent, sections } = makeSdkAgent("compact-one", { schemas: [deep, shallow] });
    fireSessionStart(ctx, agent);
    expect(sections.length).toBe(1);
    expect(sections[0]!.name).toBe("tools:sdk");
    expect(sections[0]!.order).toBe(150);
    const text = (sections[0]!.text as (scope: unknown) => string)({});
    // Calling convention opens the section, verbatim from the shipped SDK.
    expect(text.startsWith("## Writing code for run_code")).toBe(true);
    // Deep shapes collapse to a named reference the lookup expands...
    expect(text).toContain("deep_tool: DeepToolOutput;");
    expect(text).toContain('type DeepToolOutput = unknown; // full shape: schema_lookup({ name: "deep_tool" })');
    // ...shallow shapes stay inline, and the full args map is gone.
    expect(text).toContain("shallow_tool: string;");
    expect(text).not.toContain("interface ToolArgsMap");
    // The derivation rule states the exotic-name case explicitly.
    expect(text).toContain('`tools["my-tool"](args)`');
    expect(text).toContain("the argument type IS the native");
    expect(text).toContain("schema_lookup");
  });

  it("matches the shipped calling convention verbatim", async () => {
    const { renderToolsSdk } = await import("@deepseek-ai/dsh-tools");
    const shipped = renderToolsSdk([]);
    const instructions = shipped.slice(0, shipped.indexOf("```ts")).trimEnd();
    const ctx = fakeCtx();
    apply(ctx as never, {});
    const { agent, sections } = makeSdkAgent("compact-verbatim", { schemas: [shallow] });
    fireSessionStart(ctx, agent);
    const text = (sections[0]!.text as (scope: unknown) => string)({});
    expect(text.startsWith(instructions)).toBe(true);
  });

  it("renders empty when the effective mode is not both", () => {
    const ctx = fakeCtx();
    apply(ctx as never, {});
    const { agent, sections } = makeSdkAgent("compact-native", { schemas: [shallow], mode: "native" });
    fireSessionStart(ctx, agent);
    expect(sections.length).toBe(1);
    expect((sections[0]!.text as (scope: unknown) => string)({})).toBe("");
  });

  it("defers to a preset-owned section on duplicate instead of throwing", () => {
    const ctx = fakeCtx();
    apply(ctx as never, {});
    const preset = { name: "tools:sdk", order: 150, text: "preset-full-sdk" };
    const { agent, sections } = makeSdkAgent("compact-dupe", { schemas: [shallow], preseed: [preset] });
    fireSessionStart(ctx, agent);
    // No throw, and the preset's section stands untouched.
    expect(sections.length).toBe(1);
    expect(sections[0]!.text).toBe("preset-full-sdk");
    // The deferral is silent: a duplicate is the expected preset-owned case,
    // not a fault worth journaling every session start.
    expect(ctx.errors).toEqual([]);
  });

  it("mounts under the context-guard name", () => {
    // The composition row addresses the file, but the registry name is what
    // the loader reports: a stale "skill-gate" here would mount a ghost row.
    expect(name).toBe("context-guard");
  });

  it("registers once per agent across session start and pre-steps", async () => {
    const ctx = fakeCtx();
    apply(ctx as never, {});
    const { agent, sections } = makeSdkAgent("compact-once", { schemas: [shallow] });
    fireSessionStart(ctx, agent);
    await firePreStep(ctx, agent);
    await firePreStep(ctx, agent);
    expect(sections.length).toBe(1);
  });

  it("adds no system-prompt/assemble listener", () => {
    const ctx = fakeCtx();
    apply(ctx as never, {});
    expect(ctx.handlers.has("system-prompt/assemble")).toBe(false);
  });

  it("renderCompactSdk sorts members by name", () => {
    const out = renderCompactSdk([
      { name: "zeta", output: { type: "string" } },
      { name: "alpha", output: { type: "string" } },
    ]);
    expect(out.indexOf("alpha: string;")).toBeLessThan(out.indexOf("zeta: string;"));
    expect(out).toContain("type ToolName = keyof ToolOutputMap");
    expect(out).toContain("declare class ToolCallError extends Error");
  });
});

describe("context-guard schema lookup", () => {
  const tiny: SdkSchema = {
    name: "tiny",
    description: "Does a tiny thing.",
    parameters: { type: "object", properties: { q: { type: "string" } } },
    output: { type: "string" },
  };
  const exotic: SdkSchema = {
    name: "my-tool",
    description: "Exotic name.",
    parameters: { type: "object", properties: {} },
    output: { type: "string" },
  };
  const sealed: SdkSchema = {
    name: "sealed_tool",
    description: "Sealed tool line one.\nSecond line stays hidden.",
    parameters: { type: "object", properties: {} },
    output: { type: "object", properties: { deepSecret: { type: "string" } } },
  };

  function setup(visible: string[], skillDirs: string[] = [], config: Record<string, unknown> = {}) {
    const tools = makeLookupTools([tiny, exotic, sealed], new Set(visible));
    const ctx = fakeCtx(tools);
    apply(ctx as never, { skillDirs, ...config });
    invalidate(ctx);
    return { ctx, def: lookupDef(tools) };
  }

  it("resolves a visible tool to its full declaration", async () => {
    const { agent } = makeSdkAgent("lookup-visible", { schemas: [] });
    const { def } = setup(["tiny", "my-tool", "sealed_tool"]);
    const { jsonSchemaToTs } = await import("@deepseek-ai/dsh-tools");
    const out = await def.execute({ name: "tiny" }, { agent });
    const expected = [
      "// Does a tiny thing.",
      `type TinyOutput = ${jsonSchemaToTs(tiny.output, 1)};`,
      `declare const tools: { tiny: (args: ${jsonSchemaToTs(tiny.parameters, 1)}) => Promise<TinyOutput>; };`,
    ].join("\n");
    expect(out).toBe(expected);
  });

  it("quotes exotic names in the declaration", async () => {
    const { agent } = makeSdkAgent("lookup-exotic", { schemas: [] });
    const { def } = setup(["tiny", "my-tool", "sealed_tool"]);
    const out = await def.execute({ name: "my-tool" }, { agent });
    expect(out).toContain('{ "my-tool": (args:');
  });

  it("returns name, one-line description and unlocking skill for a masked tool", async () => {
    const dir = writeGatedSkill(join(tmpRoot, "lookup-locker"), "locker", ["sealed_tool"]);
    const { agent } = makeSdkAgent("lookup-masked", { schemas: [] });
    const { def } = setup(["tiny"], [dir]);
    const out = await def.execute({ name: "sealed_tool" }, { agent });
    expect(out).toBe(
      [
        "// Sealed tool line one.",
        '// Tool "sealed_tool" is gated behind skill "locker".',
        "// Load that skill first for argument and output types.",
      ].join("\n"),
    );
    // The output shape must not leak through the masked path.
    expect(out).not.toContain("deepSecret");
  });

  it("resolves unknown names to a short note", async () => {
    const { agent } = makeSdkAgent("lookup-unknown", { schemas: [] });
    const { def } = setup(["tiny"]);
    expect(await def.execute({ name: "nope" }, { agent })).toBe(
      'Unknown tool "nope": no global tool by that name is registered.',
    );
  });

  it("names the configuration lock instead of a skill that cannot unlock", async () => {
    const dir = writeGatedSkill(join(tmpRoot, "lookup-locked"), "locker", ["sealed_tool"]);
    const { agent } = makeSdkAgent("lookup-locked", { schemas: [] });
    const { def } = setup(["tiny"], [dir], { alwaysDeny: ["sealed_tool"] });
    const out = await def.execute({ name: "sealed_tool" }, { agent });
    expect(out).toContain("locked by configuration");
    expect(out).not.toContain('"locker"');
  });

  it("applies the subagent lockdown for a child caller", async () => {
    const dir = writeGatedSkill(join(tmpRoot, "lookup-sub"), "locker", ["sealed_tool"]);
    const { agent } = makeSdkAgent("lookup-sub", { schemas: [], depth: 1 });
    const { def } = setup(["tiny"], [dir], { subagentDeny: ["sealed_tool"] });
    const out = await def.execute({ name: "sealed_tool" }, { agent });
    expect(out).toContain("locked by configuration");
  });

  it("points run_code at the calling convention", async () => {
    const { agent } = makeSdkAgent("lookup-runcode", { schemas: [] });
    const { def } = setup(["tiny"]);
    const out = await def.execute({ name: "run_code" }, { agent });
    expect(out).toContain("batching transport");
  });

  it("keeps its own schema small", () => {
    const tools = makeLookupTools([tiny], new Set(["tiny"]));
    const ctx = fakeCtx(tools);
    apply(ctx as never, {});
    const def = lookupDef(tools);
    // defineTool compiles the parameter spec to a JSON schema: exactly one
    // property, one required entry. One string in, one string out.
    const params = def.parameters as { properties: Record<string, unknown>; required: string[] };
    expect(Object.keys(params.properties)).toEqual(["name"]);
    expect(params.required).toEqual(["name"]);
    expect(def.description.length).toBeLessThan(240);
    expect(def.output.schema).toEqual({ type: "string" });
  });
});
