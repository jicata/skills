<!-- TEMPLATE — instantiated by /setup ONLY when interview Q1 surfaces a chassis: base,
     chassis-like libraries this app is built upon whose source must be read for a complete
     picture of runtime behavior. Materialize as `.claude/rules/chassis-foundation.md`
     (always-on — it guards every backend-reasoning turn). Fill every <FILL: …> slot from the
     interview + a read of the actual chassis source; KEEP the two donor failure stories — they
     are the why; delete this comment. -->

# 🏛️ <FILL: chassis name> Foundation — this app is NOT self-contained

**Priority:** High

<FILL: repo name> is a thin application built on top of <FILL: N> **base library projects** that own a large amount of runtime behavior — <FILL: the concerns the chassis owns, e.g. request pipeline, transactions, persistence wiring, tenancy, identity, auth, error handling>. **You cannot reason correctly about how this service behaves at runtime by reading the app repo alone.** Before asserting anything in the trigger areas below, you MUST consult the chassis source. If you find yourself about to assert what a caller *can reach*, or to build a guard the chassis may already provide — stop and go read the chassis first.

## Why this pattern exists (two donor incidents — keep these, they are the why)

These happened in the donor repo (the donor stack, on the `Core.Api.Chassis` libraries). The names are donor-specific; the failure shape is not — it will reproduce in any chassis-built app whose agents read only the app repo.

**Failure 1 — transactions (2026-06).** An agent analyzing the persistence layer concluded *"there are no transactions at all in this project — each `SaveChanges` is its own transaction, so we should build a `IUnitOfWork` abstraction and open transactions in the handlers."* **All of that was wrong.** The chassis already wraps every mutating request in a unit-of-work transaction (`EfCoreTransactionManagementMiddleware`) and already translates Spanner's optimistic-concurrency abort into `ConcurrentModificationException`. The proposed work was largely redundant. The mistake was reasoning about runtime behavior from the app repo alone, treating the chassis as a passthrough. It was caught only because a human said "go read the chassis." (See ADR 001 Implementation Plan + its correction note — donor repo, `docs/adr/001-vsa-handler-per-operation.md`.)

**Failure 2 — tenancy (2026-07). The same mistake, in a worse place, and it got *further*.** A "cross-tenant write injection" was asserted in the LoanCoding slice: *"a caller authenticated as tenant A can POST to `/{tenantB}/loan-coding/concept-maps` and persist a row owned by tenant B."* It was **false**. The chassis's `TenantResolutionService` throws `TenantMismatchException` → **403** whenever the token's institution ≠ the route's — on every route — **before the controller is ever entered**.

What makes this the more instructive failure:
- The claim was **inherited, not invented** — it came from an ADR correction note that had itself reasoned from the app repo alone. Bad chassis reasoning **propagates through your own docs** and acquires authority.
- It survived a **large parallel agent fan-out *and* an adversarial verification pass** — because every agent read the same app-side sources. Redundancy does not help when the whole population shares the blind spot. **Only reading the chassis breaks the tie.**
- It produced *both* error directions at once: a **bogus security issue** (work invented that wasn't needed) and, elsewhere, **four dead `catch` blocks + an ADR** defending against a condition the chassis makes impossible (work already done for us, done again badly).
- It was caught only because a human said, in effect, *"tenant resolution is the chassis's job — why are we checking this?"* **Exactly like Failure 1.** That is twice.

## Where the base projects live

<!-- One row per chassis library. Confirm paths per machine; if the chassis is consumed as a
     built package, locate the matching source before reasoning about its internals. -->

| Project | Path | What it is |
|---|---|---|
| <FILL: lib name> | <FILL: local source path> | <FILL: one-line scope> |
| <FILL: …> | <FILL: …> | <FILL: …> |

The app opts in via <FILL: the entry-point calls in the app, e.g. the `AddX(...)` / `UseX(...)` lines in Program.cs/startup>. Those calls pull in **most of the behavior below** — none of which is visible in the app repo.

## What the chassis owns (do NOT assume the app owns these)

<!-- Per concern the chassis owns: the concrete type/middleware that implements it, what it
     guarantees, and any deliberate app-side deviation from the chassis's intended pattern.
     Write this FROM the chassis source, not from the app or from memory. Donor's list covered:
     transaction middleware (which verbs are/aren't wrapped), DI entry points, repository
     bases, error-handling middleware (exception → HTTP status table, and the default for
     unmapped app-local exceptions), tenancy middleware, identity/request-context accessor,
     the chassis's own exception types, auth config, caching, observability, feature flags. -->

<FILL: the owned-behavior inventory, grouped by chassis library>

## The trigger — when you MUST read the chassis first

Before stating or designing anything in these areas, open the chassis source and verify — do not infer from the app:

<!-- One numbered trigger per owned concern: the reasoning topic → the exact chassis file(s)
     to read. Donor triggers: transactions/SaveChanges/concurrency; a DI registration whose
     service you can't find in the app; exception → HTTP status; request lifecycle/middleware
     order; tenancy/identity/auth ("can a caller reach another tenant's data?"); which
     exception type an error actually is; DbContext lifetime/migrations/seeding. -->

1. <FILL: topic> → read <FILL: chassis file(s)>.
2. <FILL: …>

If the chassis source is not available on the machine, **say so and flag the uncertainty explicitly** — do not fill the gap with assumptions about the app being self-contained.

## Division of labour — what stays the app's job

<!-- The chassis guarantees things; guarantees breed complacency in the opposite direction.
     For each guarantee, name the residue that is genuinely OURS to guard — especially the
     holes that produce no compile error and no failing test. Donor: the chassis proves WHO
     the caller is (403s route/token tenant mismatch before any handler); the app's only job
     is that the queries and mutations IT writes stay inside the resolved tenant — and the one
     real hole is a new entity that skips the tenant-marker interface, silently getting no
     query filter and no ownership stamp. -->

- The chassis guarantees: <FILL>. Ours to guard: <FILL>.
- Silent hole to watch: <FILL: the opt-in the chassis can't enforce>.

## Reviewer red flags

- Any claim about runtime behavior in the trigger areas above made **without** a chassis source citation.
- "There are no transactions / no global error handling / no X here" asserted from the app repo alone.
- App code reinventing something the chassis already provides (<FILL: the donor's were a unit-of-work, a tenant resolver, a paging helper, a distributed lock — list yours>).
- A design/ADR that proposes building infrastructure the chassis supplies.
- <FILL: the inverse flag — the silent opt-in hole from Division of labour, e.g. a new entity missing the tenant-marker interface>.

## Where this rule fits in the skill stack

Always-on (auto-loaded every session). Also bundle it into the backend coder/reviewer lenses (<FILL: the repo's composite lens, per project-profile>) so subagents inherit it — a subagent that never saw this file is exactly the population that produced Failure 2.
