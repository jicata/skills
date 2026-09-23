# Validation steps — the human-facing "how to test this" block

Every `/ship-feature` and `/ship-issue` run emits this block on **every** terminal path — the stop-at-the-production-gate path *and* the merged path. On a gated run it is the recipe the human follows to validate the change **before** the default-branch merge; on a merged run it is the spot-check **after**. It is the counterpart to the profile's `check_commands` and CI lanes: those are what the machine already proved; this is what a human still verifies by hand before the change reaches the default branch (which, in a trunk-based repo with release automation, is a release).

Not a registered skill (no `SKILL.md`). Referenced by relative path `.claude/skills/_afk-shared/validation-steps.md`.

## Where it goes

| Skill | Gated (stopped at the production gate) | Merged |
|---|---|---|
| `ship-feature` | Appended to the **base→default-branch PR body** (it travels with the PR the human tests) **and** the final report / PRD comment | Final report / PRD comment |
| `ship-issue` | Appended to the **PR body** **and** the final report / issue comment | Final report / issue comment |

Append to a PR body with `gh pr edit <pr> --body-file <scratch>` after reading the current body — preserve what is there. A re-run replaces its own earlier block (find it by its heading) rather than stacking a second one.

## What the orchestrator already has — assemble from these, do not invent

- **The issue / PRD body** → its `## Acceptance Criteria` section (or the equivalent spec section the run treated as the contract). Restate it **verbatim** as a checklist.
- **`gh pr diff <pr> --name-only`** → the changed files → the public surface touched (routes, commands, screens — located via the architecture/concept map the profile names) and whether persistence or the wire-contract artifact was touched.
- **The executable wire-contract artifact**, if the profile's External contracts section declares one (donor: a repo-owned Postman collection).
- **The issue's walkthrough comment** (`<!-- expand-issue:walkthrough -->`, authored by `/expand-issue` or `/log-issue`), if one exists.
- **What automation already proved** — the profile's `check_commands` fast lane, plus the CI result the run observed at the head SHA (Axis C, or the terminal integration-CI watch).
- **Any merge-time gate the run executed** (profile Merge gates) and where its evidence was posted.

## Template

```markdown
## ✅ How to validate this <feature|fix>

**Already proven (automated):** <fast lane green locally; CI <checks> green on `<head-SHA>` — or the actual state: red / pending / not observed>. Below is the *manual* validation automation can't cover.

**Check it out and run it:**
- Branch to test: `<base-branch>` — the whole integrated feature as one artifact (ship-feature) / `<pr-head-branch>` (ship-issue).
- Boot the app locally per the root `README.md` / the profile's local stand-in.

**Acceptance criteria to confirm by hand:**
- [ ] <AC 1 — verbatim from the issue/PRD>
- [ ] <AC 2 — verbatim>

**Surface that changed** (exercise each):
- `<route / command / screen>` — <one line: what a correct result looks like>

**Wire-contract artifact:** <how to run the declared artifact for this change, and what green means — or omit the line when the profile declares none>.

**Gate evidence:** <link to any merge-time gate's evidence comment, and what the human is being asked to decide from it — or omit>.

**Walkthrough:** <link to the walkthrough comment, or "none">.
```

## Assembly rules

- **Restate AC verbatim.** Do not paraphrase — the checklist *is* the contract the human signs off against.
- **No AC section?** Say so and fall back to the issue title as the single check. Never fabricate acceptance criteria.
- **Only list surface the diff actually touched.** A diff with no public surface (pure persistence, infra, tooling) gets `no public surface changed — validate via <the lane or gate that covers it>` instead of invented routes.
- **Report automation honestly.** "Already proven" states the observed CI state at the head SHA. A red, pending, or unobserved suite is written as such — never rounded up to green.
- **A gate that already ran is evidence, not a chore.** Point at its evidence and say what the human decides from it. Never ask the human to re-run a gate the orchestrator ran; if it reported fail or unverified, say that plainly instead of a checklist item.
- **Keep it scoped to this change.** A test recipe, not a feature tour — the human is validating a diff, not learning the product.
