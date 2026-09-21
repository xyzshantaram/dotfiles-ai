// Parsing: quote-aware scanning with OWN OFFSETS, plus the unbash bridge.
//
// Two hard rules bind this module (verified 2026-09-18):
// - CLIENT-PARSE ONLY. The host runs unbash 3.0.0, the client 4.0.10, and
//   they disagree about heredoc offsets. Nothing here may consume host-side
//   offsets; the walker package (@cad0p/unbash-walker) imports node:path and
//   reads process.env, so it must never enter the client bundle either.
// - OWN OFFSETS ONLY. unbash positions are advisory: adoptSpans() snaps the
//   scanner's own (ta, tb) spans toward unbash's, never the reverse. Display
//   always slices src at the scanner's offsets.
//
// The scanner tracks quotes, backslash escapes, and $()/() nesting depth so
// that operators inside quotes or substitutions never split structure.

import { parse } from "unbash";
import { ARG_T } from "./constants.js";
import { SL, hlCmd, segHTML, esc } from "./text.js";

/** Line count of a body: empty is 0, else newlines plus one. */
export function countLines(txt: string): number {
  return txt === "" ? 0 : txt.split("\n").length - (txt.endsWith("\n") ? 1 : 0);
}

export interface HeredocBody {
  delim: string;
  a: number;
  b: number;
  lines: number;
  unterminated: boolean;
}

export interface SourceLine {
  a: number;
  b: number;
  endExt: number;
  heredocs: HeredocBody[];
}

interface HeredocOpen {
  delim: string;
  allowTabs: boolean;
  end: number;
}

/** Parse a << or <<- opener at src[i]. Null when it is not an opener. */
export function parseHeredocOpen(src: string, i: number): HeredocOpen | null {
  let j = i + 2;
  let allowTabs = false;
  if (src[j] === "-") {
    allowTabs = true;
    j++;
  }
  while (src[j] === " " || src[j] === "\t") j++;
  let qc: string | null = null;
  if (src[j] === "'" || src[j] === '"' || src[j] === "\\") {
    qc = src[j];
    j++;
  }
  let delim = "";
  if (qc) {
    while (j < src.length && src[j] !== qc) {
      delim += src[j];
      j++;
    }
    j++;
  } else {
    const m = /^[A-Za-z0-9_]+/.exec(src.slice(j));
    if (!m) return null;
    delim = m[0];
    j += delim.length;
  }
  if (!delim) return null;
  return { delim, allowTabs, end: j };
}

/**
 * Split at depth-0 newlines. Heredoc bodies are consumed into the owning
 * line: each line carries its bodies plus endExt (the offset past them), so
 * later stages never re-scan body text as structure.
 *
 * Ticket #187: newlines inside a compound (for/if/while/case open,
 * done/fi/esac close) never split. A multiline loop is one construct, not
 * one statement per line, and splitting it draws the terminator line as a
 * command panel.
 */
