/**
 * React hooks shared across client plugin halves.
 *
 * These live apart from `client-util.ts` on purpose. That module is
 * framework-free and has its own vitest suite, which runs in plain node where
 * `react` does not resolve. Importing react there broke the suite at load time.
 * Anything needing react belongs here, and only client bundles import it, where
 * esbuild marks react external and the host supplies it.
 */
import * as react from "react";

/**
 * Close a popover when the user points outside it or presses Escape.
 *
 * Use `pointerdown`, not `mousedown`: it fires for pen and touch too, and it
 * lands before focus moves. Two copies of this effect had already drifted onto
 * different events before it was extracted.
 *
 * @param open - whether the popover is currently open.
 * @param rootRef - ref to the element that counts as inside.
 * @param onClose - called when the user dismisses.
 */
export function useDismissable(
  open: boolean,
  rootRef: { current: unknown },
  onClose: () => void,
): void {
  react.useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const onPointerDown = (event: any) => {
      const root = rootRef.current as Node | null;
      if (root !== null && event.target instanceof Node && root.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event: any) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
}
