---
name: lab
description: Run a lab — turn a hunch into a measured verdict without touching production. Use when the user types /lab, wants to test a hunch before building on it, compare two approaches head-to-head, or continue an existing lab issue.
---

# Lab

A **lab** turns a hunch into a verdict backed by numbers, without touching production.

Three roles:

- **Operator** — the user. Holds the budget, authorizes spend, calls the verdict.
- **Lab Brain** — you. Designs the experiment, calibrates the instruments, runs the campaign with the operator.
- **Lab Assistant** — a coder agent, dispatched separately. Builds instruments; never touches real data and never spends.

The durable artifact is the **notebook**: the purpose issue, appended to as the lab runs. The session is scratch, the notebook is the lab — anything learned that exists only in this conversation is lost when the context compacts.

Repo facts this skill keys off (tracker, stack, local stand-in, live-data safety constraints) live in the profile: `.claude/doctrine/project-profile.md`.

## Routing

`/lab <hunch>` opens a new lab. `/lab <issue#> [anything the operator says]` continues one.

With an issue number, read the purpose issue and the instrument issue it links, then **state which phase you're in before acting** so the operator can redirect you in one line.

| State of the purpose issue | Phase |
| --- | --- |
| No issue yet — a hunch in prose | **1 — Grill** |
| Filed; instrument issue still open | **2 — Assistant building** |
| Instrument issue closed; no `## Calibration` comment | **3 — Calibrate** |
| `## Calibration` present; no `## Verdict` comment | **4 — Campaign** |
| `## Verdict` present | **5 — Dispose** |

Within one session you run straight through the phases in conversation — the operator re-invokes only from a cold context.

## Phase 1 — Grill the hunch into a question

Grill per `grill-me`'s discipline: one question at a time, each with your recommended answer, facts looked up in the environment rather than asked. The lab-specific agenda, in order:

1. **Split it.** A hunch usually carries more than one question. Name them and have the operator pick. A lab answers one.
2. **Find the prior.** What observation provoked this? If a number already exists, cite it; if not, the first move is the free measurement — run it now from logs, the database, or existing reports. A hunch with no observation behind it has not earned a lab.
3. **Decline when it isn't a lab**, and route instead:
   - answerable from data already in hand → answer it, no lab
   - no result would surprise anyone → it's a build; route to the repo's issue logger
   - too big for the operator to sit through in a few sittings → `/wayfinder`
4. **Take the prediction.** What does the operator expect to find? Recorded before anything runs, so the result is able to contradict it.
5. **Set the decision rule.** What number means what verdict — including the branch where nothing wins. A rule written after the numbers arrive is a rationalization.
6. **Fix the arms.** What is being compared against what. There is always a **control arm** — what happens today, run over the same specimens on the same day. A measurement with no control is uninterpretable.
7. **Set the meter.** A pilot small enough to establish real per-unit cost, an operator go/no-go on the observed spend, then a hard ceiling. Size the campaign to fit the ceiling; never raise the ceiling to fit the campaign.
8. **Take stock of instruments.** What already exists, what has to be built.

**Completion criterion:** the operator has agreed the question, the prediction, the decision rule, the arms, and the ceiling. Then file both issues per [`ISSUE-TEMPLATES.md`](ISSUE-TEMPLATES.md).

When the instruments already exist, file only the purpose issue and go straight to phase 4 — that is the payoff for the first lab having paid for them.

## Phase 2 — The Assistant builds

Not your work. Tell the operator to dispatch the instrument issue through the repo's normal shipping route (`/ship-issue <n>` or `/execute-issue`, per the profile's pipeline tier), **in a separate session**, so campaign context stays clean.

If asked for status, read the instrument issue and report it. Do not start the campaign against a half-built instrument.

## Phase 3 — Calibrate

Calibration asks whether the instrument reproduces the thing it stands in for. It is **not** a code review: the code can be perfectly correct against an instrument issue whose premise was wrong, pass review, and still measure the wrong population.

Read the fidelity statement from the instrument issue's close-out, then verify each claim **against the production source — never against the purpose issue.** You wrote the purpose issue; checking one against the other confirms your own error instead of finding it. Cite `file:line` for what production actually does.

For each divergence, say explicitly whether it moves a number across a threshold in the decision rule. Some won't matter; say which.

Record a `## Calibration` comment on the notebook: the statement, what you checked it against with citations, the divergences, and for each one whether the instrument was fixed or the divergence accepted. Amend the purpose issue where the decision rule has to move.

**Completion criterion:** every claim in the fidelity statement checked against production and accounted for. This gate closes before the first paid call.

## Phase 4 — Campaign

You and the operator, interactively. Never autonomous.

- **Report fractions with n**, stratified where the population is mixed. Portable fractions, never synthetic absolutes.
- **Run blind wherever judgment decides an outcome** — randomized arms, sealed key, the operator's judgment recorded before unsealing. The operator may waive it; record that as open-label by choice on the notebook rather than letting blinding quietly evaporate.
- **Append as you go.** Each round of results becomes a notebook comment while it's fresh. Three other things earn their own comments: surprises against the prediction, operator challenges that change the design, and **design intents** — decisions made in passing that a downstream PRD must inherit even though they don't change the experiment.
- **Watch the meter.** Report spend against the ceiling each round, and stop at the ceiling.
- **Negative results are results.** An arm, source, or approach that failed gets its numbers written down so it isn't proposed again.

**Completion criterion:** the decision rule resolves, or the ceiling is reached and you say so.

## Phase 5 — Dispose

Write a `## Verdict` comment: the answer read off the decision rule, whether it confirmed or contradicted the prediction, and what would have changed it. Then take exactly one of three exits — never none:

- **Promote** → file a `(PRD seed)` issue citing this one, and tell the operator to pick it up with `/write-a-prd`.
- **Kill** → add a constraint to `.claude/doctrine/project-profile.md` with its why and this issue as the evidence pointer. A killed experiment is a scar earned without an incident, and this is the exit most often skipped.
- **Park** → state what would settle it and what that would cost.

Close the purpose issue once the exit is taken.
