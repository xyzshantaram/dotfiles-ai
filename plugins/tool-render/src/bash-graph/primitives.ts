// The six primitives: Node, Chip, Edge, Panel, Badge, Icon.
//
// Defined ONCE here with semantic arguments only (kind, size key, icon name,
// meaning): never colours, widths, or margins. Styling lives in styles.css
// under the six .prim-* classes. Anything the diagram needs that is not
// built from these is a candidate one-off, not a silent seventh primitive.
//
// Icons: names are lucide names at the pinned major line (production uses
// lucide-react on the same major line; the loading mechanism differs, the
// names transfer). ONE glyph is not a lucide icon: the pipe glyph is inline
// owner-supplied art (round 11.1), carried here as a symbol string. It must
// never become a lucide name. Icon() emits <i data-lucide> placeholders; the
// host swaps them for real icons after measurement (round 6 rule: the
// measurer reserves icon space structurally, so the swap cannot move text).

import { esc, segHTML } from "./text.js";

/** Text fallback per operator for the no-lucide path. */
export const GLYPH_FB: Record<string, string> = {
  "|": "|",
  "&&": "&&",
  "||": "||",
  ">": ">",
  ">>": ">>",
  "2>&1": "2>&1",
  "<<": "<<",
  ";": ";",
  "&": "&",
};

/** Tooltip meanings. Tooltips carry the meaning the old nodes used to hold. */
export const OP_MEANING: Record<string, string> = {
  "|": "pipe: passes the previous step's output as input to the next step",
  "&&": "and: runs only if the previous step succeeded",
  "||": "or: runs only if the previous step failed",
  ">": "redirect: writes the previous step's output into a file (truncate)",
  ">>": "redirect: appends the previous step's output to a file",
  "2>&1": "merge: folds error output into standard output",
  "2>&1 |":
    "merge then pipe: folds error output into standard output and passes it on as input to the next step",
  "<<": "heredoc: feeds the collapsed lines below as input — activate the node to expand",
};

/** Lucide names per operator. "pipe-glyph" is the inline owner symbol. */
export const OP_ICON: Record<string, string> = {
  "|": "pipe-glyph",
  "&&": "check",
  "||": "circle-plus",
  ">": "file-output",
  ">>": "file-output",
  "2>&1": "merge",
  "2>&1 |": "merge",
  "<<": "scroll-text",
};

/** Lucide names per command. Lookup strips trailing digits first. */
export const CMD_ICON: Record<string, string> = {
  git: "git-branch",
  npm: "package",
  node: "hexagon",
  deno: "shell",
  python: "file-code",
  python3: "file-code",
  rg: "search",
  sed: "scissors",
  cd: "folder",
  echo: "megaphone",
  cat: "file-text",
  ls: "list",
  head: "chevrons-up",
  tail: "chevrons-down",
  wc: "hash",
  sort: "arrow-down-wide-narrow",
  uniq: "list-checks",
  export: "upload",
  timeout: "timer",
};

/**
 * Owner-supplied pipe glyph (round 11.1). Inlined as <symbol> plus <use>: the
 * page stays self-contained (no fetch) and there is no load-order race with
 * measurement (the round-6 icon-swap class of bug: an inline symbol renders
 * on first paint). The source rotate group stays in viewBox units
 * (size-independent) and the fill is currentColor, so both themes follow the
 * badge colour. Pipe tags are overlays and op nodes are fixed-width, so the
 * glyph takes no measurer reserve. Render this symbol once per page; tags
 * reference it with <use href="#pipe-glyph">.
 */
export const PIPE_GLYPH_SYMBOL = `<symbol id="pipe-glyph" viewBox="0 0 512 512"><g transform="rotate(-90 256 256)"><path d="m 488.727,232.727 h -93.091 c -12.853,0 -23.273,10.42 -23.273,23.273 v 23.273 H 232.727 V 139.636 H 256 c 12.853,0 23.273,-10.42 23.273,-23.273 V 23.273 C 279.273,10.42 268.853,0 256,0 H 23.273 C 10.42,0 0,10.42 0,23.273 v 93.091 c 0,12.853 10.42,23.273 23.273,23.273 h 23.273 v 219.415 c 0,58.77 47.633,106.403 106.403,106.403 h 219.415 v 23.273 c 0,12.853 10.42,23.273 23.273,23.273 h 93.091 C 501.58,512 512,501.58 512,488.727 V 256 c 0,-12.853 -10.42,-23.273 -23.273,-23.273 z M 46.545,46.545 H 232.727 V 93.09 H 209.454 69.818 46.545 Z m 106.403,372.364 c -33.064,0 -59.857,-26.794 -59.857,-59.857 V 139.636 h 93.091 v 162.909 c 0,12.853 10.42,23.273 23.273,23.273 h 162.909 v 93.091 z m 312.507,46.546 H 418.91 V 442.182 302.545 279.272 h 46.545 z" fill="currentColor"/></g></symbol>`;

/** The pipe glyph instantiation. Sizing comes from the .prim-icon rules. */
export function PipeGlyph(): string {
  return `<span class="prim-icon"><svg aria-hidden="true"><use href="#pipe-glyph"></use></svg></span>`;
}

