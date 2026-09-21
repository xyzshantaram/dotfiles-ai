/**
 * #173 criterion 3, the two concerns with no pins anywhere in the suite.
 *
 * Criterion 3 lists what the prototype never carried and demands each one be
 * named and verified. Exit codes, the tab strip and the Command tab all have
 * real pins (bash-graph/exit-code.test.ts, bash-tabs.test.ts). LIVE/STREAMING
 * OUTPUT and APPROVAL/GUARD STATE had none — the #173 reviewer found zero
 * matches for either across all six bash test files and failed the ticket on
 * it. What coverage existed was substring matching over this file's own
 * source (escalation.test.ts asserts client.tsx CONTAINS the text
 * "return isBashGuardReason(payload.reason);"), and bash-tabs.test.ts:145
 * states the limit outright: observing the row "needs a render harness".
 *
 * A source-text pin passes against any file that merely MENTIONS the right
 * identifier — it cannot tell a working row from a broken one. So this file
 * builds the harness. React is mocked so createElement returns its arguments
 * verbatim; BashRow then runs for real and hands toolRenderRow the options
 * object it computed, which is the exact set of decisions under test
 * (guardApproval, guardPending, escalationPending, state, body, expandable).
 * The assertions read that object and walk the body tree. Nothing here
 * asserts on the text of client.tsx.
 *
 * WHY THE STREAMING PINS LOOK LIKE ARGUMENT PINS. A bash call streams its
 * ARGUMENTS in before it runs: argsRaw is partial JSON for the first frames,
 * so `command` is undefined, and only later does a result arrive. The row is
 * therefore rendered many times per call, and the fair copy — which measures
 * and runs a layout DP — is called on every one of those frames. The pins
 * below walk that whole lifecycle: partial args, complete args with no
 * result, then the result.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  default: {
    createElement: (...args: unknown[]) => ({ args }),
    Fragment: "fragment",
    useState: (initial: unknown) => [initial, () => {}],
    useEffect: () => {},
    useRef: () => ({ current: null }),
  },
}));
vi.mock("@deepseek-ai/dsh-client-ui-primitives", () => ({
  IconBrowseOutline16: () => null,
  IconEditOutline16: () => null,
  IconApiOutline14: () => null,
  IconChevronDownOutline14: () => null,
  IconInspectOutline12: () => null,
  IconChecklistOutline14: () => null,
  IconPlayOutline16: () => null,
  IconQuestionOutline14: () => null,
  IconAgentPresetOutline16: () => null,
  IconStopFill16: () => null,
  MarkdownText: () => null,
}));
vi.mock("./client.module.css", () => ({ default: "" }));
vi.mock("./bash-graph/styles.css", () => ({ default: "" }));

import { BashRow } from "./client";
import { installStub } from "./bash-graph/geometry.stub.js";

const CALL_ID = "call-live-1";

/**
 * An approval reason is a STRING carrying YAML (or legacy plain prose) — see
 * plugins/shared/guard-reason.ts. These are the three shapes that reach a
 * bash row, written out rather than hand-waved, because a non-string reason
 * classifies as not-a-guard and would make the escalation pins below pass
 * against anything at all.
 */
const GUARD_REASON = ['kind: bash-guard', 'summary: grep is translated to rg', 'runs: rg foo .'].join(
  "\n",
);
/** The host executor's own escalation ask: plain prose with a fixed prefix. */
const ESCALATION_REASON = "escalate sandbox to workspace-write: write outside the workspace";
/**
 * Guard YAML from before the `kind` stamp existed (commit b0c4747), matched
 * structurally. #105 was escalations painting blue; the mirror of that bug is
 * history losing its banner, so the row is pinned on this shape too.
 */
const LEGACY_GUARD_REASON = ["summary: rg replaces grep", "runs: rg foo ."].join("\n");

type Node = { args: unknown[] };

const isNode = (v: unknown): v is Node =>
  typeof v === "object" && v !== null && Array.isArray((v as Node).args);

