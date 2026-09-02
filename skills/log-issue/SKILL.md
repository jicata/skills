---
name: log-issue
description: Author a GitHub issue for a bug or enhancement you can already name — propose the fix, gate it with the user, then file it fully populated (behavior contract, TDD plan, acceptance criteria) ready for /ship-issue, with a walkthrough comment the coder consumes. Redirects to /triage on its own when the report is still a suspicion, and escalates to /write-a-prd when the work outgrows one PR. Use when the user runs /log-issue, or knows what is wrong and wants it written up.
---

# Log Issue

The authoring counterpart to `/ship-issue`, and the light-flow companion to `/write-a-prd`. Turns an understood problem into an issue the autonomous orchestrator can pick up.

**Investigation lives in `/triage`.** This skill owns the proposal, the behavior contract, and the filing. Entered from `/triage`, the situation is already in context. Entered cold, Step 1 establishes it — briefly, because "I know exactly what's wrong" is itself a theory.

Repo facts this skill keys off — canon doc locations, chassis, local stand-in, external consumers, tracker — live in the profile: `.claude/doctrine/project-profile.md`.

## Invocation

`/log-issue` — the user describes the bug or enhancement in chat.

`/log-issue "<description>"` — description inline.

## Step 1 — Establish the situation

**Arriving from `/triage`:** the situation report is in context and the reader has already responded to it. Confirm it still holds, then go to Step 2. Nothing is re-explored and nothing is read from disk — the handoff is the conversation.

**Entered cold:**

0. **Check you're the right skill.** This one authors what the user can already name. A report that names the surface, the concrete instance, or the behaviour it should have shown belongs here. A report that hedges instead — *"I think"*, *"not sure"*, *"something seems off"* — and carries neither an instance nor an expected behaviour is a suspicion, not a defect. Say so in one line and run `/triage`, then return here through its exit 2. Routing is this skill's job; the user types whichever command is in their fingers.

1. **Two questions**, per [`../_shared/report-interrogation.md`](../_shared/report-interrogation.md) — the concrete instance, and the expected behaviour. Quarantine any causal claim the user makes; a report that arrives with its own diagnosis attached still gets that diagnosis tested rather than assumed.

2. **Investigate**, per [`../_shared/investigation-brief.md`](../_shared/investigation-brief.md). Aim it at the observation.

3. **Establish the evidence.** Is the mechanism backed by a **red** loop or an observed evidence chain, or by a code path that merely looks like it would produce this? Plausible-only on a bug-shaped report drops into the `/diagnosing-bugs` loop here, inline, and comes back with the red command.

4. **Write the situation**, per [`../_shared/situation-report.md`](../_shared/situation-report.md), and decide whether it stands alone.

   **Present it and stop, before proposing anything,** on any of three triggers:

   - The investigation **contradicts** what the user told you
   - It **rules out the obvious fix** — the one they would reach for, and probably already have
   - It **reclassifies** the report — bug to enhancement, or the reverse

   Each is a case where the user's model of the problem is about to change, and a model is far cheaper to revise before a plan is attached to it than after. Fold the situation into the Step 3 proposal only when none of the three fired: the investigation confirmed what they already held, and there is nothing to review.

**Classify the shape**, from the findings rather than the wording: **bug-shaped** where existing behavior is wrong, **enhancement-shaped** where it is correct but insufficient. The investigation may reclassify what the report implied.

**Completion criterion:** the mechanism is established with its evidence, and the report is classified.

## Step 2 — Resolve the open decisions

Where the investigation returned open questions, ask them — one at a time, in prose, with concrete options derived from the findings and your recommendation attached.

Skip this entirely where the investigation returned none. Most trivial fixes are fully determined and need no grilling; the trigger is an unresolved branch, not a report type.

If the answers surface further contract decisions, loop **once**: confirm the chosen branch is implementable, then proceed. Still unsettled after one round, that is itself a blast-radius signal — recommend escalation in Step 3.

**Completion criterion:** every open question is answered or has become an escalation signal.

## Step 3 — Propose

1. **The situation** — carried from `/triage`, or written here on a cold entry. Where it already landed as its own gate, summarise in two sentences rather than repeating it.

