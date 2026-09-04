// plugins/job-viewer/src/index.ts
import z from "@deepseek-ai/schemastery";

// plugins/job-viewer/src/buffer.ts
function capToBytes(text, maxBytes) {
  let wasTruncated = false;
  while (Buffer.byteLength(text, "utf8") > maxBytes) {
    const overBy = Buffer.byteLength(text, "utf8") - maxBytes;
    const dropChars = Math.max(1, Math.ceil(overBy / 4));
    text = text.slice(dropChars);
    wasTruncated = true;
  }
  return { text, wasTruncated };
}
var JobBufferStore = class {
  config;
  now;
  entries = /* @__PURE__ */ new Map();
  constructor(config, now) {
    this.config = config;
    this.now = now ?? Date.now;
  }
  /** Append one output delta. Creates the entry on first use. */
  append(jobId, delta) {
    let entry = this.entries.get(jobId);
    if (!entry) {
      entry = { text: "", truncated: false };
      this.entries.set(jobId, entry);
    }
    let text = entry.text + delta;
    if (Buffer.byteLength(text, "utf8") > this.config.maxBytes) {
      const capped = capToBytes(text, this.config.maxBytes);
      text = capped.text;
      if (capped.wasTruncated) entry.truncated = true;
    }
    entry.text = text;
  }
  /** Stamp the settlement time. The first stamp wins. */
  markFinished(jobId, atMs) {
    let entry = this.entries.get(jobId);
    if (!entry) {
      entry = { text: "", truncated: false };
      this.entries.set(jobId, entry);
    }
    if (entry.finishedAt === void 0) {
      entry.finishedAt = atMs ?? this.now();
    }
  }
  /** Cache the latest snapshot. The caller always has the freshest one. */
  setSnapshot(jobId, snapshot) {
    let entry = this.entries.get(jobId);
    if (!entry) {
      entry = { text: "", truncated: false };
      this.entries.set(jobId, entry);
    }
    entry.snapshot = snapshot;
  }
  /** Cache the owner for a kill request. The latest owner wins. */
  setOwner(jobId, owner) {
    let entry = this.entries.get(jobId);
    if (!entry) {
      entry = { text: "", truncated: false };
      this.entries.set(jobId, entry);
    }
    entry.owner = owner;
  }
  /** Read the cached owner without changing the entry. */
  getOwner(jobId) {
    return this.entries.get(jobId)?.owner;
  }
  /** Read the entry without changing it. */
  get(jobId) {
    return this.entries.get(jobId);
  }
  /** Delete every finished entry past the retention window. */
  sweep(nowMs) {
    const at = nowMs ?? this.now();
    const evicted = [];
    for (const [jobId, entry] of this.entries) {
      if (entry.finishedAt !== void 0 && at - entry.finishedAt >= this.config.retentionMs) {
        this.entries.delete(jobId);
        evicted.push(jobId);
      }
    }
    return evicted;
  }
};

// plugins/job-viewer/src/completion.ts
import { boundContextSummary, createUserMessage } from "@deepseek-ai/dsh-llm";
function chooseDelivery(ownerStatus, spentWakes, maxConsecutiveWakes, delivery) {
  if (delivery === "wakeup" && ownerStatus === "idle" && spentWakes < maxConsecutiveWakes) {
    return "followup";
  }
  return "inject";
}
function completionNoticeText(snapshot) {
  const detail = snapshot.detail !== void 0 ? `, ${snapshot.detail}` : "";
  return `background job ${snapshot.id} (${snapshot.kind}: ${snapshot.label}) finished [status: ${snapshot.status}${detail}]. Read its output with job_output.`;
}
function mountCompletionDelivery(jobs, events, options) {
  const spentWakes = /* @__PURE__ */ new WeakMap();
  const unregisterClaim = options.delivery === "wakeup" ? events.on("agent/inbox/claimed", ({ agent, message }) => {
    if (message.source.kind === "user") spentWakes.delete(agent);
  }) : () => {
  };
  const unregisterDone = jobs.onJobDone((snapshot, owner) => {
    if (snapshot.reported || owner === void 0) return;
    const message = createUserMessage({
      content: [{ type: "text", text: completionNoticeText(snapshot) }],
      source: {
        kind: "plugin",
        plugin: "job-viewer",
        form: "notice",
        summary: boundContextSummary(`${snapshot.kind} ${snapshot.label} [status: ${snapshot.status}]`)
      }
    });
    const spent = spentWakes.get(owner) ?? 0;
    const decision = chooseDelivery(owner.status, spent, options.maxConsecutiveWakes, options.delivery);
    if (decision === "followup") {
      spentWakes.set(owner, spent + 1);
      owner.followup(message);
    } else {
      owner.inject(message);
    }
  });
  return () => {
    unregisterClaim();
    unregisterDone();
  };
}