/** Every mocked element anywhere in a tree, in document order. */
function nodes(tree: unknown, out: Node[] = [], depth = 0): Node[] {
  if (depth > 60 || tree === null || tree === undefined) return out;
  if (Array.isArray(tree)) {
    for (const item of tree) nodes(item, out, depth + 1);
    return out;
  }
  if (isNode(tree)) {
    out.push(tree);
    for (const arg of tree.args) nodes(arg, out, depth + 1);
    return out;
  }
  if (typeof tree === "object") {
    for (const value of Object.values(tree as Record<string, unknown>)) {
      nodes(value, out, depth + 1);
    }
  }
  return out;
}

/** The elements carrying one className. */
function byClass(tree: unknown, className: string): Node[] {
  return nodes(tree).filter((n) => {
    const props = n.args[1];
    return (
      typeof props === "object" &&
      props !== null &&
      (props as { className?: unknown }).className === className
    );
  });
}

/** Every plain string rendered as a child inside one element. */
function textOf(node: Node): string {
  const out: string[] = [];
  const walk = (v: unknown, depth: number): void => {
    if (depth > 40) return;
    if (typeof v === "string") out.push(v);
    else if (Array.isArray(v)) v.forEach((i) => walk(i, depth + 1));
    else if (isNode(v)) v.args.slice(2).forEach((i) => walk(i, depth + 1));
  };
  node.args.slice(2).forEach((v) => walk(v, 0));
  return out.join("");
}

/**
 * Render BashRow and return the options object it handed toolRenderRow.
 * toolRenderRow builds <ToolRenderAnswerableCard options={options}/> whenever
 * the row has a callId and a useSession, so the options ride the mocked
 * element's props — the row's own decisions, read without a DOM.
 */
function rowOptions(
  block: unknown,
  opts: { pending?: unknown[]; guarded?: Record<string, boolean> } = {},
): Record<string, unknown> {
  const snapshot = { pending: opts.pending ?? [] };
  const useSession = (selector: (s: unknown) => unknown) => selector(snapshot);
  const useProjection = () =>
    opts.guarded === undefined ? undefined : { guarded: opts.guarded, reasons: {} };
  const restore = installStub();
  try {
    const el = BashRow({ block, callId: CALL_ID, useSession, useProjection }) as Node;
    const props = el.args[1] as { options: Record<string, unknown> };
    return props.options;
  } finally {
    restore();
  }
}

/** A call whose arguments are still arriving: argsRaw is truncated JSON. */
const streamingArgs = (argsRaw: string) => ({ argsRaw });
/**
 * A call whose arguments are complete but which has not returned yet. It
 * carries `content` deliberately: the real code ignores it (doneOf keys on
 * `kind`, which is absent), but without text on the in-flight block a
 * mutation that DID render un-done output would have nothing to print, and
 * the "no output pane while running" pin below would pass against the bug it
 * exists to catch.
 */
const running = (command: string) => ({
  argsRaw: JSON.stringify({ command }),
  content: [{ type: "text", text: "partial stream\n" }],
});
/** A finished call. `kind` is what doneOf keys on. */
const finished = (command: string, text: string, isError = false) => ({
  kind: "tool_result",
  call: { argsRaw: JSON.stringify({ command }) },
  content: [{ type: "text", text }],
  isError,
});

