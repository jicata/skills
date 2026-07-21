<!-- TEMPLATE — the router SCAFFOLD. /setup GENERATES the repo's router from this, as
     `.claude/skills/ask-<name>/SKILL.md`, derived strictly from what setup actually installed
     — a route to a skill that isn't installed is a router that lies on day 1. The router is
     one of only three generated-per-repo files (with the coder lens and the doctrine index)
     because it is a manifest, not wisdom.
     Per section: the <!-- guidance --> comment tells setup what to fill based on installed
     tier; the <example> block shows the donor's (the donor stack, full-tier) rendering — setup
     deletes both from the generated file. Drop any section with nothing installed behind it. -->

---
name: ask-<FILL: a name the human will remember — donor used the maintainer's first name, `ask-svet`>
description: Ask which skill or flow fits your situation. A router over this repo's skill stack.
disable-model-invocation: true
---

# Ask <FILL: Name>

You don't remember every skill, so ask. This router names the flows and the edges between skills — it gists and routes, it never restates a skill's contents.

**Maintenance rule:** any skill add / rename / behavior change triggers a re-check of this file. A new skill it never mentions, or a stale one it still routes to, is a router that lies.

A **flow** is a path through the skills. Most work travels the main flow; on-ramps merge onto it.

## The main flow

<!-- guidance: keyed to pipeline_tier (profile Q9).
     full → the idea→shipped-PRD chain: grill skills → write-a-prd → prd-to-issues → the
       build lanes (HITL: expand/execute/review/address/merge; autonomous: ship-feature) →
       finalize. Number the steps; name the lane fork explicitly.
     light → the main flow IS the on-ramp: log-issue → ship-issue (or the HITL review/merge
       pair if installed). Say so in two lines; don't scaffold an empty PRD chain. -->

<FILL>

<example donor tier="full">
1. Sharpen the idea by interview — `/grill-with-docs` when it should leave a paper trail; `/grill-me` for a plan that doesn't touch the doc set; `/ask` to explore before any plan exists.
2. `/write-a-prd` — interview → module design → files a `PRD:` issue.
3. `/prd-to-issues` — slices the PRD into child issues with `Blocked by` edges. Prints the execution order.
4. Build — two lanes: HITL (default): `/expand-issue` → `/execute-issue` → `/review-pr` → `/address-pr` → `/merge-pr`, running ahead on expands while the coder builds. Autonomous: `/ship-feature <prd>` loops coder + reviewer subagents over every child.
5. Finalize — `/execute-issue` (all-merged path) or `/ship-feature` merges the base branch to master and closes the PRD.
</example>

## On-ramps

<!-- guidance: entry points that merge onto the main flow. Include only installed ones:
     bug/small enhancement (log-issue → ship-issue or HITL lane; escalation path back to the
     PRD flow when it outgrows one PR; diagnosing-bugs gate for resistant bugs), someone
     else's PR (review-pr), cleanup-residue drain, any planning-scale escalation skill. -->

<FILL>

<example donor tier="full">
- A bug or small enhancement → `/log-issue` → `/ship-issue <n>` (autonomous) or the HITL lane off master. Outgrows one PR → PRD seed → `/write-a-prd`. A bug that *resists* drops into `/diagnosing-bugs` first.
- A PR someone (or some agent) else wrote → `/review-pr <n>`; fixes via `/address-pr`; merge via `/merge-pr`.
- A `[ship-cleanup]` issue accumulated residue → `/drain-cleanup`.
</example>

## Understanding the system

<!-- guidance: the installed mapping/exploration skills, one line each, with the
     disambiguation between them (frontier-forward vs paving vs visual vs one-shot).
     Include prototype/deep-research only if installed/available. -->

<FILL>

<example donor tier="full">
- `/mental-map` — Socratic Q&A that pushes your understanding frontier forward.
- `/walkthrough` — paves the road already walked: prose narration of the current map's nodes.
- `/flow-map` / `/miro-diagram` — visual: grow a runtime-flow diagram step-by-step / one-shot diagrams.
- `/prototype` — a throwaway spike answering ONE design question; the verdict lands on the issue, the code never merges.
</example>

## Codebase health

<!-- guidance: three rungs — ambient (the surface-dont-chase doctrine one-liner, routing per
     the profile's smell_routing), structural (improve-codebase-architecture if installed),
     working-diff (the built-ins: code-review / simplify / verify). -->

<FILL>

<example donor tier="full">
- Ambient smell while working → surface, don't chase (rule): one line, offer to log per the profile's routing.
- Structural drift worth a real diagnosis → `/improve-codebase-architecture <area>`.
- Working-diff quality → `/code-review` (bugs) or `/simplify`; `/verify` to prove a change works before committing.
</example>

## Vocabulary & doctrine underneath

<!-- guidance: the load-bearing layers the human rarely types — design-vocabulary skill,
     implementation lenses (the generated composite coder lens by name), the doctrine index,
     reviewer persona. One line each: what it is + who loads it. -->

<FILL>

<example donor tier="full">
- `/codebase-design` — deep-module vocabulary; `/tdd` and `/improve-codebase-architecture` speak it.
- `/tdd` + `/vsa-tdd` — the implementation lenses. Coders load these; you rarely type them.
- `.claude/rules/00-doctrine-index.md` — the load-on-demand doctrine table.
</example>

<!-- guidance: OPTIONAL extra sections the donor grew that setup adds only when the backing
     skills exist — e.g. "Docs & wire contract" (glossary skill + postman-style contract
     sync, stating the repo's doc_appetite), "Mid-work utilities" (merge-conflict skill). -->

## Never type these

<!-- guidance: only when the autonomous tier is installed — the orchestrator-internal skills
     and agents (afk-*), with the pointer to their human-driven equivalents. Omit the whole
     section on the light tier. -->

<FILL>

<example donor tier="full">
Orchestrator internals, dispatched by `/ship-feature` / `/ship-issue`: `afk-execute-issue`, `afk-address-pr`, `afk-review-pr`, `afk-merge-pr`, `afk-concede-thread`, and the `afk-coder` / `afk-reviewer` agents. Use the human-driven equivalents in the main flow.
</example>
