# PLAN — Close the verification gap in the AI workflow

## Why this effort exists

A review of four `soapbox-pub/ditto` merge requests (!245, !246, !248, !249) against the
opencode session records found one failure mode. The code is good. The claims about the
code are not.

Confirmed by direct check against `origin/main`:

- Issue #317 stated that `AppRouter.tsx` already prefixes the router `basename` with
  `import.meta.env.BASE_URL`. No `basename` exists in `src/`. `BASE_URL` appears only as
  the unrelated `GIFVERSE_BASE_URL`. The root cause was invented.
- MR !248 was a no-op. `vite.config.ts` never sets `base`, so the helper returned its
  input unchanged. The MR was later closed entirely.
- The pre-merge verification pass asked 50 existence checks and 0 effect checks. It
  returned TRUE on 9 of 10 claims. Its one FALSE was commit bookkeeping.
- One root session ran 6 days, 5502 messages, 206 subagents, 39 compactions, $538.50.
  The merge request prose was written at the end of that.
- A ticket said "do NOT wire this in, that is ticket T10.2". T10.2 never mentioned it.
  479 lines of dead code plus a mandatory build step reached review.

Four of the seven `CONTRIBUTING.md:166` close-without-review triggers were tripped: dead
code, scope creep, incomplete template, and evidence of low-quality AI generation.

The tooling and the models are not the problem. The questions we ask them are. A
$0.0358 DeepSeek pass asked "verify and review these fixes" produced excellent
skeptical work on the same repo. The same pipeline asked "does X exist" produced
false assurance.

## Deployment rule for every phase

Every skill, agent, plugin, and config change lands in two places:

1. `~/.config/opencode/` — the live deployed config on this machine.
2. `~/repos/dotfiles-ai/` — the tracked repo.

Write to the deployed config first. Then sync into the repo. Restart opencode after any
config-time change, because opencode loads config once at start.

### Pre-existing drift, resolved

Deployed and repo had drifted on 6 files before this effort. Decisions:

- Sync deployed to repo: `agent/coder.md`, `agent/researcher.md`, `agent/tester.md`
  (newer model, plus the STE prose instruction the repo copies lack) and `AGENTS.md`
  (trailing whitespace only).
- `opencode.json`: sync the `deepseek-v4-flash` model change. Keep the repo relative
  path `./plugin/opencode-profile.ts`. Deployed uses a hardcoded `/home/sid/...` path
  that breaks the public repo.
- `opencode.json`: sync the removal of the `fetch` MCP server. The user removed it on
  purpose, because `webfetch` and `curl` already cover that job.
- Do not sync `.gitignore`. The deployed version would make the repo track
  `package.json`, `package-lock.json`, and `bun.lock`.
- Do not add the `blinkit` and `zepto` MCP servers to the repo `opencode.json`. They are
  personal servers. Instead add a short note to `README.md` that names them and gives
  each URL, so a reader can add them if they want them.

---

## Phase 1 — Verification skill — `in_progress`

**Goal.** Replace existence-checking with falsification. This one change would have
caught the !248 no-op, the invented #317 root cause, the unrunnable test plan, and both
weak tests in !249.

- [ ] **T1.1 Write the `verification` skill.** Create
      `skills/verification/SKILL.md`. The skill must force three questions for any
      change under review, and must forbid a TRUE verdict without an evidence line:
      1. If this diff is reverted, what observable behaviour changes. Name the file and
         the mechanism. A change with no answer is a no-op.
      2. For every factual claim in the description, the issue, and the commit message,
         paste the `grep` or `file:line` that proves it. Strike any claim with no
         evidence line.
      3. For every new test, name a code change that makes it fail. A test with no such
         change is tautological.
      The skill must also state that an existence check is not a verification, and that
      a hedge in a subagent report must survive into the final prose.
      *Evaluation:* run the skill against MR !248's original diff and description. It
      must independently reach "this is a no-op" and "the #317 root cause is false"
      without being told either. Both checks are reproducible from `origin/main`.
      *Open design question, still to settle.* The !248 test has a weakness. We already
      know both answers, so we could write a skill that passes only this one case. That
      is the same error the old verification pass made. The user agrees the !248 result
      is worth having anyway, and wants to think about the wider question. Candidate
      second test: point the skill at a `nostr-canvas` merge request that nobody has
      analysed yet, and judge the output blind. Settle this before closing T1.1.

