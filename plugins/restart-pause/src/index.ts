/**
 * restart-pause — drain the harness, run your checks, restart it, come back.
 *
 * Host half. Owns the same-origin routes the Debug settings panel uses:
 *
 *   - GET  /restart-pause/status   -> { ok, startedAt, running, runningLabels, armed,
 *       command, checks, healthPath, settleMs, quiesceTimeoutMs }
 *   - POST /restart-pause/checks   -> { ok, results: [{ command, ok, output }] }
 *   - POST /restart-pause/arm      (body { armed }) -> { ok, armed }
 *   - POST /restart-pause/restart  (body { force? }) -> { ok } | { ok: false,
 *       reason: "busy" | "checks", stillRunning?, results? }
 *
 * WHY IT EXISTS. Applying a composition or plugin change requires restarting
 * dsh, because bundle rows are static per boot. Today that costs whatever is in
 * flight, so the restart gets deferred and changes pile up unverified. The
 * person ends up waiting on the machine's inability to stop gracefully.
 *
 * WHAT "PAUSE" MEANS HERE, precisely: it DRAINS. It waits for running turns to
 * finish on their own and refuses if they do not. It does not suspend a turn,
 * because nothing held in memory survives the process going away, and it does
 * not cancel one, because cancelling throws away work the user is waiting for.
 * Waiting is the only option that loses nothing.
 *
 * WHAT IT DOES NOT DO: resume. `dsh-client-connection` already reconnects with
 * exponential backoff, and the session log is the durable source of truth
 * (`Agent.session`), so sessions return because dsh replays them. Rebuilding
 * that here would be reimplementing shipped behaviour.
 *
 * THE UNGATED DRAIN, stated because it is a real limitation rather than an
 * oversight. Nothing here stops a NEW turn starting while we drain, so a busy
 * system can keep the count above zero until the deadline and be refused. The
 * gate would be `agent/pre-step`, a waterfall that can reject a proposed step —
 * but `agent/inbox/claimed` states that when a step is rejected "the claimed
 * message ends here: it is neither discarded nor re-emitted as a user/message".
 * A restart helper that silently eats what you typed is worse than the problem
 * it solves, so the drain stays ungated and fails loudly instead.
 */
import { exec, spawn } from "node:child_process";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Context } from "@deepseek-ai/cordis";
import z from "@deepseek-ai/schemastery";
import { QuiesceTracker, waitForQuiet, type AgentStatus } from "./quiesce";

export const name = "restart-pause";

export const inject = [];

export const Config = z.object({
  /**
   * Run through `sh -lc`, so a user's own script or a systemd call both work.
   *
   * IT MUST HAND THE JOB TO SOMETHING THAT OUTLIVES THIS PROCESS. `systemctl
   * --user restart` is safe because systemd owns the job queue: the systemctl
   * client is killed along with us and the queued job still runs. A command
   * shaped like `kill dsh && start dsh` would never reach its second half.
   */
  command: z.string().default("systemctl --user restart dsh-web.service"),
  /**
   * Preflight commands. A non-zero exit blocks the restart and its output is
   * shown. Empty by default: a check that fires wrongly on someone else's
   * machine teaches them to use `force`, which removes the whole point.
   */
  checks: z.array(z.string()).default([]),
  /** How long a single check may take before it is treated as failed. */
  checkTimeoutMs: z.number().default(15_000),
  /** How long to wait for turns to finish before refusing. */
  quiesceTimeoutMs: z.number().default(120_000),
  /** How often to re-read the running set while draining. */
  pollMs: z.number().default(500),
  /** Same-origin path the browser probes to decide whether dsh came back. */
  healthPath: z.string().default("/"),
  /** How long an "up" must hold before the browser believes it. */
  settleMs: z.number().default(3_000),
  /**
   * Quiet must persist this long before an ARMED restart fires. Turns often
   * arrive in bursts, and firing on the first millisecond of quiet would cut
   * between two steps of the same piece of work.
   */
  armSettleMs: z.number().default(5_000),
});

type RestartPauseConfig = {
  command: string;
  checks: string[];
  checkTimeoutMs: number;
  quiesceTimeoutMs: number;
  pollMs: number;
  healthPath: string;
  settleMs: number;
  armSettleMs: number;
};

interface CheckResult {
  command: string;
  ok: boolean;
  output: string;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(text);
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed !== null && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** One check, resolved rather than rejected: a failure is data, not an exception. */
function runCheck(command: string, timeoutMs: number): Promise<CheckResult> {
  return new Promise((resolve) => {
    exec(command, { timeout: timeoutMs, encoding: "utf8" }, (error, stdout, stderr) => {
      const output = `${stdout ?? ""}${stderr ?? ""}`.trim();
      resolve({
        command,
        ok: error === null,
        // A failing check with no output is the worst possible message, so
        // say something rather than showing an empty box.
        output:
          output.length > 0 ? output : error === null ? "ok" : String(error?.message ?? "failed"),
      });
    });
  });
}

async function runChecks(config: RestartPauseConfig): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  for (const command of config.checks) {
    results.push(await runCheck(command, config.checkTimeoutMs));
  }
  return results;
}

/**
 * A readable name for a session, for the refusal message. `Agent.id` is the
 * session id and always exists; the title is nicer when it is there. Read
 * defensively: this is only ever used to build a sentence, so an unexpected
 * shape must degrade rather than throw inside an event listener.
 */
