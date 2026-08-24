# Clean Architecture Guidelines

**Priority:** High
**Instruction:** You MUST follow these Clean Architecture guidelines when designing, generating, or refactoring code in a repo whose profile records `architecture: clean`.

**Axis:** backend architecture. **Owns:** placement — which layer a file lives in, which direction dependencies may point, where an abstraction is declared. **Defers to the repo's backend language core for:** naming case, type declaration syntax, file extensions, error handling mechanics, test framework. See [`AXES.md`](./AXES.md).

## Core concept

Organize code by **distance from the domain**, in concentric layers. The single rule everything else serves:

> **The Dependency Rule: source-code dependencies point inward only.** Nothing in an inner layer may name anything in an outer layer.

The domain does not know the database exists. The use cases do not know HTTP exists. This is what makes the domain testable with no infrastructure at all, and it is the *only* benefit Clean buys you — a Clean codebase whose domain imports its ORM has paid the full structural cost for nothing.

## The layers

From the inside out:

| Layer | Holds | May depend on |
| --- | --- | --- |
| **Domain** (Entities) | Enterprise-wide business rules, entities, value objects, domain events, domain exceptions | nothing — no framework, no ORM, no HTTP, no DTOs |
| **Application** (Use Cases) | One class or function per use case; orchestration; **port interfaces** (`OrderRepository`, `PaymentGateway`, `Clock`) | Domain only |
| **Infrastructure** (Adapters) | Implementations of the ports: ORM repositories, HTTP clients, message buses, file stores, the real clock | Application + Domain |
| **Presentation** (Adapters) | Controllers/routes, request and response DTOs, serializers, view models | Application + Domain |

Infrastructure and Presentation are peers. Neither may import the other — a controller reaching into a repository implementation instead of a port is the most common breach.

## Canonical structure

```text
src/
├── domain/
│   ├── entities/{Entity}.{ext}
│   ├── value_objects/{ValueObject}.{ext}
│   └── exceptions/{DomainError}.{ext}
├── application/
│   ├── use_cases/{UseCase}/{UseCase}.{ext}     ← one use case, one entry point
│   ├── ports/{Port}.{ext}                       ← INTERFACES ONLY — declared here, implemented outward
│   └── dto/{UseCase}Request.{ext}, {UseCase}Response.{ext}
├── infrastructure/
│   ├── persistence/{Entity}RepositoryImpl.{ext} ← implements application/ports
│   ├── clients/{External}Client.{ext}
│   └── config/                                  ← composition root: the ONLY place that wires impls to ports
└── presentation/
    ├── controllers/{Resource}Controller.{ext}
    └── schemas/{Resource}Schema.{ext}
```

## The rules that actually get broken

1. **Ports are declared by the layer that *needs* them, not the layer that *implements* them.** `OrderRepository` lives in `application/ports/`; `OrderRepositoryImpl` lives in `infrastructure/persistence/`. Declaring the interface next to its implementation inverts nothing and is the single most common way a codebase claims Clean while being layered.
2. **The domain imports nothing.** No ORM decorators on entities, no framework base classes, no serialization attributes. If an entity carries an ORM mapping, you have a persistence model, not a domain entity — keep both and map between them.
3. **Wiring happens only at the composition root.** One place constructs implementations and hands them to use cases. A use case that instantiates its own repository has hardcoded the dependency it exists to invert.
4. **One use case, one entry point.** A use case class with five public methods is a service, and services grow until they own everything.
5. **DTOs do not cross inward.** A use case takes its own request model, not the framework's request object. A controller that passes an HTTP request into a use case has bound the application to the transport.
6. **Entities may not be returned to the presentation layer.** Map to a response DTO. Returning entities leaks domain shape into the wire contract, and the two then change together forever.

## Trade-offs — state these honestly

Clean buys **substitutability and domain testability** at the cost of **indirection and mapping**. Both are real:

- A trivial CRUD operation costs four files and two mappings. That is the price, not a mistake — but a repo that is *entirely* trivial CRUD is paying it for nothing and should be using a simpler architecture.
- The mapping between persistence models and domain entities is genuine, ongoing work. Tooling reduces the typing; it does not remove the decision of what maps to what.
- The benefit arrives when an outer thing changes — swapping a data store, adding a second transport, testing a rule with no infrastructure. If nothing outer ever changes, the indirection never pays back.

Do not resolve this tension by "pragmatically" letting the domain import the ORM. That does not give you a cheaper Clean; it gives you a layered architecture with extra folders.

## Anti-patterns (flag these in review)

1. **Anemic domain** — entities are property bags, all behaviour sits in use cases. The domain layer is then decoration; the rules live one ring out.
2. **Port declared in infrastructure** — the interface next to its implementation. Nothing is inverted.
3. **Leaky entity** — ORM decorators, framework base classes, or serialization attributes on a domain type.
4. **Framework types crossing inward** — an HTTP request, a database session, or a framework's response object appearing in an application or domain signature.
5. **Use-case-as-service** — one class per *resource* with many methods, instead of one per *use case*.
6. **Cross-layer reach-around** — a controller importing a repository implementation directly, bypassing the port.
7. **Shared "Common" layer** — a `common/` or `shared/` package imported by every layer, which becomes an unlayered dumping ground that quietly reintroduces every dependency the rings forbid.
8. **Mapping avoidance** — reusing one class as entity, ORM model, and wire DTO. It is the fastest route back to a layered monolith, and it always starts as "they're identical anyway".

## Relationship to other architectures

- **vs. Onion** (`arch-onion.md`): the same dependency rule with a different layer vocabulary. Onion names an explicit *domain services* ring between entities and application; Clean folds that into the application layer. Pick one and use its vocabulary consistently — the failure mode is mixing both and arguing about which ring a file belongs to.
- **vs. VSA** (`arch-vsa.md`): orthogonal axes of organization. Clean organizes by layer with features spread across them; VSA organizes by feature with layers collapsed inside. A hybrid — feature folders that each contain the Clean rings — is legitimate and should be recorded as an explicit repo decision in an ADR, not left implicit.