- [ ] **T1.2 Wire the skill into the reviewer and orchestrator.** Reference the
      `verification` skill from `agent/researcher.md` and from `AGENTS.md`, so both the
      review path and the primary session reach for it.
      *Evaluation:* `grep -l verification ~/.config/opencode/agent/researcher.md
      ~/.config/opencode/AGENTS.md` returns both files. Restart opencode and confirm the
      skill appears in the available skill list.

## Phase 2 — Session hygiene plugin — `in_progress`

**User approved this phase directly. Build it.**

**Goal.** Stop the 6-day, 39-compaction mega-session. Make the agent self-police
instead of relying on the user to notice.

Chosen surface: `experimental.chat.system.transform`, confirmed present in
`@opencode-ai/plugin@1.4.7`. It appends to `output.system` each turn. A TUI indicator
was considered and deferred, because it informs the user without constraining the agent.

- [x] **T2.1 Write `plugin/session-hygiene.ts`.** Track per-session start time,
      compaction count, and subagent count. Append an escalating warning to the system
      prompt. Thresholds derived from the observed data, all overridable through the
      plugin options tuple like `opencode-profile.ts` does:
      - soft, at 2 hours or 5 compactions: state the session age and compaction count,
        and instruct that any claim about the codebase must come from a fresh read.
      - hard, at 4 hours or 10 compactions: instruct the agent to tell the user to open
        a new session before starting new work, and to refuse to author merge request
        prose from context alone.
      Count compactions with `experimental.session.compacting`. Track age from the first
      `chat.message` for the session.

      **Done. Written to both paths, and the two files are identical.** Uses the three
      hooks above. Handles the optional `input.sessionID`. Prefers the real session start
      time and falls back to first-seen time.

      *What I verified myself, not taken from the subagent report:*
      - `Session.time.created` is a real `number` field on both the v1 and the v2 SDK
        `Session` type. `session.get` takes `path: { id: string }`. So the real-age path
        works, and the fallback is a true fallback rather than a silent permanent
        degradation.
      - Both `opencode.json` files parse as valid JSON. Each `plugin` array gained exactly
        one entry. The deployed copy uses an absolute path. The repo copy uses the
        relative form.
      - `diff` of the two plugin files prints nothing.
      - Typecheck reports only `TS1360`, which the pre-existing `opencode-profile.ts`
        also reports. The new file avoids the `TS7006` and `TS2580` errors that
        `opencode-profile.ts` has, so it is cleaner than the existing plugin.
      - The subagent claim that global plugins are auto-discovered as well as explicitly
        registered is **not yet verified by me.** The subagent says the loader dedupes by
        file URL, so the warning loads once. Confirm this after restart. If it loads
        twice, the warning appears twice.

      *Defect I found in the subagent's code and fixed.* The first version called
      `client.session.get` inside `experimental.chat.system.transform`, so it made one API
      call every turn. The start time never changes. It now fetches once per session and
      caches the result, and a failed fetch does not retry every turn.

      *Review notes I did not act on.* The session `Map` never evicts, so a long-running
      opencode server leaks slowly. The hook parameters use hand-written inline types
      instead of the real SDK hook types, so a signature change would not raise an error.
      The hook parameter name `input` shadows the outer `PluginInput`. None of these block
      the ticket.

      *Runtime behaviour is NOT verified.* See the human review queue.

