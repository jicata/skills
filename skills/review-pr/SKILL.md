---
name: review-pr
description: Review a GitHub PR against its linked issue/PRD (requirements axis) and the codebase's coding standards (standards axis, per the repo's doctrine index). Posts blocking review comments and resolves prior threads on follow-up passes. Use when the user says "/review-pr <number>" or asks you to review a PR submitted by another agent.
---

# Review PR

Review a GitHub PR along two axes and post the result as a **blocking** GitHub review with inline resolvable comment threads. Supports follow-up passes where the skill resolves its own prior threads once the PR author addresses them.

## Invocation

`/review-pr <pr-number>`

If no number is given, ask the user for one. Do not guess.

## Comment Authorship Marker

**Every inline comment body and every top-level review body posted by this skill MUST begin with:**

```
Claude comment 🤖
```

This marker is how the skill identifies its own threads on follow-up passes. Without it, follow-up runs cannot distinguish skill-authored threads from human-authored ones.

## Process

### Step 1 — Fetch PR context

Run these in parallel:

```bash
gh repo view --json owner,name,nameWithOwner
gh pr view <n> --json number,title,body,author,headRefName,baseRefName,url,files,commits,state
gh pr diff <n>
```

Note the changed file paths from `files`. You will use them to decide which coding-standard rule files to load.

Also note `headRefName` — Step 1.5 needs it.

### Step 1.5 — Sync the PR worktree to the PR head

**This step runs on every invocation, including follow-up passes.** Without it, every "Read file in full" later in the skill reads stale content and produces false judgments — most painfully on follow-up passes where Step 9a compares the current state of the PR against threads from a prior pass.

Review **inside the PR's worktree** (`.worktrees/<headRefName>`, the one `/execute-issue`/`/address-pr` created), never by checking the branch out in the main working tree — the branch is already held by the worktree (`gh pr checkout` into the main tree would fail "already checked out"), and reviewing in the worktree means your own main-tree state (branch, uncommitted work) is irrelevant. If the worktree is missing (you're reviewing on a machine that never ran `/execute-issue`), recreate it from `origin`.

```bash
REPO_ROOT=$(git rev-parse --show-toplevel)
BR=<headRefName>
WT="$REPO_ROOT/.worktrees/$BR"

git -C "$REPO_ROOT" fetch origin

if git -C "$REPO_ROOT" worktree list --porcelain | grep -q "/.worktrees/$BR$"; then
  cd "$WT"
else
  git -C "$REPO_ROOT" worktree prune
  if git -C "$REPO_ROOT" show-ref --verify --quiet refs/heads/$BR; then
    git -C "$REPO_ROOT" worktree add "$WT" $BR
  else
    git -C "$REPO_ROOT" worktree add "$WT" -b $BR origin/$BR
  fi
  cd "$WT"
fi
```

Then, **from inside `$WT`**:

1. **Require a clean worktree.** Check `git status --porcelain` in `$WT`. If non-empty, abort and ask the user to reconcile — a dirty PR worktree means an interrupted `/address-pr`. Do not auto-stash; silent state mutations are surprising and dangerous. (Your *main* tree's cleanliness no longer matters — that's the point of reviewing in the worktree.)
2. **Fast-forward to remote.** Run `git pull --ff-only`. If this fails, the worktree branch has diverged from the remote PR head — abort and tell the user to reconcile manually. **Do not** `git reset --hard`: the divergence may be unpushed `/address-pr` commits the user still wants.
3. **Record the head SHA.** Capture `git rev-parse HEAD` and include it in the review summary body (e.g., `Reviewed at commit \`<sha>\``). This makes the posted review auditable and helps follow-up passes reason about what changed.
4. **All "Read file in full" steps below read from `$WT`.** Leave the worktree in place on exit — `/address-pr` reuses it and `/merge-pr` removes it after merging. Never switch the main tree.

