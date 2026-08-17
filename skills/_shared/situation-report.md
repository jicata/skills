# Shared: The situation report

Included by `/triage` and `/log-issue`. Defines the beat where the agent comes back and says what is actually going on — **with no fix attached**.

## Why it stands alone

Findings presented alongside a proposal are findings selected to justify that proposal, and they get read that way. The reader's attention lands on the plan, because a plan is the thing you can argue with. "You are looking at the wrong thing entirely" is nearly impossible to say once someone has handed you a solution, and it is the single most valuable thing a reader can say.

So the situation lands first, by itself, and the reader gets to disagree with the diagnosis while disagreeing is still cheap.

## The shape

The spine from [`../../doctrine/how-to-explain.md`](../../doctrine/how-to-explain.md), stopped before the plan:

**Problem → why the obvious fix fails → what they're right about → open decisions.**

Those first three moves are diagnostic. The fourth hands the reader their next decision instead of your answer to it.

Everything in that doctrine governs the prose: short declarative sentences, real named specifics, second person, headers that are the questions the reader would actually ask, a hard stop when a thing is finished. The reader is a senior engineer who is not resident in this system — spend every word on its wiring, none on general vocabulary.

**Walk one real instance through the mechanism.** Actual values from the investigation, tracked through the code's decision points, landing on the exact point where an assumption breaks. Where the investigation queried live data, use those rows. Where it did not, say what you would need to get them — an invented example is worse than an acknowledged gap.

**"Why the obvious fix fails" is the section that earns the beat.** It is the finding the reader cannot get anywhere else, and it is precisely the content that dissolves when a proposal is attached, because by then the obvious fix has already been ruled out silently.

## Four ways it can end

All four are legitimate outcomes. A report that resolves to "nothing here" is a successful run.

1. **Understood** — mechanism established, evidence cited. Carries into authoring or a PRD.
2. **Working as designed** — the reported behaviour is intended. Name the decision or ADR that chose it, and say what would have to change for the report to become valid.
3. **Nothing found** — state where you looked and what you ruled out. Negative evidence is evidence; record the greps that returned nothing and the paths that came back clean.
4. **Cannot establish it** — no repro, no evidence chain. List what was tried and name exactly what you would need: an environment, a captured payload, permission to instrument.

## The gate

Present it and stop. The reader responds before anything is proposed.

Fold it into the proposal instead only when the report arrived fully-formed and the investigation surfaced no open decisions — there is no situation to review that the reader does not already hold.

## Completion criterion

The reader can state the mechanism in their own words and say whether it is the right thing to be looking at. No fix has been proposed.
