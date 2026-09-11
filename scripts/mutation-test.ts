#!/usr/bin/env -S deno run --allow-run --allow-read --allow-write
/**
 * Run mutation tests deterministically, so the result is an artifact rather
 * than a claim.
 *
 * Self-contained: Deno built-ins only, no imports, no dependency to install.
 * Run it straight from a checkout or by URL.
 *
 * WHY THIS EXISTS. Mutation testing is the one verification technique agents
 * reliably fake, and the fakes all look like work. Observed, all on one day: a
 * `mutation-test.sh` that built a mutated copy of a source file INSIDE A SHELL
 * VARIABLE, grepped the variable, and printed ALL PASS for seven "mutations"
 * that never executed; a control experiment written in the conditional ("if X
 * were moved earlier, Y would not be included"); and a claim that a value was
 * "proven by mutation" when forcing it to a constant left every test green.
 * None survive a reviewer who counts. All are impossible here, because this
 * script does the applying, running and reverting itself, and refuses when it
 * cannot prove each step.
 *
 * WHAT IT GUARANTEES, in order. Each exists because skipping it is how a
 * mutation run produces a meaningless PASS:
 *
 *   1. THE TREE IS CLEAN before anything is applied; a revert can only be
 *      proven against a known state.
 *   2. HEAD IS THE COMMIT YOU MEANT. It refuses rather than checking out: this
 *      runs in a real worktree, and moving someone's HEAD to be helpful is how
 *      work gets lost.
 *   3. THE BASELINE IS GREEN. If the suite already fails, every mutation
 *      "kills" trivially and the run means nothing. This is the check most
 *      often missing from a hand-rolled loop.
 *   4. EACH PATCH ACTUALLY CHANGED TRACKED SOURCE. An empty diff after apply is
 *      the shell-variable failure, caught mechanically.
 *   5. ONE MUTATION AT A TIME, reverted before the next. Two at once and a
 *      green result tells you nothing about either.
 *   6. THE REVERT IS VERIFIED by `git status --porcelain` being empty again. If
 *      it is not, the run STOPS: continuing would stack mutations and every
 *      later result would be a lie.
 *
 * SURVIVORS ARE THE POINT. A mutation the suite does not catch is a coverage
 * gap and the most valuable thing a run produces. It is reported, not quietly
 * swapped for one that fails, and by default it makes the exit code non-zero so
 * it cannot be scrolled past.
 *
 *   THE --allow-survivors CAVEAT ON EXIT 0. The flag exists for the honest
 *   case: the gap is real, recorded on the ticket, and verification must
 *   proceed anyway. But an exit 0 run WITH the flag is not a clean bill of
 *   health — it means "survivors were allowed", and how many is in the
 *   report. Any claim quoting this script's exit 0 must also state that
 *   --allow-survivors was passed and how many mutations survived; an exit 0
 *   presented as "all mutations killed" while the flag was set is exactly
 *   the fake this script exists to make impossible.
 *
 * USAGE
 *
 *   deno run --allow-run --allow-read --allow-write scripts/mutation-test.ts \
 *     --test "npx vitest run plugins/foo" \
 *     --patch /tmp/dsh/mut-1.patch --patch /tmp/dsh/mut-2.patch \
 *     [--commit HEAD] [--json /tmp/dsh/mutations.json] [--allow-survivors] \
 *     [--filter '(FAIL|AssertionError)'] [--nonce <token>]
 *
 * THE NONCE proves the report came from a run someone actually initiated.
 * An orchestrator dispatching this work generates a fresh random token, passes
 * it here, and checks that the report it gets back carries it verbatim. A
 * report without the current token was invented, or is an older report shown
 * again -- both of which have happened. Verification is an exact equality
 * check on a random string, with no normalisation and no judgment: comparing
 * TEST COMMANDS for equivalence is fuzzy (whitespace, argument order, an
 * equivalent invocation, an absolute path where a relative one was given), and
 * a judgment call in an enforcement path is decoration.
 *
 * The nonce and the recorded facts defend against DIFFERENT attacks and
 * neither replaces the other. The nonce defeats fabrication and replay; it
 * says nothing about what the run did. The recorded command, commit and patch
 * digests defeat SUBSTITUTION -- a child can hold a valid nonce and still run
 * a weaker command. Those are read as evidence, not checked mechanically.
 *
 * It is optional here on purpose, so a person iterating locally is not taxed
 * by machinery that exists for delegated work.
 *
 * Generate each patch mechanically rather than writing one by hand: make the
 * edit, `git diff > /tmp/dsh/mut-1.patch`, then `git checkout -- .`. A
 * generated patch cannot contain the sed mistake, and its reverse is exact.
 *
 * THE FILTER IS COSMETIC AND ONLY COSMETIC. It selects which OUTPUT LINES are
 * shown and recorded, so a report carries the four lines that matter instead of
 * a thousand-line suite log. It has no influence on the verdict: killed or
 * survived is the test command's EXIT CODE, always. Deciding a mutation was
 * caught by grepping output is precisely the failure this script exists to make
 * impossible, and it must not creep back in as a feature.
 *
 * EXIT CODES
 *   0  every mutation was killed, or survivors were reported because
 *      --allow-survivors was passed (see the caveat above)
 *   1  at least one mutation survived (a coverage gap)
 *   2  the run could not be trusted: dirty tree, wrong HEAD, red baseline,
 *      empty or unappliable patch, or a revert that did not restore the tree
 */

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

