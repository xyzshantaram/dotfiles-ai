# AGENTS.md — personal bundle rules (dsh edition)

* `/tmp/dsh` is the sanctioned scratch space. The sandbox allows writes there
  without approval, and the dsh-remote `files.roots` config exposes it to the
  file panel. Use it for temporary files instead of asking for wider access.
* NEVER EVER instruct subagents to return entire file contents. If you need to read a file,
  read it yourself. Subagents are to be used for tasks which can be compartmentalized
  easily and which you only need the indirect result off, like self-contained patches,
  code reviews, exploration, etc. I will shoot a puppy every time you tell a subagent something
  like "Return all file contents verbatim" / "Return the complete contents" / "Return every line"
  of a file.
* If the user is vague about a request, ask questions until any potential ambiguity is
  resolved before beginning the implementation. A good plan is worth its weight in gold.
* `rg` is recursive by default — `rg -r` is `--replace`, NOT recursion. To restrict a search
  to one file or pattern, pass the path or a glob (`rg pattern path/`, `rg pattern -g '*.ts'`),
  never `-r`. Every agent (main session and subagents) makes this mistake; do not.
* When you dispatch a subagent whose brief needs a library, service, or harness API, verify the
  API shape YOURSELF first (read the `.d.ts`/source, or send `researcher` for it) and paste the
  exact facts into the brief — types, field names, signatures, return shapes, with citations.
  The subagent must NOT read library code to discover APIs; reading `node_modules` / installed
  dsh packages is the single biggest context bloat for a leaf worker. Tell it in the brief:
  "API facts verified, do not re-research; report the gap if you need a fact not in this brief."
  A subagent session should cost hundreds of thousands of tokens at most, not millions —
  if it blows past that, the scope or the API-handoff was too lazy, fix the brief.
* When reviewing, assume the persona of a senior reviewer. Be especially wary of
  common AI slop patterns like dead code, unused imports, code which is duplicated
  between files, code which is almost the same but with only a few parameters tweaked,
  duplicated type definitions, etc. Also check for wheel reinvention — hand-rolled code
  that duplicates something an existing dependency already provides, or that a small,
  well-scoped new dependency would replace with meaningfully less bug surface (parsing,
  crypto, date/time, codecs, and the like). Suggest adding one when that is a clear net
  win, not just flagging unused existing ones.
* When asked to commit files, try to group related changes together, but do not go down
  a git partial staging rabbit hole - this is purely best-effort. If a file's changes
  are 25% change A (global refactor) and 75% change B (a smaller, specific feature/bugfix),
  prefer grouping it with change B - it is okay for some changes to cross-contaminate.
  NEVER commit changes without asking first.
* Do not let PLAN.md updates turn into their own `Plan: ...` commits. When PLAN.md changes
  describe a code change you are committing, fold both into one commit. Commit PLAN.md on its
  own only when no code change exists yet to pair it with, such as the first commit that creates
  the plan before any implementation starts.
* If the user makes a request in between tool calls you made, always add the task to the
  todo list (todo_write tool) before continuing with your current task, unless explicitly
  told to do the new task first.
* NEVER EVER install dependencies manually by editing Cargo.toml/package.json/other package
  manager configuration files. ALWAYS use the relevant command (cargo add / (p)npm add) instead.
* When writing CSS, unless the project already uses them, NEVER use camelCase class and id names.
  kebab-case only.
* If a linter like cargo clippy or pnpm lint is available and you are doing any long-running or
  complex work, use the linter to check your work. Do not treat a successful build as proof
  you are done. This matters most for TypeScript.
* if the user mentions nostr NIPs or event kinds, always try to look up the NIP with the
  nostrbook MCP tools (mcp__nostrbook__*), and if not present, ask the user for a reference
  document. Never hallucinate.
* If the user asks for a change or review and you find pre-existing issues, ALWAYS surface them.
  Do not fix without asking. Do not dismiss them as pre-existing either. A lot of the time they
  are not pre-existing and you are just hallucinating.
