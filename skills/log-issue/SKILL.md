---
name: log-issue
description: Investigate a reported bug or enhancement, propose a fix/approach to the user, and on approval create a fully-populated GitHub issue (with root cause/motivation, TDD plan, and Acceptance Criteria) that is ready for /ship-issue. For non-trivial issues, delivers an /expand-issue-style teaching briefing and persists it as the walkthrough comment the coder consumes. If investigation reveals the work is too big for a single-issue/single-PR flow, write a PRD seed file and recommend escalation to /write-a-prd.
---

# Log Issue

The authoring counterpart to `/ship-issue`. Light-flow companion to `/write-a-prd`. Investigates a reported problem or enhancement request, proposes an approach, and creates a GitHub issue that the autonomous `/ship-issue` orchestrator can pick up.

If the investigation reveals the work is structurally bigger than a single PR (touches multiple slices, requires an ADR, etc.), the skill writes a PRD seed file and hands off to `/write-a-prd` instead.

Repo facts this skill keys off (canon doc locations, chassis, local stand-in, external consumers, tracker) live in the profile: `.claude/doctrine/project-profile.md`.

## Invocation

`/log-issue` — interview-driven; the user describes the bug or enhancement in chat.

`/log-issue "<description>"` — description passed inline; skill skips the opening question.

## Process

### Step 1 — Capture the report

If no inline description, ask **one** question: *"What's the problem you're seeing, or what would you like to change?"*

Do not ask follow-up questions yet. The interview comes after Explore.

### Step 2 — Classify the report shape

Infer from the description (you may revise after Explore):

- **Bug-shaped** — words like "broken", "wrong", "shouldn't", "doesn't work", "fails", "regression". Existing behavior is incorrect.
- **Enhancement-shaped** — words like "add", "change", "improve", "instead of", "would be nice", "support X". Existing behavior is fine but insufficient.

Record the classification but do not lock it. Investigation may reclassify.

### Step 3 — Explore

**Hard-bug gate (bug-shaped only).** Before investigating, ask: *can this bug be reproduced and explained from what's in hand?* If not — intermittent, unreproduced, a regression with no obvious cause — run `/diagnosing-bugs` first and come back with its output: the root cause, the red-capable repro command, and the chosen test seam. Those feed this skill's Root Cause Analysis and TDD Fix Plan directly. Investigating an unreproduced bug by code-reading alone is guessing — the exact failure the gate prevents.

Use the `Agent` tool with `subagent_type=Explore` to investigate. Tell it:

- For **bug-shaped**: trace the code path that produces the wrong behavior, identify the root cause (not just the symptom), find adjacent tests and similar working patterns elsewhere
- For **enhancement-shaped**: locate where the change would land (which slice, which files, which component), identify the current behavior in that area, find adjacent code that does something similar

Mandatory per the docs-first doctrine: the Explore agent reads the lean doc canon before answering — the glossary, the architecture/concept map to locate the area, and the relevant ADRs (locations per the profile) — then the slice's code and tests.

**Consumer-contract gate.** If the issue creates or changes anything a consumer calls — a route, verb, request/response shape, required/optional field, status contract, or a resource decomposition — and the profile's External contracts section declares a consumer or legacy oracle whose truth lives elsewhere, read the repo's consumer-contract doctrine (if the profile points at one) and have the Explore agent probe that consumer **before** you propose a shape in Step 6. Pin every claim to a route constant + verb, never a folder or component name — names collide across the seam. Record the findings and their evidence tier in the issue's Design Note; **"no consumer client exists yet" is a valid result** and must be stated with its negative evidence rather than left blank.

**State-shaped bug detection.** If the bug touches any of the following, classify it as **state-shaped** and apply the extra rigor below:

- URL / route / query-string state
- Persisted state (DB rows, local storage, cookies, session)
- In-memory state shared across components
- Event payloads, message contracts, or any serialized hand-off between modules
- Anything with an encoder/decoder pair, or a "write here, read there" shape