const decoder = new TextDecoder();

function exec(command: string, args: string[], cwd?: string): RunResult {
  const output = new Deno.Command(command, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
  }).outputSync();
  return {
    code: output.code,
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
  };
}

/** Run through a shell, because --test is a command line, not an argv. */
function shell(commandLine: string, cwd: string): RunResult {
  return exec("bash", ["-lc", commandLine], cwd);
}

function git(args: string[], cwd: string): RunResult {
  return exec("git", args, cwd);
}

function fail(message: string): never {
  console.error("mutation-test: " + message);
  Deno.exit(2);
}

interface Args {
  patches: string[];
  test: string | null;
  commit: string | null;
  json: string | null;
  allowSurvivors: boolean;
  filter: string | null;
  nonce: string | null;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    patches: [],
    test: null,
    commit: null,
    json: null,
    allowSurvivors: false,
    filter: null,
    nonce: null,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = (): string => {
      i += 1;
      if (i >= argv.length) fail("missing value after " + arg);
      return argv[i];
    };
    if (arg === "--patch") args.patches.push(next());
    else if (arg === "--test") args.test = next();
    else if (arg === "--commit") args.commit = next();
    else if (arg === "--json") args.json = next();
    else if (arg === "--filter") args.filter = next();
    else if (arg === "--nonce") args.nonce = next();
    else if (arg === "--allow-survivors") args.allowSurvivors = true;
    else if (arg === "--help" || arg === "-h") {
      console.log("usage: mutation-test.ts --test <cmd> --patch <file> [--patch <file>...]");
      console.log("       [--commit <ref>] [--json <file>] [--allow-survivors]");
      console.log("       [--filter <regex>]   display only; never affects the verdict");
      console.log("       [--nonce <token>]    echoed verbatim, proving the run happened");
      Deno.exit(0);
    } else fail("unknown argument: " + arg);
  }
  if (args.test === null) fail("--test is required");
  if (args.patches.length === 0) fail("at least one --patch is required");
  return args;
}

/**
 * Last N lines, so a report carries evidence without a whole suite log. The
 * optional regex narrows which lines are kept. Display only: nothing decides
 * anything from this result.
 */
function tail(text: string, lines = 25, filter: RegExp | null = null): string {
  let all = text.replace(/\s+$/, "").split("\n");
  if (filter !== null) {
    const matched = all.filter((line) => filter.test(line));
    // A filter matching nothing shows the unfiltered tail rather than an empty
    // report: an empty evidence block reads as "nothing happened".
    if (matched.length > 0) all = matched;
  }
  return all.slice(Math.max(0, all.length - lines)).join("\n");
}

