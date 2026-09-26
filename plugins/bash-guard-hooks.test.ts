/**
 * Ticket #345 — pre-command hooks (the escape hatch).
 *
 * Semantics under test, from the owner spec plus the confirmed question
 * answer ("escape hatch"): the rule layer stays the default policy; only a
 * RULE verdict (ask, or deny with escapable:true) is offered to the hooks;
 * the first hook exiting 0 runs the command with no approval prompt; a hook
 * that cannot run (spawn failure, timeout) can never allow; parse-failure
 * denies are not escapable. The argv contract is `hook <depth> <command>`
 * with cwd = the command's resolved workdir.
 *
 * Fixture hygiene: hooks are real executable scripts in a temp dir, each
 * writing its observed argv/cwd to a capture file — no credential shapes, no
 * repo writes. Every test starts from an EMPTY hooks dir so case order
 * cannot leak hook state.
 */
import { mkdtemp, mkdir, readFile, rm, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { apply } from "./bash-guard";

/** The rules used by these tests: `gated soft` asks, anything else denies. */
const RULES = `{
  "commands": ["gated"],
  "verdict": "deny",
  "reason": "test rule file: gated asks, gated-hard denies",
  "subcommands": { "soft": "ask" }
}`;

let work: string;
let guardsDir: string;
let hooksDir: string;
let capture: string;

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), "bg-hooks-"));
  guardsDir = join(work, "guards");
  hooksDir = join(work, "hooks");
  capture = join(work, "capture.txt");
  await mkdir(guardsDir);
  await writeFile(join(guardsDir, "test.json"), RULES, "utf8");
});

afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

/** Empty the hooks dir so each case decides its own hook population. */
beforeEach(async () => {
  await rm(hooksDir, { recursive: true, force: true });
  await mkdir(hooksDir);
  await rm(capture, { force: true });
});

/**
 * Mount apply() with a fake ctx that captures the shell runs and approval
 * requests. The shell accepts everything; the approval seam answers
 * `approvalVerdict`.
 */
function mountTool(approvalVerdict: string) {
  let tool: { execute(args: unknown, exec: unknown): Promise<unknown> } | undefined;
  const ran: string[] = [];
  const approvalRequests: { reason: string }[] = [];
  const noop = () => {};
  const ctx = {
    logger: { debug: noop, info: noop, warn: noop, error: noop },
    on() {
      return () => {};
    },
    get(name: string) {
      if (name === "approval") {
        return {
          request(req: { reason: string }) {
            approvalRequests.push({ reason: req.reason });
            return Promise.resolve(approvalVerdict);
          },
        };
      }
      return undefined;
    },
    shell: {
      sandboxMode: undefined,
      resolve(req: { command: string }) {
        return req;
      },
      run(req: { command: string }) {
        ran.push(req.command);
        return Promise.resolve({
          exitCode: 0,
          signal: null,
          timedOut: false,
          aborted: false,
          timeoutMs: 1000,
          stdout: { text: `ran: ${req.command}` },
          stderr: { text: "" },
        });
      },
    },
    tools: {
      register(t: never) {
        tool = t as never;
      },
    },
  };
  apply(ctx as never, { guardsDir, hooksDir, hookTimeoutMs: 2000 });
  if (tool === undefined) throw new Error("apply() did not register the bash tool");
  return {
    async execute(command: string, agent?: Record<string, unknown>) {
      return (await tool!.execute(
        { command, description: "test command" },
        { agent: agent ?? { session: { header: {} } }, callId: "call-1", signal: undefined },
      )) as unknown as { text: string; ran: string; rewritten: boolean };
    },
    ran,
    approvalRequests,
  };
}

/** Write one executable hook into the (already clean) hooks dir. */
async function addHook(name: string, body: string): Promise<void> {
  const path = join(hooksDir, name);
  await writeFile(path, `#!/usr/bin/env bash\n${body}\n`, "utf8");
  await chmod(path, 0o755);
}

/** A hook that records its argv and cwd, then exits with `code`. */
function observingHook(code: number): string {
  return [
    'depth="$1"; command="$2"',
    `printf 'argv:%s\\ncommand:%s\\ncwd:%s\\nverdict:%s\\nprofile:%s' "$depth" "$command" "$PWD" "$DSH_HOOK_VERDICT" "$DSH_HOOK_PROFILE" > "${capture}"`,
    `exit ${code}`,
  ].join("\n");
}