**For state-shaped bugs, Explore must trace the full pipeline, not just the symptomatic side.** That means:

1. **Encoder side** — what writes the state
2. **Decoder side** — what reads it back
3. **Consumer(s)** — what acts on the decoded state (filter queries, render logic, hydration, downstream events)
4. **Round-trip property** — does encode → decode → consume produce the same observable behavior as the pre-encode in-memory state?

A symptom on one side is frequently caused by a contract mismatch on another side. Reading only the side the symptom appeared on is the failure mode that produced the donor stack's URL-state bug cascade (donor issues #340 → #342 → #344) — each pass fixed one side and shipped, then the next side broke.

**Verify "the other side already does X" claims.** If the diagnosis leans on a behavior of code Explore did not modify (e.g. "the backend already expands descendants", "the cache already invalidates this key"), Explore MUST cite the file and symbol it inspected to confirm that claim. An unverified cross-module assumption is a halt condition — go read it, or strike the claim from the findings.

**Sibling-symptom sweep.** Before returning, Explore must answer: *"While tracing this pipeline, did I notice other broken or contract-violating behavior the user did not report?"* List any sibling symptoms with the same root cause. The user gets to decide in Step 5 whether to bundle them into one issue, file siblings, or escalate — but they must be surfaced, not silently dropped.

**Surface map (aggressive enumeration).** Explore must enumerate the **observable behaviors of the affected surface** (endpoint, contract, slice behavior) *exhaustively*, not just the broken one. The user will be shown this list at Step 6 and asked whether anything is missing — recognition is easier than recall, but only if the list is thorough enough to actually prompt the user's memory. A thin list defeats the gate. Walk these axes for any API/backend surface and produce one row per axis on which the surface has observable behavior:

