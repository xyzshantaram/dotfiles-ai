---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
compatibility: opencode
---

Interview me relentlessly about every aspect of this until we reach a shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions one-by-one.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

Use the `question` tool for every question, not plain prose. Present real, substantive alternatives
as neutral options — do **not** recommend one, do not mark any option "(Recommended)", and do not
editorialize toward an answer in the option descriptions. State each option's actual tradeoffs and
let me do the thinking. Structured questions are what make a grilling session skimmable afterwards;
a wall of prose Q&A is not, and a pre-loaded recommendation is not a real question.

If a *fact* can be found by exploring the environment (filesystem, tools, etc.), look it up rather than asking me. The *decisions*, though, are mine — put each one to me and wait for my answer.

Do not act on it until I confirm we have reached a shared understanding.

## Worked example

Deciding how to split a CSS refactor into tickets, from a real session:

> **question tool call:**
> - question: "Split into two tickets or keep as one?"
> - header: "CSS ticket split"
> - options:
>   - "Split into A/B" — Ticket A defines a spacing scale; Ticket B migrates `NEventCard`'s
>     inline styles onto it. Each is independently reviewable as its own diff, but B can't start
>     until A's tokens exist.
>   - "One combined ticket" — both land in a single diff; no ordering dependency to track, but a
>     larger diff to review at once.
>
> *(waits for the answer before asking the next question — evaluation criteria for A/B — rather
> than asking both at once)*

Notice what this is not: it is not "Should I split this into two tickets? A) yes B) no", it does not
push toward either option, and it is not three questions asked in the same message. One structured,
neutral question, one answer, then the next question — that is the whole technique.
