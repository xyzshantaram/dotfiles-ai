// Verbatim text helpers: every display string stays a slice of the source.
//
// THE verbatim rule (machine-checked every prototype round): every display
// string derives from SL(src, ...) slices except listed boilerplate, the
// closed list of generated test words (parseTest), and operator symbols
// shown-not-told (pipe glyph, circle-plus, merge chevron). Interpretation
// never touches segmentation or offsets: reconstruct and show-original are
// the source itself.

/** Escape text for HTML. */
export function esc(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

/** Verbatim source slice. Display text always passes through here. */
export function SL(src: string, a: number, b: number): string {
  return src.slice(a, b);
}

/**
 * Token-aware wrapping (design rule D3). A shell token wraps as a unit:
 * runs without whitespace split at "/" into .seg spans (white-space:nowrap,
 * so a path only breaks AFTER a slash) joined by <wbr>. Whitespace between
 * tokens stays raw: the preferred break point. <wbr> adds no visible
 * character, so the verbatim-slice rule still holds. Quoted strings are NOT
 * seg-wrapped: their inner spaces stay breakable.
 */
export function segHTML(raw: string): string {
  return String(raw)
    .split("/")
    .map((p) => `<span class="seg">${esc(p)}</span>`)
    .join("/<wbr>");
}

/** Escape plus slash break opportunities, without token spans. */
export function wbrHTML(s: string): string {
  return esc(s).replace(/\//g, "/<wbr>");
}

/**
 * Render a plain-text run: whitespace raw, other tokens seg-wrapped, and the
 * first token optionally bolded as the command name.
 */
export function xRunHTML(s: string, isName: boolean): string {
  let named = !isName;
  return String(s)
    .split(/(\s+)/g)
    .map((p) => {
      if (p === "" || /^\s+$/.test(p)) return esc(p);
      const inner = segHTML(p);
      if (!named) {
        named = true;
        return `<span class="node-name">${inner}</span>`;
      }
      return inner;
    })
    .join("");
}

export interface HlCmd {
  html: string;
  name: string;
}

/**
 * Verbatim highlight: wraps slices only, never reprints text. Splits the raw
 * slice into string, variable, flag, path, and plain runs; bolds the command
 * name (the first token). Returns the HTML plus the command name used for
 * icon lookup.
 */
export function hlCmd(src: string, ta: number, tb: number, isFirst?: boolean): HlCmd {
  const raw = SL(src, ta, tb);
  const toks: { t: string; s: string }[] = [];
  let m: RegExpExecArray | null;
  const re =
    /("[^"]*"|'[^']*'|\$[\w{}()#]+|--?[A-Za-z0-9_][\w.-]*|\/[^\s'"`|&;()]*|\b\d[\d.]*\b)/g;
  let last = 0;
  while ((m = re.exec(raw))) {
    if (m.index > last) toks.push({ t: "x", s: raw.slice(last, m.index) });
    const s = m[0];
    let cls = "x";
    if (/^['"]/.test(s)) cls = "hl-str";
    else if (/^\$/.test(s)) cls = "hl-var";
    else if (/^-/.test(s)) cls = "hl-flag";
    else if (/^\//.test(s)) cls = "hl-path";
    toks.push({ t: cls, s });
    last = m.index + s.length;
  }
  if (last < raw.length) toks.push({ t: "x", s: raw.slice(last) });
  const first = /^\s*\S+/.exec(raw);
  const nameEnd = first ? first[0].length : 0;
  let html = "";
  let pos = 0;
  for (const tk of toks) {
    const end = pos + tk.s.length;
    if (tk.t === "x") html += xRunHTML(tk.s, pos < nameEnd && isFirst !== false);
    else if (tk.t === "hl-path") html += `<span class="hl-path">${segHTML(tk.s)}</span>`;
    else html += `<span class="${tk.t}">${wbrHTML(tk.s)}</span>`;
    pos = end;
  }
  const nm = (first ? first[0] : "").trim();
  return { html, name: nm };
}

/**
 * Highlight an expanded heredoc body. Entity-safe: the "#" comment branch
 * must not match the "#" inside an HTML entity (&#39; from an unpaired
 * quote). Without the lookbehind, a line with an odd number of quotes gets
 * its entity split by a span tag and the browser shows a literal "&#39;".
 */
export function hlBody(text: string): string {
  return esc(text).replace(
    /(&quot;.*?&quot;|&#39;.*?&#39;|(?<!&)#[^\n]*)/g,
    (s) =>
      s.startsWith("#")
        ? `<span class="hl-var">${s}</span>`
        : `<span class="hl-str">${s}</span>`,
  );
}

/** Highlight an expanded quoted argument body: one verbatim string span. */
export function hlArgBody(text: string): string {
  return `<span class="hl-str">${esc(text)}</span>`;
}

/**
 * First word of the slice, skipping leading VAR=value assignments. Used for
 * icon lookup only; the display keeps the full verbatim slice.
 */
export function cmdNameOf(src: string, t: { ta: number; tb: number }): string {
  const raw = SL(src, t.ta, t.tb);
  const words = raw.match(/[^\s'"]+|'[^']*'|"[^"]*"/g) || [];
  for (const w0 of words) {
    const w = w0.trim();
    if (!w) continue;
    if (/^[A-Za-z_]\w*=/.test(w)) continue;
    return w;
  }
  return "?";
}
