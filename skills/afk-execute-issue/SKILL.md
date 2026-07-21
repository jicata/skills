---
name: afk-execute-issue
description: Autonomous-mode variant of /execute-issue. In PRD mode (default), picks the next unblocked, unclaimed child issue of a PRD, branches off the PRD base branch, and opens a PR targeting the base branch. In --single mode, implements a single standalone issue, branches directly off the default branch, and opens a PR targeting it. Implements via the repo's composite coder lens(es). Best-effort on every halt condition — logs residue to the per-PRD or per-issue ship-cleanup issue and continues. Invoked by /ship-feature (PRD mode) or /ship-issue (--single mode) via the afk-coder agent. Do not invoke directly from the CLI; use /execute-issue for human-driven flow.
---

# AFK Execute Issue

Autonomous-mode fork of `/execute-issue`. Same job — branch, implement TDD-style, open PR — but with three structural changes:

1. **Best-effort, log-and-continue** instead of halt-and-flag
2. **Structured JSON return block** at the end so the orchestrator can route on `result`
3. **Two modes**: PRD mode (default, ships PRD children) and `--single` mode (ships standalone bug/enhancement issues directly to the default branch)

The non-AFK `/execute-issue` skill is left untouched for human use.

**Repo facts come from the profile.** Wherever this skill needs a repo-specific fact — check commands, coder lens routing, glossary/map locations, wire-contract artifacts — it reads `.claude/doctrine/project-profile.md` ("the profile"). **Default branch:** where this skill says `master`, use the repo's actual default branch (resolve once: `gh repo view --json defaultBranchRef`); JSON `result` names stay verbatim regardless.

## Invocation

**PRD mode (default):** `/afk-execute-issue <prd-number>`

Picks the next eligible child of the PRD. Used by `/ship-feature`. If `<prd-number>` is missing, return `{"result": "missing_prd"}` and stop.

**PRD mode with pinned child:** `/afk-execute-issue <prd-number> --child <issue-number>`

Skips child-picking and implements the specified child directly. Used by `/ship-feature --parallel <N>` so concurrent slots don't race to claim the same child — the orchestrator's SCHEDULER_TICK has already done the picking. The pinned child is still validated against PRD membership and eligibility (closed / has-open-PR / blocked-by-unclosed): on failure return `{"result": "child_ineligible", "child": <n>, "reason": "<closed|has_open_pr|blocked>"}` so the orchestrator can release the slot and retry on the next tick. **`--child` is incompatible with `--single`** (different modes; reject the combination).

**Single-issue mode:** `/afk-execute-issue <issue-number> --single`

Implements the specified standalone issue directly. Used by `/ship-issue`. If `<issue-number>` is missing, return `{"result": "missing_issue"}` and stop.

## Mode dispatch — `--single` overrides

When invoked with `--single`, apply the following overrides to the steps below. Everything not listed is identical to PRD mode.

- **Step 1 (Fetch)**: Fetch the single issue, not a PRD + children list:
  ```bash
  gh issue view <issue-number> --json number,title,body,state,url,labels
  ```
  If `state == "CLOSED"`, return `{"result": "issue_closed", "issue_number": <n>}`.
  If the body contains `## Parent PRD`, return `{"result": "structural_bug_prd_child", "issue_number": <n>}` — the orchestrator (`/ship-issue`) should have refused this case in its Step 1, so reaching here is a bug.

- **Step 2 (Pick)**: Skip entirely. The issue IS the work item.

