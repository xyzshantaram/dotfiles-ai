/**
 * Host half of the composer pending-state plugin (#65). The reject-with-comment
 * card this plugin was born as (W8) is retired: answering lives on tool-render's
 * approval bar, and all that remains here is the client-side chain marker that
 * keeps the composer usable and paints its pending rings.
 */
/** Stable Cordis plugin name. */
const name = "approval-comment";
/**
 * Keep the host row active so the client-module registry discovers this
 * package's `dsh.client` entry.
 */
function apply() {}
export { apply, name };