export function splitLines(src: string): SourceLine[] {
  const N = src.length;
  const lines: SourceLine[] = [];
  let i = 0;
  let start = 0;
  let q: string | null = null;
  let depth = 0;
  let esc2 = false;
  const cs = compoundState();
  let pending: HeredocOpen[] = [];
  const flushLine = (nlPos: number | null, _isEOF: boolean): void => {
    const bodyStart = nlPos != null ? nlPos + 1 : N;
    const bodies: HeredocBody[] = [];
    let pos = bodyStart;
    for (const h of pending) {
      let p = pos;
      let found = false;
      while (p <= N) {
        let e = src.indexOf("\n", p);
        if (e === -1) e = N;
        let cmp = src.slice(p, e);
        if (h.allowTabs) cmp = cmp.replace(/^\t+/, "");
        if (cmp === h.delim) {
          const txt = src.slice(pos, p);
          bodies.push({ delim: h.delim, a: pos, b: p, lines: countLines(txt), unterminated: false });
          pos = e + 1;
          found = true;
          break;
        }
        p = e + 1;
      }
      if (!found) {
        const txt = src.slice(pos);
        bodies.push({ delim: h.delim, a: pos, b: N, lines: countLines(txt), unterminated: true });
        pos = N;
      }
    }
    if (src.slice(start, nlPos ?? N).trim() !== "" || bodies.length)
      lines.push({ a: start, b: nlPos ?? N, endExt: pos, heredocs: bodies });
    if (nlPos != null) {
      i = pos;
      start = pos;
    }
    pending = [];
  };
  while (i < N) {
    const c = src[i];
    if (esc2) {
      esc2 = false;
      i++;
      continue;
    }
    if (q) {
      if (c === "\\" && q !== "'") esc2 = true;
      else if (c === q) {
        q = null;
        compoundMark(cs, c);
      }
      i++;
      continue;
    }
    if (c === "\\") {
      compoundMark(cs, c);
      esc2 = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      compoundMark(cs, c);
      q = c;
      i++;
      continue;
    }
    if (c === "$" && (src[i + 1] === "(" || src[i + 1] === "{")) {
      compoundMark(cs, c);
      compoundMark(cs, src[i + 1]);
      depth++;
      i += 2;
      continue;
    }
    if (c === "(" || c === "{") {
      compoundMark(cs, c);
      depth++;
      i++;
      continue;
    }
    if ((c === ")" || c === "}") && depth > 0) {
      compoundMark(cs, c);
      depth--;
      i++;
      continue;
    }
    // A stray closer at depth 0 (case arms: `a)`) binds no nesting, but it
    // still bounds a word and, for `)`, a command may follow it. The `)`
    // goes through the pattern rule (the word before it was a case label);
    // `}` keeps the plain mark.
    if (c === ")") {
      compoundStrayParen(cs);
      i++;
      continue;
    }
    if (c === "}") {
      compoundMark(cs, c);
      i++;
      continue;
    }
    if (depth === 0 && c === "<" && src[i + 1] === "<") {
      const h = parseHeredocOpen(src, i);
      if (h) {
        // The opener through its delimiter is skipped unread: delimiter
        // words never reach the tracker, so a delimiter named like a
        // keyword (<<done) stays data whatever position it sits in.
        pending.push(h);
        i = h.end;
        continue;
      }
      compoundMark(cs, c);
      i++;
      continue;
    }
    if (/[A-Za-z0-9_]/.test(c)) {
      if (depth === 0) compoundPush(cs, c);
      i++;
      continue;
    }
    compoundMark(cs, c);
    if (depth === 0 && c === "\n") {
      // A comment ends where its line does, even an unflushed one.
      cs.comment = false;
      if (cs.depth === 0) {
        flushLine(i, false);
        continue;
      }
      i++;
      continue;
    }
    i++;
  }
  compoundFlush(cs);
  flushLine(null, true);
  return lines;
}

export interface SemiPart {
  a: number;
  b: number;
}

/**
 * Compound tracking, ticket #187. for/if/while/case open a construct that
 * only done/fi/esac close; the semicolons and newlines inside are body
 * punctuation, not statement separators. Splitting on them tears the
 * construct into sibling statements, so the terminator renders as its own
 * command panel and body operators draw top-level edges between statements
 * that are not siblings.
 *
 * Only words at COMMAND position count: the range start, or right after a
 * separator (;, &, |, (, {, newline, !, )) or an interior keyword
 * (do/then/else/elif/in, plus the time prefix the renderer keeps as
 * verbatim text). Any other word clears the expectation, so `echo done`
 * never closes anything and `[[ $x == case* ]]` never opens anything. The
 * interior-keyword re-arm itself fires only from command position: an
 * argument that spells like one (`echo then for`, `echo in`) steers
 * nothing. And a word before a depth-0 `)` that opened no paren is a case
 * pattern, not a command, so a keyword-named arm (`for)`, `esac)`) undoes
 * whatever open or close it just caused.
 * Redirect/test brackets (>, <, [) always clear it, so a heredoc delimiter
 * or test operand named like a keyword stays data. Quoted, escaped, and
 * paren-nested text never forms words at all. A # at command position opens
 * a comment to the end of the line (splitLines) or range (splitSemis), so a
 * comment mentioning a keyword cannot open or close anything either.
 */
