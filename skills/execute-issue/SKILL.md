---
name: execute-issue
description: Pick the next unblocked, unclaimed child issue of a PRD, create the appropriate branches, implement the slice using the repo's composite coder lens, and open a PR targeted at the PRD's base branch. When every child is already merged, instead finalizes the PRD — merges the base branch to the default branch, closes the PRD, deletes the prd-<n> label — behind a short confirmation gate. Use when the user says "/execute-issue <prd-number>" or asks for fresh implementation of a PRD's next work item. For PRs that need review-comment fixes use /address-pr; for PRs that are ready to merge use /merge-pr.
---

# Execute Issue

Pick and implement the next **fresh** work item under a PRD, end-to-end: branch → documentation-first understanding → TDD implementation → push → open PR targeted at the PRD's base branch. Review-feedback fixes and merging are separate skills (`/address-pr`, `/merge-pr`) — this one does not touch existing PRs.

## Invocation

`/execute-issue <prd-number>`

If no PRD number is given, ask the user which PRD to work on. Do not guess.

## Process

### Step 1 — Fetch the PRD and its child issues

```bash
gh issue view <prd-number> --json number,title,body,state,url
gh issue list --state open --limit 200 --json number,title,body,labels,url
```

Filter the second list to children of this PRD — a child is an issue whose body contains `## Parent PRD` followed by a reference to `#<prd-number>`. Child issues use the template from `/prd-to-issues`, so the Parent PRD section and Acceptance Criteria checklist are predictable.

Build a candidate list with `number`, `title`, `url`, and `blockedBy` (parse `Blocked by #N` lines from the body).

### Step 2 — Pick the next eligible child

For each candidate, check whether a PR already exists:

```bash
gh pr list --search "Fixes #<child-number>" --state open --json number,url -q '.[0]'
```

Apply these skip rules in order. Each invocation picks **one** child and runs it to completion.

1. **Child is closed** → skip
2. **Child has any open PR** → skip, and remember the PR URL for the report. This skill does not touch existing PRs — the user runs `/address-pr <pr>` to fix review comments or `/merge-pr <pr>` to merge when approved.
3. **Child is blocked by an unclosed issue** → skip
4. **First candidate satisfying none of the above** → **this is the one**

If no candidate is eligible, report and branch on **why** it's ineligible:
- **Any children with open PRs** → list PR URLs; tell the user to run `/address-pr` or `/merge-pr`. Do **not** finalize — the PRD isn't fully merged. Stop.
- **Any children blocked** by an unclosed issue (**including blockers in *other* PRDs**) → list them with their blockers. Do **not** finalize — the PRD has unmerged work. Stop.
- **Every child is closed and none has an open PR** → the base branch is complete. Go to **Step 2.5 (Finalize the PRD)** instead of stopping.

The finalize path fires **only** on that last case — children exist **AND** all are closed **AND** none has an open PR. "No eligible child" alone is not enough: a PRD whose only remaining children are blocked is *waiting*, not done, and must never be merged half-built to the default branch.

### Step 2.5 — Finalize the PRD (all children merged)

Reached **only** from Step 2's all-children-closed terminal state. This is the one place the manual flow merges the PRD base branch into the default branch and closes the PRD out — the counterpart to `ship-feature`'s `FINALIZE_PRD` (reuse its conflict-handling wording for anything hairy). Everything below is skipped on a normal run where a child was picked. `DEFAULT` below is the repo's default branch (`main`/`master`).

**Manual gate first — short, no diff.** Ask once, then wait for the answer:

> **PRD #\<n\> "\<title\>" is complete** — all \<k\> children are merged into `<base-branch>`. Finalize now? This merges `<base-branch>` → `<default-branch>`, closes #\<n\>, and deletes the `prd-<n>` label. **(yes / no)**

On **no** → report "left `<base-branch>` unmerged; finalize skipped" and stop. On **yes**:

