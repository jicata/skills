# Shared: Report interrogation

Included by `/triage`, `/log-issue`, and `/diagnosing-bugs`. Defines the interview that runs **before** an investigation starts — the one that establishes what the reporter actually saw, as distinct from what they concluded.

A report is evidence, not a specification. It arrives compressed by the reporter into whatever framing made sense at the moment they noticed something, and that framing is usually a diagnosis they didn't know they were making. Investigate the framing and you confirm it; a search agent finds whatever you point it at.

## Quarantine the theory

Split every report into two piles the moment it lands.

**Observation** — what the reporter saw on a screen, in a log, in a row. Facts.

**Theory** — any claim about *why*. "The cache is stale", "the sync is broken", "while the backend churns away", "the tenant filter is wrong". These are inferences, and the reporter is rarely in a position to have verified them.

The theory goes into **quarantine**: recorded, labelled as the reporter's, and handed to the investigation as a **claim to falsify** — never as the premise it investigates from. Point the investigation at the *observation*.

A quarantined theory that survives falsification is a strong finding, and it costs one question to test. A theory absorbed as a premise is invisible, and every conclusion downstream inherits it.

## The redirect test

A question earns a place in this interview only when **the answer changes where the investigation looks**, or when only a human can see it.

Everything else waits until after the investigation, where the same question can be asked with real options attached and grounded in real code. Facts discoverable from the environment — does this page poll, does that column exist, what status values are defined — are looked up, not asked. Asking for them spends the reporter's patience on work the agent should do.

Expect two to four questions to clear the test. Reports vary; the count is an observation, not a target.

## The axes

Axes to reason over, not a script to recite. Generate the actual questions from the report in front of you, then run each through the redirect test.

| Axis | What it buys |
|---|---|
| **Observation vs theory** | Splits the report. The highest-yield single question, and the one that closes whole alternative issue shapes before any code is read. |
| **One concrete instance** | This record, this input, this output, expected what. Downstream explanation is required to walk one real value through the code; without this the values get invented. |
| **Scope** | Always or sometimes? One record or all? You or everyone? Distinguishes a deterministic logic defect from a data-shaped one from an environment or concurrency one — and decides whether a repro loop is needed at all. |
| **Last-known-good** | When did it last work, and what changed? Converts an open search into a bisect. Dead weight on a surface that never had the behaviour — skip it there. |
| **The job behind the ask** | For enhancement-shaped reports: what were you doing when this got in the way, and what do you do instead today? A feature request is a proposed solution to an unstated problem, and the workaround names the real requirement. |

## Unknowns are findings

"I don't know" is an answer and it routes.

Record it as an unknown and give it a destination — an investigation task, a measurement, a diagnosis loop. It never becomes a blank in the report and it never gets quietly filled in with the likely value.

An interview the reporter cannot answer at all is itself the finding: there is no instance and no evidence, so the investigation goes in wide and the evidence bar is met by building a **red** loop rather than by reading code. Proceed on that basis rather than blocking on answers that do not exist.

## Asking

One question at a time, in prose, waiting for the answer before the next. Batching several onto one screen is bewildering, including when they are independent facts.

Attach your recommended answer to each — the reporter corrects a guess far faster than they compose an answer from nothing, and a wrong guess is cheap.

## Completion criterion

Every claim in the report is sorted into observation or quarantined theory; each open axis is either answered, or recorded as an unknown with a destination. Then the investigation gets aimed.
