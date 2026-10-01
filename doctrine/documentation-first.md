# Documentation-First Understanding

**Priority:** High — on-trigger. Loaded by the doc-touching skills and the doctrine index, not automatically; it is activity-scoped, so it maps to no path and gets no rule.

To thoroughly understand the user's prompt (an issue, a question, or a feature request), **always consult the documentation before exploring the codebase**.

## The lean canon

The durable doc set is deliberately small — three artifacts, whose locations the project profile records:

1. **The glossary** (ubiquitous language) — what things are called and what the words mean.
2. **ADRs** — why hard-to-reverse, surprising, trade-off-bearing decisions were made. Prefer non-`Superseded`/`Deprecated` for present-tense understanding; use superseded ones only for history, and say so.
3. **The architecture / concept map** — the system's shape and build status.

**Nothing else is durable documentation.** Everything further — implementation plans, walkthrough briefings, PRD/spec bodies, research notes, seeds — is a **temporary artifact**: it lives on the work item (an issue, a comment, a branch) that consumes it, does its job, and expires with it. Don't create standing doc files beyond the canon, and don't treat a work-item artifact as a source of current truth after its work item closes — the canon and the code are the truth.

## The rot test — which layer a fact belongs in

Before writing a sentence into any artifact, ask: ***could this sentence become wrong without the file I'm about to write to being touched?*** If yes, it is the wrong layer. The sentence will go stale silently, and a wrong document outranks no document in an agent's reasoning.

Each kind of fact has the one home that changes when the fact does:

- **A term, a renamed term, an alias to avoid** → the glossary.
- **A behaviour rule, state transition, edge case or failure mode** → **a test that pins it** — its name or its assertion message. Behaviour has no prose home: a sentence about how the code behaves rots the first time the code changes and the sentence doesn't.
- **A wire change** (route, verb, field, status) → the contract artifacts the profile declares — the executable collection, the FE-handoff contract. A binding spec for another party, not narrative.
- **A map-level change** (a unit added or removed, a stack change, a new cross-cutting rule) → the map, as a pointer row. The map says *where* things are, never *how* they work; for "how", link the code folder.
- **A hard-to-reverse, surprising, trade-off-bearing decision** → an ADR, if it passes the repo's ADR gate.
- **Planning, explanation, research** → the work item, where it is point-in-time by construction and dies with the work.

**A doc found outside the canon is a deletion candidate, not a maintenance obligation.** A feature README, a flow narrative, a "how it works" page — updating it re-arms the rot. Move whatever behaviour it states into a test if no test pins it yet, then propose deleting it.

## Navigation strategy

- **Foundational (domain terminology):** if the prompt carries domain terms or naming is uncertain, the glossary first — never invent synonyms for existing terms.
- **Top-down (broad/architectural prompts):** the architecture/concept map, then the ADRs it points at.
- **Bottom-up (specific prompts):** the nearest relevant ADR + the glossary IS the bottom; the live work item's temporary artifacts (its plan, its walkthrough comment) carry the local detail while the work is in flight.

## Cite your sources

Reference the documentation you read explicitly — the doc and the claim it grounds. An assertion traceable to a doc is checkable; an uncited one is a guess wearing confidence.

## Identify gaps

Actively point out gaps, inconsistencies, or stale statements in the docs you traversed. Finding the doc set wrong is a first-class result, not a detour.

## Anticipate updates

If the prompt involves changing the project, state which canon artifacts the change obligates — a glossary term, an ADR (apply the repo's ADR gate), a map row, a pinning test — routed by the rot test above, before the code work starts. Temporary artifacts belong on the work item, not in new standing files.

## Example

❌ **Code-first:** "Let me search the codebase for the `ProcessX` method to see how ingestion works…"

✅ **Docs-first:** "Before the code: the concept map places ingestion in system 2; ADR-007 explains why it parses eagerly. The glossary has no entry for 'staging manifest' — that's a gap, noting it. The change will supersede part of ADR-007 and flip the map row — flagging both before I start. Now the code."
