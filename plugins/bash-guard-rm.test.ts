/**
 * rm asks in EVERY phase. 2026-09-05: an agent deleted the imported
 * PLAN-AIDOS.md without asking, because the implementation and
 * subagent-${provider} profiles have no overlay dir at all -- the loader
 * silently falls back to base rules, base has no wildcard and no rm rule,
 * and the command ran. The fix is a BASE rule (guards/rm.json), the only
 * layer that covers dynamic subagent profile names.
 *
 * Kept beside the planning-profile tests because it uses the same
 * evaluate()-with-real-dirs harness.
 */
import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, type GuardOutcome } from "./bash-guard";

const GUARDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "guards");

/** Same fake ctx the planning tests use. */
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

async function run(dirs: string[], command: string, safePaths: string[] = []): Promise<GuardOutcome> {
  return evaluate(fakeCtx() as never, dirs, command, safePaths, undefined, {});
}

const base = (command: string) => run([GUARDS_DIR], command);
const inProfile = (profile: string) => (command: string) =>
  run([GUARDS_DIR, join(GUARDS_DIR, `profile-${profile}`)], command);

describe("rm asks in every phase (it once ran silently in implementation)", () => {
  it("asks with base rules only -- profile none, non-aidos sessions", async () => {
    const outcome = await base("rm PLAN-AIDOS.md");
    expect(outcome.action).toBe("ask");
  });

  it("asks during planning", async () => {
    expect((await inProfile("planning")("rm PLAN-AIDOS.md")).action).toBe("ask");
  });

  it("asks during awaiting_verification", async () => {
    expect((await inProfile("awaiting_verification")("rm PLAN-AIDOS.md")).action).toBe("ask");
  });

  it("asks during implementation -- the profile with NO overlay dir, the incident's exact configuration", async () => {
    // join() names a dir that does not exist on disk; the loader must treat
    // it as empty and the BASE rm rule is the only thing that answers.
    expect((await inProfile("implementation")("rm PLAN-AIDOS.md")).action).toBe("ask");
  });

  it("asks for a subagent profile -- a dynamic name that never has a dir", async () => {
    expect((await inProfile("subagent-coder")("rm PLAN-AIDOS.md")).action).toBe("ask");
    expect((await inProfile("subagent-researcher")("rm PLAN-AIDOS.md")).action).toBe("ask");
  });

  it("rm -rf asks too -- flags do not change the verdict", async () => {
    expect((await base("rm -rf /home/sid/repos/aidos/dist")).action).toBe("ask");
  });

  it("asks inside a compound command", async () => {
    // Every AST-extracted command resolves independently, so a benign
    // prefix must not smuggle the rm through.
    expect((await base("echo hi && rm PLAN-AIDOS.md")).action).toBe("ask");
  });
});

describe("the scratch escape still short-circuits BEFORE the rm rule", () => {
  it("runs without asking under a scratch root", async () => {
    const outcome = await run([GUARDS_DIR], "rm /tmp/dsh/aidos/spool.txt", ["/tmp/dsh"]);
    expect(outcome.action).toBe("run");
  });
});

describe("unrelated commands are unchanged", () => {
  it("ls still runs with base rules only", async () => {
    expect((await base("ls -la")).action).toBe("run");
  });

  it("cd && git log still runs during planning -- adding rm.json did not disturb the nav fix", async () => {
    const outcome = await inProfile("planning")("cd /home/sid/repos/aidos && git log --oneline -3");
    expect(outcome.action).toBe("run");
  });
});
