// Client half of the quote-selection plugin (#155).
//
// SHAPE (the ticket's recommended shape, taken as-is). `inputActions` is
// handed only to slots in the conversation.input.* family, while the
// per-message chat-node slot gets no composer API at all — so
// this entry registers in conversation.input.dock (like durable-todos) where
// setDraft is available, and renders the button as a FIXED-POSITION element
// placed from the selection's client rects. The button lives in the
// composer's React tree, where the composer API is, while visually appearing
// next to the selection anywhere on screen. No cross-slot bridge.
//
// Fixed positioning is safe here: the layout keeps position:sticky elements
// (the conversation's to-bottom affordance), and any ancestor transform
// would break those — so the dock subtree cannot be transformed, and a
// fixed element positions against the viewport as intended.
//
// IDLE COST. Unarmed the component returns null: zero DOM. The only standing
// listener is one `selectionchange` handler that early-outs on a collapsed
// selection (no work). Scroll and Escape listeners exist solely while the
// button is visible and are removed on dismissal.
//
// NATIVE SELECTION is never fought: appearing reads the selection without
// touching it, mousedown on the button is preventDefaulted so clicking never
// collapses the range, and dismissal happens on collapse, Escape, and scroll.
import * as React from "react";
import { injectStyle } from "../../shared/client-util";
import {
  appendToDraft,
  isAssistantFlowKind,
  isQuotableText,
  normalizeQuoteText,
  quoteNodesToText,
  toBlockquote,
} from "./quote";
import type { QuoteNode } from "./quote";
import localCss from "./client.module.css";

var PLUGIN_NAME = "quote-selection";
var STYLE_TAG_ID = "quote-selection";
/** The button says exactly what the ticket names: "quote". */
var BUTTON_LABEL = "quote";
/** Marks our own floating button: a selection touching it never re-arms. */
var BUTTON_ATTR = "data-quote-selection";
/**
 * The row attribute the shipped conversation view stamps on every chat node
 * (see isAssistantFlowKind in ./quote for why this hook is stable).
 */
var FLOW_KIND_ATTR = "data-chat-flow-kind";

/** Block-level tags: a boundary after each keeps paragraphs apart. Everything
 * else nests inline. SCRIPT/STYLE/NOSCRIPT never contribute text. */
var BLOCK_TAGS: Record<string, boolean> = {
  P: true,
  DIV: true,
  LI: true,
  UL: true,
  OL: true,
  PRE: true,
  H1: true,
  H2: true,
  H3: true,
  H4: true,
  H5: true,
  H6: true,
  BLOCKQUOTE: true,
  SECTION: true,
  ARTICLE: true,
  HEADER: true,
  FOOTER: true,
  FIGURE: true,
  FIGCAPTION: true,
  TABLE: true,
  THEAD: true,
  TBODY: true,
  TR: true,
  // TD/TH are here because TR alone is not enough: a selection across two
  // cells of ONE row has no boundary between them and concatenates
  // ("firstsecond"). Assistant messages render tables routinely, so this was
  // malformed output from ordinary content, not an exotic edge (found by the
  // reviewer of fc4fc04). DT/DD/DL are the same shape for definition lists.
  TD: true,
  TH: true,
  DL: true,
  DT: true,
  DD: true,
  HR: true,
};
var SILENT_TAGS: Record<string, boolean> = { SCRIPT: true, STYLE: true, NOSCRIPT: true };

/** Props the input dock slot hands to every registered component. Only the
 * composer read/write pair is used; the slot passes more, which is fine. */
interface DockProps {
  useInput(selector: (input: { draft: string }) => string): string;
  inputActions: {
    setDraft(text: string): void;
  };
}

/** The armed button: quoted text, whether it sits in code, and viewport point. */
interface QuoteState {
  text: string;
  fenced: boolean;
  x: number;
  y: number;
  above: boolean;
}

/** The element a selection endpoint lives in, if it lives in one. */
function elementOf(node: Node | null): Element | null {
  if (node === null || node === undefined) return null;
  if (node instanceof Element) return node;
  return node.parentElement;
}

/** Walk a cloned selection fragment into the pure structural model. */
function domToQuoteNodes(root: Node): QuoteNode[] {
  var out: QuoteNode[] = [];
  var children = root.childNodes;
  for (var i = 0; i < children.length; i++) {
    var child = children[i];
    if (child.nodeType === 3) {
      out.push({ kind: "text", text: child.textContent || "" });
    } else if (child.nodeType === 1) {
      var el = child as Element;
      var tag = el.tagName;
      if (tag === "BR") out.push({ kind: "break" });
      else if (SILENT_TAGS[tag] === true) continue;
      else if (BLOCK_TAGS[tag] === true) out.push({ kind: "block", children: domToQuoteNodes(el) });
      else out.push({ kind: "inline", children: domToQuoteNodes(el) });
    }
  }
  return out;
}

/**
 * Selection text with paragraph boundaries intact. The fragment walk keeps
 * block breaks as blank lines; if cloning ever throws, the plain range
 * string is the fallback rather than no quote at all.
 */
function extractQuoteText(sel: Selection, range: Range): string {
  try {
    var walked = quoteNodesToText(domToQuoteNodes(range.cloneContents()));
    if (isQuotableText(walked)) return normalizeQuoteText(walked);
  } catch {
    // ignored on purpose: the toString fallback below still quotes
  }
  return normalizeQuoteText(sel.toString());
}

/** Hide without a state change when already hidden, so idle selection events
 * never re-render. */
