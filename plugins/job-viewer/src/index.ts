/**
 * job-viewer — shared view of job output, host half.
 *
 * The jobs service exposes one consuming cursor per job. This plugin
 * polls every visible job once and buffers the output in a
 * JobBufferStore, then serves that buffer to the model tools
 * (job_list, job_output, job_kill) and to the browser panel over
 * /job-viewer/output, and delivers unreported job completions to the
 * owning agent.
 */

import type { Agent } from "@deepseek-ai/dsh-agent";
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { JobBufferStore } from "./buffer";
import { mountCompletionDelivery, type JobDoneSnapshotLike } from "./completion";
import { mountPoller } from "./poller";
import { makeOutputHandler } from "./route";
import { buildJobTools, type JobsServiceLike, type ToolsServiceLike } from "./tools";

export const name = "job-viewer";
export const inject = ["jobs", "tools", "systemPrompt"] as const;

export const Config = z.object({
  maxBytesPerJob: z.number().default(1_048_576),
  retentionMs: z.number().default(600_000),
  pollIntervalMs: z.number().default(750),
  sweepIntervalMs: z.number().default(30_000),
  waitTimeoutMs: z.number().default(30_000),
  maxWaitTimeoutMs: z.number().default(600_000),
  completionDelivery: z.union(["quiet", "wakeup"]).default("wakeup"),
  maxConsecutiveWakes: z.number().min(1).default(3),
});

export function apply(ctx: Context, config: unknown): void {
  const cfg = Config(config ?? {});
  const store = new JobBufferStore({
    maxBytes: cfg.maxBytesPerJob,
    retentionMs: cfg.retentionMs,
  });
  // `jobs` and `tools` arrive through inject but the base Context type
  // does not name either one.
  const jobs = (ctx as unknown as {
    jobs: JobsServiceLike & {
      attachController(name: string): () => void;
      onJobDone(listener: (snapshot: JobDoneSnapshotLike, owner: Agent | undefined) => void): () => void;
    };
  }).jobs;
  const tools = (ctx as unknown as { tools: ToolsServiceLike }).tools;
  const teardownPoller = mountPoller(jobs as any, store, {
    pollIntervalMs: cfg.pollIntervalMs,
    setInterval,
    clearInterval,
  });
  const sweepTimer = setInterval(() => store.sweep(), cfg.sweepIntervalMs);
  // dsh-tool-jobs is the only other plugin that calls attachController(); its
  // row is disabled once job-viewer replaces it (Effort 6 T5). Without SOME
  // attached controller, JobRegistry.start() refuses every new background
  // job for every owner, not just this viewer's own jobs -- so job-viewer
  // must attach its own controller regardless of whether tool-jobs is
  // mounted alongside it.
  const detachController = jobs.attachController("job-viewer");
  // Deliver unreported completions to the owning agent. ctx satisfies
  // InboxClaimEventsLike once the Agent type is imported above, so pass
  // it directly as the event source.
  const teardownCompletion = mountCompletionDelivery(jobs, ctx, {
    delivery: cfg.completionDelivery,
    maxConsecutiveWakes: cfg.maxConsecutiveWakes,
  });
  // Tell the model how to treat background jobs, like dsh-tool-jobs did.
  ctx.systemPrompt.section({
    name: "tool:jobs",
    order: 106,
    text: "Track every background job id you start. You are notified in-session when a job finishes — do not busy-poll or sleep on one; keep working on independent steps and do not duplicate a running job's work. Before giving a final answer, collect every still-relevant job with job_output (set wait: true only when you are genuinely blocked on it), and job_kill jobs that stopped mattering.",
  });
  // Register the three job tools as a generator effect, like resume.ts
  // does. Each yield keeps one registration reversible on stop or reload.
  ctx.effect(
    function* () {
      for (const tool of buildJobTools(jobs, store, {
        waitTimeoutMs: cfg.waitTimeoutMs,
        maxWaitTimeoutMs: cfg.maxWaitTimeoutMs,
      })) {
        yield tools.register(tool);
      }
    },
    "job-viewer tools",
  );
  // Serve buffered output to the browser panel. Lazy injection keeps the
  // plugin loadable when no web server mounts.
  try {
    ctx.inject(["webServer"], (scope) => {
      const server = (scope as unknown as { webServer: { register(o: unknown): unknown } })
        .webServer;
      server.register({
        kind: "exact",
        path: "/job-viewer/output",
        handler: makeOutputHandler(store),
      });
    });
  } catch {
    // no webServer: the tools still work, only the route is absent
  }
  ctx.effect(
    () => () => {
      teardownPoller();
      clearInterval(sweepTimer);
      detachController();
      teardownCompletion();
    },
    "job-viewer teardown",
  );
}
