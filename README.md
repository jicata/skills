# skills — a base library of agent skills + an interview that adapts them per repo

Hand-porting skills between repos sucks. This repo is the cure: a **base library** of generic, battle-tested agent skills and doctrine, plus a **setup interview** that adapts the set to any given repo — and a **return path** that keeps repo-grown wisdom flowing back here instead of diverging.

Donor: a mature in-production .NET backend skill stack (itself seeded from [mattpocock/skills](https://github.com/mattpocock/skills), then heavily evolved). First pilot: a small internal web app.

## The law: configure and layer — never generate prose

The one rule that keeps N repos upgradeable:

- **Base files install verbatim and are read-only by convention.** A repo never edits an installed base skill. Upgrades are file copies.
- **Each repo gets a writable overlay** — a `project-profile.md` the interview writes and every later session maintains: YAML facts up top (stack, architecture, tracker, check commands, chassis, mode), **trigger-indexed** constraint sections below (keyed by activity: persistence, testing, deploy…). Constraints are edited in place, never appended chronologically; every constraint carries its **why + an evidence pointer** — a rule with a scar attached gets obeyed, a bare imperative gets relitigated. When a section outgrows a screen, it graduates into its own doctrine file and leaves an index line behind.
- **Only three things are ever generated per repo**, because they are manifests, not wisdom: the composite coder lens (a file list), the doctrine index (a table), and the repo's `ask-*` router (derived from what setup actually installed — so the router can't lie on day 1).

Templates (chassis-foundation, deploy-infra, …) are instantiated **only when the interview surfaces the condition** — nothing here assumes every project has a chassis, a GitOps pipeline, or a legacy oracle.

## Layout

```
skills/      tier-0 generic skills, installed verbatim
agents/      subagent definitions dispatched by the autonomous orchestrators
doctrine/    generic doctrine cores (dotnet-backend, vsa, fowler, writing-skills, …)
templates/   conditionally-instantiated patterns (chassis-foundation, deploy-infra, project-profile, router scaffold)
setup/       the detect-first interview that adapts the set to a repo (see setup/QUESTIONS.md)
skill-sync/  the return path: classify repo deltas as overlay-bound / upstreamable / upstream-behind
```

## Lifecycle

1. `/setup` in a fresh repo: **detect facts** (stack, folder shape, tracker, docs) and confirm them; **ask only the real decisions** (facts are looked up, decisions go to the human); install the applicable base set; instantiate the surfaced templates; write `project-profile.md`; generate lens + index + router; record the base version.
2. Work happens. Repo-specific scars land in the overlay, not in base files.
3. `/skill-sync` periodically: diff installed base files against the base repo — hand-edits are either overlay material (move them) or generic improvements (PR them here); pull upstream updates the repo is behind on.

---

# The library

## Skills

### Planning & specification

| Skill | What it does |
| --- | --- |
| `wayfinder` | Charts work too big for one session as a GitHub map of **decision tickets** — questions whose resolution is a decision, not build slices — and works them one at a time until the route is clear. Hands off to the spec-authoring skill; never builds. |
| `grill-me` | Interviews you relentlessly about a plan or design, resolving each branch of the decision tree, until you share understanding. |
| `grill-with-docs` | Grilling that also challenges the plan against the domain model, and updates the glossary/ADRs inline as decisions crystallise. Use when the session should leave a paper trail. |
| `write-a-prd` | Interview → codebase exploration → module design → files a `PRD:` GitHub issue. |
| `prd-to-issues` | Slices a PRD into independently-grabbable child issues as tracer-bullet vertical slices, with `Blocked by` edges and a printed execution order. |
| `log-issue` | Investigates a reported bug/enhancement, proposes the fix, and on approval files a fully-populated issue (root cause, TDD plan, acceptance criteria) ready for `/ship-issue`. |
| `prototype` | A throwaway spike answering **one** design question. The verdict lands on the issue; the code never merges. |

### The build pipeline (HITL lane)

The human-driven loop. Each step is a skill you type.

| Skill | What it does |
| --- | --- |
| `expand-issue` | Planning pass for one child issue: loads the design docs + fixtures it hard-links plus the real code, proposes an approach through the repo's coder lens, and resolves genuine decisions with you one at a time. Plans only — never writes production code. |
| `execute-issue` | Picks the next unblocked, unclaimed child issue, branches, implements through the composite coder lens, opens a PR at the PRD base branch. When all children are merged it instead **finalizes** the PRD. |
| `review-pr` | Two-axis review: **Axis A** requirements (against the linked issue/PRD) and **Axis B** standards (against the repo's doctrine index). Posts blocking comments; resolves prior threads on follow-up passes. |
| `address-pr` | Fixes unresolved review threads on a PR and pushes. Takes a PR number directly; does not resolve the threads — the next `/review-pr` pass does that. |
| `concede-pr` | Escape hatch when only Axis-B threads remain after max iterations: files a tech-debt issue summarizing the compromises, resolves the threads, approves. |
| `merge-pr` | Verifies merge-readiness, squash-merges, deletes the branch, explicitly closes linked issues (needed because PRs target the PRD base branch, so keyword auto-close doesn't fire). |
| `resolving-merge-conflicts` | Resolves an in-progress merge/rebase conflict by intent rather than by hunk. |

### The autonomous lane (`afk-*`)

Same pipeline, driven by an orchestrator instead of you. The `afk-*` variants differ from their human-driven counterparts in three ways: **best-effort on every halt condition** (they never stop and ask), **residue logged** to a per-PRD/per-issue `[ship-cleanup]` issue instead of raised as a question, and a **structured JSON return** for the orchestrator to branch on.

| Skill | Role |
| --- | --- |
| `ship-feature` | **Top-level orchestrator.** Ships an entire PRD end-to-end: loops every child, dispatches `afk-coder` to implement and address feedback, `afk-reviewer` for independent review, concedes per-thread after 3 rejects (Axis-B only), forces merge after 7 rounds, then opens and merges the PRD→default-branch PR. Never halts. `--parallel <N>` runs children concurrently over a `Blocked-by:` DAG, one worktree per slot. |
| `ship-issue` | Same orchestrator shape for a single standalone bug/enhancement. |
| `afk-execute-issue` | Autonomous `execute-issue`. PRD mode (next child, PR at base branch) or `--single` mode (standalone issue, PR at default branch). |
| `afk-address-pr` | Autonomous `address-pr`, plus regression localization and **pushback-via-thread-reply** for out-of-scope concerns. |
| `afk-review-pr` | Autonomous `review-pr`, plus arbitration of the coder's pushback replies and suppression of concerns already conceded in the cleanup issue. |
| `afk-merge-pr` | Autonomous `merge-pr`, with `--force` for the orchestrator's post-concession path. |
| `afk-concede-thread` | Thread-granular concession (vs `concede-pr`'s whole-PR): appends to the cleanup issue, marks and resolves the thread. Refuses Axis-A threads unless forced. |
| `drain-cleanup` | Processes a `[ship-cleanup]` issue afterwards: re-verifies each entry against the current default branch (regressions may already be fixed), classifies stale / actionable / unknown, and spins off properly-formed issues. Triages and decomposes — never fixes code. |

Agents in `agents/`: **`afk-coder`** (runs `afk-execute-issue`, then `afk-address-pr` on subsequent rounds; persists across review rounds on one PR, fresh per PR) and **`afk-reviewer`** (runs `afk-review-pr`; deliberately cold-context across PRs to preserve independent review). Both run on the profile's `workhorse_model` — the orchestrator pattern assumes subagents are cheap. `skills/_afk-shared/resilience.md` is not a skill — it is the single source of truth for the shared resilience mechanics (non-interactive time-boxed shell, heartbeat log, and the reasoning for why there is deliberately **no** watchdog), and it **wins over any skill it disagrees with**.

### Design, quality & understanding

| Skill | What it does |
| --- | --- |
| `codebase-design` | The shared vocabulary: **deep modules** — a lot of behaviour behind a small interface, at a clean seam, testable through that interface. Other skills speak it. (`DEEPENING.md`, `DESIGN-IT-TWICE.md`) |
| `tdd` | The red-green loop for features and bug fixes. (`tests.md`, `mocking.md`, `refactoring.md`) |
| `improve-codebase-architecture` | Doc-first architectural review of a scoped area, graded against the repo's **own** doctrine and ADRs. Diagnoses drift, finds root cause, proposes both the refactor and the rule hardening that stops it recurring. Read-only — every outward artifact is gated on approval. (`REFERENCE.md`) |
| `diagnosing-bugs` | Diagnosis loop for bugs that *resist* — intermittent, unreproduced, unexplained. (`scripts/hitl-loop.template.sh`) |
| `code-reviewer-persona` | The reviewer persona the review skills adopt — composes the doctrine index, `karpathy-guidelines` and `tdd` before reviewing. |
| `ubiquitous-language` | Extracts a DDD glossary from the conversation, flags ambiguities, proposes canonical terms, writes to the repo's glossary. |
| `karpathy-guidelines` | Behavioural guidelines targeting common LLM coding pitfalls. |

## Doctrine

Loaded on demand via the generated doctrine index; the always-on ones are pulled into every relevant turn.

| File | Scope |
| --- | --- |
| `documentation-first.md` | Consult docs before code. Defines the **lean canon** — glossary, ADRs, architecture/concept map — and treats everything else as a temporary artifact living on its work item. |
| `surface-dont-chase.md` | Ambient rule: a smell noticed in already-loaded context gets **one line and an offer to log it**, never a refactor. Captures the instinct without the scope creep. |
| `fowler-smell-baseline.md` | Curated Fowler smells for the Standards axis. Always a labelled judgement call, never blocking on its own; documented doctrine overrides. |
| `vsa.md` | Vertical Slice Architecture — organize by feature, colocate the slice, isolate between slices. |
| `dotnet-backend.md` | Idiomatic modern .NET / ASP.NET Core / EF Core rules. |
| `writing-skills.md` + `writing-skills-glossary.md` | How skills themselves are authored: **predictability** as the root virtue, with levers grouped by invocation, information hierarchy, steering, and pruning. This is the doctrine this repo is held to. |

## Templates

Prose is filled in here and nowhere else — instantiated by setup from interview answers.

| Template | Condition | Materializes as |
| --- | --- | --- |
| `project-profile.md` | **always** | `.claude/doctrine/project-profile.md` — the overlay. The repo's only writable skill surface. |
| `router.md` | always | `.claude/skills/ask-<name>/SKILL.md` — the router, generated from what was *actually* installed. |
| `chassis-foundation.md` | Q1 — the app sits on base/chassis libraries that own runtime behaviour | `.claude/rules/chassis-foundation.md` (always-on): what the chassis owns, the division of labour, reviewer red flags, and the "read the chassis before asserting runtime behaviour" trigger list. |
| `deploy-infra.md` | Q2 — the path to production leaves this repo | `.claude/rules/deploy-infra-foundation.md` (always-on): the pipeline, sibling-repo pointers, and the "a route the gateway doesn't know is a dead endpoint" trigger. |

---

# How adaptation works

## `/setup` — the interview

Design method: **invert the donor.** Every repo-specific rule in the donor stack is the answer to a generic question nobody asked out loud — it was learned by incident instead. [`setup/QUESTIONS.md`](setup/QUESTIONS.md) asks those questions on purpose, on day 1.

The discipline: **facts are detected and stated for confirmation; only decisions and off-repo knowledge are asked.** One question at a time. Target ~5 confirmations + ~5 real questions — never a 20-question wizard.

The catalog, and what each answer materializes:

| | Question | Materializes |
| --- | --- | --- |
| **Q1** | Chassis — base libraries that own runtime behaviour? | `chassis-foundation` template |
| **Q2** | Does deployment leave this repo? | `deploy-infra` template |
| **Q3** | Routes/contracts whose truth lives in another system? | contract doctrine + oracle pointers |
| **Q4** | Can agents reach live/shared environments? | hard safety constraints, **first** in the overlay |
| **Q5** | Stack *(detected)* | language doctrine core + `check_commands` |
| **Q6** | Architecture shape *(detected)* | architecture doctrine + **the composite coder lens** |
| **Q7** | Database, migration owner, local/test stand-in | persistence doctrine + overlay facts |
| **Q8** | Legacy oracle new code must behaviourally match? | parity constraints + parity-testing doctrine |
| **Q9** | Tracker + orchestration tier: full PRD pipeline or light? | the installed pipeline tier; the router matches |
| **Q10** | Where do the three canon doc artifacts live? | recorded paths; seeds missing canon files |
| **Q11** | Test strategy — and what's deliberately **out** of scope | overlay testing section |
| **Q12** | What gates a merge? | overlay facts + reviewer expectations |
| **Q13** | Does the app construct prompts / call models? | prompt-craft doctrine |
| **Q14** | How do humans exercise the API (Postman)? | wire-contract skill |
| **Q15** | Existing glossary? One bounded context or several? | glossary conventions + `grill-with-docs` routing |

Q1–Q4 and Q8 are the ones to always ask when their condition is even plausible — those are the questions repos otherwise answer by expensive incident.

Setup closes by stating, verbatim, that **this is the skeleton, not the skin**: the most valuable rules are scars from incidents no interview can foresee. They accrete in `project-profile.md` and flow back here via `/skill-sync`.

## `/skill-sync` — the return path

Run periodically in an adapted repo. Three-way compares every installed base file (repo's copy vs its `base_version` vs base HEAD) and classifies each delta:

- **Overlay-bound** — a repo-specific edit made to a base file. Violates the read-only law. Fix is to **move it** into `project-profile.md` and restore the base file, so upgrades stay file-copies.
- **Upstreamable** — a generic improvement that merely happened to be born there. PR it here, genericized (repo facts → profile references; scars kept as attributed examples).
- **Upstream-behind** — base HEAD improved a file the repo hasn't touched. Pull it, bump `base_version`.
- **Conflict** — both moved. Resolve by intent: generic part upstream, repo-specific part in the overlay.

The classification table is presented for approval before anything moves.

**Scar-harvest** is the half a diff can't see: walk the overlay's recent constraints and ask of each *would this help a repo that isn't this one?* If yes, upstream it, attributed. This is how the base library grows scars without any repo bleeding twice.

## Status

Pre-alpha. Extraction from the donor in progress. Nothing here is installed anywhere yet.
