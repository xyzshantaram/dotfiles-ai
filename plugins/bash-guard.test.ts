/**
 * Regression tests for the bash-guard rule layer and its `bash` tool wiring.
 *
 * The rule-layer tests call `evaluate` directly against the repo's real rule
 * files, the same way bash-guard-rewrite.test.ts does. The tool-layer tests
 * mount `apply()` with a fake ctx and check the wiring that no other test
 * reaches: a deny never executes, an approved ask runs the REPLACEMENT
 * command, a rejected ask does not run.
 *
 * Old note, kept for history: an earlier version of this suite drove a
 * `tools/pre-execute` listener. That listener is gone. The guard registers its
 * own `bash` tool now, and `evaluate` returns a GuardOutcome whose `command`
 * is the exact string that runs. The frozen-arguments problem the old suite
 * pinned cannot happen any more, because nothing writes back into the model's
 * arguments: a rewrite travels in the outcome instead.
 */
import { describe, expect, it } from "vitest";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { apply, evaluate, type GuardOutcome } from "./bash-guard";

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
 * Run one command through `evaluate` against the repo's real rule files.
 * safePaths is empty, so the scratch escape can never mask a rule verdict.
 */
async function run(command: string): Promise<GuardOutcome> {
  return evaluate(fakeCtx() as never, [GUARDS_DIR], command, [], undefined, {});
}

describe("bash-guard rule layer", () => {
  it("runs the rg command for a piped recursive grep", async () => {
    // guards/grep.json is readOnly and a grep carries no mutating predicate, so
    // the translation auto-runs instead of asking. A `run` outcome carries no
    // `original`: the card recovers what the model wrote from its own args, and
    // presentationMeta publishes what actually ran.
    const command = 'grep -rln "agentPresets" /some/path/ | head -20';
    const outcome = await run(command);
    expect(outcome.action).toBe("run");
    expect((outcome as { command: string }).command).toContain("rg");
    expect((outcome as { command: string }).command).toContain("head -20");
    expect((outcome as { rewritten: boolean }).rewritten).toBe(true);
  });

  it("suggests rg for a plain recursive grep", async () => {
    const outcome = await run("grep -rn foo src/");
    expect(outcome.action).toBe("run");
    expect((outcome as { command: string }).command).toBe("rg -n foo src/");
    expect((outcome as { reason: string }).reason).toContain("Run this instead");
  });

  it("suggests fd for a find by name", async () => {
    const outcome = await run("find . -name '*.ts'");
    expect(outcome.action).toBe("run");
    expect((outcome as { command: string }).command).toBe("fd --search-path . -g '*.ts'");
  });

  it("surfaces a mutating find predicate and tells the model to ask first", async () => {
    const outcome = await run("find . -name '*.log' -exec rm {} \\;");
    // Under the old contract this denied, because an approval would have run
    // the ORIGINAL find. The tool now executes the outcome's command after the
    // user approves the shown replacement, so the ask is honest. The
    // translation must still keep the mutating `-x rm` predicate visible in
    // that replacement and must still carry the ask-first note.
    const ask = outcome as { action: string; command: string; reason: string };
    expect(outcome.action).toBe("ask");
    expect(ask.command).toContain("-x rm");
    expect(ask.reason).toContain("This command changes files. Ask the user before you run it.");
  });

  it("denies -delete with the blocker named and no suggestion", async () => {
    const outcome = await run("find . -delete");
    expect(outcome.action).toBe("deny");
    expect((outcome as { reason: string }).reason).toContain("-delete");
    expect((outcome as { reason: string }).reason).not.toContain("Run this instead");
  });

  it("does not splice a command that sits inside a wrapper", async () => {
    const outcome = await run('sh -c "grep -rn foo ."');
    expect(outcome.action).toBe("deny");
    // Falls through to the rule's own reason, never a suggestion built from
    // offsets that address a rebuilt string.
    expect((outcome as { reason: string }).reason).not.toContain("Run this instead");
  });

  it("does not re-quote an unquoted glob", async () => {
    const outcome = await run("grep foo *.ts");
    expect(outcome.action).toBe("deny");
    expect((outcome as { reason: string }).reason).not.toContain("Run this instead");
  });

  it("does not translate a command that needs a shell expansion", async () => {
    const outcome = await run('grep "$pattern" .');
    expect(outcome.action).toBe("deny");
    expect((outcome as { reason: string }).reason).not.toContain("Run this instead");
  });

  it("drops a short-flag cluster whose flag takes the rest as its value", async () => {
    // rg parses -rln as -r with the attached value "ln". Dropping just the
    // letter would leave a cluster rg reads differently, so the whole word
    // must go.
    const outcome = await run("rg -rln foo /tmp");
    expect(outcome.action).toBe("run");
    expect((outcome as { command: string }).command).toBe("rg foo /tmp");
    expect((outcome as { reason: string }).reason).toContain("--replace");
    expect((outcome as { rewritten: boolean }).rewritten).toBe(true);
  });

  it("allows rg", async () => {
    const outcome = await run("rg -n foo src/");
    expect(outcome).toEqual({ action: "run", command: "rg -n foo src/", rewritten: false });
  });

  it("allows a read-only git verb", async () => {
    const outcome = await run("git status");
    expect(outcome).toEqual({ action: "run", command: "git status", rewritten: false });
  });

  // The pre-execute listener dispatched on the tool name, so a non-bash call
  // could bypass the guard. The listener is gone. apply() registers a tool
  // named `bash` and nothing else, so there is no non-bash path left to
  // exercise. Skipped rather than deleted so the gap stays visible.
  it.skip("passes a non-bash tool straight through", () => {
    // No listener exists any more, so this case has no subject under the
    // current architecture. The tool-layer tests below cover the one tool the
    // plugin does register.
  });
});

