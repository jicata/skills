---
name: onboard
description: "Re-explain a passage for a technical colleague new to this project — same altitude, jargon taught not stripped. Cold-reader sibling of /wait-what."
disable-model-invocation: true
---

# Onboard

Re-explain the passage in `$ARGUMENTS` — usually text pasted back from something you just said — to a **cold reader**: a competent engineer on day one here. They read code fine. They have never met this project's nouns, its domain, or how work moves through it. Empty arguments mean your immediately preceding message.

Sibling to [`/wait-what`](../wait-what/SKILL.md), which re-pitches for a reader who already holds the glossary. The one difference is the glossary: `/wait-what` spends it, `/onboard` teaches it.

Repo facts this skill keys off — glossary path, chassis, consumers, live stores, deploy path, pipeline tier — live in the profile: `.claude/doctrine/project-profile.md`.

## The language

Write the controlled register of [`doctrine/how-to-explain.md`](../../doctrine/how-to-explain.md) ("Written briefings"): **ASD-STE100 Simplified Technical English**. Short sentences. One idea per sentence. Active voice, present tense.

- **Keep the project's real terms in the body.** Never swap in a plainer synonym, and never vary a term once used — one thing keeps one name throughout. The reader is acquiring this vocabulary, and the glossary tail is where it gets taught.
- **No analogies.** The reader is inexperienced here, not slow. An analogy is a second thing to hold, and it leaks at the point where it stops matching the mechanism.
- **State each rule once**, as a rule. Chains of hedges cost more than the certainty they buy.

## Steps

### 1. Mark the jargon

List every token in the passage a cold reader cannot hold. Sweep for all of these:

- domain words — the nouns of the problem this repo serves, as its glossary names them
- project nouns (chassis, slice, the gateway, the cleanup issue)
- acronyms of any origin (PRD, ADR, TDD, VSA, and the domain's own)
- bare identifiers — routes, file paths, class names, uuids, issue/PRD/ADR numbers
- **workflow assumptions**, the ones that read as plain English and aren't: "ship it", "the base branch", "reviewed", "conceded", "the PRD lane"

**Done when** every proper noun, acronym, identifier and number-reference in the passage is on the list, each marked *define it* (the reader will meet this word again) or *drop it* (incidental to the point being made).

### 2. Verify before you re-explain

Anything the passage asserts about code, a route, a consumer's contract, or live stored state gets re-checked at source before you restate it — the code at HEAD, a consumer at the ref the profile records, a live store through its pull command. A wrong explanation does more damage to a newcomer than to you — they have nothing to catch it with.

**Done when** every claim you are about to make traces to something you opened this session, or is stated as uncertain out loud.

### 3. Re-render

Write it fresh. Never gloss the original passage line by line — that keeps its shape, and its shape is the problem.

- **Follow the mechanism's own order**, not the order the passage happened to raise things in.
- **Say what the thing is for** in the opening line, in operational terms: what it decides, what it protects, what breaks without it.
- **Give the state honestly.** What is live, what is intended, what is half-built, what is a known sharp edge. A newcomer told the tidy version loses a day to the untidy one.
- **A concrete case only where an edge is counterintuitive** — stated in the system's own terms, no story around it.
- **Close on one line of net framing** they can carry.

### 4. Glossary tail

The *define it* terms from step 1, one line each, in first-appearance order. Give the project's own word and its meaning together — that word is the one they will hear in the next standup.

**Done when** the reader could return to the original passage unaided.

## Naming the ground they are standing on

A cold reader assumes the repo in front of them is the whole system. Read the profile and name each fact below **the moment the passage leans on it** — each one burns people who assumed otherwise. Name it with the profile's real values (paths, repo names), and skip any the profile says is `none`:

- **`chassis`** — runtime behaviour (transactions, auth, messaging, …) lives in the base chassis at those paths, not in this repo's code.
- **`consumer_repos`** — the public contract is owned jointly with the consumers listed there; this repo alone cannot say what a field means to its callers.
- **Deploy & environments** — where the profile points at an instantiated deploy-infra doctrine, deployment lives in the repos it names, not here.
- **`live_state_sources`** — some behaviour-shaping state lives in a live store, and the repo holds no copy of it.
- **`pipeline_tier`** — how work moves: PRD → child issues → one PR per issue → review → merge (`full`), or issue → PR → review → merge (`light`). A number with a `#` is usually a step in that flow.
- **`doc_appetite: lean`** — there is almost no prose documentation on purpose. Behaviour lives in the code and its tests; the glossary at `glossary` is the vocabulary.
