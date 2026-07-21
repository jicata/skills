# Surface, don't chase

**Priority:** Medium — always-on ambient rule.

When you're already deep in a file for another reason (a bug fix, a feature, a review) and notice a genuine architectural smell — an over-complex key, a god orchestrator, infra tangled with domain, a concept smeared across shallow files — **name it in one line, offer to log it, then get back to the task.** Do not fix it, do not expand the current diff, do not launch a diagnosis.

This captures the good instinct (the context is loaded *right now*) without its two failure modes: scope creep on focused work, and turning every task into an architecture essay.

## Contract

1. **Only piggyback on context you already loaded.** No proactive scanning. If you didn't open the file for another reason, this rule doesn't fire.
2. **One line, then stop.** `Smell: <what> — <why it's a candidate>.` No refactor sketch, no root-cause dig inline.
3. **Offer to log, don't auto-log.** The user decides. On yes, log it to the destination the project profile's routing section declares (a per-area backlog issue, a real issue via the repo's issue-authoring skill — whatever the profile says).
4. **Never touch the current change.** The smell goes to the log, not the diff. The diff stays scoped to the task at hand.
5. **A structure chosen by a non-superseded ADR is not a smell.** It was a deliberate decision — don't flag it.

## Escalation

If the smell is clearly worth real analysis — a structural drift needing diagnosis and a fix plan, not a one-liner — point at the deep pass instead of doing it here:

> "Worth a proper look — run `/improve-codebase-architecture` on `<area>`."

## Watch the cost of the fix, not just the smell

A smell being real doesn't mean fixing it is cheap. Physical schema changes especially: e.g., in the donor stack a primary-key column rename meant a data migration — heavy — where the equivalent code rename was trivial. A well-spotted smell with an expensive fix is correctly a *logged* item, never an in-flight one — this rule should reinforce parking it, never tempt "just simplify it now."
