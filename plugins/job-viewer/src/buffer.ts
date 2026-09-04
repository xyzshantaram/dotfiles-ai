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

  /** Delete every finished entry past the retention window. */
  sweep(nowMs?: number): string[] {
    const at = nowMs ?? this.now();
    const evicted: string[] = [];
    for (const [jobId, entry] of this.entries) {
      if (entry.finishedAt !== undefined && at - entry.finishedAt >= this.config.retentionMs) {
        this.entries.delete(jobId);
        evicted.push(jobId);
      }
    }
    return evicted;
  }
}
