# The Interview — questions that rebuild the donor stack from zero

Design method: **invert the donor.** Every repo-specific rule in the donor stack is the answer to a generic question nobody asked out loud at the time — it was learned by incident instead. This catalog asks those questions on purpose, on day 1. Each entry: the question → what it detects vs asks → what it materializes. Donor answers shown as the worked example; the pilot app is expected to answer differently — that difference is what proves the genericization.

Interview discipline (from the grilling doctrine): **facts are detected** from the repo and stated for confirmation; only **decisions and off-repo knowledge** are asked. Target: ~5 confirmations, ~5 real questions — never a 20-question wizard. Ask one at a time.

## Ecosystem shape (the questions that were learned by expensive incident)

**Q1 — Chassis.** "Are there base, chassis-like libraries this app is built upon, which must be referenced for a complete picture of the app's runtime behavior — request pipeline, transactions, auth, tenancy, error mapping? Where does their source live?"
→ *yes:* instantiate `templates/chassis-foundation` with the real paths: what the chassis owns, the division of labour (what app code must still guard), the reviewer red flags, the "read the chassis before asserting runtime behavior" trigger list.
→ *Donor: yes — `Core.Api.Chassis` + `Core.Api.Chassis.SqlSpanner`; two production incidents from ignoring this. Pilot: expected no → template not instantiated.*

**Q2 — Deployment reality.** "Does the path from merged code to a running system leave this repo? Where does deployment actually happen — GitOps repos, gateways, IaC?"
→ *yes:* instantiate `templates/deploy-infra`: the pipeline diagram, the sibling-repo pointers, the "a route the gateway doesn't know is a dead endpoint" trigger.
→ follow-up: **"Which service of the same stack already ships through this pipeline and works?"** That is the reference sibling the template's *Conform to the fleet* section diffs against. None yet is a valid answer — record it, so the first deploy is known to be the one without a reference.
→ *Donor: CI ends at Artifactory; deploy = image-bump PR in `platform-gitops` + ArgoCD; Ocelot gateway routes must match app prefixes.*

**Q3 — External contract truth.** "Does another system consume this app's API — or is any public route ported from a system whose behavior is the real source of truth? Where does that consumer's source live, and which branch is its integration ref?"
→ *yes:* install `doctrine/port-from-consumer-contract.md`; record each consumer in the profile's `consumer_repos` key (local path + integration ref + probe order — client route constants first, then the DTOs it serializes, then its validators, then its UI); inline the trip-wire into the generated `CLAUDE.md` as one line ("before proposing any route, shape, or status contract, read the consumer at its integration ref — `.claude/doctrine/port-from-consumer-contract.md`"). The CLAUDE.md line is not optional: the rule fires at PRD/grilling time, when no file is open, so a path-scoped rule alone never loads in time. Optionally add a `paths:` rule over the repo's controllers/DTOs for the code-time half.
→ *no consumer repo reachable yet:* still install it if the app has a public surface — "no consumer client exists yet" is a result the doctrine asks you to record, not a reason to skip it.
→ *a consumer's frontend, built outside this repo, calls this API:* ask where the FE-handoff contracts should live and record `fe_contract_home` — `/write-a-prd` then hands that frontend its contract at PRD time instead of letting it learn shapes from merged code.
→ *Donor: yes — one consumer app's API client + validators + admin UI is the wire-contract authority. Three incidents: a port frozen against the internal `.proto` (corrective PRD), a greenfield admin lane shaped without looking (three issues frozen, reversal PRD), and a tier-1-looking consumer check that was stale at every line.*

**Q4 — Live-environment safety.** "Can agents in this repo reach live/shared databases or environments? Which must be treated read-only, and what ceremony applies to schema/data changes?"
→ hard safety constraints at the top of the overlay (these are the rules that must never be lost in a compaction).
→ *Donor: live Spanner `shared-app-db` is READ-ONLY; Flyway promotes to live → seeds must be idempotent; editing an old migration = drop/recreate a DB → always ask.*

**Q4b — Live mutable state.** "Does behaviour-shaping state live outside the repo in a store agents can read with one command — prompt instructions on a model gateway, feature-flag rules, remote config? What is the read-only pull command, and which environment does it read?"
→ *yes:* install `doctrine/pull-live-state-first.md`; record each store in the profile's `live_state_sources` key (what it holds, the pull command, the environment it reads); inline its one-line form into `CLAUDE.md` — the trigger is a question ("what does the store say for X?"), not a file, so no `paths:` rule can carry it. If the repo already holds a transcription of the store (a `docs/prompts/` mirror, a fixture of the flag rules), say so now: it is a deletion candidate, and the first pull will likely show it stale.
→ *no pull command exists yet:* recommend writing one before anything else — without it every agent reasons from whatever copy is nearest.
→ *Donor: stored prompt instructions on an AI gateway, pulled by a committed read-only script. An audit found half the committed transcriptions stale — one 31 lines behind, one naming no instruction id — and the mirror directory was deleted.*

## Stack & architecture (mostly detected, confirmed, then installed)

