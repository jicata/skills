# Vertical Slice Architecture (VSA) Guidelines

**Priority:** High
**Instruction:** You MUST follow these Vertical Slice Architecture guidelines when designing, generating, or refactoring code.

(Extracted 2026-07 from the donor stack's `vertical-slice-architecture-specialist.md`. Generic to any feature-sliced backend; repo-specifics live in the repo's `.claude/doctrine/project-profile.md` overlay.)

## 🏗️ Core Concept
Organize code by **Feature** rather than by horizontal technical layers.
- **Colocate:** Group all components necessary for a specific feature together (e.g., Controller, Service, Repository, and Model for a specific use case live together).
- **High Cohesion:** Keep related code tightly coupled within the slice.
- **Loose Coupling:** Maintain strict isolation between different slices.

## 🎯 Approach to Requests
- Treat each request/feature as a distinct, self-contained use case.
- **No Unnecessary Abstractions:** Most cross-layer abstractions should melt away. Do not use generic repository interfaces shared across features unless absolutely necessary.
- **Tailored Patterns:** Allow each slice to adopt the design pattern that fits its complexity:
  - *Simple CRUD:* Use direct transaction scripts.
  - *Complex Workflows:* Use rich Domain-Driven Design (DDD) patterns.

## ⚖️ Trade-offs & Rules of Thumb
- **Duplication vs. Coupling:** Accept some code duplication across slices to avoid tight coupling.
- **Shared Utilities:** Extract shared utilities (like Auth or Logging) *only* when duplication becomes highly problematic.
- **Evolution:** Allow slices to evolve naturally based on complexity. Resist premature abstraction.

## 🚀 Benefits to Maintain
When implementing VSA, ensure the code achieves:
1. **Isolation:** Changes to one feature must be confined to its slice and not affect others.
2. **Simplicity:** Reduced boilerplate and cross-layer mocking.
3. **Business Alignment:** Code structure should perfectly mirror business capabilities and agile sprint deliverables.

## 🔗 Related Patterns & Integrations
- **CQRS-flavoured naming:** Handle Commands and Queries as separate operations, each a `record` request model paired with its own handler (e.g., `CreatePostCommand` and `GetDocumentQuery` are distinct). Whether a message bus (MediatR/Wolverine) mediates them is a repo decision recorded in the repo's ADRs. (Donor: deliberately **no bus** — handlers are plain classes injected via `AddScoped<>` and called directly by thin controllers; the Onion/Clean mapping is handler = interactor, Command/Query = request model, engines = domain services, with a documented revisit trigger for adopting a bus.)
- **Clean Architecture:** Apply Clean Architecture principles *within* the slice if needed (isolate domain logic from infrastructure), but do not organize the folder structure by those layers.

## 📁 Implementation Example
Structure your folders to mirror the features.

```text
Features/
  ├── CreatePost/
  │   ├── CreatePostCommand.cs
  │   ├── CreatePostHandler.cs
  │   └── CreatePostValidator.cs
  ├── ListPosts/
  │   ├── ListPostsQuery.cs
  │   └── ListPostsHandler.cs
```

## 🧱 Intra-Slice Structure (how a slice is organised *inside*)

The Core Concept above governs the boundary *between* slices. This section governs structure *within* one slice. It exists because VSA's "organise by feature" is silent on what happens when a single feature grows past a handful of files. Without this, slices rot into a flat dumping ground: orchestrators, HTTP clients, pure calculators, and DTOs all piled at the slice root, indistinguishable from one another. **A slice that has become a flat 30-file root is no longer a slice — it is an un-decomposed bounded context.**

### Canonical slice layout

