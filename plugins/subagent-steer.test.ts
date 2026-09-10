/**
 * Tests for the send_message steer shadow (#129).
 *
 * WEIGHTED TOWARD REFUSALS ON PURPOSE. `Agent.steer()` performs NO
 * authorization of its own — any holder of an agent object can steer any
 * agent — so these two lineage checks are the only thing standing between
 * "deliver a correction promptly" and "any agent can drive any other agent,
 * including its own parent". A permissive bug here is a privilege
 * escalation, not a UX regression, and it would pass every happy-path test.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  decideDelivery,
  isRunning,
  parentSessionOf,
  resultTextFor,
  type Delivery,
} from "./subagent-steer";

/** A stand-in live agent. Identity matters, so these are never re-created. */
function agent(id: string) {
  return { id: id };
}

/** A resident child whose durable header names `parentId`. */
function child(parentId: unknown, status = "running") {
  return { status: status, session: { header: { parentSession: parentId } } };
}

describe("decideDelivery: the happy path", () => {
  it("steers a resident direct child", () => {
    const parent = agent("p1");
    expect(
      decideDelivery({
        parent: parent,
        liveParent: parent,
        child: child("p1"),
        childParentSession: "p1",
      }),
    ).toEqual({ kind: "steer" });
  });

  it("falls back to followup when the child is not resident", () => {
    // Settled, disposed, or cold. followup cold-resumes and re-checks
    // lineage itself, so delegating is both correct and cheaper than
    // reimplementing the manager's guarantees.
    const parent = agent("p1");
    for (const absent of [undefined, null]) {
      expect(
        decideDelivery({
          parent: parent,
          liveParent: parent,
          child: absent,
          childParentSession: undefined,
        }),
      ).toEqual({ kind: "followup" });
    }
  });
});