function labelFor(agent: unknown): string {
  const a = agent as { id?: unknown; session?: { header?: { title?: unknown; cwd?: unknown } } };
  const title = a?.session?.header?.title;
  if (typeof title === "string" && title.trim().length > 0) return title;
  const cwd = a?.session?.header?.cwd;
  if (typeof cwd === "string" && cwd.length > 0) return cwd;
  return typeof a?.id === "string" ? a.id : "an agent";
}

export function apply(ctx: Context, rawConfig: RestartPauseConfig): void {
  const config = rawConfig;
  const tracker = new QuiesceTracker();

  /** Armed = restart as soon as the machine is quiet and every check passes. */
  // When THIS process began. The client compares it against the moment a
  // restart was requested: a process older than the request means the restart
  // has not happened yet, so nothing is announced.
  const startedAt = Date.now();

  let armed = false;
  let armTimer: ReturnType<typeof setTimeout> | undefined;
  let restarting = false;

  function clearArmTimer(): void {
    if (armTimer === undefined) return;
    clearTimeout(armTimer);
    armTimer = undefined;
  }

  ctx.effect(
    () => () => {
      clearArmTimer();
    },
    "restart-pause: arm timer",
  );

  /**
   * Fire the restart command.
   *
   * Detached and unref'd so the child is not in this process's job when it
   * dies. `sh -lc` gives the user's own login environment, which is what a
   * command like `systemctl --user` expects.
   */
  function fireRestart(): void {
    restarting = true;
    ctx.logger.info(`restarting: ${config.command}`);
    const child = spawn("/bin/sh", ["-lc", config.command], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  }

  /**
   * The armed path, and the reason it is cheap: it runs on the IDLE EDGE
   * rather than on a timer. The tracker already knows the moment the running
   * count reaches zero, which happens rarely, so the checks run about once per
   * quiescence instead of every few seconds forever.
   */
  function onMaybeQuiet(): void {
    if (!armed || restarting) return;
    if (!tracker.snapshot().quiet) {
      clearArmTimer();
      return;
    }
    if (armTimer !== undefined) return;
    armTimer = setTimeout(() => {
      armTimer = undefined;
      if (!armed || restarting) return;
      // Re-read: work may have started during the settle window.
      if (!tracker.snapshot().quiet) return;
      void runChecks(config).then((results) => {
        if (!armed || restarting) return;
        if (!tracker.snapshot().quiet) return;
        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) {
          ctx.logger.info(
            `armed restart held: ${failed.length} check(s) failing (${failed.map((f) => f.command).join(", ")})`,
          );
          return;
        }
        armed = false;
        fireRestart();
      });
    }, config.armSettleMs);
  }

  ctx.on("agent/status", (payload: { agent: unknown; status: AgentStatus }) => {
    tracker.observe(payload.agent as object, payload.status, labelFor(payload.agent));
    onMaybeQuiet();
  });

  ctx.on("agent/disposed", (payload: { agent: unknown }) => {
    tracker.forget(payload.agent as object);
    onMaybeQuiet();
  });

  // Lazy inject, matching session-archive: the plugin still loads in a
  // profile where no web server mounts, and simply serves nothing there.
  ctx.inject(["webServer"], (scope) => {
    const server = (scope as unknown as { webServer: { register(options: unknown): unknown } })
      .webServer;

    server.register({
      kind: "exact",
      path: "/restart-pause/status",
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        const snap = tracker.snapshot();
        sendJson(res, 200, {
          ok: true,
          startedAt,
          running: snap.running,
          runningLabels: snap.runningLabels,
          armed,
          restarting,
          command: config.command,
          checks: config.checks,
          healthPath: config.healthPath,
          settleMs: config.settleMs,
          quiesceTimeoutMs: config.quiesceTimeoutMs,
        });
      },
    });

    server.register({
      kind: "exact",
      path: "/restart-pause/checks",
      handler: async (_req: IncomingMessage, res: ServerResponse) => {
        sendJson(res, 200, { ok: true, results: await runChecks(config) });
      },
    });

    server.register({
      kind: "exact",
      path: "/restart-pause/arm",
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const body = await readJsonBody(req);
        armed = body.armed === true;
        if (!armed) clearArmTimer();
        else onMaybeQuiet();
        ctx.logger.info(armed ? "restart armed" : "restart disarmed");
        sendJson(res, 200, { ok: true, armed });
      },
    });

    server.register({
      kind: "exact",
      path: "/restart-pause/restart",
      handler: async (req: IncomingMessage, res: ServerResponse) => {
        const body = await readJsonBody(req);
        const force = body.force === true;

        // Checks run BEFORE the drain. Draining can take two minutes, and
        // finding out afterwards that a check fails wasted all of it.
        if (!force) {
          const results = await runChecks(config);
          if (results.some((r) => !r.ok)) {
            sendJson(res, 200, { ok: false, reason: "checks", results });
            return;
          }
        }

        const outcome = await waitForQuiet(tracker, {
          timeoutMs: config.quiesceTimeoutMs,
          pollMs: config.pollMs,
          now: () => Date.now(),
          sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
        });

        if (!outcome.quiet && !force) {
          // Name what blocked it. A restart button that refuses without
          // saying why is worse than one that hangs.
          sendJson(res, 200, {
            ok: false,
            reason: "busy",
            stillRunning: outcome.stillRunning,
            waitedMs: outcome.waitedMs,
          });
          return;
        }

        // Answer BEFORE dying. Once the command runs, this process cannot
        // send anything, so the client would see a dropped connection and
        // have to guess what it meant.
        sendJson(res, 200, { ok: true, waitedMs: outcome.waitedMs, forced: force });
        setTimeout(fireRestart, 250);
      },
    });
  });
}