If `git worktree add` reports the branch is already checked out elsewhere (the main tree from a pre-worktree run), stop and report — the user frees it with `git checkout <base>` in the main tree first.

### Step 2 — Identify the linked issue (Axis A)

Parse the PR body for `Fixes #N`, `Closes #N`, `Resolves #N`. If found:

```bash
gh issue view <N> --json number,title,body,url
```

The child issue (created via `/prd-to-issues`) has a predictable structure:
- `## Parent PRD` → contains `(#M)` referencing the parent PRD issue
- `## Acceptance criteria` → a `- [ ]` checklist (**this is your Axis A checklist**)
- `## User stories addressed` → numbered references into the parent PRD

If a Parent PRD reference exists, fetch it too:

```bash
gh issue view <M> --json number,title,body
```

Use the parent PRD for **broader context** (Problem Statement, Solution, Out of Scope). Use the child issue's Acceptance Criteria as the **authoritative checklist** to grade against.

**If no linked issue is found**: add a prominent warning to the top of the review body (`⚠️ No linked issue found — Axis A (requirements) was skipped`) and continue with Axis B only. Do not refuse to review.

### Step 3 — Detect prior review state (initial vs follow-up)

Query review threads via GraphQL:

```bash
gh api graphql -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          comments(first: 20) {
            nodes {
              body
              path
              line
              originalLine
              author { login }
            }
          }
        }
      }
    }
  }
}' -f owner=<owner> -f repo=<repo> -F pr=<n>
```

A thread is considered **skill-authored** if its first comment body starts with `Claude comment 🤖`.

- **Initial review**: no skill-authored threads exist on the PR.
- **Follow-up review**: one or more skill-authored threads exist.

### Step 4 — Load the applicable rule files (Axis B source of truth)

Based on the changed file paths, load **the rule files the repo's doctrine index declares for each touched area** (the index and `.claude/doctrine/project-profile.md` map file classes → doctrine: architecture + backend standards for source files, database doctrine for migrations/ORM code, LLM-prompt doctrine for prompt-bearing text, chassis-foundation before asserting anything about runtime behavior the base libraries own, contract doctrine for public/ported surfaces). Read each **in full** before proceeding. They are the single source of truth for Axis B — do not reconstruct their rules from memory, do not summarize, do not skip any. Every principle in every loaded rule is a checklist item.

Two rows are base doctrine and always apply:

| Always load | Role |
|---|---|
| `doctrine/fowler-smell-baseline.md` | Judgement-call design smells — 🟡/💭 only; its binding rules govern (never 🔴 on its own, doctrine/ADR overrides suppress). |
| The base `code-reviewer-persona` skill | Governs review format, priority markers (🔴 blocker / 🟡 suggestion / 💭 nit), comment structure, and tone. |

Additionally, **if the profile declares a wire-contract collection skill**: on any wire-contract change (new/changed route or verb, added/renamed/removed request or response DTO field, new status code), check the diff also touches the collection artifact. A wire change with **no collection delta** is a 🟡 — the collection is the only *executable* doc artifact, it rots silently because code compiles and tests pass whether or not it is true, and nothing but this check catches it. Treat "the sync tool/key is unavailable" as unverified until shown — the artifact itself is repo-owned, so the *edit* is never blocked even if a push is. (Donor scar: this exact excuse was fabricated on a PR once.)

These rule files evolve. Any summary baked into this skill would drift. The skill's job is to load them and apply them all — not to remember them.

### Step 5 — Perform Axis A (requirements)

