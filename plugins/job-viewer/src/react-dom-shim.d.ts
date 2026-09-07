/**
 * job-viewer — ambient react-dom binding for the dropdown portal.
 *
 * react-dom stays external in the client bundle (build.mjs) and the shell
 * loader supplies it at runtime, so tsc cannot resolve the real package.
 * Typed as any, the same way plugins/shared/shims.d.ts types the other
 * shell-provided modules. This file lives here instead of beside those
 * shims because the shared directory is outside this plugin's scope.
 */
declare module "react-dom" {
  export const createPortal: any;
}
