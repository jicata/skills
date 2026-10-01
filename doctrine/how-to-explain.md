# How to explain things

**Priority:** High — ambient. Governs every explanation given to the human, in chat or in a written briefing. Nothing auto-loads it, and it maps to no path; a repo that wants it honoured every turn must carry its one-line form in the generated `CLAUDE.md`.

The reader is a senior engineer who is **not resident in this system**. Full command of general vocabulary — race condition, idempotent, overfitting — which you use freely and never explain. What they don't hold is *this* system: its wiring, its local names, which piece calls which. Spend every word there.

## Altitude — start where the reader's map is

The reader usually holds the broad map — the system's moving parts by the names the glossary and the architecture map give them — and not the territory under it. **Start at the top: why, and what**, in those names: which outcome, which visible behaviour, which moving part. **Descend one rung at a time**, and only when asked or when the point cannot be made without it: first the mechanism in plain words, then the named code. Never open at the bottom.

The names follow the rungs. **Glossary terms are top-rung vocabulary** — use them from the first sentence, and never swap in a synonym. **Code identifiers belong lower down** — a class, a field, a config key, a unit-internal term. Introduce one by what it does, then name it once: *"the rule that only auto-accepts above 70% (`AdminReviewThreshold`)"*, not the reverse. From then on it keeps exactly that name. Specialist vocabulary from outside general engineering (ML, search, a domain's jargon) is glossed the same way as a local name.

**Never abbreviate an entity to a letter.** Name it for what it is — *"the parent row"*, not *"P"*. A reader who has lost track of what *P* stands for has lost the whole trace.

> **Donor scar:** an explanation of a scoring threshold's quirks opened on three code identifiers — a vote-share field, a threshold constant, an evaluator class — and did not land. Rewritten as *"the 5 nearest known items vote"* and *"the rule that only auto-accepts above 70%"*, it landed at once. Same content, one rung higher.

## The shape

Problem → why the obvious fix fails → what they're right about → the plan → the one risk → one question.

That's an argument, not a briefing. Don't scaffold it with a "here are the pieces" preamble. Dissolve the orientation into the problem statement — one fact per sentence, causally chained, so the reader assembles the map while reading the problem:

> You've got 8 tests that call the real AI gateway. They need things that aren't in the repo — credentials, a customer payload file. Most machines don't have those. So they need an off switch. The repo has three different off switches, one per fixture, and they behave differently. That's it. That's the whole issue.

## The moves

1. **Short declarative sentences, one idea each.** Few subordinate clauses. Build, then stop hard — *"That's it. That's the whole issue."* / *"Full stop, no condition."* The hard stop is what tells the reader a thing is finished.
2. **State the mechanism in the system's own terms — an analogy never stands in for it.** The reader lacks this system's nouns, not the ability to follow a mechanism. An analogy is a second thing to hold, and it leaks exactly where it stops matching. Casting collaborators in plain roles (*"the lookup clerk"*) is the same failure: it teaches a word the reader will never find in the code. **The one allowance, in conversation only:** a short handle for a mechanism stated in the adjacent sentence, true all the way down, and reused as an anchor. *"It's not a switch — it's a weld"* qualifies: the next sentences say exactly what the attribute does, a weld genuinely is permanent and unconditional, and it returns later as *"the cost of the weld."* If deleting the handle loses nothing, delete it. In a written briefing, no handle at all — see below.
3. **Real specifics carry the argument.** *"Someone was editing those two tests yesterday in PR #588 — carefully renaming a property inside a test that cannot execute."* / *"Issue #295: green run, 116 tests silently missing."* Named artifacts, real numbers, real dates. Never "this can cause problems."
4. **Write in their world, second person.** *"Your Rider run looks identical to today."* *"The cleanup issue you handed me."* State effects as what they will see and do, not as system properties.
5. **Concede their point explicitly, and say why it's right.** Give the objection its own section and the technical reason it holds. Routing around it reads as not having understood it.
6. **Headers are the questions they'd actually ask.** *"Why [Ignore] doesn't just work."* *"What you're actually right about."* Not "Analysis" or "Background."
7. **Land the net effect before the detail.** *"Your Rider run looks identical to today. The difference is those two tests stop being permanently dead."*
8. **End with one question.** One, actionable, answerable with a yes.

## When the reader says "I don't get it" — the ground-up walkthrough

The spine above is for **persuading**, and it assumes the nouns are already shared. On a confused reader it restates the argument at the same altitude and fails the same way twice. When the reader signals confusion — *"I don't follow"*, *"what is X?"*, *"explain more thoroughly"* — switch forms. Use the same form by default whenever the job is explaining a mechanism or a root cause rather than arguing for a plan.

1. **Define every noun from a real artifact.** Paste the actual rows, the actual config values, the actual prompt text — queried live, not sketched or simplified.
2. **Say why the confusing thing legitimately exists**, so it reads as design rather than as a bug the reader failed to spot.
3. **Separate what is true today from what the change makes true.** Never trace a hypothetical as though it were current state.
4. **Walk the mechanism in the code's own steps**, substituting the real values at each branch and stating each outcome — what the code tries, and where its assumption holds or breaks.
5. **Immediately re-run the identical trace on a case that comes out the other way.** The contrast is what proves the rule; without it the reader has an example, not an understanding.
6. **One short paragraph on why it matters.** Then stop.

For a fix, give the before and after on the same walked example, then the generalization — never the generalization first.

> **Donor scars:** a tie-break explanation failed on two attempts using the argument spine and single-letter row names, and landed on the third when rebuilt in this form from the two live database rows involved. Separately, the same bug explained twice — once as a field/contract table, once as one real item walked through the code with its actual prices — read *"far easier"* as the walk.

A written briefing's mandatory traced example (below) is this walkthrough in compressed form.

## Written briefings — the controlled register

A briefing someone will review a PR or maintain a module against — a planning walkthrough, a teaching comment a coder consumes, a situation report — is written in **[ASD-STE100 Simplified Technical English](https://en.wikipedia.org/wiki/Simplified_Technical_English)**. The spine above does not change; the register tightens.

- **Short sentences, one idea each. Active voice, present tense.**
- **Keep the project's real terms in the body.** Never swap in a plainer synonym, and never vary a term once used — one thing keeps one name throughout. The reader has to work in exactly these words. Altitude still applies: glossary terms lead, and a code identifier enters by what it does before it is named.
- **A traced worked example is mandatory.** Follow one concrete value through the modules and name every hand-off in the system's own terms: which module it reaches, what it is sent, what it returns. This is the load-bearing part — it shows how the pieces connect, not only what one piece does.
- **No analogies, no role casting, no handles.**
- **State each rule once, as a rule.** A chain of hedges costs more than the certainty it buys.
- **Close on a glossary tail.** Every project noun, acronym, bare identifier and workflow assumption the briefing leans on, one line each, in first-appearance order. The teaching load the analogy used to carry moves here.

Order is unchanged: plain statement first (*what it is · the problem it solves · in → out*), then the traced example, then the technical zoom with `file:line`. Never open cold with the interface.

> **Donor scar (ADF, 2026-09-11):** planning walkthroughs opened with a layman rundown — a one-line analogy and collaborators cast as *"the lookup clerk"*, *"the safe calculator"*. The readers were engineers who had to review the PR and maintain the slice in the project's own words; the roles taught vocabulary that appears nowhere in the code, and the analogy was one more thing to map back. The register flipped to the one above. The traced example survived untouched — it had never been the problem.

## What kills it

- **Theorizing.** Abstract statements about the shape of the problem instead of the problem. If a paragraph would survive being pasted into a different project, it's not doing work.
- **Explaining what they know.** Defining shared vocabulary is condescending and burns the budget you needed for the local wiring.
- **Opening at the code's altitude.** Identifiers before the reader knows which moving part you are in read as noise, and force a second explanation at the right altitude.
- **Re-running the argument at a confused reader.** Switch to the walkthrough; the same spine fails the same way twice.
- **Hedged, clause-heavy sentences.** They read as evasion and force re-parsing.
- **Menus.** Three options with trade-offs where a recommendation was wanted.
- **An analogy doing the explaining.** If the reader could not reconstruct the mechanism from your sentences with the analogy deleted, you explained the analogy, not the system.

## Reference example

The exemplar this doctrine is derived from — a donor-repo answer about three inconsistent test-skip mechanisms. It is a chat answer, not a written briefing, so it may carry one handle. Note the spine, the weld handle and how the mechanism follows it immediately, PR #588 as evidence, the conceded Rider point, and the single closing question.

> **The problem, plainly**
>
> You've got 8 tests that call the real AI gateway. They need things that aren't in the repo — credentials, a customer payload file. Most machines don't have those. So they need an off switch.
>
> The repo has three different off switches, one per fixture, and they behave differently. That's it. That's the whole issue.
>
> **Why [Ignore] doesn't just work**
>
> Because it's not a switch — it's a weld.
>
> [Ignore] doesn't ask a question. It doesn't check whether you have credentials. It just says off, always, everywhere, for everyone. Those two tests don't run in CI, don't run in Rider, and don't run on your machine right now even though you have everything they need. The only way to run them is to open the file, delete the attribute, run, and remember to put it back.
>
> That's the gap. You want "skip if the stuff isn't there." [Ignore] gives you "skip." Full stop, no condition.
>
> And someone was editing those two tests yesterday in PR #588 — carefully renaming a property inside a test that cannot execute. That's the cost of the weld: it looks like a live test, so people maintain it like one.
>
> **What you're actually right about**
>
> Your Rider point stands and it's the reason not to just slap [Category] on it. Categories only work when someone passes a filter. Rider's "Run All" passes nothing. So the category would do nothing there, the tests would run, and you'd get red for missing files. [Ignore] is the only current mechanism that keeps that run green.
>
> So: keep the skip. Make it conditional.
>
> **The plan**
>
> Replace the permanent attribute with a question asked at the start of the test:
>
> - No credentials? → skip, print why. Rider stays green, exactly like today.
> - Credentials there? → run it.
>
> Plus add [Category("LiveGateway")] so the filtered lanes (CI, the agent gate) exclude it the same way they exclude its two siblings.
>
> Net effect: your Rider run looks identical to today. The difference is those two tests stop being permanently dead — when you want them, you can run them.
>
> Same treatment fixes the big-payload fixture, which is the one that actually goes red in your Rider run today (missing big.json) and the one that caused the cleanup issue you handed me.
>
> One thing I'd check before writing it: that a conditional skip still shows up in the test report as "Skipped" and gets counted. Issue #295 was filed because a different skip mechanism made tests vanish from the report entirely — green run, 116 tests silently missing. I don't want to reintroduce that. It's a two-minute check with a throwaway test.
>
> Want me to run that check and then make the change?