const COMPOUND_OPEN = new Set(["for", "while", "until", "select", "if", "case"]);
const COMPOUND_CLOSE = new Set(["done", "fi", "esac"]);
const COMPOUND_CONT = new Set(["do", "then", "else", "elif", "in", "time"]);

interface CompoundState {
  depth: number;
  expectCmd: boolean;
  word: string;
  comment: boolean;
}

function compoundState(): CompoundState {
  return { depth: 0, expectCmd: true, word: "", comment: false };
}

/** Close the pending word: openers deepen, closers shallow (floored at 0).
 *
 * Two rules keep keyword-shaped ARGUMENTS from steering the tracker
 * (review of 407bc9b, ticket #187):
 * - The CONT re-arm fires only when the word was ITSELF at command
 *   position. `echo then for`, `echo else done` and `echo in` leave `then`,
 *   `else`, `done`, `in` as arguments, so the next word stays an argument
 *   too instead of being promoted to command position and opening (or
 *   closing) a compound.
 * - The return carries the depth effect, so a depth-0 `)` can undo it (see
 *   compoundStrayParen): a word before a `)` that opened no paren is a case
 *   pattern, never a command.
 */
function compoundFlush(cs: CompoundState): { delta: number } {
  const w = cs.word;
  cs.word = "";
  if (w === "" || cs.comment) return { delta: 0 };
  const wasCmd = cs.expectCmd;
  let delta = 0;
  if (wasCmd) {
    if (COMPOUND_OPEN.has(w)) {
      cs.depth++;
      delta = 1;
    } else if (COMPOUND_CLOSE.has(w) && cs.depth > 0) {
      cs.depth--;
      delta = -1;
    }
  }
  cs.expectCmd = wasCmd && COMPOUND_CONT.has(w);
  return { delta };
}

/**
 * One non-word char: close the pending word, then update the command
 * expectation. Spaces and most punctuation leave it untouched (a command
 * word is still coming); only separators set it and only brackets clear it.
 */
function compoundMark(cs: CompoundState, c: string): void {
  compoundFlush(cs);
  if (
    c === ";" ||
    c === "&" ||
    c === "|" ||
    c === "(" ||
    c === "{" ||
    c === "\n" ||
    c === "!" ||
    c === ")"
  )
    cs.expectCmd = true;
  else if (c === "<" || c === ">" || c === "[") cs.expectCmd = false;
  // A # anywhere else is literal (a#b, quoted text never reaches here, an
  // escaped # is consumed as data): only command position comments.
  else if (c === "#" && cs.expectCmd) cs.comment = true;
}

/**
 * A depth-0 `)` that closed no paren the tracker opened (ticket #187
 * review). In valid bash that paren is a case-arm terminator, so the word
 * before it is a PATTERN, not a command — even when it spells like one. A
 * keyword-named arm (`case $x in a) ..;; for) ..;; esac`: the second label
 * genuinely sits at command position after `;;`) must not open a compound
 * the single `esac` cannot close, and a closer-named arm (`esac) ..`) must
 * not close one early: either depth effect is undone. `)` still bounds the
 * word and a command (the arm body) still follows it. `{`/`}` need no twin:
 * no valid construct puts a compound keyword directly before a depth-0 `}`.
 */
function compoundStrayParen(cs: CompoundState): void {
  const { delta } = compoundFlush(cs);
  cs.depth -= delta;
  cs.expectCmd = true;
}

/** One word char in active (unquoted, depth-0, uncommented) text. */
function compoundPush(cs: CompoundState, c: string): void {
  if (!cs.comment) cs.word += c;
}

/** Split a line at depth-0 semicolons. Empty parts are dropped.
 *
 * Ticket #187: semicolons inside a compound never split. `for f in a b;
 * do echo $f; done` is one construct; cutting it at each `;` tears it into
 * three sibling statements and draws `done` as a command.
 */
