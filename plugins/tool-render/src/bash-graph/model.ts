// Model: tokens become nodes, chips, edges, and pills.
//
// The seam this module owns: PARSE (offsets) -> MODEL (nodes, chips, edges,
// pills) -> MEASURE -> LAYOUT -> RENDER. The model is data plus node HTML;
// measurement fills widths later, layout splits rows, render draws.
//
// Reading order (round 9.2, amends round 7.4; same dataflow, opposite
// seating): inputs (<, << heredoc) render AFTER their command; the edge
// between them runs right-to-left with the head at the command end, so the
// picture still says "this flows into that". Within each stage (runs between
// |, &&, ||): the first command leads, then its inputs in source order, then
// everything else in source order. Outputs are NOT commutative among
// themselves (>file 2>&1 differs from 2>&1 >file), so they never move
// relative to each other, only after the input block as a whole. Stages
// without a command, and single-operator breaker stages, keep source order.
// Render order only: every span below is still a verbatim (a,b) slice, and
// show-original is src itself.
//
// Conditionals versus pipes (round 8.4, owner decision): a conditional (&&,
// ||) is a property OF the command it governs, so the op node is consumed
// into a prefix chip on the DEPENDENT (right-hand) card; a base command that
// runs unconditionally never carries one. A pipe (|, including the fused
// 2>&1|) is a relationship BETWEEN two commands, so the op node is consumed
// into a tagged link: one continuous edge with the glyph inline and a single
// arrowhead at the target. A bare 2>&1 (no pipe) is an output property of
// its own command and stays a node. Degenerate strays (leading, trailing, or
// doubled operators, invalid shell) keep their node. Spans untouched.

import { NODE_M, OP_W, SHORT_T } from "./constants.js";
import { Badge, CMD_ICON, OP_ICON, OP_MEANING, Node, chipHTML, Icon } from "./primitives.js";
import {
  adoptSpans,
  adoptionLosesText,
  detectGroup,
  extractArgs,
  parseTest,
  testBodyHTML,
  type AdoptableSpan,
  type ArgBody,
  type ArgSeq,
  type GroupTag,
  type HeredocBody,
  type OwnedHeredoc,
  type TokenItem,
  type UnbashScan,
} from "./parse.js";
import { SL, cmdNameOf, esc, segHTML } from "./text.js";
import { sizeFor } from "./constants.js";
import type { SizeStep } from "./constants.js";

export interface ModelChip {
  sym: string;
  meaning: string;
}

interface CmdNode {
  kind: "cmd";
  key: string;
  hl?: string;
  len?: number;
  sz?: SizeStep | null;
  name?: string;
  grp?: GroupTag | null;
  hd?: OwnedHeredoc[];
  test?: number;
  chip?: ModelChip;
  incoming?: string;
  /**
   * Per-stage exit code, ticket #180 seam. Set ONLY by attributePipeStages
   * (through attributeFinalSegment), never at
   * build: the code arrives from the tool result after the command runs, so
   * no corpus of source text can supply it. Undefined renders exactly as
   * before (the dock string is unchanged), which is what keeps the
   * equivalence proof byte-identical.
   */
  exitCode?: number;
}

interface RedirNode {
  kind: "redir";
  key: string;
  op?: string;
  text?: string;
  sz?: SizeStep | null;
  chip?: ModelChip;
  incoming?: string;
}

interface HeredocNode {
  kind: "heredoc";
  key: string;
  hd: OwnedHeredoc;
  chip?: ModelChip;
  incoming?: string;
}

interface OpNode {
  kind: "op";
  key: string;
  op?: string;
  sym?: string;
  a?: number;
  b?: number;
  fused?: boolean;
  chip?: ModelChip;
  incoming?: string;
}

interface StrayNode {
  kind: "chip";
  key: string;
  text?: string;
  chip?: ModelChip;
  incoming?: string;
}

export type ModelNode = CmdNode | RedirNode | HeredocNode | OpNode | StrayNode;

export type SegLinkKind = "chip" | "pipe" | "pipe-fused" | "stdin" | "flow";

export interface NodeSpec {
  id: string;
  flex: boolean;
  sk: string;
  w: number;
  h: number;
  html: string;
  nat?: number;
  minw?: number;
  gapAfter?: number;
}