- **Step 3 (Branches)**: No PRD base branch. Branch directly off the latest `origin/master`. **Do not** `git checkout master` here — that breaks when `/ship-issue` is running in a worktree (the default branch is already checked out in the user's main repo, and git refuses the duplicate). Source the new branch from `origin/master` directly so the same code works in both the main repo and a worktree.
  - Feature branch name: `<issue-number>-<slug>`, slug derived from issue title (lowercase, non-alphanum→`-`, collapse, trim, cap 40).
  - Branch setup:
    ```bash
    git fetch origin
    if git show-ref --verify --quiet refs/heads/<issue-number>-<slug> || git show-ref --verify --quiet refs/remotes/origin/<issue-number>-<slug>; then
      git checkout <issue-number>-<slug>
      git pull origin <issue-number>-<slug> || true
    else
      git checkout -B <issue-number>-<slug> origin/master
    fi
    ```

- **Step 4 (Docs)**: Read the glossary (profile `glossary`), the single issue body, relevant ADRs, and the affected area's code + tests (located via the architecture/concept map the profile names). There is no parent PRD to read.

- **Step 7 (PR)**: Target the default branch, not a base branch:
  ```bash
  gh pr create \
    --base master \
    --head <issue-number>-<slug> \
    --title "<issue-title>" \
    --body "Fixes #<issue-number>\n\n## Summary\n...\n\n## Acceptance criteria\n...\n\n## Test plan\n..."
  ```
  The `Fixes #<issue-number>` line is still load-bearing for `/afk-merge-pr --single`.

- **Step 8 (Cleanup-issue helper)**: Title format changes to `[ship-cleanup] Issue #<issue-number> — residual concerns`. Search:
  ```bash
  gh issue list --label ship-cleanup --search "Issue #<issue-number> in:title" --json number,url --limit 5
  ```
  Cleanup issue is **lazy-created only on residue** (matches `/ship-issue`'s policy). Do NOT create one speculatively. If no residue is logged this run and no cleanup issue exists, leave `cleanup_issue: null` in the return.

- **Step 9 (Return)**: Use single-issue keys:
  ```json
  {
    "skill": "afk-execute-issue",
    "mode": "single",
    "result": "pr_opened" | "no_pr_needed" | "issue_closed" | "regression" | "ac_missing" | "git_failure" | "push_failure" | "dirty_tree_foreign" | "missing_issue" | "structural_bug_prd_child",
    "issue_number": <n>,
    "pr_number": <n> | null,
    "pr_url": "..." | null,
    "feature_branch": "..." | null,
    "skill_lens": "<lens name>" | null,
    "tests": {"backend": "pass" | "fail" | "n/a"},
    "cleanup_issue": <n> | null,
    "cleanup_entries_added": [<entry tags>],
    "notes": "<short freeform>"
  }
  ```
  PRD-mode `result` values not used in single mode: `no_children`, `prd_closed`, `missing_prd`.

PRD-mode behavior follows the steps below unchanged.

## Step 0.0 — Resilience setup (mandatory)

Apply `.claude/skills/_afk-shared/resilience.md` for the whole run:

- **Non-interactive, time-boxed shell (§1).** Wrap every `gh` call and every remote `git` call (`fetch`/`pull`/`push`/`clone`/`ls-remote`/remote-ref `checkout`) as `GH_PAGER=cat GIT_PAGER=cat GIT_TERMINAL_PROMPT=0 timeout <N> <cmd>` — `N=120` for gh metadata/GraphQL, `N=180` for fetch/pull/push/checkout. Local-only git (`status`/`add`/`commit`/`rev-parse`) needs no wrapper. On a second timeout (exit 124), take this skill's documented failure path for that op (`git_failure` / `push_failure`) and log a `[hang-timeout]` cleanup entry. This prevents the pager/credential/network wedges that otherwise freeze the orchestrator forever.
- **Heartbeat (§2, optional).** A passive progress log — nothing reads it to make decisions and the run does not depend on it; it is only a trace you can `tail` while watching this agent in the live display. If a heartbeat token was passed, you may append `echo "$(date +%s) | <phase> | <detail>" >> tmp/afk/heartbeat-<token>.log` at the start of a Step or before a long command. Omitting it has no effect.

## Step 0 — Orchestrated-mode preamble

Mandatory at the start of every invocation. Must complete before any other step.

### 0a. Git state normalization

```bash
git status --porcelain
```

- **Clean tree** → proceed
- **Dirty tree containing changes that look like a previous AFK rescue state** (uncommitted edits to files plausibly part of an interrupted afk-* run) → `git stash push -m "afk-rescue-execute-issue-$(date +%s)"`, proceed, pop later if appropriate
- **Dirty tree with foreign uncommitted work** (unrelated to any open PRD branch) → emit:
  ```json
  {"result": "dirty_tree_foreign", "details": "<git status output>"}
  ```
  Stop.

### 0b. Scratch dir cleanup

```bash
mkdir -p tmp/afk
find tmp/afk/ -type f -mmin +30 -delete 2>/dev/null || true
```

### 0c. Confirm orchestrated mode

This skill is *only* meant to be called by the orchestrator. Behavior is autonomous regardless. Note in the structured return that the run was orchestrated.

## Step 1 — Fetch the PRD and its child issues

```bash
gh issue view <prd-number> --json number,title,body,state,url
gh issue list --state open --limit 200 --json number,title,body,labels,url
```

Filter children: an issue whose body contains `## Parent PRD` followed by a reference to `#<prd-number>`. Use the `/prd-to-issues` template structure (Parent PRD section, Acceptance Criteria checklist).

Build a candidate list with `number`, `title`, `url`, and `blockedBy` (parse `Blocked by #N` lines from the body).

If the PRD itself is `CLOSED`, return:
```json
{"result": "prd_closed", "prd_number": <prd-number>}
```

## Step 2 — Pick the next eligible child

**Pinned-child short-circuit (`--child <issue-number>`):** If invoked with `--child`, skip the candidate scan entirely. Validate the pinned child against the same skip rules used below (1: closed; 2: has open PR; 3: blocked by unclosed). On any skip-rule hit return `{"result": "child_ineligible", "child": <n>, "reason": "<closed|has_open_pr|blocked>"}` immediately. On pass, set the pinned child as "this is the one" and proceed to Step 3. Do not iterate other candidates.

For each candidate, check whether a PR already exists:

```bash
gh pr list --search "Fixes #<child-number>" --state open --json number,url -q '.[0]'
```

Skip rules in order:
1. Child is closed → skip
2. Child has any open PR → skip (orchestrator handles existing PRs via `/afk-address-pr`)
3. Child is blocked by an unclosed issue → skip
4. First candidate satisfying none of the above → **this is the one**

If no candidate is eligible:
- **All children done or have open PRs and none unblocked-fresh remain** → return:
  ```json
  {"result": "no_children", "prd_number": <n>, "children_with_open_prs": [<list of pr urls>], "blocked_children": [<list>]}
  ```
- **All remaining children locked in a blocking cycle** (every unclosed child is blocked by another unclosed child) → call the cleanup-issue helper (Step 8) with a `cycle` entry, then return:
  ```json
  {"result": "no_children", "cycle_detected": true, "cleanup_issue": <n>}
  ```

## Step 3 — Establish branches

### Base branch resolution — adopt-existing first, derive as fallback

Before deriving the base branch from the PRD title, check origin for an existing PRD base branch:

```bash
git fetch origin
git ls-remote --heads origin "prd-<prd-number>-*" | awk '{print $2}' | sed 's|refs/heads/||'
```

- **One match** → adopt it as the base branch (skip derivation)
- **Multiple matches** → adopt the shortest-named one; log `[multiple-prd-base-branches]` to cleanup
- **Zero matches** → derive the name from the PRD title:
  - Strip leading `PRD:` (case-insensitive), trim
  - Lowercase, replace any run of non-alphanumerics with `-`, collapse doubles, strip leading/trailing `-`
  - Cap at 40 chars
  - Prepend `prd-<prd-number>-`

If the orchestrator passed an explicit `<base-branch>` (it always does after Step 1's adoption), use that and skip derivation entirely.

Derive feature branch from the child issue: `<child-number>-<slug>`, slug derived the same way as a derived PRD slug, capped at 40 chars.

Branch setup with retry-and-log on failure:

```bash
set -e
git stash push -m "afk-rescue-state" 2>/dev/null || true
git fetch origin

if git show-ref --verify --quiet refs/heads/<base-branch>; then
  git checkout <base-branch> && git pull origin <base-branch> || true
elif git show-ref --verify --quiet refs/remotes/origin/<base-branch>; then
  git checkout <base-branch> && git pull
else
  git checkout master && git pull
  git checkout -b <base-branch>
  git push -u origin <base-branch>
fi

if git show-ref --verify --quiet refs/heads/<child-number>-<slug> || git show-ref --verify --quiet refs/remotes/origin/<child-number>-<slug>; then
  git checkout <child-number>-<slug>
  git pull origin <child-number>-<slug> || true
else
  git checkout -b <child-number>-<slug>
fi

git stash pop 2>/dev/null || true
```

**The base branch's master sync is NOT yours** (PRD mode). `/ship-feature` merges `origin/master` into `<base-branch>` once at setup, in the base worktree it exclusively owns, before any child branch is cut ("Base-branch master sync" in that skill). Do not merge or rebase `<base-branch>` here: you run in a slot worktree that cannot even check it out, and a second sync would race the orchestrator. Your `git pull origin <base-branch>` above already picks up the synced tip. In `--single` mode there is no base branch — you branch straight off `origin/master`, which is current by construction.

If any of the above fails persistently (auth, network), retry once. On second failure, call cleanup-issue helper with a `git_failure` entry and return:
```json
{"result": "git_failure", "details": "...", "cleanup_issue": <n>}
```

If `git stash pop` produces conflict markers, attempt resolution preferring the rescued state. If the conflict is irreducible, abort the pop (`git checkout -- .`) and continue without the rescue state — log to cleanup if material work was lost.

## Step 4 — Understand before you code (lean read order)

Mandatory per the repo's documentation doctrine (the lean canon: glossary + ADRs + architecture/concept map; locations per the profile). Read in this order:
1. The glossary (profile `glossary`)
2. The parent PRD body in full
3. The child issue body in full — **including the `## Implementation plan (agreed via /expand-issue)` section if present; it is the agreed HITL spec, build to it.**
3.5. **The expand-issue walkthrough comment if present** — `gh issue view <child-number> --comments`, find the one whose first line is `<!-- expand-issue:walkthrough -->`. It is the why-first planning briefing (point-in-time; correct as of planning).
4. Locate the affected area via the architecture/concept map (pointer map), then read the area's **code and tests** — under the lean canon they are the only "how it works" source (no feature READMEs or flow docs exist, by design)
5. Relevant non-Superseded ADRs; for wire-contract work, the contract doc(s) the profile's External contracts section names

**Strict scope**: code changes restricted to the child issue's Acceptance Criteria (or, absent that, the equivalent spec section below). Do not implement future slices.

If the child issue has no `## Acceptance Criteria` section, check for an equivalent structured spec section before flagging anything: `## Fix` + `## Test`, `## User stories addressed`, or a similarly headed section that pins concrete expected behavior. If one is present, treat it as the de-facto spec and proceed — **do not** log an `ac_missing` entry; the issue already has an explicit contract, just under a different heading. Only log `ac_missing` (cleanup-issue helper) when no such section exists at all and the coder is working from unstructured prose. Do not halt either way.

## Step 5 — Choose the execution lens

Inspect ACs and likely files, then **route by file type to the repo's composite coder lens(es) per the profile** (e.g. backend source → the repo's backend TDD lens; frontend source → its frontend lens).

The chosen lens is authoritative for code structure and the TDD red-green loop + pre-PR consolidation pass.

## Step 6 — Implement the slice

1. Red: failing test for one AC
2. Green: minimum to pass
3. Repeat until every AC has a passing test
4. Consolidation pass (once, pre-PR): walk `.claude/skills/tdd/refactoring.md` over the finished slice — tidy duplication, naming drift, dead code; behavior unchanged, tests stay green. Design-level restructuring belongs to review.
5. Run the pre-push gate — build + the **fast lane** of the profile's `check_commands`, exactly as the profile spells them. Expensive lanes (integration rigs, contract regressions) are CI's job and run in parallel with review; do **not** run them here unless the profile declares a local-run exception (donor example: diffs touching persistence ran the emulator-backed integration lane once locally). Run the fast lane **exactly as spelled** — donor scar (the donor stack): an unfiltered `dotnet test` with the integration rig down yielded 214 hard failures that mimic a real regression.
6. Update the lean documentation canon only, per the repo's documentation doctrine — **do NOT create feature READMEs, flow docs, roadmap entries, or other standing docs outside the canon.** In scope: ADRs (apply the repo's ADR gate before writing a new one), the glossary (new domain terms), the architecture/concept map (map-level changes only), and the wire-contract doc(s) the profile declares if the public surface changes. **On ANY wire-contract change — new/changed route or verb, added/renamed/removed request or response DTO field, new status code — also update the repo's executable wire-contract artifact if the profile declares one** (donor example: a repo-owned Postman collection synced via its own skill). It is the only *executable* doc artifact, so it rots silently: code compiles and tests pass whether or not it is true. A missing publish credential blocks only the cloud *push*, never the in-repo edit — edit and commit the artifact regardless, and log the pending publish as residue rather than dropping the update.
7. Commit in logical units; descriptive messages matching repo style

### Regression handling (autonomous, never `[Skip]`)

If tests that were passing before your changes now fail:
1. Inspect the failure. If your slice plausibly caused it → fix it (this is in scope).
2. If the failure looks pre-existing or unrelated to your diff → confirm it fails on a clean baseline using the **same lane** it appeared in: `git stash && <the same check_commands lane>`.
3. If pre-existing on the clean baseline → call cleanup-issue helper with a `regression` entry detailing the failing test name, file, and observed failure mode.
4. **Never** add `[Skip(...)]` / `Skip=` (xUnit), `it.skip(...)`, or the equivalent in the repo's test framework. Leave the test failing, log it, and return `regression` outcome — orchestrator decides.

## Step 7 — Push and open the PR

```bash
git push -u origin <child-number>-<slug>
```

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

## Test plan
- [x] Build + fast lane (`check_commands`) green locally
- [ ] Expensive lanes — delegated to CI on this PR
EOF
)"
fi
```

The `Fixes #<child-number>` line is load-bearing — `/afk-merge-pr` parses it.

