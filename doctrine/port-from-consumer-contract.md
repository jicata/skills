# Consumer-First Contracts — design the shape WITH the consumer, not for it

**Priority:** High — split across two tiers on purpose. The **trip-wire** is always-on: a one-line imperative in the generated `CLAUDE.md` ("before proposing any route, request/response shape, or status contract, read the consumer at a known ref — see this file"). It has to be always-on because it fires at **design time**, in a PRD or a grilling session, when no source file is open and no path-scoped rule can load. **This file** carries the rules and the reasoning and is on-trigger: the design skills and the doctrine index name it, and an optional path-scoped rule over the repo's route/DTO files catches the code-time half.

**Axis:** none — axis-independent. See [`AXES.md`](./AXES.md).

(Extracted 2026-09 from the donor stack's `port-from-consumer-contract.md` + its always-on `consumer-first-contract.md` trip-wire. Installed when the setup interview answers yes to Q3. Repo-specifics — which systems consume this app, where their source lives, the probe order inside each — live in the profile's `consumer_repos` key and its *External contracts* section.)

When you build, port, or change a **public surface** — an HTTP route, a DTO another system serializes, a status-code contract, a message schema with an external subscriber — the source of truth for the contract is **the real consumer and the edge layer that serves it.** Not the internal contract of the component you are replacing, and not what looks clean from this side of the seam. A shape this repo invents alone is a guess about someone else's system.

**This is not only a porting rule.** It applies with equal force to a brand-new surface. When there is nothing to port, the consumer's *current* code, its *validators*, and its *design artifacts* are the contract sources. "We're designing it fresh, so there's no consumer to consult" is the exact reasoning behind the second scar below.

## The trigger

Fires the moment you are about to **propose, design, or agree** a route, a verb, a request/response shape, a required/optional field, a status contract, or a resource decomposition (one fat payload vs. sub-resources) — **at PRD, grilling, or issue time, not at code time.** By the time the coder lens loads, the shape is agreed, the issues are filed, and the only remedy for a wrong shape is a reversal PRD.

## The rules

1. **Look before you shape.** Find what the consumer does *today* before proposing what it should do tomorrow. No shape is "obvious" — obviousness is what you feel when you have only modelled your own side.
2. **Port from the edge inward.** For a port, the first artifact is the consumer's actual on-the-wire calls — URL, verb, status, body, header/auth semantics — by `file:line` from the consumer repo *and* the edge layer being replaced. Never equate an internal contract (a `.proto`, an internal service signature, the DTOs of the hop being deleted) with the external one. If you collapse a layer, write down what it owned before deleting it from scope.
3. **Pin the resource by route constant + verb — never by name.** Folder, component, class, and router names collide across the seam. A consumer claim is only citable if it names the URL and the verb the client actually issues.
4. **A citation is not evidence — re-read every cited line at the moment you rely on it.** A `file:line` reference proves someone once read that line, not that it still says that. Whenever you consume a recorded citation — from a PRD, an issue, an ADR, a memory note, another agent — **open the file and match on content**; "the line number resolves" is not confirmation. Read the consumer at a **known ref** (e.g. `git show origin/<integration-branch>:<path>`), never the local working tree, which may sit on an unrelated feature branch. **Date every probe, and re-probe on reuse:** "probed <date>" copied forward into a new document is not a probe on that date.
5. **Record the evidence tier, honestly.** Every consumer claim carries one:
   - **Tier 1 — consumer code on the wire.** Route constant + verb + DTO properties, by `file:line` at a named ref.
   - **Tier 2 — runtime capture.** What a running consumer build actually puts on the wire. Outranks any document.
   - **Tier 3 — design artifact** (brief, mockup, design file). Often the only signal when no client exists yet. **Transcribe the implied shape into the spec with source + date; never merely link it** — a link rots silently, a dated transcription stays reviewable and yields a diff when the consumer later diverges. A contract built on tier 3 must be *visibly* weaker and earns an earlier conversation with the consumer's owners.
6. **"No consumer client exists yet" is a result, not a blank.** Write it down with the negative evidence that establishes it (the greps that returned nothing). It is load-bearing: it means you are defining cold and the design artifact is the only demand signal. Left blank, someone fills it with a guess. **"Already done" is a result too** — if the consumer has already moved, say so and shrink the work.
7. **Verify the envelope against an external oracle.** Contract tests pin routes, verbs, status codes, and field names against the consumer or a captured fixture — never the new implementation against itself. Self-referential HTTP tests are green on a wrong contract by construction.

## Why this exists — donor scars

> **Donor scar (ADF, 2026-06): the port that froze the wrong contract.** A rewrite treated the internal `.proto` of the service being deleted as "the contract" and asserted *"preserve the gRPC messages ⇒ external contract unchanged."* The real contract lived in the HTTP gateway being dropped and in the consumer's API client — neither was ever a porting source. The HTTP tests pinned the new service against itself, so CI was green on a public API that barely resembled what production called. A corrective PRD followed.

> **Donor scar (ADF, 2026-07): the greenfield surface designed without the consumer.** An admin lane was designed with resources created empty and children attached later as sub-resources. Nobody opened the consumer. It turned out the consumer treated that resource as **read-only** (no write client at all, inputs hardcoded disabled), and the "forbid empty" validator people half-remembered belonged to a *different* resource — reached through consumer code **named after** the first one. A name-matched lookup would have "confirmed" the wrong shape. Cost: three issues frozen mid-flight, a corrective PRD, hours of reversal.

> **Donor scar (ADF, 2026-08): the evidence format became the disguise.** A PRD's consumer check declared tier-1 evidence — real files, real line numbers, real DTO names — asserting the consumer "still speaks the old contract". **Every line was stale**: the consumer's integration branch had already migrated most of it. The section was inherited verbatim into a child issue, which specified a migration ~5/8 already done, and into a frontend contract doc. The slip: a grep hit at the cited `file:line` was taken as confirmation without reading the content. Rule 4 exists because rules 1–3 were followed *in form*. **The risk is highest when the citation looks best** — tier-1-shaped evidence disarms scrutiny.

The family resemblance is the point. Reasoning about another system from this repo alone — runtime from the app instead of the chassis, deploy from the app instead of the infra repos, contract from the producer instead of the consumer — survives review every time, because every reviewer reads the same one-sided sources. **Only opening the other repo breaks the tie.**

## Reviewer red flags

- A spec or issue proposing a request/response shape with **no `file:line` citation** to the consumer and no explicit "no consumer client exists yet."
- A shape justified by internal aesthetics — *"this is the RESTful way"*, *"this is cleaner"* — deciding an external contract.
- A consumer claim sourced from a **name match** rather than a route constant + verb.
- A consumer claim **inherited** from another document (PRD → issue, ADR → PRD) with no re-read at the point of reuse, or read from a local checkout instead of a known ref.
- A design artifact referenced only as a **link** — no transcription, no date.
- Resource decomposition settled before anyone read what the consumer's screen actually submits. When a spec says "per the mockup", open the mockup.
- "We preserved the internal messages, so the API is unchanged" — for a service with an external consumer.
- Contract tests asserting the new implementation against itself.
- A migration described as larger than it is, because nobody checked what the consumer already did.
