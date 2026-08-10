<!-- TEMPLATE — materialized by /setup as `.claude/doctrine/project-profile.md` (the path every
     base skill references) in EVERY repo; unlike the other templates it is unconditional. Setup fills the
     YAML block from detected+confirmed facts and seeds each section from the interview answers.
     After day 1 this file is the repo's ONLY writable skill surface: every later session
     maintains it. Fill every <FILL: …> slot; delete every block marked EXAMPLE; delete this
     comment. -->

# Project Profile — <FILL: repo name>

**Priority:** High — always-on. This is the repo's overlay over the read-only base skill library: the machine-readable facts other skills key off, and the repo's own scar tissue. Base files are never edited; everything repo-specific lands here.

```yaml
stack: <FILL: language + framework, e.g. ".NET 8 / ASP.NET Core">
architecture: <FILL: e.g. "VSA (Features/ folders)" | "layered" | "modular monolith">
tracker: <FILL: e.g. "GitHub issues (owner/repo)">
check_commands: <FILL: list — the commands that must pass before a PR, e.g. ["dotnet test"]>
mode: <FILL: greenfield | brownfield>
chassis: <FILL: none | paths — if not none, templates/chassis-foundation was instantiated; keep the paths mirrored here>
legacy_oracle: <FILL: none | pointer to the reference implementation new code must behaviorally match>
doc_appetite: <FILL: full | lean>
pipeline_tier: <FILL: full | light>
axis_c: <FILL: off | advisory | enforcing — how much authority CI check-runs have over a review verdict and a merge. Omit to infer from `ci` (none ⇒ off, configured ⇒ enforcing). `advisory` is the transition state while CI is being stood up: fully exercised and reported, but never blocking. See skills/_shared/axis-c.md>
review_identity: <FILL: self | app — who authors reviews. `self` (default; omit the key entirely for it) means the PR author's own account, which GitHub restricts to COMMENT-only reviews. `app` means a GitHub App installation, which can post native APPROVE / REQUEST_CHANGES. Consumed by skills/_shared/review-protocol.md; see setup/github-app.md>
review_app_token_cmd: <FILL: only when review_identity is app — a command printing a short-lived installation access token to stdout. Holds a key PATH, never a key. Omit entirely under `self`>
workhorse_model: <FILL: the cheap/fast model the autonomous ship-* pipeline runs orchestrator + coder/reviewer subagents on, e.g. "sonnet" — consumed by ship-feature/ship-issue model preflight and every Agent dispatch; omit if the pipeline isn't installed>
glossary: <FILL: path, e.g. docs/UBIQUITOUS_LANGUAGE.md | none>
smell_routing: <FILL: where ambient architectural smells get logged, e.g. "file a tracker issue" | a bucket-issue pointer — consumed by doctrine/surface-dont-chase.md>
base_version: <FILL: version/commit of the skills base library this repo was set up from — /skill-sync diffs against it>
```

## How to maintain this file (the fill-in convention)

- **Every constraint is: imperative + WHY + evidence pointer.** A rule with a scar attached gets obeyed; a bare imperative gets relitigated. Evidence = a commit, incident, issue, doc, or dated observation — something a skeptical future agent can check.
- **Edit in place, never append chronologically.** When reality changes, rewrite or delete the constraint. This file is a map, not a log.
- **Trigger-indexed:** constraints live under the activity that should trip them, so an agent doing persistence work reads Persistence, not everything.
- **Graduate at a screen:** when a section outgrows one screen, move its body to its own doctrine file (e.g. `.claude/doctrine/<topic>.md`) and leave one index line here pointing at it.

## Security & live-data safety

<!-- First on purpose: these are the constraints that must never be lost in a compaction (interview Q4). Reachable live/shared environments, read-only rules, schema-change ceremony. -->

<FILL: hard safety constraints, or "None — no live environments reachable from this repo.">

> **EXAMPLE (donor: the donor stack) — delete:** Never write/DDL/DML against the live Spanner `shared-app-db` DB — it is a shared live database this repo can reach read-only. Editing an already-promoted migration means drop/recreate of a DB, so always ask the human (edit-in-place vs new migration), never auto-decide. WHY: Flyway promotes migrations to live, which already holds production rows. Evidence: `spanner-shared-app-db-read-only` memory; Flyway-promotes-live seeding incident.

> **EXAMPLE (donor: the donor stack) — delete:** Seed data must be idempotent on a natural key — the target DB may already contain the rows, and Spanner has no `INSERT IF NOT EXISTS`. WHY: the same Flyway lane runs locally and against live. Evidence: `flyway-promotes-to-live-idempotent-seeds` memory.

## Persistence

<!-- Database, migration owner, local/test stand-in, seeding rules, known dead ends (Q7). -->

<FILL>

> **EXAMPLE (donor: the donor stack) — delete:** Boot local persistence via Flyway against the Spanner emulator, never EF `Migrate()` + seed — that path is a dead end. WHY: the EF migrations are stale relative to the Flyway-owned schema, and a row-ownership interceptor breaks EF seeding. Evidence: `dotnet-local-boot-emulator-chassis` memory; local-boot spike, 2026-06.

## Testing

<!-- How endpoints/units are tested; what is DELIBERATELY out of scope so agents don't re-flag it (Q11, Q12). -->

<FILL>

> **EXAMPLE (donor: the donor stack) — delete:** Test endpoints controller-as-unit with identity injected via `IRequestContext`; HTTP-auth e2e is deliberately deferred — do not flag its absence as a gap. WHY: real SSO tokens aren't available in test rigs; the deferral is a recorded decision, not an oversight. Evidence: `backend-test-strategy` memory.

## Merge gates

<!-- What actually gates a merge here — CI, local checks, review policy — and what is DELIBERATELY not a gate, so reviewers stop re-flagging it (Q12, Q12b). -->

<FILL: the real gates, plus anything deliberately ungated>

> **EXAMPLE (donor: the donor stack) — delete:** Local `dotnet test` is the merge gate; CI does not gate .NET builds. WHY: a deliberate, deferred decision — not an oversight. Evidence: Q12 interview, 2026-07. An agent raising "CI doesn't run the .NET suite" as a blocker is noise; suppress it.

> **EXAMPLE — delete:** Review identity is `self`, so every skill review posts as `COMMENTED` and `reviewDecision` is permanently `null`. The binding verdict is the `**Verdict:**` marker in the review body, per `skills/_shared/review-protocol.md`. WHY: GitHub rejects APPROVE/REQUEST_CHANGES from the PR author. Evidence: 400 PRs, zero non-null `reviewDecision`.

## Deploy & environments

<!-- Where the path-to-production leaves this repo; if templates/deploy-infra was instantiated, ONE index line pointing at it — don't duplicate its content here (Q2, Q12). -->

<FILL: pointer to the instantiated deploy-infra rule, or the repo's own deploy facts, or "CI in-repo end-to-end.">

## External contracts

<!-- Ported/consumed routes whose truth lives elsewhere; wire-contract tooling; the oracle pointer if legacy_oracle ≠ none (Q3, Q8, Q14). -->

<FILL>

## Domain language

<!-- Glossary location + the naming rules that beat convenience (Q15). -->

<FILL>