describe("decideDelivery: refusals are the security surface", () => {
  it("refuses with no calling agent", () => {
    for (const missing of [undefined, null]) {
      const out = decideDelivery({
        parent: missing,
        liveParent: undefined,
        child: child("p1"),
        childParentSession: "p1",
      });
      expect(out.kind).toBe("refuse");
    }
  });

  it("refuses a STALE parent object even when the id still matches", () => {
    // authorizeLineage half 1 is identity, not equality. A caller holding a
    // stale agent object for a since-replaced id would pass an `id ===` test
    // while no longer BEING that live agent. This test fails if the check is
    // ever relaxed to compare ids.
    const stale = agent("p1");
    const live = agent("p1"); // same id, different object
    const out = decideDelivery({
      parent: stale,
      liveParent: live,
      child: child("p1"),
      childParentSession: "p1",
    });
    expect(out.kind).toBe("refuse");
  });

  it("refuses when the registry has no live parent at all", () => {
    const parent = agent("p1");
    const out = decideDelivery({
      parent: parent,
      liveParent: undefined,
      child: child("p1"),
      childParentSession: "p1",
    });
    expect(out.kind).toBe("refuse");
  });

  it("refuses a SIBLING — the child of another parent", () => {
    const parent = agent("p1");
    const out = decideDelivery({
      parent: parent,
      liveParent: parent,
      child: child("p2"),
      childParentSession: "p2",
    });
    expect(out.kind).toBe("refuse");
  });

  it("refuses a GRANDCHILD, which is not a direct child", () => {
    // Its parentSession names the intermediate agent, not us.
    const parent = agent("p1");
    const out = decideDelivery({
      parent: parent,
      liveParent: parent,
      child: child("mid"),
      childParentSession: "mid",
    });
    expect(out.kind).toBe("refuse");
  });

  it("refuses steering our own PARENT", () => {
    // The most dangerous case: an agent driving the thing that started it.
    const me = agent("child-1");
    const myParent = { status: "running", session: { header: { parentSession: "root" } } };
    const out = decideDelivery({
      parent: me,
      liveParent: me,
      child: myParent,
      childParentSession: "root",
    });
    expect(out.kind).toBe("refuse");
  });

  it("refuses a resident child whose parentSession is absent", () => {
    // An unreadable header must not be treated as a match. `undefined ===
    // undefined` would silently authorize every malformed child if the
    // parent id were also missing, so this is checked explicitly.
    const parent = agent("p1");
    const out = decideDelivery({
      parent: parent,
      liveParent: parent,
      child: { status: "running", session: { header: {} } },
      childParentSession: undefined,
    });
    expect(out.kind).toBe("refuse");
  });

  it("refuses falsy and non-string ids that happen to match", () => {
    // Live-probed by the #129 reviewer against the built code: the first
    // guard excluded undefined/null/"" only, so `{id: 0}` against a child
    // whose parentSession was `0` compared equal and STEERED. Ids are
    // harness-issued strings, so nothing exploitable followed — but a guard
    // whose contract reads "usable id" must not admit these.
    for (const id of [0, false, NaN, 123, Symbol("s") as unknown]) {
      const parent = { id: id };
      const out = decideDelivery({
        parent: parent,
        liveParent: parent,
        child: { status: "running", session: { header: { parentSession: id } } },
        childParentSession: id,
      });
      expect(out.kind).toBe("refuse");
    }
  });

  it("refuses an object id even when both sides are the same object", () => {
    // Identity would make `===` true; only a non-empty string is usable.
    const shared = { not: "a string" };
    const parent = { id: shared };
    expect(
      decideDelivery({
        parent: parent,
        liveParent: parent,
        child: { status: "running", session: { header: { parentSession: shared } } },
        childParentSession: shared,
      }).kind,
    ).toBe("refuse");
  });

  it("does not authorize on two undefined ids matching each other", () => {
    // The nastiest shape: a parent with no id and a child with no recorded
    // parent would compare equal under a naive `===`.
    const parent = { id: undefined };
    const out = decideDelivery({
      parent: parent,
      liveParent: parent,
      child: { status: "running", session: { header: {} } },
      childParentSession: undefined,
    });
    // Identity of the parent object holds, so this reaches check 2 — and
    // undefined === undefined would WRONGLY steer. Guard against it.
    expect(out.kind).toBe("refuse");
  });

  it("gives every refusal a distinct, actionable reason", () => {
    const parent = agent("p1");
    const reasons = new Set<string>();
    const cases: Delivery[] = [
      decideDelivery({ parent: null, liveParent: undefined, child: child("p1"), childParentSession: "p1" }),
      decideDelivery({ parent: parent, liveParent: agent("p1"), child: child("p1"), childParentSession: "p1" }),
      decideDelivery({ parent: parent, liveParent: parent, child: child("p2"), childParentSession: "p2" }),
    ];
    for (const c of cases) {
      expect(c.kind).toBe("refuse");
      if (c.kind === "refuse") reasons.add(c.reason);
    }
    expect(reasons.size).toBe(3);
  });
});

describe("parentSessionOf survives every malformed hop", () => {
  it("reads the durable parent", () => {
    expect(parentSessionOf(child("p1"))).toBe("p1");
  });

  it("returns undefined rather than throwing on a broken shape", () => {
    for (const bad of [
      undefined,
      null,
      42,
      "string",
      {},
      { session: null },
      { session: 42 },
      { session: {} },
      { session: { header: null } },
      { session: { header: 42 } },
      { session: { header: {} } },
    ]) {
      expect(() => parentSessionOf(bad)).not.toThrow();
      expect(parentSessionOf(bad)).toBeUndefined();
    }
  });
});

describe("isRunning only reports, never authorizes", () => {
  it("is true only for a running child", () => {
    expect(isRunning(child("p", "running"))).toBe(true);
    expect(isRunning(child("p", "idle"))).toBe(false);
    expect(isRunning(child("p", "ready"))).toBe(false);
  });

  it("is false for anything malformed", () => {
    for (const bad of [undefined, null, 42, "running", {}]) expect(isRunning(bad)).toBe(false);
  });
});