2. **Sibling symptoms**, where the investigation surfaced any. Ask: *"Bundle these into one issue, file separately, or ignore?"* Recommend bundling where they share a root cause, separate issues where they are independent symptoms that happened to surface on the same trace.

3. **Behavior contract — Current vs Desired.** One row per observable behavior on the surface map, not just the broken one. Desired is the source of truth; currently-correct behaviors get a Desired entry of "unchanged", which is what makes the non-regression envelope explicit rather than assumed. Acceptance criteria derive from this column in Step 5 — they are never invented alongside it.

   **Completeness gate.** After presenting the table, ask: *"Is this list complete, or am I missing a responsibility of this surface?"* Wait for the answer. Fold in additions, re-tracing anything that needs code grounding, and re-present. A row still marked `?` is asked once more and never filed.

   The order is load-bearing. Cold-recall inventories miss the behaviors that matter most; recognition against a thorough enumeration does not. A thin enumeration defeats the gate, which is why the investigation brief demands the surface map be exhaustive even where that feels redundant.

4. **Proposed approach** — modules touched, contracts affected, key invariants. Describe behavior, not file paths or line numbers.

5. **Blast radius.** Three structural signals, each named with the evidence that tripped it:

   - Touches more than one vertical slice
   - Requires an ADR — a decision that outlives this change and that future work will copy
   - Adds a public API surface, or breaks an existing consumer contract

   File counts and diff size are not signals; they rot.

   **None tripped** → "This fits a single-issue, single-PR flow."

   **Any tripped** → recommend escalation:

   > "This is bigger than a single-issue ship. Tripped: \<signals\>. **Recommended:** run `/write-a-prd` — the situation and findings carry over in context, so the interview skips what's already covered."

**Completion criterion:** the user has confirmed the behavior contract is complete.

## Step 4 — User gate

Wait. Three valid responses: **proceed** (Step 5), **escalate** (Step 7), **abort** (stop, write nothing).

Answer clarifying questions and re-present the gate. This is decided by the user, never inferred from silence.

## Step 5 — File it

**If the profile declares `design_pipeline`** and the proposal touches the frontend, invoke its `classify` skill first with a one-paragraph summary of the change, and put the confirmed verdict in the issue per its `doctrine`. Backend-only work skips this. Escalating to the PRD flow instead? Do not classify here — the PRD writer classifies with full PRD context.

Pick the template by final classification.

### Bug template

```markdown
## Problem

**Actual behavior:** <what happens now>

**Expected behavior:** <what should happen>

**Reproduction:**
1. <step>
2. <step>

## Root Cause Analysis

<The mechanism, told through one real instance walking the code's decision points to the exact
point where an assumption breaks. Where a red loop established it, name the command. Describe
modules, contracts and behaviors — not file paths or line numbers, so this survives a refactor.
Where the report arrived with a theory that turned out wrong, say so: "reported as X; actually Y".>

## Behavior Contract (Current vs Desired)

| Behavior | Current | Desired |
|---|---|---|
| <surface behavior 1> | <what it does today> | <what it must do — or "unchanged"> |

The Desired column is the fix envelope. "Unchanged" entries are the non-regression contract.

## TDD Fix Plan

1. **RED**: <test that captures the broken behavior>
   **GREEN**: <minimal change to make it pass>

**REFACTOR**: <cleanup, if any>

## Acceptance Criteria

- [ ] <derived from a Desired entry>
- [ ] All new tests pass
- [ ] Existing tests still pass
- [ ] Documentation updated where affected
```

### Enhancement template

```markdown
## Motivation

<2–4 sentences: the engineering or product gap that drives this. Reference ADRs where relevant.>

## Scope

**In scope:**
- <item>

**Out of scope:**
- <item>

## Design Note

<2–5 sentences on the shape of the change — modules, contracts, invariants. Where the
investigation probed a consumer, the findings and their evidence tier go here; "no consumer
client exists yet" is stated with its negative evidence rather than left blank.>

## Behavior Contract (Current vs Desired)

| Behavior | Current | Desired |
|---|---|---|
| <surface behavior 1> | <what it does today> | <what it must do — or "unchanged"> |

The Desired column is the change envelope. "Unchanged" entries are the non-regression contract.

## TDD Plan

1. **RED**: <test that expresses one AC>
   **GREEN**: <minimal change to make it pass>

## Acceptance Criteria

- [ ] <derived from a Desired entry>
- [ ] All new tests pass
- [ ] Existing tests still pass
- [ ] Documentation updated where affected
```