describe("#173 c3: live and streaming output", () => {
  it("renders no output pane while the call is still running", () => {
    const options = rowOptions(running("rg needle src | wc -l"));
    expect(options.state).toBe("running");
    expect(byClass(options.body, "tool-render-output")).toHaveLength(0);
    // The row is still useful while it runs: the command is on show.
    expect(byClass(options.body, "tool-render-bash-panel").length).toBeGreaterThan(0);
    expect(options.expandable).toBe(true);
  });

  it("renders the output pane once the call is done, carrying the result text", () => {
    const options = rowOptions(finished("echo hi", "hi\n"));
    const panes = byClass(options.body, "tool-render-output");
    expect(panes).toHaveLength(1);
    expect(textOf(panes[0])).toBe("hi\n");
    expect(options.state).toBe("ok");
  });

  it("strips ANSI colour from streamed output instead of printing the escapes", () => {
    // Live output arrives coloured: ripgrep, cargo and deno all emit SGR runs.
    const coloured = "\u001b[31merror\u001b[0m: one\n\u001b[1mbold\u001b[0m\n";
    const options = rowOptions(finished("cargo build", coloured));
    const pane = byClass(options.body, "tool-render-output")[0];
    expect(textOf(pane)).toBe("error: one\nbold\n");
    expect(textOf(pane)).not.toContain("\u001b");
  });

  it("marks a failed run's output pane as the error surface", () => {
    const options = rowOptions(finished("false", "boom\n", true));
    expect(options.state).toBe("error");
    const pane = byClass(options.body, "tool-render-output")[0];
    expect((pane.args[1] as Record<string, unknown>)["tool-render-error"]).toBe(true);
  });

  it("survives arguments that are still streaming in, and claims nothing", () => {
    // The first frames of a call carry truncated JSON. The fair copy must not
    // be handed a half-command, and the row must not throw: it renders as a
    // plain unexpandable row until the arguments complete.
    const partial = streamingArgs('{"command":"rg --json \'nee');
    expect(() => rowOptions(partial)).not.toThrow();
    const options = rowOptions(partial);
    expect(options.expandable).toBe(false);
    expect(options.body).toBeNull();
    expect(options.state).toBe("running");
  });

  it("draws an unterminated quote without throwing once the args complete", () => {
    // A complete argument object can still hold a command the parser cannot
    // close. The renderer measures and lays out every frame, so this must
    // degrade, never crash.
    const options = rowOptions(running("rg \"unclosed | wc -l"));
    expect(options.state).toBe("running");
    expect(options.expandable).toBe(true);
  });
});

describe("#173 c3: approval and guard state", () => {
  const approval = (reason: unknown) => [
    { kind: "approval", payload: { callId: CALL_ID, reason } },
  ];

  it("paints an open bash-guard ask as guard, not as an escalation", () => {
    const options = rowOptions(running("grep -r foo ."), { pending: approval(GUARD_REASON) });
    expect(options.guardPending).toBe(true);
    expect(options.escalationPending).toBe(false);
    expect(options.guardApproval).toBe(true);
  });

  it("paints an open sandbox escalation as escalation, not as guard", () => {
    const options = rowOptions(running("touch /etc/x"), {
      pending: approval(ESCALATION_REASON),
    });
    expect(options.escalationPending).toBe(true);
    expect(options.guardPending).toBe(false);
    expect(options.guardApproval).toBe(false);
  });

  it("still paints pre-stamp guard YAML as guard, so history keeps its banner", () => {
    const options = rowOptions(running("grep -r foo ."), {
      pending: approval(LEGACY_GUARD_REASON),
    });
    expect(options.guardPending).toBe(true);
    expect(options.escalationPending).toBe(false);
  });

  it("classifies each open ask on its own, with no assumed arrival order", () => {
    // An approval for ANOTHER call must not mark this row at all.
    const other = [{ kind: "approval", payload: { callId: "call-other", reason: GUARD_REASON } }];
    const options = rowOptions(running("ls"), { pending: other });
    expect(options.guardPending).toBe(false);
    expect(options.escalationPending).toBe(false);
  });

  it("keeps the durable guard mark after the ask has settled", () => {
    // Nothing pending: the decision is made and the page may have reloaded.
    // The guarded-approvals fold still marks the row, which is the whole
    // point of the durable projection.
    const options = rowOptions(finished("grep -r foo .", "ok\n"), {
      guarded: { [CALL_ID]: true },
    });
    expect(options.guardApproval).toBe(true);
    expect(options.guardPending).toBe(false);
  });

  it("leaves an ordinary row unmarked by either kind of ask", () => {
    const options = rowOptions(finished("echo hi", "hi\n"));
    expect(options.guardApproval).toBe(false);
    expect(options.guardPending).toBe(false);
    expect(options.escalationPending).toBe(false);
  });
});