If `git push` fails for non-conflict reasons (auth, branch protection blocking the orchestrator), call cleanup-issue helper with a `push_failure` entry and return:
```json
{"result": "push_failure", "details": "...", "cleanup_issue": <n>}
```

If the push has conflicts with the remote feature branch (someone else pushed), attempt `git pull --rebase`. If rebase conflicts: resolve preferring our side (`git checkout --ours <file>` then re-stage), log residue to cleanup. Continue.

## Step 8 — Cleanup-issue helper (`upsert_cleanup_issue`)

Whenever this skill needs to log residue, invoke this routine:

1. Search for an existing cleanup issue:
   ```bash
   gh issue list --label ship-cleanup --search "PRD #<prd-number> in:title" --json number,url --limit 5
   ```
2. **If exists**: fetch its body, append a new checklist line, `gh issue edit <n> --body-file <scratch>`.
3. **If not exists**: create it.
   ```bash
   gh issue create \
     --title "[ship-cleanup] PRD #<prd-number> — residual concerns" \
     --label ship-cleanup \
     --label automation/blocked \
     --body "..."
   ```

Standard entry formats:

| Concern | Entry format |
|---|---|
| Cycle | `- [ ] [cycle] Children locked in a blocking cycle: <list>. Manual triage required.` |
| Git failure | `- [ ] [git-failure] Branch ops failed for child #<n>: <error summary>` |
| Push failure | `- [ ] [push-failure] Push failed for branch <name>: <error summary>` |
| Regression | `- [ ] [regression] PR #<pr> child #<child>: pre-existing failing test \`<test-id>\` at \`<file>\`. Observed: <stderr summary>` |
| AC missing | `- [ ] [ac-missing] Child #<n>: no Acceptance Criteria section; reviewed against user stories.` |

