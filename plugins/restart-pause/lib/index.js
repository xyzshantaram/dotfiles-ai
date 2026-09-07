// plugins/restart-pause/src/index.ts
import { exec, spawn } from "node:child_process";
import z from "@deepseek-ai/schemastery";

// plugins/restart-pause/src/quiesce.ts
var QuiesceTracker = class {
  running = /* @__PURE__ */ new Map();
  quiescing = false;
  /** Apply one `agent/status` event. */
  observe(agent, status, label) {
    if (status === "running") {
      this.running.set(agent, label);
      return;
    }
    this.running.delete(agent);
  }
  /** Apply one `agent/disposed` event, so a vanished agent cannot hold the latch. */
  forget(agent) {
    this.running.delete(agent);
  }
  /** A restart has been asked for; we are now waiting for quiet. */
  beginQuiesce() {
    this.quiescing = true;
  }
  /** The user cancelled, or the restart finished and this process is still alive. */
  cancelQuiesce() {
    this.quiescing = false;
  }
  snapshot() {
    const labels = [...this.running.values()].sort();
    return {
      running: labels.length,
      runningLabels: labels,
      quiescing: this.quiescing,
      quiet: labels.length === 0
    };
  }
};
async function waitForQuiet(tracker, opts) {
  const started = opts.now();
  for (; ; ) {
    const snap = tracker.snapshot();
    if (snap.quiet) {
      return { quiet: true, stillRunning: [], waitedMs: opts.now() - started };
    }
    const waited = opts.now() - started;
    if (waited >= opts.timeoutMs) {
      return { quiet: false, stillRunning: snap.runningLabels, waitedMs: waited };
    }
    await opts.sleep(Math.min(opts.pollMs, opts.timeoutMs - waited));
  }
}

// plugins/restart-pause/src/index.ts
var name = "restart-pause";
var inject = [];
var Config = z.object({
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
  checkTimeoutMs: z.number().default(15e3),
  /** How long to wait for turns to finish before refusing. */
  quiesceTimeoutMs: z.number().default(12e4),
  /** How often to re-read the running set while draining. */
  pollMs: z.number().default(500),
  /** Same-origin path the browser probes to decide whether dsh came back. */
  healthPath: z.string().default("/"),
  /** How long an "up" must hold before the browser believes it. */
  settleMs: z.number().default(3e3),
  /**
   * Quiet must persist this long before an ARMED restart fires. Turns often
   * arrive in bursts, and firing on the first millisecond of quiet would cut
   * between two steps of the same piece of work.
   */
  armSettleMs: z.number().default(5e3)
});
function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(text);
}
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}
function runCheck(command, timeoutMs) {
  return new Promise((resolve) => {
    exec(command, { timeout: timeoutMs, encoding: "utf8" }, (error, stdout, stderr) => {
      const output = `${stdout ?? ""}${stderr ?? ""}`.trim();
      resolve({
        command,
        ok: error === null,
        // A failing check with no output is the worst possible message, so
        // say something rather than showing an empty box.
        output: output.length > 0 ? output : error === null ? "ok" : String(error?.message ?? "failed")
      });
    });
  });
}
async function runChecks(config) {
  const results = [];
  for (const command of config.checks) {
    results.push(await runCheck(command, config.checkTimeoutMs));
  }
  return results;
}
function labelFor(agent) {
  const a = agent;
  const title = a?.session?.header?.title;
  if (typeof title === "string" && title.trim().length > 0) return title;
  const cwd = a?.session?.header?.cwd;
  if (typeof cwd === "string" && cwd.length > 0) return cwd;
  return typeof a?.id === "string" ? a.id : "an agent";
}
function apply(ctx, rawConfig) {
  const config = rawConfig;
  const tracker = new QuiesceTracker();
  const startedAt = Date.now();
  let armed = false;
  let armTimer;
  let restarting = false;
  function clearArmTimer() {
    if (armTimer === void 0) return;
    clearTimeout(armTimer);
    armTimer = void 0;
  }
  ctx.effect(
    () => () => {
      clearArmTimer();
    },
    "restart-pause: arm timer"
  );
  function fireRestart() {
    restarting = true;
    ctx.logger.info(`restarting: ${config.command}`);
    const child = spawn("/bin/sh", ["-lc", config.command], {
      detached: true,
      stdio: "ignore"
    });
    child.unref();
  }
  function onMaybeQuiet() {
    if (!armed || restarting) return;
    if (!tracker.snapshot().quiet) {
      clearArmTimer();
      return;
    }
    if (armTimer !== void 0) return;
    armTimer = setTimeout(() => {
      armTimer = void 0;
      if (!armed || restarting) return;
      if (!tracker.snapshot().quiet) return;
      void runChecks(config).then((results) => {
        if (!armed || restarting) return;
        if (!tracker.snapshot().quiet) return;
        const failed = results.filter((r) => !r.ok);
        if (failed.length > 0) {
          ctx.logger.info(
            `armed restart held: ${failed.length} check(s) failing (${failed.map((f) => f.command).join(", ")})`
          );
          return;
        }
        armed = false;
        fireRestart();
      });
    }, config.armSettleMs);
  }
  ctx.on("agent/status", (payload) => {
    tracker.observe(payload.agent, payload.status, labelFor(payload.agent));
    onMaybeQuiet();
  });
  ctx.on("agent/disposed", (payload) => {
    tracker.forget(payload.agent);
    onMaybeQuiet();
  });
  ctx.inject(["webServer"], (scope) => {
    const server = scope.webServer;
    server.register({
      kind: "exact",
      path: "/restart-pause/status",
      handler: async (_req, res) => {
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
          quiesceTimeoutMs: config.quiesceTimeoutMs
        });
      }
    });
    server.register({
      kind: "exact",
      path: "/restart-pause/checks",
      handler: async (_req, res) => {
        sendJson(res, 200, { ok: true, results: await runChecks(config) });
      }
    });
    server.register({
      kind: "exact",
      path: "/restart-pause/arm",
      handler: async (req, res) => {
        const body = await readJsonBody(req);
        armed = body.armed === true;
        if (!armed) clearArmTimer();
        else onMaybeQuiet();
        ctx.logger.info(armed ? "restart armed" : "restart disarmed");
        sendJson(res, 200, { ok: true, armed });
      }
    });
    server.register({
      kind: "exact",
      path: "/restart-pause/restart",
      handler: async (req, res) => {
        const body = await readJsonBody(req);
        const force = body.force === true;
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
          sleep: (ms) => new Promise((r) => setTimeout(r, ms))
        });
        if (!outcome.quiet && !force) {
          sendJson(res, 200, {
            ok: false,
            reason: "busy",
            stillRunning: outcome.stillRunning,
            waitedMs: outcome.waitedMs
          });
          return;
        }
        sendJson(res, 200, { ok: true, waitedMs: outcome.waitedMs, forced: force });
        setTimeout(fireRestart, 250);
      }
    });
  });
}
export {
  Config,
  apply,
  inject,
  name
};
