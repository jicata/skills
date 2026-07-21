---
name: write-a-prd
description: Create a PRD through user interview, codebase exploration, and module design, then submit as a GitHub issue. Use when user wants to write a PRD, create a product requirements document, or plan a new feature.
---

This skill will be invoked when the user wants to create a PRD. You may skip steps if you don't consider them necessary, but still confirm your understanding with the user before continuing.

Repo facts this skill keys off (external consumers/oracle, local stand-in, live-data safety constraints, stack) live in the profile: `.claude/doctrine/project-profile.md`.

### Step 0 — Check for a PRD seed (from `/log-issue` escalation)

Before asking the user anything, check for an existing seed file written by `/log-issue` when an investigation revealed the work was too big for a single-issue flow:

```bash
ls specs/seed-*.md 2>/dev/null
```

For each seed file, read the frontmatter and confirm `type: prd-seed`.

- **Exactly one seed exists** → present its summary to the user and ask: *"Found `specs/seed-<slug>.md` from `/log-issue` (created \<date\>, triggered by: \<signals\>). Use it as the starting point for this PRD? [Y/n]"*
- **Multiple seeds exist** → list them with creation dates and triggered signals; ask the user which to consume (or "none")
- **No seed exists, or user declines** → proceed to Step 1 cold

If the user consumes a seed:
- The seed's **Original report**, **Investigation findings**, and **Why this escalated** sections become input context for Step 2 (codebase exploration) — you've already done much of this work, so verify rather than re-explore from scratch
- The seed's **Proposed approach (high-level)** becomes the starting point for Step 4 (module sketch) — refine it, don't re-derive it
- The seed's **Open questions for the PRD** section becomes the **interview agenda** for Step 3 — these are the questions Explore couldn't answer alone
- After the PRD GitHub issue is created successfully in Step 5, **delete the seed file**:
  ```bash
  git rm specs/seed-<slug>.md
  ```
  Seed files are ephemeral point-in-time planning artifacts — they retire on consumption, just like plan files retire on ship.