/** Icon placeholder. The host swaps <i data-lucide> for real icons later. */
export function Icon(name: string, fb: string, cls?: string): string {
  if (name === "pipe-glyph") return PipeGlyph();
  return `<span class="prim-icon${cls ? " " + cls : ""}"><i data-lucide="${esc(name)}" data-fb="${esc(fb || "•")}"></i></span>`;
}

/** Inline chip: filenames, heredoc delimiters. */
export function Chip(text: string): string {
  return `<span class="prim-chip">${segHTML(text)}</span>`;
}

/** Count or parse-mode badge. */
export function Badge(text: string, tone: string): string {
  return `<span class="prim-badge"${tone ? ` data-tone="${tone}"` : ""}>${esc(text)}</span>`;
}

/**
 * Conditional chip (round 13.2). The || chip shows the operator SYMBOL, not
 * its text: in Boolean algebra + IS disjunction, so circle-plus is the
 * standard notation, shown-not-told like the pipe glyph (glyph-only chip,
 * title carries the meaning). The literal text read as a pause button. The
 * data sym stays the verbatim slice, so chip-sequence checks and the
 * verbatim invariant are untouched; the no-lucide fallback still shows ||
 * via fb. && keeps its text (out of scope). Glyph-only applies to chip and
 * tag sites, never to op discs.
 */
export function chipHTML(sym: string, meaning: string): string {
  const body = sym === "||" ? Icon(OP_ICON["||"], "||") : segHTML(sym);
  return `<span class="op-chip" title="${esc(meaning)}">${body}</span>`;
}

/**
 * Split-arrow glyph tag, centred on the edge line (rounds 9.3, 10.3).
 * Glyph-only (no text can wrap); the title carries the meaning. 18px glyph
 * in an explicit 26px square box; the inter-node gap around it is PIPE_GAP,
 * so arrow shows on both sides. Coordinates are pure svg-space: the
 * .edgewrap containing block makes them padding-proof (round 9 rule: fix the
 * containing block, never offset the coordinates).
 */
export function pipeTagHTML(kind: string, mx: number, y: number): string {
  const cfg =
    kind === "pipe"
      ? { icon: "pipe-glyph", fb: "|", spin: null as string | null, meaning: OP_MEANING["|"] }
      : { icon: "merge", fb: "2>&1 |", spin: "rot90" as string | null, meaning: OP_MEANING["2>&1 |"] };
  return `<span class="pipe-tag" data-pipe="${kind}" title="${esc(cfg.meaning)}" style="left:${mx.toFixed(1)}px;top:${y.toFixed(1)}px">${Icon(cfg.icon, cfg.fb, cfg.spin ?? undefined)}</span>`;
}

export interface ChipRef {
  sym: string;
  meaning: string;
}

export interface NodeOptions {
  size?: string;
  op?: string;
  sym?: string;
  meaning?: string;
  icon?: string;
  iconFb?: string;
  spin?: string | null;
  name?: string;
  bodyHTML?: string;
  dockHTML?: string;
  chip?: ChipRef | null;
}

/**
 * Node primitive. Op discs render icon plus symbol; command nodes render
 * icon-inline plus highlighted verbatim body plus an optional dock below.
 * Chipped cards (round 8.4) share one outline: chip bar plus body in a flex
 * split card, chip one colour and body the other.
 */
export function Node(o: NodeOptions): string {
  if (o.op)
    return `<div class="prim-node op" data-size="op" title="${esc(o.meaning ?? "")}">${Icon(o.icon ?? "", o.sym ?? "", o.spin ?? undefined)}<span class="op-sym">${esc(o.sym ?? "")}</span></div>`;
  const main =
    (o.icon ? Icon(o.icon, o.iconFb ?? "") : "") +
    `<span class="node-text"><code>${o.bodyHTML ?? ""}</code></span>` +
    (o.dockHTML ? `<div class="hdock">${o.dockHTML}</div>` : "");
  if (o.chip)
    return `<div class="prim-node has-chip" data-size="${o.size}"${o.name ? ` data-cmd="${esc(o.name)}"` : ""}>` +
      chipHTML(o.chip.sym, o.chip.meaning) +
      `<span class="node-main">${main}</span></div>`;
  return `<div class="prim-node" data-size="${o.size}"${o.name ? ` data-cmd="${esc(o.name)}"` : ""}${o.meaning ? ` title="${esc(o.meaning)}"` : ""}>` +
    main +
    `</div>`;
}

/** Edge primitive: coordinates only; stroke lives in .prim-edge. */
export function Edge(x1: number, y1: number, x2: number, y2: number): { x1: number; y1: number; x2: number; y2: number } {
  return { x1, y1, x2, y2 };
}

/** Panel primitive: head, body, optional foot. */
export function Panel(headHTML: string, bodyHTML: string, footHTML?: string): string {
  return `<section class="prim-panel"><div class="prim-panel-head">${headHTML}</div><div>${bodyHTML}</div>${footHTML ? `<div>${footHTML}</div>` : ""}</section>`;
}
