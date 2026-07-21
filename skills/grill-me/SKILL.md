---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding, resolving each branch of the decision tree. Use when user wants to stress-test a plan, get grilled on their design, or mentions "grill me".
---

Interview me relentlessly about every aspect of this until we reach a shared understanding. Walk down each branch of the decision tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a *fact* can be found by exploring the environment (codebase, documentation, tools), look it up rather than asking me. The *decisions*, though, are mine — put each one to me and wait for my answer.

**External consumers count as the environment.** If the grilling touches a contract another system calls — a route, verb, request/response shape, required field, or resource decomposition — read the real consumer's source (per the project profile's consumer/oracle pointers in `.claude/doctrine/project-profile.md`) *before* putting the shape question to me. "What should this payload look like?" is not a decision to grill me on until we both know what the consumer sends today. Pin claims to a route constant + verb, never a folder or component name — names collide across the seam. (In the donor stack, skipping this froze a `.proto` file as "the contract" and shipped routes the real consumer never called.)

Do not act on it until I confirm we have reached a shared understanding.

## After the session

When the grilling resolves and the user is about to take the design somewhere downstream, suggest the repo's next-step skill per its pipeline routing (the project profile's pipeline section or the repo's `ask-*` router) — typically a single-issue logger for a one-PR fix, a PRD writer for multi-slice work, or direct implementation if a plan already exists.

If the session sprawls instead of resolving — questions that can't even be phrased until other answers land, decisions blocked on research or errands — the effort is bigger than one sitting: suggest escalating to `/wayfinder`.
