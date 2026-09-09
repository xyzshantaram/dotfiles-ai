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
import { HOST_ESCALATION_PREFIX, isBashGuardReason } from "./guard";

/**
 * The label line above a sandbox-escalation justification, in the guard
 * rewrite banner's label styling, so the two "something happened to this
 * call" annotations read as one family rather than two inventions.
 *
 * Tense follows state, driven by ONE settled/open boolean (see
 * escalationLabel): while the approval is open the agent is still asking;
 * once it settles — approved OR rejected, both alike — the ask is history.
 */
export const ESCALATION_LABEL = "agent requests sandbox access escalation";
export const ESCALATION_LABEL_SETTLED = "agent requested sandbox access escalation";

/**
 * The banner label for one settled/open signal. Tense and prominence both
 * flow from this same boolean at the render site (see
 * escalationReasonClassName), so a past-tense label at full prominence —
 * or vice versa — cannot happen.
 */
export function escalationLabel(settled: boolean): string {
  return settled ? ESCALATION_LABEL_SETTLED : ESCALATION_LABEL;
}

/** Base class for the justification prose. */
export const ESCALATION_REASON_CLASS = "tool-render-escalation-reason";

/** Muted-small modifier, added once the ask settles. */
export const ESCALATION_REASON_MUTED_CLASS = "tool-render-escalation-reason-muted";

/**
 * The justification element's class for one settled/open signal — the SAME
 * boolean that picks the label tense. Open: normal prominence. Settled:
 * muted and small, so a decided ask (a rejection included) no longer reads
 * as though it still needed an answer. This quiets the ASK only: the
 * outcome keeps its own surfaces (the collapsed-row verdict badge, the
 * error outline), which this class never touches.
 */
export function escalationReasonClassName(settled: boolean): string {
  return settled
    ? ESCALATION_REASON_CLASS + " " + ESCALATION_REASON_MUTED_CLASS
    : ESCALATION_REASON_CLASS;
}

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
  const prefix = HOST_ESCALATION_PREFIX;
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
