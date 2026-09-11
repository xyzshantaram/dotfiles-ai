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
import { createPortal } from "react-dom";
import { AnsiUp } from "ansi_up";
import primitives from "@deepseek-ai/dsh-client-ui-primitives";
import { injectStyle, mergeCss, fetchJson, postJson } from "../../shared/client-util";
import { closeModal, openModal } from "../../shared/modal-client";
import { toast } from "../../shared/toast-client";
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

/**
 * The output route's never-known answer. Matched verbatim: fetchJson folds
 * every { ok: false, error } body into a bare string, so this literal is
 * the whole contract (route.ts answers exactly it for ids with no entry).
 */
var UNKNOWN_JOB_ERROR = "unknown job";

/** Gap between the trigger button and the open menu, in pixels. */
var MENU_GAP = 4;

/** Minimum margin between the open menu and the viewport edges, in pixels. */
var MENU_MARGIN = 8;

/**
 * The ANSI converter factory. ansi_up escapes HTML by default (its
 * constructor sets _escape_html = true), so its output is safe for
 * dangerouslySetInnerHTML without a separate escape pass.
 *
 * The converter is also STATEFUL: a tail that leaves an SGR style open
 * bleeds into the next conversion of the same instance, and a buffer-cap
 * split mid-escape smears the head of the next paint. Every conversion
 * therefore runs on a FRESH instance (code review 2026-09-07).
 */
var makeAnsiUp = function (): AnsiUp {
  return new AnsiUp();
};

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

/**
 * One job-output modal body, SELF-CONTAINED: everything it shows is state it
 * owns plus the props it was handed. React context does not cross the modal
 * seam (#93) — the modal host renders this component in ITS tree — so the
 * poll chain, autoscroll, the ANSI conversion and the per-job state that used
 * to live in the dropdown all moved in here, handed over in props at open
 * time.
 *
 * The two-step kill control lives HERE rather than in the shared actions row:
 * the actions node crosses the seam as a static record stored at open time,
 * so a control whose label tracks live state ("Really stop?" → "Stopping…")
 * cannot live there. The Close button, whose label never changes, stays in
 * the shared row.
 */