// plugins/job-viewer/src/poller.ts
var TERMINAL = /* @__PURE__ */ new Set(["completed", "killed", "failed"]);
function reconcile(visibleJobs, currentlyPolled) {
  const toStart = [];
  const toStop = [];
  const visibleIds = /* @__PURE__ */ new Set();
  for (const job of visibleJobs) {
    visibleIds.add(job.id);
    if (TERMINAL.has(job.status)) {
      if (currentlyPolled.has(job.id)) toStop.push(job.id);
    } else if (!currentlyPolled.has(job.id)) {
      toStart.push(job.id);
    }
  }
  for (const id of currentlyPolled) {
    if (!visibleIds.has(id)) toStop.push(id);
  }
  return { toStart, toStop };
}
function mountPoller(jobs, store, options) {
  const active = /* @__PURE__ */ new Map();
  const stopPoll = (id, finalRead) => {
    const poll = active.get(id);
    if (!poll) return;
    if (finalRead) {
      try {
        const result = jobs.read(id, poll.caller);
        store.append(id, result.text);
        store.setSnapshot(id, result.snapshot);
        store.setOwner(id, poll.caller);
      } catch {
      }
    }
    options.clearInterval(poll.timer);
    active.delete(id);
    store.markFinished(id);
  };
  const startPoll = (id, caller) => {
    if (active.has(id)) return;
    try {
      const result = jobs.read(id, caller);
      store.append(id, result.text);
      store.setSnapshot(id, result.snapshot);
      store.setOwner(id, caller);
      if (TERMINAL.has(result.snapshot.status)) {
        store.markFinished(id);
        return;
      }
    } catch {
    }
    const timer = options.setInterval(() => {
      try {
        const result = jobs.read(id, caller);
        store.append(id, result.text);
        store.setSnapshot(id, result.snapshot);
        store.setOwner(id, caller);
        if (TERMINAL.has(result.snapshot.status)) stopPoll(id, false);
      } catch {
      }
    }, options.pollIntervalMs);
    active.set(id, { timer, caller });
  };
  const unregister = jobs.onJobsChanged((owner) => {
    try {
      const visible = jobs.list(owner);
      const polledForOwner = /* @__PURE__ */ new Set();
      for (const [id, poll] of active) {
        if (poll.caller === owner) polledForOwner.add(id);
      }
      const { toStart, toStop } = reconcile(visible, polledForOwner);
      for (const id of toStop) stopPoll(id, true);
      for (const id of toStart) startPoll(id, owner);
    } catch {
    }
  });
  return () => {
    unregister();
    for (const [, poll] of active) options.clearInterval(poll.timer);
    active.clear();
  };
}

// plugins/shared/http.ts
var DEFAULT_MAX_BODY_BYTES = 64 * 1024;
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

// plugins/job-viewer/src/public-job.ts
function toPublicSnapshot(snapshot) {
  return {
    id: snapshot.id,
    kind: snapshot.kind,
    label: snapshot.label,
    status: snapshot.status,
    ...snapshot.detail !== void 0 ? { detail: snapshot.detail } : {},
    startedAt: snapshot.startedAt,
    ...snapshot.finishedAt !== void 0 ? { finishedAt: snapshot.finishedAt } : {}
  };
}
function statusLine(snapshot) {
  return snapshot.detail !== void 0 ? `[status: ${snapshot.status}, ${snapshot.detail}]` : `[status: ${snapshot.status}]`;
}

