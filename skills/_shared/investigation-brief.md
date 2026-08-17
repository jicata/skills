# Shared: The investigation brief

Included by `/triage` and `/log-issue`. Defines what the `Explore` agent is told, and what it must return. Consumed after [`report-interrogation.md`](report-interrogation.md) has sorted observation from theory.

## Aim it at the symptom

The brief names **what was observed**, never what should be built. "No feedback on an operation that runs for minutes" is a brief. "Find where to add a loading spinner" is a conclusion wearing a brief's clothes, and the agent will confirm it.

Hand the reporter's quarantined theory over as a **claim to falsify**, stated as such, alongside the competing explanations you can name. An agent asked to test a claim reports when it fails; an agent handed the same claim as background builds on it.

Docs-first, per the repo's documentation doctrine: the lean canon — glossary, architecture/concept map, the relevant ADRs (locations per `.claude/doctrine/project-profile.md`) — before the slice's code and tests.

## What it must return

**1. Mechanism.** The traced path, told through one real instance with real values. Where the diagnosis leans on behaviour of code the agent did not read — "the backend already expands descendants", "the chassis already wraps this in a transaction" — it cites the file and symbol it inspected to confirm that. An unverified cross-module assumption is a halt condition: go read it, or strike the claim. Unverified cross-module assumptions are what produce multi-pass cascades, where each pass fixes one side, ships, and breaks the next.

**2. Pipeline, where state crosses a boundary.** Anything with an encoder/decoder pair or a write-here-read-there shape gets traced on every side: what writes the state, what reads it back, what acts on the decoded value, and whether the round trip preserves the observable behaviour. A symptom on one side is routinely caused by a contract mismatch on another, and reading only the symptomatic side is what ships the first fix of a cascade.

**3. Surface map.** The observable behaviours of the affected surface, enumerated exhaustively — including the ones that plainly are not affected. The reader is shown this list and asked what is missing; recognition beats recall, but only against a list thorough enough to prompt the memory. Walk these axes and produce a row wherever the surface has observable behaviour:

- **Happy path** — status, response shape, returned fields
- **Persistence** — rows written, updated, deleted; seeded state that must be respected
- **Downstream** — events published, external calls, locks taken
- **Error and boundary states** — invalid input, missing rows, concurrent modification, wrong-tenant access, and which failure maps to which status
- **Concurrency** — behaviour inside whatever transaction or optimistic-lock wrapper the profile declares, and on abort
- **Tenancy and auth** — scoping enforced, and behaviour under a wrong claim

Behaviours that share a query path, middleware, or event handler with the defect constrain the fix and define the do-not-regress envelope. A behaviour that obviously is not affected is exactly the one that gets silently regressed — list it.

**4. Prior art.** Where the codebase already solves this problem. A second inconsistent pattern for the same job is its own defect, and reuse beats invention.

**5. Sibling symptoms.** Broken or contract-violating behaviour noticed while tracing that nobody reported. Surface them; the reader decides whether to bundle, split, or ignore. Dropping them silently is how they become next month's report.

**6. Open questions.** Branches of the contract that code alone cannot settle — *404 or 403 when the tenant owns no matching row? Idempotent on a natural key, or is PK uniqueness enough? Retry a failed publish, or log and swallow?* These are the reader's decisions, and they are asked after the situation lands, with the options this investigation found.

## Consumer contracts

Where the work creates or changes anything a consumer calls — a route, verb, request or response shape, a required field, a status contract, a resource decomposition — and the profile's External contracts section names a consumer or legacy oracle whose truth lives elsewhere, probe that consumer **before** any shape is proposed.

Pin every claim to a route constant plus verb, never a folder or component name; names collide across the seam. Record the evidence tier: 1 for consumer code, 2 for a runtime capture, 3 for a design artifact transcribed with source and date. **"No consumer client exists yet" is a real result** — state it with the negative evidence that establishes it.

## Completion criterion

Six sections returned. Every cross-module claim carries the file and symbol that confirms it. The surface map covers each axis on which the surface has observable behaviour, and the quarantined theory has been explicitly confirmed or falsified.