Create it, respecting any auth constraints the profile declares:

```bash
gh issue create \
  --title "<short imperative title>" \
  --label <bug|enhancement> \
  --body-file <scratch-path>
```

Title style: imperative, lowercase but for proper nouns, no trailing period — `Fix duplicate rows on concurrent upsert`, `Add tenant-scoped pagination to the session list`.

Print the URL.

## Step 6 — Post the walkthrough comment

The coder that `/ship-issue` dispatches reads this before implementing, instead of re-deriving the slice from scratch. It is a point-in-time planning artifact living on the work item — no standing repo doc grows from it.

**Its first line must be exactly `<!-- expand-issue:walkthrough -->`.** Both `/execute-issue` and `/afk-execute-issue` key on that literal string. A new marker is a comment nothing reads.

**The body is the situation report**, already written, with the agreed fix folded in and the open-question framing dropped. Add the two sections that only exist once a fix is settled:

- **Sharp edges** — failure modes, chassis interactions, tenancy and concurrency traps, invariants that must hold. Stated as review heuristics: *"if you see X in the PR that's a bug; the risky file is Y."*
- **Change-impact model** — what ripples, which edits are safe versus dangerous, what the tests catch and what they miss.

The exit bar is that the reader could review the resulting PR, or maintain this slice, as if they had written it.

```bash
gh issue comment <n> --repo <owner/repo> --body-file <scratch>
```

**Skip both this step and its two extra sections** for a trivial, fully-determined fix — a typo, a one-line guard, an obvious mapping. There is nothing to teach and a manufactured briefing costs the coder attention.

Then:

> Logged issue #\<n\>. Run `/ship-issue <n>` to autonomously implement, review, and merge.

## Step 7 — Escalate

The situation report, findings, behavior contract and unresolved questions are all in context. `/write-a-prd` reads them there.

> Recommended: run `/write-a-prd`. The investigation carries over, so the interview picks up at the open questions.

Stop. The user invokes it — ceremony transitions stay user-gated.

## Critical rules

1. **The user gate sits between propose and create.** No issue is filed without it.
2. **Escalation is a recommendation.** Blast-radius signals inform the user's choice; they never act on their own.
3. **Behavior contract before acceptance criteria.** Every issue carries a Current vs Desired table covering the full surface map, and the ACs derive from its Desired column.
4. **The user's agreement bounds the ACs.** An AC they pushed back on is dropped.
5. **Issue bodies describe behaviors and contracts** — modules, invariants, observable effects. Never file paths or line numbers; the issue should survive a major refactor.
6. **Use the existing labels** (`bug`, `enhancement`). Missing ones get created: `gh label create bug --color d73a4a`, `gh label create enhancement --color a2eeef`.
7. **One issue per invocation.** Two unrelated problems means asking which comes first, and re-invoking for the second.

## Edge cases

- **The investigation shows the reported bug is working as designed** → present that in Step 3; the user may abort or reframe it as an enhancement.
- **The code path cannot be located** → say so plainly and ask for more context before proposing. A proposal built on a guessed mechanism is worse than no proposal.
- **Signals trip but the user wants the light flow anyway** → respect it, file the issue, and record the overridden signals under a `## Note` section so `/ship-issue` inherits the context.
- **The user asks how this differs from `/write-a-prd`** → light flow is one issue, one PR, autonomously merged by `/ship-issue`. PRD flow is a multi-issue feature under `/ship-feature`. Ceremony scales with blast radius.
- **The user asks how this differs from `/triage`** → triage investigates and stops at a situation; this authors and files. The split is certainty, not size — and Step 0 routes it for them, so either command is a fine thing to type.
