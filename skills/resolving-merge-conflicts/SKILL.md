---
name: resolving-merge-conflicts
description: Use when you need to resolve an in-progress git merge/rebase conflict.
---

# Resolving Merge Conflicts

Conflicts typically arise on **integration branches** — sibling changes merging into a shared base, or a base-branch → main finalize. The "primary sources" below are usually the child PRs and their issues.

1. **See the current state** of the merge/rebase. Check git history, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs, check the original issues (their acceptance criteria and any recorded implementation plan are the intent record).

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort`.

   3a. **Generated artifacts are regenerated, never resolved by side-picking.** Screenshots, a design or docs mirror, snapshots, lockfiles, codegen output: each side is a correct output of *its* inputs, and the merged inputs match neither. `--ours`/`--theirs` on such a file silently discards the other side's refresh, and nothing downstream notices — binary files cannot even be 3-way-merged. Take either side only to clear the conflict, run the generator the profile or its doctrine declares (e.g. the `design_pipeline` post-merge procedures) on the merged tree, and commit its output. No declared generator → say so in the merge commit and leave a residue note naming the file and the side kept. (Donor scar: a finalize merge picked the integration branch's side on three conflicting screenshots, which were older than a refresh the default branch had landed meanwhile; it surfaced only later, as cleanup residue.)

4. **Run the project's automated checks** — the `check_commands` in the project profile (`.claude/doctrine/project-profile.md`). Fix anything the merge broke.

5. **Finish the merge/rebase.** Stage everything and commit, following the repo's commit convention (per profile — e.g. Conventional Commits where release tooling depends on it). If rebasing, continue until all commits are rebased.

## Special case: a stacked branch whose base was squash-merged

When branch B was cut from branch A and A has since been **squash-merged** to the default branch, merging the default branch into B produces dozens of duplicate-diff conflicts (rename/rename, modify/delete included). The squash gave A's content a new SHA, so git cannot see that B already has it. Do not resolve those hunk by hunk:

1. If A still conflicts with the default branch, resolve A **identically to how B already resolved the same collision**, then let A land.
2. On B: `git merge -s ours origin/<default>` — keeps B's tree byte-identical.
3. **`-s ours` is only safe while the default branch contains nothing B lacks.** `git fetch` and re-diff *at merge time*, never from an earlier check — an unrelated commit landing in the gap is silently deleted by `-s ours`. Restore any such paths with `git checkout origin/<default> -- <paths>` before committing.
4. Verify: every path in `git diff --name-only origin/<default> HEAD` must belong to B's own change set. `--name-only` reports only a rename's destination, so a "missing" file is often just renamed — check before calling it a deletion.

(Donor scar: a 46-file duplicate-conflict merge settled this way; an unrelated commit landed between the verification and the merge, and only the merge-time re-diff kept `-s ours` from deleting it from the default branch.)
