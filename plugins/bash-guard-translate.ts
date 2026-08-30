/**
 * Pure translation of `grep` and `find` command lines into the `rg` and `fd`
 * equivalents.
 *
 * The bash guard used to deny `grep` and `find` outright and tell the model to
 * use `rg` and `fd`. Weak models do not learn from a denial. They retry the
 * same command and burn tokens. The guard now translates the command and runs
 * the result instead. The model gets the output it asked for, plus short notes
 * about the parts that do not map exactly.
 *
 * Every function here is pure. There is no I/O, no logging, and no context.
 * Every flag emitted below is confirmed against the help output of
 * ripgrep 15.2.0 and fd 10.4.2.
 */

/** A translation that is safe to run as is. */
export interface TranslateOk {
  kind: "ok";
  /** The replacement command, including the command word at index 0. */
  argv: string[];
  /** Extra caveats worth telling the model. May be empty. */
  notes: string[];
}

/** A translation that must prompt the user before it runs. */
export interface TranslateAsk {
  kind: "ask";
  argv: string[];
  notes: string[];
  /** Why approval is needed. One short sentence. */
  why: string;
}

/** No safe translation exists. */
export interface TranslateBlocked {
  kind: "blocked";
  /** Names the exact blocking token. One short sentence. */
  why: string;
}

export type TranslateOutcome = TranslateOk | TranslateAsk | TranslateBlocked;

/**
 * Translate one command.
 * @param args - the arguments after the command word.
 * @param name - the invoked command basename, for example "egrep".
 */
export type Translator = (args: string[], name: string) => TranslateOutcome;

/** Characters that never need shell quoting. */
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;

/** Quote one word for safe re-emission into a shell command string. */
export function shellQuote(word: string): string {
  if (SHELL_SAFE.test(word)) return word;
  return "'" + word.split("'").join("'\\''") + "'";
}

function blocked(why: string): TranslateBlocked {
  return { kind: "blocked", why };
}

/** Append a note once. Repeated flags must not repeat the same caveat. */
function addNote(notes: string[], note: string): void {
  if (!notes.includes(note)) notes.push(note);
}

// ---------------------------------------------------------------------------
// grep -> rg
// ---------------------------------------------------------------------------

/** grep short flags that take no value, keyed by letter. */
const GREP_PLAIN_FLAGS: Record<string, string[]> = {
  i: ["-i"],
  n: ["-n"],
  v: ["-v"],
  c: ["-c"],
  l: ["-l"],
  L: ["--files-without-match"],
  w: ["-w"],
  x: ["-x"],
  F: ["-F"],
  E: [],
  P: ["-P"],
  o: ["-o"],
  a: ["-a"],
  q: ["-q"],
  s: ["--no-messages"],
  h: ["--no-filename"],
  H: ["-H"],
  z: ["--null-data"],
  r: [],
  R: [],
};

/** Caveats raised by a grep short flag that does not map one to one. */
const GREP_PLAIN_NOTES: Record<string, string> = {
  E: "rg uses regular expressions by default, so -E was dropped.",
  r: "rg searches directories by default, so the recursive flag was dropped. rg also skips hidden files and files listed in .gitignore.",
  R: "rg searches directories by default, so the recursive flag was dropped. rg also skips hidden files and files listed in .gitignore.",
  h: "grep -h became rg --no-filename. The rg short form is -I, not -h.",
  z: "grep -z became rg --null-data. The rg -z flag means --search-zip instead.",
};

/** grep long flags that take no value, mapped to their short letter. */
const GREP_LONG_PLAIN: Record<string, string> = {
  "--ignore-case": "i",
  "--line-number": "n",
  "--invert-match": "v",
  "--count": "c",
  "--files-with-matches": "l",
  "--files-without-match": "L",
  "--word-regexp": "w",
  "--line-regexp": "x",
  "--fixed-strings": "F",
  "--extended-regexp": "E",
  "--perl-regexp": "P",
  "--only-matching": "o",
  "--text": "a",
  "--quiet": "q",
  "--silent": "q",
  "--no-messages": "s",
  "--no-filename": "h",
  "--with-filename": "H",
  "--null-data": "z",
  "--recursive": "r",
  "--dereference-recursive": "R",
};

