// Sandbox-escalation reason helpers (owner, 2026-09-09).
//
// A sandbox escalation's justification is a tool ARGUMENT
// (`sandbox_permissions` + `justification` side by side), so it is durable:
// it survives the decision settling AND a page reload. The approval bar's
// pending payload is ephemeral by construction — once the human decides,
// the pending is gone — so the settled row must read from args, and the
// open row reads from the same args source so the text cannot differ
// between the two states.
//
// The host's pending reason for an escalation is the machine string
// `escalate sandbox to <mode>: <justification>`. The `escalate sandbox to
// <mode>: ` prefix is consumed by the label line and never shown as part
// of the sentence; the mode stays discoverable as its own chip on the
// label line (it decides how far the sandbox widens) rather than jammed
// into the justification prose.
import { isBashGuardReason } from "./guard";

/**
 * The label line above a sandbox-escalation justification, in the guard
 * rewrite banner's label styling, so the two "something happened to this
 * call" annotations read as one family rather than two inventions.
 */
export const ESCALATION_LABEL = "agent requests sandbox access escalation";

export interface EscalationDetail {
  mode: string;
  justification: string;
}

function pickString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (let i = 0; i < keys.length; i++) {
    const v: unknown = value[keys[i]];
    if (typeof v === "string" && v !== "") return v;
  }
  return undefined;
}

/**
 * Split the host's machine string `escalate sandbox to <mode>:
 * <justification>` into its two parts. Splits on the FIRST colon only: a
 * justification routinely contains its own colons ("Third part of the
 * requested change: adds ..."), and a naive split on ":" corrupts it.
 * Returns null for anything that is not that shape.
 */
export function splitEscalationReason(reason: unknown): EscalationDetail | null {
  if (typeof reason !== "string") return null;
  const prefix = "escalate sandbox to ";
  if (reason.indexOf(prefix) !== 0) return null;
  const rest = reason.slice(prefix.length);
  const colon = rest.indexOf(":");
  if (colon === -1) return null;
  const mode = rest.slice(0, colon).trim();
  const justification = rest.slice(colon + 1).replace(/^\s+/, "");
  // The mode is one token (no spaces, no colons); the justification is the
  // whole remainder, colons included.
  if (mode === "" || /[\s:]/.test(mode)) return null;
  if (justification === "") return null;
  return { mode, justification };
}

/**
 * The durable escalation detail for a call's parsed args, or null when the
 * call was never an escalation. The mode gate matches `escalatedOf` in
 * client.tsx, so the banner and the card outline always agree.
 *
 * A bash-guard reason is excluded on purpose (same rule as the approval
 * bar): it is a YAML payload and the guard banner already renders it
 * readably on the same card, so echoing it here would show the same fact
 * twice, once as noise.
 *
 * Defensive unwrap: if the justification itself arrives wearing the
 * machine-string prefix for this call's own mode, the prefix is consumed
 * here too, so it can never leak into the prose.
 */
export function escalationDetailOf(args: unknown): EscalationDetail | null {
  if (args === null || typeof args !== "object" || Array.isArray(args)) return null;
  const record = args as Record<string, unknown>;
  const mode = pickString(record, ["sandbox_permissions"]);
  if (mode !== "workspace-write" && mode !== "danger-full-access") return null;
  const justification = pickString(record, ["justification"]);
  if (justification === undefined || justification.trim() === "") return null;
  if (isBashGuardReason(justification)) return null;
  const prefixed = splitEscalationReason(justification);
  if (prefixed !== null && prefixed.mode === mode) return { mode, justification: prefixed.justification };
  return { mode, justification };
}
