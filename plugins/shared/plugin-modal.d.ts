/**
 * Type definitions for the shared PluginModal component.
 *
 * The component is exported from plugin-modal.tsx. Consumers import it via:
 *   import { PluginModal } from "../../shared/plugin-modal";
 *
 * RUNTIME DIRECTION (#93). New callers should prefer the `plugins/modal`
 * runtime plugin (`window.__dshModal__`, guarded by the registry's
 * availability reporting in `plugins/modal/src/registry.ts`) over importing
 * this module directly: every direct import inlines another copy of the
 * component and its CSS into that consumer's bundle. This file remains the
 * component's single source either way.
 *
 * Keep this file in step with plugin-modal.tsx: it is the documented shape
 * of the component's public API.
 */

/**
 * The component's ONLY sizing API.
 *
 * - "full"    the settings-panel spec (#35): width 800px,
 *             max-width calc(100vw - 48px), height min(800px, 100vh - 48px).
 * - "compact" the aidos modal spec: width 420px, max-width 100% and
 *             max-height 100% of the mask's safe box, body scrolls.
 * - "default" the historical spelling of "full"; still accepted.
 */
export type PluginModalSize = "full" | "compact" | "default";

/** Props for the PluginModal component. */
export interface PluginModalProps {
  /** Title shown in the modal header. */
  title: any;
  /** Callback invoked when the modal should close (Escape, mask click, or close button). */
  onClose: () => void;
  /** Modal body content, displayed in the scrollable area. */
  children?: any;
  /**
   * Action buttons. The component wraps them in its own right-aligned row,
   * so pass the buttons themselves and never a row wrapper of your own.
   */
  actions?: any;
  /** Older name for `actions`. Renders into the same right-aligned row. */
  footer?: any;
  /** One of the two standard sizes. Defaults to "full". */
  size?: PluginModalSize;
}

/**
 * Shared modal component for bundle plugins.
 *
 * Renders a full-screen overlay with a centered dialog panel, and owns both
 * the modal's structure and its styling (it injects its own stylesheet once,
 * under the style id "shared/plugin-modal.css").
 *
 * Sizing is closed: exactly two standard sizes, selected with `size`, and no
 * width/height/style/className escape hatch.
 * - "full" (default): 800px wide, max-width calc(100vw - 48px),
 *   height min(800px, 100vh - 48px).
 * - "compact": 420px wide, max-width/max-height 100% of the mask safe box.
 *
 * Features:
 * - Header with title and close button (X icon).
 * - Body that scrolls internally; the panel itself never scrolls. The body is
 *   a flex column, so a caller can mark one region `flex: 1` to give it a
 *   constant height with its own internal scrollbar.
 * - Optional actions row, right-aligned by the shared stylesheet and fixed at
 *   the bottom while the body scrolls.
 * - Escape key closes the modal.
 * - Mask (overlay background) click closes the modal.
 * - All event listeners are cleaned up on unmount.
 * - Renders inline (no portal) into the component tree.
 *
 * Usage:
 *   <PluginModal
 *     title="Modal Title"
 *     size="compact"
 *     onClose={() => setOpen(false)}
 *     actions={
 *       <>
 *         <Button onClick={() => setOpen(false)}>Cancel</Button>
 *         <Button onClick={handleSubmit}>Submit</Button>
 *       </>
 *     }
 *   >
 *     {/* Modal body content */}
 *   </PluginModal>
 */
export function PluginModal(props: PluginModalProps): React.ReactElement;