/** grep short flags that take a value, mapped to an internal key. */
const GREP_SHORT_VALUE: Record<string, string> = {
  e: "e",
  f: "f",
  A: "A",
  B: "B",
  C: "C",
};

/** grep long flags that take a value, mapped to an internal key. */
const GREP_LONG_VALUE: Record<string, string> = {
  "--regexp": "e",
  "--file": "f",
  "--after-context": "A",
  "--before-context": "B",
  "--context": "C",
  "--include": "include",
  "--exclude": "exclude",
};

const GREP_EXCLUDE_NOTE = "grep --exclude became an rg negated glob, written -g !GLOB.";
const GREP_EGREP_NOTE = "rg uses regular expressions by default, so egrep needed no extra flag.";

function translateGrep(args: string[], name: string): TranslateOutcome {
  const flags: string[] = [];
  const notes: string[] = [];
  const positional: string[] = [];
  let patternGiven = false;

  if (name === "fgrep") flags.push("-F");
  if (name === "zgrep") flags.push("-z");
  if (name === "egrep") addNote(notes, GREP_EGREP_NOTE);

  /** Emit one value-taking flag. */
  const applyValue = (key: string, value: string): void => {
    if (key === "include") {
      flags.push("-g", value);
      return;
    }
    if (key === "exclude") {
      flags.push("-g", "!" + value);
      addNote(notes, GREP_EXCLUDE_NOTE);
      return;
    }
    if (key === "e" || key === "f") patternGiven = true;
    flags.push("-" + key, value);
  };

  let endOfFlags = false;
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    i += 1;

    if (endOfFlags || arg === "-" || !arg.startsWith("-")) {
      positional.push(arg);
      continue;
    }
    if (arg === "--") {
      endOfFlags = true;
      continue;
    }

    if (arg.startsWith("--")) {
      const eq = arg.indexOf("=");
      const flagName = eq === -1 ? arg : arg.slice(0, eq);
      const inline = eq === -1 ? undefined : arg.slice(eq + 1);

      const valueKey = GREP_LONG_VALUE[flagName];
      if (valueKey !== undefined) {
        let value = inline;
        if (value === undefined) {
          if (i >= args.length) return blocked(`The grep flag ${flagName} needs a value.`);
          value = args[i];
          i += 1;
        }
        applyValue(valueKey, value);
        continue;
      }

      const plainKey = GREP_LONG_PLAIN[flagName];
      if (plainKey !== undefined) {
        if (inline !== undefined) return blocked(`The grep flag ${flagName} takes no value.`);
        flags.push(...GREP_PLAIN_FLAGS[plainKey]);
        const note = GREP_PLAIN_NOTES[plainKey];
        if (note) addNote(notes, note);
        continue;
      }

      return blocked(`rg has no safe equivalent for the grep flag ${flagName}.`);
    }

    let rest = arg.slice(1);
    while (rest.length > 0) {
      const key = rest[0];
      rest = rest.slice(1);

      if (GREP_SHORT_VALUE[key] !== undefined) {
        let value = rest;
        rest = "";
        if (value === "") {
          if (i >= args.length) return blocked(`The grep flag -${key} needs a value.`);
          value = args[i];
          i += 1;
        }
        applyValue(GREP_SHORT_VALUE[key], value);
        continue;
      }

      if (GREP_PLAIN_FLAGS[key] === undefined) {
        return blocked(`rg has no safe equivalent for the grep flag -${key}.`);
      }
      flags.push(...GREP_PLAIN_FLAGS[key]);
      const note = GREP_PLAIN_NOTES[key];
      if (note) addNote(notes, note);
    }
  }

  if (!patternGiven && positional.length === 0) {
    return blocked("The grep command has no pattern to translate.");
  }

  // The first positional is the pattern unless -e or -f already gave one.
  // Every later positional is a path. Both cases keep the original order.
  return { kind: "ok", argv: ["rg", ...flags, ...positional], notes };
}

// ---------------------------------------------------------------------------
// find -> fd
// ---------------------------------------------------------------------------

