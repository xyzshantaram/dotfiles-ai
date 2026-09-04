import { describe, expect, it } from "vitest";
import type { Agent } from "@deepseek-ai/dsh-agent";
import {
  chooseDelivery,
  completionNoticeText,
  mountCompletionDelivery,
  type InboxClaimEventsLike,
  type JobDoneServiceLike,
  type JobDoneSnapshotLike,
} from "./completion";

// ---- hand-rolled fakes -------------------------------------------------

interface Recorder {
  calls: unknown[];
}

function makeRecorder(): Recorder & ((message: unknown) => void) {
  const rec = (message: unknown) => {
    rec.calls.push(message);
  };
  rec.calls = [];
  return rec as Recorder & ((message: unknown) => void);
}

interface FakeAgent {
  status: "idle" | "running";
  followup: Recorder & ((message: unknown) => void);
  inject: Recorder & ((message: unknown) => void);
}

function makeFakeAgent(status: "idle" | "running" = "idle"): FakeAgent {
  return {
    status,
    followup: makeRecorder(),
    inject: makeRecorder(),
  };
}

// The real Agent type is structurally wider; a cast keeps the fakes simple.
function asAgent(fake: FakeAgent): Agent {
  return fake as unknown as Agent;
}

function makeSnapshot(overrides: Partial<JobDoneSnapshotLike> = {}): JobDoneSnapshotLike {
  return {
    id: "j1",
    kind: "bash",
    label: "run tests",
    status: "completed",
    startedAt: 1,
    finishedAt: 2,
    reported: false,
    ...overrides,
  };
}

interface DoneRecord {
  snapshot: JobDoneSnapshotLike;
  owner: Agent | undefined;
}

function makeFakeJobs(): {
  service: JobDoneServiceLike;
  fire: (snapshot: JobDoneSnapshotLike, owner: Agent | undefined) => void;
  registered: () => number;
} {
  let listener: ((snapshot: JobDoneSnapshotLike, owner: Agent | undefined) => void) | undefined;
  return {
    service: {
      onJobDone(l) {
        listener = l;
        return () => {
          listener = undefined;
        };
      },
    },
    fire(snapshot, owner) {
      listener?.(snapshot, owner);
    },
    registered: () => (listener === undefined ? 0 : 1),
  };
}

function makeFakeEvents(): {
  events: InboxClaimEventsLike;
  fireClaim: (agent: Agent, kind: string) => void;
  registered: () => number;
} {
  let listener: ((payload: { agent: Agent; message: { source: { kind: string } } }) => void) | undefined;
  return {
    events: {
      on(_event, l) {
        listener = l;
        return () => {
          listener = undefined;
        };
      },
    },
    fireClaim(agent, kind) {
      listener?.({ agent, message: { source: { kind } } });
    },
    registered: () => (listener === undefined ? 0 : 1),
  };
}

// ---- chooseDelivery ----------------------------------------------------

describe("chooseDelivery", () => {
  it("wakes an idle owner under budget", () => {
    expect(chooseDelivery("idle", 0, 3, "wakeup")).toBe("followup");
    expect(chooseDelivery("idle", 2, 3, "wakeup")).toBe("followup");
  });

  it("stops waking at or over the budget", () => {
    expect(chooseDelivery("idle", 3, 3, "wakeup")).toBe("inject");
    expect(chooseDelivery("idle", 5, 3, "wakeup")).toBe("inject");
  });

  it("never wakes a running owner", () => {
    expect(chooseDelivery("running", 0, 3, "wakeup")).toBe("inject");
    expect(chooseDelivery("running", 99, 3, "wakeup")).toBe("inject");
  });

  it("quiet mode always injects", () => {
    expect(chooseDelivery("idle", 0, 3, "quiet")).toBe("inject");
    expect(chooseDelivery("running", 99, 3, "quiet")).toBe("inject");
  });
});

// ---- completionNoticeText ----------------------------------------------

describe("completionNoticeText", () => {
  it("includes id, kind, label, and status", () => {
    const text = completionNoticeText(makeSnapshot());
    expect(text).toContain("j1");
    expect(text).toContain("bash");
    expect(text).toContain("run tests");
    expect(text).toContain("completed");
  });

  it("includes the detail when present", () => {
    const text = completionNoticeText(makeSnapshot({ detail: "exit 0" }));
    expect(text).toContain("exit 0");
  });

  it("omits the detail phrase when absent", () => {
    const text = completionNoticeText(makeSnapshot());
    expect(text).not.toContain(", undefined");
    expect(text).toContain("[status: completed]");
  });
});

