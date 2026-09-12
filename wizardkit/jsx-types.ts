// Type surface for the Web Awesome custom elements the toolkit renders.
// The element classes load in the browser, so the props stay loose here.
// Import this module once for its side effect on the JSX types.
import type {} from "preact";
import "typed-htmx";

type WaProps = {
  class?: string;
  id?: string;
  slot?: string;
  title?: string;
  hidden?: boolean;
  [key: string]: unknown;
};

declare module "preact" {
  namespace JSX {
    // Merge every hx attribute from typed-htmx into each Preact element.
    // Each IntrinsicElements entry extends HTMLAttributes, so one
    // extension covers all standard tags.
    interface HTMLAttributes extends HtmxAttributes {}
    interface IntrinsicElements {
      "wa-button": WaProps;
      "wa-callout": WaProps;
      "wa-checkbox": WaProps;
      "wa-details": WaProps;
      "wa-input": WaProps;
      "wa-option": WaProps;
      "wa-progress-bar": WaProps;
      "wa-radio": WaProps;
      "wa-radio-group": WaProps;
      "wa-select": WaProps;
      "wa-tab": WaProps;
      "wa-tab-group": WaProps;
      "wa-tab-panel": WaProps;
      "wa-textarea": WaProps;
    }
  }
}
