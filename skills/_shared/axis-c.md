# Shared: Axis C modes

Included by `/review-pr`, `/afk-review-pr`, `/merge-pr`, `/afk-merge-pr`, the `afk-reviewer` agent, and both `/ship-*` orchestrators. Defines how much authority CI check-runs have over a review verdict and a merge.

Axis C is the third review axis: the state of CI on the exact commit under review. Whether it *blocks* is a per-repo setting, because a repo standing CI up needs the signal long before the signal is trustworthy enough to gate on.

## The three modes

Read `axis_c` from `.claude/doctrine/project-profile.md`. **If the key is absent, infer from `ci`:** no CI configured ⇒ `off`; CI configured ⇒ `enforcing`. Repos that predate this key keep behaving as they did. Then narrow it to the PR's base — see *Resolve the mode per PR* below.

| `axis_c` | Check-runs are read | Findings raised as | Blocks `APPROVE` | Blocks merge |
|---|---|---|---|---|
| `off` | no | — | no | no |
| `advisory` | yes | 🟡 suggestion | no | no |
| `enforcing` | yes | 🔴 blocker | yes | yes |

**`off`** — do not query check-runs, do not wait on them, do not flag their absence. Emit `axis_c: "off"`. Use when the repo genuinely has no CI, or when CI exists but is entirely out of scope for review.

**`advisory`** — the transition state, and the point of this file. Run the full Axis-C procedure: pin the reviewed SHA, poll to a conclusion, classify, extract the specific failure. Report it in the review body and in the run report. But raise failures as 🟡, never 🔴; never withhold `APPROVE` for it; never block a merge on it. A red or flaky CI cannot stall the pipeline, while the machinery stays exercised and observable rather than sitting dormant until someone trusts it enough to switch on.

**`enforcing`** — full authority. A red check is a 🔴 blocker, `APPROVE` requires an observed green, a pending run is never a pass, and Axis-C findings are **never conceded** — a red suite is a fact, not an opinion.

## Resolve the mode per PR, from its base

`axis_c` is the mode for PRs that CI actually runs on. Many workflows filter by **base** branch (`pull_request: branches: [<default-branch>]`), so a PR on any other base — a PRD base branch, a release branch — gets no check-runs at all, ever. Read the profile's `ci_bases` (the base branches CI runs on; absent ⇒ every base) and resolve the mode **per PR** from its `baseRefName`:

- `baseRefName` matches `ci_bases` ⇒ the profile's `axis_c`.
- Anything else ⇒ **`off`**, with `off`'s full semantics: do not query, do not poll, do not flag the absence.

Resolve this before polling. Skipping it costs twice: the reviewer polls a full timeout for a run that cannot exist, and then meets an empty check-run set — where "all check-runs `success`" is **vacuously true**. **An empty set on a base CI does not run on is `off`. It is never `pass`, and it is never `unknown`.**

> **Donor scar:** CI was narrowed to default-branch PRs to save Actions minutes. Without a per-base resolution, every child-PR review round would have burned the 15-minute poll, then been free to read zero runs as all-green — exactly the lie the next section exists to prevent.

## Reading the evidence

**An empty set on a base CI *does* run on is a real signal — find out which one.** Not `pass`, and not yet a CI outage:

- **The PR conflicts with its base.** A `pull_request` workflow runs against the merge commit, and GitHub cannot build one for a conflicting PR — so no run is queued at all. `gh pr checks` says "no checks reported": that is **absent**, not pending. Check `mergeable`; merge the base in before concluding CI is broken or that the gate can be skipped. (Donor: three pushes to a conflicting PR silently produced zero runs and read as an outage.)
- **Runs sit `queued` indefinitely.** Different signature, different cause: no runner is picking them up (self-hosted runners down, a concurrency group stuck). That is an infrastructure fact to report, not a code finding.

Either way the result is `unknown` under `enforcing`, and the report says which of the two it was.

**Read the job's duration before calling a red a regression.** A suite has a healthy duration band. A red far *slower* than the band smells of resource contention — timing-sensitive tests losing a CPU race; a mass failure far *faster* than the band smells of infrastructure — a dependency that died mid-run. Neither is a code defect, and fixing code for one burns review rounds on nothing; because Axis-C findings are never conceded, that is expensive. **Re-run the failed jobs once (`gh run rerun <run-id> --failed`), then believe it.** A red that reproduces is real, whatever its duration. Report the first run, the re-run, and both durations in the Axis-C finding.

> **Donor scar:** the same commit's frontend job went red at 5m15s and green at 2m23s; a backend job failed 654 tests in 2m42s against ~3m20s healthy, then passed on an isolated re-run. Both were runner-side.

## The verdict rule, stated once

`APPROVE` requires no 🔴 findings, no unresolved skill-authored threads, **and** — only when `axis_c == "enforcing"` — an observed `pass`. In `advisory` and `off` the CI state never gates the verdict.

The structured return always carries the observed value (`pass` / `fail` / `unknown` / `superseded` / `off`) plus the mode, so the caller can tell "CI was green" from "CI was red but we weren't gating on it":

```json
"axis_c_mode": "off" | "advisory" | "enforcing",
"axis_c": "pass" | "fail" | "unknown" | "superseded" | "off",
"axis_c_failing_checks": [ ... ]
```

Never collapse these into one field. A run that reports `pass` because nothing was checked is a lie the next person will act on.

## Advisory must not become wallpaper

The failure mode of `advisory` is that a permanently-red CI stops being noticed. Two rules exist to prevent it:

1. **A red advisory check is still reported every time** — in the review body, and as its own line in the run report. Downgrading its severity is not permission to omit it.
2. **`advisory` is a transition state with an exit.** Record in the profile what has to be true to promote it — typically "green on N consecutive PRs with no known gaps in coverage". Review it; a repo that has been `advisory` for months either has a CI problem worth fixing or is ready to promote and hasn't.

Promotion is a one-word profile edit: `advisory` → `enforcing`. Nothing else changes, because the machinery was running the whole time. That is the entire reason for choosing a mode over a feature flag that skips the code path.

## Demotion is legitimate

Flipping `enforcing` → `advisory` because CI has become flaky is a reasonable, reversible call — far better than agents learning to force-merge past a red gate, which teaches them the gate is negotiable. Record why and what would restore it, the same as any other profile constraint.
