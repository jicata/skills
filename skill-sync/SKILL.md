---
name: skill-sync
description: The return path between a repo and the base skill library — classify every delta as overlay-bound, upstreamable, or upstream-behind, then act on each with the human's approval.
disable-model-invocation: true
---

# Skill-sync — the return path

Run periodically in a repo that was set up from the base library (and after any burst of local skill editing). Requires: the repo's `project-profile.md` (for `base_version`) and a local checkout of the base repo.

## 1. Diff

For every installed base-layer file in the repo's `.claude/`, three-way compare: the repo's copy vs the base version it was installed from (`base_version`) vs the base repo's current HEAD.

## 2. Classify every delta

- **Overlay-bound** — a repo-specific edit made to a base file (a path, a constraint, a scar hard-wired into base prose). This violates the read-only law; the fix is to **move it**: express it in `project-profile.md` (or the repo's own doctrine) and restore the base file. Base files stay verbatim so upgrades stay file-copies.
- **Upstreamable** — a generic improvement that happens to have been born here (a sharper rule, a new anti-pattern, a better completion criterion — anything that would help every repo). Propose it as a PR/commit to the base repo, genericized per the base law (repo facts → profile references; scars kept as attributed examples).
- **Upstream-behind** — the base repo's HEAD improved a file the repo still has at an older version, with no local edits. Pull the update (file copy), bump `base_version`.
- **Conflict** — both moved. Rare; resolve by intent like a merge conflict (`/resolving-merge-conflicts` discipline): understand both sides' why, keep the generic improvement upstream and the repo-specific part in the overlay.

## 3. Act

Present the classification table first — file, class, one-line rationale — and get a yes before moving anything. Then execute: overlay moves + restores, upstream PRs (each with the scar/why attached), pulls + `base_version` bump. Close by re-running the repo's router check (a synced skill set may have added/renamed something the router must reflect).

## Scar-harvest (the half the diff can't see)

Deltas only catch edits to *base files*. The richer harvest is the repo's **overlay and memory**: constraints added to `project-profile.md` since the last sync that are secretly generic (a debugging tactic, a review heuristic, an interview question the setup catalog should have asked). Walk the profile's recent changes and ask of each: *would this help a repo that isn't this one?* If yes — upstream it, attributed. This is how the base library grows scars without any repo having to bleed twice.
