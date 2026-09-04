import { describe, expect, it } from "vitest";
import { JobBufferStore } from "./buffer";
import { makeKillHandler, makeOutputHandler, type JobsKillServiceLike } from "./route";

/** Fake ServerResponse that captures what sendJson writes. */
function makeRes() {
  const res = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as string | undefined,
  };
  (res as any).setHeader = (key: string, value: string) => {
    res.headers[key] = value;
  };
  (res as any).end = (chunk?: string) => {
    res.body = chunk;
  };
  return res;
}

function call(url: string | undefined) {
  const store = new JobBufferStore({ maxBytes: 1000, retentionMs: 60_000 });
  const handler = makeOutputHandler(store);
  const res = makeRes();
  handler({ url } as any, res as any);
  return { res, store, parsed: res.body !== undefined ? JSON.parse(res.body) : undefined };
}

describe("makeOutputHandler", () => {
  it("answers missing job_id with the error shape", () => {
    const { res, parsed } = call("/job-viewer/output");
    expect(res.statusCode).toBe(200);
    expect(parsed).toEqual({ ok: false, error: "missing job_id" });
  });

  it("treats an empty job_id as missing", () => {
    const { parsed } = call("/job-viewer/output?job_id=");
    expect(parsed).toEqual({ ok: false, error: "missing job_id" });
  });

  it("answers an unknown job_id with the error shape", () => {
    const { parsed } = call("/job-viewer/output?job_id=nope");
    expect(parsed).toEqual({ ok: false, error: "unknown job" });
  });

  it("serves buffered text and a public snapshot for a known job", () => {
    const store = new JobBufferStore({ maxBytes: 1000, retentionMs: 60_000 });
    store.append("j1", "line one\n");
    store.setSnapshot("j1", {
      id: "j1",
      kind: "bash",
      label: "build",
      status: "running",
      startedAt: 100,
      ownerSession: "s1",
    } as any);
    const handler = makeOutputHandler(store);
    const res = makeRes();
    handler({ url: "/job-viewer/output?job_id=j1" } as any, res as any);
    const parsed = JSON.parse(res.body ?? "null");
    expect(parsed.ok).toBe(true);
    expect(parsed.text).toBe("line one\n");
    expect(parsed.truncated).toBe(false);
    expect("ownerSession" in parsed.job).toBe(false);
    expect(parsed.job).toEqual({
      id: "j1",
      kind: "bash",
      label: "build",
      status: "running",
      startedAt: 100,
    });
  });

  it("serves job: undefined when no snapshot is cached yet", () => {
    const store = new JobBufferStore({ maxBytes: 1000, retentionMs: 60_000 });
    store.append("j1", "partial");
    const handler = makeOutputHandler(store);
    const res = makeRes();
    handler({ url: "/job-viewer/output?job_id=j1" } as any, res as any);
    const parsed = JSON.parse(res.body ?? "null");
    expect(parsed.ok).toBe(true);
    expect(parsed.text).toBe("partial");
    expect(parsed.job).toBeUndefined();
  });
});

const SNAPSHOT = {
  id: "j1",
  kind: "bash",
  label: "build",
  status: "running" as const,
  startedAt: 100,
  ownerSession: "s1",
};

interface KillCalls {
  kill: [string, unknown, string | undefined][];
  get: [string, unknown][];
}

/** Hand-rolled fake of the jobs service a kill handler needs. */
function makeFakeJobs(overrides: Partial<JobsKillServiceLike> = {}) {
  const calls: KillCalls = { kill: [], get: [] };
  const jobs: JobsKillServiceLike = {
    kill: (id, caller, reason) => {
      calls.kill.push([id, caller, reason]);
      return "requested";
    },
    get: (id, caller) => {
      calls.get.push([id, caller]);
      return SNAPSHOT;
    },
    ...overrides,
  };
  return { jobs, calls };
}

/** Fake IncomingMessage that replays one body chunk, then ends. */
async function callKill(
  body: string,
  jobs: JobsKillServiceLike,
  seed?: (store: JobBufferStore) => void,
) {
  const store = new JobBufferStore({ maxBytes: 1000, retentionMs: 60_000 });
  seed?.(store);
  const handler = makeKillHandler(jobs, store);
  const res = makeRes();
  const cbs: Record<string, (chunk?: unknown) => void> = {};
  const req = {
    on: (event: string, cb: (chunk?: unknown) => void) => {
      cbs[event] = cb;
    },
  };
  const done = handler(req as any, res as any);
  if (cbs.data) cbs.data(Buffer.from(body, "utf8"));
  if (cbs.end) cbs.end();
  await done;
  return { res, store, parsed: res.body !== undefined ? JSON.parse(res.body) : undefined };
}

describe("makeKillHandler", () => {
  it("answers a body with no job_id with the error shape and never kills", async () => {
    const { jobs, calls } = makeFakeJobs();
    const { parsed } = await callKill(JSON.stringify({ reason: "x" }), jobs);
    expect(parsed).toEqual({ ok: false, error: "missing job_id" });
    expect(calls.kill).toEqual([]);
  });

  it("kills with the cached owner and answers the public snapshot", async () => {
    const owner = { id: "agent-1" };
    const { jobs, calls } = makeFakeJobs();
    const { parsed } = await callKill(JSON.stringify({ job_id: "j1", reason: "done" }), jobs, (store) =>
      store.setOwner("j1", owner),
    );
    expect(calls.kill).toEqual([["j1", owner, "done"]]);
    expect(calls.get).toEqual([["j1", owner]]);
    expect(parsed.ok).toBe(true);
    expect(parsed.outcome).toBe("cancellation-requested");
    expect("ownerSession" in parsed.job).toBe(false);
    expect(parsed.job).toEqual({ id: "j1", kind: "bash", label: "build", status: "running", startedAt: 100 });
  });

  it("maps an already-finished kill to outcome already-finished", async () => {
    const { jobs } = makeFakeJobs({ kill: () => "already-finished" });
    const { parsed } = await callKill(JSON.stringify({ job_id: "j1" }), jobs, (store) =>
      store.setOwner("j1", { id: "agent-1" }),
    );
    expect(parsed.ok).toBe(true);
    expect(parsed.outcome).toBe("already-finished");
  });

  it("forwards exactly the owner the store holds for that job id", async () => {
    const owner = Symbol("agent");
    const { jobs, calls } = makeFakeJobs();
    await callKill(JSON.stringify({ job_id: "j1" }), jobs, (store) => store.setOwner("j1", owner));
    expect(calls.kill[0]?.[1]).toBe(owner);
    expect(calls.get[0]?.[1]).toBe(owner);
  });

  it("answers an unknown job with the error shape instead of crashing", async () => {
    const { jobs } = makeFakeJobs({
      kill: () => {
        throw new Error("job not found");
      },
    });
    const { parsed } = await callKill(JSON.stringify({ job_id: "nope" }), jobs);
    expect(parsed).toEqual({ ok: false, error: "job not found" });
  });

  it("answers a malformed body with the error shape instead of crashing", async () => {
    const { jobs, calls } = makeFakeJobs();
    const { parsed } = await callKill("{not json", jobs);
    expect(parsed.ok).toBe(false);
    expect(typeof parsed.error).toBe("string");
    expect(calls.kill).toEqual([]);
  });
});