// ---- mountCompletionDelivery -------------------------------------------

describe("mountCompletionDelivery", () => {
  const opts = (delivery: "quiet" | "wakeup", max = 3) => ({ delivery, maxConsecutiveWakes: max });

  it("never touches a reported snapshot", () => {
    const jobs = makeFakeJobs();
    const events = makeFakeEvents();
    const agent = makeFakeAgent("idle");
    mountCompletionDelivery(jobs.service, events.events, opts("wakeup"));
    jobs.fire(makeSnapshot({ reported: true }), asAgent(agent));
    expect(agent.followup.calls).toHaveLength(0);
    expect(agent.inject.calls).toHaveLength(0);
  });

  it("never delivers when the owner is undefined", () => {
    const jobs = makeFakeJobs();
    const events = makeFakeEvents();
    mountCompletionDelivery(jobs.service, events.events, opts("wakeup"));
    jobs.fire(makeSnapshot(), undefined);
    // No agent to assert on; the fake jobs service must not throw.
    expect(jobs.registered()).toBe(1);
  });

  it("follows up an idle owner under budget with the job id in the message", () => {
    const jobs = makeFakeJobs();
    const events = makeFakeEvents();
    const agent = makeFakeAgent("idle");
    mountCompletionDelivery(jobs.service, events.events, opts("wakeup"));
    jobs.fire(makeSnapshot({ id: "job-42" }), asAgent(agent));
    expect(agent.followup.calls).toHaveLength(1);
    expect(agent.inject.calls).toHaveLength(0);
    const message = agent.followup.calls[0] as { content: { text: string }[] };
    expect(message.content[0].text).toContain("job-42");
  });

  it("switches to inject once the wake budget is spent", () => {
    const jobs = makeFakeJobs();
    const events = makeFakeEvents();
    const agent = makeFakeAgent("idle");
    mountCompletionDelivery(jobs.service, events.events, opts("wakeup", 2));
    for (const id of ["a", "b", "c", "d"]) {
      jobs.fire(makeSnapshot({ id }), asAgent(agent));
    }
    expect(agent.followup.calls).toHaveLength(2);
    expect(agent.inject.calls).toHaveLength(2);
  });

  it("resets the wake budget after a user inbox claim", () => {
    const jobs = makeFakeJobs();
    const events = makeFakeEvents();
    const agent = makeFakeAgent("idle");
    mountCompletionDelivery(jobs.service, events.events, opts("wakeup", 1));
    jobs.fire(makeSnapshot({ id: "a" }), asAgent(agent));
    jobs.fire(makeSnapshot({ id: "b" }), asAgent(agent));
    expect(agent.followup.calls).toHaveLength(1);
    expect(agent.inject.calls).toHaveLength(1);
    events.fireClaim(asAgent(agent), "user");
    jobs.fire(makeSnapshot({ id: "c" }), asAgent(agent));
    expect(agent.followup.calls).toHaveLength(2);
    expect(agent.inject.calls).toHaveLength(1);
  });

  it("quiet mode injects and registers no claim listener", () => {
    const jobs = makeFakeJobs();
    const events = makeFakeEvents();
    const idle = makeFakeAgent("idle");
    const running = makeFakeAgent("running");
    mountCompletionDelivery(jobs.service, events.events, opts("quiet", 3));
    jobs.fire(makeSnapshot({ id: "a" }), asAgent(idle));
    jobs.fire(makeSnapshot({ id: "b" }), asAgent(running));
    expect(idle.inject.calls).toHaveLength(1);
    expect(idle.followup.calls).toHaveLength(0);
    expect(running.inject.calls).toHaveLength(1);
    expect(running.followup.calls).toHaveLength(0);
    expect(events.registered()).toBe(0);
  });

  it("teardown unregisters both listeners", () => {
    const jobs = makeFakeJobs();
    const events = makeFakeEvents();
    const agent = makeFakeAgent("idle");
    const teardown = mountCompletionDelivery(jobs.service, events.events, opts("wakeup"));
    expect(jobs.registered()).toBe(1);
    expect(events.registered()).toBe(1);
    teardown();
    jobs.fire(makeSnapshot(), asAgent(agent));
    events.fireClaim(asAgent(agent), "user");
    expect(agent.followup.calls).toHaveLength(0);
    expect(agent.inject.calls).toHaveLength(0);
  });
});
