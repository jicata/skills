---
name: afk-address-pr
description: Autonomous-mode variant of /address-pr. Fixes unresolved review threads on a specific PR with best-effort resolution, regression localization, and pushback-via-thread-reply for out-of-scope concerns. Logs residue to the PRD's ship-cleanup issue and emits a structured JSON return for the orchestrator. Invoked by /ship-feature via the afk-coder agent. Do not invoke directly from the CLI; use /address-pr for human-driven flow.
---

# AFK Address PR

Autonomous-mode fork of `/address-pr`. Same job — fix unresolved review threads on a PR — with three structural changes:

1. **Pushback-via-reply** for out-of-scope review comments instead of halt-and-flag
2. **Regression localization** before declaring a fix impossible
3. **Structured JSON return** for the orchestrator

**Repo facts come from the profile** (`.claude/doctrine/project-profile.md`): check commands, coder lens routing, doc-canon locations, wire-contract artifacts. Where this skill says `master`, use the repo's default branch; JSON `result` names stay verbatim.

## Invocation

`/afk-address-pr <pr-number>`

If no PR number, return `{"result": "missing_pr"}` and stop.

## Step 0.0 — Resilience setup (mandatory)

Apply `.claude/skills/_afk-shared/resilience.md` for the whole run:

- **Non-interactive, time-boxed shell (§1).** Wrap every `gh` call and every remote `git` call (`fetch`/`pull`/`push`/`clone`/`ls-remote`/remote-ref `checkout`) as `GH_PAGER=cat GIT_PAGER=cat GIT_TERMINAL_PROMPT=0 timeout <N> <cmd>` — `N=120` for gh metadata/GraphQL, `N=180` for fetch/pull/push/checkout. Local-only git needs no wrapper. On a second timeout (exit 124), take this skill's documented failure path (`push_failure` / `rebase_conflict`) and log a `[hang-timeout]` cleanup entry. This prevents the pager/credential/network wedges that otherwise freeze the orchestrator forever.
- **Heartbeat (§2, optional).** A passive progress log — nothing reads it to make decisions and the run does not depend on it; it is only a trace you can `tail` while watching this agent in the live display. If a heartbeat token was passed, you may append `echo "$(date +%s) | <phase> | <detail>" >> tmp/afk/heartbeat-<token>.log` at the start of a Step or before a long command. Omitting it has no effect.

## Step 0 — Orchestrated-mode preamble

### 0a. Git state normalization

```bash
git status --porcelain
```

- **Clean tree** → proceed
- **Dirty with rescue-state** → stash with timestamp, proceed
- **Dirty foreign** → emit and stop:
  ```json
  {"result": "dirty_tree_foreign", "details": "..."}
  ```

### 0b. Scratch dir cleanup

```bash
mkdir -p tmp/afk
find tmp/afk/ -type f -mmin +30 -delete 2>/dev/null || true
```

## Step 1 — Fetch PR and repo context

```bash
gh repo view --json owner,name
gh pr view <pr-number> --json number,title,body,headRefName,baseRefName,state,url,files
```

If `state != "OPEN"`:
```json
{"result": "pr_not_open", "pr_state": "<state>"}
```

Parse `Fixes #N` / `Closes #N` / `Resolves #N` for the linked child issue. Fetch it:
```bash
gh issue view <N> --json number,title,body
```

Read its Acceptance Criteria — needed to judge scope of review comments.

Identify the **PRD number**: parse the child issue body for `## Parent PRD` referencing `#<prd>`. The PRD number determines which cleanup issue to upsert.

## Step 2 — Fetch unresolved review threads

```bash
gh api graphql -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 20) {
            nodes { id body path line originalLine author { login } }
          }
        }
      }
    }
  }
}' -f owner=<owner> -f repo=<repo> -F pr=<pr-number>
```

Filter to `isResolved == false`. If none:
```json
{"result": "no_unresolved_threads"}
```

## Step 3 — Check out the branch