- [x] **T2.2 Register the plugin.** Added to the `plugin` array in both `opencode.json`
      files. The deployed copy uses an absolute path, matching how it registers
      `opencode-profile.ts`. The repo copy uses `./plugin/session-hygiene.ts`.
      *Verified:* `jq -e .` passes on both files. Each `plugin` array gained exactly one
      entry and no other key changed.
      *Still to confirm after restart:* opencode starts without a `ConfigInvalidError`,
      and `opencode-profile.ts` still routes models correctly. Config loads once at
      start, so the plugin does nothing until the user restarts opencode.

## Phase 3 — Update the existing skills and AGENTS.md — `pending`

**Goal.** Three rules were already written down and still got broken. Make them
mechanical rather than aspirational.

- [ ] **T3.1 Orphan rule in the `plan` skill.** A ticket that builds something without
      wiring it must create a paired wire-up ticket. No ticket closes while a new
      exported symbol has no non-test caller.
      *Evaluation:* the rule text names the check command. Run that command against the
      `useLuaLintSandbox` commit and confirm it flags the orphan.

- [ ] **T3.2 Claim-evidence rule in the `review` skill.** A review must separate what
      the reviewer read from what it inferred, and must carry hedges forward verbatim.
      *Evaluation:* the `review` skill body references the `verification` skill.

- [x] **T3.3 Checkbox rule — moved to Phase 4.** The user asked for this rule to live in
      the `working-with-soapbox` skill, because it is a soapbox project rule and not a
      general engineering rule. Folded into T4.1. Issue #320 already exists, so this
      effort does not open it.

- [ ] **T3.4 Plan-artifact rule.** No `PLAN.md`, ticket file, or `Plan:` commit may
      enter a product repo. `AGENTS.md` already says this. Restate it as a pre-push
      check.
      *Evaluation:* the rule names the check. Confirm it would have caught the 26
      `Plan:` commits and `AI_CHAT_TILES_PLAN.md` on `ai-chat-tlc`.

- [ ] **T3.5 Resolve the config drift and document the personal MCP servers.** Apply the
      decisions recorded above under "Pre-existing drift, resolved". Also add a short
      `README.md` note that names the `blinkit` and `zepto` MCP servers and gives each
      URL, without adding them to the repo `opencode.json`.
      *Evaluation:* `diff -rq ~/.config/opencode/ ~/repos/dotfiles-ai/` shows only the
      files this plan chose to keep different, which are `.gitignore`, `opencode.json`,
      and the repo-only files. `README.md` names both MCP servers with their URLs.

- [x] **T3.6 Delete the `see` subagent.** The user asked for this. The agent was defined
      inline in the `agent` block of both `opencode.json` files, not in an `agent/*.md`
      file. Removed from both. The deployed copy keeps its `general` and `explore`
      entries. The repo copy now has no `agent` key at all. Also removed the stale table
      row that documented the agent in `OPENCODE_SETUP.md:334`.
      *Verified:* `jq -e .` reports both files as valid JSON. A Python check of the
      parsed `agent` keys reports `['general', 'explore']` for the deployed copy and no
      `agent` key for the repo copy. No `agent/see.md` file existed.
      *Follow-up found while doing this, not yet fixed.* `OPENCODE_SETUP.md:331-333` still
      says `coder`, `tester`, and `researcher` route to `opencode-go/deepseek-v4-pro` for
      work. The deployed agent files now say `opencode-go/deepseek-v4-flash`. That
      documentation is wrong. Fix it under T3.5, because the same drift caused it.

## Phase 4 — `working-with-soapbox` skill — `pending`

**Goal.** Let the agent answer "what should I work on" from the tracker instead of from
whatever it noticed while reading code. !249 fixed a cosmetic gap the AI found itself,
in the same function as #229, which the DevRel lead reported in April from a real
iPhone 12.