function JobOutputBody(props: any) {
  var jobId = props.jobId;

  var statusState = react.useState(props.status);
  var status = statusState[0];
  var setStatus = statusState[1];
  var statusRef = react.useRef(props.status);

  var outState = react.useState(null);
  var out = outState[0];
  var setOut = outState[1];

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

  // One fetch now, then a poll chain while the known status stays live.
  // The cleanup cancels the chain and any pending timer, so a closed
  // modal leaves no timer behind.
  react.useEffect(
    function () {
      var cancelled = false;
      var timer: any = null;
      var tick = function () {
        fetchJson("/job-viewer/output?job_id=" + encodeURIComponent(jobId)).then(
          function (result) {
            if (cancelled) return;
            if (result.error) {
              // A live job with no buffer entry yet is transient: the
              // poller simply hasn't stored its first read. Keep the
              // "Loading…" state and keep polling instead of showing the
              // raw "unknown job" string. A terminal job with no entry is
              // settled: show the friendly missing state and stop.
              var unknown = result.error === UNKNOWN_JOB_ERROR;
              var live = statusRef.current === "running" || statusRef.current === "stopping";
              if (!unknown || !live) {
                setOut({
                  error: unknown ? null : result.error,
                  text: unknown ? "" : null,
                  truncated: false,
                  missing: unknown,
                });
              }
            } else {
              var data = result.data;
              setOut({
                error: null,
                text: data && typeof data.text === "string" ? data.text : "",
                truncated: !!(data && data.truncated === true),
                evicted: !!(data && data.evicted === true),
                job: data && data.job ? data.job : undefined,
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
    [jobId],
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

  // Convert ANSI escapes to HTML once per output change. ansi_up escapes
  // plain text by default, so the result is safe for inner HTML. A fresh
  // converter per run keeps one output's dangling styles out of the next.
  var outputHtml = react.useMemo(
    function () {
      if (out === null || typeof out.text !== "string" || out.text === "") return "";
      return makeAnsiUp().ansi_to_html(out.text);
    },
    [out && out.text],
  );

  /** Two-step kill: arm the confirm, then post and refetch the output. */
  var onKillClick = function () {
    if (killPhase === "idle") {
      setKillError(null);
      setKillPhase("confirming");
      return;
    }
    if (killPhase !== "confirming") return;
    setKillPhase("killing");
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

  // The row is the freshest label; the fetch snapshot covers rows that
  // outlived the live list or the buffer entry (evicted/missing).
  var shown =
    props.label != null
      ? { label: props.label, kind: props.kind }
      : out && out.job
        ? out.job
        : null;
  var live = status === "running" || status === "stopping";
  var killLabel =
    killPhase === "killing" ? "Stopping…" : killPhase === "confirming" ? "Really stop?" : "Stop job";

  var body = null;
  if (out === null) {
    body = <div className="jv-empty">Loading…</div>;
  } else if (out.evicted) {
    body = (
      <>
        {shown ? <div className="jv-command">{shown.label}</div> : null}
        <div className="jv-empty">
          {"Output expired — finished jobs keep their output for 10 minutes."}
        </div>
        <div className="jv-meta">
          {shown ? shown.kind + " · " + status : "job status: " + status}
        </div>
      </>
    );
  } else if (out.missing) {
    body = (
      <>
        {shown ? <div className="jv-command">{shown.label}</div> : null}
        <div className="jv-empty">{"No output available for this job."}</div>
      </>
    );
  } else {
    body = (
      <>
        {shown ? <div className="jv-command">{shown.label}</div> : null}
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
          <pre className="jv-output" dangerouslySetInnerHTML={{ __html: outputHtml }} />
        </div>
        {out.truncated ? (
          <div className="jv-note">Earlier output was dropped (buffer full).</div>
        ) : null}
        {out.error ? <div className="dsp-err">{out.error}</div> : null}
        {killError ? <div className="dsp-err">{killError}</div> : null}
        {live ? (
          <div className="jv-modal-actions">
            <ui.Button
              variant="outline"
              disabled={killPhase === "killing"}
              onClick={onKillClick}
            >
              {killLabel}
            </ui.Button>
          </div>
        ) : null}
      </>
    );
  }
  return body;
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

    // The id openModal() handed back, or null when no output modal is on
    // screen. The modal's own state lives in JobOutputBody (it renders in
    // the host's tree); the dropdown tracks only the handle it needs to
    // close the modal again.
    var modalId = react.useRef(null);

    var triggerRef = react.useRef(null);
    var menuRef = react.useRef(null);

    // Fixed position of the portal menu, seeded on open and refined after
    // mount measures the menu.
    var menuPosState = react.useState(null);
    var menuPos = menuPosState[0];
    var setMenuPos = menuPosState[1];

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

    // Place the portal menu: below the trigger, flipped above when it
    // would overflow the viewport bottom, clamped on every side. Runs on
    // open and whenever the row count changes the menu's measured size, and
    // re-runs on scroll and resize while open.
    react.useLayoutEffect(
      function () {
        if (!menuOpen) return;
        var place = function () {
          var btn = triggerRef.current;
          var menu = menuRef.current;
          if (btn === null || menu === null) return;
          var rect = btn.getBoundingClientRect();
          var left = Math.max(
            MENU_MARGIN,
            Math.min(rect.left, window.innerWidth - menu.offsetWidth - MENU_MARGIN),
          );
          var top = rect.bottom + MENU_GAP;
          if (top + menu.offsetHeight > window.innerHeight - MENU_MARGIN) {
            top = Math.max(MENU_MARGIN, rect.top - menu.offsetHeight - MENU_GAP);
          }
          // Scroll and resize fire this on every tick while open; a fresh
          // object would force a re-render per tick even when the menu did
          // not move, so skip the setState when the placement is unchanged.
          setMenuPos(function (prev) {
            if (prev !== null && prev.top === top && prev.left === left) return prev;
            return { top: top, left: left };
          });
        };
        place();
        window.addEventListener("resize", place);
        window.addEventListener("scroll", place, true);
        return function () {
          window.removeEventListener("resize", place);
          window.removeEventListener("scroll", place, true);
        };
      },
      [menuOpen, jobs.length],
    );

    // Close the portal menu on outside pointerdown and on Escape. The
    // trigger and the menu itself are excluded, so the trigger click still
    // toggles and row clicks still open the modal.
    react.useEffect(
      function () {
        if (!menuOpen) return;
        var onPointerDown = function (event: any) {
          var target = event.target;
          var btn = triggerRef.current;
          var menu = menuRef.current;
          if (btn !== null && btn.contains(target)) return;
          if (menu !== null && menu.contains(target)) return;
          setMenuOpen(false);
        };
        var onKeyDown = function (event: any) {
          if (event.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKeyDown);
        return function () {
          document.removeEventListener("pointerdown", onPointerDown);
          document.removeEventListener("keydown", onKeyDown);
        };
      },
      [menuOpen],
    );

    /** Open the output modal for one job through the shared modal host. */
    var openJob = function (job: any) {
      setMenuOpen(false);
      // One output modal at a time: the host stacks a record per open, so
      // a second row click would put a second panel on screen.
      if (modalId.current !== null) {
        closeModal(modalId.current);
        modalId.current = null;
      }
      var opened = openModal({
        title: "Job output",
        // The full standard size: this modal holds a constant-height output
        // box, so it wants the settings-panel footprint, not the compact one.
        size: "full",
        onClose: function () {
          modalId.current = null;
        },
        // The actions row crosses the seam as a static record, so only the
        // ever-green Close button lives here; the kill control is in the
        // body. The row is the shared one, right-aligned by the shared
        // stylesheet; this file never states an alignment of its own.
        actions: (
          <ui.Button
            variant="outline"
            onClick={function () {
              closeModal(modalId.current);
              modalId.current = null;
            }}
          >
            {"Close"}
          </ui.Button>
        ),
        body: (
          <JobOutputBody
            jobId={job.id}
            label={job.label}
            kind={job.kind}
            status={job.status}
          />
        ),
      });
      if (opened.opened) {
        modalId.current = opened.id;
      } else {
        // The load-bearing inversion: the modal did NOT open, so say so —
        // never silence. The toast names the failure; the console carries
        // the host's reason. The row stays usable, so a retry after the
        // modal plugin loads works.
        console.error("[job-viewer] output modal did not open:", opened.reason);
        toast("Job output modal is unavailable", "refusal");
      }
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

    return (
      <div className="jv-root">
        <button
          className="jv-trigger"
          ref={triggerRef}
          onClick={function () {
            if (menuOpen) {
              setMenuOpen(false);
              return;
            }
            // Seed the fixed position synchronously so the first paint
            // lands under the trigger; the layout effect refines it.
            var btn = triggerRef.current;
            if (btn !== null) {
              var rect = btn.getBoundingClientRect();
              setMenuPos({ top: rect.bottom + MENU_GAP, left: rect.left });
            }
            setMenuOpen(true);
          }}
        >
          {triggerLabel}
          <ui.IconChevronDownOutline14
            className={menuOpen ? "jv-chevron jv-chevron-open" : "jv-chevron"}
            aria-hidden={true}
          />
        </button>
        {menuOpen
          ? createPortal(
              <ul
                ref={menuRef}
                className="jv-menu"
                style={
                  menuPos !== null
                    ? { top: menuPos.top, left: menuPos.left }
                    : { visibility: "hidden" }
                }
              >
                {rows}
              </ul>,
              document.body,
            )
          : null}
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
