/**
 * HTTP routes over the job output buffer: read and kill.
 *
 * The read handler serves buffered text for one job. It never calls
 * jobs.read(), so it never touches the consuming read cursor. There is
 * no session or ownership check. The buffer holds one shared copy per
 * job, and the log-viewer route already uses the same loopback-trusted
 * model.
 *
 * The kill handler is a real mutation on ctx.jobs.kill(), which does
 * need an authorized caller. The browser holds no Agent, so it uses
 * the owner the poller already cached for this job (buffer.ts's
 * setOwner/getOwner) as that caller.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "../../shared/http";
import type { JobBufferStore, JobSnapshotLike } from "./buffer";
import { toPublicSnapshot } from "./public-job";

/** Subset of the jobs service a kill request needs. */
export interface JobsKillServiceLike {
  kill(id: string, caller?: unknown, reason?: string): "requested" | "already-finished";
  get(id: string, caller?: unknown): JobSnapshotLike;
}

/** Collect one request body and parse it as JSON. Throws on bad JSON. */
function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "null"));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

/** Translate a kill outcome to the same name the job_kill tool uses. */
function toToolOutcome(outcome: "requested" | "already-finished"): "cancellation-requested" | "already-finished" {
  return outcome === "already-finished" ? "already-finished" : "cancellation-requested";
}

export function makeOutputHandler(
  store: JobBufferStore,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    // req.url holds only the path, so give URL a base.
    const url = new URL(req.url ?? "", "http://localhost");
    const jobId = url.searchParams.get("job_id");
    if (jobId === null || jobId === "") {
      sendJson(res, 200, { ok: false, error: "missing job_id" });
      return;
    }
    const entry = store.get(jobId);
    if (entry === undefined) {
      sendJson(res, 200, { ok: false, error: "unknown job" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      text: entry.text,
      truncated: entry.truncated,
      job: entry.snapshot !== undefined ? toPublicSnapshot(entry.snapshot) : undefined,
    });
  };
}

/**
 * Kill one job on behalf of the browser. The browser holds no Agent,
 * so the handler uses the owner cached by the poller as the caller.
 */
export function makeKillHandler(
  jobs: JobsKillServiceLike,
  store: JobBufferStore,
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendJson(res, 200, { ok: false, error: err instanceof Error ? err.message : String(err) });
      return;
    }
    const { job_id: jobId, reason } = body as { job_id?: unknown; reason?: string };
    if (typeof jobId !== "string" || jobId === "") {
      sendJson(res, 200, { ok: false, error: "missing job_id" });
      return;
    }
    const owner = store.getOwner(jobId);
    try {
      const outcome = jobs.kill(jobId, owner, reason);
      const snapshot = jobs.get(jobId, owner);
      sendJson(res, 200, {
        ok: true,
        outcome: toToolOutcome(outcome),
        job: toPublicSnapshot(snapshot),
      });
    } catch (err) {
      sendJson(res, 200, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };
}
