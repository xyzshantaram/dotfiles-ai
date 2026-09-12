# split-utils — hands-on review checklist

This list holds only what a machine cannot answer. Everything a machine can check already passed on
2026-09-10:

- `deno task check` — exit 0, all 25 source and wizard files.
- `deno task test` — 50 passed, 0 failed (log-drift 12, splitstate 15, secret-perms 1, settings 5,
  share 5, runstate 7, render 3, aggregate 2).
- `deno task test:fixtures` — ALL MATCH, 46 files, run twice.
- `deno lint` — 57 notes, all style-level (import prefixes, no-window); no unused imports or dead
  code remain.
- Pusher, splitter, and gatherer dry modes — exit 0, plain copy, no ids, paths, or fingerprints on
  screen.
- Secret files — mode 600 on token, login-state, and config files.
- Share links — paste.rs primary and dpaste fallback round-trip live.

Work through the list in order. Each block names what must NOT happen.

## A. First run and onboarding

1. Move `state/config/settings.json` aside. Run `deno task menu`. The menu must show ONE item only:
   "Start here" with its hint. Walk the three questions (use mode, currency, Splitwise or skip). End
   must read "You are all set." and the full menu appears. Restore your settings file afterwards.
   NOT: any other menu row before onboarding finishes; the "Ready to start?" gate is gone.
2. Pick "With an AI helper" in a test run. The copyable block must carry the new intro line and the
   machine block stays exact.

## B. Collect — needs your real logins

3. Zepto: collect 30 days. Watch the small window, the sign-in wait line, per-order progress, and
   the plain end summary.
4. Blinkit: same walk.
5. Swiggy: same walk. This machine beat the WAF before; confirm it still does.
6. Zomato: type the OTP, answer the city-code question with its new wording, confirm history loads
   and tokens land under `state/share/`.
7. Manual entry: add one expense by hand. Same plain summary. NOT: any secret, path, or command on
   screen; any "custom" wording.

## C. Split — interactive

8. Split the run you gathered. Read the key legend aloud once: it must need no explanation. Exercise
   each key once (a, n, r, m, Enter, c, s, b). Fee items must come pre-split equally.
9. Quit mid-order with b, then "Pick up where you left off". The row must read "Sep 10 — N of M
   orders done" and resume on the exact unfinished item.
10. Optional: open two splitter sessions on one run. The second save must say the spare-copy line
    and drop a `.json` spare in the run dir. NOT: the old "Output is ready" wording; ids or paths on
    screen.

## D. Upload

11. Live push through the TS pusher. All 15 old orders already carry fingerprints — push one NEW
    order (a fresh Zepto gather is the cleanest), or back up
    `~/.cache/ordersplit/splitwise_pushed.json`, delete one entry, push that order, then decide
    whether to restore.
12. No-account summary: with no Splitwise key configured, run Upload. The menu must offer "Write one
    short summary instead. No Splitwise login needed." Confirm "Saved your expense summary." and the
    file lands next to the source file.
13. Someone else's orders: make a share link, then consume it through "Push someone else's orders"
    with "Paste the share link:".
14. Mid-range date: confirm "Last date kept: X. Skipped N later orders." matches the orders shown.
    NOT: fingerprints, expense ids, run ids, or log paths on screen.

## E. Public release gates — before the first push to GitHub

15. Replace `YOURUSER` placeholders: README install one-liners and issues link, `install.sh`,
    `install.ps1`, and the issues URL in `src/drift.ts`.
16. Cold-box install: follow the README alone on one clean Linux box and one Windows box (VM is
    fine). The one-liner must open the main menu. Marked unverified by me — installers were syntax
    checked only.
17. Final real-data sweep before `git init`: search the tree that would be committed for real names
    and brands. Fixtures are synthetic (verified); check docs and comments too. `state/` is
    gitignored — confirm with `git status` after init.
18. `git init` and first commit — your call on repo name and owner. Ask me and I will run it.

## F. After your sign-off

19. The aidos scratch prompt (T2) still needs a `~/.dsh` write you must approve or run yourself.
20. Python retirement (T16): once you have run one full flow through the wizards, delete the
    `expense-split` skill from dotfiles-ai. The final Python version is already committed at
    `be1523d`.

## What must NOT happen — anywhere, ever

- `state/`, env files, or token files reach the public repo.
- An unredacted secret appears in a run log (spot-check one log after the live runs).
- A user-facing line shows a bare path, command, fingerprint, or id (the AI setup block is the one
  deliberate exception: it is read by the user's AI tool, not the user).
- The words "meta wizard" or a platform named "custom" appear in UI copy.
