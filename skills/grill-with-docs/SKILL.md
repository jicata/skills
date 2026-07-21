---
name: grill-with-docs
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates the glossary and ADRs inline as decisions crystallise. Use when user wants to stress-test a plan against their project's language and documented decisions.
---

<what-to-do>

Interview me relentlessly about every aspect of this plan until we reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.

Ask the questions one at a time, waiting for feedback on each question before continuing. Asking multiple questions at once is bewildering.

If a *fact* can be found by exploring the codebase or the documentation, look it up rather than asking me. The *decisions*, though, are mine — put each one to me and wait for my answer.

Do not act on the plan until I confirm we have reached a shared understanding.

If the session sprawls instead of resolving — questions that can't be phrased until other answers land, decisions blocked on research or errands — the effort is bigger than one sitting: suggest escalating to `/wayfinder`.

</what-to-do>

<supporting-info>

## Documentation awareness

Before grilling, orient yourself: the glossary and ADR locations (and any wider documentation policy) are recorded in the project profile (`.claude/doctrine/project-profile.md`). Read the glossary and the non-superseded ADRs that touch the plan's area.

## During the session

### Challenge against the glossary

When the user uses a term that conflicts with the glossary, call it out immediately — quote the glossary's definition against the user's apparent meaning and ask which is intended.

### Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term, preferring one already in the glossary.

### Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent edge cases that force precision about boundaries between concepts.

### Cross-reference with code

When the user states how something works, verify against the code and tests (and the wire-contract docs for public-surface claims). If you find a contradiction, surface it and ask which is current.

### Update inline, not in a batch

When a term or decision is resolved during grilling, write it to its home right then — do not collect everything for a single end-of-session dump; by then half the precision is lost.

- **A new term, renamed term, or new alias-to-avoid** → the glossary (per profile). Inline, not batched.
- **A design decision with rationale** → an ADR (see gate below).

If the grilling reveals that two parts of the system want different definitions for the same term — a sign of an emerging bounded-context split — surface that explicitly rather than papering over it in the glossary.

### Offer ADRs sparingly

Only offer to create an ADR when all three are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful (data shape, persistence boundary, public contract, cross-module protocol).
2. **Surprising without context** — a future reader will wonder "why did they do it this way?" and the code alone won't answer.
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons worth recording.

If any of the three is missing, skip the ADR — the fact belongs in a test, a code comment at the point of surprise, or the issue record.

When an ADR *is* warranted, check whether it **supersedes or deprecates** an existing ADR first, and mark both sides per the repo's ADR conventions (per profile).

</supporting-info>
