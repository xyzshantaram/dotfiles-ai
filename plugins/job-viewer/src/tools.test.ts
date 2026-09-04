import { describe, expect, it } from "vitest";
import type { JobSnapshotLike } from "./buffer";
import { JobBufferStore } from "./buffer";
import { buildJobTools, type JobsServiceLike, type ToolsServiceLike } from "./tools";

/** Records registered tool definitions. No mocking library. */
function makeFakeTools(): ToolsServiceLike & { registered: unknown[] } {
  const registered: unknown[] = [];
  return {
    registered,
    register(tool: unknown): () => void {
      registered.push(tool);
      return () => {
        registered.splice(registered.indexOf(tool), 1);
      };
    },
  };
}

function snap(partial: Partial<JobSnapshotLike>): JobSnapshotLike {
  return {
    id: "j1",
    kind: "bash",
    label: "build",
    status: "running",
    startedAt: 100,
    ...partial,
  };
}

/** Stateful jobs stub. It deliberately implements no read() method. */
function makeFakeJobs(): JobsServiceLike & {
  seed(snapshot: JobSnapshotLike): void;
  waitCalls: { id: string; timeoutMs: number; signal?: AbortSignal }[];
  killCalls: { id: string; reason?: string }[];
} {
  const snapshots = new Map<string, JobSnapshotLike>();
  const waitCalls: { id: string; timeoutMs: number; signal?: AbortSignal }[] = [];
  const killCalls: { id: string; reason?: string }[] = [];
  return {
    seed(snapshot: JobSnapshotLike): void {
      snapshots.set(snapshot.id, snapshot);
    },
    waitCalls,
    killCalls,
    list(caller?: unknown): JobSnapshotLike[] {
      return [...snapshots.values()].filter((s) => caller === "fake-agent");
    },
    get(id: string): JobSnapshotLike {
      const snapshot = snapshots.get(id);
      if (!snapshot) throw new Error(`unknown job: ${id}`);
      return snapshot;
    },
    kill(id: string, _caller?: unknown, _reason?: string): "requested" | "already-finished" {
      killCalls.push({ id, reason: _reason });
      return "requested";
    },
    async wait(
      id: string,
      timeoutMs: number,
      _caller?: unknown,
      signal?: AbortSignal,
    ): Promise<JobSnapshotLike> {
      waitCalls.push({ id, timeoutMs, signal });
      return snapshots.get(id) ?? snap({ id });
    },
  };
}

function makeExec() {
  return { agent: "fake-agent", signal: new AbortController().signal };
}

const OPTIONS = { waitTimeoutMs: 30_000, maxWaitTimeoutMs: 600_000 };

function registerAndGet(tools: { registered: unknown[] }, name: string): any {
  const tool = tools.registered.find((t: any) => t.name === name);
  if (!tool) throw new Error(`tool ${name} not registered`);
  return tool;
}

function makeStore(): JobBufferStore {
  return new JobBufferStore({ maxBytes: 1000, retentionMs: 60_000 });
}