/** find -type letters that fd -t accepts unchanged. */
const FIND_TYPES = ["f", "d", "l", "s", "p", "b", "c"];

/** find -size unit suffixes mapped to the fd unit spelling. */
const FIND_SIZE_UNITS: Record<string, string> = {
  c: "b",
  k: "ki",
  M: "mi",
  G: "gi",
};

/** find boolean operators. fd has no boolean expression language. */
const FIND_OPERATORS = ["-o", "-or", "-a", "-and", "-not", "!", "(", ")"];

/** find predicates with no safe fd equivalent. */
const FIND_UNSAFE = ["-execdir", "-ok", "-okdir", "-fprint", "-fprintf", "-fls"];

const FIND_IGNORE_NOTE =
  "fd skips hidden files and files listed in .gitignore by default. find does not.";
const FIND_FULLPATH_NOTE =
  "fd -p matches the full absolute path. find matches the path from the start point.";
const FIND_REGEX_NOTE = "fd matches a regex anywhere in the path. find -regex must match it all.";
const FIND_SIZE_NOTE =
  "fd -S treats + and - as at least and at most. find treats them as strictly more and strictly less.";
const FIND_LOGICAL_NOTE =
  "fd has no -H or -P flag. It does not follow symlinks unless --follow is given.";

/** Translate a find -size argument. Returns undefined when it does not map. */
function translateFindSize(value: string): string | undefined {
  const match = /^([+-])([0-9]+)([ckMG])$/.exec(value);
  if (!match) return undefined;
  return match[1] + match[2] + FIND_SIZE_UNITS[match[3]];
}