describe("bash-guard message summaries", () => {
  // A person reads the approval text on a card that already shows the command
  // underneath, so the ask message must be ONE scannable line and must not
  // repeat the command. A model reads the deny text and needs the full reason,
  // so the deny message keeps the command and the bulleted rules.
  it("summarises an approval in one line, without repeating the command", async () => {
    const outcome = await run("git commit -m wip");
    expect(outcome.action).toBe("ask");
    expect((outcome as { reason: string }).reason).toBe(
      "bash-guard: git blocked by 1 filter (commit is blocked) — needs your approval",
    );
    expect((outcome as { reason: string }).reason).not.toContain("\n");
    expect((outcome as { reason: string }).reason).not.toContain("wip");
  });

  it("keeps the command and the rule list in a denial", async () => {
    const outcome = await run("git filter-branch --all");
    expect(outcome.action).toBe("deny");
    const lines = (outcome as { reason: string }).reason.split("\n");
    expect(lines[0]).toBe("bash-guard: git denied by 1 filter (filter-branch is blocked)");
    expect((outcome as { reason: string }).reason).toContain("git filter-branch --all");
    expect((outcome as { reason: string }).reason).toContain("Matched rule(s):");
  });
});

describe("bash-guard tool wiring", () => {
  /** The result shape ctx.shell.run must return; renderShellResult reads it. */
  function shellResult(stdoutText: string) {
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      timeoutMs: 1000,
      stdout: { text: stdoutText },
      stderr: { text: "" },
    };
  }

  /**
   * Mount apply() with a fake ctx that captures the registered `bash` tool,
   * records every command the fake shell was asked to run, and answers the
   * approval seam with `approvalVerdict`.
   */
  function mountTool(approvalVerdict: string) {
    let tool: { execute(args: unknown, exec: unknown): Promise<string> } | undefined;
    const ran: string[] = [];
    const noop = () => {};
    const approvalRequests: { reason: string }[] = [];
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
          return Promise.resolve(shellResult(`ran: ${req.command}`));
        },
      },
      tools: {
        register(t: never) {
          tool = t as never;
        },
      },
    };
    apply(ctx as never, { guardsDir: GUARDS_DIR });
    if (tool === undefined) throw new Error("apply() did not register the bash tool");
    return {
      async execute(command: string) {
        const agent = { session: { header: {} } };
        // The tool's canonical value is an object, not a string: `text` is what
        // render() shows the model, and `ran` plus `rewritten` are what
        // presentationMeta publishes to the card.
        return (await tool!.execute(
          { command, description: "test command" },
          { agent, callId: "call-1", signal: undefined },
        )) as unknown as { text: string; ran: string; rewritten: boolean };
      },
      ran,
      approvalRequests,
    };
  }

  it("never executes a denied command", async () => {
    const mounted = mountTool("allowed-once");
    await expect(mounted.execute("git filter-branch --all")).rejects.toThrow(/filter-branch/);
    expect(mounted.ran).toEqual([]);
    expect(mounted.approvalRequests).toEqual([]);
  });

  it("executes an allowed command and returns its output", async () => {
    const mounted = mountTool("allowed-once");
    const value = await mounted.execute("rg -n foo src/");
    expect(mounted.ran).toEqual(["rg -n foo src/"]);
    expect(value.text).toContain("ran: rg -n foo src/");
    // Nothing was rewritten, so the card must not mark this call.
    expect(value.rewritten).toBe(false);
    expect(value.ran).toBe("rg -n foo src/");
  });

  it("auto-runs a readOnly rewrite without asking", async () => {
    const mounted = mountTool("allowed-once");
    const value = await mounted.execute("rg -rln foo /tmp");
    // guards/rg.json is readOnly, so the drop applies and the call never
    // prompts. The shell must still see the rewritten form.
    expect(mounted.ran).toEqual(["rg foo /tmp"]);
    expect(mounted.approvalRequests).toEqual([]);
    expect(value.rewritten).toBe(true);
    expect(value.ran).toBe("rg foo /tmp");
  });

  it("on an approved ask executes the REPLACEMENT command, not the original", async () => {
    const mounted = mountTool("allowed-once");
    // A mutating find is the case that still asks despite a readOnly rule:
    // mutatingWhy overrides the flag. It also rewrites, so this exercises the
    // approve-then-run-the-replacement path that rg no longer can.
    const original = "find . -name '*.log' -exec rm {} \\;";
    const value = await mounted.execute(original);
    expect(mounted.approvalRequests).toHaveLength(1);
    // The prompt shows both commands, so the person knows what changed.
    expect(mounted.approvalRequests[0]!.reason).toContain(original);
    expect(mounted.approvalRequests[0]!.reason).toContain("-x rm");
    // The shell saw the replacement, never the original.
    expect(mounted.ran).toHaveLength(1);
    expect(mounted.ran[0]).toContain("-x rm");
    expect(mounted.ran[0]).not.toBe(original);
    expect(value.rewritten).toBe(true);
  });

  it("does not execute when the ask is rejected", async () => {
    const mounted = mountTool("rejected");
    await expect(mounted.execute("find . -name '*.log' -exec rm {} \\;")).rejects.toThrow(
      /rejected/,
    );
    expect(mounted.ran).toEqual([]);
  });
});
