/**
 * W26 — ambient declarations for browser-half modules the shell loader
 * provides at runtime. tsc cannot see them because they are not installed
 * packages in this repo: esbuild keeps them external and the dsh web shell
 * resolves them through its loader seed at runtime. These shims type each
 * module as `any` on purpose — they only need to make the type-check pass,
 * never to describe the real API. Do not import types from them.
 */
declare module "react" {
  const React: any;
  // `export =` rather than `export default`: every client plugin writes
  // `import * as React from "react"` and calls `React.useState`,
  // `React.createElement`, and so on directly on the namespace binding.
  //
  // THE CAPITAL R IS LOAD-BEARING, not a style choice (#158). The rule
  // eslint-plugin-react-hooks/rules-of-hooks recognises hook calls only
  // through a namespace object literally named `React`; with the old
  // lowercase alias it matched nothing in this repo and #150's
  // conditionally-called hook shipped past it. tsconfig.json's jsxFactory
  // and build.mjs name `React.createElement` to match -- change one and
  // you must change all three, or the bundles reference a binding that
  // does not exist.
  // With only `export default`, that namespace types as `{ default: any }`
  // and every hook access fails typecheck (TS2339) even though esbuild
  // resolves the real react package fine at build time. `export =` makes
  // the namespace import bind directly to the `any` value instead, which
  // is what the real react namespace-style usage here actually needs.
  export = React;
}

declare module "@deepseek-ai/dsh-client-ui-primitives" {
  export const Button: any;
  export const StateDot: any;
  export const IconBrowseOutline16: any;
  export const IconEditOutline16: any;
  export const IconApiOutline14: any;
  export const IconChevronDownOutline14: any;
  export const IconInspectOutline12: any;
  export const IconChecklistOutline14: any;
  export const IconPlayOutline16: any;
  export const IconQueueOutline14: any;
  export const IconCheckOutline14: any;
  export const IconQuestionOutline14: any;
  export const IconAgentPresetOutline16: any;
  export const IconStopFill16: any;
  export const MarkdownText: any;
}

declare module "@deepseek-ai/dsh-client-runtime/client" {
  export const conversationContextKey: any;
}

declare module "snappyjs" {
  export function uncompress(input: Buffer | Uint8Array): Buffer;
  export function compress(input: Buffer | Uint8Array): Buffer;
}

interface Window {
  /** Browser module loader facade installed by the dsh-remote web shell. */
  __ModuleLoader__: any;
  /** Set once tool-render has installed its highlight.js pass. */
  __toolRenderHljsPass?: boolean | undefined;
}

/** Inlined CSS text: the build's cssTextPlugin exports the file's text as the default export. */
declare module "*.css" {
  const css: string;
  export default css;
}
