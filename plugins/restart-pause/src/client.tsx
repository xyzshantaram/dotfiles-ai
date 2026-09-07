/**
 * restart-pause — the Debug settings panel (client half).
 *
 * A `settings.section` view holding the operational controls that have no
 * other home. Restarting is the first of them; the section is named Debug
 * rather than Restart so the next one does not need a new section.
 *
 * Routes it drives, all same-origin, served by the host half:
 *
 *   - GET  /restart-pause/status
 *   - POST /restart-pause/checks
 *   - POST /restart-pause/arm      { armed }
 *   - POST /restart-pause/restart  { force? }
 *
 * WHY IT PROBES AT ALL. `dsh-client-connection` already reconnects on its own
 * with exponential backoff, so nothing here restores the session. What the
 * websocket cannot distinguish is "came back" from "is crash-looping": the
 * service unit runs `Restart=always` with `RestartSec=5`, so a process that
 * dies on a bad config is restarted forever and the socket keeps
 * half-connecting. That is the likeliest failure right after the change a
 * restart was asked for, so it is the one thing worth checking.
 *
 * IT PROBES THIS PAGE'S OWN ORIGIN, deliberately, rather than a configured
 * URL. The origin is by definition reachable and already trusted by this
 * browser, so there is no cross-origin request, no certificate question, and
 * no way for the check to be pointed at something that is not this dsh.
 */
import react from "react";
import { injectStyle, mergeCss, fetchJson, postJson } from "../../shared/client-util";
import { SettingsSection } from "../../shared/settings-panel";
import settingsCss from "../../shared/settings.css";
import localCss from "./client.module.css";
import { toast } from "../../shared/toast-client";
import { describeVerdict, verdictFrom, type Probe } from "./reload-check";
import { clearFlash, takeFlash, writeFlash } from "./flash";

const PLUGIN_NAME = "restart-pause";
const STYLE_TAG_ID = "restart-pause-styles";
const PROBE_INTERVAL_MS = 1000;
const PROBE_TIMEOUT_MS = 4000;
const PROBE_WINDOW_MS = 180_000;

interface CheckResult {
  command: string;
  ok: boolean;
  output: string;
}

/**
 * `request()` (and therefore fetchJson/postJson) resolves to an ENVELOPE,
 * `{ data, error }`, never the raw JSON body. Treating the envelope as the
 * body is what crashed this panel on first mount: `status.runningLabels` was
 * undefined, because `status` was the envelope. One helper, so the mistake
 * cannot be made once per call site.
 */
function unwrap<T>(result: unknown): T | null {
  const envelope = result as { data?: unknown; error?: unknown } | null;
  if (envelope === null || typeof envelope !== "object") return null;
  if (envelope.error) {
    console.error("[restart-pause] request failed:", envelope.error);
    return null;
  }
  return (envelope.data ?? null) as T | null;
}

/**
 * Accept a status only if it carries the fields the panel renders. A response
 * that half-arrives should show "unavailable", never crash a settings page it
 * shares with every other plugin.
 */
function isStatus(value: unknown): value is Status {
  const s = value as Partial<Status> | null;
  return (
    s !== null &&
    typeof s === "object" &&
    typeof s.running === "number" &&
    Array.isArray(s.runningLabels) &&
    Array.isArray(s.checks)
  );
}

interface Status {
  startedAt: number;
  running: number;
  runningLabels: string[];
  armed: boolean;
  command: string;
  checks: string[];
  healthPath: string;
  settleMs: number;
  quiesceTimeoutMs: number;
}

