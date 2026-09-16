/**
 * Tests for levelsForDepth in plugins/profiles.ts (#81 owner decision:
 * profiles.ts owns depth routing — depth >= 1 leads with the active profile's
 * subagent-chain head; the inherited proposal is preserved as a LAST RESORT;
 * depth-0 behaviour is completely unchanged).
 */
import { describe, expect, it } from "vitest";
import { levelsForDepth } from "./profiles";

const proposal = { provider: "meridian", model: "claude-opus-5" };
const chain = [
  { provider: "meridian", model: "claude-haiku-4-5" },
  { provider: "command-code", model: "meta/muse-spark-1.3-contributor" },
  { provider: "meridian", model: "claude-opus-5" },
];

describe("levelsForDepth", () => {
  it("depth-0 keeps the proposal first — orchestrator behaviour unchanged", () => {
    const levels = levelsForDepth(proposal, chain, 0);
    // The orchestrator's own proposal leads; the chain (minus any rung that
    // duplicates the proposal) backs it up. A regression here changes every
    // top-level session.
    expect(levels[0]).toEqual(proposal);
    expect(levels).toEqual([
      proposal,
      chain[0],
      chain[1],
      // chain[2] IS the proposal, so it is not repeated
    ]);
  });

  it("depth >= 1 starts on the subagent-chain head, not the inherited model", () => {
    const levels = levelsForDepth(proposal, chain, 1);
    expect(levels[0]).toEqual({ provider: "meridian", model: "claude-haiku-4-5" });
    // Every chain rung is still walked before anything else.
    expect(levels.slice(0, 3)).toEqual(chain);
  });

  it("depth >= 1 keeps the inherited proposal reachable as the LAST resort", () => {
    const levels = levelsForDepth(proposal, chain, 1);
    const last = levels[levels.length - 1];
    expect(last).toEqual(proposal);
    // And nothing before it repeats it.
    expect(levels.indexOf(last)).toBe(levels.lastIndexOf(last));
  });

  it("an OFF-CHAIN proposal is appended after every rung — the deliberate-model path", () => {
    // THE BRANCH THE OTHER TESTS NEVER REACH (#81 review, subagent 0200183f).
    // The fixture chain above CONTAINS the proposal, so the last-resort test
    // above is satisfied by the no-duplicate branch rather than by the append
    // branch. A deliberate caller-supplied model that is on no rung is the
    // only input that executes `[head, ...rest, proposalRoute]`, and it is
    // exactly the case the owner decision promised would still run: the
    // chain leads, but the caller's choice is never discarded.
    const offChain = { provider: "electronhub", model: "glm-5.3" };
    const levels = levelsForDepth(offChain, chain, 1);
    expect(levels).toEqual([...chain, offChain]);
    expect(levels[0]).toEqual(chain[0]);
    expect(levels[levels.length - 1]).toEqual(offChain);
    // Depth-0 with the same off-chain proposal still leads with it, so the
    // append branch cannot leak into orchestrator routing.
    expect(levelsForDepth(offChain, chain, 0)).toEqual([offChain, ...chain]);
  });

  it("a proposal already equal to the chain head produces no duplicate rung", () => {
    const head = { provider: "meridian", model: "claude-haiku-4-5" };
    const levels = levelsForDepth(head, chain, 1);
    expect(levels).toEqual(chain);
    const asStrings = levels.map((l) => `${l.provider}/${l.model}`);
    expect(new Set(asStrings).size).toBe(asStrings.length);
  });
});