describe("bash-guard pre-command hooks (#345)", () => {
  it("a hook exiting 0 escapes an ask: no approval request, command runs", async () => {
    await addHook("01-allow", observingHook(0));
    const mounted = mountTool("allowed-once");
    await mounted.execute("gated soft write-something");
    expect(mounted.ran).toEqual(["gated soft write-something"]);
    expect(mounted.approvalRequests).toEqual([]);
  });

  it("the hook receives depth, command, verdict, and the resolved workdir", async () => {
    await addHook("01-allow", observingHook(0));
    const mounted = mountTool("allowed-once");
    await mounted.execute("gated soft write-something", {
      session: { header: { delegationDepth: 2 } },
      options: {},
    });
    const seen = await readFile(capture, "utf8");
    expect(seen).toContain("argv:2");
    expect(seen).toContain("command:gated soft write-something");
    expect(seen).toContain("verdict:ask");
    // The hook's cwd is the command's workdir: the agent's session cwd when
    // it has one, else the harness process cwd (undefined workdir).
    expect(seen).toContain(`cwd:${process.cwd()}`);
  });

  it("a hook exiting non-zero keeps the ask: approval is requested as before", async () => {
    await addHook("01-decline", observingHook(1));
    const mounted = mountTool("allowed-once");
    await mounted.execute("gated soft write-something");
    expect(mounted.ran).toEqual(["gated soft write-something"]);
    expect(mounted.approvalRequests).toHaveLength(1);
  });

  it("a rule-verdict deny is escapable: the hook runs the original command", async () => {
    await addHook("01-allow", observingHook(0));
    const mounted = mountTool("allowed-once");
    await mounted.execute("gated hard-delete");
    expect(mounted.ran).toEqual(["gated hard-delete"]);
    expect(mounted.approvalRequests).toEqual([]);
  });

  it("with no hook allowing, a deny still throws", async () => {
    await addHook("01-decline", observingHook(1));
    const mounted = mountTool("allowed-once");
    await expect(mounted.execute("gated hard-delete")).rejects.toThrow(/test rule file/);
    expect(mounted.ran).toEqual([]);
  });

  it("an unparseable command is NOT escapable: the hook never decides", async () => {
    await addHook("01-allow", observingHook(0));
    const mounted = mountTool("allowed-once");
    // An unterminated quote cannot parse; the deny is fail-closed and no
    // hook may run an unparsed command. The capture file proves the hook
    // was never even invoked.
    await expect(mounted.execute("gated soft 'unterminated")).rejects.toThrow(/parse/i);
    expect(mounted.ran).toEqual([]);
    expect(mounted.approvalRequests).toEqual([]);
    await expect(readFile(capture, "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("a non-executable hook file is ignored and the ask stands", async () => {
    const path = join(hooksDir, "02-not-executable");
    await writeFile(path, "#!/usr/bin/env bash\nexit 0\n", "utf8");
    await chmod(path, 0o644);
    const mounted = mountTool("allowed-once");
    await mounted.execute("gated soft write-something");
    // The ask path ran with approval, so the non-executable hook did not allow.
    expect(mounted.approvalRequests).toHaveLength(1);
  });

  it("a hook that cannot spawn (bad interpreter) fails closed", async () => {
    // Written RAW (not via addHook) so the script's only interpreter line is
    // the broken one — addHook would prepend a working bash shebang.
    const path = join(hooksDir, "01-broken");
    await writeFile(path, "#!/no/such/interpreter\nexit 0\n", "utf8");
    await chmod(path, 0o755);
    const mounted = mountTool("allowed-once");
    await mounted.execute("gated soft write-something");
    expect(mounted.approvalRequests).toHaveLength(1);
  });

  it("a hook that times out fails closed", async () => {
    await addHook("01-slow", "sleep 30");
    const mounted = mountTool("allowed-once");
    await mounted.execute("gated soft write-something");
    expect(mounted.approvalRequests).toHaveLength(1);
  });

  it("commands the rules allow never consult a hook", async () => {
    await addHook("01-spy", observingHook(0));
    const mounted = mountTool("allowed-once");
    await mounted.execute("plain-command arg");
    expect(mounted.ran).toEqual(["plain-command arg"]);
    // No gated command ran, so the hook was never invoked and wrote nothing.
    await expect(readFile(capture, "utf8")).rejects.toThrow(/ENOENT/);
  });

  it("no hooks at all: behavior is byte-for-byte the pre-hook ask path", async () => {
    const mounted = mountTool("allowed-once");
    await mounted.execute("gated soft write-something");
    expect(mounted.ran).toEqual(["gated soft write-something"]);
    expect(mounted.approvalRequests).toHaveLength(1);
  });
});
