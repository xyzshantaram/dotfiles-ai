/**
 * Additional ambient exports for @deepseek-ai/dsh-client-ui-primitives that
 * this plugin needs but plugins/shared/shims.d.ts (outside this ticket's
 * allowlist) does not declare yet. Ambient module blocks merge, so this
 * extends the shared shim without touching it. Promote these lines into the
 * shared shim when another plugin needs them.
 */
declare module "@deepseek-ai/dsh-client-ui-primitives" {
  export const MessageText: any;
  export const JsonBlock: any;
  export const Tooltip: any;
  export const IconCopyOutline16: any;
  export const IconCheckOutline16: any;
  export function writeClipboard(text: string): Promise<boolean>;
}
