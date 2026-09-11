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
  planPipeCapture,
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
    expect(value.text).toContain("[exit codes: false 1, cat 0]");
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

  it("names a compound command's final pipeline and states the capture scope", async () => {
    // Multi-line on one line: the codes belong to the LAST pipeline, so the
    // report names it (`echo …`) and says plainly that earlier lines were
    // never captured — even on success, where that limitation is otherwise
    // invisible.
    const { value } = await runReal("echo one | cat; echo two | cat");
    expect(value.exitCode).toBe(0);
    expect(value.pipeStages).toEqual([
      { name: "echo", exitCode: 0 },
      { name: "cat", exitCode: 0 },
    ]);
    expect(value.text).not.toContain("[exit codes:");
    expect(value.text).toContain("exit codes cover the final pipeline only");
    expect(value.text).toContain("last pipeline led by `echo`");
    expect(value.text).toContain("earlier lines of a compound command were not captured");
  });

  it("attributes a multi-line script's codes to its final pipeline", async () => {
    // The owner's report: several lines on screen, numbers that name no
    // line. The failing pipeline is the LAST one here, and the report now
    // says which pipeline the codes belong to.
    const { value } = await runReal("echo starting\nfalse | cat");
    expect(value.exitCode).toBe(1);
    expect(value.pipeStages).toEqual([
      { name: "false", exitCode: 1 },
      { name: "cat", exitCode: 0 },
    ]);
    expect(value.text).toContain("[exit codes: false 1, cat 0]");
    expect(value.text).toContain("exit codes cover the final pipeline only");
    expect(value.text).toContain("last pipeline led by `false`");
  });

  it("states in the report when a mid-script failure is outside PIPESTATUS's reach", async () => {
    // The first line's pipeline fails; the final command succeeds and
    // overwrites PIPESTATUS. The capture cannot surface that failure —
    // bash holds no record of it — so the report says the limitation
    // instead of letting exit 0 read as all-clear.
    const { value } = await runReal("false | cat\necho done");
    expect(value.exitCode).toBe(0);
    expect(value.pipeStages).toEqual([{ exitCode: 0 }]);
    expect(value.text).not.toContain("[exit codes:");
    expect(value.text).toContain("exit codes cover the final pipeline only");
    expect(value.text).toContain("earlier lines of a compound command were not captured");
  });

  it("keeps an unnamed compound report unnamed but still attributed", async () => {
    // A brace group disqualifies final-pipeline naming (the last executed
    // pipeline is not decidable), so the codes stay bare — but the report
    // still says they cover the final pipeline only.
    const { value } = await runReal("{ false | cat; }");
    expect(value.exitCode).toBe(1);
    expect(value.pipeStages).toEqual([{ exitCode: 1 }, { exitCode: 0 }]);
    expect(value.text).toContain("[exit codes: 1, 0]");
    expect(value.text).toContain("exit codes cover the final pipeline only");
    expect(value.text).not.toContain("last pipeline led by");
    expect(value.text).toContain("earlier lines of a compound command were not captured");
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
    });
    expect(planPipeCapture("VITE_X=1 vite build | rg warn | tail -2")).toEqual({
      hasPipe: true,
      names: ["vite", "rg", "tail"],
      finalNames: ["vite", "rg", "tail"],
      finalLeading: "vite",
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

  it("skips commands without a pipeline and commands that do not parse", () => {
    expect(planPipeCapture("echo hello")).toEqual({
      hasPipe: false,
      names: null,
      finalNames: null,
      finalLeading: null,
    });
    expect(planPipeCapture("echo $(date)").hasPipe).toBe(false);
    expect(planPipeCapture("if true; then |; fi")).toEqual({
      hasPipe: false,
      names: null,
      finalNames: null,
      finalLeading: null,
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
