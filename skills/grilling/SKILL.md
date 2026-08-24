---
name: grilling
description: Interview the user about every aspect of a plan, decision, or idea until you reach a shared understanding. Use when the user wants to stress-test their thinking, or uses any "grill" trigger phrases.
whenToUse: The user wants to stress-test a plan or decision. Trigger phrases are "grill me", "grill this", "stress-test", and "interview me". Use it also before non-trivial work when scope is not settled.
---

Interview me about every aspect of this until we reach a shared understanding. Walk down each branch of the decision tree. Resolve dependencies between decisions one by one.

Ask one question at a time. Wait for a response before asking the next. Asking several questions at once is hard to follow.

Use the `ask_user_question` tool for every question, not plain prose. Present real alternatives as neutral options. Do **not** recommend one. Do not mark any option "(Recommended)". Do not steer toward an answer in the option descriptions. State each option's real tradeoffs and let me do the thinking. Structured questions make a grilling session easy to skim afterwards. A wall of prose Q&A is not. A pre-loaded recommendation is not a real question.

If you can look up a _fact_ from the environment (filesystem, tools, etc.), look it up. Do not ask me. The _decisions_ are mine. Put each one to me and wait for my answer.

Do not act on it until I confirm we have reached a shared understanding.

## Worked example

Deciding how to split a CSS refactor into tickets, from a real session:

> **ask_user_question call:**
>
> - questions:
>   - id: css-ticket-split
>     question: "Split into two tickets or keep as one?"
>     header: "CSS ticket split"
>     options:
>     - label: "Split into A/B"
>       description: "Ticket A defines a spacing scale. Ticket B migrates NEventCard's inline styles onto it. Each is independently reviewable as its own diff, but B cannot start until A's tokens exist."
>     - label: "One combined ticket"
>       description: "Both land in a single diff. There is no ordering dependency to track, but the review diff is larger."
>
> _(waits for the answer before asking the next question — evaluation criteria for A/B — rather than asking both at once)_

Notice what this is not: it is not "Should I split this into two tickets? A) yes B) no", it does not push toward either option, and it is not three questions asked in the same message. One structured, neutral question, one answer, then the next question — that is the whole technique.
