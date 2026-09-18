// Split board browser component. It owns one run in the page and
// checkpoints changed lines to the server. It imports nothing and
// needs no build step. The pure arithmetic below stays testable
// from Deno. Browser work starts only through start at the foot.

/**
 * Round money to two decimal places.
 * @param {number} n
 * @returns {number}
 */
export function round2(n) {
  return Math.round(n * 100) / 100;
}

// Split a price evenly across people. The parts add up to the price
// exactly. Any remainder lands on the first person.
/**
 * @param {number} price
 * @param {string[]} people
 * @returns {Record<string, number>}
 */
export function shareEqual(price, people) {
  const names = [...people];
  if (names.length === 0) {
    throw new Error("an equal split needs one person");
  }
  const part = round2(price / names.length);
  const out = {};
  for (const name of names) {
    out[name] = part;
  }
  out[names[0]] = round2(price - part * (names.length - 1));
  return out;
}

// Turn percents into money for one price. The parts add up to the
// price exactly. Any remainder lands on the first person.
/**
 * @param {number} price
 * @param {Record<string, number>} percents
 * @returns {Record<string, number>}
 */
export function sharePercent(price, percents) {
  const names = Object.keys(percents);
  if (names.length === 0) {
    throw new Error("a percent split needs one person");
  }
  const out = {};
  for (const name of names) {
    out[name] = round2((price * percents[name]) / 100);
  }
  let rest = 0;
  for (const name of names.slice(1)) {
    rest += out[name];
  }
  out[names[0]] = round2(price - rest);
  return out;
}

// Put a whole price on one person.
/**
 * @param {number} price
 * @param {string} person
 * @returns {Record<string, number>}
 */
export function shareSingle(price, person) {
  if (person === undefined || person === null || person === "") {
    throw new Error("a single split needs one person");
  }
  return { [person]: round2(price) };
}

// Build a patch carrying only the changed lines. Dirty holds item
// indexes changed since the last post. Assignments and skipped stay
// whole in memory, and the patch carries the dirty entries alone.
/**
 * @param {Iterable<number | string>} dirty
 * @param {Record<string, unknown>} assignments
 * @param {Record<string, unknown>} skipped
 * @returns {{ assignments: Record<string, unknown>, skipped: Record<string, unknown> }}
 */
export function buildPatch(dirty, assignments, skipped) {
  const patchAssignments = {};
  const patchSkipped = {};
  for (const raw of dirty) {
    const key = String(raw);
    if (
      assignments !== null &&
      typeof assignments === "object" &&
      Object.prototype.hasOwnProperty.call(assignments, key)
    ) {
      patchAssignments[key] = assignments[key];
    }
    if (
      skipped !== null &&
      typeof skipped === "object" &&
      Object.prototype.hasOwnProperty.call(skipped, key)
    ) {
      patchSkipped[key] = skipped[key];
    }
  }
  return { assignments: patchAssignments, skipped: patchSkipped };
}

// Map one digit key onto one person in list order.
// Digit 1 picks the first person.
// A digit past the end picks nobody.
/**
 * @param {string[]} people
 * @param {string | number} digit
 * @returns {string | null}
 */
export function personForDigit(people, digit) {
  const list = Array.isArray(people) ? people : [];
  const n = typeof digit === "string" ? Number(digit) : digit;
  if (!Number.isInteger(n)) return null;
  if (n < 1 || n > 9) return null;
  if (n > list.length) return null;
  const name = list[n - 1];
  if (typeof name !== "string") return null;
  return name;
}

// Build the first checkpoint line from saved island work.
// Return an empty string when the run holds nothing saved.
/**
 * @param {Record<string, unknown> | null} assignments
 * @param {Record<string, unknown> | null} skipped
 * @param {number} at
 * @returns {string}
 */
