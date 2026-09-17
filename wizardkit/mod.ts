// wizardkit: data-node wizards served as HTMX fragments.
// Wizards author steps as JSON data nodes. Deno serves them as HTML.
//
// Supported dependency versions live here. Wizard scripts depend on
// wizardkit alone and import everything through this module.
export * from "./nodes.ts";
export * from "./toolkit.ts";
// Step navigation is declared, not built: set the nav field on a step
// rather than adding a node for it. See StepNav in ./nodes.ts.
export { $ } from "npm:zx@8.8.5";
