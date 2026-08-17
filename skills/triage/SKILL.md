---
name: triage
description: Investigate a vague or low-confidence report — "I think something's wrong here, not sure" — and come back with what is actually going on, before any fix is proposed. Interviews the reporter only where a human answer redirects the investigation, quarantines their theory as a claim to falsify, and reports the situation as its own gate. Exits to /log-issue, /write-a-prd, /diagnosing-bugs, or nothing-to-file. Use when the user runs /triage, says something feels broken or off, or asks what is going on with a surface before deciding what to do about it.
---

# Triage

Understand the report. Stop there.

The deliverable is a **situation** — what is actually going on, standing on its own, with no fix attached. Filing an issue is one of four exits and never the goal, which is what lets a report resolve to "nothing here" without being squeezed into an issue to justify the run.

The authoring counterpart is `/log-issue`, which owns the proposal and the filing. Reach for it directly when you already know exactly what is wrong; reach here when you don't.

Repo facts this skill keys off — canon doc locations, chassis, local stand-in, external consumers, tracker — live in the profile: `.claude/doctrine/project-profile.md`.

## Invocation

`/triage` — the user describes what they noticed in chat.

`/triage "<description>"` — description inline; skip the opening question.

## Step 1 — Capture the report

With no inline description, ask one question: *"What are you seeing, and what makes you think something's wrong?"*

The second half is load-bearing on a low-confidence report. "Not sure" reporters can rarely name a defect, but they can always name what made them look — a number that seemed off, a customer remark, something that felt slow. That is enough to aim an investigation.

**Completion criterion:** the report is captured verbatim, in the reporter's words.

## Step 2 — Interrogate the report

Run the interview per [`../_shared/report-interrogation.md`](../_shared/report-interrogation.md): quarantine the theory, apply the redirect test, one question at a time in prose with your recommended answer attached.

**Skip it** when the report already carries a concrete instance, an expected behaviour, and no causal claim — there is nothing left to sort. Most reports carry a causal claim, so expect this step to run.

**Completion criterion:** as stated in that file — every claim sorted into observation or quarantined theory, every open axis answered or recorded as an unknown with a destination.

## Step 3 — Investigate

Use the `Agent` tool with `subagent_type=Explore`, briefed per [`../_shared/investigation-brief.md`](../_shared/investigation-brief.md).

Aim it at the observation. Hand the quarantined theory over as a claim to falsify.

**Completion criterion:** the six sections of that brief are returned and its completion criterion is met.

## Step 4 — Establish the evidence

Look at what came back and answer one question honestly:

> Do I have a **red** loop or an observed evidence chain for this mechanism — or a code path that merely looks like it would produce this?

Code-reading yields plausible mechanisms. It cannot establish causation, and a plausible mechanism presented as a root cause is how a wrong fix ships with confidence.

**Plausible only, and the report is bug-shaped** → run the `/diagnosing-bugs` loop **here**, inline, and come back with the red command and the mechanism it proves. No user round-trip: a handoff that asks the reporter to go run another command and return is a handoff that never happens.

**Plausible only, and no loop can be built** → that is exit 4. Skip to Step 6.

**Enhancement-shaped** → there is no causation to establish. Proceed.

**Completion criterion:** the mechanism is backed by a red loop, an observed evidence chain, or an explicit statement that it is neither.

## Step 5 — Report the situation

Write it per [`../_shared/situation-report.md`](../_shared/situation-report.md) — problem, why the obvious fix fails, what the reporter is right about, open decisions. One real instance walked through the mechanism. No proposed fix.

Then **stop and wait**. The reader's cheapest correction is "you're looking at the wrong thing", and it is only available while nothing has been proposed. If they redirect, return to Step 3 with the new aim.

Fold this into the next skill's proposal only when the report arrived fully-formed and the investigation surfaced no open decisions.

**Completion criterion:** the reader has responded to the situation.

## Step 6 — Exit

Four exits. Name the one you are taking and why.

**1 — Nothing to file.** Working as designed, or nothing found. State what was ruled out and where you looked, per shape 2 or 3 of the situation report. Stop. A run that ends here did its job.

**2 — Author it** → `/log-issue`. The work fits one PR. The situation report is already in context; it is the handoff. Nothing is written to disk.

**3 — Escalate** → `/write-a-prd`. Any of three structural signals, each named with the evidence that tripped it:

- Touches more than one vertical slice
- Requires an ADR — a decision that outlives this change and that future work will copy
- Adds a public API surface, or breaks an existing consumer contract

File counts and diff size are not signals; they rot. The situation report carries over as context — no seed file.

**4 — Blocked.** No repro, no evidence chain. List what was tried and name exactly what unblocks it: an environment that reproduces it, a captured payload, permission to instrument.

Recommend the exit. The reader picks.

## Critical rules

1. **Propose nothing before Step 5 lands.** The whole value of the situation report is that it can be disagreed with before a plan exists to defend.
2. **The reporter's theory is evidence about the reporter, not about the system.** It gets falsified or confirmed explicitly, and the result is stated either way.
3. **"Nothing here" is a successful outcome.** Reaching for an issue to justify the run is the failure this skill's exit structure exists to prevent.
4. **Never file an issue from this skill.** Authoring belongs to `/log-issue`; exit 2 hands off to it.
5. **One report per invocation.** A reporter describing two unrelated things picks which to triage first, and re-invokes for the second.
6. **Escalation is a recommendation.** The reader chooses the exit. Ceremony transitions stay user-gated.

## Edge cases

- **Reporter cannot answer any interview question** → proceed on that basis; the investigation goes in wide and the evidence bar is met by building a red loop rather than by reading code. Say plainly that the situation report will be a survey of ranked suspicions, not a mechanism.
- **The investigation confirms the reporter's theory exactly** → say so, and say what would have falsified it. A confirmed theory that was never testable is not evidence.
- **Sibling symptoms outnumber the reported one** → report all of them in the situation; the reader decides scope at the exit rather than mid-investigation.
- **The report resolves mid-interview** — the reporter realises what happened while answering → stop, record it, exit 1. The interview did its job.
- **Blast-radius signals trip on a report that resolves to "nothing here"** → exit 1 still wins. There is nothing to size.