## Step 9 — Emit structured return

Final output to chat MUST end with a fenced JSON block. Orchestrator parses this; nothing else.

```json
{
  "skill": "afk-execute-issue",
  "result": "pr_opened" | "no_children" | "prd_closed" | "regression" | "ac_missing" | "git_failure" | "push_failure" | "dirty_tree_foreign" | "missing_prd",
  "prd_number": <n>,
  "child_number": <n> | null,
  "pr_number": <n> | null,
  "pr_url": "..." | null,
  "base_branch": "prd-<n>-..." | null,
  "feature_branch": "..." | null,
  "skill_lens": "<lens name>" | null,
  "tests": {
    "backend": "pass" | "fail" | "n/a"
  },
  "cleanup_issue": <n> | null,
  "cleanup_entries_added": [<entry tags>],
  "notes": "<short freeform>"
}
```

Free prose summary may precede the JSON block but the JSON block itself is required.

## Critical Rules

1. **Never halt without emitting a structured JSON return.** Even on hard failure.
2. **Never `[Skip(...)]` a regression** (or the repo's test-framework equivalent). Log + return.
3. **Never target the default branch in PRD mode.** Always the PRD base branch. (`--single` mode targets the default branch by design.)
4. **Never exceed the child issue's AC scope.**
5. **Best-effort first, log second, return third.** Do not ask for human input.
6. **One commit unit per logical change**, all with green tests.
7. **The cleanup-issue helper is single-issue-per-PRD.** Never create two ship-cleanup issues for the same PRD.
8. **Leave the working tree on the feature branch** at end of run, with no dangling stashes (pop or drop them).
9. **Delete any scratch files** written under `tmp/afk/` before returning.

## Edge Cases

- **PRD itself closed** → `result: prd_closed`
- **No child issues exist yet** → `result: no_children` (note in `notes`: PRD has zero children — `/prd-to-issues` may not have run)
- **All candidates have open PRs** → `result: no_children` with `children_with_open_prs` populated; orchestrator routes to address/merge for each
- **Cycle of blockers** → log + `result: no_children` with `cycle_detected: true`
- **Stash pop conflicts** → resolve preferring rescued state; log residue
- **Test suite red baseline before changes** → log regression, do not fix unrelated failures, do not touch the slice; emit `result: regression`
