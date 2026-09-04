/**
 * job-viewer — shared view of job output, host half.
 *
 * The jobs service exposes one consuming cursor per job. This plugin
 * polls every visible job once and buffers the output in a
 * JobBufferStore. Later tickets add the HTTP route and the model
 * tools on top of that store.
 */

import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { JobBufferStore } from "./buffer";
import { mountPoller } from "./poller";

export const name = "job-viewer";
export const inject = ["jobs"] as const;

export const Config = z.object({
  maxBytesPerJob: z.number().default(1_048_576),
  retentionMs: z.number().default(600_000),
  pollIntervalMs: z.number().default(750),
  sweepIntervalMs: z.number().default(30_000),
});

export function apply(ctx: Context, config: unknown): void {
  const cfg = Config(config ?? {});
  const store = new JobBufferStore({
    maxBytes: cfg.maxBytesPerJob,
    retentionMs: cfg.retentionMs,
  });
  // `jobs` arrives through inject but the base Context type does not name it.
  const jobs = (ctx as unknown as { jobs: unknown }).jobs;
  const teardownPoller = mountPoller(jobs as any, store, {
    pollIntervalMs: cfg.pollIntervalMs,
    setInterval,
    clearInterval,
  });
  const sweepTimer = setInterval(() => store.sweep(), cfg.sweepIntervalMs);
  ctx.effect(
    () => () => {
      teardownPoller();
      clearInterval(sweepTimer);
    },
    "job-viewer teardown",
  );
  // T2 will read from `store` here to implement job_list/job_output/job_kill
  // and the HTTP route. Exporting it is out of scope for this ticket.
}
