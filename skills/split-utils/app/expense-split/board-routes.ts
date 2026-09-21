// Split board routes for the browser component.
// This module owns the component file path and the patch endpoint.

import {
  type ItemAssignment,
  loadSplitStateSync,
  snapshotMtime,
  writeSplitState,
} from "../../src/splitstate.ts";
import { readRunMetaSync, runsDir } from "../../src/runstate.ts";

// Component file beside this module, plus the sibling plain-JS math
// module it imports. The board loads as a module script, so its relative
// import of ./split-math.js arrives here as /app/split-math.js. Both stay
// plain files with no build step; this route serves each one statically.
const BOARD_URL = new URL("./split-board.js", import.meta.url);
const BOARD_FILES = new Map([
  ["/app/split-board.js", BOARD_URL],
  ["/app/split-math.js", new URL("./split-math.js", import.meta.url)],
]);

// True for a plain record value.
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// True when a run id holds a slash or a dot segment.
function isUnsafeRunId(id: string): boolean {
  if (id.length === 0) return true;
  if (id.includes("/")) return true;
  return id === "." || id === "..";
}

// Plain text reply with no markup.
function plain(status: number, text: string): Response {
  return new Response(text + "\n", {
    status,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

// Serve one plain browser file by its module URL. Answer 404 while it misses.
async function serveBoardFile(url: URL): Promise<Response> {
  let text: string;
  try {
    text = await Deno.readTextFile(url);
  } catch {
    return plain(404, "The split board file is not ready yet.");
  }
  return new Response(text, {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

// Accept a patch of assignments and skips for one run.
async function applyPatch(req: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return plain(400, "The patch body must be valid JSON.");
  }
  if (!isRecord(body)) {
    return plain(400, "The patch body must be an object.");
  }
  const runId = body["runId"];
  if (typeof runId !== "string" || runId.length === 0) {
    return plain(400, "The patch names no run.");
  }
  if (isUnsafeRunId(runId)) {
    return plain(400, "The run id is not safe.");
  }
  if (readRunMetaSync(runId) === null) {
    return plain(404, "No run matches that id.");
  }
  const runDir = runsDir() + "/" + runId;
  const doc = loadSplitStateSync(runDir);
  if (doc === null) {
    return plain(409, "The split has not started for this run.");
  }
  const assignments = body["assignments"];
  if (isRecord(assignments)) {
    // Amounts arrive computed by the board's share helpers and are stored
    // verbatim; the export copies them into output.json untouched. So the
    // board's numbers are what gets pushed — both sides share the
    // remainder rule in ./split-math.js to keep them identical.
    for (const [key, value] of Object.entries(assignments)) {
      if (isRecord(value)) {
        doc.assignments[key] = value as unknown as ItemAssignment;
      }
    }
  }
  const skipped = body["skipped"];
  if (isRecord(skipped)) {
    for (const [key, value] of Object.entries(skipped)) {
      if (value === false) delete doc.skipped[key];
      else doc.skipped[key] = true;
    }
  }
  // Take the baseline from the file this patch was just applied to, not
  // from the caller. The board reads its baseline when the step renders,
  // and the wizard writes the same file, so a caller's value goes stale
  // between a render and the first checkpoint. A stale baseline sent the
  // whole board's work into a conflict copy while an empty document kept
  // the real file, which is the one outcome this endpoint must not have.
  const baseline = await snapshotMtime(runDir);
  const result = await writeSplitState(runDir, doc, baseline);
  return Response.json({
    ok: true,
    at: result.at,
    conflicted: result.conflicted,
  });
}

// Answer board paths. Return null for anything the wizard owns.
export async function handleBoardRoute(
  req: Request,
): Promise<Response | null> {
  const path = new URL(req.url).pathname;
  const boardFile = BOARD_FILES.get(path);
  if (req.method === "GET" && boardFile !== undefined) {
    return await serveBoardFile(boardFile);
  }
  if (req.method === "POST" && path === "/app/split-patch") {
    return await applyPatch(req);
  }
  return null;
}
