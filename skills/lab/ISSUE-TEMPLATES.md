# Lab issue templates

Two issues per lab. They are coupled in one direction: **the purpose issue's eval contract is the instrument issue's acceptance criteria.** An instrument issue that says "build a harness" instead of "build the thing that produces this measurement" will be gilded or under-built, and the gap only shows up once the meter is running.

Titles carry the convention:

| Issue | Title |
| --- | --- |
| Purpose | `(LAB research) <the question>` |
| Instrument | `Build <Name>Lab <what it does> for the #<purpose-n> campaign` |
| Promotion | `(PRD seed) <what goes live>` |

---

## Purpose issue

```markdown
# (LAB research) <the question>

## Prior

The observation that provoked this, with whatever numbers already exist and where
they came from. If there was no number before this issue, the free measurement that
produced one — with its query or command, so it re-runs at zero cost.

## Question

One question, phrased so it can come out either way.

## Prediction

What the operator expects to find, recorded before anything runs.

## Eval contract

**Specimens** — what the campaign runs against: how the set is drawn, how it's
sampled (a copy of production is not a sampling strategy), what provenance each
carries, and when it was frozen. A frozen set is comparable across runs; a fresh
set is realistic. Say which this is, and what re-freezing would oblige.

**Measurement** — what is computed per specimen and how it's reported. Fractions
with n, stratified where the population is mixed.

**Decision rule** — what number means what verdict, written before the run:

| Result | Verdict |
| --- | --- |
| <threshold> | promote |
| <threshold> | <partial / hybrid outcome> |
| <threshold> | kill |
| nothing clears | <the branch where the answer is "neither"> |

## Arms

What is compared against what. The **control arm** is what happens today, run over
the same specimens on the same day — name how it is reproduced. Where judgment
decides an outcome, state the blinding protocol.

## Meter

- **Pilot:** ≤ N units, to establish real per-unit cost and behaviour
- **Go/no-go:** operator authorizes the full campaign against observed pilot spend
- **Ceiling:** N units total, hard. The campaign is sized to fit it.

## Instruments

Built by #<instrument-n>. (Or: already exist — <what, from which lab>.)

## Out of scope

- No production code changes. Anything that ships is a follow-up that consumes the
  verdict.
- <whatever else this lab deliberately isn't answering>

## Execution model

Interactive: Lab Brain + operator. **This issue is not autonomously shippable** —
it is a notebook, not a work item, and the campaign is judgment the orchestrator
cannot exercise.

## Disposition

Which exit each verdict branch takes: the PRD seed to file, the constraint to
record on kill, or what parking would leave open.
```

---

## Instrument issue

```markdown
# Build <Name>Lab <what it does> for the #<purpose-n> campaign

## What it must produce

Lifted from #<purpose-n>'s eval contract — the report, its shape, and the numbers
in it. Deterministic where it can be; the judgment layer stays with the operator.

## Isolation

- Where specimen data comes from, and how it is scrubbed on the way in
- Credentials that **cannot** write production — a permission that doesn't exist,
  not a rule to be followed (per the profile's live-data safety constraints)
- How lab config, fixtures and dependencies are kept out of the production build
  and test suite — labs contaminate outward

## Recording

Every call to a paid, slow, or nondeterministic outside system is recorded and
keyed, so re-analysis after the campaign costs nothing. This is what lets a
criterion thought of afterwards be re-scored over the whole specimen set for free.

## Fidelity statement — required at close-out

Post as a closing comment before the issue closes. Five-ish bullets, each naming in
**production terms** what this instrument reproduces, cited to the production code
it mirrors:

> - Population = <predicate>, mirroring `<File>:<line>`
> - <Stage> = <behaviour>; production additionally does <X> via <mechanism>
> - Specimen set = frozen <date>, excludes <what>
> - Timeouts/limits = <values>; production uses <values>

The Lab Brain checks this against production source, not against #<purpose-n>.
State the divergences you already know about — an accepted divergence recorded here
is cheap, an unrecorded one corrupts a campaign.

## Definition of done

- [ ] Emits the report shape #<purpose-n> requires, from fixtures — no real data
- [ ] Golden-file tested on those fixtures
- [ ] Recording/replay works: a recorded call replays with zero outbound traffic
- [ ] Fidelity statement posted
- [ ] No production code changed; no real specimens touched; nothing spent
```
