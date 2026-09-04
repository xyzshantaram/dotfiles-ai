import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JobBufferStore } from "./buffer";
import { mountPoller, reconcile, type JobsServiceLike, type JobSnapshotLike } from "./poller";

/** Hand-rolled fake jobs service. No mocking library. */
function makeFakeJobs() {
  const snapshots = new Map<string, JobSnapshotLike & { owner?: unknown }>();
  const readQueue = new Map<string, Array<{ text: string; snapshot: JobSnapshotLike }>>();
  const readCalls: Array<{ id: string; caller: unknown }> = [];
  const listeners: Array<(owner: unknown | undefined) => void> = [];

  const jobs: JobsServiceLike & {
    setSnapshot(id: string, snapshot: JobSnapshotLike, owner?: unknown): void;
    queueRead(id: string, result: { text: string; snapshot: JobSnapshotLike }): void;
    fire(owner: unknown | undefined): void;
    listeners: typeof listeners;
    readCalls: typeof readCalls;
  } = {
    listeners,
    readCalls,
    setSnapshot(id, snapshot, owner) {
      snapshots.set(id, { ...snapshot, owner });
    },
    queueRead(id, result) {
      const queue = readQueue.get(id) ?? [];
      queue.push(result);
      readQueue.set(id, queue);
    },
    fire(owner) {
      for (const listener of [...listeners]) listener(owner);
    },
    list(caller) {
      return [...snapshots.values()].filter(
        (s) => s.owner === undefined || s.owner === caller,
      );
    },
    read(id, caller) {
      readCalls.push({ id, caller });
      const queue = readQueue.get(id);
      if (!queue || queue.length === 0) throw new Error(`unknown job: ${id}`);
      return queue.shift()!;
    },
    onJobsChanged(listener) {
      listeners.push(listener);
      return () => {
        const index = listeners.indexOf(listener);
        if (index >= 0) listeners.splice(index, 1);
      };
    },
  };
  return jobs;
}

/** Widen a bare { id, status } fixture into a full JobSnapshotLike. */
function snap(id: string, status: JobSnapshotLike["status"]): JobSnapshotLike {
  return { id, kind: "agent", label: id, status, startedAt: 0 };
}

describe("reconcile", () => {
  it("starts a new running job", () => {
    const { toStart, toStop } = reconcile([snap("a", "running")], new Set());
    expect(toStart).toEqual(["a"]);
    expect(toStop).toEqual([]);
  });

  it("starts a stopping job too", () => {
    const { toStart } = reconcile([snap("a", "stopping")], new Set());
    expect(toStart).toEqual(["a"]);
  });

  it("stops a polled job that turned terminal", () => {
    const { toStart, toStop } = reconcile(
      [snap("a", "completed")],
      new Set(["a"]),
    );
    expect(toStart).toEqual([]);
    expect(toStop).toEqual(["a"]);
  });

  it("stops a polled job that disappeared", () => {
    const { toStart, toStop } = reconcile([], new Set(["a"]));
    expect(toStart).toEqual([]);
    expect(toStop).toEqual(["a"]);
  });

  it("leaves a still-running polled job alone", () => {
    const { toStart, toStop } = reconcile(
      [snap("a", "running")],
      new Set(["a"]),
    );
    expect(toStart).toEqual([]);
    expect(toStop).toEqual([]);
  });
});

describe("mountPoller", () => {
  let jobs: ReturnType<typeof makeFakeJobs>;
  let store: JobBufferStore;

  beforeEach(() => {
    vi.useFakeTimers();
    jobs = makeFakeJobs();
    store = new JobBufferStore({ maxBytes: 1_000_000, retentionMs: 5000 });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads output into the store, stops at terminal, and sweeps", () => {
    jobs.setSnapshot("j1", snap("j1", "running"));
    jobs.queueRead("j1", { text: "hello ", snapshot: snap("j1", "running") });
    jobs.queueRead("j1", { text: "world", snapshot: snap("j1", "running") });
    const teardown = mountPoller(jobs, store, {
      pollIntervalMs: 100,
      setInterval,
      clearInterval,
    });

    jobs.fire(undefined);
    expect(store.get("j1")?.text).toBe("hello ");
    // The poller caches the snapshot from each read.
    expect(store.get("j1")?.snapshot).toEqual(snap("j1", "running"));
    expect(jobs.readCalls).toEqual([{ id: "j1", caller: undefined }]);

    vi.advanceTimersByTime(100);
    expect(store.get("j1")?.text).toBe("hello world");
    const readsAfterTwo = jobs.readCalls.length;

    // The job completes on the next read.
    jobs.queueRead("j1", { text: "!", snapshot: snap("j1", "completed") });
    vi.advanceTimersByTime(100);
    expect(store.get("j1")?.text).toBe("hello world!");
    // The latest read wins, so the cached snapshot shows completed.
    expect(store.get("j1")?.snapshot).toEqual(snap("j1", "completed"));
    const readsAfterTerminal = jobs.readCalls.length;

    // The timer stopped. Time passing produces no further reads.
    vi.advanceTimersByTime(10_000);
    expect(jobs.readCalls.length).toBe(readsAfterTerminal);
    expect(readsAfterTerminal).toBeGreaterThan(readsAfterTwo);

    // markFinished ran, so the retention window applies.
    vi.advanceTimersByTime(6000);
    expect(store.sweep()).toContain("j1");
    expect(store.get("j1")).toBeUndefined();

    teardown();
  });

  it("teardown stops all timers", () => {
    jobs.setSnapshot("j1", snap("j1", "running"));
    jobs.queueRead("j1", { text: "a", snapshot: snap("j1", "running") });
    jobs.queueRead("j1", { text: "b", snapshot: snap("j1", "running") });
    const teardown = mountPoller(jobs, store, {
      pollIntervalMs: 100,
      setInterval,
      clearInterval,
    });

    jobs.fire(undefined);
    const readsAtStart = jobs.readCalls.length;
    teardown();
    vi.advanceTimersByTime(10_000);
    expect(jobs.readCalls.length).toBe(readsAtStart);
  });

  it("swallows a read error from a job removed mid-flight", () => {
    jobs.setSnapshot("j1", snap("j1", "running"));
    jobs.queueRead("j1", { text: "a", snapshot: snap("j1", "running") });
    const teardown = mountPoller(jobs, store, {
      pollIntervalMs: 100,
      setInterval,
      clearInterval,
    });

    jobs.fire(undefined);
    // No queued read left. The next tick throws. It must not crash.
    vi.advanceTimersByTime(500);
    expect(store.get("j1")?.text).toBe("a");
    teardown();
  });
});
