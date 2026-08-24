# Onion Architecture Guidelines

**Priority:** High
**Instruction:** You MUST follow these Onion Architecture guidelines when designing, generating, or refactoring code in a repo whose profile records `architecture: onion`.

**Axis:** backend architecture. **Owns:** placement — which ring a file lives in, which direction dependencies may point, where an abstraction is declared. **Defers to the repo's backend language core for:** naming case, type declaration syntax, file extensions, error handling mechanics, test framework. See [`AXES.md`](./AXES.md).

## Core concept

Concentric rings around a **domain model at the centre**, with all coupling pointing inward. Onion's specific claim, and the reason to pick it over a layered stack: **the domain model has no outward dependencies at all**, so infrastructure becomes a detail attached at the edge rather than a foundation the domain is built on.

> **The Dependency Rule: all couplings point toward the centre.** An outer ring may know an inner ring. An inner ring may never know an outer one.

## The rings

From the centre out:

| Ring | Holds | May depend on |
| --- | --- | --- |
| **Domain Model** | Entities, value objects, domain events, invariants | nothing |
| **Domain Services** | Domain behaviour that belongs to no single entity — policies, calculators, cross-entity rules. **Stateless.** | Domain Model |
| **Application Services** | Orchestration and workflow: transactions, coordination, calling out through interfaces. Declares the **interfaces** the outer ring implements | Domain Services + Domain Model |
| **Infrastructure / UI / Tests** | ORM, repositories, HTTP clients, controllers, the composition root, the test suites | everything inward |

The outermost ring is deliberately a *single* ring holding infrastructure, UI, and tests together. That is not sloppiness — it is Onion's point that all three are equally peripheral to the domain, and none of them may be depended upon by anything inner.

## Canonical structure

```text
src/
├── domain/
│   ├── model/{Entity}.{ext}, {ValueObject}.{ext}
│   └── services/{Policy}.{ext}                  ← stateless domain behaviour
├── application/
│   ├── services/{Workflow}Service.{ext}         ← orchestration, transaction boundaries
│   └── interfaces/{Repository}.{ext}            ← declared HERE, implemented outward
└── infrastructure/
    ├── persistence/{Entity}Repository.{ext}     ← implements application/interfaces
    ├── web/{Resource}Controller.{ext}
    └── composition/                             ← the ONLY place implementations meet interfaces
```

## The rules that actually get broken

1. **Interfaces are declared in the ring that consumes them.** A repository interface lives in Application; its implementation lives in Infrastructure. Declaring it beside the implementation means nothing is inverted and the onion is a layer cake.
2. **The domain model has no framework, no ORM, no attributes.** If an entity carries persistence mapping, keep a separate persistence model and map at the boundary.
3. **Domain Services are stateless.** They take domain objects and return domain objects. A domain service that holds a connection, a cache, or a session has pulled infrastructure into ring two.
4. **Application Services own the transaction boundary**, not the controller and not the repository. One workflow, one transaction, decided in one place.
5. **The centre never imports outward — including for convenience.** A single `from infrastructure...` inside the domain collapses the whole structure, because everything the domain imports becomes something the domain depends on.
6. **Tests are outer-ring citizens.** The domain must be testable with no test doubles at all — if testing an entity requires mocking, the entity has an outward dependency.

## Onion vs. Clean — pick one vocabulary and hold it

They share the dependency rule and differ in ring vocabulary and granularity. The real distinctions:

| | Onion | Clean |
| --- | --- | --- |
| Domain behaviour with no entity home | An explicit **Domain Services** ring | Folded into use cases or domain services, unnamed as a ring |
| Application granularity | **Application Services** — may coordinate several related operations | **Use case interactors** — one per use case, single entry point |
| Outer ring | Infrastructure, UI, and tests as **one** peripheral ring | Split into **Infrastructure** and **Presentation** as peers |
| Boundary DTOs | Lighter-touch; entities crossing outward is a judgement call | Explicit request/response models; entities must not cross outward |

**Pick Onion when** the domain has substantial cross-entity behaviour that deserves a named home, and coarse application services fit the workflows better than one class per operation.

**Pick Clean when** operations are numerous and independent, and you want each one to have exactly one entry point and an explicit wire contract.

**The failure mode is mixing the vocabularies** — a repo with both `use_cases/` and `application/services/`, where nobody can say which a new file belongs in. Record the pick in an ADR and use its words everywhere.

## Anti-patterns (flag these in review)

1. **Anemic centre** — entities are data holders and every rule lives in application services. The onion has a hole; the domain ring is decoration.
2. **Stateful domain service** — a policy or calculator holding a session, connection, or cache.
3. **Interface declared in Infrastructure** — beside its implementation. Nothing is inverted.
4. **Controller-owned transactions** — the web ring opening and committing units of work that belong to Application Services.
5. **Leaky centre** — ORM attributes, framework base classes, or serialization concerns on domain types.
6. **Infrastructure-shaped domain** — entities whose fields exist because of a table layout (surrogate keys, join tables, nullable columns mirroring schema quirks) rather than because the business has those concepts.
7. **`Common`/`Shared` cross-ring package** — imported by every ring, accountable to none, and the standard route back to a tangled dependency graph.
8. **Application service as god object** — "coarser than a use case" is a licence for a service per *workflow*, not a service per *aggregate* with thirty methods.

## Relationship to VSA

Orthogonal (`arch-vsa.md`). Onion organizes by ring with features spread across them; VSA organizes by feature with rings collapsed inside the slice. Applying Onion's dependency rule *within* a slice is a legitimate hybrid and is what `arch-vsa.md`'s "Clean Architecture within the slice" clause points at — record it as an explicit repo decision in an ADR rather than leaving each slice to improvise.
