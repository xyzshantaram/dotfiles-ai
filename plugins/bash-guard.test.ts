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
import { spawnSync } from "node:child_process";
import {
  apply,
  buildEscalationApprovalReason,
  buildGuardApprovalReason,
  decidePipeExit,
  ESCALATION_APPROVAL_KIND,
  evaluate,
  formatPipeStages,
  GUARD_APPROVAL_KIND,
  parseStepCapture,
  planPipeCapture,
  renderDegradedCodesLine,
  renderDegradedScopeNote,
  renderStepReport,
  type GuardOutcome,
} from "./bash-guard";
import {
  isBashGuardReason,
  isHostEscalationReason,
  isRetiredEscalationPrompt,
} from "./tool-render/src/guard.js";

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
  function mountTool(approvalVerdict: string, shellRun?: (command: string) => unknown) {
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
          if (shellRun !== undefined) return Promise.resolve(shellRun(req.command));
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

  it("tells the model what RAN, and never to run it again", async () => {
    const mounted = mountTool("allowed-once");
    const value = await mounted.execute("rg -rln foo /tmp");
    // The guard already ran the replacement. The deny wording belongs to the
    // deny path only: on this path it is false, and it makes the model run
    // the same command a second time.
    expect(value.text).not.toContain("Run this instead");
    expect(value.text).not.toContain("that command is not run directly");
    expect(value.text).toContain("bash-guard: ran this instead");
    // The caller adds the `bash-guard:` prefix, so the note must not carry
    // its own and double it.
    expect(value.text).not.toContain("bash-guard: bash-guard:");
    // The teaching note survives, so the model still learns to write the
    // preferred form itself next time.
    expect(value.text).toContain("Why:");
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

  /** Run the command for real in bash, mapping the result like a shell executor. */
  function realBash(command: string) {
    const res = spawnSync("bash", ["-c", command], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return {
      exitCode: res.status ?? 0,
      signal: res.signal,
      timedOut: false,
      timeoutMs: 60000,
      stdout: { text: res.stdout ?? "" },
      stderr: { text: res.stderr ?? "" },
    };
  }

  type PipeValue = {
    text: string;
    ran: string;
    rewritten: boolean;
    exitCode: number | null;
    denied: boolean;
    pipeStages?: { name?: string; exitCode: number }[];
  };

  async function runReal(command: string): Promise<{ value: PipeValue; ran: string[] }> {
    const mounted = mountTool("allowed-once", realBash);
    const value = (await mounted.execute(command)) as unknown as PipeValue;
    return { value, ran: mounted.ran };
  }

  it("reports a genuine mid-pipeline failure instead of exit 0", async () => {
    const { value, ran } = await runReal("false | cat");
    expect(ran).toHaveLength(1);
    expect(ran[0]).toContain("set -o pipefail");
    expect(ran[0]).toContain("PIPESTATUS");
    expect(value.exitCode).toBe(1);
    expect(value.pipeStages).toEqual([
      { name: "false", exitCode: 1 },
      { name: "cat", exitCode: 0 },
    ]);
    expect(value.text).toContain("[exit code: 1]");
    // Complete per-statement capture: the single pipeline's failure is
    // attributed to its stages, and the "final pipeline only" note is gone
    // — with every statement captured it no longer describes reality.
    expect(value.text).toContain("[exit codes (1 of 1 statements failed):");
    expect(value.text).toContain("`false` | `cat` → 1, 0");
    expect(value.text).not.toContain("earlier lines of a compound command were not captured");
    // The capture rides a side file, never the output stream.
    expect(value.text).not.toContain("pipestatus-");
  });

  it("does not fail the benign producer-dies-of-SIGPIPE idiom", async () => {
    const { value } = await runReal("seq 1 100000 | head -3");
    expect(value.exitCode).toBe(0);
    expect(value.text).not.toContain("[exit code:");
    expect(value.text).not.toContain("[exit codes:");
    // The stages were still captured as data: producer 141, consumer 0.
    expect(value.pipeStages).toEqual([
      { name: "seq", exitCode: 141 },
      { name: "head", exitCode: 0 },
    ]);
  });

  it("leaves a command that neither pipes nor fails exactly alone", async () => {
    const { value, ran } = await runReal("echo hello-pipe-test");
    expect(ran).toEqual(["echo hello-pipe-test"]);
    expect(value.exitCode).toBe(0);
    expect(value.pipeStages).toBeUndefined();
    expect(value.text).not.toContain("[exit codes:");
    expect(value.text).not.toContain("[exit code:");
  });

  it("reports a successful compound command with data, not a bare disclaimer", async () => {
    // Ticket #144a, via #143: every statement's codes are captured, so the
    // scope note is unnecessary and goes away — the report carries what it
    // knows (all statements exited 0) instead of a disclaimer with no
    // numbers. Ticket #144's instruction: remove the note rather than leave
    // one that no longer describes reality.
    const { value } = await runReal("echo one | cat; echo two | cat");
    expect(value.exitCode).toBe(0);
    expect(value.pipeStages).toEqual([
      { name: "echo", exitCode: 0 },
      { name: "cat", exitCode: 0 },
    ]);
    expect(value.text).toContain("[exit codes: all 2 statements exited 0]");
    expect(value.text).not.toContain("exit codes cover the final pipeline only");
    expect(value.text).not.toContain("earlier lines of a compound command were not captured");
  });

  it("attributes a multi-line script's failure to the statement that produced it", async () => {
    // The owner's report: several lines on screen, numbers that name no
    // line. Per-statement capture attributes the failure to `false | cat`
    // itself — no "final pipeline only" summary, no scope note.
    const { value } = await runReal("echo starting\nfalse | cat");
    expect(value.exitCode).toBe(1);
    expect(value.pipeStages).toEqual([
      { name: "false", exitCode: 1 },
      { name: "cat", exitCode: 0 },
    ]);
    expect(value.text).toContain("[exit codes (1 of 2 statements failed):");
    expect(value.text).toContain("`false` | `cat` → 1, 0");
    expect(value.text).not.toContain("exit codes cover the final pipeline only");
  });

  it("surfaces a mid-script failure the final pipeline would hide", async () => {
    // Ticket #143 inverts this case's old premise: the first line's pipeline
    // fails, the final command succeeds — and per-statement capture now
    // attributes the failure to `false | cat` instead of reporting exit 0
    // with a limitation note. The process exit stays 0 (bash semantics are
    // never rewritten), but the failure is data, not a disclaimer.
    const { value } = await runReal("false | cat\necho done");
    expect(value.exitCode).toBe(0);
    expect(value.pipeStages).toEqual([{ exitCode: 0 }]);
    expect(value.text).toContain("[exit codes (1 of 2 statements failed):");
    expect(value.text).toContain("`false` | `cat` → 1, 0");
    expect(value.text).not.toContain("exit codes cover the final pipeline only");
  });

  it("names a brace group's pipeline from the capture, not the static plan", async () => {
    // A brace group disqualifies static final-pipeline naming (the
    // last-executed pipeline is not decidable from source), so the legacy
    // structured stages stay bare — but the per-statement stream watches
    // the stages run and names them factually.
    const { value } = await runReal("{ false | cat; }");
    expect(value.exitCode).toBe(1);
    expect(value.pipeStages).toEqual([{ exitCode: 1 }, { exitCode: 0 }]);
    expect(value.text).toContain("[exit codes (1 of 1 statements failed):");
    expect(value.text).toContain("`false` | `cat` → 1, 0");
    expect(value.text).not.toContain("exit codes cover the final pipeline only");
  });

  it("lets a piped sandbox-style failure surface a non-zero exit", async () => {
    // The owner's deno reproducer shape: a producer refused by the sandbox,
    // piped through tail. Before the wrap the call reported exit 0 and the
    // host's denial gate — matchesSignature returns false on exit 0 — could
    // never fire. After the wrap the failure is detectable as data.
    const { value } = await runReal(
      `node -e "console.error('Read-only file system (os error 30)'); process.exit(1)" 2>&1 | tail -2`,
    );
    expect(value.exitCode).toBe(1);
    expect(value.pipeStages).toEqual([
      { name: "node", exitCode: 1 },
      { name: "tail", exitCode: 0 },
    ]);
    expect(value.text).toContain("[exit code: 1]");
  });

  it("propagates a host-computed sandbox denial into data and markers", async () => {
    const mounted = mountTool("allowed-once", () => ({
      exitCode: 1,
      signal: null,
      timedOut: false,
      timeoutMs: 1000,
      stdout: { text: "partial\n" },
      stderr: { text: "Read-only file system (os error 30)" },
      sandbox: { denied: true, mode: "workspace-write" },
    }));
    const value = (await mounted.execute("echo denied-probe")) as unknown as PipeValue;
    expect(value.denied).toBe(true);
    expect(value.exitCode).toBe(1);
    expect(value.text).toContain("[sandbox: file access denied under workspace-write mode]");
  });

  it("attributes an && chain per operand with no scope note (#143, #144b)", async () => {
    // The owner's transcript shape: `cd && cp && pipeline`. Statically the
    // chain disqualifies naming — but the trap watches every operand run,
    // so the report names each operand's codes factually. No bare numbers,
    // no disclaimer.
    const { value } = await runReal("cd /tmp && echo ok-chain && seq 1 3 | head -2 | wc -l");
    expect(value.exitCode).toBe(0);
    expect(value.text).toContain("[exit codes: all 3 statements exited 0]");
    expect(value.text).not.toContain("exit codes cover the final pipeline only");
    expect(value.text).not.toContain("unconfirmed");
  });

  it("attributes a failing && chain to the operand that failed", async () => {
    const { value } = await runReal("cd /tmp && false && seq 1 3 | head -1");
    expect(value.exitCode).toBe(1);
    expect(value.text).toContain("[exit codes (1 of 2 statements failed):");
    expect(value.text).toContain("`false` 1");
    // The skipped pipeline leaves no record: nothing plausible is printed
    // for a command that never ran.
    expect(value.text).not.toContain("seq");
    expect(value.text).not.toContain("exit codes cover the final pipeline only");
  });

  it("closes re-entrancy: no handler command appears in the capture", async () => {
    // The last statement would otherwise repeat (the EOF quirk), and any
    // command inside our own trap handlers would pollute the stream. A
    // script ending in a pipeline proves both are closed: exactly two
    // statements, no `__dsh_` text, no handler builtins.
    const { value } = await runReal("echo reentrancy-probe\necho tail-pipe | cat");
    expect(value.exitCode).toBe(0);
    expect(value.text).toContain("[exit codes: all 2 statements exited 0]");
    expect(value.text).not.toContain("__dsh_");
    expect(value.text).not.toContain("PIPESTATUS");
    expect(value.text).not.toContain("BASH_COMMAND");
  });

  it("leaves set -e semantics alone and still aborts on failure", async () => {
    // The handler ends in a zero status: it can neither skip a command nor
    // swallow the abort. The capture holds the records up to the failure.
    const { value } = await runReal("set -e\necho first\nfalse\necho NEVER");
    expect(value.exitCode).toBe(1);
    expect(value.text).not.toContain("NEVER");
    expect(value.text).toContain("[exit codes (1 of 3 statements failed):");
    expect(value.text).toContain("`false` 1");
  });

  it("survives a mid-script exit with the requested status", async () => {
    const { value } = await runReal("echo one\necho two | cat\nexit 3");
    expect(value.exitCode).toBe(3);
    expect(value.text).toContain("[exit code: 3]");
    expect(value.text).toContain("`exit 3` 3");
  });

  it("keeps the capture out of the command's own stdout and stderr", async () => {
    const { value } = await runReal("echo out-line\necho err-line >&2\necho last | cat");
    expect(value.exitCode).toBe(0);
    // User output is intact and carries no capture records.
    expect(value.text).toContain("out-line");
    expect(value.text).toContain("err-line");
    expect(value.text).not.toContain(" :: ");
    expect(value.text).toContain("[exit codes: all 3 statements exited 0]");
  });

  it("degrades with a coverage note when the script replaces the DEBUG trap", async () => {
    // The command runs fine — degradation never breaks it — but statements
    // after the replacement are unattributed, so the legacy report carries
    // the loss wording instead of claiming coverage. (`false | cat` fails
    // under pipefail, so the legacy codes travel with the note.)
    const { value } = await runReal("echo before\ntrap 'true' DEBUG\nfalse | cat");
    expect(value.exitCode).toBe(1);
    expect(value.text).toContain("before");
    expect(value.text).not.toContain("[exit codes: all");
    expect(value.text).toContain("[exit codes: false 1, cat 0]");
    expect(value.text).toContain("exit codes cover the final pipeline only");
    expect(value.text).toContain("per-statement capture was lost");
    expect(value.text).toContain("replaced or cleared");
  });

  it("degrades with a coverage note when the script replaces the EXIT trap", async () => {
    // No END marker without our EXIT handler: the legacy report stands in.
    const { value } = await runReal("echo before\ntrap 'true' EXIT\nfalse | cat");
    expect(value.exitCode).toBe(1);
    expect(value.text).toContain("before");
    expect(value.text).not.toContain("[exit codes: all");
    expect(value.text).toContain("exit codes cover the final pipeline only");
    expect(value.text).toContain("per-statement capture was lost");
  });

  it("renders the unconfirmed candidate when degraded on a chain (#144b)", async () => {
    // Forced degrade (DEBUG trap replaced first): the chain ran its final
    // pipeline, the legacy epilogue holds its stages, and the report names
    // the candidate beside the warning — never bare.
    const { value } = await runReal(
      "trap 'true' DEBUG\ncd /tmp && echo ok && false | cat",
    );
    expect(value.exitCode).toBe(1);
    expect(value.text).toContain("unconfirmed");
    expect(value.text).toContain("false 1, cat 0");
    expect(value.text).not.toContain("[exit codes: 1, 0]");
    expect(value.text).toContain("per-statement capture was lost");
  });

  it("withholds numbers when a degraded chain short-circuited (#144b)", async () => {
    // Forced degrade: `false` fails first, so `echo hi | cat` never runs
    // and the single code cannot be its stages (arity backstop). No bare
    // numbers, no leader claim — the scope note stands alone, honestly.
    const { value } = await runReal("trap 'true' DEBUG\nfalse && echo hi | cat");
    expect(value.exitCode).toBe(1);
    expect(value.text).not.toContain("[exit codes:");
    // The load-bearing one (#144 review). Dropping the arity backstop renders
    // "[exit codes (unconfirmed — ...): echo 1]" — codes that really belong to
    // `false`, attributed to a command that never ran. That misrender slips
    // past BOTH assertions above: it contains "[exit codes (" rather than
    // "[exit codes:", and it still prints the scope note. Without this line the
    // backstop is pinned only at render level, and the live path — the one that
    // actually reaches a reader — is unguarded.
    expect(value.text).not.toContain("unconfirmed");
    expect(value.text).toContain("exit codes cover the final pipeline only");
  });

  it("degrades a backgrounded tail to the legacy report (#142 preserved)", async () => {
    // BASH_COMMAND carries no `&`: the backgrounded statement's records
    // would pair stale codes with names, so the whole command falls back.
    // The legacy #142 rule still withholds the names themselves.
    const { value } = await runReal("sleep 0.1 & echo bg-tail | cat");
    expect(value.exitCode).toBe(0);
    expect(value.text).not.toContain("[exit codes: all");
    expect(value.pipeStages).toEqual([
      { name: "echo", exitCode: 0 },
      { name: "cat", exitCode: 0 },
    ]);
    expect(value.text).toContain("exit codes cover the final pipeline only");
    expect(value.text).toContain("per-statement capture was lost");
  });

  it("degrades a subshell script rather than clearing it (#143 scope)", async () => {
    // `(false | cat)` fires no trap at all: claiming "all statements
    // succeeded" would be a lie the legacy note refuses to tell.
    const { value } = await runReal("(false | cat)\necho hi-visible");
    expect(value.exitCode).toBe(0);
    expect(value.text).toContain("hi-visible");
    expect(value.text).not.toContain("[exit codes: all");
    expect(value.text).toContain("exit codes cover the final pipeline only");
    expect(value.text).toContain("subshell");
  });

  it("captures a 200-statement script with one printf per statement", async () => {
    // Overhead is measured, not asserted: one builtin printf per command
    // into a pre-opened fd, no forks. The count pins completeness; the
    // timing is recorded in the ticket report (about 8ms here).
    const lines = Array.from({ length: 200 }, (_, i) => `echo line-${i} | cat`);
    const started = Date.now();
    const { value } = await runReal(lines.join("\n"));
    const elapsedMs = Date.now() - started;
    expect(value.exitCode).toBe(0);
    expect(value.text).toContain("[exit codes: all 200 statements exited 0]");
    expect(elapsedMs).toBeLessThan(30_000);
  });
});

describe("approval reason kinds", () => {
  // The #105 contract: the YAML this file builds, run through the real
  // classifier the card reads. A hand-written approximation of the YAML
  // would prove nothing — these tests call the real builders.
  it("marks the escalation prompt as an escalation, not a guard reason", () => {
    const reason = buildEscalationApprovalReason({
      standingMode: "workspace-write",
      escalateTo: "danger-full-access",
      justification: "write the probe file outside the workspace",
      runs: "echo probe > ~/probe.txt",
    });
    expect(isBashGuardReason(reason)).toBe(false);
  });

  it("stamps kind: escalation on the escalation prompt", () => {
    const reason = buildEscalationApprovalReason({
      standingMode: "workspace-write",
      escalateTo: "danger-full-access",
      justification: "j",
      runs: "true",
    });
    expect(reason).toContain(`kind: ${ESCALATION_APPROVAL_KIND}`);
    expect(ESCALATION_APPROVAL_KIND).toBe("escalation");
  });

  it("still marks the rewrite prompt as a guard reason", () => {
    const reason = buildGuardApprovalReason({
      summary: "bash-guard: this command runs in a different form.",
      wrote: "grep -rn foo .",
      runs: "rg -n foo .",
      why: "rg is faster",
    });
    expect(reason).toContain(`kind: ${GUARD_APPROVAL_KIND}`);
    expect(isBashGuardReason(reason)).toBe(true);
  });

  it("keeps PRE-STAMP guard YAML guarded, so history does not lose its banner", () => {
    // Every approval recorded before the `kind` stamp shipped carries no
    // discriminator. A strict kind check reclassified ALL of it as
    // not-a-guard-reason: old cards dumped raw YAML instead of a banner, and
    // the guarded-approvals replay re-derived the wrong answer from the log.
    // Written as the literal text a real log holds, not via the builder --
    // the builder can no longer produce this shape.
    const legacy = [
      'summary: "bash-guard: git blocked by 1 filter (commit is blocked)"',
      "wrote: git commit -m x",
      "runs: git commit -m x",
      "why: commit is blocked",
      "",
    ].join("\n");
    expect(legacy).not.toContain("kind:");
    expect(isBashGuardReason(legacy)).toBe(true);
  });

  it("does NOT adopt pre-stamp ESCALATION YAML as a guard reason", () => {
    // The whole of #105: classifying escalation YAML as a guard reason is
    // what painted escalations blue. The legacy carve-out must not undo the
    // fix for historical rows, so escalations are excluded twice over.
    const legacyEscalation = [
      `summary: 'bash-guard: escalate from "workspace-write" to "danger-full-access"'`,
      "justification: write the probe file outside the workspace",
      "runs: echo probe > ~/probe.txt",
      "",
    ].join("\n");
    expect(legacyEscalation).not.toContain("kind:");
    expect(isBashGuardReason(legacyEscalation)).toBe(false);
  });

  it("excludes pre-stamp escalation YAML on EITHER tell alone", () => {
    // Pinned separately because a false positive here reintroduces #105:
    // neither exclusion may quietly stop working. `justification` is a field
    // a guard reason has never carried (GuardApprovalReasonFields), and the
    // summary prefix is a fixed literal.
    const summaryOnly = [
      `summary: 'bash-guard: escalate from "read-only" to "workspace-write"'`,
      "runs: 'true'",
      "",
    ].join("\n");
    const justificationOnly = [
      'summary: "bash-guard: something else entirely"',
      "justification: j",
      "runs: 'true'",
      "",
    ].join("\n");
    expect(isBashGuardReason(summaryOnly)).toBe(false);
    expect(isBashGuardReason(justificationOnly)).toBe(false);
  });

  it("matches the host's plain-string escalation with one narrow matcher", () => {
    const reason =
      "escalate sandbox to danger-full-access: sync.sh installs plugins into ~/.dsh";
    expect(isHostEscalationReason(reason)).toBe(true);
    expect(isBashGuardReason(reason)).toBe(false);
  });

  it("keeps the legacy plain-text rewrite prompt guarded", () => {
    // The blue outline and its stickiness are unchanged for real rewrites,
    // including asks raised before the YAML form existed.
    expect(
      isBashGuardReason(
        "bash-guard: the following command needs approval:\n\n  git push\n\nMatched rule(s):\n  • git (push): denied.\n",
      ),
    ).toBe(true);
  });

  it("does not guard the retired plain-text escalation prompt", () => {
    expect(
      isRetiredEscalationPrompt(
        'bash-guard: escalate this bash command from "workspace-write" to "danger-full-access". Justification: write outside',
      ),
    ).toBe(true);
    expect(
      isBashGuardReason(
        'bash-guard: escalate this bash command from "workspace-write" to "danger-full-access". Justification: write outside',
      ),
    ).toBe(false);
  });

  it("does not guard kind-less YAML: a reason declares itself or it is not one", () => {
    // The pre-kind rewrite shape. Old logs replay under the corrected
    // classifier, so this documents the strict break the version bump heals.
    expect(isBashGuardReason("summary: block rm -rf outside\ncommand: rm -rf /tmp/x\n")).toBe(
      false,
    );
  });

  it("needs no classifier change for a future third kind of ask", () => {
    expect(isBashGuardReason("kind: audit-trail\nsummary: something new\n")).toBe(false);
  });
});

describe("pipeline stage capture", () => {
  it("names the stages of a single simple pipeline from the pipeline node", () => {
    expect(planPipeCapture("false | cat")).toEqual({
      hasPipe: true,
      names: ["false", "cat"],
      finalNames: ["false", "cat"],
      finalLeading: "false",
      unconfirmedNames: null,
      unconfirmedLeading: null,
      hasBackground: false,
      hasChain: false,
      hasHiddenStatements: false,
      needsWrap: true,
    });
    expect(planPipeCapture("VITE_X=1 vite build | rg warn | tail -2")).toEqual({
      hasPipe: true,
      names: ["vite", "rg", "tail"],
      finalNames: ["vite", "rg", "tail"],
      finalLeading: "vite",
      unconfirmedNames: null,
      unconfirmedLeading: null,
      hasBackground: false,
      hasChain: false,
      hasHiddenStatements: false,
      needsWrap: true,
    });
  });

  it("omits names for anything more complex than one simple pipeline", () => {
    // A subshell still captures (its last pipeline's bare codes) but never
    // claims names: the flat command list would mislabel these stages.
    expect(planPipeCapture("(false | cat)").names).toBeNull();
    expect(planPipeCapture("(false | cat)").hasPipe).toBe(true);
    expect(planPipeCapture("echo $(false | cat)").names).toBeNull();
    expect(planPipeCapture("cd /tmp && rg foo | head").names).toBeNull();
    expect(planPipeCapture("echo one | cat; echo two | cat").names).toBeNull();
  });

  it("names a multi-line script's final pipeline when the script ends in it", () => {
    // A flat sequence whose FINAL statement is the pipeline: PIPESTATUS will
    // hold exactly those stages, so naming them is honest even though the
    // script is compound.
    const plan = planPipeCapture("echo start\nfalse | cat");
    expect(plan.hasPipe).toBe(true);
    expect(plan.names).toBeNull();
    expect(plan.finalNames).toEqual(["false", "cat"]);
    expect(plan.finalLeading).toBe("false");
    // Same script on one line with `;` separators.
    expect(planPipeCapture("echo one | cat; echo two | cat").finalNames).toEqual([
      "echo",
      "cat",
    ]);
  });

  it("declines final-pipeline names when the pipeline is not the last statement", () => {
    // A plain command after the pipeline overwrites PIPESTATUS with a single
    // code, so pipeline stage names would be attached to the wrong thing.
    expect(planPipeCapture("false | cat\necho done").finalNames).toBeNull();
    expect(planPipeCapture("false | cat\necho done").finalLeading).toBeNull();
    // Control flow or a conditional makes the last-executed pipeline
    // undecidable from the source.
    expect(planPipeCapture("if true; then false | cat; fi").finalNames).toBeNull();
    expect(planPipeCapture("true && false | cat").finalNames).toBeNull();
    expect(planPipeCapture("{ false | cat; }").finalNames).toBeNull();
  });

  it("declines stage names when the final statement is backgrounded", () => {
    // Live probe (GNU bash 5.3.9, ticket #142): under a trailing `&` the
    // epilogue's PIPESTATUS is either EMPTY (`false | cat &` -> []) or STALE,
    // still describing an earlier FOREGROUND pipeline (`true | false;
    // false | cat &` -> [0 1]). Stage names would pair with wrong-or-absent
    // exit codes, so a backgrounded final pipeline gets no names — same
    // family as control flow above.
    expect(planPipeCapture("false | cat &").finalNames).toBeNull();
    expect(planPipeCapture("false | cat &").finalLeading).toBeNull();
    // The stale-array case: the backgrounded tail must not inherit names.
    expect(planPipeCapture("true | false; false | cat &").finalNames).toBeNull();
    // The legacy single-pipeline names path declines too.
    expect(planPipeCapture("false | cat &").names).toBeNull();
    // Not over-disqualified: a foreground pipeline after a backgrounded
    // statement still names its final pipeline (the background job does not
    // touch the epilogue's PIPESTATUS when it is not waited for — and a
    // confidently wrong label is worse than a missed honest one, so only the
    // `&` itself is treated as disqualifying for its own statement).
    expect(planPipeCapture("sleep 1 & true | false").finalNames).toEqual([
      "true",
      "false",
    ]);
  });

  it("still names a plain foreground pipeline (background rule is narrow)", () => {
    expect(planPipeCapture("false | cat")).toEqual({
      hasPipe: true,
      names: ["false", "cat"],
      finalNames: ["false", "cat"],
      finalLeading: "false",
      unconfirmedNames: null,
      unconfirmedLeading: null,
      hasBackground: false,
      hasChain: false,
      hasHiddenStatements: false,
      needsWrap: true,
    });
  });

  it("flags backgrounded statements anywhere the trap would observe them", () => {
    // The per-statement gate (#143): BASH_COMMAND carries no `&` marker, so
    // any backgrounded statement degrades the per-statement text even when
    // the legacy names survive it (see the `sleep 1 &` case above).
    expect(planPipeCapture("sleep 1 & true | false").hasBackground).toBe(true);
    expect(planPipeCapture("false | cat &").hasBackground).toBe(true);
    expect(planPipeCapture("false | cat").hasBackground).toBe(false);
    // `&&` is AndOr, not background: chains never trip this scan.
    expect(planPipeCapture("cd /tmp && false | cat").hasBackground).toBe(false);
    expect(planPipeCapture("cd /tmp && false | cat").hasChain).toBe(true);
  });

  it("names an &&/||-final pipeline as an unconfirmed candidate only", () => {
    // Ticket #144b: the disqualification stands (the pipeline may never have
    // run), so this candidate must only ever render beside a warning.
    const plan = planPipeCapture("cd /tmp && cp a b && npx vitest run | tail -5");
    expect(plan.names).toBeNull();
    expect(plan.finalNames).toBeNull();
    expect(plan.unconfirmedNames).toEqual(["npx", "tail"]);
    expect(plan.unconfirmedLeading).toBe("npx");
    // Narrow: a final operand that is not a simple pipeline leaves the
    // candidate null (a subshell's exit is a single code, not stages).
    expect(planPipeCapture("cd /tmp && (false | cat)").unconfirmedNames).toBeNull();
    // Narrow: a backgrounded chain declines even the candidate — under `&`
    // the codes are empty or stale (#142), so a warned name would still
    // pair names with garbage.
    expect(planPipeCapture("cd /tmp && false | cat &").unconfirmedNames).toBeNull();
    // Not a chain at all: no candidate.
    expect(planPipeCapture("false | cat").unconfirmedNames).toBeNull();
    expect(planPipeCapture("{ false | cat; }").unconfirmedNames).toBeNull();
  });

  it("pins the heredoc case: a heredoc never disqualifies naming", () => {
    // Ticket #144: the heredoc parses fine — the && chain was the
    // disqualifier, and this test proves the heredoc is not what kills it.
    const plan = planPipeCapture("python3 - <<'EOF'\nprint(1)\nEOF\necho hi | cat");
    expect(plan.finalNames).toEqual(["echo", "cat"]);
    expect(plan.finalLeading).toBe("echo");
  });

  it("wraps compound pipe-free commands but leaves trivial ones alone", () => {
    // #143's gate: sequences and chains deserve per-statement attribution
    // even without a pipe; a lone simple command (or definition) keeps the
    // bare unwrapped report it always had.
    expect(planPipeCapture("set -e\necho first\nfalse").needsWrap).toBe(true);
    expect(planPipeCapture("false && echo hi").needsWrap).toBe(true);
    expect(planPipeCapture("echo hello").needsWrap).toBe(false);
    expect(planPipeCapture("greet() { echo hi; }").needsWrap).toBe(false);
    expect(planPipeCapture("false | cat").needsWrap).toBe(true);
  });

  it("flags subshell statements the trap cannot see", () => {
    expect(planPipeCapture("(false | cat); echo hi").hasHiddenStatements).toBe(true);
    expect(planPipeCapture("echo hi | cat").hasHiddenStatements).toBe(false);
    expect(planPipeCapture("{ false | cat; }").hasHiddenStatements).toBe(false);
  });

  it("skips commands without a pipeline and commands that do not parse", () => {
    expect(planPipeCapture("echo hello")).toEqual({
      hasPipe: false,
      names: null,
      finalNames: null,
      finalLeading: null,
      unconfirmedNames: null,
      unconfirmedLeading: null,
      hasBackground: false,
      hasChain: false,
      hasHiddenStatements: false,
      needsWrap: false,
    });
    expect(planPipeCapture("echo $(date)").hasPipe).toBe(false);
    expect(planPipeCapture("if true; then |; fi")).toEqual({
      hasPipe: false,
      names: null,
      finalNames: null,
      finalLeading: null,
      unconfirmedNames: null,
      unconfirmedLeading: null,
      hasBackground: false,
      hasChain: false,
      hasHiddenStatements: false,
      needsWrap: false,
    });
  });

  it("reports the rightmost non-zero stage", () => {
    expect(decidePipeExit([1, 0, 0])).toBe(1);
    expect(decidePipeExit([1, 2, 0])).toBe(2);
    expect(decidePipeExit([0, 0])).toBe(0);
    expect(decidePipeExit([])).toBe(0);
  });

  it("forgives a benign SIGPIPE death but never a lone one", () => {
    // seq dies of SIGPIPE because head already left: success.
    expect(decidePipeExit([141, 0])).toBe(0);
    // An earlier genuine failure still surfaces past the forgiven 141.
    expect(decidePipeExit([1, 141, 0])).toBe(1);
    // No downstream consumer, no forgiveness.
    expect(decidePipeExit([141])).toBe(141);
    expect(decidePipeExit([0, 141])).toBe(141);
  });

  it("formats named and unnamed stages the way the model reads them", () => {
    expect(
      formatPipeStages([
        { name: "vite", exitCode: 1 },
        { name: "grep", exitCode: 0 },
        { name: "tail", exitCode: 0 },
      ]),
    ).toBe("vite 1, grep 0, tail 0");
    expect(formatPipeStages([{ exitCode: 1 }, { exitCode: 0 }])).toBe("1, 0");
  });
});

/**
 * #143. The DEBUG-trap steps file groups into statements with their OWN
 * exit codes. These tests pin the parser against transcript-shaped inputs
 * (all shapes live-probed on GNU bash 5.3.9; transcripts on ticket #143),
 * so a refactor of the grouping cannot silently reattribute a failure.
 */
describe("per-statement step capture (#143)", () => {
  it("groups a compound stream into statements with their own codes", () => {
    // Post-install-drop shape of `cd /tmp; false | cat; echo done`
    // (records written at the NEXT statement's firing carry the array).
    const cap = parseStepCapture(
      "[0] :: cd /tmp\n[0] :: false\n[1 0] :: cat\n[0] :: echo done\nEND rc=0\n",
    );
    expect(cap.complete).toBe(true);
    expect(cap.endRc).toBe(0);
    expect(cap.statements).toEqual([
      { stages: ["cd /tmp"], codes: [0] },
      { stages: ["false", "cat"], codes: [1, 0] },
      { stages: ["echo done"], codes: [0] },
    ]);
    // The mid-script failure is attributed even though the command exited 0.
    expect(renderStepReport(cap.statements, cap.endRc)).toBe(
      "[exit codes (1 of 3 statements failed): `false` | `cat` → 1, 0]",
    );
  });

  it("groups a three-stage pipeline and && operands individually", () => {
    const cap = parseStepCapture(
      "[0] :: cd /tmp\n[0] :: echo ok1\n[0] :: seq 1 3\n[0] :: head -2\n[0 0 0] :: wc -l\nEND rc=0\n",
    );
    expect(cap.complete).toBe(true);
    expect(cap.statements).toEqual([
      { stages: ["cd /tmp"], codes: [0] },
      { stages: ["echo ok1"], codes: [0] },
      { stages: ["seq 1 3", "head -2", "wc -l"], codes: [0, 0, 0] },
    ]);
    expect(renderStepReport(cap.statements, cap.endRc)).toBe(
      "[exit codes: all 3 statements exited 0]",
    );
  });

  it("collapses only the known final-record duplicate", () => {
    // The shell fires DEBUG once more for the final command before EXIT, so
    // the final record arrives twice with identical codes. A genuine
    // `false; false` repeat keeps both statements — each record carries its
    // own command's codes. (Real-stream shape: the first firing's record
    // carries install text and is filtered, so no residue leads.)
    const cap = parseStepCapture("[1] :: false\n[1] :: false\n[1] :: false\nEND rc=1\n");
    expect(cap.complete).toBe(true);
    expect(cap.statements).toEqual([
      { stages: ["false"], codes: [1] },
      { stages: ["false"], codes: [1] },
    ]);
  });

  it("attributes a mid-script exit to the exit status, not stale codes", () => {
    // After `exit 3`, PIPESTATUS still holds the previous pipeline — the
    // record would claim [0 0] for `exit 3`. The END marker overrides it.
    // (Earlier `exit` copies are dropped; only the flush stays.)
    const cap = parseStepCapture(
      "[0] :: echo one\n[0] :: echo two\n[0 0] :: cat\n[0 0] :: exit 3\n[0 0] :: exit 3\n[0 0] :: exit 3\nEND rc=3\n",
    );
    expect(cap.complete).toBe(true);
    expect(cap.statements).toEqual([
      { stages: ["echo one"], codes: [0] },
      { stages: ["echo two", "cat"], codes: [0, 0] },
      { stages: ["exit 3"], codes: [3] },
    ]);
    expect(renderStepReport(cap.statements, cap.endRc)).toContain("`exit 3` 3");
  });

  it("drops our own installation lines by namespace", () => {
    const cap = parseStepCapture(
      "[0] :: trap '__dsh_dbg_exit' EXIT\n[0] :: echo hi\n[0] :: echo hi\nEND rc=0\n",
    );
    expect(cap.complete).toBe(true);
    expect(cap.statements).toEqual([{ stages: ["echo hi"], codes: [0] }]);
  });

  it("degrades when the script replaces or clears the DEBUG trap", () => {
    expect(
      parseStepCapture("[0] :: echo before\n[0] :: trap 'echo user' DEBUG\nEND rc=0\n")
        .complete,
    ).toBe(false);
    expect(
      parseStepCapture("[0] :: echo before\n[0] :: trap - DEBUG\nEND rc=0\n").lossReason,
    ).toContain("replaced or cleared");
  });

  it("lets a read-only trap query pass without degrading", () => {
    // `trap -p` changes nothing: no install is replaced, no capture lost.
    const cap = parseStepCapture("[0] :: trap -p DEBUG\n[0] :: echo hi\n[0] :: echo hi\nEND rc=0\n");
    expect(cap.complete).toBe(true);
    expect(cap.statements).toEqual([
      { stages: ["trap -p DEBUG"], codes: [0] },
      { stages: ["echo hi"], codes: [0] },
    ]);
  });

  it("degrades when the script enables functrace", () => {
    expect(parseStepCapture("[0] :: set -T\nEND rc=0\n").complete).toBe(false);
    expect(parseStepCapture("[0] :: set -eT\nEND rc=0\n").complete).toBe(false);
    expect(parseStepCapture("[0] :: set -o functrace\nEND rc=0\n").complete).toBe(false);
    // Disabling is harmless.
    expect(parseStepCapture("[0] :: set +T\n[0] :: echo hi\n[0] :: echo hi\nEND rc=0\n").complete).toBe(
      true,
    );
  });

  it("degrades without an END marker or with an empty stage record", () => {
    expect(parseStepCapture("[0] :: echo before\n").complete).toBe(false);
    expect(parseStepCapture("[0] :: echo before\n").lossReason).toContain("EXIT trap");
    expect(parseStepCapture("[] :: echo hi\nEND rc=0\n").complete).toBe(false);
    expect(parseStepCapture("END rc=0\n").lossReason).toContain("no per-statement records");
  });

  it("keeps a heredoc statement as one record with its own codes", () => {
    // A heredoc body never fires the trap: the whole statement is one
    // record (its first line renders; the body lines travel with it).
    const cap = parseStepCapture(
      "[0] :: python3 - <<'PYEOF'\nprint(1)\nPYEOF\n[0] :: echo hi\n[0 0] :: cat\nEND rc=0\n",
    );
    expect(cap.complete).toBe(true);
    expect(cap.statements).toEqual([
      { stages: ["python3 - <<'PYEOF'\nprint(1)\nPYEOF"], codes: [0] },
      { stages: ["echo hi", "cat"], codes: [0, 0] },
    ]);
  });
});

/**
 * #144. The degraded report's honesty rules, pinned without running bash:
 * the scope note carries codes on success, and && chains never render bare
 * unlabelled numbers.
 */
describe("degraded report honesty (#144)", () => {
  const chainPlan = planPipeCapture("cd /tmp && cp a b && npx vitest run | tail -5");
  const flatPlan = planPipeCapture("echo starting\nfalse | cat");
  const bracePlan = planPipeCapture("{ false | cat; }");
  const singlePlan = planPipeCapture("false | cat");

  it("names the candidate chain stages beside the unconfirmed warning", () => {
    const line = renderDegradedCodesLine(
      [
        { exitCode: 1 },
        { exitCode: 0 },
      ],
      chainPlan,
    );
    expect(line).toContain("unconfirmed");
    expect(line).toContain("npx 1, tail 0");
    expect(line).toContain("led by `npx`");
    // Not bare: the warning travels with the numbers, never apart.
    expect(line).not.toBe("[exit codes: 1, 0]");
  });

  it("withholds the numbers when the chain short-circuited", () => {
    // `false && echo hi | cat`: the chain failed early, so the codes hold
    // the single `false` — one code where the candidate has two stages.
    // The arity backstop withholds rather than mislabels.
    const shortPlan = planPipeCapture("false && echo hi | cat");
    expect(shortPlan.unconfirmedNames).toEqual(["echo", "cat"]);
    expect(renderDegradedCodesLine([{ exitCode: 1 }], shortPlan)).toBe("");
  });

  it("withholds the numbers for a chained command with no pipeline candidate", () => {
    const subshellChain = planPipeCapture("cd /tmp && (false | cat)");
    expect(subshellChain.unconfirmedNames).toBeNull();
    expect(renderDegradedCodesLine([{ exitCode: 1 }, { exitCode: 0 }], subshellChain)).toBe("");
  });

  it("keeps the bare render for chain-free unnamed commands", () => {
    expect(
      renderDegradedCodesLine(
        [{ exitCode: 1 }, { exitCode: 0 }],
        bracePlan,
      ),
    ).toBe("[exit codes: 1, 0]");
  });

  it("carries the final pipeline's codes in the success note", () => {
    const note = renderDegradedScopeNote(
      [
        { name: "false", exitCode: 0 },
        { name: "cat", exitCode: 0 },
      ],
      { ...flatPlan, finalNames: ["false", "cat"], finalLeading: "false" },
      0,
      undefined,
    );
    expect(note).toContain("exit codes cover the final pipeline only");
    expect(note).toContain("last pipeline led by `false`");
    expect(note).toContain("false 0, cat 0");
    expect(note).toContain("earlier lines of a compound command were not captured");
  });

  it("states the coverage loss in the degraded note", () => {
    const note = renderDegradedScopeNote(
      [{ exitCode: 0 }],
      bracePlan,
      0,
      "the command replaced or cleared the capture traps",
    );
    expect(note).toContain("per-statement capture was lost");
    expect(note).toContain("replaced or cleared");
  });

  it("prints no note for a named single pipeline", () => {
    expect(
      renderDegradedScopeNote(
        [
          { name: "false", exitCode: 1 },
          { name: "cat", exitCode: 0 },
        ],
        singlePlan,
        1,
        undefined,
      ),
    ).toBe("");
  });
});

/**
 * #131. presentationMeta must never emit a key whose value is `undefined`.
 *
 * The harness enforces a plain-JSON contract on tool output (walkJsonValue in
 * @deepseek-ai/dsh-session), and a key that is PRESENT with value `undefined`
 * violates it — the call then fails with `output.presentationMeta returned
 * non-lossless JSON`. That is not hypothetical: it broke EVERY backgrounded
 * bash call, while the job itself ran fine, so it read as a phantom error.
 *
 * The background path returns `{ text, ran, rewritten }` only: a job that has
 * just started has no exit code and was not denied. Those two fields are
 * optional in the output schema precisely because of that path.
 *
 * These tests assert on the KEYS, not just on JSON.stringify. stringify DROPS
 * undefined-valued keys silently, so a round-trip test alone would pass
 * against the bug it is meant to catch.
 */
describe("presentationMeta stays losslessly JSON-serializable (#131)", () => {
  /** Mount apply() with a fake ctx and hand back the registered tool itself. */
  function mountForMeta() {
    const noop = () => {};
    let tool: any;
    const ctx = {
      logger: { debug: noop, info: noop, warn: noop, error: noop },
      on() {
        return () => {};
      },
      get() {
        return undefined;
      },
      shell: {
        sandboxMode: undefined,
        resolve(req: unknown) {
          return req;
        },
        run() {
          return Promise.resolve({});
        },
      },
      tools: {
        register(t: never) {
          tool = t;
        },
      },
    };
    apply(ctx as never, { guardsDir: GUARDS_DIR });
    if (tool === undefined) throw new Error("apply() did not register the bash tool");
    return tool.output.presentationMeta as (args: unknown, value: unknown) => object;
  }

  /** Keys present with an undefined value — the exact contract violation. */
  function undefinedKeys(meta: object): string[] {
    return Object.entries(meta)
      .filter(([, v]) => v === undefined)
      .map(([k]) => k);
  }

  it("omits exitCode and denied entirely on the background path", () => {
    const presentationMeta = mountForMeta();
    // Exactly what the run_in_background branch returns.
    const meta = presentationMeta(
      { command: "sleep 1", description: "d", run_in_background: true },
      { text: "Started background job bash-1.", ran: "sleep 1", rewritten: false },
    );
    expect(undefinedKeys(meta)).toEqual([]);
    expect(Object.keys(meta).sort()).toEqual(["ran", "rewritten"]);
    expect("exitCode" in meta).toBe(false);
    expect("denied" in meta).toBe(false);
  });

  it("keeps exitCode and denied when the call actually completed", () => {
    const presentationMeta = mountForMeta();
    const meta = presentationMeta(
      { command: "true", description: "d" },
      { text: "ok", ran: "true", rewritten: false, exitCode: 0, denied: false },
    ) as Record<string, unknown>;
    expect(undefinedKeys(meta)).toEqual([]);
    // exitCode 0 and denied false are FALSY but present: a truthiness guard
    // instead of an `!== undefined` guard would wrongly drop both.
    expect(meta.exitCode).toBe(0);
    expect(meta.denied).toBe(false);
  });

  it("omits pipeStages when absent and keeps it when present", () => {
    const presentationMeta = mountForMeta();
    const without = presentationMeta(
      { command: "true", description: "d" },
      { text: "ok", ran: "true", rewritten: false, exitCode: 0, denied: false },
    );
    expect("pipeStages" in without).toBe(false);
    const stages = [{ name: "false", exitCode: 1 }, { exitCode: 0 }];
    const with_ = presentationMeta(
      { command: "false | cat", description: "d" },
      { text: "ok", ran: "false | cat", rewritten: false, exitCode: 1, denied: false, pipeStages: stages },
    ) as Record<string, unknown>;
    expect(undefinedKeys(with_)).toEqual([]);
    expect(with_.pipeStages).toEqual(stages);
  });

  it("survives a JSON round-trip on every return shape", () => {
    const presentationMeta = mountForMeta();
    const shapes = [
      { text: "t", ran: "sleep 1", rewritten: false },
      { text: "t", ran: "sleep 1", rewritten: true },
      { text: "t", ran: "true", rewritten: false, exitCode: 0, denied: false },
      { text: "t", ran: "rm x", rewritten: true, exitCode: 1, denied: true },
    ];
    for (const value of shapes) {
      const meta = presentationMeta({ command: "x", description: "d" }, value);
      expect(undefinedKeys(meta)).toEqual([]);
      expect(JSON.parse(JSON.stringify(meta))).toEqual(meta);
    }
  });
});
