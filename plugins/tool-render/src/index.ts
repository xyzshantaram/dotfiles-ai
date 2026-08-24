/** Host half of the H2+H3 tool-render client plugin. */
/** Stable Cordis plugin name. */
const name = "tool-render";
/**
* Keep the host row active so the client-module registry discovers this
* package's `dsh.client` entry.
*/
function apply() {}
export { apply, name };