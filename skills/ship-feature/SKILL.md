---
name: ship-feature
description: Top-level autonomous orchestrator that ships an entire PRD end-to-end. Loops through every child issue of the PRD, dispatches the afk-coder subagent to implement and address feedback, dispatches the afk-reviewer subagent for independent review, applies per-thread concession after 3 rejects (Axis-B only), forces merge after 7 rounds with all-blocker concession, then opens and merges a PRD→master PR. Never halts; logs every residual concern to a single per-PRD ship-cleanup GitHub issue. Opt-in `--parallel <N>` mode runs up to N children concurrently, gated on a `Blocked-by:` DAG parsed from PRD child issues, with one git worktree per slot and merges serialized through GitHub's merge queue on the PRD base branch. Runs orchestrator and subagents on the profile's configured workhorse model — the orchestrator pattern assumes subagents are cheap. Use when the user runs /ship-feature <prd-number> to autonomously ship a feature.
---

# Ship Feature

(Extracted 2026-07 from the donor stack. Pipeline-generic; repo facts — check commands, workhorse model, wire-contract tooling — live in the repo's `.claude/doctrine/project-profile.md` overlay. `master` throughout denotes the repo's **default branch** — substitute `main` etc. per `gh repo view --json defaultBranchRef`.)

Autonomous orchestrator for shipping an entire PRD end-to-end. Replaces the manual sequence `/execute-issue → /review-pr → /address-pr → /review-pr → … → /merge-pr` with a self-driving loop that ships every child of a PRD and finalizes the PRD branch into master.

## Invocation

`/ship-feature <prd-number>`

`/ship-feature <prd-number> --dry-run` — walk the state machine and print planned actions without dispatching subagents or mutating GitHub.

`/ship-feature <prd-number> --parallel <N>` — opt into concurrent execution of up to N children (recommended ceiling: 3). Requires GitHub merge queue enabled on the PRD base branch (Step 0c). Combine with `--dry-run` to print the scheduler trace (which children would be dispatched in which order, when each unblocks, when each would merge) without doing any work. **The parallel scheduler is opt-in; without `--parallel`, the run is strictly sequential and identical to prior behavior.**

If no PRD number, ask. Do not guess.

## Critical principles (read first)

1. **A child is never skipped.** Every PR is merged — clean, with conceded threads, or with a forced merge after concession. Residual concerns are logged to the cleanup issue.
2. **Never halt for human input.** Every unresolvable condition becomes a cleanup-issue entry; the loop continues.
3. **Independent review is load-bearing.** The Coder and Reviewer subagents are different agents. Do not collapse them.
4. **GitHub is the durable state.** No local state file. Resumability via reconciliation from GitHub on re-invocation.
5. **Workhorse model end-to-end.** Both the orchestrator and the Coder/Reviewer subagents run on the profile's `workhorse_model` (donor: a cheaper, fast model). Premium models are forbidden from this flow — overkill for orchestration routing and prohibitive for multi-round subagent loops.
6. **The user's main repo checkout is never touched.** All implementation, branching, pushing, reviewing, and final master-merge prep happens inside dedicated sibling worktrees at `../<repo>-ship-prd-<prd-number>` (sequential mode) or `../<repo>-ship-prd-<prd-number>-slot<k>` for `k in 1..N` (parallel mode). The worktrees own the PRD base branch and child branches for their lifetime; the user can keep working on `master` (or any other branch) in their main checkout for the duration of the run.
7. **Parallelism is opt-in via `--parallel <N>` and DAG-gated.** Without the flag, the run is fully sequential and identical to prior behavior. With the flag, child issues are dispatched concurrently only when their `Blocked-by:` predecessors have merged; merges are always serialized — either via GitHub's merge queue on the PRD base branch (preferred, auto-detected at Step 0c) or via an orchestrator-side working-memory mutex (fallback, when merge queue isn't available — e.g., private repos on free GitHub plans). The scheduler is best-effort: any slot failure logs to cleanup and other slots keep flowing.

## Step 0a — Model preflight (fail-fast)

The orchestrator must run on the profile's workhorse model, not a premium model. Before any other step:

1. Read `workhorse_model` from the project profile (`.claude/doctrine/project-profile.md`).
2. Inspect the active model. The harness exposes the current model in the session header.
3. If the active model is **anything other than the profile's workhorse model** (any variant of that model family is acceptable; premium and mini tiers are not), stop immediately and tell the user:

   > /ship-feature must run on the profile's workhorse model (cost + architecture decision). Active model is `<X>`, profile says `<workhorse_model>`. Run `/model <workhorse_model>`, then re-invoke `/ship-feature <prd-number>`.

4. Do NOT attempt to switch models silently or proceed on a non-workhorse model.

This guard exists for two reasons:
- **Cost** — multi-round Coder↔Reviewer loops on a premium model burn an order of magnitude more than the orchestration value justifies
- **Architecture** — the orchestrator's job is routing on `result` / `verdict` JSON keys, not deep reasoning. The workhorse model handles routing and tool sequencing correctly; the heavy lifting was already deliberately split out into workhorse-model subagents

## Step 0b — Permission preflight (fail-fast)

Read `.claude/settings.local.json`. The orchestrator requires the following permission entries (or broader equivalents):

- `Bash(gh:*)`
- `Bash(git status:*)`, `Bash(git checkout:*)`, `Bash(git fetch:*)`, `Bash(git pull:*)`, `Bash(git push:*)`, `Bash(git merge:*)`, `Bash(git rebase:*)`, `Bash(git worktree:*)`, `Bash(git rev-parse:*)`, `Bash(git branch:*)`, `Bash(git ls-remote:*)`, `Bash(git show-ref:*)`
- One `Bash(...)` entry per command in the profile's `check_commands` (donor: `Bash(dotnet test:*)`)
- `Read(./**)`, `Write(./**)`, `Edit(./**)`

If any required permission is missing, **stop immediately** and tell the user:

> Run `/update-config` to add the following entries to `.claude/settings.local.json`, then re-invoke `/ship-feature <prd-number>`:
> <list of missing entries>

Do not attempt to add permissions silently.

**Resilience preflight (mandatory, before first Agent dispatch):** Read `.claude/skills/_afk-shared/resilience.md` immediately after the permission check. It governs §1 — the non-interactive, time-boxed shell that prevents `gh` / remote-`git` / provisioning calls from hanging. There is no watchdog to arm and no `ScheduleWakeup` to load: every long-running step runs as a **visible** background `Agent` the operator can watch in the live agent display, and the harness's completion notification advances the state machine.

## Step 0c — Merge-strategy detection (parallel mode only)

**Skip this step entirely in sequential mode.** It only applies when `--parallel <N>` with `N > 1` is passed.

Concurrent slots must never merge to `<base-branch>` simultaneously — that produces rebase storms and possibly silently-broken merges. Two viable serialization strategies, in preference order:

1. **`merge_strategy = "queue"`** (preferred) — GitHub's merge queue on `<base-branch>` linearizes candidates, re-runs required checks against the latest base tip, and auto-rebases siblings. Requires GitHub Team/Enterprise on private repos (free plan does not enforce rulesets/queue on private repos).
2. **`merge_strategy = "mutex"`** (fallback) — orchestrator-side working-memory mutex: only one slot at a time holds the lock and runs a synchronous `gh pr merge --squash`; other slots that reach MERGE_CHILD wait on the mutex. After a merge releases the mutex, the orchestrator marks every other in-flight slot's branch as "stale-base" so its next dispatch starts with `git fetch && git rebase origin/<base-branch>`. Works on any GitHub plan; pays a rebase tax per merged sibling.