/** Per-command build context, threaded through segments. */
export interface BuildContext {
  idx: number;
  hdN: { n: number };
  argSeq: ArgSeq;
  argBodies: ArgBody[];
  adopted: { n: number };
  counts: {
    nCmd: number;
    nOp: number;
    nRedir: number;
    nHd: number;
    nArg: number;
    nChip: number;
    nPipe: number;
  };
  maxSeg: { n: number };
}

export function makeBuildContext(idx: number): BuildContext {
  return {
    idx,
    hdN: { n: 0 },
    argSeq: { n: 0 },
    argBodies: [],
    adopted: { n: 0 },
    counts: { nCmd: 0, nOp: 0, nRedir: 0, nHd: 0, nArg: 0, nChip: 0, nPipe: 0 },
    maxSeg: { n: 0 },
  };
}

export interface DelimItem {
  item: TokenItem;
  hd: OwnedHeredoc | null;
}

/**
 * The head of a segment for the compound rule (ticket #187): the first
 * command token, seen through the negation and time prefixes the renderer
 * keeps as verbatim text, so `! if ...; fi` degrades like `if ...; fi`.
 * Anything else (a mid-segment compound after &&) keeps the normal path:
 * its terminator rides inside one command slice, never as its own node.
 */
function compoundHead(src: string, ta: number, tb: number): GroupTag | null {
  const m = /^(?:!\s*|time\s+)+/.exec(SL(src, ta, tb));
  const off = m ? m[0].length : 0;
  return detectGroup(src, ta + off, tb);
}

/**
 * Build model nodes for one semicolon segment. Attaches heredoc bodies to
 * their delimiters, merges redirect targets and heredoc delimiters into
 * their operators, reorders inputs after their command, fuses 2>&1 |
 * (round 7.5: one idea, one node carrying the verbatim covered slice as its
 * symbol; a bare 2>&1 keeps its own node), and consumes conditionals and
 * pipes into chips and tagged links. Returns the nodes plus the segLinks map
 * (from-node-key + ">" + to-node-key to link kind).
 */
