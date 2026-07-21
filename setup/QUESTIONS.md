# The Interview — questions that rebuild the donor stack from zero

Design method: **invert the donor.** Every repo-specific rule in the donor stack is the answer to a generic question nobody asked out loud at the time — it was learned by incident instead. This catalog asks those questions on purpose, on day 1. Each entry: the question → what it detects vs asks → what it materializes. Donor answers shown as the worked example; the pilot app is expected to answer differently — that difference is what proves the genericization.

Interview discipline (from the grilling doctrine): **facts are detected** from the repo and stated for confirmation; only **decisions and off-repo knowledge** are asked. Target: ~5 confirmations, ~5 real questions — never a 20-question wizard. Ask one at a time.

## Ecosystem shape (the questions that were learned by expensive incident)

**Q1 — Chassis.** "Are there base, chassis-like libraries this app is built upon, which must be referenced for a complete picture of the app's runtime behavior — request pipeline, transactions, auth, tenancy, error mapping? Where does their source live?"
→ *yes:* instantiate `templates/chassis-foundation` with the real paths: what the chassis owns, the division of labour (what app code must still guard), the reviewer red flags, the "read the chassis before asserting runtime behavior" trigger list.
→ *Donor: yes — `Core.Api.Chassis` + `Core.Api.Chassis.SqlSpanner`; two production incidents from ignoring this. Pilot: expected no → template not instantiated.*

**Q2 — Deployment reality.** "Does the path from merged code to a running system leave this repo? Where does deployment actually happen — GitOps repos, gateways, IaC?"
→ *yes:* instantiate `templates/deploy-infra`: the pipeline diagram, the sibling-repo pointers, the "a route the gateway doesn't know is a dead endpoint" trigger.
→ *Donor: CI ends at Artifactory; deploy = image-bump PR in `platform-gitops` + ArgoCD; Ocelot gateway routes must match app prefixes.*

**Q3 — External contract truth.** "Are any of this app's public routes/contracts ported from, or consumed by, systems whose behavior is the real source of truth? Where does that truth live?"
→ *yes:* install `port-from-consumer-contract` doctrine + overlay pointers to the oracle/consumer.
→ *Donor: yes — an upstream vendor API client is the wire-contract authority; a whole PRD (#261) existed to fix the damage from porting against the `.proto` instead.*

**Q4 — Live-environment safety.** "Can agents in this repo reach live/shared databases or environments? Which must be treated read-only, and what ceremony applies to schema/data changes?"
→ hard safety constraints at the top of the overlay (these are the rules that must never be lost in a compaction).
→ *Donor: live Spanner `shared-app-db` is READ-ONLY; Flyway promotes to live → seeds must be idempotent; editing an old migration = drop/recreate a DB → always ask.*

## Stack & architecture (mostly detected, confirmed, then installed)

**Q5 — Stack.** Detected (csproj/package.json/pyproject). Confirms → installs the language doctrine core (`doctrine/dotnet-backend`, …) + overlay `check_commands`.

**Q6 — Architecture shape.** Detected (a `Features/` VSA signature, layered folders, …), confirmed. → installs the architecture doctrine + **generates the composite coder lens** (the repo's `vsa-tdd` analog: a manifest of which doctrine files every coder run loads).

**Q7 — Persistence.** "What database; who owns schema migrations; what substitutes for it locally and in tests?"
→ database doctrine + overlay facts (migration owner, emulator/stand-in, seeding rules).
→ *Donor: Spanner + EF Core, Flyway owns migrations, emulator locally — and the scar: EF migrate/seed is a dead end (stale migrations + row-ownership interceptor).*

**Q8 — Legacy oracle (brownfield).** "Is there a reference implementation new code must behaviorally match? How is parity proven — golden masters, truth tables, live probing?"
→ parity constraints + the parity-testing doctrine.
→ *Donor: v0 Python oracle; characterization tests; "green truth-table ≠ proven parity — probe the live oracle." Pilot: expected none.*

## Process appetite (genuine decisions — always asked, never assumed)

**Q9 — Tracker + orchestration tier.** "GitHub issues? Do you want the full PRD pipeline (write-a-prd → prd-to-issues → expand/execute/review/merge + autonomous ship-feature/ship-issue), or the light tier (log-issue + ship-issue only)?"
→ installs the chosen pipeline tier; the router is generated to match.

**Q10 — Documentation locations.** The doc philosophy is NOT a choice — the base ships lean-only: the durable canon is **glossary + ADRs + architecture/concept map**, everything else is a temporary artifact living on its work item (see `doctrine/documentation-first.md`). The question is just: "Where do (or should) the three canon artifacts live? Is there a living build-status map, or should setup seed one?"
→ records the three paths in the profile; seeds missing canon files.
→ *Donor: historically ran a fuller matrix (feature READMEs, flow docs) and has since slimmed toward the canon — the base never inherits the fuller matrix.*

**Q11 — Test strategy boundaries.** "How are endpoints tested; is anything deliberately out of test scope (auth e2e, external services)?"
→ overlay testing section.
→ *Donor: controller-as-unit, no HTTP-auth e2e (identity via IRequestContext); HTTP e2e deferred.*

**Q12 — Merge gates.** "What gates a merge — CI, local checks, review policy?"
→ overlay facts + reviewer expectations.
→ *Donor: local `dotnet test` is the gate; CI doesn't gate .NET (deliberate, deferred) — an agent re-flagging this as a blocker is noise.*

**Q13 — LLM surface.** "Does this app construct prompts / call models?" → *yes:* install `llm-prompt-craft` doctrine (prompt-visibility gate).

**Q14 — Wire-contract tooling.** "How do humans exercise the API — Postman? Is the collection repo-owned and synced?" → *yes:* install the postman-collection skill pattern (repo-owned JSON as source of truth).

**Q15 — Domain language.** "Is there an existing glossary? One bounded context or several?" → seeds `UBIQUITOUS_LANGUAGE.md` conventions + the grill-with-docs routing.

## What the interview cannot do — and must say so

Day-1 setup produces the **skeleton**, not the finished stack. The donor's most valuable rules are scar tissue from incidents no interview can foresee (the CRLF sed disaster, the tautological-fixture bug, the tenancy false-alarm). Those accrete over time in the overlay under memory-style rules (edit in place, why + evidence pointer, delete what's wrong) and flow back to base via `/skill-sync`. Setup's closing message states this explicitly so nobody mistakes the skeleton for the skin.
