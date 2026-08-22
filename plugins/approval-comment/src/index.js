/** Host half of the W8 reject-with-comment client plugin. */
/** Stable Cordis plugin name. */
const name = "approval-comment";
/**
* Keep the host row active so the client-module registry discovers this
* package's `dsh.client` entry.
*/
function apply() {}
export { apply, name };