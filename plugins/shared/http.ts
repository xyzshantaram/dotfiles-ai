/**
 * Host-half HTTP helpers shared by the settings-panel route owners.
 *
 * These are the node:http counterparts of the browser helpers in
 * client-util.ts: the client bundles talk to these routes with `fetch`, the
 * host plugins answer with a ServerResponse. The two sides cannot share one
 * implementation because the transports differ.
 *
 * One source implementation per helper, so host plugins cannot drift.
 * Historical inline copies lived in plugins/profiles.ts,
 * plugins/session-archive/src/index.ts, and plugins/subscriptions/src/index.ts
 * (rewired in the build-drift batch).
 *
 * `readBody` keeps both historical behaviors: it honors the Content-Length
 * pre-check (profiles and session-archive) and rejects oversized bodies while
 * streaming (all three). The cap is a parameter so the 16 KiB session-archive
 * routes stay strict next to the 64 KiB defaults.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

/** Default request-body cap for host routes; see header for the history. */
const DEFAULT_MAX_BODY_BYTES = 64 * 1024;

/** Write one JSON response with no-store caching, matching every host route. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

/**
 * Read and parse a JSON request body. Throws on bad or oversized input.
 *
 * `maxBytes` defaults to 64 KiB; pass 16 * 1024 for the session-archive
 * routes, whose historical cap was 16 KiB.
 */
export async function readBody(
  req: IncomingMessage,
  maxBytes: number = DEFAULT_MAX_BODY_BYTES,
): Promise<unknown> {
  const declared = req.headers["content-length"];
  if (declared !== undefined && Number(declared) > maxBytes) {
    throw new Error("request body too large");
  }
  const chunks: Buffer[] = [];
  let received = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    received += buffer.byteLength;
    if (received > maxBytes) throw new Error("request body too large");
    chunks.push(buffer);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("body is not valid JSON");
  }
}

/** True when `value` is a non-array object, the shape route validators expect. */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
