---
name: wizard
description: Generate an interactive Deno wizard that walks a human through steps only they can perform. Use when provisioning infrastructure, setting up credentials or CI secrets, walking an unfamiliar third-party dashboard, or running a one-off migration or cutover. Don't invoke this for steps the agent can perform itself.
whenToUse: The user wants an interactive Deno wizard that walks a human through manual steps only they can perform. Use it for provisioning infrastructure, setting up credentials or CI secrets, walking an unfamiliar third-party dashboard, or running a one-off migration or cutover. Do not invoke it for steps the agent can perform itself.
---

# Wizard

A wizard walks a human through manual steps in order. It opens each URL. It says what to click and copy. It saves values to .env or GitHub secrets.

## Flow

Copy template.ts to the target path. Replace the example steps with real stages. Set TOTAL_STAGES to the step count. Never edit the library above the STAGES marker. Run the copy with Deno.

## Pattern

Build each wizard as one Pipeline with one named step per stage. Add per step validate for bad input. Add stepIf for steps that only fit some runs. Let onStepStart clear the screen, print the stage counter, and log progress. Let onStepComplete log completion.

Call `MepCLI` direct for picks: `select` for short lists, `fuzzySelect` for long lists with client side fuzzy search, `multiSelect` for many values with search in one prompt, `number` for numeric input. Read free text with `ask` and hidden text with `ask_secret`. Save with `write_env`, `set_secret`, or `set_var`.

## API discovery

Learn prompt and step shapes from source, never from memory. Read patterns.md for the common shape glossary. Run deno doc with a filter for MepCLI, Pipeline, and each prompt helper against the pinned mepcli release. Copy exact field names from that output.

## Progress

Each step start adds one JSONL event. Each step completion adds one more. The finish helper adds one done event. Events go to WIZARD_PROGRESS. The default path is ./wizard-progress.jsonl. Agents tail this file to watch a run.

## Verify

Run deno check on the new wizard. Trace the flow by hand. Check that each value lands in the right store. Do not run the wizard end to end yourself.
