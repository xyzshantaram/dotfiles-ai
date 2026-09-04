/**
 * Model tools over the jobs service and the shared output buffer.
 *
 * Every tool reads output text from the JobBufferStore only. No tool
 * calls jobs.read(). That method owns the single consuming read cursor
 * and belongs to the poller alone. The list, get, kill, and wait
 * methods never touch the cursor, so the tools call them directly and
 * pass exec.agent as the caller.
 */

import { defineTool } from "@deepseek-ai/dsh-tools";
import type { JobBufferStore, JobSnapshotLike } from "./buffer";
import { statusLine, toPublicSnapshot } from "./public-job";

/** Subset of the jobs service the tools use. No read() here on purpose. */
export interface JobsServiceLike {
  list(caller?: unknown): JobSnapshotLike[];
  get(id: string, caller?: unknown): JobSnapshotLike;
  kill(id: string, caller?: unknown, reason?: string): "requested" | "already-finished";
  wait(id: string, timeoutMs: number, caller?: unknown, signal?: AbortSignal): Promise<JobSnapshotLike>;
}

/** Subset of the tools service used at registration time. */
export interface ToolsServiceLike {
  register(tool: unknown): () => void;
}

export interface JobToolOptions {
  waitTimeoutMs: number;
  maxWaitTimeoutMs: number;
}

/** Schema for one public job snapshot, in the tool output-schema form. */
const JOB_SNAPSHOT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", required: true },
    kind: { type: "string", required: true },
    label: { type: "string", required: true },
    status: {
      type: "string",
      required: true,
      enum: ["running", "stopping", "completed", "killed", "failed"],
    },
    detail: { type: "string" },
    startedAt: { type: "number", required: true },
    finishedAt: { type: "number" },
  },
  additionalProperties: false,
} as const;

function invalidJobId(got: unknown): Error {
  return new Error(`invalid job_id: expected a non-empty string, got ${JSON.stringify(got)}`);
}

/**
 * Build the three tool definitions. Do not register anything here. The
 * caller yields tools.register() for each result inside a Cordis
 * generator effect, so registration is reversible on stop and reload.
 */
export function buildJobTools(
  jobs: JobsServiceLike,
  store: JobBufferStore,
  options: JobToolOptions,
): unknown[] {
  const jobList = defineTool({
    name: "job_list",
    description:
      "List background jobs. " +
      "Returns public snapshots for jobs this agent owns plus unowned jobs. " +
      "Does not touch any read cursor.",
    parameters: {},
    output: {
      schema: { type: "array", items: JOB_SNAPSHOT_SCHEMA },
      render: (_args, value: any) => {
        const lines = (value as JobSnapshotLike[]).map(
          (job) => `${job.id} [${job.kind}] ${job.status} — ${job.label}`,
        );
        return [{ type: "text", text: lines.length > 0 ? lines.join("\n") : "(no background jobs)" }];
      },
    },
    async execute(_args, exec) {
      const caller = (exec as any)?.agent;
      return jobs.list(caller).map(toPublicSnapshot);
    },
  });

  const jobOutput = defineTool({
    name: "job_output",
    description:
      "Read buffered output for one background job. " +
      "Pass wait to block until the job reaches a terminal status or the timeout expires. " +
      "Output text comes from a shared buffer, so this never touches the read cursor.",
    parameters: {
      job_id: {
        type: "string",
        required: true,
        description: "Job id returned by the tool that started the background work.",
      },
      wait: {
        type: "boolean",
        description: "Block until the job reaches a terminal status or the timeout expires.",
      },
      timeout_ms: {
        type: "number",
        description:
          "Max wait in milliseconds, only meaningful with wait: true. Defaults to the configured wait timeout, capped by the configured maximum.",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", required: true },
          truncated: { type: "boolean", required: true },
          job: { ...JOB_SNAPSHOT_SCHEMA, required: true },
        },
      },
      render: (_args, value: any) => {
        const body = value.text.length > 0 ? value.text : "(no new output)";
        const truncNote = value.truncated ? "[earlier output dropped, buffer full]\n" : "";
        return [
          {
            type: "text",
            text: `${body}${body.endsWith("\n") ? "" : "\n"}${truncNote}${statusLine(value.job)}`,
          },
        ];
      },
    },
    async execute(args, exec) {
      const { job_id: id, wait, timeout_ms } = args as {
        job_id?: unknown;
        wait?: boolean;
        timeout_ms?: number;
      };
      if (typeof id !== "string" || id.length === 0) throw invalidJobId(id);
      const caller = (exec as any)?.agent;
      if (wait === true) {
        const timeout = Math.min(timeout_ms ?? options.waitTimeoutMs, options.maxWaitTimeoutMs);
        await jobs.wait(id, timeout, caller, (exec as any)?.signal);
      }
      const snapshot = jobs.get(id, caller);
      const entry = store.get(id);
      return {
        text: entry?.text ?? "",
        truncated: entry?.truncated ?? false,
        job: toPublicSnapshot(snapshot),
      };
    },
  });

  const jobKill = defineTool({
    name: "job_kill",
    description:
      "Request cancellation of one background job. " +
      "The request returns at once. The job stops soon after. " +
      "Does not touch the read cursor.",
    parameters: {
      job_id: {
        type: "string",
        required: true,
        description: "Job id returned by the tool that started the background work.",
      },
      reason: {
        type: "string",
        description: "Optional short reason, recorded in the log and forwarded to the job.",
      },
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          outcome: {
            type: "string",
            required: true,
            enum: ["cancellation-requested", "already-finished"],
          },
          job: { ...JOB_SNAPSHOT_SCHEMA, required: true },
        },
      },
      render: (_args, value: any) => {
        const line =
          value.outcome === "already-finished"
            ? `job ${value.job.id} had already finished ${statusLine(value.job)}`
            : `requested cancellation of job ${value.job.id}`;
        return [{ type: "text", text: line }];
      },
    },
    async execute(args, exec) {
      const { job_id: id, reason } = args as { job_id?: unknown; reason?: string };
      if (typeof id !== "string" || id.length === 0) throw invalidJobId(id);
      const caller = (exec as any)?.agent;
      const outcome = jobs.kill(id, caller, reason);
      const snapshot = jobs.get(id, caller);
      return {
        outcome:
          outcome === "already-finished"
            ? ("already-finished" as const)
            : ("cancellation-requested" as const),
        job: toPublicSnapshot(snapshot),
      };
    },
  });

  return [jobList, jobOutput, jobKill];
}