For each Acceptance Criterion **in the child issue** (not the parent PRD — sibling-issue ACs are not this PR's responsibility):
1. Identify which changed files should implement it.
2. Read those files in full (not just the diff — you need surrounding context to judge).
3. Decide: **satisfied**, **partially satisfied**, or **not addressed**.
4. For anything less than satisfied, prepare an inline comment anchored at a **diff line** in the relevant file (an added/modified line — not a pre-existing untouched one) with a 🔴 marker, prepended with **[AXIS-A]**, and a concrete description of what's missing. If no diff line is a sensible anchor, raise it in the review body's Axis A summary instead of fabricating an inline anchor on untouched code.

Also check:
- **Scope creep**: are there substantive changes in the diff that do not trace to any AC or user story? Flag as 🟡 with the rationale "not scoped to this issue".
- **Out of Scope violations**: anything the parent PRD explicitly excluded that the PR touches. Flag as 🔴.
- **User story coverage**: does the PR actually exercise the user stories listed in `## User stories addressed`?

### Step 6 — Perform Axis B (standards)

**Anchor every finding to the diff.** Compute the set of changed line ranges per file from `gh pr diff <n>` (added lines and the hunks they sit in). New files added by the PR count as wholly in-scope.

Walk **every principle in every rule file you loaded in Step 4** as a checklist, but apply it through this scope filter:

| Where the violation lives | What to do |
|---|---|
| **In the diff** (added or modified line) | Flag it. 🔴 / 🟡 / 💭 as warranted. Anchor at the diff line. |
| **Pre-existing line, but this PR's changes pushed an enclosing-unit metric over threshold** (e.g., method was just under a complexity ceiling, PR added a branch and now it's over) | Flag at the new line, prefix the comment with `[caused by this PR]`, full priority. |
| **Pre-existing, untouched, no causal link to the diff** | **Do not flag. Silent.** Untouched tech debt is out of scope — even if the rule says it's wrong. |

For **file/folder-scope rules** (canonical folder structure, one-type-per-file, naming): only flag if the PR added, moved, or renamed a file that breaks the rule. Do not flag pre-existing structural violations the PR did not cause.

**Structural-drift census.** If the repo's architecture doctrine defines a placement census (e.g. a slice-root census in a VSA repo: when the PR adds/moves/renames a file into a governed root, count the loose files there and flag a 🟡 at the newly-added file when the root is over threshold or forms an identifiable sub-domain), run it. The causal link is real: this PR is the file that pushed (or kept) the location over threshold — exactly the per-PR hook that catches death-by-a-thousand-cuts drift no single earlier diff revealed. Suggest where the new file belongs per the doctrine; do **not** demand the whole area be refactored in this PR — flag the trend and name the target location.

Read files in full when judging — context is needed to assess severity and pick the right anchor. But "Read in full" gives you context, not license to flag lines outside the diff.

For every in-scope violation, prepare an inline comment at the exact file and line with:
- The tag **[AXIS-B]** followed by a priority marker (🔴 / 🟡 / 💭) chosen per the `code-reviewer-persona` rubric
- The rule source in brackets, naming the file and the specific principle (e.g., `[<architecture-doctrine>.md: intra-module structure]`, `[<backend-doctrine>.md: cognitive load]`)
- What's wrong — concrete, file:line-grounded
- A specific suggestion

**Do not invent standards that aren't in the rule files.** If something bothers you but isn't codified, either skip it or flag it as 💭 with the note "not codified, personal suggestion".

### Step 6.5 — Perform Axis C (CI)

The Coder pushes after the profile's fast local gate; any CI-delegated lanes run concurrently with this review. Reading CI is part of the review. Do it **after** Axes A and B so the review overlaps the CI run.

```bash
REVIEWED_SHA=$(gh pr view <n> --json headRefOid --jq .headRefOid)   # capture at Step 1.5, reuse here
gh api "repos/<owner>/<repo>/commits/$REVIEWED_SHA/check-runs" --jq '.check_runs[] | {name, status, conclusion}'
```

Three rules:
- **Pin the SHA.** CI runs can be cancelled or superseded when the head moves, so "the latest run" can belong to a different commit. If the head moved during your review, say so and re-review — your findings describe a stale diff.
- **Pending is not pass.** Wait for conclusions. If still pending, report Axis C as *unknown* — never green.
- **Never approve on a red or unobserved suite.**

For each failing check, extract the actual assertion or test name — not "check failed":

