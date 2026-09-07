/**
 * Host row of the toast plugin. It exists only so the client-module registry
 * discovers the `dsh.client` entry; all behaviour lives in the browser bundle.
 */
const name = "toast";
function apply() {}
export { apply, name };
