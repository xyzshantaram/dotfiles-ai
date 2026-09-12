// SplitKit select helper: thin wrappers over the exotui selection
// controller so wizards get a predictable headless surface.
import { SelectionController, Signal } from "exotui";

// Build a multi-select controller over count items with the given set ticked.
export function createMulti(count: number, initial: number[]): SelectionController {
  return new SelectionController({
    length: new Signal(count),
    mode: "multiple",
    initialState: { activeIndex: 0, selected: initial },
  });
}

// Build a single-select controller with the active person ticked.
export function createSingle(count: number, initial: number): SelectionController {
  return new SelectionController({
    length: new Signal(count),
    mode: "single",
    initialState: { activeIndex: initial, selected: [initial] },
  });
}

// Return a copy of the currently ticked indices.
export function chosen(sel: SelectionController): number[] {
  return [...sel.state.peek().selected];
}

// Step the active index by one row and clamp at both ends.
// Selecting the new index moves the cursor only; multi-select keeps the set.
export function move(sel: SelectionController, dir: 1 | -1): void {
  const count = sel.length.peek();
  const at = sel.state.peek().activeIndex + dir;
  const next = Math.max(0, Math.min(count - 1, at));
  sel.select(next);
}
