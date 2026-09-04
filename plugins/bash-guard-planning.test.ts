/**
 * Regression tests for the PHASE PROFILE overlays (profile-planning,
 * profile-awaiting_verification), kept separate from bash-guard.test.ts
 * because these must run with the profile rule dirs merged in.
 *
 * `evaluate` takes the rule dirs as a parameter, so these tests pass
 * [base, base/profile-<phase>] directly, against the repo's real rule files.
 * The old suite mounted apply() with an aidos stub to reach the same dirs
 * through a tools/pre-execute listener. That listener is gone, and apply()
 * resolves the profile through the aidos service at execution time, so the
 * overlay selection itself is exercised only by the tool path.
 *
 * The bug this pins (2026-09-03): `cd /repo && git log` was DENIED during
 * planning. git.json already resolved `log` to allow, but `cd` had no rule
 * anywhere, fell through to profile-planning/_default.json's `*` deny, and
 * mostRestrictive([deny, allow]) is deny. The message then listed only the
 * denying hits, so it blamed `cd` and never mentioned git -- which made it
 * look like the granular git policy was broken when it was fine.
 */
import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluate, type GuardOutcome } from "./bash-guard";

const GUARDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "guards");

/** Same fake ctx the rewrite contract tests use. */
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
 * Run one command through `evaluate` with the base rules plus one phase
 * profile overlay. safePaths is empty, so the scratch escape never fires and
 * the RULES are what get exercised.
 */
async function runIn(profile: string, command: string): Promise<GuardOutcome> {
  const dirs = [GUARDS_DIR, join(GUARDS_DIR, `profile-${profile}`)];
  return evaluate(fakeCtx() as never, dirs, command, [], undefined, {});
}

const planning = (command: string) => runIn("planning", command);
const verifying = (command: string) => runIn("awaiting_verification", command);

describe("bash-guard planning profile", () => {
  it("allows `cd <repo> && git log` -- the exact command that regressed", async () => {
    const outcome = await planning("cd /home/sid/repos/aidos && git log --oneline -10");
    expect(outcome).toEqual({
      action: "run",
      command: "cd /home/sid/repos/aidos && git log --oneline -10",
      rewritten: false,
    });
  });

  it("allows a bare cd during planning", async () => {
    const outcome = await planning("cd /home/sid/repos/aidos");
    expect(outcome).toEqual({
      action: "run",
      command: "cd /home/sid/repos/aidos",
      rewritten: false,
    });
  });

  it("still allows a read-only git verb under the planning overlay", async () => {
    // Lookup is `rules.get(name) ?? rules.get("*")`, so the base git.json rule
    // must survive the profile merge instead of falling to the wildcard.
    const outcome = await planning("git status --short");
    expect(outcome).toEqual({
      action: "run",
      command: "git status --short",
      rewritten: false,
    });
  });

  it("does NOT let readonly.json shadow git.json into allowing a mutation", async () => {
    // The trap: profile rules override base rules for the SAME command name,
    // so putting "git" in profile-planning/readonly.json would allow every git
    // verb during planning, push and reset included. It must stay out.
    const outcome = await planning("git push origin main");
    expect(outcome.action).toBe("ask");
    expect(outcome.action).not.toBe("run");
  });

  it("asks rather than denies for a command with no rule", async () => {
    // profile-planning/_default.json was loosened deny -> ask so that shapes
    // which cannot be allow-listed by name stay reachable behind a prompt.
    const outcome = await planning("/home/sid/some-unknown-script.mjs call thing");
    expect(outcome.action).toBe("ask");
    expect(outcome.action).not.toBe("deny");
  });

  it("asks rather than denies for a bare shell variable assignment", async () => {
    // `SRC=$(pwd)` parses as a command named SRC. Variable names are arbitrary,
    // so this can never be allow-listed by name -- the loosened default is what
    // keeps it usable. A proper fix would skip assignment-only nodes entirely.
    const outcome = await planning("SRC=$(pwd)");
    expect(outcome.action).toBe("ask");
    expect(outcome.action).not.toBe("deny");
  });

  it("allows the read-only inspection commands added to readonly.json", async () => {
    for (const command of ["basename /a/b.txt", "dirname /a/b.txt", "uname -a", "df -h"]) {
      const outcome = await planning(command);
      expect(outcome, `expected ${command} to be allowed`).toEqual({
        action: "run",
        command,
        rewritten: false,
      });
    }
  });
});

describe("bash-guard awaiting_verification profile", () => {
  it("allows `cd <repo> && git log` there too", async () => {
    // nav.json sits at BASE level precisely so one file covers every profile.
    // Were it inside profile-planning/, this case would prompt instead.
    const outcome = await verifying("cd /home/sid/repos/aidos && git log --oneline -10");
    expect(outcome).toEqual({
      action: "run",
      command: "cd /home/sid/repos/aidos && git log --oneline -10",
      rewritten: false,
    });
  });

  it("still asks for an unruled command", async () => {
    const outcome = await verifying("/home/sid/some-unknown-script.mjs run");
    expect(outcome.action).toBe("ask");
  });
});
