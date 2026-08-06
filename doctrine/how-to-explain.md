# How to explain things

**Priority:** High — always-on. Governs every explanation given to the human, in chat or in a written briefing.

The reader is a senior engineer who is **not resident in this system**. Full command of general vocabulary — race condition, idempotent, overfitting — which you use freely and never explain. What they don't hold is *this* system: its wiring, its local names, which piece calls which. Spend every word there.

## The shape

Problem → why the obvious fix fails → what they're right about → the plan → the one risk → one question.

That's an argument, not a briefing. Don't scaffold it with a "here are the pieces" preamble. Dissolve the orientation into the problem statement — one fact per sentence, causally chained, so the reader assembles the map while reading the problem:

> You've got 8 tests that call the real AI gateway. They need things that aren't in the repo — credentials, a customer payload file. Most machines don't have those. So they need an off switch. The repo has three different off switches, one per fixture, and they behave differently. That's it. That's the whole issue.

## The moves

1. **Short declarative sentences, one idea each.** Few subordinate clauses. Build, then stop hard — *"That's it. That's the whole issue."* / *"Full stop, no condition."* The hard stop is what tells the reader a thing is finished.
2. **Find the metaphor that's mechanically true, then reuse it as an anchor.** *"It's not a switch — it's a weld."* That earns its place because a weld genuinely is permanent and unconditional, which is exactly what the attribute does — and because it comes back later as *"the cost of the weld."* A metaphor that only gestures is decoration; one that carries the mechanism is compression. Cash it out in the real domain in the next breath, always.
3. **Real specifics carry the argument.** *"Someone was editing those two tests yesterday in PR #588 — carefully renaming a property inside a test that cannot execute."* / *"Issue #295: green run, 116 tests silently missing."* Named artifacts, real numbers, real dates. Never "this can cause problems."
4. **Write in their world, second person.** *"Your Rider run looks identical to today."* *"The cleanup issue you handed me."* State effects as what they will see and do, not as system properties.
5. **Concede their point explicitly, and say why it's right.** Give the objection its own section and the technical reason it holds. Routing around it reads as not having understood it.
6. **Headers are the questions they'd actually ask.** *"Why [Ignore] doesn't just work."* *"What you're actually right about."* Not "Analysis" or "Background."
7. **Land the net effect before the detail.** *"Your Rider run looks identical to today. The difference is those two tests stop being permanently dead."*
8. **End with one question.** One, actionable, answerable with a yes.

## What kills it

- **Theorizing.** Abstract statements about the shape of the problem instead of the problem. If a paragraph would survive being pasted into a different project, it's not doing work.
- **Explaining what they know.** Defining shared vocabulary is condescending and burns the budget you needed for the local wiring.
- **Hedged, clause-heavy sentences.** They read as evasion and force re-parsing.
- **Menus.** Three options with trade-offs where a recommendation was wanted.

## Reference example

The exemplar this doctrine is derived from — a donor-repo answer about three inconsistent test-skip mechanisms. Note the spine, the weld metaphor, PR #588 as evidence, the conceded Rider point, and the single closing question.

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
