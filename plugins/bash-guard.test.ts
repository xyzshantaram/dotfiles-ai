/**
 * Regression tests for the bash-guard pre-execute listener.
 *
 * The case that matters most is the frozen-arguments one. The harness builds a
 * tool execution with `arguments: deepFreeze(snapshotJsonValue(...))`, so a
 * pre-execute listener CANNOT write back to the model's command. An earlier
 * version of this plugin assigned to `exec.arguments.command` anyway. Every
 * test here used a plain mutable object, so the whole suite passed while the
 * plugin was broken in the real harness.
 *
 * So these tests freeze the arguments, exactly like the runtime does.
 */
import { describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apply } from "./bash-guard";

const GUARDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "guards");

type Decision = { kind: string; reason?: string } | null;

/** Mount the plugin against the repo's real rule files and return its listener. */
function mountGuard() {
  const handlers = new Map<string, unknown>();
  const noop = () => {};
  const ctx = {
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    on(event: string, fn: unknown) {
      handlers.set(event, fn);
      return () => {};
    },
    get() {
      return undefined;
    },
  };
  apply(ctx as never, { guardsDir: GUARDS_DIR });
  const pre = handlers.get("tools/pre-execute");
  if (typeof pre !== "function") throw new Error("no pre-execute listener registered");
  return pre as (exec: unknown, next: () => Promise<unknown>) => Promise<Decision>;
}

/** Run one bash command through the guard with FROZEN arguments, as the harness does. */
async function run(command: string) {
  const pre = mountGuard();
  const args = Object.freeze({ command });
  const next = vi.fn(async () => ({ kind: "allow" }));
  const exec = { name: "bash", arguments: args, callId: "call-1", agent: undefined };
  const decision = await pre(exec, next);
  return { decision, args, next };
}

describe("bash-guard pre-execute", () => {
  it("never writes back to frozen arguments and suggests the rg command", async () => {
    const command = 'grep -rln "agentPresets" /some/path/ | head -20';
    const { decision, args } = await run(command);

    expect(decision?.kind).toBe("deny");
    expect(decision?.reason).toContain("rg");
    expect(decision?.reason).toContain("head -20");
    // The whole point: the model's command is untouched.
    expect(args.command).toBe(command);
  });

  it("suggests rg for a plain recursive grep", async () => {
    const { decision } = await run("grep -rn foo src/");
    expect(decision?.kind).toBe("deny");
    expect(decision?.reason).toContain("rg -n foo src/");
    expect(decision?.reason).toContain("Run this instead");
  });

  it("suggests fd for a find by name", async () => {
    const { decision } = await run("find . -name '*.ts'");
    expect(decision?.kind).toBe("deny");
    expect(decision?.reason).toContain("fd --search-path . -g '*.ts'");
  });

  it("denies a mutating find predicate and tells the model to ask first", async () => {
    const { decision } = await run("find . -name '*.log' -exec rm {} \\;");
    // An ask would be wrong: approving it would run the ORIGINAL command.
    expect(decision?.kind).toBe("deny");
    expect(decision?.kind).not.toBe("ask");
    expect(decision?.reason).toContain("-x rm");
    expect(decision?.reason).toContain(
      "This command changes files. Ask the user before you run it.",
    );
  });

  it("denies -delete with the blocker named and no suggestion", async () => {
    const { decision } = await run("find . -delete");
    expect(decision?.kind).toBe("deny");
    expect(decision?.reason).toContain("-delete");
    expect(decision?.reason).not.toContain("Run this instead");
  });

  it("does not splice a command that sits inside a wrapper", async () => {
    const { decision } = await run('sh -c "grep -rn foo ."');
    expect(decision?.kind).toBe("deny");
    // Falls through to the rule's own reason, never a suggestion built from
    // offsets that address a rebuilt string.
    expect(decision?.reason).not.toContain("Run this instead");
  });

  it("does not re-quote an unquoted glob", async () => {
    const { decision } = await run("grep foo *.ts");
    expect(decision?.kind).toBe("deny");
    expect(decision?.reason).not.toContain("Run this instead");
  });

  it("does not translate a command that needs a shell expansion", async () => {
    const { decision } = await run('grep "$pattern" .');
    expect(decision?.kind).toBe("deny");
    expect(decision?.reason).not.toContain("Run this instead");
  });

  it("allows rg", async () => {
    const { decision, next } = await run("rg -n foo src/");
    expect(next).toHaveBeenCalled();
    expect(decision).toEqual({ kind: "allow" });
  });

  it("allows a read-only git verb", async () => {
    const { decision, next } = await run("git status");
    expect(next).toHaveBeenCalled();
    expect(decision).toEqual({ kind: "allow" });
  });

  it("passes a non-bash tool straight through", async () => {
    const pre = mountGuard();
    const next = vi.fn(async () => ({ kind: "allow" }));
    await pre({ name: "read", arguments: { path: "x" }, callId: "c", agent: undefined }, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