**Q5 — Backend language core.** Detected (csproj / pyproject / package.json / go.mod). Confirmed, then → installs **one** `doctrine/backend-*.md` core + overlay `check_commands`.
→ *Menu:* `backend-dotnet.md`, `backend-python.md`. A detected language with no core is a **base-library gap**, not a repo problem: install none, record the gap in the generated doctrine index, and raise it via `/skill-sync`. Never author a language core inside the consuming repo — see [`doctrine/AXES.md`](../doctrine/AXES.md).

**Q6 — Backend architecture core.** Detected (a `Features/` slice signature; `domain/`+`application/`+`infrastructure/` rings; flat layered folders), **confirmed as a decision, not just a reading** — a greenfield repo is choosing, not being classified. → installs **one** `doctrine/arch-*.md` core + **generates the composite coder lens** (a manifest of which doctrine files every coder run loads).
→ *Menu:* `arch-vsa.md` (organize by feature), `arch-layered.md` (horizontal layers, dependencies downward, no ports), `arch-clean.md` (rings, dependencies inward, one entry point per use case), `arch-onion.md` (rings, dependencies inward, explicit domain-services ring).
→ **`arch-layered` is the default for a small app with one transport and one store, and choosing it is not a failure to do Clean.** The discriminator is the *dependency direction*, not the folder count: layers with no ports, where business logic imports the data layer, is `arch-layered` however many rings the diagram draws. Ports and inward dependencies mean `arch-clean`/`arch-onion`. The axes are independent — any architecture core composes with any language core, which is the point of [`doctrine/AXES.md`](../doctrine/AXES.md). Ask which, don't infer it from the language.
→ A **hybrid** (e.g. slices that each hold Clean rings) is legitimate: install the outer architecture's core and record the inner discipline as an ADR, per the cores' *Relationship to* sections.

**Q6b — Frontend surface.** Detected (a `src/pages/` or `src/components/` tree, a framework + component library in `package.json`), confirmed. → installs `doctrine/arch-frontend.md` (structure, framework-neutral) **plus exactly one** `doctrine/frontend-*.md` framework core — `frontend-react.md`, `frontend-vue.md` — + overlay facts (component library, server-state cache, design-handoff pipeline if any).
→ Same gap rule as Q5: a detected framework with no core means install `arch-frontend.md` alone and log the gap.
→ *Donor: React + query cache + MUI, with a design-artifact handoff pipeline. Backend-only repos skip this entirely.*

**Q7 — Persistence.** "What database; who owns schema migrations; what substitutes for it locally and in tests?"
→ installs `doctrine/relational-persistence` + overlay facts (canonical store, migration owner, emulator/stand-in, seeding rules).
→ *Donor: Spanner + EF Core, Flyway owns migrations, emulator locally — and the scar: EF migrate/seed is a dead end (stale migrations + row-ownership interceptor).*

**Q8 — Legacy oracle (brownfield).** "Is there a reference implementation new code must behaviorally match? How is parity proven — golden masters, truth tables, live probing?"
→ parity constraints + the parity-testing doctrine.
→ *Donor: v0 Python oracle; characterization tests; "green truth-table ≠ proven parity — probe the live oracle." Pilot: expected none.*

## Process appetite (genuine decisions — always asked, never assumed)

**Q9 — Tracker + orchestration tier.** "GitHub issues? Do you want the full PRD pipeline (write-a-prd → prd-to-issues → expand/execute/review/merge + autonomous ship-feature/ship-issue), or the light tier (log-issue + ship-issue only)?"

**Q9a — Is `origin` a repo you can actually write to?** Detected (`git remote -v`, plus `gh repo view --json viewerPermission`), stated for confirmation. The whole pipeline hardcodes `origin` and assumes push access; a repo cloned from a template, a vendor upstream, or someone else's project has none, and every issue-filing and PR-opening skill fails on first use.
→ *no write access:* fork it and adopt the **standard fork layout** — rename the source remote to `upstream` and make the fork `origin`. Renaming rather than adding a third remote is what matters: a bare `git push` then goes to the writable repo, so the safe path is the default instead of a rule everyone must remember. Record the fork as `tracker` and add a profile constraint that `upstream` is never written to.
→ **GitHub disables Issues on a new fork by default.** Enable them (`gh repo edit <fork> --enable-issues`) *during setup*, or the first `gh issue create` fails and the failure looks like a permissions bug rather than a settings one.
→ Also resolve and record the **default branch** (`gh repo view --json defaultBranchRef`). The ship-* skills write `master` throughout and substitute the real branch; a repo defaulting to `main` needs that substitution to be explicit rather than assumed.
→ installs the chosen pipeline tier; the router is generated to match.

**Q9b — Local config in worktrees.** Detected, when the pipeline is installed: run `git clean -ndX` and look for ignored files the app or its tooling reads at runtime — `.env`, key/credential files, local settings overlays. State what you found. The pipeline works in fresh `git worktree add` checkouts, which contain tracked files only, so each of those is missing there and fails like a code bug.
→ found runtime files → `worktree_carry: ignored` (recommended — a secret added later is carried without anyone listing it), plus `worktree_carry_exclude` for any bulky generated output the built-in list misses; or an explicit path list if the ignored set is mostly large local state.
→ nothing runtime-relevant → omit the key.
→ *Donor: `ignored` — a sync-tool key, cloud credentials and a local settings overlay, after two children of one PRD logged failed publishes for a key the worktree did not have.*