Detect which strategy applies:

```bash
gh api -H "Accept: application/vnd.github+json" \
  /repos/<owner>/<repo>/branches/<base-branch>/protection 2>/dev/null \
  | jq -e '(.required_merge_queue != null) or (.merge_queue_enabled == true)' >/dev/null
```

(The exact field surfaces vary by GitHub API version — treat both `merge_queue_enabled: true` on the branch protection payload AND the presence of a non-null `required_merge_queue` block as "enabled.")

- **Exit 0** (merge queue detected) → set `merge_strategy = "queue"`. `afk-merge-pr` will be invoked with `--auto`; SCHEDULER_TICK polls `mergedAt`.
- **Non-zero exit** (queue missing — either repo doesn't have it enabled OR plan doesn't support it) → set `merge_strategy = "mutex"`. Initialize `merge_mutex_holder = null` and `base_branch_tip = <current origin/<base-branch> SHA>` in working memory. Print a one-line notice:
  > Merge queue not detected on `<base-branch>`; using orchestrator-side merge mutex (synchronous serialized merges). For higher throughput, enable GitHub merge queue (requires GitHub Team on private repos).
  Continue. Do not stop.

Do not attempt to enable merge queue silently. The user controls plan/repo settings.

## Step 1 — Validate PRD and reconcile state

```bash
gh issue view <prd-number> --json number,title,body,state,url
```

If `state == "CLOSED"` → stop, ask the user if they meant a different PRD.

Derive PRD base branch name (same algorithm as `/afk-execute-issue`):
- Strip `PRD:`, lowercase, non-alphanum→`-`, collapse, trim, cap 40, prepend `prd-<n>-`

### Adopt-existing branch detection (must run before falling back to derived name)

Before treating the derived name as authoritative, query origin for **any** branch matching `prd-<prd-number>-*`:

```bash
git ls-remote --heads origin "prd-<prd-number>-*" | awk '{print $2}' | sed 's|refs/heads/||'
```

- **Zero matches** → use the derived name; Step 2 will create the branch
- **Exactly one match** → adopt that branch as `<base-branch>` for the rest of the run, regardless of whether the derived name matches
- **Multiple matches** → adopt the **shortest-named** branch (assumed canonical) and append a `[multiple-prd-base-branches]` entry to the cleanup issue listing the others; this is a PRD-config anomaly worth surfacing

Local branch detection is identical:

```bash
git branch --list "prd-<prd-number>-*"
```

If the local branch differs from the adopted remote branch, prefer the remote and `git branch -D <local-stale>` before checkout — local stale branches are common after PRD-name churn.

### Reconcile from GitHub

```bash
gh pr list --search "base:<base-branch>" --state open --json number,title,headRefName,url --limit 50
gh pr list --search "base:<base-branch>" --state merged --json number,title,headRefName,url --limit 50
gh issue list --label ship-cleanup --search "PRD #<prd-number> in:title" --json number,url --limit 1
```

Build an in-memory map:
- Open child PRs (in-flight)
- Merged child PRs (already shipped)
- Cleanup issue (if exists; else lazy-create later on first concern)

### Worktree setup (isolation from the user's main checkout)

`/ship-feature` runs the entire implementation flow inside dedicated git worktree(s) at sibling paths so the user's main working copy is never touched. The user's main repo may be on any branch with any uncommitted state — this skill does not care. The classic "dirty tree → stop" check on the main repo is intentionally removed.

#### Sequential mode (default — no `--parallel`)

Single worktree, identical to prior behavior.

1. Compute the worktree path. It is a sibling of the repo root named `<repo-basename>-ship-prd-<prd-number>`:
   ```bash
   REPO_ROOT="$(git rev-parse --show-toplevel)"
   REPO_BASE="$(basename "$REPO_ROOT")"
   WORKTREE_PATH="$(dirname "$REPO_ROOT")/${REPO_BASE}-ship-prd-<prd-number>"
   ```
2. `git fetch origin && git worktree prune`.
3. If a worktree already exists at `$WORKTREE_PATH` (prior crashed run, or active resume), **reuse it** (verify via `git worktree list --porcelain`). Inside the worktree, ensure it's on `<base-branch>` and clean:
   ```bash
   ( cd "$WORKTREE_PATH" && git checkout <base-branch> && git pull --ff-only origin <base-branch> )
   ```
   Do not delete or recreate — resumption logic relies on GitHub state as authoritative; the worktree just holds the local checkout.
4. Otherwise create the worktree, owning `<base-branch>` for its whole life:
   - **Base branch exists on origin** (adopted from Step 1):
     ```bash
     git worktree add "$WORKTREE_PATH" -B <base-branch> origin/<base-branch>
     ```
   - **Base branch does not exist yet** (derived name, zero remote matches): create it inside the worktree off `origin/master`, then push:
     ```bash
     git worktree add "$WORKTREE_PATH" -b <base-branch> origin/master
     ( cd "$WORKTREE_PATH" && git push -u origin <base-branch> )
     ```
4b. **Sync the base branch forward from master** (see "Base-branch master sync" below) — run it here, in the base worktree, before any child branch is cut from `<base-branch>`. Skip only when the base branch was just created off `origin/master` in 4 (it is already current).
5. **All subsequent Agent dispatches and any local git/gh operations the orchestrator runs must use `$WORKTREE_PATH` as their working directory.** The orchestrator passes the path into each Agent prompt; agents `cd` into it before any tool use. The orchestrator itself uses `( cd "$WORKTREE_PATH" && <cmd> )` for every git op.

#### Parallel mode (`--parallel <N>`)

N+1 worktrees total: one "base" worktree owning `<base-branch>` for orchestrator-side ops (reconciliation, finalize-PRD merge), and N "slot" worktrees `slot1 .. slotN` for concurrent Coder/Reviewer work. Each slot worktree starts on `<base-branch>` and gets re-pointed to a child branch when claimed.

1. Compute paths:
   ```bash
   REPO_ROOT="$(git rev-parse --show-toplevel)"
   REPO_BASE="$(basename "$REPO_ROOT")"
   BASE_WT="$(dirname "$REPO_ROOT")/${REPO_BASE}-ship-prd-<prd-number>"
   for k in $(seq 1 <N>); do
     SLOT_WT_k="$(dirname "$REPO_ROOT")/${REPO_BASE}-ship-prd-<prd-number>-slot${k}"
   done
   ```
2. `git fetch origin && git worktree prune`.
3. Create or reuse `$BASE_WT` exactly as in sequential mode steps 3–4b above — **including the master sync (4b), which must complete and push before any slot worktree is created**, since slots detach at `origin/<base-branch>` and would otherwise pin the pre-sync tip. **Important:** `$BASE_WT` owns `<base-branch>` exclusively. Slot worktrees must never check out `<base-branch>` directly (git refuses anyway — a branch can only be in one worktree at a time).
4. For each slot `k`, create or reuse `$SLOT_WT_k`. A slot worktree's *initial* state is a detached HEAD at `origin/<base-branch>` (so `<base-branch>` itself stays exclusively in `$BASE_WT`):
   ```bash
   if ! git worktree list --porcelain | grep -q "$SLOT_WT_k"; then
     git worktree add --detach "$SLOT_WT_k" origin/<base-branch>
   fi
   ```
   When the slot scheduler claims a child issue for slot `k`, the orchestrator (or the Coder via its dispatch prompt) checks out the child branch inside `$SLOT_WT_k`:
   ```bash
   ( cd "$SLOT_WT_k" && git fetch origin && git checkout -B <child-branch> origin/<base-branch> )
   ```
   After the child's PR merges into `<base-branch>` via merge queue, the slot is released:
   ```bash
   ( cd "$SLOT_WT_k" && git checkout --detach origin/<base-branch> )
   ```
   The slot is now eligible to claim a new child.
