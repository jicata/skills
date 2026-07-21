# Cleanup Issue Template (single-issue mode)

Canonical structure of the `[ship-cleanup]` GitHub issue created by `/ship-issue` and its child skills.

Unlike `/ship-feature` (which lazy-creates one cleanup issue per PRD), `/ship-issue` lazy-creates a cleanup issue **only when residue actually occurs** — a conceded thread, a forced merge, a regression, missing AC, or an unmergeable outcome. Most single-issue runs ship clean and produce no cleanup artifact.

## Title

```
[ship-cleanup] Issue #<n> — residual concerns
```

## Labels

- `ship-cleanup`
- `automation/blocked`

## Body structure

```markdown
This issue tracks residual concerns from the /ship-issue autonomous orchestrator's run on Issue #<issue-number>.

Each entry is a deferred fix. Resolve via /drain-cleanup or by hand.

## Concessions

- [ ] [concession-axis-b] PR #<pr> thread <thread-id> · file: `<path>:<line>` · rule: `<rule-source>` · summary: "<one-line concern>" · reason: "<reason>"
- [ ] 🚨 [concession-axis-a] PR #<pr> thread <thread-id> · file: `<path>:<line>` · AC: `<AC reference>` · summary: "<one-line concern>" · reason: "<reason>"

## Regressions

- [ ] [regression] PR #<pr>: pre-existing failing test `<test-id>` at `<file>`. Observed: <stderr summary>
- [ ] [regression-from-fix] PR #<pr>: applying fix for thread <id> revealed unfixable failure in `<test-id>`.

## Conflicts

- [ ] [contradictory-threads] PR #<pr>: threads <id1>, <id2> on `<file>:<line>` — chose <option>; alternate left for arbitration.
- [ ] [ac-conflict] PR #<pr> thread <id>: contradicts AC §<ref>; followed AC.
- [ ] [rebase-conflict] PR #<pr>: pull --rebase produced irreducible conflicts in <files>. Manual rebase required.

## Infrastructure

- [ ] [git-failure] Branch ops failed for Issue #<n>: <error summary>
- [ ] [push-failure] PR #<pr> branch `<branch>`: <error summary>
- [ ] [ac-missing] Issue #<n>: no Acceptance Criteria section; reviewed against motivation/scope.
- [ ] [branch-protection] PR #<pr>: master branch protection blocked merge. PR left open.
```

## Entry tag reference

| Tag | Meaning | Severity |
|---|---|---|
| `[concession-axis-b]` | Axis-B (standards) thread conceded after 3 rejects or round-7 cap | tech debt |
| `[concession-axis-a]` 🚨 | Axis-A (requirements) thread conceded via forced-merge path | functional gap |
| `[regression]` | Pre-existing failing test surfaced during the work item's test run | unrelated bug |
| `[regression-from-fix]` | Fix applied during `/afk-address-pr` revealed a new unfixable failure | needs investigation |
| `[contradictory-threads]` | Two reviewer threads demand mutually exclusive changes | review process issue |
| `[ac-conflict]` | Reviewer thread contradicts an AC; AC was followed | spec/review mismatch |
| `[rebase-conflict]` | Mid-run rebase produced irreducible conflicts | needs manual rebase |
| `[git-failure]` | Local git operation failed (rare) | env issue |
| `[push-failure]` | Push to remote failed (auth, branch protection) | env / config |
| `[ac-missing]` | Issue lacks `## Acceptance Criteria` section | authoring bug — `/log-issue` should not produce this |
| `[branch-protection]` | Master branch protection blocked the final merge | needs human action |

## Tags NOT used in single-issue mode

These appear in `/ship-feature`'s cleanup template but cannot fire in `/ship-issue` because there is no PRD finalization step or child-blocker graph:

- `[cycle]` — no children to form cycles with
- `[finalize-conflict]` — no PRD→master merge step
- `[finalize-blocked]` — same

## Lifecycle

1. **Not** created at the start of the run. Speculative creation is forbidden.
2. Lazy-created when the first residual concern arises (concession, regression, AC missing, infrastructure failure).
3. Appended to throughout the rest of the run.
4. End-of-run report links to it.
5. `/drain-cleanup` parses entries.
6. Closed when all checklist items are ticked.

## Relationship to /ship-feature's cleanup issue

| Aspect | `/ship-feature` cleanup | `/ship-issue` cleanup |
|---|---|---|
| Scope | One per PRD (spans many PRs) | One per issue (one PR) |
| Title key | `PRD #<n>` | `Issue #<n>` |
| Creation policy | Lazy on first concern (almost always created) | Lazy on first residue (often never created) |
| PRD-finalization entries | Yes (`[finalize-*]`) | No |
| Cycle / blocker entries | Yes (`[cycle]`) | No |
