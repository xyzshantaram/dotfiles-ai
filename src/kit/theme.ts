// SplitKit theme: neon engine with white foreground tokens, plus the
// row colour mapping shared by every wizard screen.
import { crayon } from "crayon";
import { createThemeEngine } from "exotui";

/** Styles one text run. */
export type RowStyle = (text: string) => string;

/** Component theme shared by all SplitKit screens. */
export const SplitKit = createThemeEngine("neon", {
  tokens: { foreground: crayon.white },
}).component("SplitKit");

/** Maps a tree row status plus selection to a style, or undefined for todo. */
export function rowStyleFor(
  status: string | undefined,
  selected: boolean,
): RowStyle | undefined {
  if (selected) return (text) => crayon.bold(crayon.white(text));
  if (status === "done") return (text) => crayon.green(text);
  if (status === "current") return (text) => crayon.bold(crayon.cyan(text));
  if (status === "skipped") return (text) => crayon.dim(text);
  return undefined;
}