```bash
gh run list --commit "$REVIEWED_SHA" --json databaseId,workflowName,conclusion
gh run view <run-id> --log-failed
```

Raise one 🔴 `[AXIS-C]` blocker per failing check in the review body, with the check name, the extracted failure, and the run URL. State explicitly whether the failure is caused by this PR or pre-existing on the base branch — the two get very different responses from the author.

### Step 7 — Compose the review body

The review body is Markdown. Structure:

```markdown
Claude comment 🤖

## Review Summary

[One paragraph. Overall impression. Count of 🔴 blockers, 🟡 suggestions, 💭 nits.]

[If no linked issue: ⚠️ No linked issue found — Axis A skipped.]

## Axis A — Requirements (Issue #<n>)

[Per-AC verdict table or bullet list. For each AC: ✅ satisfied / ⚠️ partial / ❌ not addressed, with a one-line reason.]

[Scope creep findings, if any.]
[Out-of-scope violations, if any.]

## Axis B — Code Standards

### [Per rule-source area, e.g. Architecture / Backend standards]
[Grouped findings, referencing the inline threads.]

### Universal
[Correctness, security, perf, tests.]

## Axis C — CI (commit `<REVIEWED_SHA>`)

[One line per check run: name → conclusion. For failures: the extracted assertion/test name, the run URL, and whether it is caused by this PR or pre-existing on base.]

## What Went Well

[Genuine praise — at least one item if any exists. Training pure cynicism is bad feedback.]
```

### Step 8 — Post the review (initial pass — one consolidated review)

Post **exactly one** review per skill invocation containing **every** inline comment from Axes A, B, and C. Do not drip-feed comments across multiple review API calls — a single batched review lets the addresser fix everything in one pass, which is the main lever against multi-round review churn.

Use the REST API to create a review with inline comments in a single request. Event type depends on findings:

- Any 🔴 blockers → `REQUEST_CHANGES` (blocks merge on protected branches)
- Only 🟡 / 💭 → `COMMENT`
- No findings at all → `APPROVE`

Every inline comment body **must start with** `Claude comment 🤖\n\n`.

Build a JSON payload file (use `Write` to a scratch file, then pass via `--input`) with this shape:

```json
{
  "event": "REQUEST_CHANGES",
  "body": "Claude comment 🤖\n\n## Review Summary\n...",
  "comments": [
    {
      "path": "src/Foo/FooHandler.ext",
      "line": 42,
      "body": "Claude comment 🤖\n\n**[AXIS-B]** 🔴 **[<backend-doctrine>: cognitive load]** This method exceeds the cognitive load ceiling...\n\n**Suggestion:** Extract the resolution block into a private method `ResolveX(...)`"
    }
  ]
}
```

Post it:

```bash
gh api /repos/<owner>/<repo>/pulls/<n>/reviews \
  --method POST \
  --input <scratch-file>.json
```

Delete the scratch file after posting.

### Step 9 — Follow-up pass (when prior skill-authored threads exist)

If Step 3 found skill-authored threads, switch to follow-up mode:

#### 9a. Judge each existing thread

For each unresolved skill-authored thread:
1. Read the thread's original comment body (from the GraphQL response) to recall the concern.
2. Read the current content of `path` around the anchor line (note: `line` may be null if outdated; use `originalLine` as a starting point and grep nearby for the relevant code).
3. Decide: **addressed**, **partially addressed**, or **not addressed**.

#### 9b. Resolve addressed threads

For each thread you judge as addressed, resolve it:

```bash
gh api graphql -f query='
mutation($id: ID!) {
  resolveReviewThread(input: {threadId: $id}) {
    thread { isResolved }
  }
}' -f id=<thread-id>
```

Optionally, before resolving, post a short reply on the thread confirming what was fixed:

```bash
gh api /repos/<owner>/<repo>/pulls/<n>/comments/<comment-id>/replies \
  --method POST \
  -f body="Claude comment 🤖

✅ Resolved: now uses parameterized query."
```

