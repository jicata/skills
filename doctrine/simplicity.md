# Simplicity — complexity is declared, not discovered

**Priority:** High — on-trigger. Read by the planning skills when a design is drafted (`write-a-prd` Step 4, `expand-issue` Step 2) and by the review skills on every PR. It maps to no single path; a repo that wants it ambient on every implementation path adds a `paths:` rule over its source globs, as the donor did.

**Axis:** none — axis-independent. See [`AXES.md`](./AXES.md).

(Extracted 2026-10 from the donor's standing simplicity rule. It builds on `karpathy-guidelines` §2 *Simplicity First*, which governs the code you write — minimum code, nothing speculative — and does not restate it. This file adds the two things that section leaves open: **what "simple" is measured against**, and **when complexity has to be named**.)

## Simple means the repo's existing patterns

Simplicity is judged at the level of the whole app, not the diff. **Following the repo's established patterns, units and abstractions is the simple path**, because the reader already knows them — even where a locally cleverer design would be fewer lines. A new pattern, layer, mechanism, dependency or generality is where complexity enters, however small it looks in isolation.

## The rules

1. **Plan from the simplest design first.** Before proposing an approach, write down the plainest version that fits the existing patterns and meets the required outcomes. That is the default candidate; everything else earns its place against it.
2. **Complexity is declared at planning time, by name.** If the simple design cannot deliver a required outcome, the plan says so before anything is built — three things, a line each: what the simple design is, which required outcome it cannot meet, and exactly what is added because of it.
3. **Undeclared complexity is a defect, even when it works.** Complexity that arrives in the code without having been declared in the plan was never open to challenge before it was built. Working is not the bar; having been chosen in the open is.

**The test:** would a senior engineer who knows this repo call this overcomplicated?

## What has to be declared

- A **layer, abstraction or indirection** the repo does not already have.
- A **mechanism**: a flag or setting, a fallback chain, a retry or caching layer, a queue, a background job.
- A **dependency**.
- **Generality beyond the stated outcomes**: configurability, an extension point, an interface with one implementation and no second on the way.

Not complexity: following an existing pattern, even a verbose one; code a required outcome genuinely needs.

> **Donor scars — complexity the donor declined, each recorded with its reason:** a model-provider abstraction and fallback chain were deleted wholesale, and a standing rule forbids reintroducing either "for safety" — their removal was the point. A drift tolerance stayed a constant rather than becoming a query parameter, so "cleared at 0.04, now 0.19" means the same thing every time it is read. A "cleared" state became a ranking demotion instead of an include/exclude flag, so a resurfaced row can never hide behind a toggle nobody remembers is off. The rule itself was written because agents kept defaulting to new layers, mechanisms and generality nobody had asked for, and none of it had been declared where it could be challenged.

## Where it bites

- **Planning.** The plan carries a **Simplest design** line and a **Declared complexity** list — `none` is an answer, and the usual one. `write-a-prd` records them with the module sketch; `expand-issue` records them in the agreed plan it persists to the issue, which is what the reviewer later reads.
- **Review.** Complexity in the diff that the linked issue's plan or PRD did not declare is a 🟡 `[simplicity.md]` finding: name what was added, and suggest either removing it or declaring it on the issue with the outcome it serves. Complexity the PRD's *Out of Scope* excluded is already 🔴 under Axis A; this check does not double-count it.