function translateFind(args: string[]): TranslateOutcome {
  const searchPaths: string[] = [];
  const flags: string[] = [];
  const notes: string[] = [FIND_IGNORE_NOTE];
  let pattern: string | undefined;
  let patternFrom: string | undefined;
  let execFlag: string | undefined;
  let execCmd: string[] = [];
  let askWhy: string | undefined;
  let askFrom: string | undefined;

  let i = 0;

  // find takes its search paths first. The -L, -H and -P options may sit in
  // front of them, so consume those here too.
  while (i < args.length) {
    const arg = args[i];
    if (arg === "-L") {
      flags.push("--follow");
      i += 1;
      continue;
    }
    if (arg === "-H" || arg === "-P") {
      addNote(notes, FIND_LOGICAL_NOTE);
      i += 1;
      continue;
    }
    if (arg.startsWith("-") || arg === "!" || arg === "(") break;
    searchPaths.push(arg);
    i += 1;
  }

  /** Record the single fd pattern. fd matches one pattern only. */
  const setPattern = (predicate: string, value: string): TranslateBlocked | undefined => {
    if (patternFrom !== undefined) {
      return blocked(
        `fd matches one pattern, so ${patternFrom} and ${predicate} can not be combined.`,
      );
    }
    patternFrom = predicate;
    pattern = value;
    return undefined;
  };

  /** Record the single mutating predicate. */
  const setAsk = (predicate: string, why: string): TranslateBlocked | undefined => {
    if (askFrom !== undefined) {
      return blocked(`fd runs one command, so ${askFrom} and ${predicate} can not be combined.`);
    }
    askFrom = predicate;
    askWhy = why;
    return undefined;
  };

  while (i < args.length) {
    const arg = args[i];
    i += 1;

    if (FIND_OPERATORS.includes(arg)) {
      return blocked(`fd has no boolean expressions, so the find operator ${arg} can not be used.`);
    }
    if (FIND_UNSAFE.includes(arg)) {
      return blocked(`fd has no safe equivalent for the find predicate ${arg}.`);
    }

    /** Take the value of a value-taking predicate. */
    const takeValue = (): string | undefined => {
      if (i >= args.length) return undefined;
      const value = args[i];
      i += 1;
      return value;
    };

    if (
      arg === "-name" ||
      arg === "-iname" ||
      arg === "-path" ||
      arg === "-ipath" ||
      arg === "-wholename" ||
      arg === "-iwholename" ||
      arg === "-regex"
    ) {
      const value = takeValue();
      if (value === undefined) return blocked(`The find predicate ${arg} needs a value.`);
      const bad = setPattern(arg, value);
      if (bad) return bad;

      if (arg === "-regex") {
        flags.push("--regex", "-p");
        addNote(notes, FIND_REGEX_NOTE);
        addNote(notes, FIND_FULLPATH_NOTE);
        continue;
      }
      flags.push("-g");
      if (arg === "-path" || arg === "-ipath" || arg === "-wholename" || arg === "-iwholename") {
        flags.push("-p");
        addNote(notes, FIND_FULLPATH_NOTE);
      }
      if (arg === "-iname" || arg === "-ipath" || arg === "-iwholename") flags.push("-i");
      continue;
    }

    if (arg === "-type") {
      const value = takeValue();
      if (value === undefined) return blocked(`The find predicate ${arg} needs a value.`);
      if (!FIND_TYPES.includes(value)) {
        return blocked(`fd has no equivalent for the find type ${value}.`);
      }
      flags.push("-t", value);
      continue;
    }

    if (arg === "-maxdepth" || arg === "-mindepth") {
      const value = takeValue();
      if (value === undefined) return blocked(`The find predicate ${arg} needs a value.`);
      if (!/^[0-9]+$/.test(value)) {
        return blocked(`The find predicate ${arg} needs a whole number, not ${value}.`);
      }
      flags.push(arg === "-maxdepth" ? "-d" : "--min-depth", value);
      continue;
    }

    if (arg === "-size") {
      const value = takeValue();
      if (value === undefined) return blocked(`The find predicate ${arg} needs a value.`);
      const size = translateFindSize(value);
      if (size === undefined) {
        return blocked(`fd has no equivalent for the find size ${value}.`);
      }
      flags.push("-S", size);
      addNote(notes, FIND_SIZE_NOTE);
      continue;
    }

    if (arg === "-newer") {
      return blocked(
        "fd --newer takes a date or a duration, not a file name, so the find predicate -newer has no translation.",
      );
    }

    if (arg === "-empty") {
      flags.push("-t", "e");
      continue;
    }
    if (arg === "-print0") {
      flags.push("-0");
      continue;
    }
    if (arg === "-print") {
      continue;
    }
    if (arg === "-follow" || arg === "-L") {
      flags.push("--follow");
      continue;
    }
    if (arg === "-H" || arg === "-P") {
      addNote(notes, FIND_LOGICAL_NOTE);
      continue;
    }

    if (arg === "-delete") {
      return blocked(
        "fd has no delete flag, and fd skips files listed in .gitignore, so -delete would remove a different set of files than find removes.",
      );
    }

    if (arg === "-exec") {
      const cmd: string[] = [];
      let terminator: string | undefined;
      while (i < args.length) {
        const part = args[i];
        i += 1;
        if (part === ";" || part === "\\;" || part === "+") {
          terminator = part === "+" ? "+" : ";";
          break;
        }
        cmd.push(part);
      }
      if (terminator === undefined) {
        return blocked("The find predicate -exec has no ; or + terminator.");
      }
      if (cmd.length === 0) {
        return blocked("The find predicate -exec has no command to run.");
      }
      const bad = setAsk(
        arg,
        `The find predicate ${arg} runs another command, so it needs approval.`,
      );
      if (bad) return bad;
      execFlag = terminator === ";" ? "-x" : "-X";
      execCmd = cmd;
      continue;
    }

    return blocked(`fd has no safe equivalent for the find predicate ${arg}.`);
  }

  const argv = ["fd"];
  for (const path of searchPaths) argv.push("--search-path", path);
  argv.push(...flags);
  if (pattern !== undefined) argv.push(pattern);
  // fd reads every argument after -x or -X as part of the command, so the
  // exec flag has to come last.
  if (execFlag !== undefined) argv.push(execFlag, ...execCmd);

  if (askWhy !== undefined) return { kind: "ask", argv, notes, why: askWhy };
  return { kind: "ok", argv, notes };
}

/** Built-in translators, keyed by the name a guard rule file references. */
export const TRANSLATORS: Record<string, Translator> = {
  grep: translateGrep,
  find: translateFind,
};
