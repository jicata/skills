# .NET Development Rules

**Priority:** High — load for any C#/.NET backend code change.

**Axis:** backend language. **Owns:** idiom — naming, syntax, error handling, DI style, complexity limits, test tooling. **Defers to the repo's architecture core for:** placement — where a file lives, what may import what, whether a repository abstraction exists at all. See [`AXES.md`](./AXES.md).

Written for modern .NET — C# 10+, ASP.NET Core, EF Core. Repo-specifics — target framework, test framework, the local database stand-in, the analyzer set — live in the repo's `.claude/doctrine/project-profile.md` overlay.

(Extracted 2026-07 from the donor stack's `net-backend-master.md`. Restructured 2026-08 onto the shared language-core shape, so this file and `backend-python.md` answer the same questions in the same order — no rules were dropped in that move.)

## Code style and structure

- Write concise, idiomatic C#. Follow .NET and ASP.NET Core conventions.
- Use object-oriented and functional patterns as appropriate; prefer LINQ and lambda expressions for collection operations.
- Use descriptive variable and method names (`IsUserSignedIn`, `CalculateTotal`).
- **Never more than one type per file.** No second class, no enum tucked at the bottom.
- Don't set default values for properties unless explicitly called for.

## Naming conventions

- `PascalCase` for class names, method names, and public members.
- `camelCase` for local variables and private fields.
- `UPPERCASE` for constants.
- **Prefix interface names with `I`** (`IUserService`). This is a deliberate divergence from the Python core, where protocols carry no prefix; do not carry either habit across languages.
- Entity-key and schema naming conventions are repo policy — see the repo's `project-profile.md` / persistence doctrine before naming keys.
- **Never contract a domain entity stem.** The repo's canonical entity types are the vocabulary; a type or member name must not drop a **domain word** off a compound stem.
  - **The test — module qualifier vs. domain word.** You *may* strip a leading **module qualifier**: a prefix that leads several entities and is not itself an entity. You *may not* strip a word that leaves the **bare tail of a compound entity** — a contraction, because the stripped word names a real entity you'd be reaching *through*. (Donor example: `LoanCodingConceptMap` → `ConceptMap` fine — `LoanCoding` names no entity; `TemplateComponent` → `Component` forbidden — `NarrativeTemplate` is itself an entity.)
  - **Sanctioned exceptions are repo policy.** A repo's profile/ADRs may sanction specific alias patterns as structure, not rot. (Donor: interleaved Spanner children keep short `{Entity}Id` aliases so the propagated key stays legible, per its ADR.)
  - **Why a rule, not a build-failing test.** Nobody *decides* to contract a stem — it accretes, and later PRDs copy the habit (donor scar: a full sweep PRD was needed to undo it). A reflective architecture test to police it was designed and judged overkill: making the rule *correct* required more machinery (module-prefix derivation, an exemption list) than the rot it guards. When code is agent-authored and agent-reviewed, the cheapest effective guard is doctrine that fires at authoring and review time. **Reviewer heuristic:** a new type/member whose leading word is the tail of a compound entity is the smell — rename to the full stem, or, if it is a repo-sanctioned structural alias, say so explicitly in the diff.

## Language usage

- Use C# 10+ features where they fit: record types, pattern matching, null-coalescing assignment.
- Leverage built-in ASP.NET Core features and middleware rather than reimplementing them.
- Use EF Core effectively for database operations.
- Use Mapster for object-to-object mapping if mapping is needed at all.

## Syntax, formatting and tooling

- Follow the [C# Coding Conventions](https://docs.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions).
- Use C#'s expressive syntax — null-conditional operators, string interpolation.
- Use `var` for implicit typing when the type is obvious.
- **All analyzer conventions defined for the project must pass.** Analyzers are the enforcement surface; a suppression needs a reason attached, not a bare pragma.

## Async and concurrency

- Use `async`/`await` for all I/O-bound operations.
- **A `DbContext` is not thread-safe** — never run concurrent queries on one scoped context. Sequential awaits, or a context factory per branch.

## Dependency style

- **Use dependency injection** for loose coupling and testability. Testability of a component is a primary design concern.
- **Constructor parameter limit: 4–5 max.** More dependencies than that means the class is doing too much — extract a collaborator that groups related dependencies behind a simpler interface.
- Use EF Core through whatever data-access shape the repo's **architecture core** prescribes — directly in the slice under `arch-vsa`, behind a domain-owned repository interface under `arch-clean` / `arch-onion`. This file has no vote on placement; it governs only how EF Core is *used* once you are there.

## Error handling and validation

- Use exceptions for exceptional cases, never for control flow.
- Implement proper error logging using built-in .NET logging or a third-party logger.
- Use Data Annotations or Fluent Validation for model validation.
- **Use the global exception handling middleware.** No custom error handling in individual actions.
- Return appropriate HTTP status codes and consistent error responses.

## API design

- Follow RESTful API design principles.
- Use attribute routing in controllers.
- Use action filters for cross-cutting concerns.
- **Aim for controllers / Minimal API actions to be one-liners.** Not always possible, but very much preferred.
- Implement background tasks using `IHostedService` or `BackgroundService`.

## Performance

- Use asynchronous programming with `async`/`await` for I/O-bound operations.
- Write efficient LINQ queries and **avoid N+1 query problems.**
- **Implement pagination for large data sets.**

## Single responsibility & decomposition

- Every class should have ONE reason to change. If you can describe a class with "and" (e.g. "resolves mappings AND calls the LLM AND writes results"), it needs splitting.
- **Method length: ~25 lines max.** Beyond that, extract named private methods or new collaborators, each with a clear single purpose.
- **Nesting depth: 2 levels max.** Flatten long nested `if`/`try`/`foreach` chains with early returns, guard clauses, or extraction.
- **Cognitive load of a single function should stay at or below 17.** Count variable declarations, branches (if/else/switch arms), loops, try/catch blocks, and boolean operators. Over 17, split it.
- When a class grows beyond its responsibility, prefer extracting a new class with its own interface over adding more methods. The new class should be injectable and testable in isolation.

## Key conventions

- **Never use comments in a C# file** apart from the file heading and summaries on controller actions. This is a deliberate divergence from the Python core, where docstrings are idiomatic and tooling-consumed.
- Always look for similar existing code before writing new. Creating a repository? Find the existing ones and follow them.

## Testing

- Write unit tests using the repo's declared test framework (see `project-profile.md`; donor: NUnit).
- Use Moq for mocking external boundaries (HTTP clients, third-party APIs) — avoid mocking internal collaborators.
- Implement integration tests for API endpoints; run them against the repo's declared local database stand-in (profile Q7; donor: the Spanner emulator, not SQLite).
- Net-new code uses red-green TDD. Brownfield repos with a declared legacy oracle (profile Q8) add parity gates per their overlay.

## Security

- Use Authentication and Authorization middleware.
- Use the repo's existing auth pipeline rather than introducing a second one.
- Use HTTPS and enforce SSL.
- Implement proper CORS policies.

## API documentation

- Use Swagger/OpenAPI for API documentation.
- Provide XML comments for controllers and models to enrich the generated schema.

Follow the official Microsoft documentation and ASP.NET Core guides for anything this file does not cover.
