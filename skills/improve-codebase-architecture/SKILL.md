---
name: improve-codebase-architecture
description: Doc-first architectural review of a scoped area (a slice, a folder, a cluster of files), graded against the repo's OWN doctrine — the rule files its doctrine index declares, and its ADRs. Diagnoses structural drift, finds the root cause, and proposes both the behaviour-preserving refactor and the rule/skill hardening that stops it recurring. Read-only: every outward-facing artifact (GitHub issue, rule edit) is gated behind explicit approval. Use when the user points at code that "looks wrong / atrocious / messy", wants to improve architecture, find refactor opportunities, untangle a slice, or make the codebase more navigable and testable.
---

# Improve Codebase Architecture

This skill reproduces the workflow a careful architect runs by hand: **someone points at an area that feels wrong → you understand it through the docs first → you diagnose it against the project's own written rules → you find what *led* there → you propose the fix AND the guardrail that would have prevented it → nothing outward-facing happens without a yes.**

It is **read-only with respect to source code.** It never edits application source, never opens a PR, never runs a migration. Its products are: a diagnosis (chat), and — only after you approve — a work-item seed (the repo's issue- or spec-authoring skill) and/or direct edits to `.claude/rules/*` and `.claude/skills/*` (internal governance, like a rule-hardening session).

## Two orthogonal lenses (and the guardrail between them)

Architectural friction comes in two shapes. They point in **opposite directions**, so name which one applies before recommending anything:

| Lens | Symptom | Move | Grounded in |
|---|---|---|---|
| **Structural (too many concepts in one place)** | A slice/module root holding a whole pipeline + calculators + DTOs flat; a god orchestrator; infra mixed with domain | **Split / sub-folder** into operation / sub-domain / shared clusters | the rule files the repo's doctrine index declares for structure (architecture shape, single responsibility) |
| **Depth (one concept fragmented too thin)** | One idea smeared across many shallow files; pure functions extracted only for testability while the real bug lives in how they're called; brittle seams between tightly-coupled modules | **Deepen** — collapse the shallow modules behind a smaller interface, test at the boundary | Ousterhout, *A Philosophy of Software Design* — vocabulary + principles in [`/codebase-design`](../codebase-design/SKILL.md) |

**The guardrail (non-negotiable):** *Deepen* a concept that is spread too thin. *Split* a place that holds too many concepts. **Neither move ever merges across a boundary the repo's architecture doctrine declares** (a slice/module boundary, a class past a single-responsibility limit, two distinct operations, a domain primitive and its HTTP client). When the depth lens tempts you to merge across one of those lines, the structural lens wins. Resist premature abstraction over chasing a smaller interface.

## Process

### Step 0 — Scope and ground

1. **Scope it.** Take the area from the invocation. If none was given, ask *which slice or folder* — do **not** sweep the whole repo. One area per run.
2. **Ground before the deep read**, per the repo's documentation doctrine:
   - The architecture map — locate the area; note its ADRs.
   - The cited ADRs (prefer non-Superseded). These record *why* the current shape exists — a "smell" an ADR deliberately chose is not a smell.
   - The domain glossary for the terms in play.
3. **Load the governing rule files** — the rule files the repo's doctrine index declares for the area, in full. These are the **yardstick** — every finding cites a specific rule/principle or an ADR, never a personal taste. (If the profile (`.claude/doctrine/project-profile.md`) declares chassis-like base libraries: before flagging anything about transactions, request pipeline, DI, error mapping, tenancy, or persistence, confirm against the chassis source — the app is not self-contained.)

### Step 1 — Diagnose against doctrine

Explore the scoped area with the Explore subagent (bounded to the path from Step 0). Apply **both lenses** from above, plus a **mechanical census against the repo's declared structure rules** (catches drift no single PR diff reveals): count the loose files in each slice/module root within scope against the threshold the structure doctrine sets. A root over that threshold, or one whose loose files form an identifiable sub-domain, is a structural candidate.

Classify each candidate's dependencies (drives how it can be tested after the change) — categories per `/codebase-design`'s DEEPENING; a repo may declare a stack-specific re-cut, see [REFERENCE.md](REFERENCE.md).

Every finding names its yardstick: `[<rule file>: <principle>]` or `[ADR NNN chose this — not a finding]`.

### Step 2 — Root cause (not just the smell)

State **what led here**, not only what's wrong. The valuable part of the diagnosis is the mechanism: incremental drift across many small PRs each clean in isolation; a rule that was silent on this dimension; an autonomous-flow path of least resistance; an ADR that aged out. This is what tells you whether a code fix alone is enough or whether a guardrail is also needed (Step 5).

### Step 3 — Present candidates, user picks

Present a numbered list. For each: **cluster** (files/concepts), **lens** (structural vs depth), **why it drifted** (root cause), **dependency category**, **test impact** (which tests change), **doctrine cite**. Do not design solutions yet. Ask: *"Which of these do you want to pursue?"*

### Step 4 — Design the target

For the chosen candidate:

- **Structural →** draw the target folder tree (operation / sub-domain / shared) as a **behaviour-preserving move-and-renamespace plan**: which files move where, what namespaces change, what stays. No logic edits. Confirm it touches no public contract.
- **Depth →** design it twice (per `/codebase-design`): spawn 3+ parallel Explore-class subagents, each producing a **radically different** interface (minimal / flexible / common-case-trivial / ports-and-adapters), bounded by the Step-0 guardrail. Each returns: signature, usage example, hidden complexity, dependency strategy, trade-offs. Compare in prose, then give your opinionated recommendation (or a hybrid).

### Step 5 — Propose the guardrail (close the loop)

If Step 2 found that **a rule or skill should have caught this and didn't**, propose the hardening: a new anti-pattern entry in the relevant rule file, a census step in the repo's review skill(s), a sweep in this skill. A code fix without the guardrail just lets the drift regrow. This step is optional only when the root cause was genuinely one-off.

### Step 6 — Confirm, then hand off

**Nothing outward-facing is created until you show it and get an explicit yes.**

- **Code refactor →** emit a **seed**, do not free-form an issue. Small/single-PR → a seed for the repo's issue-authoring skill (root cause, TDD plan, acceptance criteria in the repo's issue shape). Large/multi-slice → a seed for its spec-authoring skill. This routes the work through the pipeline the repo's executors and reviewers already understand, instead of a generic RFC they'd choke on.
- **Rule/skill hardening →** these are internal governance files; edit them directly (with the diff shown first). They do not go through the GitHub issue pipeline.
- **Tests:** never instruct anyone to auto-delete tests. Identify which tests become redundant after a deepening and **list them in the seed for human approval** — deletion is a reviewed decision, not a side effect.

Share the resulting issue URL / branch / edited files.

## Critical rules

1. **Read-only on source.** This skill diagnoses and seeds; it never edits application code or opens PRs.
2. **Docs and rules before code** — every finding cites a rule principle or an ADR; "it bothers me" is not a finding.
3. **Confirm before any outward-facing artifact.** No `gh issue create` without an explicit yes on the drafted body.
4. **Honour the guardrail between the two lenses** — never merge across a boundary the repo's architecture doctrine declares in the name of a "deeper module."
5. **An ADR-chosen shape is not a smell.** If the current structure traces to a non-superseded ADR, surface that instead of flagging it.
6. **Never auto-delete tests** — propose redundancies for human approval in the seed.
7. **One scoped area per run** — refuse to sweep the whole repo unprompted.