(The reply endpoint requires the first comment's ID from the thread — available in the GraphQL response.)

#### 9c. Leave unaddressed threads open

Do not resolve threads you judge as not addressed. Optionally post a reply explaining why the fix is still insufficient, prefixed with `Claude comment 🤖`.

#### 9d. Scan for new issues

Run Axis A and Axis B again on the current state of the PR (not just the latest diff — the whole PR as it now stands). Any **new** findings (not matching an existing thread) become new inline comments in this follow-up review.

#### 9e. Post the follow-up review

- If all prior threads were resolved AND no new issues were found → `APPROVE`, with body: `Claude comment 🤖\n\n✅ All prior concerns addressed. Ready to merge.`
- If new issues were found → `REQUEST_CHANGES` (or `COMMENT` if only 🟡/💭), with a new body summarizing resolutions + new findings
- If prior threads remain unresolved → `REQUEST_CHANGES`, with a body noting what still needs work

### Step 10 — Report back to the user

After posting, output a concise summary in chat:
- Link to the review (`gh pr view <n> --json reviews -q '.reviews[-1].url'` or similar)
- Count of 🔴 / 🟡 / 💭
- Count of threads resolved (follow-up only)
- Any ambiguity you flagged for human judgment

## Critical Rules

1. **Never invent findings.** Every 🔴 must be grounded in a specific rule file + file:line evidence.
2. **Never skip reading a rule file** and reconstruct its rules from memory — rules evolve.
3. **Never post without the `Claude comment 🤖` prefix** — it breaks follow-up detection permanently.
4. **Never resolve a thread you did not author.** Only threads whose first comment starts with `Claude comment 🤖` are yours.
5. **Prefer REQUEST_CHANGES over COMMENT for blockers.** The whole point of this skill is to gate merges on agent-authored PRs.
6. **Read files in full** when judging issues — diffs lack context.
7. **Praise what works.** Review summaries that contain only criticism are a training signal to write more defensively, not more correctly.
8. **Confirm ambiguity back to the user** instead of guessing. If an acceptance criterion is unclear, flag it in the review body rather than deciding unilaterally.
9. **One review per pass, fully batched.** Post every finding in a single review API call — never split a pass into multiple reviews. Drip-feeding comments forces extra address rounds.
10. **Always sync the PR worktree (Step 1.5) before any file reads, and read from it.** This applies to initial *and* follow-up passes. Reviewing in `.worktrees/<headRefName>` — never a main-tree `gh pr checkout` — is what keeps `/review-pr` concurrency-safe and independent of your main-tree state. Skipping the sync produces phantom "still not addressed" replies on threads the author already fixed.
11. **Axis B comments anchor to changed lines only.** Untouched pre-existing tech debt is out of scope, even if it violates a rule loaded in Step 4. Exception: if the PR's changes push an enclosing unit's metric over a rule threshold, flag the new line with `[caused by this PR]`. The PR's scope is the diff — do not expand it.

## Edge Cases

- **PR is a draft** → still review, but note "draft PR — review is advisory until marked ready"
- **PR has merge conflicts** → post a single 🔴 blocker comment asking for a rebase; do not continue
- **PR touches generated/vendored files** → skip them in Axis B
- **Multiple linked issues** (`Fixes #1, Closes #2`) → review against all of them; Axis A is the union of their ACs
- **Child issue has no AC section** → flag as a PRD process failure and review against user stories only
- **PR worktree is missing** (reviewing on a machine that never ran `/execute-issue`) → Step 1.5 recreates it from `origin/<headRefName>`; proceed normally
- **`git worktree add` says the branch is already checked out** → the main tree (pre-worktree run) holds it; stop and report. The user frees it with `git checkout <base>` in the main tree, then re-runs
- **PR worktree is dirty** → an interrupted `/address-pr` left uncommitted work; abort and ask the user to reconcile (do not auto-stash)
