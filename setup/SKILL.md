---
name: setup-skill-base
description: Adapt the base skill library to the current repo — detect its facts, interview for the real decisions, install the applicable skills/doctrine, instantiate the surfaced templates, and generate the profile, lens, index, and router.
disable-model-invocation: true
---

# Setup — adapt the base library to this repo

Run once per repo (re-runnable: an existing profile is updated, never clobbered). The governing law is the base repo's README: **base files install verbatim; repo-specifics live in the overlay; only manifests, indexes, and routers are generated.**

## 1. Detect

Explore the repo BEFORE asking anything: language/stack (project files), architecture signature (feature folders / layers), tracker (`git remote`, `gh` availability), existing docs (glossary, ADRs, READMEs), existing `.claude/` content, check commands (build/test scripts). Facts are detected and **stated for confirmation** — never asked as open questions.

## 2. Interview

Walk [QUESTIONS.md](QUESTIONS.md) — the catalog is ordered and each entry states what it detects vs asks and what it materializes. Discipline: facts looked up, decisions put to the human, **one question at a time**, target ~5 confirmations + ~5 real questions. Skip every question whose condition plainly doesn't apply; ask every question whose answer would instantiate a template (Q1 chassis, Q2 deploy-infra, Q3 contract truth, Q8 legacy oracle) — those are the ones repos learn by expensive incident when nobody asks.

## 3. Install

Into the repo's `.claude/`:

- **Skills** (verbatim copy from `skills/`): the tier-0 set, filtered by the interview — pipeline tier (Q9) decides which orchestration skills; doc appetite (Q10) decides the doc-skills variant; LLM surface (Q13), wire-contract tooling (Q14) gate their skills.
- **Doctrine** (verbatim copy from `doctrine/`): the stack core (e.g. `dotnet-backend.md`), architecture core (e.g. `vsa.md`), `fowler-smell-baseline.md`, `writing-skills.md` + glossary, `documentation-first.md`, `surface-dont-chase.md`.
- **Templates** (instantiated — the ONE place prose is filled in, from interview answers): `project-profile.md` always; `chassis-foundation.md` if Q1 yes; `deploy-infra.md` if Q2 yes. Fill every `<FILL>` slot from the interview; delete the marked EXAMPLE blocks after using them as the pattern.

## 4. Generate (manifests only)

- **The composite coder lens** (the repo's `vsa-tdd` analog): a manifest skill listing exactly which installed files every coder run loads.
- **The doctrine index**: the load-on-demand table over what was actually installed.
- **The router** (`ask-<name>` per the user's preference): from `templates/router.md`, filled with the actually-installed skill set and the pipeline tier's real flow. A skill the router mentions must exist; a skill it omits must be orchestrator-internal.

## 5. Record and close

- Write `base_version` (the base repo's current commit SHA) into the profile's YAML.
- State the closing expectation verbatim: **"This is the skeleton, not the skin. The most valuable rules are scars from incidents no interview can foresee — they accrete in `project-profile.md` under its editing rules (edit in place, why + evidence pointer, delete what's wrong) and flow back to the base library via `/skill-sync`."**
