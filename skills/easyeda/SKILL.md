---
name: easyeda
description: Read PCB design data out of EasyEDA Pro through the MCP bridge, and capture several boards in one pass with an operator-driven wizard. Use when the user wants board facts pulled from EasyEDA for a resume, a portfolio, a BOM, or a design review. Gates the easyeda MCP tools behind this skill.
whenToUse: The user asks to read, capture, audit, or document a PCB project in EasyEDA, wants component or layer or track data out of a board, or wants several EasyEDA projects captured in one session. Trigger phrases are "easyeda", "my PCB", "my boards", "read the schematic", "capture the board", "what parts are on".
tools-gated:
  - mcp__easyeda__*
---

# easyeda

The EasyEDA MCP tools read a live EasyEDA Pro instance through a browser
extension bridge. They stay hidden until this skill loads.

## The one constraint that shapes everything

**Every read is keyed to the ACTIVE document.** The bridge reads whatever
document EasyEDA Pro has focused right now.

There is no tool that enumerates projects. The EasyEDA runtime does hold
`getAllProjectsUuid`, `getCurrentProjectInfo`, and `openProject`, and
`easyeda_api_inventory` will list them, but no exposed tool invokes an
arbitrary API method. So you cannot open a project, and you cannot list them.

The consequence: to read more than one board, a human must open each one for
you. Plan for that from the start. Do not promise the user a batch scrape.

Two more rules that follow:

- A PCB read needs a focused **PCB** tab. With only a schematic tab focused,
  `easyeda_pcb_components` returns empty and the device API can error.
- Start with `easyeda_bridge_status`. If the bridge is down, nothing else works
  and the failure mode is confusing.

## Read order, and the cross-check that makes counts safe

Always read in this order:

1. `easyeda_pcb_components` — the trusted source. Real designators, footprints,
   device names, coordinates, layers, and LCSC part numbers.
2. `easyeda_board_features` — aggregate counts: vias, tracks, pads, zones.
3. `easyeda_board_layers` — the stackup.
4. `easyeda_board_dimensions` — often refuses, see the conversion trap.

**Accept the aggregates from step 2 only when `board_features.components`
equals `pcb_components.total`.** When the two disagree, the aggregates belong
to a different document. Discard them. Do not average, adjust, or explain them.

## Trap 1: another open PCB tab poisons board_features

`easyeda_board_features` can return the numbers of a **different** open PCB tab
while `easyeda_pcb_components` correctly returns the focused board.

This was observed live. Two boards captured in sequence both returned identical
counts: 13 components, 10 vias, 97 tracks, 55 pads. A third board, captured
later, returned exactly those numbers as its own. The stale tab had stayed open
the whole time and `board_features` kept reading it.

The component cross-check above catches this every time. It correctly rejected
the two poisoned reads and correctly passed three clean ones.

**Tell the user to close every other PCB tab before a capture run.** That is
cheaper than detecting the problem afterwards.

## Trap 2: EasyEDA Standard to Pro conversion destroys geometry

A project authored in EasyEDA Standard and converted to Pro loses area and
geometry primitives. Component and net data survive intact.

Observed effects:

- `easyeda_board_dimensions` reports `has_outline: false` and refuses to give
  a size, on every converted board.
- `easyeda_board_features` reports `zones: 0` for a board that demonstrably has
  a copper pour.

**Never present a missing outline or a zero pour count as a gap in the user's
design work.** Ask whether the project was converted. If it was, mark the
geometry unusable and say so plainly. A false "your board has no ground plane"
is worse than no data.

## Capturing several boards: the wizard handshake

Bash cannot call your MCP tools, and you cannot type into the user's terminal.
So neither side drives the other. Use a file handshake.

Write a wizard script for the user to run. Per board it must:

1. Print which project to open and remind the user to focus the PCB tab.
2. Block on Enter.
3. Write `REQUEST.json` holding the slug and `state: awaiting-capture`.
4. Poll for `<slug>.json` to appear, then print a summary and advance.
5. Skip a board whose capture file already exists, so a re-run is safe.

On your side, after each capture, start a **single-shot** background watcher
that exits the moment `REQUEST.json` changes:

```sh
cd <capture-dir> && timeout 3300 bash -c '
prev=$(cat REQUEST.json 2>/dev/null || echo none)
while true; do
  cur=$(cat REQUEST.json 2>/dev/null || echo none)
  if [ "$cur" != "$prev" ] && [ "$cur" != "none" ]; then echo "NEW REQUEST:"; echo "$cur"; exit 0; fi
  if [ "$cur" = "none" ]; then echo "WIZARD FINISHED"; exit 0; fi
  sleep 2
done'
```

Run it with `run_in_background: true`. A job that exits is what wakes you. Do
not poll a long-running job. Start a fresh watcher after every capture.

The wizard removing `REQUEST.json` signals that the run is complete.

See the `wizard` skill for how to author the operator-facing script.

## What to write per board

Write one JSON file per board. Record at minimum: the summary, key parts by
designator, passives, layer count, assembly sides, and engineering notes.

Three fields carry the honesty of the whole capture:

- `resume_safe_claims` — only what the tools actually returned. Quote from this
  list when you write prose.
- `not_verified` — what the API refused. Leave it **absent, never estimated**.
- `import_caveat` — present when the project was converted from Standard.

State a disagreement rather than resolving it silently. When two tools give
different component counts, record both and mark which one you trust.

## Reading value out of the data

Component data alone tells a real engineering story. Look for these:

- **Protection on a power input.** An ESD array plus a resettable polyfuse is a
  deliberate front end, not a default.
- **A rating that changes between two boards.** A 200 mA fuse on one board and
  500 mA on another with a Wi-Fi module is design judgement, not copy-paste.
- **Passive package size.** 0805 where another board uses 0603 usually means
  the board is hand-assembled in small batches. That is a design-for-assembly
  decision worth naming.
- **Mating connectors across two boards.** A male header on a product board and
  a female header on a tool board means the user built their own production
  tooling. Verify both sides before claiming it.
- **Tracks against component count.** A high ratio means a carrier or
  interconnect board, where the work is integration, not discrete design.
- **Custom footprints** for off-the-shelf modules are real library work.
- **Single-sided assembly**, where every part sits on one layer, halves
  assembly cost.

## Other tools

`easyeda_pcb_tracks`, `easyeda_pcb_vias`, `easyeda_pcb_fills`, and
`easyeda_pcb_regions` read individual primitives. `easyeda_schematic_*` reads
the schematic, including the title block, which carries the author and the
revision date. `easyeda_canvas_capture` renders the visible canvas to PNG,
which is useful for a portfolio image.

Write tools exist. Do not use them for a capture task.
