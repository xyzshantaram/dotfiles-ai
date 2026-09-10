// Single-source re-export: the bash-guard reason test lives in
// plugins/shared/guard-reason.ts, imported here so the existing `./guard`
// and `./guard.js` importers (the BashRow client card, the host-side
// guarded-approvals projection, verdict-tip, escalation, and their tests)
// keep working unchanged. The predicate is defined once, in shared, alongside
// approval-comment's import of the same binding — see the header there for
// why a second copy must never exist again (#130).
export * from "../../shared/guard-reason";
