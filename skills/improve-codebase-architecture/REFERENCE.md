# Reference

## Deepen vs. Split — the decision

Before any change, decide which lens applies (SKILL.md "Two orthogonal lenses"). They are not interchangeable:

- **One concept, many shallow files** (donor example: a window-derivation idea split into a deriver + a result + a helper + a test-only seam) → **deepen**: collapse behind a smaller interface, test at the boundary.
- **One folder, many concepts** (donor example: a slice root holding a generation pipeline + catalog readers + dedup + pure calculators) → **split**: sub-folder into operation / sub-domain / shared clusters per the repo's structure doctrine.

If a single "deepening" would pull files from two different operations, two different sub-domains, or merge a domain primitive with its HTTP client — **stop. That's the split lens, inverted.** Resist it.

## Dependency categories

When assessing a candidate, classify its dependencies — this drives how the changed module is tested. The generic categories (in-process / owned datastore / internal call / true external) live in `/codebase-design`'s [DEEPENING.md](../codebase-design/DEEPENING.md). A repo may declare a stack-specific re-cut of these categories (test harnesses, emulators, boundary-mocking rules) in its profile (`.claude/doctrine/project-profile.md`) or its own doctrine files — use that re-cut when it exists.

## Testing strategy

Principle: **describe behaviour at the boundary; don't lock tests to internals.**

- A behaviour-preserving **split/move** changes *no* test behaviour — the same tests pass against the relocated code. If a move breaks a test, the test was asserting on file location or internal wiring; note it, but the move itself is the fix.
- A **deepening** replaces several shallow-module unit tests with fewer boundary tests. **Do not auto-delete the old tests.** List them in the seed (Step 6) as "redundant after this change — remove on approval." Deletion of a test is always a reviewed human decision, never a side effect of a refactor.
- New boundary tests assert observable outcomes through the public interface, so they survive future internal refactors.

## Seed templates (Step 6 output)

The skill emits a **seed that feeds the existing pipeline**, not a free-form RFC. Pick by size.

### Small / single-PR → issue-authoring seed

```markdown
## Problem (root cause, not just the smell)
[What drifted, and WHY — the mechanism from Step 2: incremental drift, a rule gap,
an autonomous-flow path of least resistance. Cite the rule/ADR yardstick.]

## Proposed change
[Structural: the target folder tree + move-and-renamespace list, behaviour-preserving.
 Depth: the chosen interface — signature, what it hides, how callers migrate.]

## TDD plan
[Red → green steps. For a move: assert behaviour is unchanged.
 For a deepen: the new boundary tests to write.]

## Tests to remove on approval
[Shallow-module tests made redundant — listed, NOT deleted here.]

## Acceptance criteria
- [ ] [observable, checkable — the shape the repo's review skill grades requirements against]
```

### Large / multi-slice → spec-authoring seed

Hand off the problem statement, the root cause, the target architecture, and the slice-by-slice decomposition to the repo's spec-authoring skill; let it run the interview and produce the spec. Do not pre-bake one here.

### Guardrail hardening → direct rule/skill edits

When Step 5 found a missing guardrail, the fix is an edit to `.claude/rules/*` or `.claude/skills/*` (a new anti-pattern entry, a census step in the review skills, a sweep here). Show the diff, get a yes, edit directly — these are internal governance files and do **not** go through the GitHub issue pipeline. Consider whether the change is also ADR-worthy per the repo's ADR gate (hard to reverse + surprising + a real trade-off).