// plugins/job-viewer/src/route.ts
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
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
function toToolOutcome(outcome) {
  return outcome === "already-finished" ? "already-finished" : "cancellation-requested";
}
function makeOutputHandler(store) {
  return (req, res) => {
    const url = new URL(req.url ?? "", "http://localhost");
    const jobId = url.searchParams.get("job_id");
    if (jobId === null || jobId === "") {
      sendJson(res, 200, { ok: false, error: "missing job_id" });
      return;
    }
    const entry = store.get(jobId);
    if (entry === void 0) {
      sendJson(res, 200, { ok: false, error: "unknown job" });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      text: entry.text,
      truncated: entry.truncated,
      job: entry.snapshot !== void 0 ? toPublicSnapshot(entry.snapshot) : void 0
    });
  };
}
function makeKillHandler(jobs, store) {
  return async (req, res) => {
    let body;
    try {
      body = await readJsonBody(req);
    } catch (err) {
      sendJson(res, 200, { ok: false, error: err instanceof Error ? err.message : String(err) });
      return;
    }
    const { job_id: jobId, reason } = body;
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
        job: toPublicSnapshot(snapshot)
      });
    } catch (err) {
      sendJson(res, 200, { ok: false, error: err instanceof Error ? err.message : String(err) });
    }
  };
}

// plugins/job-viewer/src/tools.ts
import { defineTool } from "@deepseek-ai/dsh-tools";
var JOB_SNAPSHOT_SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string", required: true },
    kind: { type: "string", required: true },
    label: { type: "string", required: true },
    status: {
      type: "string",
      required: true,
      enum: ["running", "stopping", "completed", "killed", "failed"]
    },
    detail: { type: "string" },
    startedAt: { type: "number", required: true },
    finishedAt: { type: "number" }
  },
  additionalProperties: false
};
function invalidJobId(got) {
  return new Error(`invalid job_id: expected a non-empty string, got ${JSON.stringify(got)}`);
}
function buildJobTools(jobs, store, options) {
  const jobList = defineTool({
    name: "job_list",
    description: "List background jobs. Returns public snapshots for jobs this agent owns plus unowned jobs. Does not touch any read cursor.",
    parameters: {},
    output: {
      schema: { type: "array", items: JOB_SNAPSHOT_SCHEMA },
      render: (_args, value) => {
        const lines = value.map(
          (job) => `${job.id} [${job.kind}] ${job.status} \u2014 ${job.label}`
        );
        return [{ type: "text", text: lines.length > 0 ? lines.join("\n") : "(no background jobs)" }];
      }
    },
    async execute(_args, exec) {
      const caller = exec?.agent;
      return jobs.list(caller).map(toPublicSnapshot);
    }
  });
  const jobOutput = defineTool({
    name: "job_output",
    description: "Read buffered output for one background job. Pass wait to block until the job reaches a terminal status or the timeout expires. Output text comes from a shared buffer, so this never touches the read cursor.",
    parameters: {
      job_id: {
        type: "string",
        required: true,
        description: "Job id returned by the tool that started the background work."
      },
      wait: {
        type: "boolean",
        description: "Block until the job reaches a terminal status or the timeout expires."
      },
      timeout_ms: {
        type: "number",
        description: "Max wait in milliseconds, only meaningful with wait: true. Defaults to the configured wait timeout, capped by the configured maximum."
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          text: { type: "string", required: true },
          truncated: { type: "boolean", required: true },
          job: { ...JOB_SNAPSHOT_SCHEMA, required: true }
        }
      },
      render: (_args, value) => {
        const body = value.text.length > 0 ? value.text : "(no new output)";
        const truncNote = value.truncated ? "[earlier output dropped, buffer full]\n" : "";
        return [
          {
            type: "text",
            text: `${body}${body.endsWith("\n") ? "" : "\n"}${truncNote}${statusLine(value.job)}`
          }
        ];
      }
    },
    async execute(args, exec) {
      const { job_id: id, wait, timeout_ms } = args;
      if (typeof id !== "string" || id.length === 0) throw invalidJobId(id);
      const caller = exec?.agent;
      if (wait === true) {
        const timeout = Math.min(timeout_ms ?? options.waitTimeoutMs, options.maxWaitTimeoutMs);
        await jobs.wait(id, timeout, caller, exec?.signal);
      }
      const snapshot = jobs.get(id, caller);
      const entry = store.get(id);
      return {
        text: entry?.text ?? "",
        truncated: entry?.truncated ?? false,
        job: toPublicSnapshot(snapshot)
      };
    }
  });
  const jobKill = defineTool({
    name: "job_kill",
    description: "Request cancellation of one background job. The request returns at once. The job stops soon after. Does not touch the read cursor.",
    parameters: {
      job_id: {
        type: "string",
        required: true,
        description: "Job id returned by the tool that started the background work."
      },
      reason: {
        type: "string",
        description: "Optional short reason, recorded in the log and forwarded to the job."
      }
    },
    output: {
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          outcome: {
            type: "string",
            required: true,
            enum: ["cancellation-requested", "already-finished"]
          },
          job: { ...JOB_SNAPSHOT_SCHEMA, required: true }
        }
      },
      render: (_args, value) => {
        const line = value.outcome === "already-finished" ? `job ${value.job.id} had already finished ${statusLine(value.job)}` : `requested cancellation of job ${value.job.id}`;
        return [{ type: "text", text: line }];
      }
    },
    async execute(args, exec) {
      const { job_id: id, reason } = args;
      if (typeof id !== "string" || id.length === 0) throw invalidJobId(id);
      const caller = exec?.agent;
      const outcome = jobs.kill(id, caller, reason);
      const snapshot = jobs.get(id, caller);
      return {
        outcome: outcome === "already-finished" ? "already-finished" : "cancellation-requested",
        job: toPublicSnapshot(snapshot)
      };
    }
  });
  return [jobList, jobOutput, jobKill];
}

