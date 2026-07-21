---
name: afk-concede-thread
description: Per-thread concession primitive for the autonomous orchestrator. Appends a structured concession entry to the PRD's ship-cleanup issue, posts a reply marker on the thread, and resolves the thread via GraphQL. Refuses to concede Axis-A threads unless --force-axis-a is passed (orchestrator only uses this in the forced-merge path). Replaces /concede-pr's whole-PR concession with thread-granular concession. Invoked by /ship-feature; do not invoke directly.
---

# AFK Concede Thread

Per-thread concession primitive. Replaces the whole-PR concession of `/concede-pr` with thread-granular concession that:
1. Appends a structured concession entry to the PRD's single `[ship-cleanup]` issue
2. Posts a reply on the thread linking to the cleanup issue
3. Resolves the thread via GraphQL

Used by the `/ship-feature` orchestrator when:
- A thread has been rejected on 3 consecutive review rounds (Axis-B only, normal mode)
- The PR has reached the 7-round hard cap and the orchestrator is forcing merge (`--force-axis-a` for any remaining Axis-A blockers)

Where this skill says `master`, use the repo's default branch.

## Invocation

`/afk-concede-thread <pr-number> <thread-id> <reason> [--force-axis-a]`

Required args:
- `<pr-number>` — the PR containing the thread
- `<thread-id>` — GraphQL thread ID
- `<reason>` — short string explaining why concession is happening (e.g., "rejected 3 rounds", "round limit reached")

Optional flag:
- `--force-axis-a` — only legal when invoked by the orchestrator's forced-merge path. Allows concession of `[AXIS-A]` threads with extra-loud cleanup-issue tagging.

## Step 0.0 — Resilience setup (mandatory)

Apply `.claude/skills/_afk-shared/resilience.md` §1 for the whole run: wrap every `gh` call and every remote `git` call as `GH_PAGER=cat GIT_PAGER=cat GIT_TERMINAL_PROMPT=0 timeout 120 <cmd>` (concede touches only gh metadata/GraphQL — no long commands). On a second timeout, note `[hang-timeout]` and emit the relevant failure result. **This skill runs inline in the orchestrator's own loop (not as a separate background Agent), so §1 is its only protection against a hang freezing the orchestrator** — there is no heartbeat to emit here.

## Step 0 — Orchestrated-mode preamble

```bash
git status --porcelain
mkdir -p tmp/afk
find tmp/afk/ -type f -mmin +30 -delete 2>/dev/null || true
```

## Step 1 — Fetch thread and PR context

```bash
gh repo view --json owner,name
gh pr view <pr-number> --json number,url,body
gh api graphql -f query='
query($owner: String!, $repo: String!, $pr: Int!) {
  repository(owner: $owner, name: $repo) {
    pullRequest(number: $pr) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          comments(first: 20) {
            nodes { id body path line author { login } }
          }
        }
      }
    }
  }
}' -f owner=<owner> -f repo=<repo> -F pr=<pr-number>
```

Find the thread by ID. If not found:
```json
{"result": "thread_not_found", "thread_id": "..."}
```

If `isResolved == true`:
```json
{"result": "thread_already_resolved", "thread_id": "..."}
```

## Step 2 — Classify Axis A vs Axis B

Read the first comment of the thread. Search for `[AXIS-A]` or `[AXIS-B]` markers.

- **`[AXIS-B]` thread + no flag**: proceed
- **`[AXIS-B]` thread + `--force-axis-a`**: proceed (flag is harmless on Axis-B)
- **`[AXIS-A]` thread + no flag**: **refuse**:
  ```json
  {"result": "refused_axis_a_no_force", "thread_id": "...", "reason": "Axis-A concession requires --force-axis-a flag (orchestrator forced-merge path only)"}
  ```
- **`[AXIS-A]` thread + `--force-axis-a`**: proceed; cleanup entry will use 🚨 prefix
- **No axis marker found**: treat as `[AXIS-B]` (default cautious classification)

## Step 3 — Identify cleanup scope (PRD or single-issue)

Parse the PR body for `Fixes #<n>` / `Closes #<n>` / `Resolves #<n>`. Call this `<linked-issue>`.

Inspect the PR's base branch:

- **Base branch starts with `prd-`** → PRD mode. Fetch `<linked-issue>` body and parse `## Parent PRD` for the PRD number. Cleanup-issue title key is `PRD #<prd-number>`.
  - If PRD number cannot be determined:
    ```json
    {"result": "no_prd_link", "details": "PR body or child issue does not reference a parent PRD"}
    ```
- **Base branch is the default branch** → single mode. Cleanup-issue title key is `Issue #<linked-issue>`. No parent-PRD lookup.

## Step 4 — Upsert the cleanup issue

Search by mode-appropriate title key:

