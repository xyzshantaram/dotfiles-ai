/**
 * The decision logic of restart-pause, kept free of Cordis and Node so it can be
 * tested without a running harness.
 *
 * Restarting dsh is how a composition change takes effect, because bundle rows
 * are static per boot. The cost today is whatever is in flight, so people defer
 * restarting and changes pile up unverified. What does NOT survive an ungraceful
 * kill is a turn torn in half: `open-turn` and `torn-frame` are two of the six
 * defect classes the session repair fixtures are built from, and both are what
 * killing a busy process produces.
 *
 * So the job is narrow: know which agents are running, wait for them to reach a
 * boundary, and refuse to pretend when they do not.
 */

/** dsh reports exactly these two states on `agent/status`. */
export type AgentStatus = "idle" | "running";

export interface QuiesceSnapshot {
  /** How many agents are mid-turn right now. */
  readonly running: number;
  /** Stable labels for what is running, so the UI can name them rather than counting. */
  readonly runningLabels: readonly string[];
  /** True once a restart has been requested and we are waiting for quiet. */
  readonly quiescing: boolean;
  /** True when nothing is running: the only state in which a restart is clean. */
  readonly quiet: boolean;
}

/**
 * Tracks which agents are mid-turn.
 *
 * Keyed by the agent object rather than by an id, because an id field is not
 * part of the contract this plugin verified and inventing one is how a tracker
 * silently stops matching. Object identity is guaranteed by the event payload.
 */
export class QuiesceTracker {
  private readonly running = new Map<object, string>();
  private quiescing = false;

  /** Apply one `agent/status` event. */
  observe(agent: object, status: AgentStatus, label: string): void {
    if (status === "running") {
      this.running.set(agent, label);
      return;
    }
    this.running.delete(agent);
  }

  /** Apply one `agent/disposed` event, so a vanished agent cannot hold the latch. */
  forget(agent: object): void {
    this.running.delete(agent);
  }

  /** A restart has been asked for; we are now waiting for quiet. */
  beginQuiesce(): void {
    this.quiescing = true;
  }

  /** The user cancelled, or the restart finished and this process is still alive. */
  cancelQuiesce(): void {
    this.quiescing = false;
  }

  snapshot(): QuiesceSnapshot {
    const labels = [...this.running.values()].sort();
    return {
      running: labels.length,
      runningLabels: labels,
      quiescing: this.quiescing,
      quiet: labels.length === 0,
    };
  }
}

export interface WaitOutcome {
  /** Whether quiet was reached before the deadline. */
  readonly quiet: boolean;
  /** What was still running when we gave up; empty when quiet. */
  readonly stillRunning: readonly string[];
  /** How long we waited, in milliseconds. */
  readonly waitedMs: number;
}

/**
 * Wait for quiet, or report exactly what stopped us.
 *
 * The timeout is not a formality. A turn that never ends -- a hung tool call, a
 * provider that never answers -- would otherwise hold the latch forever, and a
 * restart button that hangs with no explanation is worse than one that refuses.
 * On expiry the caller is told WHICH agents did not settle, so proceeding is an
 * informed choice rather than a shrug.
 */
export async function waitForQuiet(
  tracker: QuiesceTracker,
  opts: {
    readonly timeoutMs: number;
    readonly pollMs: number;
    readonly now: () => number;
    readonly sleep: (ms: number) => Promise<void>;
  },
): Promise<WaitOutcome> {
  const started = opts.now();

  for (;;) {
    const snap = tracker.snapshot();
    if (snap.quiet) {
      return { quiet: true, stillRunning: [], waitedMs: opts.now() - started };
    }

    const waited = opts.now() - started;
    if (waited >= opts.timeoutMs) {
      return { quiet: false, stillRunning: snap.runningLabels, waitedMs: waited };
    }

    await opts.sleep(Math.min(opts.pollMs, opts.timeoutMs - waited));
  }
}
