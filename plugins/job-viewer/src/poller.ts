/**
 * Poller — drives ctx.jobs and feeds a JobBufferStore.
 *
 * This module is the only code in the plugin that calls
 * jobs.read(). The jobs service exposes one consuming cursor per
 * job. A second direct reader would steal output from the poller.
 * Every other consumer reads from the store instead.
 */

import type { JobBufferStore, JobSnapshotLike } from "./buffer";

export type { JobSnapshotLike } from "./buffer";

export interface JobsServiceLike {
  list(caller?: unknown): JobSnapshotLike[];
  read(id: string, caller?: unknown): { text: string; snapshot: JobSnapshotLike };
  onJobsChanged(listener: (owner: unknown | undefined) => void): () => void;
}

const TERMINAL: ReadonlySet<string> = new Set(["completed", "killed", "failed"]);

/**
 * Pure reconciliation. Decide which jobs to start polling and which
 * to stop. "stopping" is not terminal, so a stopping job stays
 * polled until it reaches a terminal status.
 */
export function reconcile(
  visibleJobs: JobSnapshotLike[],
  currentlyPolled: ReadonlySet<string>,
): { toStart: string[]; toStop: string[] } {
  const toStart: string[] = [];
  const toStop: string[] = [];
  const visibleIds = new Set<string>();
  for (const job of visibleJobs) {
    visibleIds.add(job.id);
    if (TERMINAL.has(job.status)) {
      if (currentlyPolled.has(job.id)) toStop.push(job.id);
    } else if (!currentlyPolled.has(job.id)) {
      toStart.push(job.id);
    }
  }
  for (const id of currentlyPolled) {
    if (!visibleIds.has(id)) toStop.push(id);
  }
  return { toStart, toStop };
}

interface ActivePoll {
  timer: ReturnType<typeof setInterval>;
  caller: unknown;
}

/**
 * Wire a live jobs service to a store. Returns the teardown
 * function, which stops all timers and unregisters the listener.
 */
export function mountPoller(
  jobs: JobsServiceLike,
  store: JobBufferStore,
  options: {
    pollIntervalMs: number;
    setInterval: typeof setInterval;
    clearInterval: typeof clearInterval;
  },
): () => void {
  // jobId -> active timer plus the caller that may read that job.
  const active = new Map<string, ActivePoll>();

  const stopPoll = (id: string, finalRead: boolean): void => {
    const poll = active.get(id);
    if (!poll) return;
    if (finalRead) {
      try {
        const result = jobs.read(id, poll.caller);
        store.append(id, result.text);
        store.setSnapshot(id, result.snapshot);
        store.setOwner(id, poll.caller);
      } catch {
        // The job may be gone already. That race is expected.
      }
    }
    options.clearInterval(poll.timer);
    active.delete(id);
    store.markFinished(id);
  };

  const startPoll = (id: string, caller: unknown): void => {
    if (active.has(id)) return;
    try {
      const result = jobs.read(id, caller);
      store.append(id, result.text);
      store.setSnapshot(id, result.snapshot);
      store.setOwner(id, caller);
      if (TERMINAL.has(result.snapshot.status)) {
        store.markFinished(id);
        return;
      }
    } catch {
      // The job may be gone already. That race is expected.
    }
    const timer = options.setInterval(() => {
      try {
        const result = jobs.read(id, caller);
        store.append(id, result.text);
        store.setSnapshot(id, result.snapshot);
        store.setOwner(id, caller);
        if (TERMINAL.has(result.snapshot.status)) stopPoll(id, false);
      } catch {
        // The job may be gone already. That race is expected.
      }
    }, options.pollIntervalMs);
    active.set(id, { timer, caller });
  };

  const unregister = jobs.onJobsChanged((owner) => {
    try {
      const visible = jobs.list(owner);
      const polledForOwner = new Set<string>();
      for (const [id, poll] of active) {
        if (poll.caller === owner) polledForOwner.add(id);
      }
      const { toStart, toStop } = reconcile(visible, polledForOwner);
      for (const id of toStop) stopPoll(id, true);
      for (const id of toStart) startPoll(id, owner);
    } catch {
      // list() may throw for a disposed owner. That race is expected.
    }
  });

  return () => {
    unregister();
    for (const [, poll] of active) options.clearInterval(poll.timer);
    active.clear();
  };
}