describe("resultTextFor tells the caller when the message actually lands", () => {
  it("distinguishes steered-into-a-running-turn from starting one", () => {
    const steered = resultTextFor({ kind: "steer" }, "sub-1", true);
    const started = resultTextFor({ kind: "steer" }, "sub-1", false);
    expect(steered).not.toBe(started);
    expect(steered).toMatch(/steer/i);
    expect(started).toMatch(/next turn/i);
  });

  it("says plainly when the child was cold and the message merely queued", () => {
    // The old tool said "queued as the next turn" for EVERY case. That was
    // true then and would be a lie now, so the cold path keeps the honest
    // wording and the steer paths do not borrow it.
    const cold = resultTextFor({ kind: "followup" }, "sub-1", false);
    expect(cold).toMatch(/not resident/i);
    expect(cold).toMatch(/queued/i);
  });

  it("carries the subagent id in every outcome", () => {
    for (const d of [{ kind: "steer" } as Delivery, { kind: "followup" } as Delivery]) {
      expect(resultTextFor(d, "sub-XYZ", true)).toContain("sub-XYZ");
    }
  });

  it("passes a refusal reason through unchanged", () => {
    expect(resultTextFor({ kind: "refuse", reason: "nope" }, "sub-1", false)).toBe("nope");
  });
});

/**
 * THE MOUNTING CONTRACT (#129).
 *
 * `ctx.tools.register` THROWS on a duplicate name within a layer, so this
 * shadow only works if sync.sh disables the shipped registrar. That is a
 * two-sided arrangement across two files, and neither side fails visibly on
 * its own: register without disabling and the plugin tree throws at boot;
 * disable without registering and send_message vanishes entirely. So the
 * pairing is asserted rather than remembered.
 *
 * Reads sync.sh as source, the same technique plugins/sync.test.ts uses
 * (it deliberately refuses to EXECUTE the script, which mutates $HOME).
 */
describe("sync.sh mounts the shadow and retires the builtin together", () => {
  const raw = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "sync.sh"),
    "utf8",
  );
  const code = raw.replace(/^\s*#.*$/gm, "");

  it("registers the plugin into the web profile", () => {
    expect(code).toContain("id: subagent-steer");
    expect(code).toContain("plugins/subagent-steer.js");
  });

  it("disables the builtin control row in BOTH presets", () => {
    // The aidos preset (which this deployment runs) and the shipped standard
    // preset each carry their own row; patching one leaves the other throwing.
    const disables = code.match(/preset_disable_tool[^\n]*tool-subagent-control/g) ?? [];
    expect(disables.length).toBeGreaterThanOrEqual(2);
  });

  it("NEVER disables tool-subagent-list-agents", () => {
    // list_agents is a SEPARATE shipped row and is not shadowed. Disabling it
    // would remove a working tool for no reason — the surgery is narrower
    // than "turn off subagent control".
    expect(code).not.toMatch(/preset_disable_tool[^\n]*tool-subagent-list-agents/);
  });

  it("keeps a tripwire for each preset, because a reinstall reverts the patch", () => {
    // Editing INSTALLED files is not durable: re-extracting the preset
    // silently restores the builtin row, and the failure then looks like a
    // duplicate-registration crash at boot with no obvious cause.
    const trips = code.match(/preset_tool_enabled[^\n]*tool-subagent-control/g) ?? [];
    expect(trips.length).toBeGreaterThanOrEqual(2);
  });
});

/**
 * THE ABSENCE REGRESSION (#129).
 *
 * The shipped tool-subagent-control row registers TWO tools, send_message
 * AND interrupt_agent, and disabling a preset row is all-or-nothing. The
 * first draft of this plugin provided only send_message, so mounting it
 * would have made interrupt_agent VANISH — a regression no test of
 * send_message could catch, because the tool is not wrong, it is missing.
 *
 * Source-level because registering for real needs a live tool registry;
 * the point is to pin that BOTH names are registered by this file, so the
 * pairing cannot be broken by an edit that only thinks about steering.
 */
describe("the shadow re-provides everything the disabled row carried", () => {
  const code = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "subagent-steer.ts"),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("registers send_message", () => {
    expect(code).toMatch(/name:\s*"send_message"/);
  });

  it("ALSO registers interrupt_agent, which the disabled row also provided", () => {
    expect(code).toMatch(/name:\s*"interrupt_agent"/);
  });

  it("delegates interrupt to the manager rather than re-authorizing it", () => {
    // interrupt goes through ctx.subagents.interrupt with the shipped
    // `ancestor` shape, so the manager performs the check. Only steer needed
    // lineage re-implemented, because Agent.steer() has none of its own.
    expect(code).toMatch(/subagents\.interrupt\(/);
    expect(code).toMatch(/kind:\s*"ancestor"/);
  });
});