5. **Working-directory routing:**
   - Reconciliation, DAG build, finalize-PRD merge, and any orchestrator-side `gh`/`git` ops run inside `$BASE_WT`.
   - Each Agent dispatch for a child runs inside its assigned `$SLOT_WT_k`. The orchestrator passes the slot path into the Agent prompt (see Subagent dispatch section).
   - The orchestrator MUST track `slot_assignments: {<k>: <pr_number | child_issue | null>}` in working memory so reviewer follow-up rounds reuse the same slot the Coder used (slot affinity per PR is mandatory — switching slots mid-PR would lose local context).

The afk-* subskills retain their own `dirty_tree_foreign` guard which will fire on whichever worktree they run in if it is unexpectedly dirty.

#### Base-branch master sync (both modes)

A PRD base branch is cut from `origin/master` **once**, at creation. Without this step it never resyncs, so every child is implemented, reviewed and merged against a master that has moved on, and the entire divergence is paid off in one big-bang merge at FINALIZE_PRD. (Donor scar that prompted this: a PRD base branch sat 7 commits behind master — three merged code PRs missing — one day after it was cut.) Run this in the base worktree at Step 1's 4b, before any child branch or slot worktree derives from `<base-branch>`:

```bash
( cd "$BASE_WT" && git fetch origin && git pull --ff-only origin <base-branch> )
BEHIND=$(cd "$BASE_WT" && git rev-list --count origin/<base-branch>..origin/master)
if [ "$BEHIND" -gt 0 ]; then
  ( cd "$BASE_WT" && git merge --no-edit origin/master ) && \
  ( cd "$BASE_WT" && git push origin <base-branch> )
fi
```

**Merge, never rebase.** The base branch is published and every child is cut from it — rebasing it would orphan them all. This is the same direction FINALIZE_PRD already merges (`origin/master` **into** `<base-branch>`), just paid incrementally.

**On conflict** (`git merge` exits non-zero): resolve hunk-by-hunk preferring both sides where orthogonal; for irreducible conflicts `git checkout --ours <file> && git add <file>` (`--ours` = the PRD side, since HEAD is `<base-branch>`), commit, push. Log a `[base-master-sync-conflict]` entry to the ship-cleanup issue naming each file resolved `--ours`, because that silently discards a master-side change from the PRD branch. **Never halt** — the orchestrator's contract holds.

**In-flight children are deliberately left alone.** A child branched off the pre-sync base still merges cleanly into the freshened base (git resolves against the merge-base) and its PR diff stays scoped to its own changes. Do **not** mass-rebase open child branches here — `needs_rebase` exists for merge-queue serialization, not for this. A stale child's only cost is that a semantic conflict with master surfaces at its own MERGE_CHILD instead of now, which the existing `merge_conflict` / `rebase_conflict` routing already handles.

**Once per run, at setup.** Do not re-sync on every SCHEDULER_TICK — mid-run base movement invalidates slot worktrees that are detached at `origin/<base-branch>`. FINALIZE_PRD's existing pre-flight merge catches anything that landed on master during the run.

## Step 1.5 — Build dependency DAG (parallel mode only)

**Skip this step entirely in sequential mode.**

The parallel scheduler needs to know which child issues are unblocked. Build the DAG from PRD child issues:

1. Enumerate every open child issue of the PRD:
   ```bash
   gh issue list --search "is:issue is:open <linkage-to-prd-<prd-number>>" \
     --json number,title,body,labels --limit 200
   ```
   (Use whatever sub-issue linkage convention the PRD uses — `## Parent PRD` line in body, `prd-<n>` label, or GitHub sub-issue API. Adopt the same enumeration `/afk-execute-issue` uses; do not invent a new one.)

2. For each child, parse `Blocked-by:` directives from the issue body. Accepted forms:
   - `Blocked-by: #123`
   - `Blocked-by: #123, #124`
   - `Blocked by #123` (case-insensitive, optional hyphen)
   Build `blockers[child] = [predecessor_issue_numbers]`.

3. Validate the graph:
   - **Unknown predecessor** (referenced issue is not a child of this PRD) → log `[dag-orphan-edge]` to cleanup, drop the edge, continue. Do not stop.
   - **Cycle detected** → log `[dag-cycle]` to cleanup with the cycle path, fall back to sequential mode for the rest of this run (single slot), continue.
   - **No `Blocked-by:` anywhere** → every child is independent; the scheduler will fully saturate N slots from tick 1.

4. Compute `ready_set` (initial state) = `{child : blockers[child] is empty OR every blocker has a merged child PR}`. Use the reconciled merged-PR map from Step 1 to resolve "merged."

5. Record DAG state in working memory:
   - `dag.nodes: {child: {state: 'pending'|'in_flight'|'merged'|'unmergeable', pr: null|<num>, slot: null|<k>}}`
   - `dag.edges: {child: [predecessors]}`

6. **Dry-run output (when `--parallel <N> --dry-run`):** Print a Mermaid-flavored or ASCII DAG showing nodes, edges, ready_set, and a simulated tick-by-tick schedule. Also print which `merge_strategy` Step 0c would choose ("queue" or "mutex") and, for mutex, note that each "merge" tick implies the merging slot blocks all others briefly. Example:
   ```
   merge_strategy: mutex (queue not detected)
   Tick 0: ready_set={#10, #11}, active={}, merged={}
           → claim slot1=#10, slot2=#11
   Tick 1: (sim) #10 ready to merge → acquire mutex (slot1), sync-merge, release
           → slot2 flagged needs_rebase; rebase on next dispatch
   Tick 2: (sim) #10 merged, #11 rebased & merged → ready_set={#12, #13}
   ...
   ```
   The dry-run simulation assumes ideal completion order; real runs may diverge. The goal is to expose the *shape* of the schedule, not predict timing. Stop after printing — no Agent dispatches, no `gh`/`git` mutations.

## Step 2 — Verify base branch state (inside the worktree)

Step 1's worktree setup already ensured `<base-branch>` exists locally and on origin. Verify the worktree is on it and up to date. In sequential mode `$WORKTREE_PATH` is the single worktree; in parallel mode use `$BASE_WT` (slot worktrees are detached, not on `<base-branch>`, by design):

```bash
( cd "$BASE_WT" && git rev-parse --abbrev-ref HEAD )   # must equal <base-branch>
( cd "$BASE_WT" && git fetch origin && git pull --ff-only origin <base-branch> )
```

(Read `$WORKTREE_PATH` and `$BASE_WT` as interchangeable for the sequential single-worktree case throughout the rest of this document.)

## Step 3 — Main loop

Track in working memory (no state file):
- `prd_number`, `base_branch`, `cleanup_issue_number` (or `null` until lazy-created)
- `shipped_clean: []`, `shipped_with_residue: []` (separated by axis), `unmergeable: []`
- For each in-flight PR: `pr_number`, `round_count`, `thread_reject_counts: {<thread_id>: <count>}`, `slot` (parallel mode only)
- Parallel mode only: `slot_assignments: {<k>: pr_number | null}`, `dag.nodes`, `dag.edges`, `ready_set`

