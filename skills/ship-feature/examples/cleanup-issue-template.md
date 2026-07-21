# Cleanup Issue Template

This is the canonical structure of the `[ship-cleanup]` GitHub issue created by the `/ship-feature` orchestrator (and its child skills) when residual concerns arise during a PRD run.

There is exactly **one** cleanup issue per PRD. Created lazily on first concern. Subsequent concerns append checklist entries.

## Title

```
[ship-cleanup] PRD #<n> — residual concerns
```

## Labels

- `ship-cleanup`
- `automation/blocked`

## Body structure

```markdown
This issue tracks residual concerns from the /ship-feature autonomous orchestrator's run on PRD #<prd-number>.

Each entry is a deferred fix. Resolve via /drain-cleanup or by hand.

## Concessions

- [ ] [concession-axis-b] PR #<pr> thread <thread-id> · file: `<path>:<line>` · rule: `<rule-source>` · summary: "<one-line concern>" · reason: "<reason>"
- [ ] 🚨 [concession-axis-a] PR #<pr> thread <thread-id> · file: `<path>:<line>` · AC: `<AC reference>` · summary: "<one-line concern>" · reason: "<reason>"

## Regressions

- [ ] [regression] PR #<pr> child #<child>: pre-existing failing test `<test-id>` at `<file>`. Observed: <stderr summary>
- [ ] [regression-from-fix] PR #<pr>: applying fix for thread <id> revealed unfixable failure in `<test-id>`.

## Conflicts

- [ ] [contradictory-threads] PR #<pr>: threads <id1>, <id2> on `<file>:<line>` — chose <option>; alternate left for arbitration.
- [ ] [ac-conflict] PR #<pr> thread <id>: contradicts AC §<ref>; followed AC.
- [ ] [rebase-conflict] PR #<pr>: pull --rebase produced irreducible conflicts in <files>. Manual rebase required.
- [ ] [finalize-conflict] PRD→master merge: file `<path>` resolved with -X theirs strategy. Verify hunks at `<line>-<line>`.

## Infrastructure

- [ ] [git-failure] Branch ops failed for child #<n>: <error summary>
- [ ] [push-failure] PR #<pr> branch `<branch>`: <error summary>
- [ ] [cycle] Children locked in a blocking cycle: <list>. Manual triage required.
- [ ] [ac-missing] Child #<n>: no Acceptance Criteria section; reviewed against user stories.
- [ ] [finalize-blocked] PRD→master merge could not start (divergent histories / uncommitted state). PR <#> left open.
```

## Entry tag reference

| Tag | Meaning | Severity |
|---|---|---|
| `[concession-axis-b]` | Axis-B (standards) thread conceded after 3 rejects or round-7 cap | tech debt |
| `[concession-axis-a]` 🚨 | Axis-A (requirements) thread conceded via forced-merge path | functional gap |
| `[regression]` | Pre-existing failing test surfaced during a slice's test run | unrelated bug |
| `[regression-from-fix]` | Fix applied during /afk-address-pr revealed a new unfixable failure | needs investigation |
| `[contradictory-threads]` | Two reviewer threads demand mutually exclusive changes | review process issue |
| `[ac-conflict]` | Reviewer thread contradicts an AC; AC was followed | spec/review mismatch |
| `[rebase-conflict]` | Mid-run rebase produced irreducible conflicts | needs manual rebase |
| `[finalize-conflict]` | PRD→master merge resolved with `-X theirs` for some hunks | verify hunks |
| `[git-failure]` | Local git operation failed (rare) | env issue |
| `[push-failure]` | Push to remote failed (auth, branch protection) | env / config |
| `[cycle]` | Children blocked-by each other in a cycle | PRD authoring bug |
| `[ac-missing]` | Child issue lacks `## Acceptance criteria` section | PRD authoring bug |
| `[finalize-blocked]` | PRD→master merge could not start | needs human |

## Lifecycle

1. Lazy-created when the first concern arises
2. Appended to throughout the PRD run
3. End-of-run report links to it
4. `/drain-cleanup` parses entries, re-verifies each against current master, and spins off properly-formed follow-up issues
5. Closed when all checklist items are ticked
