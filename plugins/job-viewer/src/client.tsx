/**
 * job-viewer — background job dropdown with an output modal (client half).
 *
 * A dropdown at the conversation.session.header.actions slot (order 20, id
 * "job-viewer"). It reads the same live job list the shipped dropdown reads
 * and adds click behavior: a row opens a modal with the job output from
 *
 *   - GET  /job-viewer/output?job_id=<id>
 *   - POST /job-viewer/kill { job_id, reason? }
 *
 * The modal polls every 2500 ms while the job is live and stops once the
 * status is terminal. The kill control uses a two-step inline confirm.
 *
 * The seam. This file is the package's `./client` source, bundled by
 * build.mjs the same way as the other client bundles. The id differs from
 * the shipped "job-list" id on purpose, so both can render side by side
 * until the shipped row is disabled.
 */

import react from "react";
import primitives from "@deepseek-ai/dsh-client-ui-primitives";
import { injectStyle, mergeCss, fetchJson, postJson } from "../../shared/client-util";
import settingsCss from "../../shared/settings.css";
import localCss from "./client.module.css";

/** The package types do not name Modal and Button, so reach them untyped. */
var ui: any = primitives;

/** Stable plugin identity, also the loader entry id in cordis.patch.yml. */
var PLUGIN_NAME = "job-viewer";

/** One stylesheet for this dropdown and modal. Class names are kebab-case only. */
var STYLE_TAG_ID = "job-viewer/client.css";

/** Poll interval for the output modal, in milliseconds. */
var POLL_MS = 2500;

/** How long the kill confirm state waits before it reverts, in milliseconds. */
var CONFIRM_MS = 3000;

/** A job is live while it runs or while a stop is still in progress. */
function isLive(job: { status: string }): boolean {
  return job.status === "running" || job.status === "stopping";
}

/** Elapsed time in at most two adjacent units. */
function formatDuration(elapsedMs: number): string {
  var total = Math.max(0, Math.floor(elapsedMs / 1000));
  var seconds = total % 60;
  var minutes = Math.floor(total / 60) % 60;
  var hours = Math.floor(total / 3600);
  if (hours > 0) return hours + "h " + minutes + "m";
  if (minutes > 0) return minutes + "m " + seconds + "s";
  return seconds + "s";
}

/** Live rows first in start order, then settled rows newest-first. */
function ordered(
  jobs: Array<{ status: string; startedAt: number; finishedAt?: number }>,
): typeof jobs {
  return [...jobs].sort(function (left, right) {
    var liveLeft = isLive(left);
    if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1;
    if (liveLeft) return left.startedAt - right.startedAt;
    var finished =
      (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt);
    return finished !== 0 ? finished : left.startedAt - right.startedAt;
  });
}

