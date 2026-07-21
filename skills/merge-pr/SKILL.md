---
name: merge-pr
description: Verify an approved PR is merge-ready, squash-merge it, delete the branch, and explicitly close the linked issue(s). Required because PRs created by /execute-issue target the PRD's base branch (not the default branch), so GitHub's keyword auto-close does not fire. Use when the user says "/merge-pr <pr-number>" after /review-pr has approved the PR with all threads resolved.
---

# Merge PR

Mechanical skill: verify a PR is merge-ready, squash-merge it, delete the branch, and **explicitly close the linked issue(s)**. No implementation, no review, no judgment beyond the merge-gate check.

## Invocation

`/merge-pr <pr-number>`

If no PR number is given, ask. Do not guess.

## Why this skill exists

PRs created by `/execute-issue` target the PRD's **base branch** (`prd-<prd-number>-<slug>`), not the default branch. GitHub's keyword-driven issue auto-close (the `Fixes #N` behavior) only fires when a PR merges into the repository's default branch. Merging into a base branch leaves the linked issue open, and the PRD's child-issue tracker silently drifts out of sync with reality. This skill closes the linked issue(s) explicitly as part of the merge so the tracker stays accurate.

A plain `gh pr merge` would leave the issue open. Do not substitute one for this skill.

## Process

### Step 1 — Fetch PR state

```bash
gh repo view --json owner,name
gh api graphql -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      number
      title
      body
      url
      state
      headRefName
      baseRefName
      reviewDecision
      reviewThreads(first: 100) { nodes { isResolved } }
    }
  }
}' -f owner=<owner> -f repo=<repo> -F pr=<pr-number>
```

### Step 2 — Verify merge-ready

Check **all** of the following. If any fails, stop and report — do not merge.

1. `state == "OPEN"` — the PR must be open (not already merged or closed)
2. Review gate — **one** of the following must be true:
   - `reviewDecision == "APPROVED"` — a non-author reviewer has formally approved, **OR**
   - `reviewDecision` is `null` AND at least one review body starts with `Claude comment 🤖` AND all `reviewThreads` are resolved — the PR author cannot self-approve on GitHub, so a clean `/review-pr` follow-up pass (all threads resolved, no new issues) is treated as equivalent
   - `CHANGES_REQUESTED` always blocks → stop
3. Every `reviewThreads.nodes[].isResolved == true` — no unresolved threads. If any are unresolved, stop and suggest `/address-pr <n>`.
4. `baseRefName` starts with `prd-` — PRs from `/execute-issue` must target a base branch. If `baseRefName` is the default branch, stop and report a structural bug upstream; do not merge past it.

### Step 3 — Identify the linked issue(s)

Parse the PR body for `Fixes #N`, `Closes #N`, `Resolves #N` (case-insensitive, any of these keywords). Collect **every** matched issue number — a PR may close multiple issues.

If none are found, report: "PR #<n> does not reference a linked issue via `Fixes #<n>` in its body." Proceed with the merge regardless — the PR may have been opened manually — but note the missing link in the final report.

### Step 4 — Squash-merge and delete the branch

```bash
gh pr merge <pr-number> --squash --delete-branch
```

Verify the merge landed:

```bash
gh pr view <pr-number> --json state,mergedAt,mergeCommit
```

Expected: `state == "MERGED"`, `mergedAt` populated. If the merge failed (conflict with the base branch, protected-branch rule, required check pending or failing), **stop and report** — do not attempt to auto-resolve conflicts, do not force the merge, do not disable branch protection.

### Step 4.5 — Drop the local branch

`gh pr merge --delete-branch` deletes the **remote** branch. Also remove the PR's review worktree if one exists (`git worktree remove .worktrees/<headRefName>` — sibling skills rely on this happening here), then drop any stale local branch left behind:

```bash
git branch -D <headRefName> 2>/dev/null || true
```

### Step 5 — Close the linked issue(s)

This is the load-bearing step. For **each** linked issue number parsed in Step 3:

```bash
gh issue view <issue-number> --json state,title -q '.state'
```

- If the issue is already `CLOSED`, skip it and note it in the final report. Do not reopen just to "re-close it cleanly."
- If the issue is `OPEN`, close it with a comment linking the merged PR:

```bash
gh issue close <issue-number> \
  --reason completed \
  --comment "Completed via PR #<pr-number> (<pr-url>), squash-merged into \`<baseRefName>\`."
```

If closing an issue fails (permission error, API flake), retry once. If it still fails, report the failure — the merge itself remains valid, but the user needs to close the issue manually.

### Step 6 — Report

Output a concise summary:
- PR URL and `mergedAt` timestamp
- Linked issue(s) closed (by number), or "none linked" if Step 3 found nothing
- Base branch the PR merged into, with a reminder: **this is not the default branch**. The base branch still needs a human to eventually merge into the default branch when the full PRD is done.
- Suggest next step: "Re-run `/execute-issue <prd>` to pick up the next child."

Stop. Do not chain into `/execute-issue` yourself.

## Critical Rules

1. **Never merge without a passing review gate.** Either a formal `APPROVED` decision, or a complete `/review-pr` cycle where all skill-authored threads were resolved and no new blockers were raised. A bare COMMENT review with open threads does not qualify.
2. **Never merge with unresolved review threads.** Suggest `/address-pr` instead.
3. **Never attempt conflict resolution on a failed merge.** Stop and report; a human decides whether to rebase, merge-in, or escalate.
4. **Never merge a PR targeting the default branch.** PRs from `/execute-issue` target the PRD's base branch by design. A default-branch-targeted PR is a structural bug upstream — stop and report.
5. **Always close the linked issue(s).** The whole point of this skill over a raw `gh pr merge --squash --delete-branch` is the explicit issue close. If you skip it, the child-issue tracker silently drifts.
6. **Never reopen a closed issue to "re-close it cleanly".** If it is already closed, acknowledge in the report and move on.
7. **Never disable required checks or branch protection to force a merge.** That is a conversation for the user, not this skill.
8. **Never chain into `/execute-issue`.** Stop after reporting; the user drives the next verb.
9. **One PR per invocation.** Do not bulk-merge multiple PRs in a single run, even if several are ready.

## Edge Cases

- **PR is already merged** → report and stop, but still verify the linked issue(s) were closed. If GitHub closed them on its own (rare, only if the base branch happened to be the default), acknowledge it. If not, close them explicitly following Step 5.
- **Merge conflict with base branch** → stop; ask the user to rebase or resolve manually
- **PR body has no `Fixes #N`** → merge anyway, note the missing link in the report, leave any issue-closing to the user
- **PR closes multiple issues** → close all of them, each with its own comment linking the merged PR
- **Branch protection requires a status check still pending** → stop; tell the user to wait for CI
- **Branch protection requires a review from a specific user who hasn't reviewed** → stop and report; don't try to bypass
- **Linked issue was deleted (not closed)** → report the dangling reference and continue
- **Linked issue belongs to a different repo** → do not attempt cross-repo close; report and let the user handle it
- **PR targets the default branch instead of `prd-*`** → stop; something went wrong in `/execute-issue` that needs human attention, and merging past it would break the PRD workflow
- **Squash-merge succeeded but `--delete-branch` failed** → report the dangling branch; the merge is still valid. Step 4.5 still drops the local branch
- **Multiple PRs reference the same `Fixes #N`** → close the issue on the first merge; the next merge will find it already closed and skip per Step 5
