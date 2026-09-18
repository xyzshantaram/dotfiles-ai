// bash-graph: fair-copy renderer for bash commands as diagrams (ticket #172).
//
// Parse -> model -> measure -> layout -> render. Nothing imports this module
// yet (the swap is ticket #173); it lands unreferenced on purpose so part 2
// reviews as a diff instead of a rewrite. Importing this entry must never
// pull in the test harness or the corpus fixture (asserted in contract.test.ts).

export * from "./constants.js";
export * from "./text.js";
export * from "./primitives.js";
export * from "./parse.js";
export * from "./model.js";
export * from "./measure.js";
export * from "./layout.js";
export * from "./render.js";