export function splitSemis(src: string, a: number, b: number): SemiPart[] {
  const parts: SemiPart[] = [];
  let i = a;
  let start = a;
  let q: string | null = null;
  let depth = 0;
  let esc2 = false;
  const cs = compoundState();
  const push = (e: number): void => {
    if (src.slice(start, e).trim() !== "") parts.push({ a: start, b: e });
    start = e + 1;
  };
  while (i < b) {
    const c = src[i];
    if (esc2) {
      esc2 = false;
      i++;
      continue;
    }
    if (q) {
      if (c === "\\" && q !== "'") esc2 = true;
      else if (c === q) {
        q = null;
        compoundMark(cs, c);
      }
      i++;
      continue;
    }
    if (c === "\\") {
      compoundMark(cs, c);
      esc2 = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      compoundMark(cs, c);
      q = c;
      i++;
      continue;
    }
    if (c === "$" && (src[i + 1] === "(" || src[i + 1] === "{")) {
      compoundMark(cs, c);
      compoundMark(cs, src[i + 1]);
      depth++;
      i += 2;
      continue;
    }
    if (c === "(" || c === "{") {
      compoundMark(cs, c);
      depth++;
      i++;
      continue;
    }
    if ((c === ")" || c === "}") && depth > 0) {
      compoundMark(cs, c);
      depth--;
      i++;
      continue;
    }
    // A stray closer at depth 0 (case arms: `a)`) binds no nesting, but it
    // still bounds a word and, for `)`, a command may follow it. The `)`
    // goes through the pattern rule (the word before it was a case label);
    // `}` keeps the plain mark.
    if (c === ")") {
      compoundStrayParen(cs);
      i++;
      continue;
    }
    if (c === "}") {
      compoundMark(cs, c);
      i++;
      continue;
    }
    if (/[A-Za-z0-9_]/.test(c)) {
      if (depth === 0) compoundPush(cs, c);
      i++;
      continue;
    }
    compoundMark(cs, c);
    if (depth === 0 && c === ";") {
      if (cs.depth === 0) push(i);
      i++;
      continue;
    }
    i++;
  }
  compoundFlush(cs);
  if (src.slice(start, b).trim() !== "") parts.push({ a: start, b });
  return parts;
}

/** Operators, longest first so 2>&1 and <<- win over their prefixes. */
export const OPS = ["2>&1", "1>&2", "&>", "<<-", "<<", ">>", "&&", "||", ">", "<", "|"];
// NOTE (ticket #181): a bare & (background) is deliberately NOT in OPS. It is
// recognised below as its own op token so the model stage can see it, and the
// model stage degrades the whole segment to verbatim: drawing a backgrounded
// statement as an ordered chain would assert something false about execution.

export type TokenItem =
  | { t: "cmd"; a: number; b: number; ta: number; tb: number }
  | { t: "op"; op: string; a: number; b: number; merge?: { kind: "redir"; text: string } | { kind: "heredoc"; hd: OwnedHeredoc } }
  | { t: "target"; a: number; b: number; ta: number; tb: number }
  | { t: "delim"; a: number; b: number; ta: number; tb: number; hd?: OwnedHeredoc };

export interface OwnedHeredoc extends HeredocBody {
  n: number;
  raw: string;
  consumed?: boolean;
}

/**
 * Tokenize one semicolon part into commands, operators, redirect targets,
 * and heredoc delimiters. Redirect targets and heredoc delimiters are
 * attached to their operator by the model stage, not here.
 */
