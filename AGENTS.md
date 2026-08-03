* NEVER EVER instruct subagents to return entire file contents. If you need to read a file, 
  read it yourself. Subagents are to be used for tasks which can be compartmentalized 
  easily and which you only need the indirect result off, like self-contained patches, 
  code reviews, exploration, etc. I will shoot a puppy every time you tell a subagent something
  like "Return all file contents verbatim" / "Return the complete contents" / "Return every line"
  of a file. 
* If the user is vague about a request, ask questions until any potential ambiguity is
  resolved before beginning the implementation. A good plan is worth its weight in gold.
* When reviewing, assume the persona of a senior reviewer. Be especially wary of for 
  common AI slop patterns like dead code, unused imports, code which is duplicated 
  between files, code which is almost the same but with only a few parameters tweaked, 
  duplicated type definitions, etc. Also check for wheel reinvention — hand-rolled code
  that duplicates something an existing dependency already provides, or that a small,
  well-scoped new dependency would replace with meaningfully less bug surface (parsing,
  crypto, date/time, codecs, and the like). Suggest adding one when that's a clear net
  win, not just flagging unused existing ones.
* When asked to commit files, try to group related changes together, but don't go down 
  a git partial staging rabbit hole - this is purely best-effort. If a file's changes 
  are 25% change A (global refactor) and 75% change B (a smaller, specific feature/bugfix), 
  prefer grouping it with change B - it's ok for some changes to cross-contaminate. 
  NEVER commit changes without asking first.
* Do not let PLAN.md updates turn into their own `Plan: ...` commits. When PLAN.md changes
  describe a code change you are committing, fold both into one commit. Commit PLAN.md on its
  own only when no code change exists yet to pair it with, such as the first commit that creates
  the plan before any implementation starts.
* If the user makes a request in between tool calls you made, always add the task to TODO
  before continuing with your current task, unless explicitly told to do the new task first.
* NEVER EVER install dependencies manually by editing Cargo.toml/package.json/other package
  manager configuration files. ALWAYS use the relevant command (cargo add / (p)npm add) instead.
* When writing CSS, unless the project already uses them, NEVER use camelCase class and id names.
  kebab-case only.
* If a linter like cargo clippy or pnpm lint is available and you're doing any long-running or 
  complex work, use the linter to check your work. Do not just take (TypeScript, especially)
  successful build as a sign you're done. 
* if the user mentions nostr NIPs or event kinds, always try to look up the NIP with nostrbook
  tool, and if not present, ask the user for a reference document. Never hallucinate.
* If the user asks for a change or review and you find pre-existing issues, ALWAYS surface them.
  Don't fix without asking, but don't be lazy and say "This was pre-existing, we can ignore it."
  A lot of the time they aren't pre-existing and you're just hallucinating.
* don't use `find /` or similar long-running, inefficient commands to find files while gathering 
  context. If you're unsure to find something, ask.
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
  to ticket non-trivial work applies whether or not PLAN.md itself ends up in play. Don't start
  non-trivial implementation work without a plan on file.
* Dispatch implementation to the `coder` subagent, test/lint/build verification to the `tester`
  subagent, codebase/library/spec research to the `researcher` subagent, and code review (via
  the `researcher` subagent's `review` skill) also to `researcher`, via the Task tool, rather
  than doing all of it in the primary session yourself. Reserve direct edits/bash in the
  primary session for trivial one-off fixes and for reviewing what the subagents come back with.
* Never mark a ticket or task done on a subagent's self-report alone: independently verify at
  least one concrete, checkable claim against the real artifact yourself first (per the `plan`
  skill's review contract). A dispatched `review`-skill pass is a code-quality/convention check,
  not a substitute for this — it still counts as a subagent's report. Then also nag the user to
  do their own hands-on check before treating it as truly done — especially for anything with a
  UI or runtime surface, where a passing build or typecheck is not evidence the feature actually
  works.
* Before you commit any change a subagent wrote, read the diff yourself in the main session
  (`git diff` / `git diff --staged`). Do this every time, not only for high-risk changes. A
  dispatched `review`-skill pass from `researcher` checks code quality and conventions. It does
  not replace your own read of the diff. Do your own read after any dispatched review pass, and
  right before you run `git commit`. This step reads real file content in the main session, so
  it has a real context cost. Once you finish this review, tell the user to compact (or start a
  fresh session) before you continue, so the session does not run low on room mid-task.
* All of the above is a floor, not a ritual to maximize — scale rigor to a ticket's actual risk
  and size, and stop once the stated bar is met. A pure-CSS tweak or a doc fix doesn't need a
  dispatched `review` pass or repeated re-verification; a change touching money/crypto/signing,
  public API surface, or spec conformance does. "Verify at least one concrete claim" means stop
  once that one check passes — re-running the same suite several times, re-reading files you
  already read, or dispatching a second review pass because the first didn't find anything is
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