describe("buildJobTools", () => {
  it("registers exactly three tool definitions", () => {
    const tools = makeFakeTools();
    buildJobTools(makeFakeJobs(), makeStore(), OPTIONS).forEach((t) => tools.register(t));
    const names = tools.registered.map((t: any) => t.name).sort();
    expect(names).toEqual(["job_kill", "job_list", "job_output"]);
  });

  describe("job_list", () => {
    it("returns mapped public snapshots", async () => {
      const tools = makeFakeTools();
      const jobs = makeFakeJobs();
      jobs.list = () => [snap({ id: "j1", status: "running", detail: "exit code: 0" })];
      buildJobTools(jobs, makeStore(), OPTIONS).forEach((t) => tools.register(t));
      const tool = registerAndGet(tools, "job_list");
      const result = await tool.execute({}, makeExec());
      expect(Object.keys(result[0])).toEqual(["id", "kind", "label", "status", "detail", "startedAt"]);
    });

    it("returns an empty array when no jobs exist", async () => {
      const tools = makeFakeTools();
      buildJobTools(makeFakeJobs(), makeStore(), OPTIONS).forEach((t) => tools.register(t));
      const tool = registerAndGet(tools, "job_list");
      expect(await tool.execute({}, makeExec())).toEqual([]);
    });
  });

  describe("job_output", () => {
    it("returns buffered store text, and the fake jobs has no read()", async () => {
      const tools = makeFakeTools();
      const jobs = makeFakeJobs();
      const store = makeStore();
      store.append("j1", "hello ");
      store.append("j1", "world");
      jobs.seed(snap({ id: "j1" }));
      buildJobTools(jobs, store, OPTIONS).forEach((t) => tools.register(t));
      const tool = registerAndGet(tools, "job_output");
      const value = await tool.execute({ job_id: "j1" }, makeExec());
      expect(value.text).toBe("hello world");
      expect(value.truncated).toBe(false);
      expect(value.job.id).toBe("j1");
      expect("ownerSession" in value.job).toBe(false);
      expect("read" in jobs).toBe(false);
    });

    it("uses an empty string when the store has no entry", async () => {
      const tools = makeFakeTools();
      const jobs = makeFakeJobs();
      jobs.get = () => snap({ id: "j9" });
      buildJobTools(jobs, makeStore(), OPTIONS).forEach((t) => tools.register(t));
      const tool = registerAndGet(tools, "job_output");
      const value = await tool.execute({ job_id: "j9" }, makeExec());
      expect(value.text).toBe("");
    });

    it("passes the computed timeout to jobs.wait when wait is true", async () => {
      const tools = makeFakeTools();
      const jobs = makeFakeJobs();
      const store = makeStore();
      jobs.seed(snap({ id: "j1" }));
      buildJobTools(jobs, store, OPTIONS).forEach((t) => tools.register(t));
      const tool = registerAndGet(tools, "job_output");
      await tool.execute({ job_id: "j1", wait: true, timeout_ms: 1500 }, makeExec());
      expect(jobs.waitCalls).toEqual([
        { id: "j1", timeoutMs: 1500, signal: expect.any(AbortSignal) },
      ]);
    });

    it("caps the wait timeout at the configured maximum", async () => {
      const tools = makeFakeTools();
      const jobs = makeFakeJobs();
      jobs.seed(snap({ id: "j1" }));
      buildJobTools(jobs, makeStore(), OPTIONS).forEach((t) => tools.register(t));
      const tool = registerAndGet(tools, "job_output");
      await tool.execute({ job_id: "j1", wait: true, timeout_ms: 999_999_999 }, makeExec());
      expect(jobs.waitCalls[0]?.timeoutMs).toBe(OPTIONS.maxWaitTimeoutMs);
    });

    it("surfaces the truncated flag from the store entry", async () => {
      const tools = makeFakeTools();
      const jobs = makeFakeJobs();
      const store = new JobBufferStore({ maxBytes: 10, retentionMs: 60_000 });
      store.append("j1", "0123456789abcdefgh");
      jobs.seed(snap({ id: "j1" }));
      buildJobTools(jobs, store, OPTIONS).forEach((t) => tools.register(t));
      const tool = registerAndGet(tools, "job_output");
      const value = await tool.execute({ job_id: "j1" }, makeExec());
      expect(store.get("j1")?.truncated).toBe(true);
      expect(value.truncated).toBe(true);
    });

    it("throws on an empty job_id before touching jobs", async () => {
      const tools = makeFakeTools();
      const jobs = makeFakeJobs();
      buildJobTools(jobs, makeStore(), OPTIONS).forEach((t) => tools.register(t));
      const tool = registerAndGet(tools, "job_output");
      await expect(tool.execute({ job_id: "" }, makeExec())).rejects.toThrow(/invalid job_id/);
      expect(jobs.waitCalls).toEqual([]);
      expect(jobs.killCalls).toEqual([]);
    });
  });

  describe("job_kill", () => {
    it("reports cancellation-requested for a requested kill", async () => {
      const tools = makeFakeTools();
      const jobs = makeFakeJobs();
      const store = makeStore();
      jobs.seed(snap({ id: "j1" }));
      buildJobTools(jobs, store, OPTIONS).forEach((t) => tools.register(t));
      const tool = registerAndGet(tools, "job_kill");
      const value = await tool.execute({ job_id: "j1", reason: "stale" }, makeExec());
      expect(value.outcome).toBe("cancellation-requested");
      expect(value.job.id).toBe("j1");
      expect(jobs.killCalls).toEqual([{ id: "j1", reason: "stale" }]);
    });

    it("reports already-finished when the job finished first", async () => {
      const tools = makeFakeTools();
      const jobs = makeFakeJobs();
      const store = makeStore();
      jobs.seed(snap({ id: "j1", status: "completed" }));
      buildJobTools(jobs, store, OPTIONS).forEach((t) => tools.register(t));
      // Flip the stub result after setup via a marker in killResults.
      const tool = registerAndGet(tools, "job_kill");
      jobs.kill = () => {
        jobs.killCalls.push({ id: "j1" });
        return "already-finished";
      };
      const value = await tool.execute({ job_id: "j1" }, makeExec());
      expect(value.outcome).toBe("already-finished");
      expect(jobs.killCalls.length).toBe(1);
    });

    it("throws on an empty job_id before touching jobs", async () => {
      const tools = makeFakeTools();
      const jobs = makeFakeJobs();
      buildJobTools(jobs, makeStore(), OPTIONS).forEach((t) => tools.register(t));
      const tool = registerAndGet(tools, "job_kill");
      await expect(tool.execute({ job_id: "" }, makeExec())).rejects.toThrow(/invalid job_id/);
      expect(jobs.killCalls).toEqual([]);
    });
  });
});
