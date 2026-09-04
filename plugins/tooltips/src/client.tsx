// Styled tooltips for elements that opt in with `data-dsh-tip`.
//
// The contract is fixed: the tooltip text always comes from the element's own
// `title` attribute. This plugin temporarily strips `title` while the styled
// tooltip shows, and restores it whenever the tooltip hides. If anything at
// all goes wrong, or this plugin never loads, the element keeps its `title`
// and the browser shows its native tooltip.
import { injectStyle } from "../../shared/client-util";

const PLUGIN_NAME = "tooltips";

const css = `
.dsh-tip {
  position: fixed;
  z-index: 2147483000;
  pointer-events: none;
  max-width: 22rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--dsw-alias-line-secondary);
  border-radius: 0.375rem;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: 0.75rem;
  line-height: 1.125rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  box-shadow: 0 2px 8px rgb(0 0 0 / 0.24);
}
.dsh-tip[hidden] {
  display: none;
}
`;

/** The one opted-in element with a live or scheduled tooltip, or null. */
var activeTarget: Element | null = null;
/** Pending show timer id, or null. */
var showTimer: number | null = null;
/** The tooltip node, created once and reused. Null when never shown. */
var tipNode: HTMLDivElement | null = null;
/** Where the target's `aria-describedby` came from before we touched it. */
var savedDescribedBy: string | null = null;
/** True when the target had NO `aria-describedby` before we set ours. */
var describedByWasAbsent = false;
/** Latched on any failure. Every handler then returns at once. */
var disabled = false;

/** True only when the plugin can run in this document at all. */
function environmentOk(): boolean {
  return typeof document !== "undefined" && document.body !== null;
}

/** Hide immediately, then schedule a show for this target. */
function scheduleShow(target: Element) {
  if (disabled || !environmentOk()) return;
  hide();
  activeTarget = target;
  showTimer = window.setTimeout(function () {
    showTimer = null;
    show(target);
  }, 350);
}

/** Show the styled tooltip for the active target. Never throws. */
function show(target: Element) {
  if (disabled) return;
  try {
    var title = target.getAttribute("title");
    if (title === null || title.trim() === "") {
      // Nothing to show. Leave the element untouched.
      if (activeTarget === target) activeTarget = null;
      return;
    }
    // Suppress the native tooltip only from this moment on.
    target.setAttribute("data-dsh-tip-title", title);
    target.removeAttribute("title");

    var previous = target.getAttribute("aria-describedby");
    describedByWasAbsent = previous === null;
    savedDescribedBy = previous;
    target.setAttribute("aria-describedby", "dsh-tip");

    var tip = ensureTipNode();
    tip.textContent = title; // The text is untrusted. Never innerHTML.
    tip.hidden = false;
    position(tip, target);
  } catch (error) {
    fail(error);
  }
}

/** Place the tip centred above the target, flipping and clamping as needed. */
function position(tip: HTMLDivElement, target: Element) {
  var rect = target.getBoundingClientRect();
  var width = tip.offsetWidth;
  var height = tip.offsetHeight;
  var left = rect.left + rect.width / 2 - width / 2;
  left = Math.min(Math.max(left, 8), window.innerWidth - width - 8);
  var top = rect.top - height - 4;
  if (top < 8) top = rect.bottom + 4;
  tip.style.left = left + "px";
  tip.style.top = top + "px";
}

/** Create the tooltip node once, or return the existing one. */
function ensureTipNode(): HTMLDivElement {
  if (tipNode !== null) return tipNode;
  var tip = document.createElement("div");
  tip.id = "dsh-tip";
  tip.setAttribute("role", "tooltip");
  tip.className = "dsh-tip";
  tip.hidden = true;
  document.body.appendChild(tip);
  tipNode = tip;
  return tip;
}

/** Restore the element and hide the tip. Safe to call twice, and safe to
 * call with nothing active. Runs in the exact order the contract fixes. */