// plugins/job-viewer/src/index.ts
var name = "job-viewer";
var inject = ["jobs", "tools", "systemPrompt"];
var Config = z.object({
  maxBytesPerJob: z.number().default(1048576),
  retentionMs: z.number().default(6e5),
  pollIntervalMs: z.number().default(750),
  sweepIntervalMs: z.number().default(3e4),
  waitTimeoutMs: z.number().default(3e4),
  maxWaitTimeoutMs: z.number().default(6e5),
  completionDelivery: z.union(["quiet", "wakeup"]).default("wakeup"),
  maxConsecutiveWakes: z.number().min(1).default(3)
});
function apply(ctx, config) {
  const cfg = Config(config ?? {});
  const store = new JobBufferStore({
    maxBytes: cfg.maxBytesPerJob,
    retentionMs: cfg.retentionMs
  });
  const jobs = ctx.jobs;
  const tools = ctx.tools;
  const teardownPoller = mountPoller(jobs, store, {
    pollIntervalMs: cfg.pollIntervalMs,
    setInterval,
    clearInterval
  });
  const sweepTimer = setInterval(() => store.sweep(), cfg.sweepIntervalMs);
  const detachController = jobs.attachController("job-viewer");
  const teardownCompletion = mountCompletionDelivery(jobs, ctx, {
    delivery: cfg.completionDelivery,
    maxConsecutiveWakes: cfg.maxConsecutiveWakes
  });
  ctx.systemPrompt.section({
    name: "tool:jobs",
    order: 106,
    text: "Track every background job id you start. You are notified in-session when a job finishes \u2014 do not busy-poll or sleep on one; keep working on independent steps and do not duplicate a running job's work. Before giving a final answer, collect every still-relevant job with job_output (set wait: true only when you are genuinely blocked on it), and job_kill jobs that stopped mattering."
  });
  ctx.effect(
    function* () {
      for (const tool of buildJobTools(jobs, store, {
        waitTimeoutMs: cfg.waitTimeoutMs,
        maxWaitTimeoutMs: cfg.maxWaitTimeoutMs
      })) {
        yield tools.register(tool);
      }
    },
    "job-viewer tools"
  );
  try {
    ctx.inject(["webServer"], (scope) => {
      const server = scope.webServer;
      server.register({
        kind: "exact",
        path: "/job-viewer/output",
        handler: makeOutputHandler(store)
      });
      server.register({
        kind: "exact",
        path: "/job-viewer/kill",
        handler: makeKillHandler(jobs, store)
      });
    });
  } catch {
  }
  ctx.effect(
    () => () => {
      teardownPoller();
      clearInterval(sweepTimer);
      detachController();
      teardownCompletion();
    },
    "job-viewer teardown"
  );
}
export {
  Config,
  apply,
  inject,
  name
};
