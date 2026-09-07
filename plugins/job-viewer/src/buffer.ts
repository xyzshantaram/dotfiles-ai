/**
 * JobBufferStore — in-memory output buffer for job output.
 *
 * The `jobs` service exposes a single consuming cursor per job. Many
 * readers need the same output. This store holds one copy per job so
 * every reader can look at it without touching the cursor.
 */

export interface JobBufferConfig {
  maxBytes: number;
  retentionMs: number;
}

/** Mirror of the real JobSnapshot from @deepseek-ai/dsh-jobs. */
export interface JobSnapshotLike {
  id: string;
  kind: string;
  label: string;
  status: "running" | "stopping" | "completed" | "killed" | "failed";
  detail?: string;
  startedAt: number;
  finishedAt?: number;
}

export interface BufferEntry {
  text: string;
  truncated: boolean;
  finishedAt?: number;
  snapshot?: JobSnapshotLike;
  /** Owner Agent instance, cached for callers that cannot hold one. */
  owner?: unknown;
  /**
   * Set when the entry outlives the output retention window. The text is
   * dropped but the snapshot stays, so the output route can answer "this
   * job finished too long ago" instead of "unknown job". Tombstones
   * themselves expire TOMBSTONE_RETENTION_MS after this stamp.
   */
  evictedAt?: number;
}

/**
 * Drop characters from the front of `text` until it fits in `maxBytes`
 * UTF-8 bytes. Step several characters at a time to keep this cheap.
 */
function capToBytes(text: string, maxBytes: number): { text: string; wasTruncated: boolean } {
  let wasTruncated = false;
  while (Buffer.byteLength(text, "utf8") > maxBytes) {
    const overBy = Buffer.byteLength(text, "utf8") - maxBytes;
    const dropChars = Math.max(1, Math.ceil(overBy / 4)); // worst case 4 bytes/char in UTF-8
    text = text.slice(dropChars);
    wasTruncated = true;
  }
  return { text, wasTruncated };
}

/**
 * How long a tombstone survives after its output is dropped. The output
 * retention window is minutes; a tombstone is only a snapshot plus two
 * timestamps, so keeping it a full day bounds memory while still naming
 * old jobs for as long as the shipped job list keeps their rows.
 */
const TOMBSTONE_RETENTION_MS = 24 * 60 * 60 * 1000;

export class JobBufferStore {
  private config: JobBufferConfig;
  private now: () => number;
  private entries = new Map<string, BufferEntry>();

  constructor(config: JobBufferConfig, now?: () => number) {
    this.config = config;
    this.now = now ?? Date.now;
  }

  /** Append one output delta. Creates the entry on first use. */
  append(jobId: string, delta: string): void {
    let entry = this.entries.get(jobId);
    if (!entry) {
      entry = { text: "", truncated: false };
      this.entries.set(jobId, entry);
    }
    // Fresh output resurrects a tombstone: the job is producing again, so
    // the "output expired" stamp must not shadow the new text.
    delete entry.evictedAt;
    let text = entry.text + delta;
    if (Buffer.byteLength(text, "utf8") > this.config.maxBytes) {
      const capped = capToBytes(text, this.config.maxBytes);
      text = capped.text;
      if (capped.wasTruncated) entry.truncated = true;
    }
    entry.text = text;
  }

  /** Stamp the settlement time. The first stamp wins. */
  markFinished(jobId: string, atMs?: number): void {
    let entry = this.entries.get(jobId);
    if (!entry) {
      entry = { text: "", truncated: false };
      this.entries.set(jobId, entry);
    }
    if (entry.finishedAt === undefined) {
      entry.finishedAt = atMs ?? this.now();
    }
  }

  /** Cache the latest snapshot. The caller always has the freshest one. */
  setSnapshot(jobId: string, snapshot: JobSnapshotLike): void {
    let entry = this.entries.get(jobId);
    if (!entry) {
      entry = { text: "", truncated: false };
      this.entries.set(jobId, entry);
    }
    entry.snapshot = snapshot;
  }

  /** Cache the owner for a kill request. The latest owner wins. */
  setOwner(jobId: string, owner: unknown): void {
    let entry = this.entries.get(jobId);
    if (!entry) {
      entry = { text: "", truncated: false };
      this.entries.set(jobId, entry);
    }
    entry.owner = owner;
  }

  /** Read the cached owner without changing the entry. */
  getOwner(jobId: string): unknown {
    return this.entries.get(jobId)?.owner;
  }

  /** Read the entry without changing it. */
  get(jobId: string): BufferEntry | undefined {
    return this.entries.get(jobId);
  }

  /**
   * Age finished entries past the retention window into tombstones, and
   * drop tombstones past their own window. Returns the ids newly
   * tombstoned in this pass. Running entries are never touched.
   */
  sweep(nowMs?: number): string[] {
    const at = nowMs ?? this.now();
    const evicted: string[] = [];
    for (const [jobId, entry] of this.entries) {
      // A tombstone is only a snapshot plus two timestamps: drop it a day
      // after its output expired to keep memory bounded.
      if (entry.evictedAt !== undefined) {
        if (at - entry.evictedAt >= TOMBSTONE_RETENTION_MS) {
          this.entries.delete(jobId);
        }
        continue;
      }
      if (entry.finishedAt !== undefined && at - entry.finishedAt >= this.config.retentionMs) {
        entry.text = "";
        entry.evictedAt = at;
        evicted.push(jobId);
      }
    }
    return evicted;
  }
}