export function buildNodes(
  src: string,
  items: TokenItem[],
  line: { heredocs: HeredocBody[] },
  segKeys: { li: number; si: number },
  ub: UnbashScan,
  ctx: BuildContext,
  delimBase = 0,
): { nodes: ModelNode[]; segLinks: Map<string, SegLinkKind>; hdItems: DelimItem[] } {
  const { idx, counts, maxSeg } = ctx;
  const { li, si } = segKeys;
  const cmds = items.filter((t): t is TokenItem & AdoptableSpan => t.t === "cmd");
  const before = cmds.map((c) => ({ c, ta: c.ta, tb: c.tb }));
  const r = adoptSpans(src, cmds, ub);
  // Ticket #181, the rule that matters: an adoption that narrows past dropped
  // non-whitespace text is restored to the scanner span, so the real-scan
  // path renders what the stub path renders (full text plus group badge)
  // instead of a confident picture of a different command. Telemetry counts
  // kept adoptions: the prototype count minus the restorations.
  let restored = 0;
  for (const s of before) {
    if (adoptionLosesText(src, s.ta, s.tb, s.c.ta, s.c.tb)) {
      s.c.ta = s.ta;
      s.c.tb = s.tb;
      restored++;
    }
  }
  ctx.adopted.n += r.adopted - restored;
  const hdItems: DelimItem[] = items
    .filter((t) => t.t === "delim")
    .map((d) => {
      if (d.t !== "delim") return { item: d, hd: null };
      // Ticket #181: delims are indexed across the whole LINE (delimBase
      // counts this line's earlier segments), never per segment: per-segment
      // indexing attached one command's heredoc body to another command.
      // The name check below is the backstop: on any scanner/model
      // disagreement the body stays unattached (stray chip plus its
      // expandable block, all text shown) rather than misattributed.
      const hb = line.heredocs[delimBase + hdItemsCount(items, d)];
      if (hb) {
        const raw = SL(src, d.ta, d.tb);
        const bare =
          raw.length >= 2 &&
          ((raw[0] === "'" && raw[raw.length - 1] === "'") ||
            (raw[0] === '"' && raw[raw.length - 1] === '"'))
            ? raw.slice(1, -1)
            : raw;
        if (bare === hb.delim) {
          const owned: OwnedHeredoc = {
            ...hb,
            n: ++ctx.hdN.n,
            raw,
          };
          (d as { hd?: OwnedHeredoc }).hd = owned;
          return { item: d, hd: owned };
        }
      }
      return { item: d, hd: null };
    });
  // Ticket #181: backgrounding is concurrency, never sequence. A segment
  // carrying a bare & degrades to one verbatim node over the full span: all
  // text shown, no edge drawn, no order claimed. Heredoc bodies still ride
  // along below the panel through hdItems, so nothing is hidden either.
  if (items.some((t) => t.t === "op" && t.op === "&")) {
    let ta = items[0].a;
    let tb = items[items.length - 1].b;
    while (ta < tb && /\s/.test(src[ta])) ta++;
    while (tb > ta && /\s/.test(src[tb - 1])) tb--;
    const ex = extractArgs(src, ta, tb, idx, ctx.argSeq, ctx.argBodies);
    counts.nArg += ex.count;
    const len = tb - ta;
    if (len > maxSeg.n) maxSeg.n = len;
    counts.nCmd++;
    const key = "n" + idx + "_" + li + "_" + si + "_verb";
    return {
      nodes: [
        {
          kind: "cmd",
          key,
          hl: ex.html,
          len,
          sz: sizeFor(len),
          name: cmdNameOf(src, { ta, tb }),
          grp: detectGroup(src, ta, tb),
          hd: [],
          test: 0,
        },
      ],
      segLinks: new Map(),
      hdItems,
    };
  }
  // Ticket #187: a compound command degrades to one verbatim node over the
  // full segment span, the same choice #181 made for backgrounding, for the
  // same reason. The splitter keeps the construct in one segment, so a
  // leading opener means the whole construct arrived intact: drawing its
  // body operators as chips or pipe links would invent dataflow between
  // statements that are not siblings, and drawing the terminator as a
  // command claims the user typed a command they never typed. All text is
  // shown, no edge is drawn, no order is claimed. Heredoc bodies still ride
  // along below the panel through hdItems, so nothing is hidden either.
  // The group badge survives: the renderer knew it was looking at a
  // compound, and saying so is true.
  const firstCmd = items.find((t) => t.t === "cmd");
  if (firstCmd && firstCmd.t === "cmd") {
    const grp0 = compoundHead(src, firstCmd.ta, firstCmd.tb);
    if (grp0 && grp0.kind === "kw") {
      let ta = items[0].a;
      let tb = items[items.length - 1].b;
      while (ta < tb && /\s/.test(src[ta])) ta++;
      while (tb > ta && /\s/.test(src[tb - 1])) tb--;
      const ex = extractArgs(src, ta, tb, idx, ctx.argSeq, ctx.argBodies);
      counts.nArg += ex.count;
      const len = tb - ta;
      if (len > maxSeg.n) maxSeg.n = len;
      counts.nCmd++;
      const key = "n" + idx + "_" + li + "_" + si + "_verb";
      return {
        nodes: [
          {
            kind: "cmd",
            key,
            hl: ex.html,
            len,
            sz: sizeFor(len),
            name: cmdNameOf(src, { ta, tb }),
            grp: grp0,
            hd: [],
            test: 0,
          },
        ],
        segLinks: new Map(),
        hdItems,
      };
    }
  }
  const nodes: ModelNode[] = [];
  const skip = new Set<number>();
  items.forEach((t, k) => {
    if (
      t.t === "op" &&
      (t.op === ">" || t.op === ">>" || t.op === "<") &&
      items[k + 1] &&
      items[k + 1].t === "target"
    ) {
      const tgt = items[k + 1];
      if (tgt.t !== "target") return;
      skip.add(k + 1);
      (t as { merge?: unknown }).merge = { kind: "redir", text: SL(src, tgt.ta, tgt.tb) };
    } else if (
      t.t === "op" &&
      t.op === "<<" &&
      items[k + 1] &&
      items[k + 1].t === "delim" &&
      (items[k + 1] as { hd?: OwnedHeredoc }).hd
    ) {
      const d = items[k + 1] as { hd?: OwnedHeredoc };
      skip.add(k + 1);
      if (d.hd) d.hd.consumed = true;
      (t as { merge?: unknown }).merge = { kind: "heredoc", hd: d.hd };
    }
  });
  items.forEach((t, k) => {
    if (skip.has(k)) return;
    if (t.t === "cmd") {
      const ex = extractArgs(src, t.ta, t.tb, idx, ctx.argSeq, ctx.argBodies);
      counts.nArg += ex.count;
      const len = t.tb - t.ta;
      if (len > maxSeg.n) maxSeg.n = len;
      const sz = sizeFor(len);
      counts.nCmd++;
      const nm = cmdNameOf(src, t);
      const grp = detectGroup(src, t.ta, t.tb);
      // A test command with no extracted pills renders interpreted
      // (parseTest returns null for anything unproven: verbatim ex.html).
      // Length, size, flex, name, and chip paths are untouched: sizing stays
      // conservative at full-slice length, chips still attach, reconstruct
      // still slices.
      const tst = ex.count === 0 ? parseTest(SL(src, t.ta, t.tb)) : null;
      const owned = hdItems
        .filter((d) => {
          if (!d.hd || d.hd.consumed) return false;
          const di = items.indexOf(d.item);
          if (di < k) return false;
          for (let q = k + 1; q < di; q++) if (items[q].t === "cmd") return false;
          return true;
        })
        .map((d) => d.hd as OwnedHeredoc);
      nodes.push({
        kind: "cmd",
        key: "n" + idx + "_" + li + "_" + si + "_" + k,
        hl: tst ? testBodyHTML(tst) : ex.html,
        len,
        sz,
        name: nm,
        grp,
        hd: owned,
        test: tst ? 1 : 0,
      });
    } else if (t.t === "op" && (t as { merge?: { kind: string } }).merge) {
      const merge = (t as unknown as { merge: { kind: string; text?: string; hd?: OwnedHeredoc } })
        .merge;
      if (merge.kind === "redir") {
        counts.nOp++;
        counts.nRedir++;
        const sz = sizeFor(t.op.length + 1 + (merge.text ?? "").length) || { key: "breakout", w: 680, max: 0 };
        nodes.push({
          kind: "redir",
          key: "n" + idx + "_" + li + "_" + si + "_" + k,
          op: t.op,
          text: merge.text,
          sz,
        });
      } else if (merge.kind === "heredoc") {
        counts.nOp++;
        counts.nHd++;
        nodes.push({
          kind: "heredoc",
          key: "n" + idx + "_" + li + "_" + si + "_" + k,
          hd: merge.hd as OwnedHeredoc,
        });
      }
    } else if (t.t === "op") {
      counts.nOp++;
      nodes.push({ kind: "op", key: "n" + idx + "_" + li + "_" + si + "_" + k, op: t.op, a: t.a, b: t.b });
    } else if (t.t === "target") {
      nodes.push({ kind: "chip", key: "n" + idx + "_" + li + "_" + si + "_" + k, text: SL(src, t.ta, t.tb) });
    } else if (t.t === "delim") {
      if (!(t as { hd?: OwnedHeredoc }).hd || !(t as { hd?: OwnedHeredoc }).hd?.consumed)
        nodes.push({ kind: "chip", key: "n" + idx + "_" + li + "_" + si + "_" + k, text: SL(src, t.ta, t.tb) });
    }
  });
  reorderInputs(nodes);
  fuseMergePipe(src, nodes);
  const segLinks = consumeOperators(src, nodes, counts);
  return { nodes, segLinks, hdItems };
}

