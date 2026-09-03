/**
 * Regression tests for the PHASE PROFILE overlays (profile-planning,
 * profile-awaiting_verification), kept separate from bash-guard.test.ts
 * because these must mount the guard with an aidos stub.
 *
 * apply() only consults the aidos service when `exec.agent` is truthy, and
 * only then does `dirs` become [base, base/profile-<phase>]. The existing
 * suite passes `agent: undefined`, so every test there runs with profile
 * "none" and the base dir alone -- which is exactly why the planning
 * regressions below went unnoticed.
 *
 * The bug this pins (2026-09-03): `cd /repo && git log` was DENIED during
 * planning. git.json already resolved `log` to allow, but `cd` had no rule
 * anywhere, fell through to profile-planning/_default.json's `*` deny, and
 * mostRestrictive([deny, allow]) is deny. The message then listed only the
 * denying hits, so it blamed `cd` and never mentioned git -- which made it
 * look like the granular git policy was broken when it was fine.
 */
import { describe, expect, it, vi } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apply } from "./bash-guard";

const GUARDS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "guards");

type Decision = { kind: string; reason?: string } | null;

/** Mount the plugin against the repo's real rule files under one phase profile. */
function mountGuard(profile: string) {
  const handlers = new Map<string, unknown>();
  const noop = () => {};
  const aidos = {
    bashContext() {
      return {
        profile,
        // A scratch dir that no test command targets, so the scratchAllowed
        // short-circuit never fires and the RULES are what get exercised.
        scratchDir: "/tmp/dsh-not-targeted-by-these-tests",
        workspaceRoot: "/home/sid/repos/aidos",
      };
    },
  };
  const ctx = {
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    on(event: string, fn: unknown) {
      handlers.set(event, fn);
      return () => {};
    },
    get(name: string) {
      return name === "aidos" ? aidos : undefined;
    },
  };
  apply(ctx as never, { guardsDir: GUARDS_DIR });
  const pre = handlers.get("tools/pre-execute");
  if (typeof pre !== "function") throw new Error("no pre-execute listener registered");
  return pre as (exec: unknown, next: () => Promise<unknown>) => Promise<Decision>;
}

/** Run one command through the guard under `profile`, with FROZEN arguments. */
async function runIn(profile: string, command: string) {
  const pre = mountGuard(profile);
  const args = Object.freeze({ command });
  const next = vi.fn(async () => ({ kind: "allow" }));
  // `agent` MUST be truthy: apply() skips the aidos lookup otherwise and the
  // profile silently stays "none".
  const exec = { name: "bash", arguments: args, callId: "call-1", agent: { id: "agent-1" } };
  const decision = await pre(exec, next);
  return { decision, args, next };
}

const planning = (command: string) => runIn("planning", command);
const verifying = (command: string) => runIn("awaiting_verification", command);

describe("bash-guard planning profile", () => {
  it("allows `cd <repo> && git log` -- the exact command that regressed", async () => {
    const { decision, next } = await planning(
      "cd /home/sid/repos/aidos && git log --oneline -10",
    );
    expect(decision).toEqual({ kind: "allow" });
    expect(next).toHaveBeenCalled();
  });

  it("allows a bare cd during planning", async () => {
    const { decision } = await planning("cd /home/sid/repos/aidos");
    expect(decision).toEqual({ kind: "allow" });
  });

  it("still allows a read-only git verb under the planning overlay", async () => {
    // Lookup is `rules.get(name) ?? rules.get("*")`, so the base git.json rule
    // must survive the profile merge instead of falling to the wildcard.
    const { decision } = await planning("git status --short");
    expect(decision).toEqual({ kind: "allow" });
  });

  it("does NOT let readonly.json shadow git.json into allowing a mutation", async () => {
    // The trap: profile rules override base rules for the SAME command name,
    // so putting "git" in profile-planning/readonly.json would allow every git
    // verb during planning, push and reset included. It must stay out.
    const { decision } = await planning("git push origin main");
    expect(decision?.kind).toBe("ask");
    expect(decision?.kind).not.toBe("allow");
  });

  it("asks rather than denies for a command with no rule", async () => {
    // profile-planning/_default.json was loosened deny -> ask so that shapes
    // which cannot be allow-listed by name stay reachable behind a prompt.
    const { decision } = await planning("/home/sid/some-unknown-script.mjs call thing");
    expect(decision?.kind).toBe("ask");
    expect(decision?.kind).not.toBe("deny");
  });

  it("asks rather than denies for a bare shell variable assignment", async () => {
    // `SRC=$(pwd)` parses as a command named SRC. Variable names are arbitrary,
    // so this can never be allow-listed by name -- the loosened default is what
    // keeps it usable. A proper fix would skip assignment-only nodes entirely.
    const { decision } = await planning("SRC=$(pwd)");
    expect(decision?.kind).toBe("ask");
    expect(decision?.kind).not.toBe("deny");
  });

  it("allows the read-only inspection commands added to readonly.json", async () => {
    for (const command of ["basename /a/b.txt", "dirname /a/b.txt", "uname -a", "df -h"]) {
      const { decision } = await planning(command);
      expect(decision, `expected ${command} to be allowed`).toEqual({ kind: "allow" });
    }
  });
});

describe("bash-guard awaiting_verification profile", () => {
  it("allows `cd <repo> && git log` there too", async () => {
    // nav.json sits at BASE level precisely so one file covers every profile.
    // Were it inside profile-planning/, this case would prompt instead.
    const { decision } = await verifying("cd /home/sid/repos/aidos && git log --oneline -10");
    expect(decision).toEqual({ kind: "allow" });
  });

  it("still asks for an unruled command", async () => {
    const { decision } = await verifying("/home/sid/some-unknown-script.mjs run");
    expect(decision?.kind).toBe("ask");
  });
});
