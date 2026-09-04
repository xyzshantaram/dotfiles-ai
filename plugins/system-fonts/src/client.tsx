import { injectStyle } from "../../shared/client-util";

const PLUGIN_NAME = "system-fonts";

// The theme declares both font tokens on `:root`. Equal specificity means the
// stylesheet the browser sees LAST wins, and our injection order is not
// guaranteed. So the selector is `html:root`, which is strictly higher
// specificity than `:root` and wins regardless of order. It needs no
// `!important`. Do not simplify it back to `:root`.
const css = `
html:root {
  --ds-font-family-code: ui-monospace, monospace;
  --dsw-font-family: system-ui, sans-serif;
}
`;

var inject = [];
var name = PLUGIN_NAME;

function apply(ctx: any) {
  injectStyle(PLUGIN_NAME, "system-fonts", css);
}

export { apply, inject, name };