function hdItemsCount(items: TokenItem[], d: TokenItem): number {
  let n = 0;
  for (const t of items) {
    if (t === d) return n;
    if (t.t === "delim") n++;
  }
  return n;
}

/** Round 9.2 input reorder: command first, then inputs, then the rest. */
function reorderInputs(nodes: ModelNode[]): void {
  const isIn = (n: ModelNode): boolean =>
    n.kind === "heredoc" || (n.kind === "redir" && n.op === "<");
  const isBrk = (n: ModelNode): boolean =>
    n.kind === "op" && (n.op === "|" || n.op === "&&" || n.op === "||");
  const st: ModelNode[][] = [[]];
  for (const n of nodes) {
    if (isBrk(n)) {
      st.push([n]);
      st.push([]);
    } else st[st.length - 1].push(n);
  }
  nodes.length = 0;
  for (const s of st) {
    const ci = s.findIndex((n) => n.kind === "cmd");
    if (ci < 0) {
      for (const n of s) nodes.push(n);
      continue;
    }
    nodes.push(s[ci]);
    for (let i = 0; i < s.length; i++) if (i !== ci && isIn(s[i])) nodes.push(s[i]);
    for (let i = 0; i < s.length; i++) if (i !== ci && !isIn(s[i])) nodes.push(s[i]);
  }
}

