/*! Copyright 2026 Fonticons, Inc. - https://webawesome.com/license */
import {
  WaPageChangeEvent
} from "./chunk.ZY7BMFLO.js";
import {
  WaBeforePageChangeEvent
} from "./chunk.XLATYKDG.js";
import {
  pagination_styles_default
} from "./chunk.HJCFTRPZ.js";
import {
  getDeepestActiveElement
} from "./chunk.4LIBWWJL.js";
import {
  announce
} from "./chunk.YQNBAO2Z.js";
import {
  clamp
} from "./chunk.KNJT7KBU.js";
import {
  watch
} from "./chunk.PZAN6FPN.js";
import {
  WebAwesomeElement
} from "./chunk.AOKMSJXD.js";
import {
  LocalizeController
} from "./chunk.56IHH3HP.js";
import {
  __decorateClass
} from "./chunk.7VGCIHDG.js";

// src/components/pagination/pagination.ts
import { html } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { classMap } from "lit/directives/class-map.js";
import { ifDefined } from "lit/directives/if-defined.js";
function range(start, end) {
  const length = end - start + 1;
  return length > 0 ? Array.from({ length }, (_, i) => start + i) : [];
}
function getPaginationRange(options) {
  const totalPages = Math.max(1, Math.trunc(options.totalPages));
  const page = Math.min(Math.max(1, Math.trunc(options.page)), totalPages);
  const siblingCount = Math.max(0, Math.trunc(options.siblingCount));
  const boundaryCount = Math.max(0, Math.trunc(options.boundaryCount));
  const totalSlots = siblingCount * 2 + boundaryCount * 2 + 3;
  if (totalSlots >= totalPages) {
    return range(1, totalPages).map((value) => ({ type: "page", value }));
  }
  const firstMiddle = boundaryCount + 1;
  const lastMiddle = totalPages - boundaryCount;
  let windowStart = page - siblingCount;
  let windowEnd = page + siblingCount;
  if (windowStart < firstMiddle) {
    windowEnd += firstMiddle - windowStart;
    windowStart = firstMiddle;
  }
  if (windowEnd > lastMiddle) {
    windowStart -= windowEnd - lastMiddle;
    windowEnd = lastMiddle;
  }
  windowStart = Math.max(windowStart, firstMiddle);
  windowEnd = Math.min(windowEnd, lastMiddle);
  let freedSlots = (windowStart > firstMiddle ? 0 : 1) + (windowEnd < lastMiddle ? 0 : 1);
  while (freedSlots > 0) {
    if (windowEnd < lastMiddle) {
      windowEnd++;
    } else if (windowStart > firstMiddle) {
      windowStart--;
    } else {
      break;
    }
    freedSlots--;
  }
  const showStartEllipsis = windowStart > firstMiddle;
  const showEndEllipsis = windowEnd < lastMiddle;
  const items = [];
  range(1, boundaryCount).forEach((value) => items.push({ type: "page", value }));
  if (showStartEllipsis) items.push({ type: "ellipsis", position: "start" });
  range(windowStart, windowEnd).forEach((value) => items.push({ type: "page", value }));
  if (showEndEllipsis) items.push({ type: "ellipsis", position: "end" });
  range(totalPages - boundaryCount + 1, totalPages).forEach((value) => items.push({ type: "page", value }));
  return items;
}
var WaPagination = class extends WebAwesomeElement {
  constructor() {
    super(...arguments);
    this.localize = new LocalizeController(this);
    this.total = 0;
    this.pageSize = 10;
    this.page = 1;
    this.siblingCount = 2;
    this.boundaryCount = 1;
    this.withoutNav = false;
    this.withEdges = false;
    this.withSummary = false;
    this.format = "standard";
    this.hrefTemplate = "";
    this.hideSinglePage = false;
    this.label = "";
    this.appearance = "outlined";
    this.disabled = false;
    this.shouldRestoreFocus = false;
  }
  /** The total number of pages, derived from `total` and `pageSize`. */
  get totalPages() {
    if (this.pageSize <= 0) return 1;
    return Math.max(1, Math.ceil(this.total / this.pageSize));
  }
  handleDisabledChange() {
    this.customStates.set("disabled", this.disabled);
  }
  handlePageBoundsChange() {
    const clamped = clamp(Math.trunc(this.page) || 1, 1, this.totalPages);
    if (clamped !== this.page) {
      this.page = clamped;
    }
  }
  /** Resolves the URL for a given page when `hrefTemplate` is set, supporting both the string and function forms. */
  getHref(page) {
    if (!this.hrefTemplate) return void 0;
    if (typeof this.hrefTemplate === "function") return this.hrefTemplate(page);
    return this.hrefTemplate.split("{page}").join(String(page));
  }
  /**
   * Requests a change to the given page. Emits a cancelable `wa-before-page-change`; if not canceled, updates `page`,
   * restores focus to the new current page, emits `wa-page-change`, and announces the change.
   */
  async requestPage(page, restoreFocus) {
    const target = clamp(page, 1, this.totalPages);
    if (this.disabled || target === this.page) return;
    const beforeEvent = new WaBeforePageChangeEvent({ page: target, pageSize: this.pageSize });
    this.dispatchEvent(beforeEvent);
    if (beforeEvent.defaultPrevented) return;
    this.shouldRestoreFocus = restoreFocus;
    this.page = target;
    await this.updateComplete;
    this.dispatchEvent(new WaPageChangeEvent({ page: this.page, pageSize: this.pageSize }));
    this.announcePage();
  }
  /** Moves focus to the current page item after an in-component activation, so focus never falls back to the body. */
  restoreFocusToCurrentPage() {
    const current = this.shadowRoot?.querySelector('[part~="page-current"]');
    const active = getDeepestActiveElement();
    if (current && active && this.shadowRoot?.contains(active)) {
      current.focus();
    }
  }
  /** Announces the current page to assistive technology via the shared light-DOM live region. */
  announcePage() {
    announce(this.localize.term("pageXOfY", this.page, this.totalPages), "polite");
  }
  updated() {
    if (this.shouldRestoreFocus) {
      this.shouldRestoreFocus = false;
      this.restoreFocusToCurrentPage();
    }
  }
  /** Renders a navigation control (first/previous/next/last). */
  renderNavButton(options) {
    const { part, targetPage, enabled, label, icon, slotName } = options;
    const isDisabled = this.disabled || !enabled;
    const href = this.getHref(targetPage);
    if (href !== void 0) {
      return html`
        <li role="listitem">
          <a
            part="button ${part}"
            class="button nav-button"
            href=${ifDefined(isDisabled ? void 0 : href)}
            aria-label=${label}
            aria-disabled=${isDisabled ? "true" : "false"}
          >
            <slot name=${slotName}><wa-icon library="system" name=${icon}></wa-icon></slot>
          </a>
        </li>
      `;
    }
    return html`
      <li role="listitem">
        <button
          part="button ${part}"
          class="button nav-button"
          type="button"
          aria-label=${label}
          aria-disabled=${isDisabled ? "true" : "false"}
          @click=${isDisabled ? null : () => this.requestPage(targetPage, true)}
        >
          <slot name=${slotName}><wa-icon library="system" name=${icon}></wa-icon></slot>
        </button>
      </li>
    `;
  }
  /** Renders a single numbered page item. The visible number is the accessible name — no redundant aria-label. */
  renderPage(page) {
    const isCurrent = page === this.page;
    const href = this.getHref(page);
    const label = this.localize.number(page);
    const part = `button page${isCurrent ? " page-current" : ""}`;
    if (href !== void 0) {
      return html`
        <li role="listitem">
          <a
            part=${part}
            class=${classMap({ button: true, page: true, current: isCurrent })}
            href=${ifDefined(isCurrent || this.disabled ? void 0 : href)}
            aria-current=${ifDefined(isCurrent ? "page" : void 0)}
            aria-disabled=${ifDefined(this.disabled ? "true" : void 0)}
            >${label}</a
          >
        </li>
      `;
    }
    return html`
      <li role="listitem">
        <button
          part=${part}
          class=${classMap({ button: true, page: true, current: isCurrent })}
          type="button"
          aria-current=${ifDefined(isCurrent ? "page" : void 0)}
          aria-disabled=${ifDefined(this.disabled ? "true" : void 0)}
          @click=${this.disabled || isCurrent ? null : () => this.requestPage(page, true)}
        >
          ${label}
        </button>
      </li>
    `;
  }
  /**
   * Renders an ellipsis for a run of collapsed pages. Clicking it jumps a fixed number of pages toward that side, so a
   * `start` ellipsis jumps backward and an `end` ellipsis jumps forward. `data-ellipsis` lets the styles collapse a
   * second ellipsis when space is tight.
   */
  renderEllipsis(position, index) {
    const jump = WaPagination.jumpDistance;
    const isStart = position === "start";
    const targetPage = clamp(isStart ? this.page - jump : this.page + jump, 1, this.totalPages);
    const label = this.localize.term(isStart ? "jumpBackwardX" : "jumpForwardX", jump);
    const href = this.getHref(targetPage);
    const content = html`
      <wa-icon class="ellipsis-default" library="system" name="ellipsis" label=${label}></wa-icon>
    `;
    if (href !== void 0) {
      return html`
        <li role="listitem">
          <a
            part="ellipsis"
            class="button ellipsis"
            data-ellipsis=${index}
            href=${ifDefined(this.disabled ? void 0 : href)}
            aria-label=${label}
            aria-disabled=${ifDefined(this.disabled ? "true" : void 0)}
          >
            ${content}
          </a>
        </li>
      `;
    }
    return html`
      <li role="listitem">
        <button
          part="ellipsis"
          class="button ellipsis"
          data-ellipsis=${index}
          type="button"
          aria-label=${label}
          aria-disabled=${ifDefined(this.disabled ? "true" : void 0)}
          @click=${this.disabled ? null : () => this.requestPage(targetPage, true)}
        >
          ${content}
        </button>
      </li>
    `;
  }
  render() {
    const totalPages = this.totalPages;
    if (this.hideSinglePage && totalPages <= 1) {
      return html``;
    }
    const isRtl = this.localize.dir() === "rtl";
    const onFirstPage = this.page <= 1;
    const onLastPage = this.page >= totalPages;
    if (this.format === "compact") {
      return html`
        <div class="container">
          ${this.renderSummary()}
          <nav part="base pagination" class="pagination" aria-label=${this.label || this.localize.term("pagination")}>
            <ul part="pages" class="pages" role="list">
              ${this.renderNavButton({
        part: "previous-button",
        targetPage: this.page - 1,
        enabled: !onFirstPage,
        label: this.localize.term("previousPage"),
        icon: isRtl ? "chevron-right" : "chevron-left",
        slotName: "previous-icon"
      })}
              <li role="listitem">
                <span part="label" class="label" aria-current="page">
                  ${this.localize.term("compactPageXOfY", this.page, totalPages)}
                </span>
              </li>
              ${this.renderNavButton({
        part: "next-button",
        targetPage: this.page + 1,
        enabled: !onLastPage,
        label: this.localize.term("nextPage"),
        icon: isRtl ? "chevron-left" : "chevron-right",
        slotName: "next-icon"
      })}
            </ul>
          </nav>
        </div>
      `;
    }
    const items = getPaginationRange({
      page: this.page,
      totalPages,
      siblingCount: this.siblingCount,
      boundaryCount: this.boundaryCount
    });
    let ellipsisCount = 0;
    return html`
      <div class="container">
        ${this.renderSummary()}
        <nav part="base pagination" class="pagination" aria-label=${this.label || this.localize.term("pagination")}>
          <ul part="pages" class="pages" role="list">
            ${this.withEdges ? this.renderNavButton({
      part: "first-button",
      targetPage: 1,
      enabled: !onFirstPage,
      label: this.localize.term("firstPage"),
      icon: isRtl ? "angles-right" : "angles-left",
      slotName: "first-icon"
    }) : ""}
            ${this.withoutNav ? "" : this.renderNavButton({
      part: "previous-button",
      targetPage: this.page - 1,
      enabled: !onFirstPage,
      label: this.localize.term("previousPage"),
      icon: isRtl ? "chevron-right" : "chevron-left",
      slotName: "previous-icon"
    })}
            ${items.map((item) => {
      if (item.type === "ellipsis") {
        ellipsisCount++;
        return this.renderEllipsis(item.position, ellipsisCount);
      }
      return this.renderPage(item.value);
    })}
            ${this.withoutNav ? "" : this.renderNavButton({
      part: "next-button",
      targetPage: this.page + 1,
      enabled: !onLastPage,
      label: this.localize.term("nextPage"),
      icon: isRtl ? "chevron-left" : "chevron-right",
      slotName: "next-icon"
    })}
            ${this.withEdges ? this.renderNavButton({
      part: "last-button",
      targetPage: totalPages,
      enabled: !onLastPage,
      label: this.localize.term("lastPage"),
      icon: isRtl ? "angles-left" : "angles-right",
      slotName: "last-icon"
    }) : ""}
          </ul>
        </nav>
      </div>
    `;
  }
  /** Renders the optional "1–10 of 237" summary. */
  renderSummary() {
    if (!this.withSummary) return "";
    const start = this.total === 0 ? 0 : (this.page - 1) * this.pageSize + 1;
    const end = Math.min(this.page * this.pageSize, this.total);
    return html`
      <span part="summary" class="summary"> ${this.localize.term("showingXtoYofZ", start, end, this.total)} </span>
    `;
  }
};
WaPagination.css = pagination_styles_default;
/** How many pages an ellipsis skips when clicked. Matches the common convention (e.g. Ant Design). */
WaPagination.jumpDistance = 5;
__decorateClass([
  property({ type: Number })
], WaPagination.prototype, "total", 2);
__decorateClass([
  property({ attribute: "page-size", type: Number })
], WaPagination.prototype, "pageSize", 2);
__decorateClass([
  property({ type: Number, reflect: true })
], WaPagination.prototype, "page", 2);
__decorateClass([
  property({ attribute: "sibling-count", type: Number })
], WaPagination.prototype, "siblingCount", 2);
__decorateClass([
  property({ attribute: "boundary-count", type: Number })
], WaPagination.prototype, "boundaryCount", 2);
__decorateClass([
  property({ attribute: "without-nav", type: Boolean })
], WaPagination.prototype, "withoutNav", 2);
__decorateClass([
  property({ attribute: "with-edges", type: Boolean })
], WaPagination.prototype, "withEdges", 2);
__decorateClass([
  property({ attribute: "with-summary", type: Boolean })
], WaPagination.prototype, "withSummary", 2);
__decorateClass([
  property({ reflect: true })
], WaPagination.prototype, "format", 2);
__decorateClass([
  property({ attribute: "href-template" })
], WaPagination.prototype, "hrefTemplate", 2);
__decorateClass([
  property({ attribute: "hide-single-page", type: Boolean })
], WaPagination.prototype, "hideSinglePage", 2);
__decorateClass([
  property()
], WaPagination.prototype, "label", 2);
__decorateClass([
  property({ reflect: true })
], WaPagination.prototype, "appearance", 2);
__decorateClass([
  property({ type: Boolean, reflect: true })
], WaPagination.prototype, "disabled", 2);
__decorateClass([
  state()
], WaPagination.prototype, "shouldRestoreFocus", 2);
__decorateClass([
  watch("disabled", { waitUntilFirstUpdate: true })
], WaPagination.prototype, "handleDisabledChange", 1);
__decorateClass([
  watch("page"),
  watch("total"),
  watch("pageSize")
], WaPagination.prototype, "handlePageBoundsChange", 1);
WaPagination = __decorateClass([
  customElement("wa-pagination")
], WaPagination);

export {
  WaPagination
};
