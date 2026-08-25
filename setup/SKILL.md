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

- **Skills** (verbatim copy from `skills/`): the tier-0 set, filtered by the interview — pipeline tier (Q9) decides which orchestration skills; doc appetite (Q10) decides the doc-skills variant; LLM surface (Q13), wire-contract tooling (Q14) gate their skills. `_shared/` installs whenever any review or merge skill does — `review-protocol.md` is the verdict contract they all read — and `fix-review-identity` installs alongside them, since it is the repair path the run reports name. If Q12b chose `app`, walk `setup/github-app.md` and verify the token command before writing `review_identity: app`; an unverified command silently falls the repo back to `self`.
- **Doctrine** (verbatim copy from `doctrine/`): always — `fowler-smell-baseline.md`, `writing-skills.md` + glossary, `documentation-first.md`, `surface-dont-chase.md`, `how-to-explain.md`. Conditionally, from the interview — **one backend language core** (`backend-*.md`, Q5), **one backend architecture core** (`arch-*.md`, Q6), `arch-frontend.md` **+ one framework core** (`frontend-*.md`, Q6b), `relational-persistence.md` (Q7), `llm-prompt-craft.md` (Q13). `AXES.md` installs whenever any `arch-*` or `backend-*` core does — it is the contract that says which core wins on placement vs idiom. **Never author a missing core in the consuming repo**; record the gap in the doctrine index and raise it via `/skill-sync`.
- **Templates** (instantiated — the ONE place prose is filled in, from interview answers): `project-profile.md` always; `chassis-foundation.md` if Q1 yes; `deploy-infra.md` if Q2 yes. (`claude-md.md` and `path-rule.md` are instantiated in step 4, since they are generated from what was actually installed.) Fill every `<FILL>` slot from the interview; delete the marked EXAMPLE blocks after using them as the pattern.

## 4. Generate (manifests only)

Six artifacts, all routers, file lists, or config — never prose. The last two are what make the others reachable: **`.claude/doctrine/` is not auto-loaded by Claude Code**, so without them the profile and doctrine only enter context when a skill happens to name them, and ad-hoc work runs with none of it.

- **The composite coder lens** (the repo's `vsa-tdd` analog): a manifest skill listing exactly which installed files every coder run loads. **Record its name in the profile's `coder_lens` key as you generate it** — `execute-issue`, `afk-execute-issue` and the `afk-coder` agent all resolve "the repo's composite coder lens" by reading that key, so a lens the profile does not name is a lens the pipeline cannot find.
- **The doctrine index**: the load-on-demand table over what was actually installed.
- **The router** (`ask-<name>` per the user's preference): from `templates/router.md`, filled with the actually-installed skill set and the pipeline tier's real flow. A skill the router mentions must exist; a skill it omits must be orchestrator-internal.
- **`CLAUDE.md`** from `templates/claude-md.md` — the only file loaded into every session. Keep it under ~50 lines: pointers to the profile and index, the canon, the check commands, and the two-to-four constraints that are catastrophic *and* not discoverable from the code. Oversized always-on context costs tokens every session and reduces adherence, so this is a budget, not a dumping ground.
- **`.claude/settings.local.json`** — the permission allowlist the pipeline's own preflight requires. `/ship-feature` and `/ship-issue` **fail-fast at Step 0b** if it is missing or short an entry, so a repo set up without it cannot run the autonomous lane at all. Generate it from what was actually installed: `Bash(gh:*)`; the git verbs (`status`, `checkout`, `fetch`, `pull`, `push`, `merge`, `rebase`, `worktree`, `rev-parse`, `branch`, `add`, `commit`, `diff`, `log`); **one entry per binary named in the profile's `check_commands`**; and `Read(./**)`, `Write(./**)`, `Edit(./**)`. Skip this only when the pipeline tier is not installed.
- **`.claude/rules/*.md`** from `templates/path-rule.md` — one per row of the doctrine index's path-routing table. **Every rule MUST carry `paths:` frontmatter**; a rule without it loads in every session forever, which is how a rules directory silently becomes thousands of lines of always-on context. Each rule is a loader — the governing doctrine plus its few most-broken imperatives, never a copy. Verify every glob matches real files before finishing: a rule matching nothing looks like coverage and provides none.

## 5. Record and close

- Verify the loading path end to end: `CLAUDE.md` exists and is under ~50 lines; every `.claude/rules/*.md` has `paths:`; every glob matches at least one real file; every doctrine file is reachable from a rule, the index, or `CLAUDE.md`.
- Write `base_version` (the base repo's current commit SHA) into the profile's YAML.
- State the closing expectation verbatim: **"This is the skeleton, not the skin. The most valuable rules are scars from incidents no interview can foresee — they accrete in `project-profile.md` under its editing rules (edit in place, why + evidence pointer, delete what's wrong) and flow back to the base library via `/skill-sync`."**
