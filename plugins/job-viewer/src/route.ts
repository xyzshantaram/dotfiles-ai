/**
 * HTTP read side of the job output buffer.
 *
 * The handler serves buffered text for one job. It never calls
 * jobs.read(), so it never touches the consuming read cursor. There is
 * no session or ownership check. The buffer holds one shared copy per
 * job, and the log-viewer route already uses the same loopback-trusted
 * model.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { sendJson } from "../../shared/http";
import type { JobBufferStore } from "./buffer";
import { toPublicSnapshot } from "./public-job";

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