```text
Features/{Slice}/
├── {Slice}Endpoints.cs          ← endpoint registrar — the ONLY orchestration file allowed at the root
├── README.md                    ← the only other thing at the root
├── {OperationA}/                ← one folder PER CQRS operation
│   ├── {OperationA}Command.cs   (or Query)
│   ├── {OperationA}Handler.cs
│   ├── {OperationA}Endpoint.cs
│   ├── {OperationA}Validator.cs
│   └── {OperationA}Response.cs  ← DTOs used by ONLY this operation live with it
├── {SubDomain}/                 ← a coherent internal engine/pipeline (see "Sub-domain clustering")
│   ├── {Orchestrator}.cs
│   ├── {…}Client.cs, I{…}Client.cs, {…}PromptBuilder.cs   ← infrastructure for this sub-domain
│   └── {…}Candidate.cs, {…}Result.cs                      ← DTOs owned by this sub-domain
└── Shared/                     ← primitives used by 2+ operations/sub-domains IN THIS SLICE
    ├── {…}Calculator.cs, {…}Reader.cs   ← pure domain + slice-local readers
    └── {…}Dto.cs                        ← DTOs shared across operations of this slice
```

**The slice root holds only the endpoint registrar and the README.** Everything else lives in an operation folder, a sub-domain folder, or `Shared/`. If a source file at the slice root is neither the registrar nor the README, it is misfiled.

> In stacks where folder names map to namespaces (C#), use `Shared/` — **not** `_Shared/`. A leading-underscore namespace segment (`…Slice._Shared`) trips analyzer naming rules (CA1707), and [`dotnet-backend.md`](./dotnet-backend.md) requires analyzer-clean code.

### Sub-domain clustering

When a coherent internal engine emerges inside a slice — a multi-stage pipeline, a set of files that always change together, an orchestrator plus its infrastructure (clients, prompt builders) plus its DTOs — give it **its own named subfolder**, not the slice root. Name it for the sub-domain (`Generation/`, `Catalog/`, `Dedup/`), not for a technical layer. Clean Architecture *within* the cluster is fine (isolate domain from infrastructure); just don't fold the cluster's files up into the slice root.

### Promotion rules

- A type starts life **inside the operation or sub-domain folder that owns it.**
- It moves to the slice's `Shared/` **only when a *second* operation or sub-domain in the same slice actually uses it** — never preemptively.
- It moves to a *cross-slice* shared location **only when a *second slice* actually uses it.** A cross-slice import reaching into another slice's `Shared/` or sub-domain folder is the signal to promote — not a licence to import across the boundary.

### The slice-root census (the trigger that catches drift)

This drift never arrives in one commit — it accrues one or two files at a time across many PRs, and each diff looks clean in isolation. The defence is to count, not eyeball:

> **When you add, move, or rename a source file into a `Features/**/` slice root, count the non-registrar, non-README files already at that root. If the count exceeds ~8, or you can name a sub-domain living loose at the root ("the generation pipeline", "the catalog reader"), the slice needs sub-foldering before (or as part of) your change.**

~8 is a smell threshold, not a hard cap — three tightly-cohesive readers at a root is fine; eight unrelated files spanning a pipeline, calculators, and DTOs is not.

## 🚫 Intra-Slice Anti-Patterns (flag these in review and refactor on sight)

The cross-slice rules above had no explicit "what bad looks like" list; these are the in-slice failure modes.

1. **Flat slice root** — orchestrators, HTTP clients, pure calculators, and DTOs all sitting at `Features/{X}/` top level alongside the registrar and README.
2. **Sub-domain at the root** — an identifiable internal engine/pipeline (multiple files that always change together) loose at the slice root instead of in its own named folder.
3. **Infrastructure mixed with domain** — HTTP/LLM clients next to pure domain primitives next to command handlers, at the same folder level, with nothing signalling which is which.
4. **Un-signposted slice-local shared types** — a type used by three operations sitting at the root, visually indistinguishable from single-operation types (belongs in `Shared/`).
5. **Root file count over ~8** — the death-by-a-thousand-cuts signal from the census above.
6. **Premature `Shared/`** — moving a type to `Shared/` (or a cross-slice shared location) before a second consumer actually exists.
7. **Cross-slice reach-in** — `Features/A/` importing from `Features/B/Shared/` or `Features/B/{SubDomain}/`. Promote the type to a shared location; do not import across the boundary.
8. **God orchestrator** — a single handler/service past ~250–300 lines owning multiple stages that should be separate, individually-testable collaborators. This compounds the flat-root smell (the stages get dumped as sibling files) and violates the single-responsibility limits in the repo's backend doctrine ([`dotnet-backend.md`](./dotnet-backend.md) for .NET).