function hide() {
  if (showTimer !== null) {
    window.clearTimeout(showTimer);
    showTimer = null;
  }
  var target = activeTarget;
  activeTarget = null;
  if (target !== null) {
    // Restore `title` FIRST. It is the whole fallback, so it must come back
    // even when a later step throws.
    var saved = target.getAttribute("data-dsh-tip-title");
    if (saved !== null) {
      // Restore only when the app has not written a new title in the
      // meantime. Otherwise this overwrites the newer value with a stale one.
      if (target.getAttribute("title") === null) target.setAttribute("title", saved);
      target.removeAttribute("data-dsh-tip-title");
    }
    if (describedByWasAbsent) {
      target.removeAttribute("aria-describedby");
    } else if (savedDescribedBy !== null) {
      target.setAttribute("aria-describedby", savedDescribedBy);
    }
  }
  savedDescribedBy = null;
  describedByWasAbsent = false;
  if (tipNode !== null) tipNode.hidden = true;
}

/** One failure disables the plugin for the rest of the session. The native
 * `title` comes back, so the browser tooltip resumes on its own. */
function fail(error: unknown) {
  // Last resort, before any step that can throw: put `title` back with the
  // least possible work, so one failure never strands the element.
  var stranded = activeTarget;
  if (stranded !== null) {
    try {
      var rescued = stranded.getAttribute("data-dsh-tip-title");
      if (rescued !== null && stranded.getAttribute("title") === null) {
        stranded.setAttribute("title", rescued);
      }
    } catch (restoreError) {
      console.warn("[tooltips] last-resort title restore threw", restoreError);
    }
  }
  try {
    hide();
  } catch (hideError) {
    console.warn("[tooltips] restore during failure also threw", hideError);
  }
  if (tipNode !== null) {
    try {
      tipNode.remove();
    } catch (removeError) {
      console.warn("[tooltips] removing the tooltip node threw", removeError);
    }
    tipNode = null;
  }
  disabled = true;
  console.warn("[tooltips] disabled, falling back to the native title tooltip", error);
}

/** Find the opted-in element for a delegated event, if any. */
function optedIn(event: Event): Element | null {
  var node = event.target;
  if (!(node instanceof Element)) return null;
  return node.closest("[data-dsh-tip]");
}

/**
 * True when the event's `relatedTarget` is still inside the same opted-in
 * element. The pointer or the focus then never really left it, so the tooltip
 * must stay up.
 */
function stillInside(event: Event, target: Element): boolean {
  var related = (event as PointerEvent | FocusEvent).relatedTarget;
  return related instanceof Node && target.contains(related);
}

var name = PLUGIN_NAME;
var inject: string[] = [];

function apply(ctx: any) {
  injectStyle(PLUGIN_NAME, "dsh-tooltips", css);
  if (!environmentOk()) return;

  var onPointerOver = function (event: Event) {
    var target = optedIn(event);
    if (target !== null) scheduleShow(target);
  };
  var onPointerOut = function (event: Event) {
    var target = optedIn(event);
    if (target === null) return;
    // Moving between children INSIDE one opted-in element is not a leave.
    // Without this the tooltip flickers, the 350 ms delay restarts, and the
    // title is stripped and restored at every child boundary.
    if (stillInside(event, target)) return;
    hide();
  };
  var onFocusIn = function (event: Event) {
    var target = optedIn(event);
    if (target !== null) scheduleShow(target);
  };
  var onFocusOut = function (event: Event) {
    var target = optedIn(event);
    if (target === null) return;
    // Focus moving to a child of the same element is not a leave either.
    if (stillInside(event, target)) return;
    hide();
  };
  var onKeyDown = function (event: KeyboardEvent) {
    if (event.key === "Escape") hide();
  };
  var onScroll = function () {
    hide();
  };
  var onPointerDown = function () {
    hide();
  };

  // All side effects belong to the current Fiber, and the listeners are added
  // INSIDE the effect on purpose. Registering them before `ctx.effect` would
  // leak every listener if the registration itself threw. Cleanup restores any
  // active element's `title` first, so no element is ever left stripped.
  ctx.effect(function () {
    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown as EventListener);
    document.addEventListener("scroll", onScroll, true);
    document.addEventListener("pointerdown", onPointerDown);
    return function () {
      hide();
      document.removeEventListener("pointerover", onPointerOver);
      document.removeEventListener("pointerout", onPointerOut);
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("keydown", onKeyDown as EventListener);
      document.removeEventListener("scroll", onScroll, true);
      document.removeEventListener("pointerdown", onPointerDown);
      if (tipNode !== null) {
        tipNode.remove();
        tipNode = null;
      }
    };
  }, "tooltips: listeners");
}

export { apply, inject, name };
