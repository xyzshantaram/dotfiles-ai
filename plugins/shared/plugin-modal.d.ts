/**
 * Type definitions for the shared PluginModal component.
 *
 * The component is exported from plugin-modal.tsx. Consumers import it via:
 *   import { PluginModal } from "../../shared/plugin-modal";
 */

/** Props for the PluginModal component. */
export interface PluginModalProps {
  /** Title shown in the modal header. */
  title: any;
  /** Callback invoked when the modal should close (Escape, mask click, or close button). */
  onClose: () => void;
  /** Modal body content, displayed in the scrollable area. */
  children?: any;
  /** Optional footer content, typically containing action buttons. */
  footer?: any;
  /** Size variant: "default" (800px, the settings-panel recipe) or "compact" (30rem). Default is "default". */
  size?: "default" | "compact";
}

/**
 * Shared modal component for bundle plugins.
 *
 * Renders a full-screen overlay with a centered dialog panel. The panel layout
 * follows the settings-panel recipe (#35): fixed width 800px, max-width
 * calc(100vw - 48px), height min(800px, 100vh - 48px). A compact size variant
 * (30rem width, 60vh max-height) is available via size="compact".
 *
 * Features:
 * - Header with title and close button (X icon).
 * - Body that scrolls internally.
 * - Optional footer row (typically buttons) that stays fixed at the bottom.
 * - Escape key closes the modal.
 * - Mask (overlay background) click closes the modal.
 * - All event listeners are cleaned up on unmount.
 * - Renders inline (no portal) into the component tree.
 *
 * Usage:
 *   <PluginModal
 *     title="Modal Title"
 *     onClose={() => setOpen(false)}
 *     footer={
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
