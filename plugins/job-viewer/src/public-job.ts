import type { JobSnapshotLike } from "./buffer";

/**
 * Explicit field pick. A real JobSnapshot carries ownerSession and
 * reported too. Those fields must never reach a model tool result or an
 * HTTP response. Pick fields by name. Do not spread the object. Then a
 * hidden extra field cannot leak even when the object carries more than
 * its declared type says.
 */
export function toPublicSnapshot(snapshot: JobSnapshotLike): JobSnapshotLike {
  return {
    id: snapshot.id,
    kind: snapshot.kind,
    label: snapshot.label,
    status: snapshot.status,
    ...(snapshot.detail !== undefined ? { detail: snapshot.detail } : {}),
    startedAt: snapshot.startedAt,
    ...(snapshot.finishedAt !== undefined ? { finishedAt: snapshot.finishedAt } : {}),
  };
}

/** Render generic status with optional producer detail, e.g. "[status: completed, exit code: 0]". */
export function statusLine(snapshot: { status: string; detail?: string }): string {
  return snapshot.detail !== undefined
    ? `[status: ${snapshot.status}, ${snapshot.detail}]`
    : `[status: ${snapshot.status}]`;
}
