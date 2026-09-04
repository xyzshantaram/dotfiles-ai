import { describe, expect, it } from "vitest";
import type { JobSnapshotLike } from "./buffer";
import { statusLine, toPublicSnapshot } from "./public-job";

describe("toPublicSnapshot", () => {
  it("drops extra fields the declared type does not name", () => {
    const sneaky = {
      id: "j1",
      kind: "bash",
      label: "build",
      status: "running",
      startedAt: 100,
      ownerSession: "s1",
    } as unknown as JobSnapshotLike;
    const result = toPublicSnapshot(sneaky);
    expect("ownerSession" in result).toBe(false);
    expect(Object.keys(result).sort()).toEqual([
      "id",
      "kind",
      "label",
      "startedAt",
      "status",
    ]);
  });

  it("keeps detail and finishedAt when present", () => {
    const snapshot: JobSnapshotLike = {
      id: "j1",
      kind: "bash",
      label: "build",
      status: "failed",
      detail: "exit code: 1",
      startedAt: 100,
      finishedAt: 200,
    };
    expect(toPublicSnapshot(snapshot)).toEqual(snapshot);
  });

  it("omits detail and finishedAt when absent", () => {
    const snapshot: JobSnapshotLike = {
      id: "j1",
      kind: "bash",
      label: "build",
      status: "running",
      startedAt: 100,
    };
    const result = toPublicSnapshot(snapshot);
    expect(result).toEqual(snapshot);
    expect("detail" in result).toBe(false);
    expect("finishedAt" in result).toBe(false);
  });
});

describe("statusLine", () => {
  it("renders status without detail", () => {
    expect(statusLine({ status: "running" })).toBe("[status: running]");
  });

  it("renders status with detail", () => {
    expect(statusLine({ status: "completed", detail: "exit code: 0" })).toBe(
      "[status: completed, exit code: 0]",
    );
  });
});
