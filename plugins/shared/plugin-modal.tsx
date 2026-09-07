/**
 * Shared modal component for bundle plugins.
 *
 * A full-screen overlay with a centered dialog panel. The panel layout follows
 * the settings-panel recipe (#35): fixed width 800px, max-width calc(100vw - 48px),
 * height min(800px, 100vh - 48px). A compact size variant (30rem, 60vh max-height)
 * is available for smaller modals.
 *
 * Props: title (string or node), onClose (callback), children (body), footer
 * (optional button row), size ("default" | "compact").
 *
 * Features:
 * - Header with title and close affordance (X button).
 * - Body that scrolls internally while the footer (if present) stays fixed.
 * - Escape key and mask click close the modal.
 * - All listeners cleaned up on unmount.
 * - No portal: renders inline into the component tree.
 */

import react from "react";
import localCss from "./plugin-modal.module.css";

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

export interface PluginModalProps {
  /** Title shown in the header. */
  title: any;
  /** Called when the modal should close (Escape, mask click, or close button). */
  onClose: () => void;
  /** Modal body content. */
  children?: any;
  /** Optional footer content (typically buttons). */
  footer?: any;
  /** Size variant: "default" (800px) or "compact" (30rem). */
  size?: "default" | "compact";
}

/**
 * Shared modal component with overlay, header, scrollable body, and optional footer.
 */
export function PluginModal(props: PluginModalProps) {
  var size = props.size || "default";

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
    <div className={localCss["plugin-modal-mask"]} onClick={props.onClose}>
      <div
        className={localCss["plugin-modal-panel"]}
        data-size={size}
        role="dialog"
        aria-labelledby="plugin-modal-title"
        onClick={function (event: any) {
          event.stopPropagation();
        }}
      >
        <div className={localCss["plugin-modal-header"]}>
          <h2 id="plugin-modal-title" className={localCss["plugin-modal-title"]}>
            {props.title}
          </h2>
          <button
            className={localCss["plugin-modal-close"]}
            onClick={props.onClose}
            aria-label="Close"
            type="button"
          >
            <CloseIcon />
          </button>
        </div>
        <div className={localCss["plugin-modal-body"]}>{props.children}</div>
        {props.footer ? <div className={localCss["plugin-modal-footer"]}>{props.footer}</div> : null}
      </div>
    </div>
  );
}
