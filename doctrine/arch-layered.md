# Layered Architecture Guidelines

**Priority:** High
**Instruction:** You MUST follow these layered-architecture guidelines in a repo whose profile records `architecture_core: arch-layered`.

**Axis:** backend architecture. **Owns:** placement — which layer a file lives in, which direction dependencies may point, where data access goes. **Defers to the repo's backend language core for:** naming case, type declaration syntax, file extensions, error handling mechanics, test framework. See [`AXES.md`](./AXES.md).

## Core concept

Organize code into **horizontal layers by technical responsibility**, stacked. The rule:

> **Dependencies point downward, and only downward.** A layer may call the layer beneath it. It may never call the layer above it, and no cycle may exist between layers.

This is the oldest and most common backend architecture, and it is a **legitimate choice, not a failure to do Clean**. It is the right answer when the application is small, has one transport and one data store, and is unlikely to need either swapped. Its cost is stated honestly below — do not adopt it while pretending it has none, and do not adopt Clean or Onion to avoid admitting you chose it.

## The layers

Top to bottom. Names vary by repo; the profile records the actual folder names.

| Layer | Holds | May depend on |
| --- | --- | --- |
| **Transport / API** | Routes, controllers, request/response models, serialization, HTTP status mapping | Application, Domain |
| **Application / Services** | Business logic and orchestration, one module or service per feature or use case | Domain, Data access |
| **Domain / Models** | Entities and value objects; whatever business rules live on them | nothing, or a shared kernel only |
| **Data access / Infrastructure** | Queries, connections, transactions, external clients | Domain |

**The domain layer sits above data access and is permitted to depend on it.** That is the defining difference from Clean and Onion, and it is what makes this architecture cheap. It is also its central limitation.

## Canonical structure

```text
app/
├── api/                        ← transport: one module per resource
│   └── {resource}.{ext}
├── features/                   ← application: one package per feature
│   └── {feature}/
│       ├── handler.{ext}       ← the business logic
│       ├── schemas.{ext}       ← request/response models for this feature
│       └── queries.{ext}       ← this feature's data access, if it has any
├── models/                     ← domain entities, shared across features
│   └── {Entity}.{ext}
└── db.{ext}                    ← connection, transaction, migration entry points
```

The application layer may be **subdivided by feature** — that is the common and recommended refinement, and it buys most of what VSA buys without restructuring the stack. Subdividing does not make it VSA: the transport and domain layers remain horizontal and shared.

## The rules that actually get broken

1. **No upward dependencies, ever.** Data access must not import from the application layer; the domain must not import from transport. A single upward import creates a cycle that is easy to add and expensive to unpick.
2. **Business logic lives in the application layer.** Not in the route (which makes it untestable without HTTP) and not in the data layer (which makes it untestable without a database). A route that contains a conditional about business meaning is misplaced logic.
3. **Transport types stop at the transport layer.** A framework request object, an HTTP exception, or a serializer must not appear in an application-layer signature. Application code raises domain errors; the transport layer maps them to status codes.
4. **Data access belongs to the layer that owns the query, not to a global repository.** In a feature-subdivided application layer, a feature's queries live with that feature. Introduce a shared data-access module **only when a second feature actually needs the same query** — the same promotion rule every architecture uses, applied downward.
5. **Skipping a layer is allowed only downward, and only deliberately.** A route calling data access directly for a trivial read is pragmatic; doing it habitually means the application layer is decorative. Record the position in the profile so it is a decision rather than a drift.
6. **No cycles between feature modules in the same layer.** Horizontal coupling within a layer is the failure mode this architecture cannot see — a `shared/` module that everything imports and nothing owns.

## Trade-offs — state these honestly

Layered buys **directness and low ceremony**: a change is a small edit in an obvious place, there is no mapping between domain and persistence models, and every reader already knows the shape.

The costs are real and both follow from the domain depending on infrastructure:

- **Swapping the data store is invasive**, because business logic imports it directly. There is no seam to substitute at.
- **Testing business logic requires the store or a stand-in.** You cannot test a rule with no infrastructure at all, which is the single thing Clean and Onion buy.

Accept these when the store will not change and a stand-in is cheap (an in-memory database, a container). Do **not** resolve them by scattering ad-hoc interfaces — one inverted dependency in an otherwise-layered app is confusing rather than clean. Invert everything or nothing.

### When to graduate to Clean or Onion

Move when **two or more** of these are true — not before:

- A second transport arrives (CLI, message consumer, scheduled job) and business logic must be reachable from all of them.
- The data store is genuinely likely to change, or a second one appears.
- Business rules have grown complex enough that testing them through a database stand-in is the slow part of the suite.
- The domain has cross-entity behaviour that keeps landing in service classes with no natural home.

One of these alone is not enough. Migrating costs the mapping layer and the port machinery permanently.

## Anti-patterns (flag these in review)

1. **Fat controller** — business logic, conditionals, or orchestration in the route. Untestable without HTTP.
2. **Logic in the data layer** — a query module that decides business outcomes rather than fetching rows.
3. **Upward import** — data access importing the application layer, or the domain importing transport. Always a bug.
4. **God service** — one application module per *resource* accumulating every operation, past ~300 lines, with no feature subdivision.
5. **Anemic domain used as an excuse.** In layered, entities being mostly data is **acceptable** — unlike Clean, where it is a defect. What is not acceptable is the same rule reimplemented in three services because no one gave it a home.
6. **Premature shared data access** — a generic repository or `queries/common.{ext}` created before a second consumer exists.
7. **`utils/` or `shared/` as a dumping ground** — imported by every layer, owned by none, and the standard route to a cycle.
8. **Transport leakage** — an HTTP exception or framework request type in an application-layer signature.
9. **One inverted dependency** — a single hand-rolled port in an otherwise-layered app, which buys nothing and confuses the reader about which architecture applies.

## Relationship to other architectures

- **vs. Onion** ([`arch-onion.md`](./arch-onion.md)): **the inverse, not a variant.** Onion was written explicitly as a correction to this architecture. Here dependencies point *down* and infrastructure sits at the *bottom*, so the domain depends on the database. In Onion they point *inward* and infrastructure sits *outermost*, so the domain depends on nothing. Confusing the two is the most common architecture-vocabulary error there is — a repo with layers but no ports is layered, however many rings its diagram draws.
- **vs. Clean** ([`arch-clean.md`](./arch-clean.md)): same inversion difference, plus Clean's explicit request/response models at every boundary. Clean's Dependency Rule is precisely what this architecture does not have.
- **vs. VSA** ([`arch-vsa.md`](./arch-vsa.md)): orthogonal. VSA organizes primarily by feature with technical concerns collapsed inside the slice; layered organizes primarily by technical concern. **A layered app whose application layer is subdivided by feature is a legitimate and common hybrid** — and is layered, not VSA, because the transport and domain layers remain horizontal. Record which one governs in an ADR so nobody argues the point twice.
