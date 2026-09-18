// Layout constants for the bash command diagram (bash-graph).
//
// Every number here comes from the prototype (proto/index.html) and from the
// "For the port" section of proto/NOTES.md. The comments name the origin of
// each value. Do not tune these to make a model agree with itself: when the
// model and the browser disagree, the model is wrong (standing rule, round 8).

/** One length step. Steps are MAX-WIDTH CEILINGS, never sizers (round 10.1). */
export interface SizeStep {
  key: string;
  /** Segment length ceiling in characters. */
  max: number;
  /** Stylesheet width ceiling in px. */
  w: number;
}

export const SCALE: SizeStep[] = [
  { key: "xs", max: 12, w: 112 },
  { key: "s", max: 28, w: 168 },
  { key: "m", max: 56, w: 232 },
  { key: "l", max: 96, w: 312 },
  { key: "xl", max: 150, w: 400 },
];

/** Nearest step for a segment length. Null means past the largest step. */
export function sizeFor(len: number): SizeStep | null {
  for (const s of SCALE) if (len <= s.max) return s;
  return null;
}

/**
 * Nearest step key whose ceiling covers a natural width. Never prices the
 * DP: steps survive as the initial width plus metadata only (round 10.1).
 */
export function stepFor(nat: number): string {
  for (const s of SCALE) if (nat <= s.w) return s.key;
  return "xl";
}

/**
 * THE one margin (rounds 7.3, 10.4). Spec widths through the layout are
 * OUTER widths: border-box plus 2xNODE_M margin. The node inline width is
 * always spec minus the margins. Lone border and svg border both sit at
 * exactly NODE_M; continuation rows sit at NODE_M plus IND.
 */
export const NODE_M = 10;

/** Fixed op-disc width: 36 CSS px plus 2x10 margins is a 56px pitch. */
export const OP_W = 36;

/** Pill label truncation cap (round 7.2). Past this the label ellipsizes. */
export const PILL_MAX_PX = 220;

/**
 * Split-arrow gap (rounds 9.4, 10.3, owner decision). The old
 * two-arrows-plus-disc idiom measured 22+56+22=100px; the split arrow runs
 * at about 80 percent with the 26px tag centred in it.
 */
export const PIPE_GAP = 80;

/** Non-pipe adjacency gap in px. */
export const GAP = 22;

/** Row pitch: the vertical cost of each continuation row. */
export const ROWGAP = 22;

/** Continuation indent: wrapped rows sit IND px right of the first row. */
export const IND = 32;

/**
 * Short-command threshold (round 10.2). A command whose raw slice is at most
 * this many characters is inflexible: nowrap at natural width. The value
 * comes from the corpus, not taste: quote-aware segments cluster at 8ch or
 * below, zero sit at 11-12ch, owner examples top out at 10ch.
 */
export const SHORT_T = 16;

/**
 * Long-argument threshold (round 7.1). Quoted args longer than this extract
 * to pills: verbatim front slice plus counts on the label, full text one
 * click away below the panel.
 */
export const ARG_T = 80;

/** Diagram column width minus chrome, floored (prototype cardAvail). */
export const CARD_AVAIL = 716;

/**
 * Available diagram width in px. Reads the live column width when a page
 * provides one, else the verified 716px default. Never throws: without a
 * document it returns CARD_AVAIL, exactly like the prototype catch path.
 */
export function cardAvail(): number {
  try {
    const g = globalThis as { document?: { querySelector(s: string): { clientWidth?: number } | null } };
    const col = g.document ? g.document.querySelector("#col") : null;
    const w = col && col.clientWidth ? col.clientWidth : 748;
    return Math.max(200, w - 32);
  } catch {
    return CARD_AVAIL;
  }
}