```bash
# PRD mode:
gh issue list --label ship-cleanup --search "PRD #<prd-number> in:title" --json number,body --limit 1

# Single mode:
gh issue list --label ship-cleanup --search "Issue #<linked-issue> in:title" --json number,body --limit 1
```

### Compose the concession entry

Extract from the thread's first comment:
- File path and line (from `path` and `line` fields)
- Rule source (look for `[<file>:<principle>]` after the priority marker)
- Concern summary (the first sentence after the rule source)

Entry format:

For Axis-B:
```
- [ ] [concession-axis-b] PR #<pr> thread <thread-id> · file: `<path>:<line>` · rule: `<rule-source>` · summary: "<one-line concern>" · reason: "<reason>"
```

For Axis-A (forced):
```
- [ ] 🚨 [concession-axis-a] PR #<pr> thread <thread-id> · file: `<path>:<line>` · AC: `<AC reference>` · summary: "<one-line concern>" · reason: "<reason>"
```

### Append or create

If the cleanup issue exists:
1. Fetch its current body
2. Append the new entry to the checklist
3. Write to scratch file `tmp/afk/cleanup-body-<ts>.md`
4. `gh issue edit <cleanup-number> --body-file <scratch>`
5. Delete scratch file

If the cleanup issue does not exist (lazy-create):
```bash
# PRD mode:
gh issue create \
  --title "[ship-cleanup] PRD #<prd-number> — residual concerns" \
  --label ship-cleanup \
  --label automation/blocked \
  --body "$(cat <<EOF
This issue tracks residual concerns from the /ship-feature autonomous orchestrator's run on PRD #<prd-number>.

Each entry is a deferred fix. Resolve via /drain-cleanup or by hand.

## Concessions

<entry from above>

EOF
)"

# Single mode:
gh issue create \
  --title "[ship-cleanup] Issue #<linked-issue> — residual concerns" \
  --label ship-cleanup \
  --label automation/blocked \
  --body "$(cat <<EOF
This issue tracks residual concerns from the /ship-issue autonomous orchestrator's run on Issue #<linked-issue>.

Each entry is a deferred fix. Resolve via /drain-cleanup or by hand.

## Concessions

<entry from above>

EOF
)"
```

Capture the cleanup issue number.

## Step 5 — Post the thread reply

```bash
gh api /repos/<owner>/<repo>/pulls/<pr-number>/comments/<first-comment-id>/replies \
  --method POST \
  -f body="Claude comment 🤖

⚠️ Conceded to cleanup issue #<cleanup-number>.

Reason: <reason>"
```

For Axis-A forced concessions, use 🚨 instead of ⚠️ and include:
```
🚨 AXIS-A CONCESSION (orchestrator forced-merge path).

This thread asserts a requirements gap that was not fully addressed before merge. Track in cleanup issue #<cleanup-number>.
```

## Step 6 — Resolve the thread

```bash
gh api graphql -f query='
mutation($id: ID!) {
  resolveReviewThread(input: {threadId: $id}) {
    thread { isResolved }
  }
}' -f id=<thread-id>
```

If the mutation fails, log the error in the structured return but do not roll back the cleanup-issue append.

## Step 7 — Emit structured return

```json
{
  "skill": "afk-concede-thread",
  "result": "conceded_axis_b" | "conceded_axis_a_forced" | "refused_axis_a_no_force" | "thread_already_resolved" | "thread_not_found" | "no_prd_link",
  "pr_number": <n>,
  "thread_id": "...",
  "axis": "A" | "B" | null,
  "cleanup_issue": <n> | null,
  "cleanup_issue_url": "..." | null,
  "thread_resolved": <bool>,
  "reason": "<the reason arg>",
  "notes": "..."
}
```

## Critical Rules

1. **Refuse Axis-A concession without `--force-axis-a`.** Defensive guard against orchestrator bugs.
2. **Always upsert the cleanup issue first** before resolving the thread. If the cleanup-issue write fails, do not resolve the thread — the audit trail must exist.
3. **Use the standard entry format** — `/drain-cleanup` parses these.
4. **Single cleanup issue per PRD.** Never create a second one.
5. **Always emit the structured JSON return.**
6. **Never concede a thread that's already resolved** — return `thread_already_resolved`.
7. **Always delete scratch files** before return.

## Edge Cases

- **First comment lacks AXIS marker** → default to Axis-B classification
- **Thread anchors on a deleted file** → use `path:0` in the entry, note in `summary`
- **Reply post fails but resolve succeeds** → return `result: conceded_*` with `notes` flagging the missing reply
- **GraphQL resolve fails** → return `thread_resolved: false` and the error in `notes`; orchestrator can retry
- **Cleanup issue creation hits API flake** → retry once; on second failure return `result: cleanup_create_failed`