/** Round 7.5 fuse: a 2>&1 DIRECTLY followed by a pipe is one node. */
function fuseMergePipe(src: string, nodes: ModelNode[]): void {
  for (let fi = 0; fi + 1 < nodes.length; fi++) {
    const fa = nodes[fi];
    const fb = nodes[fi + 1];
    if (fa.kind === "op" && fa.op === "2>&1" && fb.kind === "op" && fb.op === "|") {
      nodes.splice(fi, 2, {
        kind: "op",
        key: fa.key + "+" + ((fb.key.match(/(\d+)$/) || [])[1] ?? ""),
        op: "2>&1 |",
        sym: SL(src, fa.a ?? 0, fb.b ?? 0),
        a: fa.a,
        b: fb.b,
        fused: true,
      });
    }
  }
}

/**
 * Consume conditionals into prefix chips and pipes into tagged links.
 * An input sitting right after its command is a "stdin" link (drawn
 * reversed, head at the command end); everything else between dataflow
 * neighbours is "flow". Hooks across row breaks always follow reading
 * direction whatever the link.
 */
function consumeOperators(
  src: string,
  nodes: ModelNode[],
  counts: BuildContext["counts"],
): Map<string, SegLinkKind> {
  const segLinks = new Map<string, SegLinkKind>();
  const out: ModelNode[] = [];
  const cmdish = (t: ModelNode | undefined): boolean =>
    !!t && (t.kind === "cmd" || t.kind === "redir" || t.kind === "heredoc");
  for (let ci = 0; ci < nodes.length; ci++) {
    const n = nodes[ci];
    if (n.kind === "op" && (n.op === "&&" || n.op === "||") && cmdish(nodes[ci + 1])) {
      const t = nodes[ci + 1];
      t.chip = { sym: SL(src, n.a ?? 0, n.b ?? 0), meaning: OP_MEANING[n.op ?? ""] || n.op };
      t.incoming = "chip";
      counts.nChip++;
      if (out.length) segLinks.set(out[out.length - 1].key + ">" + t.key, "chip");
      continue;
    }
    if (n.kind === "op" && (n.op === "|" || n.op === "2>&1 |") && out.length && cmdish(nodes[ci + 1])) {
      const t = nodes[ci + 1];
      t.incoming = n.op === "|" ? "pipe" : "pipe-fused";
      counts.nPipe++;
      segLinks.set(out[out.length - 1].key + ">" + t.key, t.incoming as SegLinkKind);
      continue;
    }
    if (out.length && !segLinks.has(out[out.length - 1].key + ">" + n.key)) {
      const A = out[out.length - 1];
      const isStdin = n.kind === "heredoc" || (n.kind === "redir" && n.op === "<");
      segLinks.set(A.key + ">" + n.key, isStdin && A.kind === "cmd" ? "stdin" : "flow");
    }
    out.push(n);
  }
  nodes.length = 0;
  for (const n of out) nodes.push(n);
  return segLinks;
}

/**
 * Exit-code pill for one command card, ticket #180 seam. The treatment
 * ports client.tsx:1441-1471 verbatim in meaning: the text is always
 * "exit N", the failed title carries "(failed)", the ok title names code 0.
 * The classes are the fair copy's own badge vocabulary (prim-badge, with
 * the existing data-tone="error" rule for the failed state), because the
 * old tool-render-diagram-exit classes do not exist in styles.css. The pill
 * is a span, never a button: it expands nothing.
 */