1. Ask the user for a long, detailed description of the problem they want to solve and any potential ideas for solutions.

   (If a seed was consumed in Step 0, you already have this in the seed's "Original report" section — confirm with the user that the original framing still holds and skip ahead.)

2. Explore the repo to verify their assertions and understand the current state of the codebase (docs-first: the lean canon — glossary, architecture/concept map, ADRs — before the code).

2.5. **Consumer reality check — before proposing any shape.** If this PRD creates or changes anything a consumer calls (a route, verb, request/response shape, required field, status contract, or a resource decomposition — fat payload vs. sub-resources), and the profile's External contracts section declares a consumer or legacy oracle whose truth lives elsewhere, **read the repo's consumer-contract doctrine now** (if the profile points at one) and probe that consumer's repo *before* sketching modules in step 4.

   Pin each claim to a **route constant + verb**, never a folder/component name — names collide across the seam. Capture what exists today, what the consumer *validates*, and what its screens submit. Record the evidence tier (1 = consumer code, 2 = runtime capture, 3 = design artifact transcribed with source + date). **"No consumer client exists yet" is a valid result** — record it with the negative evidence, don't leave it blank.

   The findings become the `## Consumer Reality Check` section of the PRD body. This is a **gate**: do not propose a contract shape in step 3 or 4 until it is filled, and say so plainly if the check is skipped because no consumer surface is involved.

3. Interview the user relentlessly about every aspect of this plan until you reach a shared understanding. Walk down each branch of the design tree, resolving dependencies between decisions one-by-one.

4. ALWAYS sketch out the major modules you will need to build or modify to complete the implementation. Actively look for opportunities to extract deep modules that can be tested in isolation.

A deep module (as opposed to a shallow module) is one which encapsulates a lot of functionality in a simple, testable interface which rarely changes.

Check with the user that these modules match their expectations. Check with the user which modules they want tests written for.

4.5. **Confirm FE scope.** State whether this PRD includes frontend work, per the repo's stack (profile). Write the answer in the PRD body's `## FE work` section — `**FE work:** no — <reason, e.g. backend-only service>` or a description of the FE surface involved.

5. Once you have a complete understanding of the problem and solution, use the template below to write the PRD. The PRD should be submitted as a GitHub issue. Prefix the issue title with "PRD:".

<prd-template>

## Problem Statement

The problem that the user is facing, from the user's perspective.

## Solution

The solution to the problem, from the user's perspective.

## User Stories

A LONG, numbered list of user stories. Each user story should be in the format of:

1. As an <actor>, I want a <feature>, so that <benefit>

<user-story-example>
1. As a mobile bank customer, I want to see balance on my accounts, so that I can make better informed decisions about my spending
</user-story-example>

This list of user stories should be extremely extensive and cover all aspects of the feature.

## Consumer Reality Check

**Required whenever this PRD touches a consumer-facing contract.** What the consumer (per the profile's External contracts) does *today*, established before any shape was proposed. Omit only if no cross-system surface is involved — and then say so in one line rather than deleting the heading.

- **Surface(s) probed** — the route constant + HTTP verb for each resource, cited `file:line` from the consumer repo. Never identify a resource by folder/component/class name; names collide across the seam.
- **What exists today** — the client calls present, the DTO properties serialized, the validators enforced, what the consumer's screen actually submits. **"No consumer client exists yet" is a valid and load-bearing result** — state it with the negative evidence (the greps that returned nothing, the disabled inputs).
- **Evidence tier** — 1 (consumer code on the wire) / 2 (runtime capture from a running build) / 3 (design artifact). For tier 3, **transcribe** the implied shape here with source + date; do not merely link — links rot silently and leave nothing to diff against later.
- **Divergences** — where the proposed contract departs from what the consumer does today, and whether that requires coordinated work on the consumer side.

## Implementation Decisions

A list of implementation decisions that were made. This can include:

- The modules that will be built/modified
- The interfaces of those modules that will be modified
- Technical clarifications from the developer
- Architectural decisions
- Schema changes
- API contracts
- Specific interactions

Do NOT include specific file paths or code snippets. They may end up being outdated very quickly.

## Testing Decisions

A list of testing decisions that were made. Include:

- A description of what makes a good test (only test external behavior, not implementation details)
- Which modules will be tested
- Prior art for the tests (i.e. similar types of tests in the codebase)

## QA Considerations (feature-level)

The cross-cutting inputs `/prd-to-issues` needs to author a per-slice `## QA Charter` on each child issue. Feature-level here, distributed per-slice there. NOT a re-statement of acceptance tests; it's *where the QA pass should poke and what state it needs*. Capture:

- **Shared preconditions** — state in the repo's local stand-in (per the profile's Persistence section) that multiple slices will need before their API surfaces can be exercised (e.g., donor: "a session row with status=Completed for institution X", "a prompt-template row seeded by the migration lane"). For each, note how to detect it (*find* — query the local stand-in), how to create it (*establish* — API call preferred; seed / stand-in mutation fallback; respect the profile's live-data safety constraints), and whether it's **side-effecting** (external API / event publish / async job → the QA pass hands setup to a human; pure local-stand-in state → it auto-establishes + tears down). Mark these honestly — the flag decides that behavior in whatever QA runner the repo uses.
- **Risk areas / adversarial themes** — cross-feature interactions, tenant-scoping edge cases, concurrency/optimistic-lock paths, and "feels broken but passes" zones worth probing across this feature.
- **QA routing** — one line per slice/module noting any precondition or risk area it owns, so `/prd-to-issues` can attach the right charter to the right child issue. Omit only if the whole PRD has no API-reachable surface.

## FE work

**FE work:** <yes/no — per the repo's stack (profile)>

## Out of Scope

A description of the things that are out of scope for this PRD.

## Further Notes

Any further notes about the feature.

## Documentation impact

The canon artifacts (glossary terms, ADRs, architecture/concept-map rows) that the implementation of this PRD will obligate, per the lean doc canon.

</prd-template>

After the PRD issue is created, tell the user the next step is decomposition.

> PRD filed as #\<prd-n\>. Next: run `/prd-to-issues <prd-n>` to break it into child issues, then `/ship-feature <prd-n>` to implement.