- [ ] **T4.1 Write `skills/working-with-soapbox/SKILL.md`.** Cover: the `soapbox-pub`
      group on gitlab.com, the stacked-MR and squash-merge workflow, the 11-step
      `CONTRIBUTING.md:67` contribution workflow, the seven close-without-review
      triggers at `CONTRIBUTING.md:166`, the `Regression-of:` trailer convention, and
      the one-bug-one-MR rule. State where to pull work from, in priority order:
      unassigned P1 issues, then human-reported bug clusters, then everything else.
      Self-discovered work ranks last. Name the reviewer bot `dirkrost` and the
      colleagues whose lanes need a heads-up.
      Also carry the checkbox rule moved here from T3.3. Never edit, reword, or negate a
      checklist item in the merge request template to make it checkable. Leave the box
      unchecked. Say why in the description. Point at the open issue that asks to change
      the rule. Use `CONTRIBUTING.md:63` and issue #320 as the worked example, and state
      that #320 is already open so nobody opens a duplicate.
      *Evaluation:* ask a fresh session "what should I work on in ditto" and confirm it
      returns tracker issues in priority order, and that it names the open P1s and the
      iOS cluster ahead of anything self-discovered.

## Phase 5 — Rebuild the measurement side — `pending`

**What this means.** "Dashboard" here means the scripts in
`~/ai-scratch/session-analysis/` that produced `REPORT.md` and
`WORKFLOW_COST_REPORT.md`. Those scripts count cost, task time, commits, and
frustration. They do not count whether the work landed or whether the claims held up.

**Why it needs work.** The old numbers said the workflow got 4 times faster and finished
more work. The outside numbers moved the other way. Merge rate fell from 72.8% to 28.6%.
Median time to merge rose from 0.04 days to 10.5 days. Median merge request size grew
from 3 files to 64 files. The old scripts counted a `git commit` as "finished". A commit
only records that the AI decided it was done.

**Blocked on two answers.**

1. The user asked "what dashboard?" Confirm the user wants these scripts changed at all.
   Skip this phase if the user does not care about the measurement side.
2. `~/ai-scratch/session-analysis/PLAN.md` already exists. The `plan` skill forbids
   overwriting a planning file it did not create. Ask whether to add a phase to that
   file or to make a separate file.

- [ ] **T5.1 GitLab outcome puller.** Pull merge rate, time-to-merge, merge request
      size, review findings split blocking and non-blocking, and struck-claim count.
- [ ] **T5.2 Replace commit-based completion with merge-based completion.**
- [ ] **T5.3 Add the struck-claim metric.** Count claims a reviewer rejected as
      unsupported. That is the actual defect class, and it was never counted.

---

## Human review queue

- [ ] Phase 1 (verification skill) — run it yourself against a real MR description and
      judge whether it would have caught the invented root cause without hints.
- [ ] Ticket T2.2 (plugin loads) — restart opencode. Confirm it starts with no
      `ConfigInvalidError`. Confirm `OPENCODE_PROFILE=me` still routes the subagents.
- [ ] Ticket T2.1 (warning reaches the model) — set `softAgeHours` and `softCompactions`
      to a tiny value in a scratch session. Then ask the agent to repeat its
      session-hygiene instruction. Confirm the text arrives, and confirm it arrives
      **once** and not twice. Twice means the explicit registration and the
      auto-discovered copy both loaded.
- [ ] Ticket T2.1 (is it useful) — work a normal day with the plugin on. Judge whether
      the escalating warning changes behaviour, or becomes noise you learn to ignore.
- [ ] Phase 4 (soapbox skill) — ask the agent what to work on and check the answer
      against what you actually think is most urgent.

## Benchmarking

| Metric | Count / Value | Notes |
|---|---|---|
| Verification catch rate | 0 / 0 | independent checks that caught a real discrepancy, vs. total checks performed |
| Escaped defect rate | 0 / 0 | bugs found after a ticket was marked `done`, vs. tickets closed |
| Rework/reopen rate | 0 / 0 | tickets reopened or rescoped after grilling settled them, vs. tickets grilled |
| Rough cost | — | turns/tokens on grilling + planning + dispatch + review per ticket, vs. rough direct-implementation cost |