export function exitBadgeHTML(code: number): string {
  const failed = code !== 0;
  const tip = failed ? "stage exit code " + code + " (failed)" : "stage exit code 0";
  return (
    `<span class="prim-badge"${failed ? ` data-tone="error"` : ""} title="${esc(tip)}">` +
    `exit ${code}</span>`
  );
}

/**
 * Port of attributePipeStages from bash-diagram.ts (ticket #180): decide
 * which stage a code belongs to, and refuse to attribute on any doubt.
 *
 * THE RULE, carried across unchanged: codes land positionally on the drawn
 * stages, and ONLY when pipeStages is an array whose length matches the
 * drawn stage count AND every entry is a non-null object carrying a
 * non-empty string `name` and an integer `exitCode`. Name absence is the
 * #142 disqualification signal (bash-guard emits bare {exitCode} entries
 * when it cannot attribute), and a backgrounded call carries no pipeStages
 * key at all. Any doubt leaves every code undefined rather than inventing
 * an attribution: a plausible-but-wrong code is worse than none.
 *
 * DEVIATION, forced by the new node model and stated plainly: the old
 * function counts STAGES (redirects ride inside their stage); here the
 * drawn stages of one segment are its CMD NODES (redirect, heredoc, op,
 * and stray nodes are not stages), so the length gate counts cmd nodes.
 * The function also does NOT string-compare entry names against drawn
 * command names: the old function never did either (it checks non-empty
 * only), because host-side naming (finalPipelineNaming) guarantees order
 * and alignment. Adding a comparison here would be a new rule, not a port.
 *
 * The input array is never mutated: the returned nodes are shallow copies,
 * like the old function's copied stages. Non-cmd nodes pass through as
 * copies without a code place.
 */
export function attributePipeStages(nodes: ModelNode[], pipeStages: unknown): ModelNode[] {
  const out: ModelNode[] = nodes.map((n) => ({ ...n }));
  const cmds = out.filter((n): n is CmdNode => n.kind === "cmd");
  for (const c of cmds) c.exitCode = undefined;
  if (Array.isArray(pipeStages) && pipeStages.length === cmds.length) {
    let ok = true;
    const codes: number[] = [];
    for (const entry of pipeStages) {
      if (
        entry === null ||
        typeof entry !== "object" ||
        typeof (entry as { name?: unknown }).name !== "string" ||
        ((entry as { name?: unknown }).name as string).length === 0 ||
        !Number.isInteger((entry as { exitCode?: unknown }).exitCode)
      ) {
        ok = false;
        break;
      }
      codes.push((entry as { exitCode: number }).exitCode);
    }
    if (ok) {
      for (let i = 0; i < cmds.length; i++) cmds[i].exitCode = codes[i];
    }
  }
  return out;
}

/**
 * The sequence gate for ONE segment, and the single expression of the
 * sequence rule: render.ts calls this for its current panel with isLast set
 * for the final one, so the rule lives in exactly one place. Codes reach only the FINAL
 * segment (PIPESTATUS holds the last pipeline only; earlier lines were
 * never captured), and never a segment carrying a conditional chip: in the
 * old model a conditional anywhere makes the final group a chain or a
 * text group, both uncoded, and naming is disqualified host-side for
 * conditional scripts. Here `&&`/`||` survive as prefix chips on the
 * dependent card, so any chip on any node of the final segment is that
 * disqualification in new-model terms.
 */
export function attributeFinalSegment(
  nodes: ModelNode[],
  pipeStages: unknown,
  isLast: boolean,
): ModelNode[] {
  if (!isLast) return nodes.map((n) => ({ ...n }));
  if (nodes.some((n) => n.chip)) return nodes.map((n) => ({ ...n }));
  return attributePipeStages(nodes, pipeStages);
}
/**
 * Build layout specs from model nodes. Widths are initial stylesheet widths;
 * the render stage fills nat/minw, assigns gapAfter from segLinks, and plans
 * rows. Short commands (raw slice at most SHORT_T) are inflexible: nowrap at
 * natural width, since wrapping them buys nothing and costs a row height.
 */
