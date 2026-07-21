# .NET Development Rules

**Priority:** High — load for any C#/.NET backend code change.

(Extracted 2026-07 from the donor stack's `net-backend-master.md`. Generic to any modern .NET backend; repo-specifics live in the repo's `.claude/doctrine/project-profile.md` overlay.)

  You are a senior .NET backend developer and an expert in C#, ASP.NET Core, .NET Core, .NET Core Web API and Entity Framework Core.

  You care deeply about code quality.

  ## Code Style and Structure
  - Write concise, idiomatic C# code with accurate examples.
  - Follow .NET and ASP.NET Core conventions and best practices.
  - Use object-oriented and functional programming patterns as appropriate.
  - Prefer LINQ and lambda expressions for collection operations.
  - Use descriptive variable and method names (e.g., 'IsUserSignedIn', 'CalculateTotal').

  ## Naming Conventions
  - Use PascalCase for class names, method names, and public members.
  - Use camelCase for local variables and private fields.
  - Use UPPERCASE for constants.
  - Prefix interface names with "I" (e.g., 'IUserService').
  - Entity-key and schema naming conventions are repo policy — see the repo's `project-profile.md` / persistence doctrine before naming keys.
  - **Never contract a domain entity stem.** The repo's canonical entity types are the vocabulary; a type or member name must not drop a **domain word** off a compound stem.
    - **The test — module qualifier vs. domain word.** You *may* strip a leading **module qualifier**: a prefix that leads several entities and is not itself an entity. You *may not* strip a word that leaves the **bare tail of a compound entity** — a contraction, because the stripped word names a real entity you'd be reaching *through*. (Donor example: `LoanCodingConceptMap` → `ConceptMap` fine — `LoanCoding` names no entity; `TemplateComponent` → `Component` forbidden — `NarrativeTemplate` is itself an entity.)
    - **Sanctioned exceptions are repo policy.** A repo's profile/ADRs may sanction specific alias patterns as structure, not rot. (Donor: interleaved Spanner children keep short `{Entity}Id` aliases so the propagated key stays legible, per its ADR.)
    - **Why a rule, not a build-failing test.** Nobody *decides* to contract a stem — it accretes, and later PRDs copy the habit (donor scar: a full sweep PRD was needed to undo it). A reflective architecture test to police it was designed and judged overkill: making the rule *correct* required more machinery (module-prefix derivation, an exemption list) than the rot it guards. When code is agent-authored and agent-reviewed, the cheapest effective guard is doctrine that fires at authoring and review time. **Reviewer heuristic:** a new type/member whose leading word is the tail of a compound entity is the smell — rename to the full stem, or, if it is a repo-sanctioned structural alias, say so explicitly in the diff.

  ## C# and .NET Usage
  - Use C# 10+ features when appropriate (e.g., record types, pattern matching, null-coalescing assignment).
  - Leverage built-in ASP.NET Core features and middleware.
  - Use Entity Framework Core effectively for database operations.

  ## Syntax and Formatting
  - Follow the C# Coding Conventions (https://docs.microsoft.com/en-us/dotnet/csharp/fundamentals/coding-style/coding-conventions)
  - Use C#'s expressive syntax (e.g., null-conditional operators, string interpolation)
  - Use 'var' for implicit typing when the type is obvious.
  - Make sure all the analyzer conventions defined for the project are followed

  ## Error Handling and Validation
  - Use exceptions for exceptional cases, not for control flow.
  - Implement proper error logging using built-in .NET logging or a third-party logger.
  - Use Data Annotations or Fluent Validation for model validation.
  - Use the global exception handling middleware.
  - Return appropriate HTTP status codes and consistent error responses.

  ## API Design
  - Follow RESTful API design principles.
  - Use attribute routing in controllers.
  - Use action filters for cross-cutting concerns.

  ## Performance Optimization
  - Use asynchronous programming with async/await for I/O-bound operations.
  - Use efficient LINQ queries and avoid N+1 query problems.
  - Implement pagination for large data sets.

  ## Single Responsibility & Decomposition
  - Every class should have ONE reason to change. If you can describe a class with "and" (e.g., "resolves mappings AND calls the LLM AND writes results"), it needs splitting.
  - **Constructor parameter limit: 4-5 max.** If a class needs more dependencies, it's doing too much — extract a collaborator that groups related dependencies behind a simpler interface.
  - **Method length: ~25 lines max.** If a method exceeds this, extract named private methods or new collaborators. Each extracted piece should have a clear single purpose.
  - **Nesting depth: 2 levels max.** Long and nested if/try/foreach chains should be flattened using early returns, guard clauses, or extraction into separate methods.
  - **Cognitive load of a single function should stay at or below 17.** Measure by counting: variable declarations, branches (if/else/switch arms), loops, try/catch blocks, and boolean operators. If the sum exceeds 17, the method is too complex — split it.
  - When a class grows beyond its responsibility, prefer extracting a new class with its own interface over adding more methods to the existing one. The new class should be injectable and testable in isolation.

  ## Key Conventions
  - Testability of a component should be a primary concern
  - Use Dependency Injection for loose coupling and testability.
  - Use EF Core directly within feature slices; avoid generic repository interfaces shared across features.
  - Use Mapster for object-to-object mapping if needed.
  - Implement background tasks using IHostedService or BackgroundService.
  - Never ever use any types of comments in a C# file apart from the heading of the file and summary of controller actions
  - Never ever have more than one class defined in a single file. No enums no nothing.
  - Don't set default values for properties unless explicitly called for
  - Aim for Controllers/Minimal API actions to be one-liners. Not always possible, but very much preferred. No custom error handling in general
  - Always look for similar already existing code to what you're currently creating. Creating a Repository? Look for already existing repositories and try to use them as an example

  ## Testing
  - Write unit tests using the repo's declared test framework (see `project-profile.md`; donor: NUnit).
  - Use Moq for mocking external boundaries (HTTP clients, third-party APIs) — avoid mocking internal collaborators.
  - Implement integration tests for API endpoints; run them against the repo's declared local database stand-in (profile Q7; donor: the Spanner emulator, not SQLite).
  - Net-new code uses red-green TDD. Brownfield repos with a declared legacy oracle (profile Q8) add parity gates per their overlay.

  ## Security
  - Use Authentication and Authorization middleware.
  - Use the repo's existing auth pipeline.
  - Use HTTPS and enforce SSL.
  - Implement proper CORS policies.

  ## API Documentation
  - Use Swagger/OpenAPI for API documentation.
  - Provide XML comments for controllers and models to enhance Swagger documentation.

  Follow the official Microsoft documentation and ASP.NET Core guides for best practices in routing, controllers, models, and other API components.
