// SplitKit tree helper: plain row data in, one exotui tree node out.
import type { TreeNode } from "exotui";

/** State tag carried by one tree row. */
export type KitTreeStatus = "done" | "current" | "skipped" | "todo";

/** One plain row fed to the kit tree. */
export interface KitTreeRow {
  id: string;
  label: string;
  status: KitTreeStatus;
}

/** Builds one expanded parent whose children copy the row statuses. */
export function rootNode(id: string, label: string, rows: KitTreeRow[]): TreeNode {
  return {
    id,
    label,
    expanded: true,
    children: rows.map((row) => ({
      id: row.id,
      label: row.label,
      status: row.status,
    })),
  };
}

/** Flat position of the current row: child position plus 1 for the parent. */
export function indexOf(rows: KitTreeRow[], state: "current"): number {
  const child = rows.findIndex((row) => row.status === state);
  if (child === -1) return rows.length + 1;
  return child + 1;
}