export function buildSpecs(src: string, nodes: ModelNode[], ctx: BuildContext): NodeSpec[] {
  void src;
  const { idx } = ctx;
  return nodes.map((nd) => {
    if (nd.kind === "cmd") {
      const iconName =
        CMD_ICON[nd.name ?? ""] || CMD_ICON[(nd.name ?? "").replace(/\d+$/, "")] || null;
      const dock =
        (nd.hd ?? [])
          .map(
            (h) =>
              `<button class="prim-badge" data-hd="${idx}_${h.n}" title="heredoc [${h.n}:${esc(h.raw)}] feeds ${h.lines} lines as input; the terminator line itself is not drawn. Click to expand below the panel.">&lt;&lt;${esc(h.raw)} [${h.n}:${h.lines}]</button>`,
          )
          .join("") +
        (nd.grp
          ? Badge(nd.grp.kind === "kw" ? "starts a " + (nd.grp as { kw: string }).kw : nd.grp.kind, "")
          : "") +
        (nd.exitCode !== undefined ? exitBadgeHTML(nd.exitCode) : "");
      const sizeKey = nd.sz ? nd.sz.key : "breakout";
      const w = nd.sz ? nd.sz.w : 680;
      return {
        id: nd.key,
        flex: (nd.len ?? 0) > SHORT_T,
        sk: sizeKey,
        w,
        h: 50,
        html: Node({
          size: sizeKey,
          icon: iconName ?? undefined,
          iconFb: nd.name ? nd.name[0] : "•",
          name: nd.name,
          bodyHTML: nd.hl,
          dockHTML: dock,
          chip: nd.chip,
        }),
      };
    }
    if (nd.kind === "redir") {
      const sz = (nd.sz as SizeStep) ?? { key: "breakout", w: 680, max: 0 };
      return {
        id: nd.key,
        flex: true,
        sk: sz.key,
        w: sz.w,
        h: 40,
        html: Node({
          size: sz.key,
          icon: OP_ICON[nd.op ?? ""] || "chevron-right",
          iconFb: nd.op,
          meaning: OP_MEANING[nd.op ?? ""],
          bodyHTML: `<span class="prim-chip">${segHTML(nd.text ?? "")}</span>`,
          chip: nd.chip,
        }),
      };
    }
    if (nd.kind === "heredoc") {
      const hh = nd.hd;
      // Short chip: operator plus VERBATIM delimiter (quoting kept: <<'X'
      // and <<X differ) plus [index:lines] in one bracket (round 8.2).
      const label = `<<${hh.raw} [${hh.n}:${hh.lines}]`;
      const tip = `heredoc [${hh.n}:${hh.raw}] feeds ${hh.lines} lines as input; the terminator line itself is not drawn. Activate to expand below the panel.`;
      const sk0 = sizeFor(label.length) || { key: "breakout", w: 680, max: 0 };
      return {
        id: nd.key,
        flex: false,
        sk: sk0.key,
        w: sk0.w,
        h: 50,
        html:
          `<button class="prim-node${nd.chip ? " has-chip" : ""}" data-size="${sk0.key}" data-hd="${idx}_${hh.n}" aria-expanded="false" title="${esc(tip)}">` +
          (nd.chip ? chipHTML(nd.chip.sym, nd.chip.meaning) : "") +
          (nd.chip ? `<span class="node-main">` : "") +
          `<span class="hd-pair">${Icon("scroll-text", "<<")}<span class="node-text"><code><span class="hd-label">${esc(label)}</span></code></span></span>` +
          (nd.chip ? `</span>` : "") +
          `</button>`,
      };
    }
    if (nd.kind === "op")
      return {
        id: nd.key,
        flex: false,
        sk: "op",
        w: OP_W + NODE_M * 2,
        h: 44,
        html: Node({
          op: nd.op,
          sym: nd.sym || nd.op,
          icon: OP_ICON[nd.op ?? ""] || "chevron-right",
          meaning: OP_MEANING[nd.op ?? ""] || nd.op,
          spin: nd.fused ? "rot90" : null,
        }),
      };
    const w = sizeFor((nd.text ?? "").length + 4);
    return {
      id: nd.key,
      flex: true,
      sk: w ? w.key : "breakout",
      w: w ? w.w : 400,
      h: 34,
      html: `<div class="prim-node" data-size="${w ? w.key : "breakout"}"><span class="prim-chip">${segHTML(nd.text ?? "")}</span></div>`,
    };
  });
}