export function seedCheckpointLine(assignments, skipped, at) {
  let saved = false;
  if (assignments !== null && typeof assignments === "object") {
    if (Object.keys(assignments).length > 0) saved = true;
  }
  if (saved === false && skipped !== null && typeof skipped === "object") {
    for (const key of Object.keys(skipped)) {
      if (skipped[key] === true) {
        saved = true;
        break;
      }
    }
  }
  if (saved === false) return "";
  if (typeof at !== "number" || !Number.isFinite(at) || at <= 0) {
    return "Run last saved.";
  }
  const clock = new Date(at);
  const pad = (n) => String(n).padStart(2, "0");
  return "Run last saved " + pad(clock.getHours()) + ":" + pad(clock.getMinutes()) +
    ":" + pad(clock.getSeconds()) + ".";
}

// Split modes in settled order. The mouse picks the mode.
const MODES = ["Equal", "Percentage", "Custom", "Single"];

// Map a saved engine type onto a mode label.
function modeFromType(type) {
  if (type === "percent") return "Percentage";
  if (type === "custom") return "Custom";
  if (type === "single") return "Single";
  return "Equal";
}

// Map a mode label onto a saved engine type.
function typeFromMode(mode) {
  if (mode === "Percentage") return "percent";
  if (mode === "Custom") return "custom";
  if (mode === "Single") return "single";
  return "equal";
}

// Even percents for ticked people.
function evenPercents(ticked) {
  const out = {};
  if (ticked.length === 0) return out;
  const even = round2(100 / ticked.length);
  for (const name of ticked) {
    out[name] = even;
  }
  return out;
}

// True when a line needs no assignment because the reader skipped it.
// A skip is a decision, so leaving the line and pressing Enter must both
// accept it. Without this the board asked for people on a skipped line,
// which refused to advance and left the skip looking broken.
// Ticking a person on a skipped line means the reader changed their
// mind, so that case saves as usual and the save clears the skip.
/**
 * @param {Record<string, unknown>} skipped
 * @param {number} index
 * @param {number} tickedCount
 * @returns {boolean}
 */
export function skipSettles(skipped, index, tickedCount) {
  if (skipped === null || typeof skipped !== "object") return false;
  return skipped[String(index)] === true && tickedCount === 0;
}

// Repeat one saved assignment onto a new price. Drop unknown names first.
// Fall back to saved names when none survive. Return null when nobody remains.
// Recompute amounts with the share helpers.
/**
 * @param {{ splitType: string, people: string[], amounts: Record<string, number> }} last
 * @param {string[]} people
 * @param {number} price
 * @returns {{ splitType: string, people: string[], amounts: Record<string, number> } | null}
 */
export function repeatOnto(last, people, price) {
  if (last === null || last === undefined || typeof last !== "object") {
    return null;
  }
  const saved = Array.isArray(last.people) ? [...last.people] : [];
  const kept = saved.filter((name) => people.includes(name));
  const who = kept.length > 0 ? kept : [...saved];
  if (who.length === 0) {
    return null;
  }
  if (last.splitType === "single") {
    return {
      splitType: "single",
      people: [who[0]],
      amounts: shareSingle(price, who[0]),
    };
  }
  if (last.splitType === "percent") {
    return {
      splitType: "percent",
      people: [...who],
      amounts: sharePercent(price, evenPercents(who)),
    };
  }
  return {
    splitType: typeFromMode("Equal"),
    people: [...who],
    amounts: shareEqual(price, who),
  };
}

// Fresh draft for a line with no saved assignment. Nobody is ticked,
// fee or not, so every split is a deliberate choice and no default can
// be saved by accident. The r key repeats the last line, which covers
// the run of fees and the run of shared items alike.
function freshDraft(_item, _people, _me) {
  return { mode: "Equal", ticked: [], percents: {}, amounts: {} };
}

