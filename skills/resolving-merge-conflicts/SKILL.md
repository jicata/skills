---
name: resolving-merge-conflicts
description: Use when you need to resolve an in-progress git merge/rebase conflict.
---

# Resolving Merge Conflicts

Conflicts typically arise on **integration branches** — sibling changes merging into a shared base, or a base-branch → main finalize. The "primary sources" below are usually the child PRs and their issues.

1. **See the current state** of the merge/rebase. Check git history, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs, check the original issues (their acceptance criteria and any recorded implementation plan are the intent record).

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort`.

4. **Run the project's automated checks** — the `check_commands` in the project profile (`.claude/doctrine/project-profile.md`). Fix anything the merge broke.

5. **Finish the merge/rebase.** Stage everything and commit, following the repo's commit convention (per profile — e.g. Conventional Commits where release tooling depends on it). If rebasing, continue until all commits are rebased.
