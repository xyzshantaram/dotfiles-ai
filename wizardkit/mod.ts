// wizardkit: data-node wizards served as HTMX fragments.
// Wizards author steps as JSON data nodes. Deno serves them as HTML.
//
// Supported dependency versions live here. Wizard scripts depend on
// wizardkit alone and import everything through this module.
export * from "./nodes.ts";
export * from "./toolkit.ts";
// Standard nav row plus the clipboard node, re-exported by name so
// wizard authors can spot the toolkit helpers in one place.
export { copyable, nav } from "./nodes.ts";
export { $ } from "npm:zx@8.8.5";
