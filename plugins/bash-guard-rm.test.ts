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

/**
 * #90. Both commands below were real refusals from one cleanup session, and
 * only one of them was correct. The exemption used to be evaluated across the
 * WHOLE chain, so a neighbour that merely READ a path outside scratch revoked
 * it for a deletion that never left scratch.
 */
describe("the scratch exemption is scoped per command, not across the chain", () => {
  const scratch = (command: string) => run([GUARDS_DIR], command, ["/tmp/dsh"]);

  it("a scratch-only rm runs even when later commands touch non-scratch paths", async () => {
    // Every rm target is under /tmp/dsh, but a `du` measuring a repo path and
    // a `cd` into that repo used to revoke the exemption -- contradicting
    // guards/rm.json's own promise that scratch deletions never prompt.
    const outcome = await scratch(
      "rm -rf /tmp/dsh/aidos/hooks-scratch /tmp/dsh/aidos/final.index 2>&1; " +
        "echo done; du -sh /home/sid/repos/aidos/.git/aidos-tmp 2>/dev/null; " +
        "cd /home/sid/repos/aidos && git log --oneline -1",
    );
    expect(outcome.action).toBe("run");
  });

  it("an rm targeting anything outside scratch still asks", async () => {
    // The other refusal from the same session, and it was right: a recursive
    // delete inside git internals must never be exempt.
    const outcome = await scratch(
      "rm -rf /home/sid/repos/aidos/.git/aidos-tmp /tmp/dsh/aidos/hooks-scratch",
    );
    expect(outcome.action).toBe("ask");
  });

  it("per-command scoping does not excuse a second, non-scratch rm", async () => {
    // The safety property the old chain-wide rule was defending. Per-command
    // scoping keeps it: the second rm is judged on its own targets.
    expect((await scratch("rm /tmp/dsh/x && rm /etc/y")).action).toBe("ask");
  });

  it("names a path that actually failed, never one that passed", async () => {
    // The message used to name the FIRST argument, which is the culprit only
    // by luck. Naming a scratch path as "blocked" sent two readers after the
    // wrong path.
    const outcome = await scratch("rm -rf /tmp/dsh/aidos/hooks-scratch /etc/nonexistent-probe");
    expect(outcome.action).toBe("ask");
    const reason = "reason" in outcome ? String(outcome.reason) : "";
    expect(reason).toContain("/etc/nonexistent-probe");
    expect(reason).not.toContain("hooks-scratch is blocked");
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

/**
 * #90 follow-up: the two secondary items, each CLOSED with a reason rather
 * than a fix. Both were verified to fail in the safe direction (ask, never
 * run), so there is nothing to repair; these tests pin the verified
 * behaviour so a future refactor cannot silently change it.
 */
describe("glob and relative-path items (#90 follow-up, closed with reasons)", () => {
  const scratch = (command: string) => run([GUARDS_DIR], command, ["/tmp/dsh"]);
  const runWithRoot = (command: string, root: string | undefined) =>
    evaluate(fakeCtx() as never, [GUARDS_DIR], command, ["/tmp/dsh"], root, {});

  it("an unquoted glob rooted in scratch stays exempt", async () => {
    // Command A carried `/tmp/dsh/aidos/*.index` unquoted. The exemption
    // matches the literal text by fixed prefix; expansion can only produce
    // paths under that prefix, so the glob can never escape scratch.
    const outcome = await scratch("rm -rf /tmp/dsh/aidos/final.index /tmp/dsh/aidos/*.index");
    expect(outcome.action).toBe("run");
  });

  it("a refusal beside a scratch glob names the real offender, not the glob", async () => {
    // Command A's exact shape: the .git target disqualifies, the glob does
    // not, so the message must name the .git path.
    const outcome = await scratch(
      "rm -rf /home/sid/repos/aidos/.git/aidos-tmp /tmp/dsh/aidos/*.index",
    );
    expect(outcome.action).toBe("ask");
    const reason = "reason" in outcome ? String(outcome.reason) : "";
    expect(reason).toContain(".git/aidos-tmp is outside every scratch root");
    expect(reason).not.toContain("*.index");
  });

  it("a relative scratch path resolves when the workspace root is known", async () => {
    const outcome = await runWithRoot("rm -rf aidos/spool.txt", "/tmp/dsh");
    expect(outcome.action).toBe("run");
  });

  it("a relative path asks when the workspace root is unavailable -- fail-closed", async () => {
    // Without a root there is nothing to resolve against (the server's own
    // cwd is not the agent's workspace), so the path matches no safe root
    // and the command asks. The cost is a prompt, never a silent run.
    const outcome = await scratch("rm -rf aidos/spool.txt");
    expect(outcome.action).toBe("ask");
  });
});