1. **Open (or reuse) the PRD→default PR:**
   ```bash
   gh pr list --head <base-branch> --base <default-branch> --state open --json number,url -q '.[0]'   # reuse if present
   # else:
   gh pr create --base <default-branch> --head <base-branch> \
     --title "PRD #<n>: <title>" \
     --body "Finalizes PRD #<n>. Merges all child slices from \`<base-branch>\` into \`<default-branch>\`."
   ```
2. **Pre-flight default-branch sync** — surface conflicts on the PRD side, in a transient base worktree (same pattern as Step 3's 1b):
   ```bash
   REPO_ROOT=$(git rev-parse --show-toplevel); BASE=<base-branch>; DEFAULT=<default-branch>
   BASE_WT="$REPO_ROOT/.worktrees/$BASE"
   git -C "$REPO_ROOT" fetch origin
   git -C "$REPO_ROOT" worktree add "$BASE_WT" $BASE 2>/dev/null \
     || git -C "$REPO_ROOT" worktree add "$BASE_WT" -b $BASE origin/$BASE
   git -C "$BASE_WT" pull --ff-only origin $BASE
   git -C "$BASE_WT" merge --no-edit origin/$DEFAULT     # halts on conflict
   git -C "$BASE_WT" push origin $BASE
   git -C "$REPO_ROOT" worktree remove "$BASE_WT"
   ```
   **On conflict:** resolve in `$BASE_WT` (prefer both sides where orthogonal; `git checkout --ours <file>` for the irreducible, since HEAD is the PRD branch), commit, push, remove the worktree. If it's a genuine divergence a human should see, **leave it and report — do NOT merge a half-resolved base to the default branch.**
3. **Merge the PR** — `--merge`, not `--squash`, to preserve child commits:
   ```bash
   gh pr merge <prd-pr-number> --merge --delete-branch
   ```
   If the merge fails (branch protection, a required check pending/failing, unresolved conflict) → **stop, leave the PR open, report.** Never force it or disable protection.
4. **Close the PRD issue** (keyword auto-close may not have fired from a base-branch history):
   ```bash
   gh issue view <n> --json state -q '.state'   # if OPEN:
   gh issue close <n> --reason completed --comment "Completed via PR #<prd-pr-number>, finalized through /execute-issue."
   ```
5. **Delete the `prd-<n>` scaffolding label** — its job ends when the PRD lands on the default branch:
   ```bash
   gh label delete "prd-<n>" --yes 2>/dev/null || true
   ```
   **Skip steps 4–5 if step 3's merge did not land** (PR left open) — the label must survive while the PRD is unmerged so its children stay grouped.
6. **Wire-contract collection canonical sync** — only if the profile declares a wire-contract collection skill (see `.claude/doctrine/project-profile.md`, External Contracts). If the PRD touched the collection, the canonical cloud/shared copy is stale by construction (children synced a per-PRD mirror, or nothing, never the canonical copy). Run that skill's post-merge catch-up sync, then delete the per-PRD mirror if one exists. Never skip silently — in the donor repo this step was skipped once and the canonical copy sat 3 days stale.
7. Report: PR merged, PRD #\<n\> closed, `prd-<n>` label deleted, collection synced (if declared). Stop.

### Step 3 — Establish the base branch, feature branch, and an isolated worktree

This skill runs each child in its **own git worktree** under `.worktrees/<feature-branch>` (gitignored), so multiple `/execute-issue` agents can run concurrently without fighting over the shared working tree or a single `git stash`. **The main working tree is never switched, stashed, or touched** — all of your changes live inside the worktree.

Derive the base branch name from the PRD title:
- Strip leading `PRD:` (case-insensitive), trim
- Lowercase, replace any run of non-alphanumerics with `-`, collapse doubles, strip leading/trailing `-`
- Cap at 40 chars
- Prepend `prd-<prd-number>-`

Example: `PRD: Widget Import v2 Parity` (Issue #10) → `prd-10-widget-import-v2-parity`

Derive the feature branch name from the child issue: `<child-number>-<slug>`, slug derived the same way as the PRD slug, capped at 40 chars.

A previous run may have crashed, leaving a worktree behind with uncommitted work. **Reuse it (resume) rather than recreating it** — the script below detects and reuses an existing worktree:

```bash
set -e # Halt immediately if any command fails

REPO_ROOT=$(git rev-parse --show-toplevel)
BASE=<base-branch>
FEATURE=<child-number>-<slug>
DEFAULT=<default-branch>
WT="$REPO_ROOT/.worktrees/$FEATURE"

git -C "$REPO_ROOT" fetch origin

# 1. Ensure the base branch exists on origin (create from the default branch if missing).
#    Ref-only commands — the main working tree is never checked out or modified.
if git -C "$REPO_ROOT" show-ref --verify --quiet refs/remotes/origin/$BASE; then
  :                                               # base already published
elif git -C "$REPO_ROOT" show-ref --verify --quiet refs/heads/$BASE; then
  git -C "$REPO_ROOT" push -u origin $BASE         # local-only base → publish it
else
  git -C "$REPO_ROOT" branch $BASE origin/$DEFAULT # create base off the default branch, no checkout
  git -C "$REPO_ROOT" push -u origin $BASE
fi

# 1b. Sync the base branch forward from the default branch BEFORE cutting the child off it.
#     Merge, never rebase: the base is published and children are cut from it — rebasing
#     it would orphan every in-flight child. A merge needs a real index, so this runs in a
#     transient base worktree (the main tree is never checked out).
BEHIND=$(git -C "$REPO_ROOT" rev-list --count origin/$BASE..origin/$DEFAULT)
if [ "$BEHIND" -gt 0 ]; then
  BASE_WT="$REPO_ROOT/.worktrees/$BASE"
  git -C "$REPO_ROOT" worktree add "$BASE_WT" $BASE 2>/dev/null \
    || git -C "$REPO_ROOT" worktree add "$BASE_WT" -b $BASE origin/$BASE
  git -C "$BASE_WT" pull --ff-only origin $BASE
  git -C "$BASE_WT" merge --no-edit origin/$DEFAULT   # halts here on conflict — see below
  git -C "$BASE_WT" push origin $BASE
  git -C "$REPO_ROOT" worktree remove "$BASE_WT"
fi

# 2. Create (or reuse) the isolated worktree for this feature branch.
if git -C "$REPO_ROOT" worktree list --porcelain | grep -q "/.worktrees/$FEATURE$"; then
  echo "Reusing existing worktree at $WT (resuming an interrupted run)."
else
  git -C "$REPO_ROOT" worktree prune               # clear any stale registration
  if git -C "$REPO_ROOT" show-ref --verify --quiet refs/heads/$FEATURE; then
    git -C "$REPO_ROOT" worktree add "$WT" $FEATURE
  elif git -C "$REPO_ROOT" show-ref --verify --quiet refs/remotes/origin/$FEATURE; then
    git -C "$REPO_ROOT" worktree add "$WT" -b $FEATURE origin/$FEATURE
  else
    git -C "$REPO_ROOT" worktree add "$WT" -b $FEATURE origin/$BASE
  fi
fi

cd "$WT"
git status
```

**From this point on, `$WT` is your working directory.** Run every build, test, `git add/commit/push`, and `gh pr create` command from inside the worktree. Do not `cd` back to the main tree.

If `git worktree add` fails with **"<branch> is already checked out"**, another worktree — or the main tree from a pre-worktree run — already holds that branch. **Stop and report; do not force it.** That is the concurrency guard doing its job (two agents must never share a branch).

**Why step 1b exists.** Without it, the PRD base branch is cut from the default branch **once**, at creation, and never resynced — so every child of a long-lived PRD is implemented, reviewed, and merged against a default branch that has moved on. (Donor scar: a PRD base branch sat 7 commits behind, missing three merged code PRs, one day after it was cut.) The default branch flows into the base branch here, once per `/execute-issue`, instead of arriving as one big-bang merge at the final PRD→default PR.

**On the merge conflict path** (`git merge origin/$DEFAULT` fails): `set -e` halts the script with the base worktree left in place, mid-merge. Do **not** abort and carry on — the child would be cut from a stale base. Resolve in `$BASE_WT`, `git commit`, `git push origin $BASE`, `git worktree remove "$BASE_WT"`, then re-run the skill. In practice a conflict here means the PRD and the default branch have genuinely diverged on the same lines and a human should look.

**In-flight children are deliberately left alone.** A child branched off the *old* base still merges cleanly into the freshened base — git resolves against the merge-base, and the child's PR diff stays scoped to its own changes. The only cost is that an already-open child was built against pre-sync code, so a *semantic* conflict with the default branch surfaces at `/merge-pr` time rather than now. Do not rebase open child branches to "fix" this: it rewrites published history that a review may already be anchored to, and buys nothing git wasn't going to do anyway.

### Step 3.5 — Assess Resumed State

If the worktree already existed (a previous run was interrupted), you are resuming an interrupted session. Before writing new code:
1. **Assess State:** Run `git status` and `git diff` inside `$WT` to see exactly what the previous run changed.
2. **Run the checks:** Run the profile's `check_commands` (the fast pre-push gate) to see if the current state compiles and what is failing.
3. **Map to ACs:** Compare the existing code against the Acceptance Criteria to determine what is already done and what is missing.
4. **Resume:** Pick up the TDD loop (Red/Green/Refactor) from exactly where the previous run left off.

### Step 4 — Understand before you code (lean read order)

**Mandatory** per `doctrine/documentation-first.md`. Do not skip this step even if the issue looks simple.

1. Read the repo's glossary (per the profile) — align terminology before inventing synonyms
2. Read the parent PRD in full (Problem Statement, Solution, User Stories, Out of Scope, Implementation Decisions, Testing Decisions)
3. Read the child issue in full (What to build, Acceptance Criteria, User stories addressed) — **including the `## Implementation plan (agreed via /expand-issue)` section in the body if present; it is the agreed HITL spec, build to it.**
3.5. **Read the expand-issue walkthrough comment if present.** Fetch comments (`gh issue view <child-number> --comments`) and find the one whose first line is `<!-- expand-issue:walkthrough -->`. It is a plain-English, why-first briefing authored with the human during planning — the slice's temporary deep-dive artifact, correct as of planning. Read it before coding.
4. Locate the code via the repo's architecture/concept map (per the profile), then read the **code and tests** of the area — under the lean canon they are the only "how it works" source
5. Check the repo's ADRs for any whose Status is not Superseded/Deprecated and that touches this area; for wire-contract work read the contract artifacts the profile's External Contracts section declares
6. **If the AC/agreed plan has genuinely drifted from the live source** (e.g., in an oracle-bound brownfield repo, upstream oracle churn) — don't silently build to the stale text and don't silently override it. Flag the divergence to the user before deciding how to resolve it. If the resolution is "build to the AC as written, defer the drift," file it in the PRD's deferred-work catch-all issue rather than letting it vanish: search open issues for `PRD #<n> backlog — deferred work catch-all` (create it with that title if absent), and append an entry — what diverged, where you found it, why it's deferred, cross-linked to any doc that already classifies it. This is separate from a blocking catch-up issue (drift that must resolve before the PRD merges) — the catch-all is for non-blocking, intentionally-deferred work surfaced mid-implementation.

**CRITICAL SCOPE BOUNDARY:** You are reading the parent PRD for *context only*. You must **STRICTLY RESTRICT** your code changes to the Acceptance Criteria of the **single child issue** you selected in Step 2. Do NOT implement future slices, delete out-of-scope files, or build other parts of the PRD.

### Step 5 — Choose the execution lens

Follow the repo's **composite coder lens** (generated by setup) in full. Read every file it references. It is the authoritative source for how code is structured and how tests are written. It includes TDD's red-green loop (the base `tdd` skill) — follow it. Do not write implementation before a failing test.

### Step 5.5 — State Your Plan (Anti-Scope-Creep)

Before writing any code, output a brief plan in your internal thought process or to the user stating:
1. The exact branch you are on.
2. The single child issue number you are implementing.
3. The exact Acceptance Criteria you are restricting yourself to.
If your plan includes anything outside the child issue's Acceptance Criteria, STOP and revise your plan.

### Step 6 — Implement the slice

1. **Red**: write a failing test that expresses one Acceptance Criterion
2. **Green**: minimum code to make it pass
3. Repeat until every Acceptance Criterion has a passing test
4. **Consolidation pass (once, pre-PR)**: walk the base `tdd` skill's `refactoring.md` over the finished slice — tidy duplication, naming drift, dead code; behavior unchanged, tests stay green. Design-level restructuring belongs to review, not this pass.
5. Run the pre-push gate — the profile's `check_commands` (build + the fast test lane), not just your new tests. If the profile declares slower lanes as CI-delegated, leave them to CI on the push (they run in parallel with review) unless the profile says the diff class demands a local run (e.g. persistence changes).
6. Update the **lean doc canon** (`doctrine/documentation-first.md`) — it is the *whole* documentation obligation:
   - **ADRs** for architectural decisions — apply the repo's ADR gate and conventions before writing a new one.
   - **Glossary** for new domain terms.
   - **Architecture/concept map** — one row/pointer update, only for map-level changes (area added/removed, stack or cross-cutting rule change).
   - **Wire-contract artifacts per the profile** on any wire-contract change (new/changed route or verb, added/renamed/removed DTO field, new status code) — if the profile declares a wire-contract collection skill, invoke it; the collection is the one *executable* doc artifact, so it rots silently (code compiles and tests pass whether or not it is true).
7. Commit in logical units, matching the repo's commit convention (per the profile / repo history — e.g. Conventional Commits if release automation requires it).

### Step 7 — Push and open the PR

```bash
git push -u origin <child-number>-<slug>
```

Check if a PR already exists (in case a previous run pushed but crashed before reporting). If not, create the PR **targeted at the base branch, not the default branch**:

```bash
if ! gh pr view --json url >/dev/null 2>&1; then
  gh pr create \
    --base <base-branch> \
    --head <child-number>-<slug> \
    --title "<child-issue-title>" \
    --body "$(cat <<'EOF'
Fixes #<child-number>

## Summary
<1–3 bullets describing what was built>

## Acceptance criteria
- [x] Criterion 1
- [x] Criterion 2
- [x] Criterion 3

## Test plan
- [x] Profile `check_commands` green locally
- [ ] CI-delegated lanes (if any) — run by CI on this PR
- [x] Manual verification notes, if any
EOF
)"
else
  echo "PR already exists."
fi
```

The `Fixes #<child-number>` line is load-bearing — `/merge-pr` parses it to explicitly close the linked issue (GitHub's keyword auto-close does **not** fire on PRs merging into a base branch, only into the default branch).

### Step 8 — Hand off and report

Output a concise summary in chat:
- Link to the PR
- Which lens you applied (the composite coder lens)
- Test results (`N passing, 0 failing`)
- Any documentation updates made
- Any ambiguity you flagged back to the user instead of deciding unilaterally

Then stop. Next step is for the user:
1. `/review-pr <n>` against the new PR
2. If the review finds issues → `/address-pr <n>`, then `/review-pr <n>` again
3. Once approved with all threads resolved → `/merge-pr <n>`
4. Re-invoke `/execute-issue <prd>` to pick up the next child

Do not attempt to review, address, or merge your own work.

## Critical Rules

1. **Child PRs never target the default branch.** Always target the PRD's base branch — that's the whole point of the base-branch-per-PRD structure. The **sole exception** is the single PRD→default finalize PR in Step 2.5, reached only from the all-children-closed terminal state and gated on explicit user confirmation; that one PR targets the default branch by design.
2. **Never skip the Step 4 read order.** Even for "simple" slices. Terminology mistakes are expensive and early-hour speedups create late-hour rewrites.
3. **Never write implementation before a failing test.** TDD is load-bearing for trusting AFK agents — without the red step, there is no evidence the test was ever valid.
4. **Never touch an existing PR.** If a child has an open PR, skip it and tell the user to use `/address-pr` or `/merge-pr`. This skill is for fresh implementation only.
5. **Never commit with the pre-push gate failing.** The profile's `check_commands` must be green before you push. A red *CI* lane is not a reason to withhold the push — CI-delegated lanes run in parallel with review and their failures come back as Axis-C findings.
6. **Never invent acceptance criteria.** If the issue is ambiguous, flag it back to the user; do not guess and build something.
7. **Keep the slice tracer-bullet tight.** Do not add unrelated improvements, refactors, or "while I'm here" cleanups. Scope creep gets flagged by `/review-pr` and wastes everyone's time.
8. **Update contracts in the same commits as the code.** The wire-contract artifacts the profile declares move in lockstep with wire changes; ADR/glossary updates ride the same PR.
9. **Never self-review.** This skill does not spawn review subagents and does not approve its own PRs. `/review-pr` is a separate step the user runs manually.
10. **Never exceed the child issue's scope.** The PRD is your map, but the child issue is your strict boundary. Do not modify files, delete assets, or update domain language for features outside your specific Acceptance Criteria.
11. **Halt on Git Failures.** If branch creation, checkout, or pulling fails unexpectedly, you MUST halt and report the error to the user. Do not proceed to write code on the wrong branch.
12. **Always work in the per-child worktree.** Operate entirely inside `.worktrees/<feature-branch>`. Never switch, stash, or commit on the main working tree — that is what allows several `/execute-issue` agents to run at once. Leave the worktree in place when you finish (`/address-pr` reuses it; `/merge-pr` removes it after merge). If `git worktree add` reports the branch is already checked out, stop and report — never force a second worktree onto the same branch.

## Edge Cases

- **PRD is itself closed** → report and stop; ask user if they want to work on a different PRD
- **No child issues exist yet** → report; suggest running `/prd-to-issues` first
- **All children are blocked in a cycle** → report the cycle; stop
- **All children have open PRs** → report each PR URL and tell the user which verb to run next (`/address-pr` or `/merge-pr`); do not finalize
- **All children closed, none with an open PR** → the PRD is complete; go to Step 2.5 and finalize to the default branch behind the confirmation gate (not the "nothing to do" stop)
- **PRD complete but the finalize merge is blocked** (branch protection, required check, hard conflict) → leave the PRD→default PR open, keep the `prd-<n>` label and the PRD issue as-is, report; a human resolves and re-runs `/execute-issue <n>`
- **Base branch exists but is behind the default branch with no conflicts** → fast-forward it before branching (push if you have to)
- **Base branch exists but has diverged from the default branch in a way that requires a merge** → stop and report; do not auto-merge
- **Feature branch already exists but no PR** → resume on it; investigate what's there before overwriting
- **Worktree already exists for this feature branch** → reuse it (the Step 3 script does this) and follow Step 3.5 to resume; do not delete and recreate it
- **`git worktree add` says the branch is already checked out** → another agent (or the main tree from a pre-worktree run) holds it; stop and report. To free a stale main-tree checkout, the user runs `git checkout <base>` in the main tree first
- **`.worktrees/<slug>` dir exists but isn't a registered worktree** (manual delete / crash) → the Step 3 script runs `git worktree prune` then recreates it; if the dir is non-empty and unregistered, remove it manually before retrying
- **Child issue has no Acceptance Criteria section** → flag as a PRD process failure (the `/prd-to-issues` template requires it); review against user stories instead and note the gap in the PR body
- **Tests fail after your changes that were passing before** → you broke something outside the slice; do not "fix" by updating the failing test to match your new behavior — investigate and fix the regression, or report it if it's outside the slice's scope
- **Documentation update would require major rewrites beyond this slice** → do the minimum needed for this slice, open a separate issue for the larger doc overhaul, reference it in the PR body