### Sequential vs parallel dispatch

The state-machine *transitions* below (NEXT_CHILD / REVIEW / ADDRESS / MERGE_CHILD / FINALIZE_PRD / DONE) are identical in both modes — what changes is the *driver*:

- **Sequential mode (no `--parallel`):** one PR in flight at a time. The transition order is a single loop: NEXT_CHILD → REVIEW → ADDRESS → ... → MERGE_CHILD → back to NEXT_CHILD. The Coder/Reviewer dispatches inside it run **in the background as visible `Agent`s** (`run_in_background: true`) — driven by harness completion notifications, not a synchronous blocking `Agent` call — so the operator can watch each in the live agent display. Merge/concede still run inline in the orchestrator's own loop (protected by resilience.md §1). The transition order is unchanged from prior behavior.
- **Parallel mode (`--parallel <N>`):** up to N PRs in flight at once. The driver is a scheduler tick (described below) that dispatches Agent calls **in background** (`run_in_background: true`) and re-evaluates the state machine for each completing slot independently. Merges remain serialized via GitHub's merge queue (Step 0c), not via orchestrator-side mutex.

State machine:

### SCHEDULER_TICK (parallel mode only — replaces the top-level NEXT_CHILD driver)

Parallel mode wraps NEXT_CHILD in a tick loop that fills free slots from `ready_set`. Sequential mode skips this section entirely.

Tick procedure (runs whenever a slot completes or at startup):

1. **Refresh `ready_set`** from `dag.nodes`: a child is ready iff its state is `pending` AND every predecessor's state is `merged`.
2. **For each free slot `k` in slot_assignments** (i.e., `slot_assignments[k] == null`):
   - If `ready_set` is empty, leave the slot idle.
   - Else pop the lowest-numbered child from `ready_set`, mark its `dag.nodes[child].state = 'in_flight'`, `dag.nodes[child].slot = k`, `slot_assignments[k] = <pending pr_number>` (the actual PR number is filled once the Coder returns `pr_opened`).
   - Dispatch `afk-coder` for that child **with `run_in_background: true`** and the slot worktree path baked into the prompt (see Subagent dispatch — parallel mode).
3. **Wait for any background Agent to complete** (the harness notifies on completion; do not sleep-poll). On notification:
   - Route the structured return through NEXT_CHILD / REVIEW / ADDRESS / MERGE_CHILD as in sequential mode, but scoped to that slot only — other slots keep running.
   - When that slot's PR reaches MERGE_CHILD and the merge queue accepts the merge:
     - Mark `dag.nodes[child].state = 'merged'`.
     - Release the slot: `slot_assignments[k] = null`; reset the slot worktree to detached `origin/<base-branch>` (Step 1 slot-release recipe).
     - Re-enter SCHEDULER_TICK to potentially claim newly-unblocked children.
4. **Termination:** the scheduler exits when `slot_assignments` is all-null AND `ready_set` is empty AND every `dag.nodes[child].state` is `merged` or `unmergeable`. Proceed to FINALIZE_PRD.

**Slot affinity:** once a slot `k` is assigned to a PR, every subsequent dispatch for that PR (Reviewer rounds, Address rounds, force-concede dispatches) MUST run in slot `k`'s worktree until the PR is merged or marked unmergeable. Do not migrate a PR across slots mid-life.

**Merge serialization** — branch on `merge_strategy` set in Step 0c:

- **`merge_strategy == "queue"`:** the orchestrator dispatches `afk-merge-pr --auto` per slot in parallel; the merge queue on `<base-branch>` linearizes them. The slot is held until GH reports the PR `merged`, which the orchestrator detects by polling `gh pr view <pr> --json mergedAt,state` on each tick OR by listening for the harness's pull_request-event notification if available.

- **`merge_strategy == "mutex"`:** when a slot reaches MERGE_CHILD, check `merge_mutex_holder`:
  - If `null`: set `merge_mutex_holder = k`, dispatch `afk-merge-pr <pr_number>` **synchronously** (no `--auto`, no `run_in_background`) in slot `k`'s worktree. On any terminal result (`merged` / `merge_conflict` / `branch_protection`), release `merge_mutex_holder = null` immediately. On `merged`: bump `base_branch_tip` to the new SHA and mark every *other* in-flight slot's PR with `needs_rebase = true` in working memory. Re-enter SCHEDULER_TICK.
  - If non-null (another slot holds it): the slot's MERGE_CHILD transition is deferred. Record `slot_assignments[k].pending_merge = true` and yield back to SCHEDULER_TICK — the slot remains occupied. On every subsequent tick, slots with `pending_merge == true` re-attempt mutex acquisition. The orchestrator MUST NOT spin — it just re-checks at each natural tick boundary (when other slots complete Coder/Reviewer work).