```bash
git fetch origin
git checkout <headRefName>
git pull origin <headRefName>
```

If branch only on origin: `git checkout -b <headRefName> origin/<headRefName>`.

If pull has conflicts with the remote feature branch (rare — orchestrator should not have parallel writers in v0): attempt rebase preferring our local side; on irreducible conflict, log to cleanup-issue and emit `result: rebase_conflict`.

## Step 4 — Process each unresolved thread

For each unresolved thread, classify into one of four buckets and act accordingly. Process **all** threads before committing — single batched push.

### Bucket A: in-scope, fixable

The thread's concern falls within the child issue's AC. Apply the fix, routing by file type to the repo's composite coder lens(es) per the profile.

Update docs in the same commit if the fix touches the lean documentation canon (ADRs, the glossary, the wire-contract artifacts the profile declares — per the repo's documentation doctrine).

### Bucket B: out-of-scope (pushback)

The thread asks for changes beyond the child issue's Acceptance Criteria.

1. **Do not implement the change.**
2. Post a pushback reply on the thread:
   ```bash
   gh api /repos/<owner>/<repo>/pulls/<pr>/comments/<first-comment-id>/replies \
     --method POST \
     -f body="Claude comment 🤖

   ⚠️ This appears out of scope for child issue #<child>.

   Reasoning: <one-paragraph explanation tying the comment to the AC list>

   Deferring to next /afk-review-pr pass to arbitrate. If accepted, will be addressed in a follow-up issue."
   ```
3. Record the thread ID in the structured return as `pushed_back`.
4. **Do not resolve the thread.** Reviewer arbitrates next round.

### Bucket C: contradictory threads

Two unresolved threads on the same code region demand mutually exclusive changes.

1. Pick the interpretation that best serves the child issue's AC. If both are equally valid against the AC, pick the one from the higher-priority comment (🔴 > 🟡 > 💭).
2. Apply that fix.
3. Post a reply on the rejected thread explaining the choice; do not resolve it (Reviewer arbitrates).
4. Append a `[contradictory-threads]` entry to the PRD cleanup issue with both thread IDs.

### Bucket D: AC vs review thread conflict

Thread asks for the opposite of an explicit Acceptance Criterion.

1. Follow the AC (the issue is the spec).
2. Post a reply explaining the AC takes precedence.
3. Append `[ac-conflict]` entry to cleanup issue.
4. Do not resolve.

### Regression localization

If applying a Bucket-A fix introduces (or reveals) a test failure:
1. Run `git stash` and re-run the **same lane** on the clean baseline (the profile's `check_commands` fast lane, exactly as spelled — donor scar: an unfiltered test run with the integration rig down mimics a mass regression). If the failure exists pre-fix → it is pre-existing → log `[regression]` entry to cleanup, restore stash, continue.
2. If the failure was introduced by the fix → keep working until tests pass. **Never `[Skip(...)]`** (or the repo's test-framework equivalent).
3. If genuinely irreducible after best effort, restore stash, log `[regression-from-fix]` entry, emit `result: regression` and return.

## Step 5 — Run the pre-push gate

Build + the **fast lane** of the profile's `check_commands`, if any source file was touched in the PR.

Both must be green. If pre-existing red baseline: log `[regression]` to cleanup, do not push, emit `result: regression`.

Expensive lanes (integration rigs, contract regressions) run in CI on the push, in parallel with the next review round — do **not** run them here. Exception: if the profile declares a local-run exception (donor example: fixes touching persistence, entities, EF configuration, or migrations ran the emulator-backed integration lane once locally), honor it.

**If an Axis-C thread on this PR reported a CI failure**, that failure is in scope for this round exactly like any other blocker — fix it. If it is an expensive-lane failure you cannot reproduce with the fast lane, reproduce it by running that lane per the profile rather than guessing.

## Step 6 — Commit and push (single batched push)

Fix every in-scope thread (Bucket A) before committing. Bucket B/C/D threads do not generate commits — they generate replies and cleanup entries.

Single commit message default:
```
Address review comments on #<child-number>
```

```bash
git add <files>
git commit -m "Address review comments on #<child-number>"
git push
```

Never force-push or rewrite history.

If push fails for non-conflict reasons → log `[push-failure]` to cleanup, emit `result: push_failure`.

## Step 7 — Cleanup-issue helper

Same `upsert_cleanup_issue` routine documented in `/afk-execute-issue/SKILL.md`. The cleanup-issue title and search key depend on the PR's base branch:

- **PR targets `prd-*`** (PRD mode, `/ship-feature` flow) → title `[ship-cleanup] PRD #<prd-number> — residual concerns`, derive `<prd-number>` from the base branch name (`prd-<n>-...`)
- **PR targets the default branch** (single mode, `/ship-issue` flow) → title `[ship-cleanup] Issue #<issue-number> — residual concerns`, derive `<issue-number>` from the PR body's `Fixes #N` line. Lazy-create only on residue (matches `/ship-issue`'s policy); do NOT create speculatively.

Standard entry formats this skill emits:

| Concern | Entry format |
|---|---|
| Contradictory threads | `- [ ] [contradictory-threads] PR #<n>: threads <id1>, <id2> on \`<file>:<line>\` — chose <option>; alternate left for arbitration.` |
| AC conflict | `- [ ] [ac-conflict] PR #<n> thread <id>: contradicts AC §<ref>; followed AC.` |
| Regression | `- [ ] [regression] PR #<n>: pre-existing failing test \`<test-id>\` at \`<file>\`. Observed: <stderr summary>` |
| Regression-from-fix | `- [ ] [regression-from-fix] PR #<n>: applying fix for thread <id> revealed unfixable failure in \`<test-id>\`.` |
| Push failure | `- [ ] [push-failure] PR #<n> branch \`<branch>\`: <error summary>` |
| Rebase conflict | `- [ ] [rebase-conflict] PR #<n>: pull --rebase produced irreducible conflicts in <files>. Manual rebase required.` |

## Step 8 — Emit structured return

```json
{
  "skill": "afk-address-pr",
  "result": "pushed" | "no_unresolved_threads" | "regression" | "rebase_conflict" | "push_failure" | "pr_not_open" | "dirty_tree_foreign" | "missing_pr",
  "pr_number": <n>,
  "pr_url": "...",
  "child_number": <n>,
  "prd_number": <n>,
  "threads_addressed": <count of Bucket A threads fixed>,
  "threads_pushed_back": [<thread_id>...],
  "threads_contradictory": [<thread_id>...],
  "threads_ac_conflict": [<thread_id>...],
  "tests": {
    "backend": "pass" | "fail" | "n/a"
  },
  "cleanup_issue": <n> | null,
  "cleanup_entries_added": [<tags>],
  "notes": "<short freeform>"
}
```

## Critical Rules

1. **Never resolve review threads yourself.** Reviewer arbitrates. This skill posts replies and cleanup entries; thread resolution is `/afk-review-pr` or `/afk-concede-thread`.
2. **Never commit with red tests.**
3. **Never silently expand scope.** Out-of-scope threads get pushback replies, not silent implementation.
4. **Never `[Skip(...)]` regressions** (or the repo's test-framework equivalent). Log and return.
5. **Never force-push or rewrite history.**
6. **Never push partial progress.** Fix every in-scope thread, then one commit, one push.
7. **Always emit the structured JSON return**, even on hard failure.
8. **Always delete scratch files** before return.

## Edge Cases

- **Thread cites a file that no longer exists** → fix concern wherever code moved to; note in commit message
- **Thread anchors on outdated line (line: null)** → grep around `originalLine` for relevant code
- **Multiple reviewers contradict each other** → handle as Bucket C
- **Branch diverged needing rebase** → attempt `git pull --rebase` preferring our side; if irreducible, emit `rebase_conflict`
- **Test suite red baseline before changes** → emit `regression`, do not push