- **Happy-path response** — status code, response shape, returned fields
- **Side effects on persistence** — what rows are written/updated/deleted in the repo's database; seeded state that must be respected (per the profile's Persistence section)
- **Side effects on downstream** — events published, external API calls triggered, lock behavior
- **Error / boundary states** — what happens with invalid input, missing rows, concurrent modification, wrong-tenant access; which exception maps to which HTTP status (per the chassis's mapping, if the profile declares a chassis)
- **Concurrency / optimistic-lock** — does the surface sit inside a chassis-owned transaction wrapper (if any, per profile)? what happens on a concurrency abort?
- **Tenancy / auth** — does the surface enforce tenant/user scoping? what happens with a wrong claim? (if the repo is multi-tenant, per profile)

Include behaviors that are currently working but share DB context, query paths, middleware, or event handlers with the defect — they constrain the fix and define the "do not regress" envelope. **A behavior that "obviously isn't affected" is exactly the kind that gets silently regressed; list it anyway.**

This list is the input to the Current vs Desired table the user signs off on in Step 6, and the user is explicitly asked there whether it is complete.

**Open Questions output.** Explore returns four sections: (a) findings, (b) sibling symptoms (if any), (c) surface map, (d) **open questions** — branches of the contract / decision tree that code alone cannot resolve. Examples: "Should this endpoint return 404 or 403 when the tenant owns no matching resource?" "Does the write need to be idempotent on a natural key or is PK uniqueness enough?" "Should a failed event publish be retried or logged-and-swallowed?" These feed Step 5.

### Step 4 — Assess blast radius

Before proposing a fix, assess whether this work fits in a single-issue/single-PR flow. **Any of the following structural signals** flips the recommendation to escalate to `/write-a-prd`:

1. **Touches >1 vertical slice** — code changes span more than one feature/slice folder
2. **Requires updating the architecture/concept map** — per the lean doc canon, the map only changes for new slices, removed slices, or new cross-cutting rules. Any of those = not in-slice.
3. **Requires a new ADR** — architectural decisions worth recording belong in a PRD
4. **Requires a DB migration that changes invariants** — new `NOT NULL`, new FK, type change on populated column
5. **Adds a new public API endpoint or breaks an existing contract**
6. **Changes cross-slice orchestration** — an orchestration change that spans slices is cross-slice by definition (check the handlers/registrars of the slices involved; for public-surface changes, the consumer-contract evidence)

File counts and LOC are **not** signals — they rot. Stick to the structural list above.

### Step 5 — Resolve open questions (conditional grill)

If Explore returned a non-empty **Open Questions** list, ask them before proposing. One question per branch, with concrete options derived from Explore's findings (and an implicit "Other" escape hatch).

Skip this step entirely if Explore returned no open questions. Do not invent questions just to ask them — most trivial bugs have a fully-determined fix shape and need no grilling. The trigger is unresolved branches, not bug type.

If the user's answers reveal additional contract decisions, loop once: re-ask Explore (or do a focused read yourself) to confirm the chosen branch is implementable, then proceed. Do not loop more than once — if the contract is still unsettled after one round, that itself is a blast-radius signal: recommend escalation in Step 6.

### Step 6 — Propose

Present to the user, in chat:

1. **Findings**: one or two paragraphs of what Explore found (root cause for bugs, orientation for enhancements)

   **Explain via concrete walkthrough.** For bugs, the root cause must be told as a story of **one real data instance walking through the code's decision points** — actual values from the investigation ("the chicken at 2.49 €/kg hits the unit-price resolver; division needs a quantity, but sold-by-weight rows have none; parsing the per-unit column fails because it's empty — so the gate gives up *before ever comparing 2.49 against the 2.96 threshold*"). Narrate what the code "tries" and exactly where its assumption breaks, then show the same instance's before/after under the proposed fix. The abstract framing (field names, contract tables) comes *after* the worked example, never instead of it. A human signs off on this proposal; an explanation built from column names and method names reads like a stack trace, while a walkthrough of the user's own reported case reads like an answer. (If the investigation queried live data, use those real rows; never invent fake example values.)
2. **Sibling symptoms** (if Explore surfaced any): list them. Ask the user explicitly: *"Bundle these into one issue, file separately, or ignore?"* Default recommendation: bundle if they share a root cause; file separately if they're independent symptoms that just happened to surface during the same trace.
3. **Behavior contract — Current vs Desired**: a two-column table built from the surface map (one row per observable behavior on the affected surface). Left column = current behavior (from Explore). Right column = desired behavior (from the report + grill answers + your inference). The **desired** column is the source of truth — currently-correct behaviors get a desired entry that says "unchanged" so the fix's non-regression envelope is explicit. If a desired entry is unknown after the grill, mark it `?` and ask once more — do not file with `?` rows. This is the artifact the user signs off on; the AC list in Step 8 is derived from the Desired column, not invented separately.

   **Inventory completeness gate.** After presenting the table, ask the user one explicit question before continuing: *"Is this list of behaviors complete, or am I missing any responsibility of this control/feature?"* Do not move to Step 7 until the user confirms completeness or supplies additions. If they add rows, fold them in (re-run a focused Explore trace for any new rows that need code grounding) and re-present. This gate is the last line of defense against shipping a fix that regresses a behavior the agent never knew existed.
4. **Proposed approach**: the shape of the fix/change — modules touched, contracts affected, key invariants. Do NOT include code or line numbers.
5. **Blast-radius assessment**:
   - If **no signals tripped** → "This fits a single-issue/single-PR flow."
   - If **one or more signals tripped** → list them by name and recommend escalation:

     > "This looks bigger than a single-issue ship. Tripped signals: \<list\>. **Recommended:** stop here and run `/write-a-prd` — I'll seed it with the investigation findings so the interview can skip the parts I already covered."

### Step 6.5 — Teach it (non-trivial issues only)

For a **non-trivial** issue — anything where the fix touches a shared contract, a chassis/base-library seam (if the profile declares one), a cross-slice hand-off, a subtle root cause, or a decision resolved in Step 5 — deliver a senior-to-senior **teaching briefing** before the user gate, borrowing `/expand-issue`'s planning depth. The exit bar is not "the user approved the fix"; it's **"the user could review the resulting PR — or maintain this slice — as if they'd written it."** Ground every claim in real code (`file:line`), the legacy-oracle source it ports (if the profile declares one), and the docs Explore read.

Cover, in this order:

- **Lead with a layman rundown (always).** Plain-language headline — *what the surface is · the problem the fix solves · in → out · a one-line analogy* — **plus a plain-language traced example**: follow ONE concrete value (ideally the user's own reported case) through the code's decision points, naming each cross-module hand-off in everyday terms. A layman gets it; a senior peer skims it in 20s.
- **Zoom out — place & purpose.** The surface's job in one sentence; what calls it / what it calls; the invariant or oracle behavior it must honor; its boundaries.
- **Zoom in — how it actually works + where it breaks.** Re-trace that one concrete input → output with `file:line`, land on the exact decision point where the bug's assumption fails (for bugs) or where the change lands (for enhancements), then show the same instance's before/after under the fix.
- **Sharp edges (what makes it reviewable).** Failure modes, chassis interactions, tenancy/concurrency traps, invariants that MUST hold — stated as review heuristics ("if you see X in the PR, that's a bug; the risky file is Y").
- **Change-impact model (what makes it maintainable).** What ripples, safe vs. dangerous edits, what the tests catch vs. miss.

**Skip this step for a trivial, fully-determined fix** (typo, one-line guard, obvious mapping) — don't manufacture a briefing where there's nothing to teach. When in doubt, the same trigger as Step 5's grill applies: unresolved complexity, not bug type. If a briefing is produced, it becomes the walkthrough comment posted in Step 8.5.

### Step 7 — User gate

Wait for the user's decision. Three valid responses:

- **Proceed (light flow)** — go to Step 8
- **Escalate to PRD flow** — go to Step 9
- **Abort** — stop; do not write any artifact

If the user is silent or asks clarifying questions, answer them and re-present the gate. Do not auto-decide.

### Step 8 — Light flow: create the GitHub issue

Pick the template by report shape (final classification after Explore):

#### Bug template

```markdown
## Problem

**Actual behavior:** <what happens now>

**Expected behavior:** <what should happen>

**Reproduction:**
1. <step>
2. <step>
3. <step>

## Root Cause Analysis

<2–5 sentences describing the code path and why it produces the wrong behavior. Describe modules, contracts, and behaviors — NOT file paths or line numbers. The issue must remain useful after refactors.>

## Behavior Contract (Current vs Desired)

| Behavior | Current | Desired |
|---|---|---|
| <surface behavior 1> | <what it does today> | <what it must do after the fix — or "unchanged"> |
| <surface behavior 2> | ... | ... |

The Desired column defines the fix envelope. "Unchanged" entries are the non-regression contract. ACs below derive from the Desired column.

## TDD Fix Plan

1. **RED**: <test that captures the broken behavior>
   **GREEN**: <minimal change to make it pass>
2. **RED**: <next test>
   **GREEN**: <change>
...

**REFACTOR**: <cleanup, if any>

## Acceptance Criteria

- [ ] <criterion 1>
- [ ] <criterion 2>
- [ ] All new tests pass
- [ ] Existing tests still pass
- [ ] Documentation updated where affected
```

#### Enhancement template

```markdown
## Motivation

<2–4 sentences: what engineering/product pain or gap drives this? Reference relevant ADRs if applicable.>

## Scope

**In scope:**
- <item>
- <item>

**Out of scope:**
- <item>

## Design Note

<2–5 sentences on the shape of the change — which modules, which contracts, which invariants. No file paths or code. Reference relevant ADRs.>

## Behavior Contract (Current vs Desired)

| Behavior | Current | Desired |
|---|---|---|
| <surface behavior 1> | <what it does today> | <what it must do after the change — or "unchanged"> |
| <surface behavior 2> | ... | ... |

The Desired column defines the change envelope. "Unchanged" entries are the non-regression contract. ACs below derive from the Desired column.

## TDD Plan

1. **RED**: <test that expresses one AC>
   **GREEN**: <minimal change to make it pass>
2. **RED**: <next>
   **GREEN**: <change>
...

## Acceptance Criteria

- [ ] <criterion 1>
- [ ] <criterion 2>
- [ ] All new tests pass
- [ ] Existing tests still pass
- [ ] Documentation updated where affected
```

Create the issue (respect the profile's auth constraints, if it declares any):

```bash
gh issue create \
  --title "<short imperative title>" \
  --label <bug|enhancement> \
  --body-file <scratch-path>
```

Title style: imperative, lowercase except proper nouns, no trailing period. Examples: `Fix duplicate rows on concurrent upsert`, `Add tenant-scoped pagination to the session list`.

Print the issue URL.

### Step 8.5 — Post the teaching briefing as a walkthrough comment (only if Step 6.5 produced one)

If Step 6.5 produced a briefing (non-trivial issue), persist the **final, agreed** version — fold in any Step 5 decisions, drop the open-question framing — as a **separate issue comment** so `/ship-issue`'s coder reads it before implementing instead of re-deriving the slice's purpose. It is a point-in-time planning artifact living on the work item — per the lean doc canon, no standing repo doc is grown from it.

- **Reuse the existing marker** — the first line MUST be exactly `<!-- expand-issue:walkthrough -->`. Both `/execute-issue` and `/afk-execute-issue` (the coder `/ship-issue` dispatches) key on that literal string to find the briefing. Do **not** invent a new `log-issue:` marker — nothing reads it.
- Lead accessible (layman rundown + traced example), then descend into the `file:line` walkthrough, sharp edges as review heuristics, and change-impact model — same cadence as Step 6.5.
- Post it: `gh issue comment <n> --repo <owner/repo> --body-file <scratch>`.

Skip this step for trivial issues where Step 6.5 was skipped.

Then tell the user:

> Logged issue #\<n\>. Run `/ship-issue <n>` to autonomously implement, review, and merge.

### Step 9 — Escalation: write PRD seed

Derive a slug from the proposed title: lowercase, non-alphanum → `-`, collapse, trim, cap 40.

Write `specs/seed-<slug>.md`:

```markdown
---
type: prd-seed
created: <ISO 8601 timestamp>
source: /log-issue
triggered_signals:
  - <signal-name>
  - <signal-name>
---

# Seed: <one-line summary>

## Original report

<user's verbatim description from Step 1>

## Investigation findings

<Explore output, fully captured. Code paths traced, slices touched, root cause if bug, current behavior if enhancement. This is the expensive part — preserve it verbatim.>

## Behavior Contract (Current vs Desired)

| Behavior | Current | Desired |
|---|---|---|
| <surface behavior 1> | <what it does today> | <what it must do — or "unchanged" / "?"> |
| <surface behavior 2> | ... | ... |

Carry over the table presented to the user in Step 6. Rows still marked `?` are open contract questions for the PRD interview to resolve.

## Why this escalated

- **<signal-name>**: <one-sentence justification>
- **<signal-name>**: <one-sentence justification>

## Proposed approach (high-level)

<2–4 sentences on the shape of the work — not a full design, just the direction.>

## Open questions for the PRD

- <question Explore couldn't resolve>
- <question requiring user input>
- <question about scope boundary>
```

Print the seed path and tell the user:

> Wrote `specs/seed-<slug>.md`. Run `/write-a-prd` — it will detect this seed and skip the interview questions already covered.

Stop. Do not chain to `/write-a-prd` automatically — the user invokes it explicitly. This preserves the user-gated ceremony transition.

## Critical Rules

1. **Never create a GitHub issue without the user gate.** The HITL gate sits between Propose (Step 6) and Create (Step 8).
2. **Never auto-escalate.** Blast-radius signals trigger a *recommendation*, not an action. The user picks light or PRD flow.
3. **Never chain to `/write-a-prd` automatically.** Write the seed and stop. Ceremony transitions are user-gated.
4. **Use the existing classification labels** (`bug`, `enhancement`) when creating GH issues. If a label is missing, create it: `gh label create bug --color d73a4a` or `gh label create enhancement --color a2eeef`.
5. **Issue body must describe behaviors and contracts**, not file paths or line numbers. The issue should survive a major refactor.
6. **Never invent Acceptance Criteria the user didn't agree to.** If you proposed an AC and the user pushed back, drop it.
7. **Seed files are ephemeral.** They live in `specs/seed-*.md`. `/write-a-prd` deletes them after consumption.
8. **One issue per invocation.** If the user describes two unrelated problems, ask which to log first; suggest they re-invoke for the second.
9. **Explore is mandatory.** Do not skip it even if the user describes a "trivial" fix — the blast-radius assessment depends on it.
10. **Verify cross-module claims.** Any claim in the RCA about behavior of code Explore did not modify (e.g. "the chassis already wraps this in a transaction", "the middleware already enforces tenant scoping here") must cite the file/symbol Explore actually inspected to confirm it. Unverified cross-module assumptions are forbidden — they are the failure mode that produced multi-pass bug cascades (fix one side, ship, other side breaks).
11. **State-shaped bugs require full pipeline trace.** For persisted/event-state bugs, Explore must trace encoder + decoder + consumer (writer → reader → downstream actor), not just the symptomatic side. See Step 3.
12. **Surface sibling symptoms, never silently drop them.** If Explore noticed broken behavior the user didn't report on the same pipeline, it goes in the Step 6 presentation. The user decides bundle/split/ignore.
13. **Behavior contract before AC.** Every issue body has a Current vs Desired table covering the full surface map (not just the broken row). ACs are derived from the Desired column — never invented independently. Adjacent surface behaviors that must stay unchanged get an explicit "unchanged" Desired entry so the non-regression envelope is part of the contract.
14. **Surface inventory is agent-first, user-verified.** Explore enumerates the affected surface aggressively along the axes listed in Step 3 (response shape, persistence side effects, downstream effects, error/boundary states, concurrency, tenancy) — including behaviors that "obviously aren't affected". Step 6 then presents that list to the user with an explicit completeness gate: *"Am I missing any responsibility of this endpoint/feature?"* The user is the final authority, but reacts to a prompted list rather than recalling from cold. The order is load-bearing: cold-recall surface inventories miss the most important behaviors; recognition against a thorough enumeration does not. A thin agent enumeration defeats the gate, so Step 3 demands the list be exhaustive even when that feels redundant.
15. **Teach non-trivial issues before the gate; persist the briefing with the consumed marker.** Any issue whose fix touches a shared contract, a chassis seam, a cross-slice hand-off, a subtle root cause, or a Step-5 decision gets a Step 6.5 teaching briefing (layman rundown + traced example + sharp edges + change-impact), and Step 8.5 posts it as a walkthrough comment whose first line is exactly `<!-- expand-issue:walkthrough -->` — the literal marker `/execute-issue` and `/afk-execute-issue` key on to find the briefing. Never invent a new marker; never post a walkthrough that nothing consumes. Skip both steps for trivial, fully-determined fixes.

## Edge Cases

- **User describes a problem with no clear bug or enhancement framing** → run Explore anyway; classification falls out of findings
- **Explore reveals the reported "bug" is actually working as designed** → present that finding in Step 5; user may abort or reframe as an enhancement
- **Explore can't find the code path** → present findings honestly ("could not locate"); ask the user for additional context before proposing
- **Multiple signals trip but user wants to proceed with light flow anyway** → respect the override; create the GH issue; note in the issue body under a `## Note` section that signals were tripped and overridden, so `/ship-issue` can use that context
- **User asks "what's the difference between this and `/write-a-prd`?"** → light flow = one issue, one PR, autonomous merge via `/ship-issue`. PRD flow = multi-issue feature with `/ship-feature` orchestration. Ceremony scales with blast radius.
- **A `specs/seed-*.md` already exists for similar work** → flag it to the user; ask whether to merge into the existing seed or write a new one
