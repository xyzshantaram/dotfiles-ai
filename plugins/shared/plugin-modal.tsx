/**
 * Shared modal component for bundle plugins.
 *
 * A full-screen overlay with a centered dialog panel. The component owns the
 * modal's STRUCTURE and its STYLING, which is the whole point: two callers
 * cannot drift apart because neither one gets to decide either.
 *
 * RUNTIME DIRECTION (#93). This file stays the component's SINGLE SOURCE,
 * but it is no longer the seam: `plugins/modal` mounts one container into
 * `shell.overlay` that renders THIS component and publishes it at
 * `window.__dshModal__` (versioned, like `plugins/toast`). Direct imports
 * keep working until each consumer migrates onto that global; nothing here
 * changes when they do, because the component never knew who rendered it.
 *
 * Two standard sizes, and nothing else (`size`):
 *
 *   - "full" (the default) -- the settings-panel spec (#35): width 800px,
 *     max-width calc(100vw - 48px), height min(800px, 100vh - 48px).
 *   - "compact" -- the aidos modal spec: width 420px, max-width 100% and
 *     max-height 100% of the mask's safe box, with the BODY scrolling.
 *
 * There is deliberately no width/height/style/className prop: a caller that
 * needs a different size needs one of these two.
 *
 * Action buttons (`actions`) are rendered by this component into a row that
 * is right-aligned (justify-content: flex-end) by the shared stylesheet, so
 * a caller cannot get the alignment wrong -- it never states it.
 *
 * Props: title (string or node), onClose (callback), children (body),
 * actions (optional button row; `footer` is the older name for it), size.
 *
 * Features:
 * - Header with title and close affordance (X button).
 * - Body scrolls internally; the panel itself never scrolls.
 * - Escape key and mask click close the modal.
 * - All listeners cleaned up on unmount.
 * - No portal: renders inline into the component tree.
 */

import react from "react";
import { injectStyle } from "./client-util";
import modalCss from "./plugin-modal.module.css";

/** Owning plugin name recorded on the injected style tag. */
var STYLE_OWNER = "shared";

/** Style-tag id. One tag serves every bundle that renders a PluginModal. */
var STYLE_ID = "shared/plugin-modal.css";

/**
 * Inject the modal stylesheet once, at import time, so the first paint is
 * already styled.
 *
 * Why the class names below are plain strings. build.mjs resolves every
 * `.css` import through its `cssTextPlugin`, which hands the module the
 * stylesheet TEXT -- there is no CSS-modules class map in this repo, so an
 * indexed lookup like `css["plugin-modal-panel"]` silently yields
 * `undefined` and renders an unstyled modal. The kebab-case names in the
 * stylesheet are therefore the real, global class names, exactly as every
 * other bundle in this repo uses its own injected sheet.
 *
 * `injectStyle` no-ops without a document (node, tests) and de-duplicates on
 * the style id, so importing this module from several bundles is safe.
 */
injectStyle(STYLE_OWNER, STYLE_ID, modalCss);

/** Close button SVG icon (a simple X). */
function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * The component's ONLY sizing API. "full" is the settings-panel spec,
 * "compact" is the aidos spec. "default" is the historical spelling of
 * "full" and is still accepted so older callers keep working.
 */
export type PluginModalSize = "full" | "compact" | "default";

/**
 * Fold any accepted size onto one of the two standard values. Anything that
 * is not "compact" -- including the legacy "default" and an absent prop --
 * is the full size.
 */
function standardSize(size: PluginModalSize | undefined): "full" | "compact" {
  return size === "compact" ? "compact" : "full";
}

export interface PluginModalProps {
  /** Title shown in the header. */
  title: any;
  /** Called when the modal should close (Escape, mask click, or close button). */
  onClose: () => void;
  /** Modal body content. */
  children?: any;
  /**
   * Action buttons. Rendered into the shared, right-aligned actions row;
   * pass the buttons themselves, never a row wrapper of your own.
   */
  actions?: any;
  /** Older name for `actions`. Same right-aligned row; kept for callers. */
  footer?: any;
  /** One of the two standard sizes. Defaults to "full". */
  size?: PluginModalSize;
}

/**
 * Shared modal component with overlay, header, scrollable body, and an
 * optional right-aligned actions row.
 */
export function PluginModal(props: PluginModalProps) {
  var size = standardSize(props.size);
  // `actions` is the current name; `footer` is the older one. Both land in
  // the same row, so both are right-aligned by construction.
  var actions = props.actions !== undefined && props.actions !== null ? props.actions : props.footer;

  // Close on Escape key.
  react.useEffect(
    function () {
      var onKeyDown = function (event: any) {
        if (event.key === "Escape") {
          props.onClose();
        }
      };
      document.addEventListener("keydown", onKeyDown);
      return function () {
        document.removeEventListener("keydown", onKeyDown);
      };
    },
    [props.onClose],
  );

  return (
    <div className="plugin-modal-mask" onClick={props.onClose}>
      <div
        className="plugin-modal-panel"
        data-size={size}
        role="dialog"
        aria-labelledby="plugin-modal-title"
        onClick={function (event: any) {
          event.stopPropagation();
        }}
      >
        <div className="plugin-modal-header">
          <h2 id="plugin-modal-title" className="plugin-modal-title">
            {props.title}
          </h2>
          <button
            className="plugin-modal-close"
            onClick={props.onClose}
            aria-label="Close"
            type="button"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="plugin-modal-body">{props.children}</div>
        {actions ? <div className="plugin-modal-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