**Q10 — Documentation locations.** The doc philosophy is NOT a choice — the base ships lean-only: the durable canon is **glossary + ADRs + architecture/concept map**, everything else is a temporary artifact living on its work item (see `doctrine/documentation-first.md`). The question is just: "Where do (or should) the three canon artifacts live? Is there a living build-status map, or should setup seed one?"
→ records the three paths in the profile; seeds missing canon files.
→ *Donor: historically ran a fuller matrix (feature READMEs, flow docs) and has since slimmed toward the canon — the base never inherits the fuller matrix.*

**Q11 — Test strategy boundaries.** "How are endpoints tested; is anything deliberately out of test scope (auth e2e, external services)?"
→ overlay testing section.
→ *Donor: controller-as-unit, no HTTP-auth e2e (identity via IRequestContext); HTTP e2e deferred.*

**Q12 — Merge gates.** "What gates a merge — CI, local checks, review policy?" If CI exists, follow up: **"is it trustworthy enough to block a merge yet, or still being stood up?"**
→ overlay facts + reviewer expectations + `axis_c` (`off` / `advisory` / `enforcing`, per `skills/_shared/axis-c.md`). A repo mid-CI-rollout wants `advisory`: the machinery runs and reports, but a flaky suite cannot stall the pipeline. Record what would promote it to `enforcing`, or it silently becomes permanent.
→ *Donor: local `dotnet test` is the gate; CI doesn't gate .NET (deliberate, deferred) — an agent re-flagging this as a blocker is noise.*

**Q12b — Review identity.** **Ask this whenever the pipeline is installed, and recommend `app`.** "Reviews posting from your own account can only ever be COMMENT — GitHub rejects APPROVE and REQUEST_CHANGES from a PR's own author, so the verdict never shows up as a real decision. I can set up a GitHub App so reviews post natively; it's two browser clicks via `setup/create-review-app.js`. Do that now, or stay on comment-only?"
→ *yes (recommended):* run `setup/create-review-app.js`, walk `setup/github-app.md` §4–5, **verify with §5 before writing the profile** — then record `review_identity: app` + `review_app_token_cmd`.
→ *no / deferred / can't install Apps here:* omit both keys. The absent-key default is `self` and the gate is fully functional under it — this is a real choice, not a degraded one.
→ Either way the binding verdict is the review-body marker, per `skills/_shared/review-protocol.md`. The identity only decides whether GitHub *also* records it natively.
→ **Recommend, never force.** Org repos frequently restrict App installation to owners; a repo with human reviewers may not want a bot approving at all; and `app` mode adds a private key to manage. A "no" here costs nothing but the audit trail.
→ *Donor: `self` — 400 PRs, every `reviewDecision` null, every review `COMMENTED`.*

**Q12c — Production merge disposition.** Ask whenever the pipeline is installed. Detect first: does a merge to the default branch fire anything — a release workflow, a deploy, an image publish? State what you found, then: "When an autonomous run finishes, should it merge to `<default-branch>` itself, stop at an approved PR for you to test, or ask each time?"
→ `ship_merge_default: merge | gate | ask` (omit for `ask`). A per-run `--merge` / `--no-merge` flag always overrides it.
→ Recommend `gate` when a default-branch merge is a release — the human tests the integrated change before it ships, and `--merge` on a re-invoke finalizes. Recommend `merge` when the default branch releases nothing on its own.
→ *Donor: `ask` with gating as the non-interactive default — release-please cuts a release on every merge to master.*
→ Same detection, second fact: if the release tooling derives versions or changelogs from commit subjects (release-please, semantic-release, a Conventional Commits `commit-msg` hook), record `pr_title_convention: conventional` for confirmation — squash-merged PR titles become those subjects, and a non-conventional one is silently dropped from the release. Detected, not asked.

**Q13 — LLM surface.** "Does this app construct prompts / call models?" → *yes:* install `llm-prompt-craft` doctrine (prompt-visibility gate).

**Q14 — Wire-contract tooling.** "How do humans exercise the API — Postman? Is the collection repo-owned and synced?" → *yes:* install the postman-collection skill pattern (repo-owned JSON as source of truth).

**Q15 — Domain language.** "Is there an existing glossary? One bounded context or several?" → seeds `UBIQUITOUS_LANGUAGE.md` conventions + the grill-with-docs routing.

## What the interview cannot do — and must say so

Day-1 setup produces the **skeleton**, not the finished stack. The donor's most valuable rules are scar tissue from incidents no interview can foresee (the CRLF sed disaster, the tautological-fixture bug, the tenancy false-alarm). Those accrete over time in the overlay under memory-style rules (edit in place, why + evidence pointer, delete what's wrong) and flow back to base via `/skill-sync`. Setup's closing message states this explicitly so nobody mistakes the skeleton for the skin.