/** One health probe. A thrown request and a 502 are the same answer: not up. */
async function probeOnce(path: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetch(path, { cache: "no-store", signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function makePanel() {
  return function DebugPanel() {
    const [status, setStatus] = react.useState(null as Status | null);
    const [checks, setChecks] = react.useState(null as CheckResult[] | null);
    const [busy, setBusy] = react.useState(false);
    const [message, setMessage] = react.useState(null as string | null);
    const [verdict, setVerdict] = react.useState(null as string | null);
    const probing = react.useRef(false);

    const refresh = react.useCallback(() => {
      fetchJson("/restart-pause/status").then((result: unknown) => {
        const r = unwrap<Status>(result);
        if (isStatus(r)) setStatus(r);
        else console.error("[restart-pause] status response was not usable:", r);
      });
    }, []);

    react.useEffect(() => {
      refresh();
    }, [refresh]);

    /**
     * Watch for the restart. Started only after the host has accepted one, so
     * an "up" seen here can be believed once a "down" has preceded it --
     * which is exactly what `verdictFrom` enforces.
     */
    const watch = react.useCallback(
      (healthPath: string, settleMs: number) => {
        if (probing.current) return;
        probing.current = true;
        const probes: Probe[] = [];
        const started = Date.now();
        const tick = () => {
          void probeOnce(healthPath).then((ok) => {
            probes.push({ ok, at: Date.now() });
            const v = verdictFrom(probes, { settleMs, timeoutMs: PROBE_WINDOW_MS });
            setVerdict(describeVerdict(v));
            if (v.kind === "back" || v.kind === "flapping" || v.kind === "timeout") {
              probing.current = false;
              if (v.kind === "back") refresh();
              return;
            }
            if (Date.now() - started > PROBE_WINDOW_MS) {
              probing.current = false;
              return;
            }
            setTimeout(tick, PROBE_INTERVAL_MS);
          });
        };
        tick();
      },
      [refresh],
    );

    const runChecks = react.useCallback(() => {
      setBusy(true);
      setMessage(null);
      postJson("/restart-pause/checks", {})
        .then((result: unknown) => {
          const r = unwrap<{ results?: CheckResult[] }>(result);
          setChecks(Array.isArray(r?.results) ? r.results : []);
        })
        .finally(() => setBusy(false));
    }, []);

    const restart = react.useCallback(
      (force: boolean) => {
        if (status === null) return;
        setBusy(true);
        setMessage(
          force
            ? "Restarting without checks..."
            : "Running checks, then waiting for sessions to finish...",
        );
        setVerdict(null);
        // Written BEFORE the request, because a successful restart may kill the
        // process before its response is written. A restart that then does not
        // happen leaves a flash that resolves to "nothing to announce".
        writeFlash(window.localStorage, { requestedAt: Date.now(), armed: false });
        postJson("/restart-pause/restart", { force })
          .then((result: unknown) => {
            const r =
              unwrap<{
                ok?: boolean;
                reason?: string;
                results?: CheckResult[];
                stillRunning?: string[];
                waitedMs?: number;
              }>(result) ?? {};
            if (r.ok) {
              setMessage("Restart requested. Waiting for dsh to go down...");
              watch(status.healthPath, status.settleMs);
              return;
            }
            if (r.reason === "checks") {
              setChecks(r.results ?? []);
              setMessage("Blocked: a check failed. Fix it, or use Restart anyway.");
              return;
            }
            if (r.reason === "busy") {
              const names = (r.stillRunning ?? []).join(", ");
              setMessage(
                `Still working after ${Math.round((r.waitedMs ?? 0) / 1000)}s: ${names}. Nothing was restarted.`,
              );
              return;
            }
            setMessage("Restart refused.");
          })
          .finally(() => {
            setBusy(false);
            refresh();
          });
      },
      [status, watch, refresh],
    );

    const toggleArm = react.useCallback(() => {
      if (status === null) return;
      const next = !status.armed;
      // Arming is the case the flash exists for: the restart fires later, at
      // idle, possibly with this tab closed.
      if (next) writeFlash(window.localStorage, { requestedAt: Date.now(), armed: true });
      else clearFlash(window.localStorage);
      postJson("/restart-pause/arm", { armed: next }).then(() => refresh());
    }, [status, refresh]);

    if (status === null) {
      return (
        <SettingsSection title="Debug">
          <div className="rpNote">Loading...</div>
        </SettingsSection>
      );
    }

    const idle = status.running === 0;

    return (
      <SettingsSection title="Debug" onRefresh={refresh}>
        <div className="rpNote">
          Restart dsh to apply composition or plugin changes. Running turns are allowed to finish
          first; nothing is cancelled.
        </div>

        <div className="rpNote">
          <code className="rpCheckCmd">{status.command}</code>
        </div>

        {idle ? (
          <div className="rpNote">No sessions are working.</div>
        ) : (
          <div>
            <div className="rpNote">
              {status.running} session{status.running === 1 ? "" : "s"} still working:
            </div>
            <ul className="rpSessions">
              {(status.runningLabels ?? []).map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="rpRow">
          <button disabled={busy} onClick={() => restart(false)}>
            Restart dsh
          </button>
          <button disabled={busy} onClick={() => restart(true)}>
            Restart anyway
          </button>
          {status.checks.length > 0 ? (
            <button disabled={busy} onClick={runChecks}>
              Run checks
            </button>
          ) : null}
          <label>
            <input type="checkbox" checked={status.armed} onChange={toggleArm} /> Restart when idle
            and checks pass
          </label>
        </div>

        {status.armed ? (
          <div className="rpNote">
            Armed. dsh will restart the next time nothing is working and every check passes.
          </div>
        ) : null}

        {message === null ? null : <div className="rpVerdict">{message}</div>}
        {verdict === null ? null : <div className="rpVerdict">{verdict}</div>}

        {checks === null
          ? null
          : checks.map((check) => (
              <div className="rpCheck" key={check.command}>
                <span className={check.ok ? "rpCheckMark" : "rpCheckMark rpFail"}>
                  {check.ok ? "ok" : "!!"}
                </span>
                <span className="rpCheckBody">
                  <span className="rpCheckCmd">{check.command}</span>
                  <div className="rpCheckOut">{check.output}</div>
                </span>
              </div>
            ))}

        {status.checks.length === 0 ? (
          <div className="rpNote">
            No preflight checks configured. Add commands to this plugin's `checks` list to block a
            restart while, for example, a worktree is dirty.
          </div>
        ) : null}
      </SettingsSection>
    );
  };
}

const name = PLUGIN_NAME;
const inject = ["slots"];

function apply(ctx) {
  ctx.effect(function () {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settingsCss, localCss));
  }, "restart-pause: styles");

  // Announce a restart that finished while nobody was watching. The claim is
  // checked against the host's own process start time rather than assumed, so
  // an armed restart that has not fired yet says nothing.
  fetchJson("/restart-pause/status")
    .then(function (result: unknown) {
      const status = unwrap<{ startedAt?: number }>(result);
      if (status === null || typeof status.startedAt !== "number") return;
      const outcome = takeFlash(window.localStorage, status.startedAt, Date.now());
      if (outcome.kind !== "restarted") return;
      toast(outcome.armed ? "dsh restarted (armed restart fired)" : "dsh restarted", "success");
    })
    .catch(function () {
      // No status, nothing to announce. The flash stays for the next boot.
    });

  // Created once so the component identity is stable across slot re-renders
  // and React keeps its state between them.
  var Panel = makePanel();
  ctx.slots.inject("settings.section", function () {
    return ctx.slots.register(
      { name: "settings.section", id: PLUGIN_NAME, order: 40, label: "Debug" },
      function () {
        return <Panel />;
      },
    );
  });
}

export { apply, inject, name };