export function tokenizeParts(src: string, a: number, b: number): TokenItem[] {
  const items: TokenItem[] = [];
  let i = a;
  let cur: number | null = null;
  const q_ = { q: null as string | null, depth: 0, esc: false };
  const isOp = (): string | null => {
    if (q_.q || q_.depth > 0) return null;
    for (const o of OPS) if (src.startsWith(o, i)) return o;
    return null;
  };
  const closeCmd = (e: number): void => {
    if (cur !== null) {
      let ta = cur;
      let tb = e;
      while (ta < tb && /\s/.test(src[ta])) ta++;
      while (tb > ta && /\s/.test(src[tb - 1])) tb--;
      if (tb > ta) items.push({ t: "cmd", a: cur, b: e, ta, tb });
      cur = null;
    }
  };
  while (i < b) {
    const c = src[i];
    if (q_.esc) {
      q_.esc = false;
      i++;
      continue;
    }
    if (q_.q) {
      if (c === "\\" && q_.q !== "'") q_.esc = true;
      else if (c === q_.q) q_.q = null;
      i++;
      continue;
    }
    if (c === "\\") {
      q_.esc = true;
      i++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") {
      if (cur === null) cur = i;
      q_.q = c;
      i++;
      continue;
    }
    if (c === "$" && (src[i + 1] === "(" || src[i + 1] === "{")) {
      if (cur === null) cur = i;
      q_.depth++;
      i += 2;
      continue;
    }
    if (c === "(" || c === "{") {
      if (cur === null) cur = i;
      q_.depth++;
      i++;
      continue;
    }
    if ((c === ")" || c === "}") && q_.depth > 0) {
      q_.depth--;
      i++;
      continue;
    }
    if (q_.depth === 0 && /\s/.test(c)) {
      i++;
      continue;
    }
    const o = isOp();
    if (o) {
      closeCmd(i);
      if (o === ">" || o === ">>" || o === "<") {
        items.push({ t: "op", op: o, a: i, b: i + o.length });
        i += o.length;
        while (i < b && /\s/.test(src[i])) i++;
        const s = i;
        let qq: string | null = null;
        let e2 = false;
        while (i < b) {
          const d = src[i];
          if (e2) {
            e2 = false;
            i++;
            continue;
          }
          if (qq) {
            if (d === "\\" && qq !== "'") e2 = true;
            else if (d === qq) qq = null;
            i++;
            continue;
          }
          if (d === "\\" && qq === null) {
            e2 = true;
            i++;
            continue;
          }
          if (d === "'" || d === '"') {
            qq = d;
            i++;
            continue;
          }
          if (/\s/.test(d)) break;
          if ("><|&;".includes(d)) break;
          i++;
        }
        let ta = s;
        let tb = i;
        while (ta < tb && /\s/.test(src[ta])) ta++;
        while (tb > ta && /\s/.test(src[tb - 1])) tb--;
        if (tb > ta) items.push({ t: "target", a: s, b: i, ta, tb });
        continue;
      }
      if (o === "<<" || o === "<<-") {
        items.push({ t: "op", op: "<<", a: i, b: i + o.length });
        i += o.length;
        while (i < b && /\s/.test(src[i])) i++;
        const s = i;
        if (src[i] === "'" || src[i] === '"') {
          const qq = src[i];
          i++;
          while (i < b && src[i] !== qq) i++;
          i++;
        } else while (i < b && /[A-Za-z0-9_]+/.test(src[i]) && !/\s/.test(src[i])) i++;
        items.push({ t: "delim", a: s, b: i, ta: s, tb: i });
        continue;
      }
      items.push({ t: "op", op: o, a: i, b: i + o.length });
      i += o.length;
      continue;
    }
    // A bare & at depth 0 outside quotes is the background operator (ticket
    // #181). &&, 2>&1, 1>&2 and &> already matched above via OPS, so what
    // reaches here is exactly one &: backgrounding, never sequencing.
    if (!q_.q && q_.depth === 0 && c === "&" && src[i + 1] !== "&" && src[i - 1] !== "&") {
      closeCmd(i);
      items.push({ t: "op", op: "&", a: i, b: i + 1 });
      i++;
      continue;
    }
    if (cur === null) cur = i;
    i++;
  }
  closeCmd(b);
  return items;
}

export type GroupTag =
  | { kind: "kw"; kw: string }
  | { kind: "subshell" }
  | { kind: "brace" }
  | { kind: "function" };