**Stale-base handling (mutex mode only):** when a slot is flagged `needs_rebase = true`, its *next* Agent dispatch (whatever phase it's in — REVIEW, ADDRESS, or MERGE_CHILD) MUST be preceded inside the prompt by an explicit rebase instruction:
> "Before doing your normal work, run `git fetch origin && git rebase origin/<base-branch>` inside your worktree. If rebase succeeds cleanly, force-push the branch (`git push --force-with-lease`) and proceed. If rebase fails with conflicts, attempt resolution preserving both sides where orthogonal; on irreducible conflicts return `result: rebase_conflict` immediately so the orchestrator can route to ADDRESS."
After the rebase completes successfully (the Coder/Reviewer agent reports success in its return), clear `needs_rebase` for that slot. Rebase failures route through the existing `rebase_conflict` MERGE_CHILD logic.

**Concurrent cleanup-issue writes (known race):** multiple slots may simultaneously concede threads or log residue to the same cleanup issue. Body-edit writes will race and last-writer-wins. Mitigation: the afk-* subskills should prefer appending **comments** with structured markers (e.g., `<!-- residue:axis=B pr=#NN thread=TID -->`) over editing the issue body. This is a follow-up cleanup item in the afk-* skills, not in ship-feature itself — for now, accept that the cleanup-issue body may occasionally lose a duplicated entry across concurrent slots. Comments never race.

### NEXT_CHILD

In **sequential mode**, the top-level driver. In **parallel mode**, NEXT_CHILD is the per-slot inner transition triggered by SCHEDULER_TICK — it acts on the slot's claimed child, not on a global "next."

If any open child PRs exist for this slot (or, in sequential mode, anywhere — from reconciliation), pick the **lowest-numbered** open one and resume it at REVIEW (round = max(existing skill-authored review-rounds on the PR, 1)). Reject-counts are reset per the design (acceptable inefficiency on resume).

Otherwise dispatch `afk-coder` agent to run `/afk-execute-issue <prd-number>` (sequential) or `/afk-execute-issue <prd-number> --child <issue-number>` (parallel — passing the SCHEDULER_TICK-claimed child so the Coder doesn't re-pick).

Parse the structured return:
- `result: pr_opened` → set `pr_number`, `round_count = 1`, GO TO REVIEW
- `result: no_children` → if `cycle_detected`, append cycle entry to cleanup; either way GO TO FINALIZE_PRD
- `result: child_ineligible` (parallel mode only — returned when SCHEDULER_TICK passed `--child` and the pin failed validation) → release the slot, mark the child back to `pending` in the DAG only if reason is `has_open_pr` (resumable on next tick once that PR clears); mark `unmergeable` if reason is `closed` (shouldn't happen — DAG enumeration filters closed); leave `blocked` as `pending` (a predecessor will eventually unblock it). Re-enter SCHEDULER_TICK.
- `result: prd_closed` → stop; report
- `result: regression` / `git_failure` / `push_failure` / `dirty_tree_foreign` / `ac_missing` → log entry to cleanup if Coder didn't already; continue (re-dispatch on next iteration may pick a different child)
- `result: missing_prd` → stop; bug

If a child is genuinely unworkable (e.g., Coder returns repeated `git_failure` or `push_failure` on the same child despite retry), record in `unmergeable` and continue NEXT_CHILD with that child excluded from candidates.

### REVIEW

Dispatch `afk-reviewer` agent to run `/afk-review-pr <pr_number>` (Axis A + B) as a visible background `Agent` (`run_in_background: true`; see Background dispatch). Persist this Reviewer subagent across rounds on the same PR via `SendMessage`.

Parse the structured return — keep findings as `reviewer_verdict` for this PR.

#### Decision

- `verdict: approve` AND `axis_a_blockers == 0` AND `axis_b_blockers == 0` AND `axis_c == "pass"` AND no unresolved threads → GO TO MERGE_CHILD
- `axis_c: "superseded"` (Coder pushed mid-review; findings describe a stale diff) → re-dispatch Reviewer on the new head **without** incrementing `round_count` — a superseded review was never a real round
- `axis_c: "unknown"` (CI still pending at the reviewer's 15m cap, or cancelled) → re-dispatch Reviewer once to re-read CI without incrementing `round_count`. On a second `unknown`, log a `[ci-unknown]` cleanup entry and treat as `fail` — **never** as pass
- Otherwise → GO TO ADDRESS

**Axis C never enters the concession path.** The per-thread reject counter and the 3-reject Axis-B concession in ADDRESS apply to review *threads*; `axis_c` is a check-run fact carried on the verdict, not a thread. It is never conceded and never force-merged past — see the forced-merge exception below.

For each thread in `thread_outcomes` with `state in {still_open, pushback_rejected}`, increment that thread's `reject_count` in working memory.

### ADDRESS

Before dispatching Coder:

1. **Check per-thread reject limits.** For each thread with `reject_count >= 3` AND axis is `B`:
   - Dispatch `/afk-concede-thread <pr> <thread-id> "rejected 3 rounds"` (no `--force-axis-a`)
   - Update working memory: thread is now resolved
   - On `result: refused_axis_a_no_force` → leave the thread; orchestrator never auto-concedes Axis-A in normal mode

2. **Check round limit.** If `round_count >= 7`:
   - Force concede every remaining unresolved thread:
     - Axis-B: `/afk-concede-thread <pr> <id> "round limit reached"`
     - Axis-A: `/afk-concede-thread <pr> <id> "round limit reached" --force-axis-a`
   - **Axis-C gate on the forced merge.** Threads are opinions and can be conceded; a red CI lane is a fact and cannot. Before forcing:
     - `axis_c == "pass"` → GO TO MERGE_CHILD with `--force <cleanup-issue-number>`
     - `axis_c == "fail"` with **every** failing check marked `pre_existing_on_base: true` → the breakage is not this child's. Log a `[ci-pre-existing]` cleanup entry naming the checks, then GO TO MERGE_CHILD with `--force`. (Merging is correct here: blocking would stall the whole PRD on breakage the child cannot fix — the failure belongs to the base branch and is tracked separately.)
     - `axis_c == "fail"` with **any** failing check attributable to this PR → **do not force-merge.** Log a `[ci-fail-blocking]` cleanup entry with the check names and extracted assertions, mark the child `unmergeable`, and continue NEXT_CHILD.
     - `axis_c == "unknown"` → treat as attributable (same as the previous bullet). Never force-merge on an unobserved suite.

   This is the one deliberate exception to critical principle #1 ("a child is never skipped"). Force-merging a PR whose own changes break CI pushes known-broken code onto the PRD base branch, where it fails *every subsequent child's* CI — converting one stuck child into a stalled PRD. Stopping at one unmergeable child is strictly cheaper. The child is recorded, not silently dropped, and the final report surfaces it.

3. Otherwise dispatch `afk-coder` to run `/afk-address-pr <pr_number>` as a visible background `Agent` (`run_in_background: true`; see Background dispatch). Persist this Coder subagent across rounds on the same PR via `SendMessage`.

Parse the structured return:
- `result: pushed` → increment `round_count`, GO TO REVIEW
- `result: no_unresolved_threads` → GO TO REVIEW (Reviewer will likely return APPROVE)
- `result: regression` → cleanup entry should be present; force-concede any remaining blocker threads (per Axis), GO TO MERGE_CHILD with `--force`
- `result: rebase_conflict` → cleanup entry; force-concede + force-merge OR mark unmergeable. Decision: try once more by re-dispatching after a fetch; on second `rebase_conflict`, mark `unmergeable` and continue NEXT_CHILD.
- `result: push_failure` → mark `unmergeable`, NEXT_CHILD (the only case where a child genuinely cannot ship — push is impossible)
- `result: dirty_tree_foreign` → halt: this should not happen because Step 2 normalized state. Bug.

### MERGE_CHILD

If forced (round limit / regression / etc.):
```
/afk-merge-pr <pr_number> --force <cleanup-issue-number>
```

Otherwise:
```
/afk-merge-pr <pr_number>
```

**Parallel mode addendum** — depends on `merge_strategy` from Step 0c:

- **`merge_strategy == "queue"`:** `afk-merge-pr` is invoked with `--auto` (`gh pr merge --auto --squash`) so GitHub's merge queue linearizes candidates without blocking the orchestrator's tick loop. The slot is held until the PR's `mergedAt` becomes non-null. The orchestrator detects merge completion via SCHEDULER_TICK polling — the Agent return for an auto-merged PR is `result: merge_queued`, NOT `result: merged`, until the queue actually merges. On `merge_queued`, the orchestrator keeps the slot occupied and proceeds to poll; only on observed `mergedAt != null` does it release the slot and mark `dag.nodes[child].state = 'merged'`.
- **`merge_strategy == "mutex"`:** `afk-merge-pr` is invoked **without** `--auto` (synchronous merge). The orchestrator acquires the working-memory mutex first; only the mutex-holder calls the skill. Return is `result: merged` (synchronous), at which point the orchestrator: (1) bumps `base_branch_tip`, (2) marks every other in-flight slot `needs_rebase = true`, (3) releases the mutex, (4) releases the slot.

Parse the structured return:
- `result: merged` (sequential, or parallel mutex-mode, or parallel queue-mode after queue-confirmed merge) → **close the child issue explicitly** (do not rely on keyword propagation — see note below), record in `shipped_clean` (if no residue) or `shipped_with_residue` (split by axis), GO TO NEXT_CHILD (sequential) or release slot + (mutex mode only) release mutex + bump base tip + flag siblings + re-enter SCHEDULER_TICK (parallel)

  **Close the child issue after merge.** After a `result: merged` is confirmed, explicitly close the child issue:
  ```bash
  gh issue close <child-issue-number> --reason completed \
    --comment "Shipped via PR #<pr_number>, /ship-feature autonomous run for PRD #<prd_number>."
  ```
  This is necessary because keyword-based auto-close (`Fixes #N`, `Closes #N`) only fires when a PR merges directly into the default branch. Child PRs merge into the PRD base branch, not master, so keyword evaluation is silently skipped regardless of whether the keyword appears in the PR body or commit message. Even keywords in commit messages that later reach master via the FINALIZE_PRD merge are unreliable — squash commits may or may not carry them forward depending on where the coder placed the keyword. Explicit close is the only deterministic path. If `gh issue close` fails (e.g. already closed, missing permissions), log a `[issue-close-failed pr=#NN child=#CC]` entry to the cleanup issue and continue — a missed close is cosmetic, not a blocker.
- `result: merge_queued` (parallel queue-mode only) → slot remains occupied; SCHEDULER_TICK polls `gh pr view <pr> --json mergedAt,state` on subsequent ticks. On observed merge, transition to `merged`. If the PR transitions to `closed` without `mergedAt` (queue rejected it — required check failure on rebased base), GO TO ADDRESS.
- `result: merge_conflict` → re-dispatch `afk-coder` for `/afk-address-pr` to attempt rebase; if Coder returns `rebase_conflict` again, force-concede + retry merge; if still failing, mark `unmergeable`
- `result: branch_protection` → cleanup entry, mark `unmergeable`, NEXT_CHILD
- `result: changes_requested` / `unresolved_threads` → orchestrator bug (shouldn't reach here without forcing); halt with diagnostic
- `result: structural_bug_master_target` → halt; this is a PRD-config error

### FINALIZE_PRD

When `NEXT_CHILD` reports `no_children` and there are no open child PRs left:

1. Open PR from `<base-branch>` → `master`:
   ```bash
   gh pr create \
     --base master \
     --head <base-branch> \
     --title "PRD #<prd-number>: <PRD title>" \
     --body "$(cat <<EOF
   Closes #<prd-number>

   ## Summary
   Autonomous /ship-feature run shipping all children of PRD #<prd-number>.

   ## Children shipped
   <list of merged child PR numbers and titles>

   ## Cleanup issue
   #<cleanup-issue-number> (if exists; else "none")

   ## Forced merges
   <list of children merged via concession, if any>
   EOF
   )"
   ```

2. Attempt the master merge with **manual hunk-by-hunk resolution first**, fallback `-X theirs`. **All git operations happen inside the worktree on `<base-branch>`; `master` is never checked out — it stays as the `origin/master` remote ref.**
   ```bash
   ( cd "$WORKTREE_PATH" && git fetch origin )
   ( cd "$WORKTREE_PATH" && git checkout <base-branch> && git pull --ff-only origin <base-branch> )
   # Pre-flight: merge master INTO base-branch to surface and resolve conflicts on the PRD side.
   ( cd "$WORKTREE_PATH" && git merge --no-ff --no-commit origin/master )
   ```

   If conflicts:
   - For each conflicted file, attempt to resolve hunk-by-hunk preserving both sides where they're orthogonal
   - For irreducible conflicts: `git checkout --ours <file> && git add <file>` (prefers PRD-branch side — note `--ours` because we're sitting on `<base-branch>` merging `origin/master` in)
   - Document residue in cleanup issue with `[finalize-conflict]` entry per file
   - `git commit` the merge and `git push origin <base-branch>`
   - Then merge the PR via `gh pr merge <prd-pr-num> --merge --delete-branch` (NOT squash — preserves child commits)

   If `git merge --no-ff --no-commit` fails to even start (divergent histories, etc.):
   - `( cd "$WORKTREE_PATH" && git merge --abort )`
   - Append `[finalize-blocked]` entry to cleanup issue
   - Leave the PRD→master PR open
   - GO TO DONE without a master merge

3. If merged successfully, close the PRD issue (in case the squash merge into a base branch path means the keyword auto-close didn't fire):
   ```bash
   gh issue view <prd-number> --json state -q '.state'
   # if OPEN:
   gh issue close <prd-number> --reason completed --comment "Completed via PR #<prd-pr-num>, autonomous /ship-feature run."
   ```

3b. **Delete the parent-PRD scaffolding label.** The `prd-<prd-number>` label `/prd-to-issues` put on every child is temporary — its job ends when the PRD lands on master. **Only on a successful master merge** (skip on the `[finalize-blocked]` path, which leaves the PRD→master PR open and GOES TO DONE without a merge — the label must survive so the still-open children stay grouped):
   ```bash
   gh label delete "prd-<prd-number>" --yes 2>/dev/null || true   # no-op if the PRD wasn't labelled
   ```
   Deleting the label removes it from the (now-closed) children and keeps the repo's label list from accreting one dead `prd-*` label per shipped PRD.

3c. **Publish the wire-contract collection to its canonical store — autonomously, no HITL — only if the profile's External contracts section declares wire-contract publish tooling, only on a successful master merge, and only if this PRD touched the collection.** The collection advances per-child during the run; the canonical store (what the team demos from) is written **only from master, only here**. Detect touch via `gh pr diff <prd-pr-num> --name-only` against the profile-declared collection path; then run the profile-declared canonical-publish command inside the worktree. (Donor: a Postman sync tool whose publish command guards `HEAD == origin/master`, structurally diffs the cloud, reports any cloud-only requests the push would overwrite, pushes, and re-verifies. Mirrors `afk-merge-pr`'s per-child publish step.)
   - **Success** → report `Wire-contract publish: pushed` (or `already in sync`). If the tool reported overwritten cloud-only content, copy that under a `## Wire-contract publish — overwrote cloud-only requests` note on the cleanup issue — an audit trail, **not** a gate.
   - **Failure** (missing credentials, `HEAD` ≠ master, API error, verify failed) → append **one** `[pending-push]` entry to the cleanup issue and report `Wire-contract publish: failed — residue logged`. The only path that defers to a human; `/drain-cleanup` re-verifies it.
   - **Profile declares no wire-contract tooling** → skip this step entirely; report `Wire-contract publish: n/a`.

### DONE

1. Worktree cleanup:
   - **Sequential mode:** if the PRD→master PR merged cleanly (or with logged conflicts), AND there are no `unmergeable` children left in flight, remove the worktree now:
     ```bash
     git worktree remove --force "$WORKTREE_PATH"
     git worktree prune
     ```
   - **Parallel mode:** under the same clean conditions, remove every slot worktree and the base worktree now:
     ```bash
     for k in $(seq 1 <N>); do
       git worktree remove --force "$SLOT_WT_k" 2>/dev/null || true
     done
     git worktree remove --force "$BASE_WT"
     git worktree prune
     ```
     Slot worktrees may already be detached at `origin/<base-branch>` (released slots) or holding a stale child branch (unmergeable slot); `--force` covers both.
   - If any children are `unmergeable`, or `[finalize-blocked]` was logged, or the PRD→master PR is still open → **leave all worktrees in place** so the user can inspect/recover local state. Mention every worktree's absolute path in the final report, grouped by sequential vs parallel.
2. Generate the final report (next step).

## Step 4 — Final report

Print to chat **and** post a comment on the PRD issue:

```bash
gh issue comment <prd-number> --body "$(cat <<EOF
🤖 /ship-feature autonomous run complete.

## Summary
- Children shipped clean: <count>
- Children shipped with Axis-B residue: <count>
- Children shipped with Axis-A residue 🚨: <count>
- Children unmergeable (push/branch-protection failures): <count>
- PRD finalization: <merged-into-master | conflicts logged | blocked>
- Wire-contract publish: <n/a | untouched | pushed | already in sync | failed — residue logged>

## Cleanup issue
<link, or "none">

## Children
<table: pr_number | title | merged_at | residue_tags>

## Worktree(s)
<"removed", or the absolute path(s) if any child is unmergeable / finalize blocked / PRD PR still open. In parallel mode, list base + every slot worktree retained.>

## Parallelism (parallel runs only)
- Concurrency: <N> slots
- Merge strategy: <queue | mutex>
- Children dispatched concurrently: <max in-flight observed>
- DAG depth: <max blocked-by chain length>
- Children that were never gated by Blocked-by: <count>
- Forced rebases (mutex mode only): <count of needs_rebase flag firings>
EOF
)"
```

Chat output mirrors this.

## Subagent dispatch — implementation

To dispatch `afk-coder` and `afk-reviewer`, use the `Agent` tool. Each dispatch is one tool call. The subagent runs the relevant `/afk-*` skill internally.

### Model enforcement — MANDATORY

**Every Agent dispatch from /ship-feature MUST pass `model: "<workhorse_model>"` (the profile's value) explicitly.** Non-negotiable:

- The orchestrator itself already runs on the workhorse model (enforced by Step 0a model preflight)
- The `afk-coder.md` and `afk-reviewer.md` agent definitions may pin the model in frontmatter, but the harness can let the parent's model leak through to subagents in some configurations
- Passing the model at dispatch time overrides any inheritance and guarantees the workhorse model runs the work
- Workhorse end-to-end: orchestrator AND subagents. No premium model in the loop. This is a cost discipline — multi-round Coder↔Reviewer loops on a premium model are prohibitive

If the harness rejects the `model` parameter on a particular `subagent_type`, fall back to `general-purpose` with the explicit `model` parameter.

### Subagent type — handle harness fallback

Prefer `subagent_type: "afk-coder"` / `"afk-reviewer"` if the harness has registered the agent definitions as named subagent types. If those types are not available, fall back to `subagent_type: "general-purpose"` and prepend the prompt with `"Read .claude/agents/afk-coder.md (or afk-reviewer.md) first — that file governs your behavior."` Either way, **always pass the profile's workhorse model explicitly**.

**Every Agent prompt must begin with the worktree-CWD preamble** so the subagent operates inside the dedicated worktree, not the user's main checkout.

**Sequential mode preamble:**
> "Your working directory is `<WORKTREE_PATH>` — a dedicated git worktree owning the PRD base branch `<base-branch>`, not the user's main repo checkout. Before any tool use, `cd <WORKTREE_PATH>` so all subsequent Bash, file edits, and git operations stay inside the worktree."

**Parallel mode preamble** (slot-specific path baked in; one of `$BASE_WT` or `$SLOT_WT_k`):
> "Your working directory is `<SLOT_WT_k>` — slot `<k>` of `<N>` in a parallel /ship-feature run. This worktree currently holds child branch `<child-branch>` (detached `origin/<base-branch>` when idle). It is NOT the user's main repo checkout and NOT the base worktree (which lives at `<BASE_WT>` and exclusively owns `<base-branch>`). Before any tool use, `cd <SLOT_WT_k>`. Do not check out `<base-branch>` here — it is claimed by the base worktree."

### Background dispatch (both modes)

**Every Coder/Reviewer Agent dispatch — sequential or parallel, initial or `SendMessage` continuation — MUST pass `run_in_background: true`** so it appears in the live agent display and the operator can watch it. The orchestrator never blocks inside an `Agent` call: it drives on harness completion notifications. It does **not** poll, sleep-wait, or arm any `ScheduleWakeup` watchdog. If a child appears wedged, the operator sees it frozen in the display (no forward tool activity) and intervenes; a slow-but-working child shows ongoing activity and is left alone. Persisted Coder/Reviewer context (rounds via `SendMessage`) is preserved across rounds.

### Coder dispatch (initial child) — sequential

```
Agent(
  subagent_type: "afk-coder",      // or "general-purpose" with prompt prefix
  model: "<workhorse_model>",       // MANDATORY — the profile's value
  run_in_background: true,          // MANDATORY (both modes) — runs in background, visible in the agent display
  description: "Implement next child of PRD #<n>",
  prompt: "<sequential worktree-CWD preamble>. Then run /afk-execute-issue <prd-number>. Pick the next eligible child, implement it via TDD, branch off <base-branch>, open a PR targeting <base-branch>. Emit your structured JSON return at the end of your turn."
)
```

### Coder dispatch (initial child) — parallel

```
Agent(
  subagent_type: "afk-coder",
  model: "<workhorse_model>",        // MANDATORY — the profile's value
  run_in_background: true,           // MANDATORY in parallel mode
  description: "Implement child #<c> of PRD #<n> in slot <k>",
  prompt: "<parallel worktree-CWD preamble for slot <k>>. Then run /afk-execute-issue <prd-number> --child <c>. The orchestrator has already claimed child #<c> for this slot — do not re-pick. Branch off <base-branch> (use `git checkout -B <child-branch> origin/<base-branch>` inside this worktree), implement via TDD, open a PR targeting <base-branch>. Emit your structured JSON return."
)
```

### Coder dispatch (address feedback)

Re-use the same Coder subagent across rounds via `SendMessage` if the harness supports it; otherwise dispatch a fresh one with the PR's full context in the prompt. **In parallel mode, the dispatch MUST target the same slot `k` originally assigned to this PR (slot affinity), with `run_in_background: true`.**

```
Agent(
  subagent_type: "afk-coder",
  model: "<workhorse_model>",       // MANDATORY — the profile's value
  run_in_background: true,          // MANDATORY (both modes) — runs in background, visible in the agent display
  description: "Address review feedback on PR #<n>",
  prompt: "<worktree-CWD preamble for this PR's worktree (sequential: $WORKTREE_PATH; parallel: $SLOT_WT_<k>)>. Then run /afk-address-pr <pr-number>. This is round <r> on this PR. Address every unresolved thread; push back via reply on out-of-scope concerns. Emit your structured JSON return."
)
```

### Reviewer dispatch

Spin up a fresh Reviewer per new PR; persist within the PR via `SendMessage` or by re-dispatching with full context. **In parallel mode, the Reviewer for PR `<n>` runs in the same slot `k` as the Coder for PR `<n>` (slot affinity), with `run_in_background: true`.**

```
Agent(
  subagent_type: "afk-reviewer",
  model: "<workhorse_model>",       // MANDATORY — the profile's value
  run_in_background: true,          // MANDATORY (both modes) — runs in background, visible in the agent display
  description: "Review PR #<n> round <r>",
  prompt: "<worktree-CWD preamble for this PR's worktree>. Then run /afk-review-pr <pr-number>. <If follow-up: This is round <r>; you have prior threads on this PR — arbitrate any Coder pushback replies.> Emit your structured JSON return."
)
```

## Critical Rules

1. **Never halt for human input.** Every condition is either auto-resolvable, a forced concession, or a cleanup-issue entry.
2. **Never skip a child.** Every PR is merged — clean, conceded, or forced. The only `unmergeable` exception is when the push itself fails (auth/branch-protection on the orchestrator path).
3. **Never auto-concede Axis-A** in normal mode. Forced-merge path only.
4. **Always lazy-create the cleanup issue** on first concern, never up-front.
5. **Always emit final report to chat AND PRD issue comment.**
6. **Never bypass branch protection.**
7. **Always run preflight Steps 0a/0b (and 0c in parallel mode) before anything else.** Step 0b includes the resilience preflight: read `resilience.md` (it governs the §1 time-boxed shell that prevents `gh` / `git` / provisioning hangs) before first dispatch.
8. **Always reconcile from GitHub on re-invocation.** Open PRs targeting the PRD base branch are picked up and resumed.
9. **Never create more than one ship-cleanup issue per PRD.** Helper deduplicates by title search.
10. **Coder and Reviewer must be separate agent dispatches.** Independence is the design.
11. **Workhorse model end-to-end.** The orchestrator MUST run on the profile's workhorse model (Step 0a model preflight). Every Agent dispatch MUST pass that model explicitly (frontmatter alone is insufficient — the dispatch parameter is the load-bearing override). No premium model anywhere in this flow.
12. **Never touch the user's main checkout.** All implementation, branching, pushing, reviewing, and master-merge prep happens inside the dedicated worktree(s). `master` is never checked out — it stays as `origin/master` and the master-merge is staged by merging `origin/master` into `<base-branch>` inside `$BASE_WT` (or `$WORKTREE_PATH` in sequential mode).
13. **Parallel mode: merges are always serialized.** Step 0c picks the strategy: `queue` (preferred, GH merge queue, no orchestrator-side lock) or `mutex` (fallback, working-memory single-holder lock with synchronous `gh pr merge --squash`). Never run two `afk-merge-pr` calls concurrently in mutex mode. Never bypass either mechanism. In mutex mode, every merge bumps `base_branch_tip` and flags all other in-flight slots `needs_rebase`.
14. **Parallel mode: slot affinity is mandatory.** Once slot `k` claims a PR, every subsequent dispatch for that PR runs in slot `k` until the PR is merged or marked unmergeable. Migrating a PR across slots loses local context (uncommitted progress, build artifacts) and breaks the dirty-tree guard.
15. **Every Coder/Reviewer/Address dispatch — both modes — uses `run_in_background: true`** so it is visible in the agent display. The orchestrator drives on harness completion notifications; it never polls, sleep-waits, or arms a `ScheduleWakeup` watchdog. If a child wedges inside a tool call, the operator sees it frozen in the display (no forward tool activity) and intervenes — there is no auto-kill.
16. **Parallel mode: cleanup-issue concurrency is comment-append-only.** Body edits race across slots and silently lose entries; appending structured comments is the only safe pattern. (Mechanic implemented in the afk-* subskills, not here — but ship-feature must not attempt body edits to the cleanup issue from inside the parallel scheduler.)

## Edge Cases

- **PRD has no children yet** → report and stop; suggest `/prd-to-issues` first
- **Cleanup issue already exists from prior run** → append; never duplicate
- **Round 7 hit on a child with Axis-A blockers still open** → force-concede with `--force-axis-a`, force-merge with cleanup linkage; the 🚨 marker on the cleanup entry makes Axis-A residue visible
- **Master branch protection blocks the final PRD→master merge** → leave PR open, log to cleanup, report; leave the worktree in place so the user can inspect
- **Cleanup issue manually closed mid-run** → re-create on next concern (fresh title), log the gap
- **`--dry-run`** → walk the state machine and print intended actions; no `Agent` dispatches, no `gh` mutations, no `git` mutations (including no `git worktree add` / `git worktree remove`), no check-command runs. Print the worktree path that *would* be used. **With `--parallel <N>`, also print the DAG (nodes + edges + initial ready_set) and a simulated tick-by-tick scheduler trace** showing which child each slot claims at each tick under ideal-completion assumptions — the goal is to expose schedule shape, not predict timing.
- **Worktree already exists at the target path** → reuse it; do not delete or recreate. GitHub state remains the source of truth for resumption; the worktree just holds the local checkout.
- **Worktree creation fails** (e.g., path occupied by a non-worktree directory, or `<base-branch>` already checked out elsewhere) → log a `[worktree-setup-failed]` cleanup-issue entry, stop. The user can manually `git worktree remove` or rename the colliding directory and re-invoke.
- **User's main repo has `<base-branch>` checked out** → `git worktree add` will refuse to claim a branch already checked out. Log `[worktree-base-branch-claimed]` and stop with a message asking the user to switch their main checkout to a different branch and re-invoke.
- **`--parallel <N>` with `N == 1`** → degenerate parallel mode; degrade to sequential (no slot worktree overhead, no DAG required). Print a notice and proceed sequentially.
- **`--parallel <N>` with `N > 1` but PRD has only 1 unblocked child after DAG build** → run sequentially anyway (no benefit to spinning up extra worktrees). When the merged child unblocks downstream children, scale up to N slots dynamically as ready_set grows.
- **`--parallel <N>` with cycle detected in DAG** → log `[dag-cycle]` to cleanup, degrade to sequential mode for the rest of the run, continue. The cycle still gets shipped child-by-child as the orchestrator would have done without parallel.
- **`--parallel <N>` and merge queue gets disabled mid-run** (admin change, queue-mode only) → next `afk-merge-pr --auto` call returns `result: merge_queue_disabled`. The orchestrator logs `[merge-queue-disabled-midrun]` to cleanup, switches `merge_strategy` to `mutex` (initializing `merge_mutex_holder = null` and `base_branch_tip = <current SHA>` on the fly), and continues parallel execution under the mutex strategy. Do not stop. Do not degrade to sequential.
- **Mutex mode: a slot holds the mutex but its synchronous merge hangs / times out** (e.g., a stuck required check) → after a reasonable wall-clock budget (suggest 15 minutes) the orchestrator cancels that Agent dispatch, releases the mutex, marks the slot's PR `unmergeable`, logs `[mutex-merge-timeout pr=#NN]` to cleanup, and re-enters SCHEDULER_TICK. The hung PR is not retried automatically — the user investigates via the cleanup issue.
- **Mutex mode: rebase produces `rebase_conflict` repeatedly** on a slot whose base was bumped multiple times by siblings → after the second `rebase_conflict` return, force-concede any remaining blocker threads on that slot's PR and force-merge through the mutex on its next acquisition. Same fall-through as the existing `rebase_conflict` handling, just acknowledging that mutex mode multiplies the exposure.
- **`--parallel <N>` slot worktree creation fails partway** (e.g., disk full after creating 2 of 3 slot worktrees) → log `[slot-worktree-setup-failed slot=<k>]` to cleanup, reduce effective N to the number of successfully-created slots, proceed. Do not stop if at least one slot is available.
- **Parallel slot's PR enters auto-merge queue, then GH rejects it post-rebase** (required check failed against rebased base) → `mergedAt` stays null; PR may transition to `closed` or stay `open` depending on GH config. Orchestrator detects this via tick polling and routes back to ADDRESS for that slot. Slot remains occupied throughout.
- **Two slots conceding overlapping Axis-B threads simultaneously** (same thread ID? — impossible since threads are PR-scoped; same conceptual issue across different PRs — possible) → each slot logs a separate comment to the cleanup issue with its own `<pr=#NN thread=TID>` marker; downstream dedup happens at human-review time, not in the orchestrator.

## Examples

See `examples/` for:
- `cleanup-issue-template.md` — canonical structure of the `[ship-cleanup]` issue

(The donor also carried four worked run narratives — successful run, run with Axis-B concessions, forced merge after a pre-existing regression, AC-vs-review-thread conflict. They were donor-numbered/domain-flavored and were not ported; the state-machine sections above cover every path they illustrated.)
