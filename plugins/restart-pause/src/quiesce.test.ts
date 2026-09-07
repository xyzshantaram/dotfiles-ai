import { describe, expect, it } from "vitest";
import { QuiesceTracker, waitForQuiet } from "./quiesce";

/** A fake clock, so the timeout is tested without waiting for one. */
function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe("QuiesceTracker", () => {
  it("reports quiet when nothing is running", () => {
    expect(new QuiesceTracker().snapshot()).toMatchObject({ running: 0, quiet: true });
  });

  it("counts a running agent and names it", () => {
    const t = new QuiesceTracker();
    const agent = {};
    t.observe(agent, "running", "session-abc");
    expect(t.snapshot()).toMatchObject({
      running: 1,
      quiet: false,
      runningLabels: ["session-abc"],
    });
  });

  it("clears the agent when it goes idle", () => {
    const t = new QuiesceTracker();
    const agent = {};
    t.observe(agent, "running", "session-abc");
    t.observe(agent, "idle", "session-abc");
    expect(t.snapshot().quiet).toBe(true);
  });

  it("tracks agents independently, so one going idle does not clear another", () => {
    const t = new QuiesceTracker();
    const a = {};
    const b = {};
    t.observe(a, "running", "a");
    t.observe(b, "running", "b");
    t.observe(a, "idle", "a");
    expect(t.snapshot()).toMatchObject({ running: 1, runningLabels: ["b"] });
  });

  it("forgets a disposed agent, so a vanished one cannot hold the latch forever", () => {
    const t = new QuiesceTracker();
    const agent = {};
    t.observe(agent, "running", "gone");
    t.forget(agent);
    expect(t.snapshot().quiet).toBe(true);
  });

  it("does not double-count an agent that reports running twice", () => {
    const t = new QuiesceTracker();
    const agent = {};
    t.observe(agent, "running", "once");
    t.observe(agent, "running", "once");
    expect(t.snapshot().running).toBe(1);
  });
});

describe("waitForQuiet", () => {
  it("returns immediately when already quiet", async () => {
    const clock = fakeClock();
    const out = await waitForQuiet(new QuiesceTracker(), {
      timeoutMs: 5000,
      pollMs: 100,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(out).toMatchObject({ quiet: true, waitedMs: 0, stillRunning: [] });
  });

  it("returns quiet once the last agent goes idle", async () => {
    const clock = fakeClock();
    const t = new QuiesceTracker();
    const agent = {};
    t.observe(agent, "running", "worker");

    // Go idle after the first poll.
    let polls = 0;
    const sleep = async (ms: number) => {
      await clock.sleep(ms);
      polls += 1;
      if (polls === 1) t.observe(agent, "idle", "worker");
    };

    const out = await waitForQuiet(t, { timeoutMs: 5000, pollMs: 100, now: clock.now, sleep });
    expect(out.quiet).toBe(true);
    expect(out.waitedMs).toBe(100);
  });

  it("gives up at the deadline and NAMES what did not settle", async () => {
    const clock = fakeClock();
    const t = new QuiesceTracker();
    t.observe({}, "running", "stuck-session");

    const out = await waitForQuiet(t, {
      timeoutMs: 300,
      pollMs: 100,
      now: clock.now,
      sleep: clock.sleep,
    });

    expect(out.quiet).toBe(false);
    expect(out.stillRunning).toEqual(["stuck-session"]);
    expect(out.waitedMs).toBeGreaterThanOrEqual(300);
  });

  it("never sleeps past the deadline", async () => {
    const clock = fakeClock();
    const t = new QuiesceTracker();
    t.observe({}, "running", "stuck");

    const out = await waitForQuiet(t, {
      timeoutMs: 150,
      pollMs: 1000,
      now: clock.now,
      sleep: clock.sleep,
    });

    // A naive implementation sleeps a full 1000ms poll and overshoots by 850ms.
    expect(out.waitedMs).toBe(150);
  });
});