function fileExists(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

/** Short content digest of a patch, so a swapped patch set is visible. */
async function digest(path: string): Promise<string> {
  const bytes = await Deno.readFile(path);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface MutationRecord {
  patch: string;
  applied: boolean;
  killed: boolean | null;
  note: string;
  output: string;
  changed?: string;
  digest?: string;
}

const args = parseArgs(Deno.args);

let outputFilter: RegExp | null = null;
if (args.filter !== null) {
  try {
    outputFilter = new RegExp(args.filter);
  } catch (error) {
    fail("--filter is not a valid regular expression: " + String(error));
  }
}

const rootResult = git(["rev-parse", "--show-toplevel"], Deno.cwd());
if (rootResult.code !== 0) fail("not inside a git repository");
const root = rootResult.stdout.trim();

// (1) A clean tree, or a revert can never be proven.
const dirty = git(["status", "--porcelain"], root).stdout.trim();
if (dirty !== "") {
  fail(
    "the working tree has uncommitted changes, so a revert could not be verified.\n" +
      "Commit or stash first. Changed paths:\n" +
      dirty,
  );
}

// (2) HEAD is what the caller meant. Refuse rather than move it.
const head = git(["rev-parse", "HEAD"], root).stdout.trim();
if (args.commit !== null) {
  const wanted = git(["rev-parse", args.commit], root);
  if (wanted.code !== 0) fail("cannot resolve --commit " + args.commit);
  if (wanted.stdout.trim() !== head) {
    fail(
      "HEAD is " +
        head.slice(0, 12) +
        " but --commit resolves to " +
        wanted.stdout.trim().slice(0, 12) +
        ".\nCheck out that commit yourself; this script will not move your HEAD.",
    );
  }
}

for (const patch of args.patches) {
  if (!fileExists(patch)) fail("patch not found: " + patch);
}

// (3) The baseline must be green, or every mutation "kills" for free.
console.log("baseline: " + args.test);
const baseline = shell(args.test as string, root);
if (baseline.code !== 0) {
  fail(
    "the baseline test run FAILED, so mutation results would be meaningless:\n" +
      "a mutation cannot be shown to break a suite that is already broken.\n" +
      tail(baseline.stdout + baseline.stderr, 25, outputFilter),
  );
}
console.log("baseline: green\n");

const results: MutationRecord[] = [];
let survivors = 0;

for (const patchPath of args.patches) {
  const record: MutationRecord = {
    patch: patchPath,
    applied: false,
    killed: null,
    note: "",
    output: "",
  };

  const applied = git(["apply", patchPath], root);
  if (applied.code !== 0) {
    record.note = "patch did not apply: " + tail(applied.stderr, 8);
    results.push(record);
    console.log("SKIP     " + patchPath + " -- " + record.note);
    continue;
  }
  record.applied = true;

  // (4) It must have changed tracked source. An empty diff is the "mutated
  //     something that never runs" failure, caught mechanically.
  const changed = git(["diff", "--stat"], root).stdout.trim();
  if (changed === "") {
    git(["apply", "-R", patchPath], root);
    record.note = "patch applied but changed no tracked file";
    results.push(record);
    console.log("SKIP     " + patchPath + " -- " + record.note);
    continue;
  }
  record.changed = changed;
  record.digest = await digest(patchPath);

  const mutated = shell(args.test as string, root);
  record.killed = mutated.code !== 0;
  record.output = tail(mutated.stdout + mutated.stderr, 25, outputFilter);

  // (5)+(6) Revert, and prove it.
  const reverted = git(["apply", "-R", patchPath], root);
  const stillDirty = git(["status", "--porcelain"], root).stdout.trim();
  if (reverted.code !== 0 || stillDirty !== "") {
    results.push(record);
    fail(
      "REVERT FAILED after " +
        patchPath +
        ".\nThe tree is not back to " +
        head.slice(0, 12) +
        " and later results would be meaningless, so the run stops here.\n" +
        "Restore it yourself after inspecting: git checkout -- .\n" +
        stillDirty,
    );
  }

  const where = changed.split("\n")[0].trim();
  if (record.killed) {
    console.log("KILLED   " + patchPath + "  (" + where + ")");
  } else {
    survivors += 1;
    console.log("SURVIVED " + patchPath + "  (" + where + ")");
    console.log("  the suite stayed GREEN under this mutation: a coverage gap, not a bad mutation");
  }
  results.push(record);
}

const summary = {
  nonce: args.nonce,
  commit: head,
  test: args.test,
  total: results.length,
  killed: results.filter((r) => r.killed === true).length,
  survived: survivors,
  skipped: results.filter((r) => r.killed === null).length,
  results,
};

console.log(
  "\n" +
    summary.killed +
    " killed, " +
    summary.survived +
    " survived, " +
    summary.skipped +
    " not run, of " +
    summary.total,
);

if (args.nonce !== null) {
  // Printed as well as written, so a pasted terminal transcript carries the
  // proof too, not only the JSON file.
  console.log("nonce: " + args.nonce);
}

if (args.json !== null) {
  Deno.writeTextFileSync(args.json, JSON.stringify(summary, null, 2) + "\n");
  console.log("report: " + args.json);
}

if (summary.skipped > 0) Deno.exit(2);
if (survivors > 0 && !args.allowSurvivors) {
  console.error(
    "\nA surviving mutation is a coverage gap. Report it as a finding -- do not\n" +
      "replace it with one that happens to fail. Pass --allow-survivors once the\n" +
      "gap is recorded.",
  );
  Deno.exit(1);
}
Deno.exit(0);