/** Detect block openers (for/while/if/case, subshell, brace, function). */
export function detectGroup(src: string, ta: number, tb: number): GroupTag | null {
  const head = src.slice(ta, Math.min(tb, ta + 24));
  const m = /^\s*(for|while|until|select|if|case)\b/.exec(head);
  if (m) return { kind: "kw", kw: m[1] };
  if (/^\s*\(/.test(head)) return { kind: "subshell" };
  if (/^\s*\{/.test(head)) return { kind: "brace" };
  if (/^\s*\w[\w-]*\s*\(\)/.test(src.slice(ta, tb))) return { kind: "function" };
  return null;
}

export interface TestDescriptor {
  op1: string;
  mid: string;
  op2: string | null;
}

/**
 * Read a [ or [[ test as a condition (round 13.3). THE RULE: paraphrase ONLY
 * where the paraphrase is EXACTLY equivalent to the operator semantics;
 * anything unproven returns null and renders as today's verbatim slice,
 * never as a guess. The OPERAND stays a verbatim slice; only the surrounding
 * words are generated. [ and [[ are DIFFERENT languages: =/== pattern-match
 * inside [[ but compare plain strings inside [. Deliberately unsupported
 * (all degrade to verbatim): ! negation, -a/-o, -nt/-ot/-ef, && || parens
 * inside [[ ]], == and =~ inside [, -v -t and the special bits, missing or
 * joined brackets, unterminated quotes. -s renders "is non-empty?", NOT "is
 * a non-empty file?": [ -s somedir ] is TRUE for most directories, so the
 * file-wording would read FALSE where the source is TRUE. -s and -n render
 * identically (each paraphrase exact, the distinction lost: stated, not
 * hidden). Pure string in, descriptor or null out.
 */
export function parseTest(raw: string): TestDescriptor | null {
  const mOpen = /^\s*(\[\[?)\s+/.exec(raw);
  if (!mOpen) return null;
  const dbl = mOpen[1] === "[[";
  const endRe = dbl ? /\s+\]\]\s*$/ : /\s+\]\s*$/;
  if (!endRe.test(raw)) return null;
  const inner = raw.slice(mOpen[0].length).replace(endRe, "");
  const toks: string[] = [];
  let i = 0;
  let cur = "";
  let q: string | null = null;
  let closed = true;
  const push = (): void => {
    toks.push(cur);
    cur = "";
  };
  while (i < inner.length) {
    const c = inner[i];
    if (q) {
      cur += c;
      if (c === "\\" && q === '"' && i + 1 < inner.length) {
        cur += inner[i + 1];
        i += 2;
        continue;
      }
      if (c === q) q = null;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      q = c;
      cur += c;
      i++;
      continue;
    }
    if (c === "\\") {
      cur += c;
      if (i + 1 < inner.length) cur += inner[i + 1];
      i += 2;
      continue;
    }
    if (/\s/.test(c)) {
      if (cur !== "") push();
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (q) closed = false;
  if (cur !== "") push();
  if (!closed || !toks.length) return null;
  const U: Record<string, string> = {
    "-e": "exists?",
    "-f": "is a file?",
    "-d": "is a directory?",
    "-L": "is a symlink?",
    "-h": "is a symlink?",
    "-r": "is readable?",
    "-w": "is writable?",
    "-x": "is executable?",
    "-s": "is non-empty?",
    "-z": "is empty?",
    "-n": "is non-empty?",
  };
  const BNUM: Record<string, string> = {
    "-eq": "is numerically equal to",
    "-ne": "is numerically different from",
    "-lt": "is numerically less than",
    "-le": "is numerically at most",
    "-gt": "is numerically greater than",
    "-ge": "is numerically at least",
  };
  if (toks.length === 2 && U[toks[0]]) return { op1: toks[1], mid: U[toks[0]], op2: null };
  if (toks.length === 3) {
    if (!dbl && toks[1] === "=") return { op1: toks[0], mid: "equals", op2: toks[2] };
    if (!dbl && toks[1] === "!=") return { op1: toks[0], mid: "is not equal to", op2: toks[2] };
    if (dbl && (toks[1] === "=" || toks[1] === "=="))
      return { op1: toks[0], mid: "matches the pattern", op2: toks[2] };
    if (dbl && toks[1] === "!=") return { op1: toks[0], mid: "does not match the pattern", op2: toks[2] };
    if (dbl && toks[1] === "=~") return { op1: toks[0], mid: "matches the regex", op2: toks[2] };
    if (BNUM[toks[1]]) return { op1: toks[0], mid: BNUM[toks[1]], op2: toks[2] };
  }
  return null;
}

/**
 * Render a test descriptor. Operands stay code-styled verbatim slices
 * (seg-wrapped: counted in the unbreakable-run minimum, breaking only after
 * slashes); generated words render in .test-word (prose-styled, never
 * code-styled) so no reader mistakes a claim for a quote.
 */
export function testBodyHTML(d: TestDescriptor): string {
  const W = (s: string): string => `<span class="test-word">${esc(s)}</span>`;
  if (d.op2 == null) return `<code>${segHTML(d.op1)}</code> ${W(d.mid)}`;
  return `<code>${segHTML(d.op1)}</code> ${W(d.mid)} <code>${segHTML(d.op2)}</code>${W("?")}`;
}

export interface ArgBody {
  id: string;
  flag: string | null;
  chars: number;
  lines: number;
  body: string;
}

export interface ArgSeq {
  n: number;
}

/**
 * Extract long quoted args to pills (round 7.1). Quoted spans longer than
 * ARG_T leave the inline body and render as compact badges: verbatim front
 * slice plus counts on the label, full text expandable below the panel. The
 * extraction CONSUMES a directly-attached -f/--flag along with its quoted
 * value, so the flag reads once (on the pill) instead of inline AND on the
 * pill. Appends full bodies to argBodies; returns the inline HTML and the
 * extracted count. A test command with extracted args stays verbatim, so
 * this design is never bypassed by interpretation.
 */
export function extractArgs(
  src: string,
  ta: number,
  tb: number,
  idx: number,
  seq: ArgSeq,
  argBodies: ArgBody[],
): { html: string; count: number } {
  const spans: { a: number; b: number }[] = [];
  let i = ta;
  let sub = 0;
  while (i < tb) {
    const c = src[i];
    if (c === "$" && (src[i + 1] === "(" || src[i + 1] === "{")) {
      sub++;
      i += 2;
      continue;
    }
    if ((c === ")" || c === "}") && sub > 0) {
      sub--;
      i++;
      continue;
    }
    if (sub === 0 && (c === "'" || c === '"')) {
      const q = c;
      let j = i + 1;
      let isEsc = false;
      let closed = false;
      while (j < tb) {
        const d = src[j];
        if (isEsc) {
          isEsc = false;
          j++;
          continue;
        }
        if (d === "\\" && q === '"') {
          isEsc = true;
          j++;
          continue;
        }
        if (d === q) {
          closed = true;
          break;
        }
        j++;
      }
      if (closed) {
        if (j - (i + 1) > ARG_T) spans.push({ a: i, b: j + 1 });
        i = j + 1;
        continue;
      }
      i++;
      continue;
    }
    i++;
  }
  let html = "";
  let pos = ta;
  for (const s of spans) {
    const fm = /(--[A-Za-z][\w-]*|-[A-Za-z])(\s*)$/.exec(SL(src, ta, s.a));
    const flag = fm ? fm[1] : null;
    const fa = fm ? s.a - fm[0].length : s.a;
    if (fa > pos) html += hlCmd(src, pos, fa, false).html;
    const bodyText = SL(src, fa, s.b);
    const inner = SL(src, s.a + 1, s.b - 1);
    const lines = countLines(inner) || 1;
    const id = `a${idx}_${seq.n++}`;
    let front = inner.slice(0, 48);
    if (inner.length > 48) {
      const sp = front.lastIndexOf(" ");
      if (sp > 20) front = front.slice(0, sp);
    }
    const unitLen = s.b - fa;
    const label =
      (flag ? flag + " " : "") +
      `'${front}${inner.length > front.length ? "…" : ""}' · ${unitLen}ch · ${lines} line${lines > 1 ? "s" : ""}`;
    html += `<button class="prim-badge" data-arg="${id}" aria-expanded="false" title="quoted argument${flag ? ` to ${flag}` : ""} · verbatim front slice, activate to expand below the panel."><span class="pill-label">${esc(label)}</span></button>`;
    argBodies.push({ id, flag, chars: unitLen, lines, body: bodyText });
    pos = s.b;
  }
  if (pos < tb) html += hlCmd(src, pos, tb, false).html;
  return { html, count: spans.length };
}

export interface UnbashScan {
  status: string;
  nodes: { type: string; pos: number; end: number }[];
}

/**
 * Scan with the production parser (unbash, same library as the prototype
 * and as bash-diagram.ts). Returns positioned nodes from a generic walk:
 * anything with a string type/kind plus a numeric pos/end span. Never
 * throws: on any failure it reports stable-unavailable and the scanner
 * stands alone (the harness verified the corpus on exactly that path).
 *
 * Port note: the prototype reaches unbash through a CDN dynamic import; the
 * fair copy imports it statically, following the production precedent
 * (bash-diagram.ts). Same library, same version line, same adopted-spans
 * relationship. No parser is swapped and none is added.
 */
export async function unbashScan(src: string): Promise<UnbashScan> {
  try {
    if (typeof parse !== "function") return { status: "no parse() export", nodes: [] };
    const ast = parse(src);
    const nodes: { type: string; pos: number; end: number }[] = [];
    const seen = new Set<unknown>();
    (function walk(v: unknown): void {
      if (!v || typeof v !== "object") return;
      if (seen.has(v)) return;
      seen.add(v);
      const rec = v as Record<string, unknown>;
      const t =
        typeof rec.type === "string" ? rec.type : typeof rec.kind === "string" ? rec.kind : null;
      const p =
        typeof rec.pos === "number" ? rec.pos : typeof rec.start === "number" ? rec.start : null;
      const e =
        typeof rec.end === "number" ? rec.end : typeof rec.stop === "number" ? rec.stop : null;
      if (t && typeof p === "number" && typeof e === "number" && e > p)
        nodes.push({ type: t, pos: p, end: e });
      if (Array.isArray(v)) {
        for (const x of v) walk(x);
        return;
      }
      for (const k in v) {
        if (k === "pos" || k === "end" || k === "start" || k === "type" || k === "kind") continue;
        try {
          walk(rec[k]);
        } catch {
          /* keep walking */
        }
      }
    })(ast);
    return { status: "ok", nodes };
  } catch {
    return { status: "stable-unavailable", nodes: [] };
  }
}

export interface AdoptableSpan {
  ta: number;
  tb: number;
}

/**
 * The criterion-1 guard (ticket #181): TRUE when the adopted span (a1, b1)
 * covers less non-whitespace text than the scanner span (a0, b0), meaning the
 * adoption dropped source text the picture would then silently deny. Adoption
 * may only ever trim whitespace (the tokenizer already trims, so on the
 * proven corpus this never fires); narrowing past a paren, a pipe, an
 * operand or a heredoc opener is the bug, and it is detectable here in
 * general rather than per shape. The caller keeps the scanner span on TRUE.
 *
 * adoptSpans itself stays a byte-exact port of the prototype (the
 * equivalence proof pins it): the enforcement lives in the model stage,
 * which snapshots each span, adopts, and restores on TRUE.
 */
export function adoptionLosesText(
  src: string,
  a0: number,
  b0: number,
  a1: number,
  b1: number,
): boolean {
  const nonWs = (a: number, b: number): number => {
    let n = 0;
    for (let i = a; i < b; i++) if (!/\s/.test(src[i])) n++;
    return n;
  };
  return nonWs(a1, b1) < nonWs(a0, b0);
}

/**
 * Adopt unbash spans (the card header reads "parse: unbash, adopted N
 * spans"). For each scanner command span, the nearest command-like unbash
 * node within 2px snaps the span (end clamped to the scanner span). Only
 * command-like types count; list/pipeline/script/compound/word/redirect and
 * expansion types never match. Returns the adopted and candidate counts.
 */
export function adoptSpans(
  src: string,
  cmds: AdoptableSpan[],
  ub: UnbashScan,
): { adopted: number; total: number } {
  void src;
  if (ub.status !== "ok" || !ub.nodes.length) return { adopted: 0, total: 0 };
  const like = ub.nodes.filter(
    (n) =>
      /command/i.test(n.type) &&
      !/list|pipeline|script|program|compound|clause|file|word|redirect|expansion/i.test(n.type),
  );
  let adopted = 0;
  for (const c of cmds) {
    const hit = like.find((n) => Math.abs(n.pos - c.ta) <= 2 && n.end <= c.tb + 2 && n.end > n.pos);
    if (hit) {
      c.ta = hit.pos;
      c.tb = Math.min(hit.end, c.tb);
      adopted++;
    }
  }
  return { adopted, total: like.length };
}