/** Build the dropdown component. State stays per-registration. */
function makeJobViewerAction() {
  return function JobViewerAction(props: any) {
    var sessionId = props.sessionId;
    var useSessions = props.useSessions;
    var jobs = useSessions(function (state: any) {
      return state.jobsBySession[sessionId] || [];
    });
    var liveCount = jobs.filter(isLive).length;

    var menuOpenState = react.useState(false);
    var menuOpen = menuOpenState[0];
    var setMenuOpen = menuOpenState[1];

    var nowState = react.useState(function () {
      return Date.now();
    });
    var now = nowState[0];
    var setNow = nowState[1];

    var openJobState = react.useState(null);
    var openJobId = openJobState[0];
    var setOpenJobId = openJobState[1];

    var outState = react.useState(null);
    var out = outState[0];
    var setOut = outState[1];

    var statusState = react.useState(null);
    var status = statusState[0];
    var setStatus = statusState[1];
    var statusRef = react.useRef(null);

    var autoscrollState = react.useState(true);
    var autoscroll = autoscrollState[0];
    var setAutoscroll = autoscrollState[1];

    var killPhaseState = react.useState("idle");
    var killPhase = killPhaseState[0];
    var setKillPhase = killPhaseState[1];

    var killErrorState = react.useState(null);
    var killError = killErrorState[0];
    var setKillError = killErrorState[1];

    var outputWrapRef = react.useRef(null);

    // Tick the row durations once a second while the menu is open and a
    // job is still live. Matches the shipped dropdown's own behavior.
    react.useEffect(
      function () {
        if (!menuOpen || liveCount === 0) return;
        setNow(Date.now());
        var timer = setInterval(function () {
          setNow(Date.now());
        }, 1000);
        return function () {
          clearInterval(timer);
        };
      },
      [menuOpen, liveCount],
    );

    /** Open the modal for one job and reset all per-job state. */
    var openJob = function (job: { id: string; status: string }) {
      setMenuOpen(false);
      statusRef.current = job.status;
      setStatus(job.status);
      setOut(null);
      setKillPhase("idle");
      setKillError(null);
      setOpenJobId(job.id);
    };

    /** Close the modal and drop its data. */
    var closeJob = function () {
      setOpenJobId(null);
      setOut(null);
      setKillPhase("idle");
      setKillError(null);
    };

    // One fetch now, then a poll chain while the known status stays live.
    // The cleanup cancels the chain and any pending timer, so a closed
    // modal or an unmounted component leaves no timer behind.
    react.useEffect(
      function () {
        if (openJobId === null) return;
        var cancelled = false;
        var timer: any = null;
        var tick = function () {
          fetchJson("/job-viewer/output?job_id=" + encodeURIComponent(openJobId)).then(
            function (result) {
              if (cancelled) return;
              if (result.error) {
                setOut({ error: result.error, text: null, truncated: false });
              } else {
                var data = result.data;
                setOut({
                  error: null,
                  text: data && typeof data.text === "string" ? data.text : "",
                  truncated: !!(data && data.truncated === true),
                });
                if (data && data.job && data.job.status) {
                  statusRef.current = data.job.status;
                  setStatus(data.job.status);
                }
              }
              if (statusRef.current === "running" || statusRef.current === "stopping") {
                timer = setTimeout(tick, POLL_MS);
              }
            },
          );
        };
        tick();
        return function () {
          cancelled = true;
          if (timer !== null) clearTimeout(timer);
        };
      },
      [openJobId],
    );

    // Scroll the output to its bottom on new data, but only when the
    // autoscroll checkbox is checked.
    react.useEffect(
      function () {
        if (!autoscroll) return;
        var wrap = outputWrapRef.current;
        if (wrap !== null) wrap.scrollTop = wrap.scrollHeight;
      },
      [out && out.text, autoscroll],
    );

    // Revert the kill confirm on its own after a short wait.
    react.useEffect(
      function () {
        if (killPhase !== "confirming") return;
        var timer = setTimeout(function () {
          setKillPhase("idle");
        }, CONFIRM_MS);
        return function () {
          clearTimeout(timer);
        };
      },
      [killPhase],
    );

    /** Two-step kill: arm the confirm, then post and refetch the output. */
    var onKillClick = function () {
      if (openJobId === null) return;
      if (killPhase === "idle") {
        setKillError(null);
        setKillPhase("confirming");
        return;
      }
      if (killPhase !== "confirming") return;
      setKillPhase("killing");
      var jobId = openJobId;
      postJson("/job-viewer/kill", { job_id: jobId }).then(function (result) {
        if (result.error || !result.data || result.data.ok !== true) {
          setKillError(result.error || "Kill request failed");
          setKillPhase("idle");
          return;
        }
        if (result.data.job && result.data.job.status) {
          statusRef.current = result.data.job.status;
          setStatus(result.data.job.status);
        }
        // One-shot refetch so the fresh terminal status and output show
        // without waiting for the next poll tick.
        fetchJson("/job-viewer/output?job_id=" + encodeURIComponent(jobId)).then(
          function (fresh) {
            if (fresh.error) {
              setKillError(fresh.error);
              return;
            }
            var data = fresh.data;
            setOut({
              error: null,
              text: data && typeof data.text === "string" ? data.text : "",
              truncated: !!(data && data.truncated === true),
            });
            if (data && data.job && data.job.status) {
              statusRef.current = data.job.status;
              setStatus(data.job.status);
            }
          },
        );
      });
    };

    if (jobs.length === 0) return null;

    var sorted = ordered(jobs);
    var triggerLabel =
      liveCount > 0 ? liveCount + " running" : jobs.length + " background jobs";

    var rows = sorted.map(function (job: any) {
      return (
        <li
          key={job.id}
          className="jv-row"
          onClick={function () {
            openJob(job);
          }}
        >
          <span className="jv-dot" data-live={isLive(job) ? "" : undefined} />
          <span className="jv-kind">{job.kind}</span>
          <span className="jv-label">{job.label}</span>
          <span className="jv-status">{job.status}</span>
          <span className="jv-duration">
            {formatDuration(
              (isLive(job) ? now : job.finishedAt ?? job.startedAt) - job.startedAt,
            )}
          </span>
        </li>
      );
    });

    var modal = null;
    if (openJobId !== null) {
      var known = jobs.find(function (job: any) {
        return job.id === openJobId;
      });
      var live = status === "running" || status === "stopping";
      var killLabel =
        killPhase === "killing" ? "Stopping…" : killPhase === "confirming" ? "Really stop?" : "Stop job";
      var body = null;
      if (out === null) {
        body = <div className="jv-empty">Loading…</div>;
      } else {
        body = (
          <>
            <div className="jv-meta">
              {"status: " + status}
            </div>
            <label className="jv-autoscroll">
              <input
                type="checkbox"
                checked={autoscroll}
                onChange={function (event) {
                  setAutoscroll(event.target.checked);
                }}
              />
              {"Auto-scroll"}
            </label>
            <div className="jv-output-wrap" ref={outputWrapRef}>
              <pre className="jv-output">{out.text}</pre>
            </div>
            {out.truncated ? (
              <div className="jv-note">Earlier output was dropped (buffer full).</div>
            ) : null}
            {out.error ? <div className="dsp-err">{out.error}</div> : null}
            {killError ? <div className="dsp-err">{killError}</div> : null}
          </>
        );
      }
      modal = (
        <ui.Modal
          open={true}
          onClose={closeJob}
          title={known ? known.label : openJobId}
          description={known ? known.kind + " · " + status : "job status: " + status}
          closeLabel="Close"
          footer={
            <>
              <ui.Button variant="outline" onClick={closeJob}>
                {"Close"}
              </ui.Button>
              {live ? (
                <ui.Button
                  variant="outline"
                  disabled={killPhase === "killing"}
                  onClick={onKillClick}
                >
                  {killLabel}
                </ui.Button>
              ) : null}
            </>
          }
        >
          {body}
        </ui.Modal>
      );
    }

    return (
      <div className="jv-root">
        <button
          className="jv-trigger"
          onClick={function () {
            setMenuOpen(!menuOpen);
          }}
        >
          {triggerLabel}
          <span className="jv-chevron">{menuOpen ? "▲" : "▼"}</span>
        </button>
        {menuOpen ? <ul className="jv-menu">{rows}</ul> : null}
        {modal}
      </div>
    );
  };
}

/** Stable Cordis plugin name. */
var name = PLUGIN_NAME;
/** Services this bundle reaches through the plugin context. */
var inject = ["slots"];

/** Plugin body: inject the styles once and register the header action. */
function apply(ctx: any) {
  ctx.effect(function () {
    injectStyle(PLUGIN_NAME, STYLE_TAG_ID, mergeCss(settingsCss, localCss));
  }, "job-viewer: styles");

  // The component is created once, so its identity stays stable across slot
  // re-renders and React keeps its state between them.
  var JobViewerAction = makeJobViewerAction();
  ctx.slots.inject("conversation.session.header.actions", function () {
    return ctx.slots.register(
      { name: "conversation.session.header.actions", id: PLUGIN_NAME, order: 20 },
      JobViewerAction,
    );
  });
}

export { apply, inject, name };
