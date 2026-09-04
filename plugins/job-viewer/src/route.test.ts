import { describe, expect, it } from "vitest";
import { JobBufferStore } from "./buffer";
import { makeOutputHandler } from "./route";

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
