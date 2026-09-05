# PLAN.md — durable profiles fallback

## Vision

Make the profiles LLM failover skip dead providers without paying the host same-provider retry loop on every turn, prove it with repro tests, and keep every switchover visible as a chat row.

## Checklist

- [ ] Ticket 1 — analyse the fresh test session: confirm which levels fail, which error codes surface, and whether rows render. Closes when the failure list is written into Critical context below.
- [ ] Ticket 2 — repro tests for the exact failures: failing-first tests that replay the observed codes through `normalizeErrorClass`, `markDown`/`isCachedDown`, and `failoverNoticeText`. Closes when `npx vitest run plugins/profiles-classify.test.ts` passes with the new cases.
- [ ] Ticket 3 — grill the fix list: circuit breaker, diagnostics endpoint, auto-recovery probe, and the replace-retry-layer question. Closes when the user picks the cut for implementation.
- [ ] Ticket 4 — implement the grilled cut in `plugins/profiles.ts` plus client rows if touched. Closes when build plus the ticket-2 tests pass and one behavior is verified against the live test session.
- [ ] Ticket 5 — review and commit: independent diff read, researcher review pass for risky parts, then grouped commits with user approval. Closes when the tree is clean.

## Critical context

- `cordis.patch.yml` mounts `plugins/profiles.js` straight from the repo, so a service restart picks up builds with no reinstall step.
- The missing-rows root cause was an unbound `agent.inject` call (`this.send` lost); fixed and rebuilt, pending a restart plus a live failover to confirm rows.
- dsh-llm-retry runs before the profiles waterfall, so every fresh turn pays up to 5 same-provider retries before failover advances; the `server-error` down-cache class now skips known-dead levels on later turns.
- Session-39f6a882 hit full chain exhaustion (all 7 levels, mostly 402 no-credits plus a deepseek-official QUOTA 402); session-a0872a7d showed repeated opencode-go 500 SERVER faults.
- Log repairs live in `~/ai-scratch/session-repair-20260906b/` with checksums; truncations were thursday turn 8 and aidos turn 209.
- Reference survey ranks first a per-level circuit breaker with consecutive-failure threshold, then a diagnostics endpoint, then an auto-recovery head probe; full report was delivered in chat.

## User preferences and special rules

- Testing stays in a fresh user-created session; no more log surgery on working sessions.
- Build subagents only; never touch `scripts/rank-chains.mjs`; no commits without explicit approval.
- Failover rows go to both main and child sessions, one row per switchover, error-card style.

## Human review queue

- [ ] After restart, force a failover and confirm the LLM-failover row renders in chat.
- [ ] Confirm the fresh test session stays out of the 5-retry loop on repeat turns.
