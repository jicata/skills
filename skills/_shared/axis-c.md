# Shared: Axis C modes

Included by `/review-pr`, `/afk-review-pr`, `/merge-pr`, `/afk-merge-pr`, the `afk-reviewer` agent, and both `/ship-*` orchestrators. Defines how much authority CI check-runs have over a review verdict and a merge.

Axis C is the third review axis: the state of CI on the exact commit under review. Whether it *blocks* is a per-repo setting, because a repo standing CI up needs the signal long before the signal is trustworthy enough to gate on.

## The three modes

Read `axis_c` from `.claude/doctrine/project-profile.md`. **If the key is absent, infer from `ci`:** no CI configured ⇒ `off`; CI configured ⇒ `enforcing`. Repos that predate this key keep behaving as they did.

| `axis_c` | Check-runs are read | Findings raised as | Blocks `APPROVE` | Blocks merge |
|---|---|---|---|---|
| `off` | no | — | no | no |
| `advisory` | yes | 🟡 suggestion | no | no |
| `enforcing` | yes | 🔴 blocker | yes | yes |

**`off`** — do not query check-runs, do not wait on them, do not flag their absence. Emit `axis_c: "off"`. Use when the repo genuinely has no CI, or when CI exists but is entirely out of scope for review.

**`advisory`** — the transition state, and the point of this file. Run the full Axis-C procedure: pin the reviewed SHA, poll to a conclusion, classify, extract the specific failure. Report it in the review body and in the run report. But raise failures as 🟡, never 🔴; never withhold `APPROVE` for it; never block a merge on it. A red or flaky CI cannot stall the pipeline, while the machinery stays exercised and observable rather than sitting dormant until someone trusts it enough to switch on.

**`enforcing`** — full authority. A red check is a 🔴 blocker, `APPROVE` requires an observed green, a pending run is never a pass, and Axis-C findings are **never conceded** — a red suite is a fact, not an opinion.

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
