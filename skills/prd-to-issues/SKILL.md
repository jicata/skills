---
name: prd-to-issues
description: Break a PRD into independently-grabbable GitHub issues using tracer-bullet vertical slices. Use when user wants to convert a PRD to issues, create implementation tickets, or break down a PRD into work items.
---

# PRD to Issues

Break a PRD into independently-grabbable GitHub issues using vertical slices (tracer bullets).

Repo facts this skill keys off (external consumers, local stand-in, live-data safety constraints, stack) live in the profile: `.claude/doctrine/project-profile.md`.

## Process

### 1. Locate the PRD

Ask the user for the PRD GitHub issue number (or URL).

If the PRD is not already in your context window, fetch it with `gh issue view <number>` (with comments).

### 2. Explore the documentation first, the codebase second (optional)

If you have not already explored the codebase, do so to understand the current state of the code — docs-first: the lean canon (glossary, architecture/concept map, ADRs) before the code.

Look for opportunities to **prefactor** the code to make the implementation easier — "make the change easy, then make the easy change." Any prefactoring becomes the first slice(s), blocking the slices it eases.

### 2.5. Check the PRD's Consumer Reality Check

If any slice will create or change a consumer-facing contract (route, verb, request/response shape, required field, resource decomposition), confirm the PRD carries a populated `## Consumer Reality Check` section.

**If it is missing or empty, stop and fill it before slicing** — read the repo's consumer-contract doctrine (if the profile points at one) and probe the consumer declared in the profile's External contracts section. Slicing an unverified contract multiplies the error across every child issue — the donor stack's PRDs #343/#417 froze mid-flight exactly this way. Carry the relevant citations onto each child issue that touches the surface, so the coder inherits the evidence rather than re-deriving it — or guessing.

### 3. Draft vertical slices

Break the PRD into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
- Any prefactoring slices come first
</vertical-slice-rules>

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change — rename a shared DTO field or route prefix, retype a shared symbol — whose **blast radius** fans across the codebase, so a single edit breaks every call site at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand–contract**:

1. **Expand** — one slice adds the new form *beside* the old (both accepted, both serialized, tests pin both). Lands green.
2. **Migrate** — call sites move over in batches sized by blast radius (per slice folder, per surface), each batch its own child issue `Blocked by` the expand slice. Each lands green because the old form still exists. Independent batches carry no edges between them, so `/ship-feature --parallel` can run them concurrently.
3. **Contract** — one final slice deletes the old form once no caller remains, `Blocked by` every migrate batch.

When even the batches can't stay green alone, keep the same sequence and let the **PRD base branch** play its natural role as the shared integration branch: green is promised only at a final integrate-and-verify child that blocks on all of them — never at `master`.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories from the PRD this addresses

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 4.5. Author each slice's QA Charter from the PRD's QA Considerations

Read the parent PRD's `## QA Considerations (feature-level)` section. For each slice with an API-reachable surface, author its `## QA Charter` (the block in the issue template below):

- **Preconditions** — attach the shared preconditions whose owning slice/module (per the PRD's **QA routing**) matches this slice; add any slice-specific precondition its surface needs. Carry over each one's *find* / *establish* / *side-effecting* fields verbatim — do not silently flip the side-effecting flag. Establish methods use the repo's local stand-in (per the profile's Persistence section); respect the profile's live-data safety constraints (e.g., a read-only live DB).
- **Exploration seeds** — the risk areas / adversarial themes from the PRD that land on this slice's surface, plus the slice's own boundary/negative API probes.
- **Blast-radius routes** — the immediate neighbourhood this slice could regress (other slices that share its routes/state).

Slices with no API-reachable surface get `**QA Charter:** n/a — <reason>`. If the PRD has no `## QA Considerations` section (older PRD), derive a minimal charter per slice from its acceptance criteria + surface, and note the PRD predates the QA charter.

### 5. Create the GitHub issues

For each approved slice, create a GitHub issue using `gh issue create`. Use the issue body template below.

Create issues in dependency order (blockers first) so you can reference real issue numbers in the "Blocked by" field.

**Label every child with its parent PRD.** Child issues otherwise lose their visible link to the parent once the PRD's inline slice table drifts. Before creating the issues, ensure a `prd-<prd-issue-number>` label exists (idempotent create), then apply it to every child as you create it:

```bash
gh label create "prd-<N>" --color 5319e7 --description "Child of PRD #<N>" --force   # idempotent; --force updates if it exists
gh issue create ... --label "prd-<N>"
```

The label is the durable crosswalk — `label:prd-<N>` lists the whole set regardless of title/table drift. Do **not** put it on the parent PRD itself (the PRD is not its own child). Treat the label as **temporary scaffolding**: it is deleted when the PRD is fully merged to master. Both flows do this at finalize — `/ship-feature` (autonomous) in its `FINALIZE_PRD` wrap-up, and `/execute-issue` (manual) when the run finds every child already merged and finalizes behind its confirmation gate. If you land the PRD→master PR some other way, delete it by hand with `gh label delete "prd-<N>"`.

<issue-template>

## Parent PRD

(#[<prd-issue-number>](https://github.com/owner/repo/issues/<prd-issue-number>))

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation. Reference specific sections of the parent PRD rather than duplicating content. Avoid file paths and code snippets — they go stale fast. Exception: a snippet that encodes a decision more precisely than prose can (state machine, schema, type shape — e.g. from a prototype/spike), trimmed to the decision-rich parts.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- Blocked by #<issue-number> (if any)

Or "None - can start immediately" if no blockers.

## User stories addressed

Reference by number from the parent PRD:

- User story 3
- User story 7

## QA Charter

<For slices with an API-reachable surface, author the per-slice charter derived from the PRD's `## QA Considerations` and this slice's surface. NOT a re-statement of the acceptance criteria. For no-surface slices write `**QA Charter:** n/a — <reason>`.>

**Surface under test:** <route(s) this slice delivers>

**Preconditions:**
- `<name>` — *find:* <how to detect a qualifying row in the local stand-in> · *establish:* <API call preferred | seed / stand-in mutation fallback; respect the profile's live-data safety constraints> · *side-effecting:* <yes → human handover | no → auto-establish + teardown>

**Exploration seeds:**
- <probe, e.g. "POST with missing required field"> → expected: <handling, or "unspecified — report for triage">

**Blast-radius routes to smoke (neighbourhood only):**
- <route> — <what must still work>

## FE work

**FE work:** <yes/no — per the repo's stack (profile)>

</issue-template>

Do NOT close or modify the parent PRD issue.

### 6. Wrap up

After all issues are created, print the execution order derived from the `Blocked by` DAG (blockers before dependents), then tell the user:

> All child issues created. Execution order: #A → #B/#C → #D.
> Next: `/expand-issue <first child>` to plan the first slice, then hand it to the coder (`/execute-issue <prd-n>` or `/ship-feature <prd-n>`). While the coder builds, keep running ahead — `/expand-issue` the remaining children in execution order so each slice is already planned when the coder reaches it.