// Draft from a saved assignment. Percent fields derive from the
// saved amounts so the numbers match the money on screen.
function savedDraft(saved, item, people) {
  const ticked = saved.people.filter((name) => people.includes(name));
  const kept = ticked.length > 0 ? ticked : [...people];
  const percents = evenPercents(kept);
  if (saved.splitType === "percent" && item.price !== 0) {
    for (const name of kept) {
      percents[name] = round2(((saved.amounts[name] ?? 0) / item.price) * 100);
    }
  }
  const amounts = {};
  for (const name of kept) {
    amounts[name] = saved.amounts[name] ?? 0;
  }
  return { mode: modeFromType(saved.splitType), ticked: kept, percents, amounts };
}

// Boot one board inside a mount element with island data.
function boot(host, data) {
  const runId = typeof data.runId === "string" ? data.runId : "";
  const currency = typeof data.currency === "string" ? data.currency : "";
  const me = typeof data.me === "string" ? data.me : "";
  const people = Array.isArray(data.people) ? [...data.people] : [];
  const items = Array.isArray(data.items) ? [...data.items] : [];
  const assignments = data.assignments !== null && typeof data.assignments === "object"
    ? { ...data.assignments }
    : {};
  const skipped = data.skipped !== null && typeof data.skipped === "object"
    ? { ...data.skipped }
    : {};
  let baseline = typeof data.at === "number" ? data.at : 0;

  // Indexes changed since the last successful post.
  const dirty = new Set();
  // Indexes the reader has worked on in this visit. Leaving one of these
  // saves it. Browsing past an untouched line assigns nothing, so the
  // defaults on screen never become answers by accident.
  const touched = new Set();
  // Drafts per line index, built lazily as lines show.
  const drafts = new Map();
  let current = 0;
  let lastCheckpoint = "";
  // Seed the line from saved island work.
  // A fresh mount then tells the truth about the server.
  const savedLine = seedCheckpointLine(assignments, skipped, baseline);

  const doc = host.ownerDocument;

  // Root nodes. Every text passes through textContent, never innerHTML.
  // The block elements match the toolkit views, and the custom
  // elements come from the Web Awesome set loaded from a pinned CDN.
  const root = doc.createElement("div");
  root.setAttribute("class", "split-board");
  const headline = doc.createElement("h3");
  // One title line holds the product name and the price. The counter,
  // the platform and the order id sit under it in a small table.
  const titleLine = doc.createElement("p");
  titleLine.setAttribute("class", "board-title");
  const nameLine = doc.createElement("span");
  nameLine.setAttribute("class", "board-name");
  const priceLine = doc.createElement("strong");
  priceLine.setAttribute("class", "board-price");
  // No dash between them. A long product name wraps, and the dash then
  // leads the next line on its own, which reads as a mistake. The gap
  // in the flex row separates the two well enough.
  titleLine.appendChild(nameLine);
  titleLine.appendChild(priceLine);
  const headTable = doc.createElement("table");
  headTable.setAttribute("class", "node-table board-table");
  const headBody = doc.createElement("tbody");
  headTable.appendChild(headBody);
  const headItem = doc.createElement("td");
  const headPlatform = doc.createElement("td");
  const headOrder = doc.createElement("td");
  for (
    const row of [
      ["Item", headItem],
      ["Platform", headPlatform],
      ["Order", headOrder],
    ]
  ) {
    const tr = doc.createElement("tr");
    const th = doc.createElement("th");
    th.setAttribute("scope", "row");
    th.textContent = row[0];
    tr.appendChild(th);
    tr.appendChild(row[1]);
    headBody.appendChild(tr);
  }
  const modeBox = doc.createElement("section");
  modeBox.setAttribute("class", "node node-radio");
  const modeHead = doc.createElement("h3");
  modeHead.textContent = "How to split";
  const modeGroup = doc.createElement("wa-radio-group");
  modeBox.appendChild(modeHead);
  modeBox.appendChild(modeGroup);
  const peopleBox = doc.createElement("section");
  peopleBox.setAttribute("class", "node node-checkbox");
  const peopleHead = doc.createElement("h3");
  peopleHead.textContent = "Split with whom";
  peopleBox.appendChild(peopleHead);
  const peopleTools = doc.createElement("div");
  peopleTools.setAttribute("class", "bulk-controls");
  const allButton = doc.createElement("wa-button");
  allButton.setAttribute("type", "button");
  allButton.setAttribute("size", "small");
  allButton.setAttribute("appearance", "plain");
  allButton.setAttribute("class", "bulk-control");
  allButton.textContent = "Select all";
  const noneButton = doc.createElement("wa-button");
  noneButton.setAttribute("type", "button");
  noneButton.setAttribute("size", "small");
  noneButton.setAttribute("appearance", "plain");
  noneButton.setAttribute("class", "bulk-control");
  noneButton.textContent = "Select none";
  peopleTools.appendChild(allButton);
  peopleTools.appendChild(noneButton);
  peopleBox.appendChild(peopleTools);
  const peopleList = doc.createElement("div");
  peopleList.setAttribute("class", "check-group");
  peopleBox.appendChild(peopleList);
  const numbersBox = doc.createElement("div");
  numbersBox.setAttribute("class", "node node-number board-amounts");
  const skipBox = doc.createElement("wa-checkbox");
  skipBox.setAttribute("class", "board-skip");
  skipBox.appendChild(doc.createTextNode("Skip this item"));
  const moveBox = doc.createElement("div");
  moveBox.setAttribute("class", "button-row-split");
  const prevButton = doc.createElement("wa-button");
  prevButton.setAttribute("type", "button");
  prevButton.setAttribute("variant", "neutral");
  prevButton.textContent = "Previous";
  const nextButton = doc.createElement("wa-button");
  nextButton.setAttribute("type", "button");
  nextButton.setAttribute("variant", "primary");
  nextButton.textContent = "Next";
  moveBox.appendChild(prevButton);
  moveBox.appendChild(nextButton);
  const progressLine = doc.createElement("small");
  progressLine.setAttribute("class", "board-muted");
  const checkpointLine = doc.createElement("small");
  checkpointLine.setAttribute("class", "board-muted");
  const noticeLine = doc.createElement("wa-callout");
  noticeLine.setAttribute("variant", "danger");
  noticeLine.setAttribute("class", "board-callout");
  const keysHint = doc.createElement("small");
  keysHint.setAttribute("class", "board-muted");
  keysHint.textContent =
    "Keys: Left and Right move. Enter saves and moves on. A ticks everyone. M ticks you. R repeats the last line. S skips. 1 to 9 tick people in order.";
  root.appendChild(headline);
  root.appendChild(titleLine);
  root.appendChild(headTable);
  root.appendChild(modeBox);
  root.appendChild(peopleBox);
  root.appendChild(numbersBox);
  root.appendChild(skipBox);
  root.appendChild(moveBox);
  root.appendChild(progressLine);
  root.appendChild(checkpointLine);
  root.appendChild(noticeLine);
  root.appendChild(keysHint);
  host.appendChild(root);

  // Draft for one line. Saved work wins over fresh defaults.
  function draftFor(index) {
    let draft = drafts.get(index);
    if (draft !== undefined) return draft;
    const saved = assignments[String(index)];
    draft = saved !== undefined && saved !== null
      ? savedDraft(saved, items[index], people)
      : freshDraft(items[index], people, me);
    drafts.set(index, draft);
    return draft;
  }

  // True when one line waits for a split.
  function isOpen(index) {
    const key = String(index);
    if (skipped[key] === true) return false;
    return assignments[key] === undefined;
  }

  // Counts for the progress line.
  function counts() {
    let done = 0;
    let skippedCount = 0;
    for (let i = 0; i < items.length; i++) {
      if (assignments[String(i)] !== undefined) done += 1;
      if (skipped[String(i)] === true) skippedCount += 1;
    }
    return { done, skippedCount, left: items.length - done - skippedCount };
  }

  // Next open line after one index, wrapping past the end.
  function nextOpen(from) {
    for (let i = from + 1; i < items.length; i++) {
      if (isOpen(i)) return i;
    }
    for (let i = 0; i <= from; i++) {
      if (isOpen(i)) return i;
    }
    return from;
  }

  // Highest saved line index, or -1 while nothing is saved.
  function lastSavedIndex() {
    let best = -1;
    for (const key of Object.keys(assignments)) {
      const at = Number(key);
      if (Number.isInteger(at) && at > best) best = at;
    }
    return best;
  }

  // Assignment for the current draft. Returns null with a notice
  // while the draft cannot save.
  function draftAssignment() {
    const item = items[current];
    const draft = draftFor(current);
    if (draft.mode === "Single") {
      const person = draft.ticked[0] ?? (me !== "" ? me : people[0] ?? "");
      if (person === undefined || person === "") {
        noticeLine.textContent = "Tick one person for a single split.";
        return null;
      }
      return {
        splitType: "single",
        people: [person],
        amounts: shareSingle(item.price, person),
      };
    }
    if (draft.ticked.length === 0) {
      noticeLine.textContent = "Tick at least one person.";
      return null;
    }
    if (draft.mode === "Percentage") {
      const percents = {};
      for (const name of draft.ticked) {
        percents[name] = draft.percents[name] ?? 0;
      }
      return {
        splitType: "percent",
        people: [...draft.ticked],
        amounts: sharePercent(item.price, percents),
      };
    }
    if (draft.mode === "Custom") {
      const amounts = {};
      for (const name of draft.ticked) {
        amounts[name] = round2(draft.amounts[name] ?? 0);
      }
      const sum = round2(Object.values(amounts).reduce((a, b) => a + b, 0));
      if (Math.abs(sum - item.price) > 0.01) {
        noticeLine.textContent = "Custom amounts must add up to the price.";
        return null;
      }
      return { splitType: "custom", people: [...draft.ticked], amounts };
    }
    return {
      splitType: "equal",
      people: [...draft.ticked],
      amounts: shareEqual(item.price, draft.ticked),
    };
  }

  // Save the current line in memory and mark it for checkpoint.
  // A saved line leaves the skip map, so the server drops the skip.
  // A successful save clears the notice line.
  function saveCurrent() {
    // A skipped line is already settled, so it needs no people.
    if (skipSettles(skipped, current, draftFor(current).ticked.length)) {
      noticeLine.textContent = "";
      return true;
    }
    const made = draftAssignment();
    if (made === null) return false;
    const key = String(current);
    assignments[key] = made;
    skipped[key] = false;
    dirty.add(current);
    noticeLine.textContent = "";
    return true;
  }

  // Show one line by index, clamped to the run.
  // Leaving a line the reader worked on saves it first. Without this a
  // whole run can be clicked through and nothing is ever assigned, which
  // is how a full split was lost.
  function show(index) {
    if (items.length === 0) return;
    if (index < 0) index = 0;
    if (index > items.length - 1) index = items.length - 1;
    if (index !== current && touched.has(current)) saveCurrent();
    current = index;
    draftFor(current);
    render();
  }

  // Tick every person on the current line.
  function tickAll() {
    touched.add(current);
    const draft = draftFor(current);
    draft.ticked = [...people];
    for (const name of people) {
      if (draft.percents[name] === undefined) {
        draft.percents[name] = evenPercents(people)[name] ?? 0;
      }
      if (draft.amounts[name] === undefined) {
        draft.amounts[name] = 0;
      }
    }
    render();
  }

  // Tick only the me name on the current line.
  function tickMe() {
    touched.add(current);
    const draft = draftFor(current);
    draft.ticked = me !== "" && people.includes(me) ? [me] : [...people];
    render();
  }

  // Copy the last saved assignment onto the current line. Amounts
  // recompute for the current price. A custom repeat saves as equal.
  function repeatSaved() {
    touched.add(current);
    const at = lastSavedIndex();
    if (at < 0) {
      noticeLine.textContent = "No saved line to copy yet.";
      return;
    }
    const last = assignments[String(at)];
    const item = items[current];
    const made = repeatOnto(last, people, item.price);
    if (made === null) {
      noticeLine.textContent = "No saved line to copy yet.";
      return;
    }
    const draft = draftFor(current);
    draft.mode = modeFromType(made.splitType);
    draft.ticked = [...made.people];
    draft.percents = evenPercents(made.people);
    draft.amounts = { ...made.amounts };
    assignments[String(current)] = made;
    skipped[String(current)] = false;
    dirty.add(current);
    noticeLine.textContent = "";
    render();
  }

  // Toggle skip on the current line and mark it for checkpoint.
  function toggleSkip() {
    touched.add(current);
    const key = String(current);
    skipped[key] = skipped[key] === true ? false : true;
    dirty.add(current);
    render();
  }

  // Toggle one person on the current line from a digit key.
  // Mark the line touched.
  // Keep the Single rule from the mouse path.
  function togglePerson(name) {
    touched.add(current);
    const draft = draftFor(current);
    if (draft.ticked.includes(name)) {
      draft.ticked = draft.ticked.filter((entry) => entry !== name);
    } else {
      if (draft.mode === "Single") {
        draft.ticked = [name];
      } else {
        draft.ticked.push(name);
      }
      if (draft.percents[name] === undefined) {
        draft.percents[name] = evenPercents(draft.ticked)[name] ?? 0;
      }
      if (draft.amounts[name] === undefined) {
        draft.amounts[name] = 0;
      }
    }
    render();
  }

  // Save the current line and move to the next unfinished one.
  function saveAndAdvance() {
    if (!saveCurrent()) {
      render();
      return;
    }
    current = nextOpen(current);
    draftFor(current);
    render();
  }

  // Post changed lines to the server. A failed post keeps the dirty
  // set, so no work leaves memory. Keepalive covers the last post
  // while the page hides.
  async function checkpoint(keepalive) {
    if (dirty.size === 0) return;
    const patch = buildPatch(dirty, assignments, skipped);
    const body = {
      runId,
      assignments: patch.assignments,
      skipped: patch.skipped,
      baseline,
    };
    let res;
    try {
      res = await fetch("/app/split-patch", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        keepalive: keepalive === true,
      });
    } catch {
      res = null;
    }
    if (res === null || !res.ok) {
      noticeLine.textContent = "The last checkpoint did not land. Work stays in this page.";
      return;
    }
    const reply = await res.json();
    baseline = reply.at;
    dirty.clear();
    const clock = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    lastCheckpoint = pad(clock.getHours()) + ":" + pad(clock.getMinutes()) +
      ":" + pad(clock.getSeconds());
    checkpointLine.textContent = "Last checkpoint " + lastCheckpoint + ".";
    if (reply.conflicted === true) {
      noticeLine.textContent = "The server saved a copy beside the run.";
    } else {
      noticeLine.textContent = "";
    }
  }

  // Draw the current line plus progress plus checkpoint state.
  function render() {
    while (modeGroup.firstChild !== null) {
      modeGroup.removeChild(modeGroup.lastChild);
    }
    while (peopleList.firstChild !== null) {
      peopleList.removeChild(peopleList.firstChild);
    }
    while (numbersBox.firstChild !== null) {
      numbersBox.removeChild(numbersBox.firstChild);
    }
    nameLine.textContent = "";
    priceLine.textContent = "";
    headItem.textContent = "";
    headPlatform.textContent = "";
    headOrder.textContent = "";
    if (items.length === 0) {
      headline.textContent = "No items in this run.";
      return;
    }
    const item = items[current];
    const draft = draftFor(current);
    // The title line names the product and the price, and the table
    // below carries the counter. The heading stays empty on a live
    // item, because a second copy of either reads as a mistake.
    headline.textContent = "";
    nameLine.textContent = item.name;
    const money = currency !== "" ? currency + " " : "";
    priceLine.textContent = money + Number(item.price).toFixed(2);
    headItem.textContent = current + 1 + " of " + items.length;
    headPlatform.textContent = item.platform;
    headOrder.textContent = item.orderId;
    for (const mode of MODES) {
      const radio = doc.createElement("wa-radio");
      radio.setAttribute("value", mode);
      // The label is slotted text, not an attribute. Without it the
      // control renders as an unlabelled circle.
      radio.textContent = mode;
      radio.addEventListener("change", () => {
        draft.mode = mode;
        render();
      });
      modeGroup.appendChild(radio);
    }
    // The group owns the selection and pushes it down to its children,
    // so setting checked on a child does nothing. The toolkit radio
    // view sets the group value for the same reason.
    modeGroup.setAttribute("value", draft.mode);
    for (const name of people) {
      const box = doc.createElement("wa-checkbox");
      box.setAttribute("value", name);
      box.checked = draft.ticked.includes(name);
      box.addEventListener("change", () => {
        touched.add(current);
        if (box.checked) {
          if (draft.mode === "Single") {
            draft.ticked = [name];
          } else if (!draft.ticked.includes(name)) {
            draft.ticked.push(name);
          }
          if (draft.percents[name] === undefined) {
            draft.percents[name] = evenPercents(draft.ticked)[name] ?? 0;
          }
          if (draft.amounts[name] === undefined) {
            draft.amounts[name] = 0;
          }
        } else {
          draft.ticked = draft.ticked.filter((entry) => entry !== name);
        }
        render();
      });
      box.appendChild(doc.createTextNode(name));
      peopleList.appendChild(box);
    }
    if (draft.mode === "Percentage" || draft.mode === "Custom") {
      for (const name of draft.ticked) {
        const head = (draft.mode === "Percentage" ? "Percent for " : "Amount for ") + name;
        const field = doc.createElement("wa-input");
        field.setAttribute("type", "number");
        field.setAttribute("step", "any");
        field.setAttribute("label", head);
        if (draft.mode === "Percentage") {
          field.value = String(draft.percents[name] ?? 0);
        } else {
          field.value = String(draft.amounts[name] ?? 0);
        }
        field.addEventListener("input", () => {
          touched.add(current);
          const raw = Number(field.value);
          const value = Number.isFinite(raw) ? raw : 0;
          if (draft.mode === "Percentage") {
            draft.percents[name] = value;
          } else {
            draft.amounts[name] = value;
          }
        });
        numbersBox.appendChild(field);
      }
    }
    skipBox.checked = skipped[String(current)] === true;
    const tally = counts();
    progressLine.textContent = tally.done + " assigned. " + tally.skippedCount +
      " skipped. " + tally.left + " left.";
    if (lastCheckpoint !== "") {
      checkpointLine.textContent = "Last checkpoint " + lastCheckpoint + ".";
    } else if (savedLine !== "") {
      checkpointLine.textContent = savedLine;
    } else {
      checkpointLine.textContent = "No checkpoint yet.";
    }
  }

  allButton.addEventListener("click", tickAll);
  noneButton.addEventListener("click", () => {
    draftFor(current).ticked = [];
    render();
  });
  skipBox.addEventListener("change", toggleSkip);
  prevButton.addEventListener("click", () => {
    show(current - 1);
  });
  nextButton.addEventListener("click", () => {
    // Stay on the last line.
    // Save it first.
    // Then name what still waits.
    if (current >= items.length - 1) {
      if (items.length === 0) return;
      if (touched.has(current)) {
        if (!saveCurrent()) {
          render();
          return;
        }
      }
      const tally = counts();
      render();
      if (tally.left > 0) {
        if (tally.left === 1) {
          noticeLine.textContent = "1 item still waits. Use Left and Right to reach it.";
        } else {
          noticeLine.textContent = tally.left +
            " items still wait. Use Left and Right to reach them.";
        }
      } else {
        noticeLine.textContent = "Every item is done. Use Finish splitting in the bar to finish.";
      }
      return;
    }
    show(current + 1);
  });

  // Key bindings mirror the dashboard. Typing in a text or number
  // field never triggers a shortcut.
  function typingTarget(e) {
    const el = e.target;
    if (el === null || el === undefined || typeof el.tagName !== "string") {
      return false;
    }
    const tag = el.tagName.toUpperCase();
    if (tag === "TEXTAREA" || tag === "SELECT") return true;
    // A custom input retargets its keydown to the host element.
    if (tag === "WA-INPUT") return true;
    if (tag === "INPUT") {
      const raw = typeof el.getAttribute === "function" ? el.getAttribute("type") : "text";
      const type = String(raw === null ? "text" : raw).toLowerCase();
      return type === "text" || type === "number" || type === "search" ||
        type === "tel" || type === "url" || type === "password";
    }
    return el.isContentEditable === true;
  }

  // Capture, not bubble. A Web Awesome radio group handles the arrow
  // keys itself and stops them, and any focused control swallows the
  // rest, so a bubbling listener sees nothing once the reader clicks a
  // control. Capture runs before those components. The board also stops
  // listening once its element leaves the page.
  doc.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (host.isConnected === false) return;
    if (typingTarget(e)) return;
    const key = e.key;
    if (key === "ArrowLeft") {
      e.preventDefault();
      show(current - 1);
      return;
    }
    if (key === "ArrowRight") {
      e.preventDefault();
      show(current + 1);
      return;
    }
    if (key === "Enter") {
      e.preventDefault();
      saveAndAdvance();
      return;
    }
    const lower = typeof key === "string" ? key.toLowerCase() : "";
    if (lower === "a") {
      tickAll();
    } else if (lower === "m") {
      tickMe();
    } else if (lower === "r") {
      repeatSaved();
    } else if (lower === "s") {
      toggleSkip();
    } else if (key >= "1" && key <= "9") {
      const name = personForDigit(people, key);
      if (name === null) return;
      togglePerson(name);
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  }, true);

  // Checkpoint while work waits, plus once while the page hides.
  // The wizard bar leaves through htmx, so flush before its posts.
  setInterval(() => {
    if (dirty.size > 0) {
      void checkpoint(false);
    }
  }, 5000);
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "hidden") {
      void checkpoint(true);
    }
  });
  doc.addEventListener("pagehide", () => {
    void checkpoint(true);
  });
  // Save the open line before the bar leaves.
  // Then flush the changed lines.
  doc.addEventListener("htmx:beforeRequest", () => {
    if (touched.has(current)) {
      saveCurrent();
    }
    void checkpoint(false);
  });

  show(nextOpen(-1));
}

// Read the island by its data attribute and render into the mount
// element. The guard keeps imports clean under Deno, where no
// document exists, and startup waits for the parsed page.
function start() {
  const island = document.querySelector(
    'script[data-mount-data="split-board"]',
  );
  const host = document.querySelector('[data-mount="split-board"]');
  if (island === null || host === null) return;
  if (host.dataset.boardReady === "1") return;
  host.dataset.boardReady = "1";
  let data = null;
  try {
    data = JSON.parse(island.textContent ?? "");
  } catch {
    data = null;
  }
  if (data === null || typeof data !== "object") {
    const note = document.createElement("p");
    note.textContent = "The split board found no run data.";
    host.appendChild(note);
    return;
  }
  boot(host, data);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
  // The board almost never arrives with the page. A move inside the
  // wizard swaps one step fragment in, so the mount element turns up
  // after load and start must run again. The ready flag rides on that
  // element, so a fresh element always means a fresh board.
  document.addEventListener("htmx:afterSwap", start);
}