function hide(setQuote: (update: (prev: QuoteState | null) => QuoteState | null) => void): void {
  setQuote(function (prev) {
    return prev === null ? prev : null;
  });
}

/** Build the dock entry once so React keeps its identity across re-renders. */
function makeQuoteButton() {
  return function QuoteButton(props: DockProps) {
    var draft = props.useInput(function (input) {
      return input.draft;
    });
    var stateAndSet = React.useState(null as QuoteState | null);
    var quote = stateAndSet[0];
    var setQuote = stateAndSet[1];

    React.useEffect(function () {
      function onSelectionChange() {
        var sel = window.getSelection();
        if (
          sel === null ||
          sel.isCollapsed ||
          sel.rangeCount === 0 ||
          sel.anchorNode === null ||
          sel.focusNode === null
        ) {
          hide(setQuote);
          return;
        }
        var anchorEl = elementOf(sel.anchorNode);
        var focusEl = elementOf(sel.focusNode);
        if (anchorEl === null || focusEl === null) {
          hide(setQuote);
          return;
        }
        // Form controls and our own button never arm.
        if (anchorEl.closest("input,textarea,select,[contenteditable]") !== null) {
          hide(setQuote);
          return;
        }
        if (anchorEl.closest("[" + BUTTON_ATTR + "]") !== null) {
          hide(setQuote);
          return;
        }
        // Both ends must sit in the SAME row, and that row must be an
        // assistant message. One check covers user bubbles, tool cards, the
        // composer, modals, inputs and the sidebar: none of them is an
        // assistant row.
        var anchorRow = anchorEl.closest("[" + FLOW_KIND_ATTR + "]");
        var focusRow = focusEl.closest("[" + FLOW_KIND_ATTR + "]");
        if (anchorRow === null || anchorRow !== focusRow) {
          hide(setQuote);
          return;
        }
        if (!isAssistantFlowKind(anchorRow.getAttribute(FLOW_KIND_ATTR))) {
          hide(setQuote);
          return;
        }
        var range = sel.getRangeAt(0);
        var text = extractQuoteText(sel, range);
        if (!isQuotableText(text)) {
          hide(setQuote);
          return;
        }
        var rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) {
          hide(setQuote);
          return;
        }
        // EITHER endpoint, not just the anchor: a selection that starts in a
        // <pre> and ends outside it (or the reverse) would otherwise fence
        // prose, or emit code as prose. Same-row gating bounds how far such a
        // selection can stretch, but it does not prevent it.
        var focusNode = sel.focusNode;
        var focusEl =
          focusNode === null
            ? null
            : focusNode.nodeType === 1
              ? (focusNode as Element)
              : focusNode.parentElement;
        var fenced =
          anchorEl.closest("pre") !== null ||
          (focusEl !== null && focusEl.closest("pre") !== null);
        var x = Math.min(Math.max(rect.left + rect.width / 2, 72), window.innerWidth - 72);
        var above = rect.top >= 64;
        var y = above ? rect.top - 8 : rect.bottom + 8;
        setQuote(function (prev) {
          if (
            prev !== null &&
            prev.text === text &&
            prev.fenced === fenced &&
            prev.x === x &&
            prev.y === y &&
            prev.above === above
          )
            return prev;
          return { text: text, fenced: fenced, x: x, y: y, above: above };
        });
      }
      document.addEventListener("selectionchange", onSelectionChange);
      return function () {
        document.removeEventListener("selectionchange", onSelectionChange);
      };
    }, []);

    // While armed, any scroll or Escape dismisses. Attached only while the
    // button is up: nothing listens while idle.
    React.useEffect(
      function () {
        if (quote === null) return undefined;
        function onScroll() {
          hide(setQuote);
        }
        function onKeyDown(e: KeyboardEvent) {
          if (e.key === "Escape") hide(setQuote);
        }
        document.addEventListener("scroll", onScroll, true);
        document.addEventListener("keydown", onKeyDown);
        return function () {
          document.removeEventListener("scroll", onScroll, true);
          document.removeEventListener("keydown", onKeyDown);
        };
      },
      [quote],
    );

    if (quote === null) return null;

    // mousedown is preventDefaulted so the click never collapses the range
    // it is about to quote. Clicking appends (never replaces) and dismisses.
    function onMouseDown(e: any) {
      e.preventDefault();
    }
    function onClick() {
      var current = quote;
      if (current === null) return;
      props.inputActions.setDraft(appendToDraft(draft, toBlockquote(current.text, current.fenced)));
      setQuote(null);
      var sel = window.getSelection();
      if (sel !== null) sel.removeAllRanges();
    }

    return (
      <button
        type="button"
        className="quote-selection-float"
        data-quote-selection="1"
        data-above={quote.above ? "1" : undefined}
        style={{ position: "fixed", left: quote.x, top: quote.y }}
        onMouseDown={onMouseDown}
        onClick={onClick}
      >
        {BUTTON_LABEL}
      </button>
    );
  };
}

/** Stable Cordis plugin name. */
var name = PLUGIN_NAME;
/** Services this bundle reaches through the plugin context. */
var inject = ["slots"];

/** Plugin body: inject the styles once and register the dock entry. */
function apply(ctx) {
  injectStyle(PLUGIN_NAME, STYLE_TAG_ID, localCss);
  var Button = makeQuoteButton();
  ctx.slots.inject("conversation.input.dock", function () {
    return ctx.slots.register(
      { name: "conversation.input.dock", id: "quote-selection", order: 30 },
      function (props) {
        return <Button {...props} />;
      },
    );
  });
}

export { apply, inject, name };