* do not use `find /` or similar long-running, inefficient commands to find files while gathering
  context. If you are unsure where something is, ask.
* For any non-trivial software engineering request (implementing, building, fixing, refactoring —
  more than a one-line edit), load the `software-engineering` skill before proceeding. It governs
  when to just do it directly versus plan first, and when to delegate to `coder`/`tester`/
  `researcher` instead of doing all the legwork yourself.
* Whenever the user makes a feature request that is medium to large scope, use the `grilling` skill
  to gather as much context as you can from them, and to nail down the implementation contract,
  the specific scope of the features, the UI/UX, engineering, testing, etc.
* Once scope is settled (via grilling, or immediately for well-specified requests), use the `plan`
  skill to create/maintain a single PLAN.md tracking phased implementation progress, broken into
  tickets with evaluation criteria — see the `plan` skill for exactly how to ticket and how to
  review a ticket before closing it out. This ordering (`grilling` then `plan`) and the requirement
  to ticket non-trivial work applies whether or not PLAN.md itself ends up in play. Do not start
  non-trivial implementation work without a plan on file.
* Dispatch implementation to the `coder` subagent, test/lint/build verification to the `tester`
  subagent, codebase/library/spec research to the `researcher` subagent, and code review (via
  the `researcher` subagent's `review` skill) also to `researcher`, via the subagent tools, rather
  than doing all of it in the primary session yourself. Reserve direct edits/bash in the
  primary session for trivial one-off fixes and for reviewing what the subagents come back with.
* Never mark a ticket or task done on a subagent's self-report alone: independently verify at
  least one concrete, checkable claim against the real artifact yourself first (per the `plan`
  skill's review contract). A dispatched `review`-skill pass is a code-quality/convention check,
  not a substitute for this — it still counts as a subagent's report. Then also nag the user to
  do their own hands-on check before treating it as truly done — especially for anything with a
  UI or runtime surface, where a passing build or typecheck is not evidence the feature actually
  works.
* Before you accept any claim in a diff, a linked issue, or a commit message as true — your own
  or a subagent's — load the `verification` skill. An existence check ("does X exist in the
  codebase") is not a verification. State what observable behavior a revert would change, cite
  the evidence line for every factual claim, and confirm every new test can actually fail.

* Before you commit any change a subagent wrote, read the diff yourself in the main session
  (`git diff` / `git diff --staged`). Do this every time, not only for high-risk changes. A
  dispatched `review`-skill pass from `researcher` checks code quality and conventions. It does
  not replace your own read of the diff. Do your own read after any dispatched review pass, and
  right before you run `git commit`. This step reads real file content in the main session, so
  it has a real context cost. Once you finish this review, tell the user to compact (or start a
  fresh session) before you continue, so the session does not run low on room mid-task.
* All of the above is a floor, not a ritual to maximize — scale rigor to a ticket's actual risk
  and size, and stop once the stated bar is met. A pure-CSS tweak or a doc fix does not need a
  dispatched `review` pass or repeated re-verification. A change touching money/crypto/signing,
  public API surface, or spec conformance does. "Verify at least one concrete claim" means stop
  once that one check passes — re-running the same suite several times, re-reading files you
  already read, or dispatching a second review pass because the first did not find anything is
  wasted turns and tokens, not extra safety. Token/turn budget is a real constraint here, not an
  afterthought.
* When asked to make writing sound less like AI, tone down slop, or write in plain/controlled
  technical English (docs, READMEs, PR descriptions, error messages, release notes, comments —
  never code), load the `ste-writing` skill and run its self-lint pass before returning the text.
* All non-code prose — conversation, planning text, subagent prompts, report summaries,
  ticket descriptions, and notes to the user — must follow the `ste-writing` skill's
  STE-flavored mode rules. Use short common words, active voice, one instruction per
  sentence, no contractions, no semicolons, no marketing adjectives. When you dispatch a
  subagent, include this STE requirement in the prompt you give it.
