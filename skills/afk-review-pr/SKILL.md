---
name: afk-review-pr
description: Autonomous-mode variant of /review-pr. Reviews a PR against its linked issue (Axis A) and coding standards (Axis B), arbitrates Coder pushback replies on follow-up passes, suppresses concerns already conceded in the PRD ship-cleanup issue, and emits a structured JSON return for the orchestrator. Invoked by /ship-feature via the afk-reviewer agent. Do not invoke directly from the CLI; use /review-pr for human-driven flow.
---

# AFK Review PR

Autonomous-mode fork of `/review-pr`. Same review logic — Axis A (requirements) and Axis B (standards) with `Claude comment 🤖` thread markers — with three structural changes:

1. **Pushback arbitration** — on follow-up passes, judge any reply prefixed `Claude comment 🤖\n\n⚠️ This appears out of scope` and either accept (resolve thread) or reject (restate concern as reply, do not create a new thread)
2. **Concession-aware suppression** — read the PRD's ship-cleanup issue and skip Axis-B findings that semantically match already-conceded entries
3. **Structured JSON return** for the orchestrator including verdict, blocker counts split by axis, and per-thread outcomes

**Repo facts come from the profile** (`.claude/doctrine/project-profile.md`): the doctrine index that maps touched areas to rule files, the CI checks Axis C reads, wire-contract artifacts. Where this skill says `master`, use the repo's default branch.

## Invocation

`/afk-review-pr <pr-number>`

If no PR number, return `{"result": "missing_pr"}` and stop.

## Step 0.0 — Resilience setup (mandatory)

Apply `.claude/skills/_afk-shared/resilience.md` for the whole run:

- **Non-interactive, time-boxed shell (§1).** Wrap every `gh` call and every remote `git` call (`fetch`/`pull`/`push`/`clone`/`ls-remote`/remote-ref `checkout`) as `GH_PAGER=cat GIT_PAGER=cat GIT_TERMINAL_PROMPT=0 timeout <N> <cmd>` — `N=120` for gh metadata/GraphQL, `N=180` for fetch/pull/checkout. Local-only git needs no wrapper. On a second timeout (exit 124), take this skill's documented failure path (`local_diverged` / `dirty_tree_foreign`) and note a `[hang-timeout]`. This prevents the pager/credential/network wedges (e.g. the Step 1.5 `gh pr checkout` + `git pull`) that otherwise freeze the orchestrator forever.
- **Heartbeat (§2, optional).** A passive progress log — nothing reads it to make decisions and the run does not depend on it; it is only a trace you can `tail` while watching this agent in the live display. If a heartbeat token was passed, you may append `echo "$(date +%s) | <phase> | <detail>" >> tmp/afk/heartbeat-<token>.log` at the start of a Step or before a long command. Omitting it has no effect.

## Step 0 — Orchestrated-mode preamble

### 0a. Git state normalization

```bash
git status --porcelain
```

Reviewer should run on a clean tree (orchestrator guarantees this). If dirty:
- Foreign uncommitted work → emit and stop:
  ```json
  {"result": "dirty_tree_foreign", "details": "..."}
  ```

### 0b. Scratch dir cleanup

```bash
mkdir -p tmp/afk
find tmp/afk/ -type f -mmin +30 -delete 2>/dev/null || true
```

## Step 1 — Fetch PR context

```bash
gh repo view --json owner,name,nameWithOwner
gh pr view <n> --json number,title,body,author,headRefName,baseRefName,url,files,commits,state
gh pr diff <n>
```

Note `headRefName`, changed file paths.

## Step 1.5 — Sync local checkout to PR head

Mandatory on every invocation, including follow-ups.

```bash
echo "$(date +%s) | sync | gh pr checkout <n> + git pull | budget=180" >> tmp/afk/heartbeat-<token>.log
GH_PAGER=cat GIT_TERMINAL_PROMPT=0 timeout 180 gh pr checkout <n>
GIT_TERMINAL_PROMPT=0 timeout 180 git pull --ff-only
git rev-parse HEAD
```

(The two network commands above were the classic hang point — a pager or credential prompt with no human. The `GH_PAGER`/`GIT_TERMINAL_PROMPT`/`timeout` guards make them fail fast instead of blocking forever; a second timeout takes the `local_diverged` path below.)

If `git pull --ff-only` fails (local diverged from remote PR head): emit:
```json
{"result": "local_diverged", "details": "..."}
```
Do not auto-reset.

Capture the head SHA — include in review summary body.

## Step 2 — Identify the linked issue (Axis A)

Parse PR body for `Fixes #N` / `Closes #N` / `Resolves #N`:
```bash
gh issue view <N> --json number,title,body,url
```

Extract:
- Parent PRD ref via `## Parent PRD` (capture **PRD number** for cleanup-issue lookup)
- `## Acceptance criteria` checklist (Axis A authoritative checklist)
- `## User stories addressed`

If parent PRD ref exists:
```bash
gh issue view <M> --json number,title,body
```
Use for context (Problem Statement, Out of Scope).

If no linked issue: continue with Axis B only; flag `⚠️ No linked issue found — Axis A skipped` in review body.

## Step 3 — Detect prior review state

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
          comments(first: 50) {
            nodes { id body path line originalLine author { login } }
          }
        }
      }
    }
  }
}' -f owner=<owner> -f repo=<repo> -F pr=<n>
```

A thread is **skill-authored** if its first comment body starts with `Claude comment 🤖`.

- **Initial review**: no skill-authored threads → run Axes A and B fresh
- **Follow-up review**: skill-authored threads exist → run Step 3.5 (pushback arbitration), Step 9a (judge prior threads), then Steps 5/6 fresh on current state

## Step 3.5 — Pushback arbitration (follow-up only)

For each unresolved skill-authored thread, scan its comment list for replies starting with:
```
Claude comment 🤖

⚠️ This appears out of scope
```

These are Coder pushback replies. For each:

1. Read the full reply (Coder's reasoning).
2. Read the original review concern.
3. Read the child issue's AC list.
4. Judge: is the pushback valid?
   - **Accept** if: (a) the AC genuinely doesn't cover the concern, OR (b) the cited rule from `/afk-review-pr` doesn't actually apply at that anchor, OR (c) the concern is pre-existing tech debt the PR didn't introduce.
   - **Reject** if: the AC clearly demands the change, or the rule clearly applies and the diff is the cause.

5. **On accept**: post a reply confirming and resolve the thread:
   ```bash
   gh api /repos/<owner>/<repo>/pulls/<n>/comments/<comment-id>/replies \
     --method POST -f body="Claude comment 🤖

   ✅ Pushback accepted. <one-line reasoning>. Resolving thread."
   ```
   ```bash
   gh api graphql -f query='mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { isResolved } } }' -f id=<thread-id>
   ```

6. **On reject**: post a reply restating the concern (do **not** create a new thread, do **not** resolve):
   ```bash
   gh api /repos/<owner>/<repo>/pulls/<n>/comments/<comment-id>/replies \
     --method POST -f body="Claude comment 🤖

   ❌ Pushback rejected. <one-line reasoning citing AC or rule>. The original concern stands."
   ```

**Verify a claimed tooling blocker against the profile before accepting it.** Donor scar (the donor stack, PR #279): a Coder fabricated a "no Postman API key" excuse to skip a wire-contract artifact update — the key was present at its documented path, and a genuinely missing credential blocked only the cloud push, never the repo-owned edit. Reject such pushback unless the Coder shows the tool/credential is actually absent, and even then the in-repo edit is still owed.

Track per-thread reject-counts in the structured return so orchestrator can decide on concession.

## Step 4 — Load applicable rule files

Based on the changed file paths, load **the rule files the repo's doctrine index declares for each touched area** — read each **in full**, no summarizing. Typical mappings a doctrine index declares (the donor's, as a shape example): backend source → architecture + coding-standards + persistence doctrine; migrations/DbContext → persistence doctrine; LLM-bound text → prompt-craft doctrine; controllers/DTOs/ported surfaces → consumer-contract doctrine. Where the index conditions a load on the profile (e.g. a chassis), honor that too.

Two rows are pipeline-generic and always apply:

| Condition | Rule |
|---|---|
| Any source touched | Also load the judgment-call smell baseline (`.claude/doctrine/fowler-smell-baseline.md`) — 🟡/💭 only, its binding rules govern |
| **Any wire-contract change** — new/changed route or verb, added/renamed/removed request or response DTO field, new status code | If the profile declares an executable wire-contract artifact (donor: a repo-owned Postman collection), check the diff also touches it. A wire change with **no artifact delta** is a 🟡. The artifact is the only *executable* doc — it rots silently, because code compiles and tests pass whether or not it is true. Apply the Step 3.5 tooling-blocker rule to any pushback here. |

Always also read the repo's reviewer persona (per the profile / doctrine index; base library: `code-reviewer-persona` + `karpathy-guidelines`).

## Step 4.5 — Load cleanup issue (concession suppression)

Two cases by mode:

- **PRD mode** (PR base branch starts with `prd-`): a PRD number was identified in Step 2. Search by PRD:
  ```bash
  gh issue list --label ship-cleanup --search "PRD #<prd-number> in:title" --json number,body --limit 1
  ```
- **Single mode** (PR base branch is the default branch): no PRD. The PR's `Fixes #N` line identifies the standalone issue. Search by issue:
  ```bash
  gh issue list --label ship-cleanup --search "Issue #<issue-number> in:title" --json number,body --limit 1
  ```

In single mode, the cleanup issue is lazy-created by upstream skills only on residue, so it may not exist — that's expected; treat as "no concessions to suppress" and continue.

If found, parse the body's checklist for `[concession-axis-a]` / `[concession-axis-b]` / `[concession]` entries. Each concession entry includes:
- `file: \`<path>:<line>\``
- `rule: \`<rule-source>\``
- `summary: "<concern summary>"`

Build an in-memory **suppression set**: `{file_pattern, rule_source, summary_keywords}` tuples.

When a candidate Axis-B finding in Step 6 matches a suppression entry on the same file and rule, **do not raise it** — concessions are durable across review rounds. Suppression applies only to Axis-B (Axis-A concessions exist but Reviewer should still surface AC gaps; the orchestrator's forced-merge path is what carries Axis-A concessions through).

## Step 5 — Axis A (requirements)

For each AC in the child issue:
1. Identify which changed files implement it
2. Read those files in full
3. Decide: **satisfied** / **partial** / **not addressed**
4. For less than satisfied, prepare an inline comment anchored at a diff line, prepended `[AXIS-A]`, marker 🔴

Also check:
- **Scope creep** → 🟡 with rationale
- **Out of Scope violations** → 🔴
- **User story coverage**

## Step 6 — Axis B (standards)

Anchor every finding to a diff line (added/modified). For each rule in each loaded rule file, evaluate the diff:

| Where violation lives | Action |
|---|---|
| In the diff | Flag, anchor at diff line |
| Pre-existing line, but PR pushed enclosing-unit metric over threshold | Flag with `[caused by this PR]` prefix |
| Pre-existing, untouched, no causal link | **Silent. Out of scope.** |

**Module-root census.** When the PR adds/moves/renames a file into a slice/module root, list that root's loose files and count them against the threshold the repo's structure doctrine sets (donor: ~8 non-registrar files in a VSA slice root). Over the threshold, or the loose files form an identifiable sub-domain → 🟡 `[AXIS-B]` at the new file, cite the structure doctrine's census rule, suggest the target subfolder. The new file is the causal link; do not demand a full refactor in this PR.

Apply concession suppression from Step 4.5: skip findings that match a `[concession-axis-b]` entry on the same file/rule.

For each in-scope violation, prepare an inline comment with:
- `[AXIS-B]` + priority marker
- Rule source in brackets (e.g., `[<rule-file>.md: <principle>]`)
- Concrete file:line evidence
- Specific suggestion

## Step 6.5 — Axis C (CI)

The Coder runs only the fast lane of the profile's `check_commands` before pushing — the expensive lanes run in CI, **concurrently with this review**. Reading CI is therefore part of the review, not a separate step someone else does. Run this **after** Axes A and B, so review work overlaps the CI run instead of blocking on it.

### 6.5a. Pin the SHA

Axis C is always evaluated against **the exact commit you reviewed**, never "the latest run". If the repo's CI cancels in-flight runs on a new push (the donor's workflows declared `concurrency: cancel-in-progress: true`; common), a Coder push mid-review cancels the in-flight run — reading "latest" would report a cancelled run belonging to a different commit.

```bash
REVIEWED_SHA=$(gh pr view <n> --json headRefOid --jq .headRefOid)
```

Capture this at the **start** of the review (Step 1.5, when you sync to PR head) and reuse it here. If the value has changed by the time you reach this step, the Coder pushed mid-review: your Axes A/B findings describe a stale diff. Emit `axis_c: "superseded"` and return — the orchestrator re-dispatches you on the new head.

### 6.5b. Wait for a conclusion (bounded)

```bash
gh api "repos/<owner>/<repo>/commits/$REVIEWED_SHA/check-runs" \
  --jq '.check_runs[] | {name, status, conclusion}'
```

Poll every 30s until every check run reports `status == "completed"`, capped at **15 minutes** from the start of this step (the donor's CI was ~4m; the cap is slack for a queued runner, not an expected wait — scale it if the profile records a longer CI cost). Wrap each call per resilience.md §1.

**A pending run is never a pass.** On timeout, emit `axis_c: "unknown"` with the still-pending check names — never green.

### 6.5c. Classify

| Observation | `axis_c` | Findings |
|---|---|---|
| All check runs `success` | `pass` | none |
| Any `failure` / `timed_out` | `fail` | one Axis-C finding per failing check |
| All `completed`, some `cancelled`, SHA unchanged | `unknown` | note the cancelled checks |
| Head SHA moved during review | `superseded` | none — return immediately |
| Still pending at the 15m cap | `unknown` | note the pending checks |

For each failing check, pull the failing step's log and extract the **specific** failure — the assertion message and test name, not "<check> failed":

```bash
gh run list --commit "$REVIEWED_SHA" --json databaseId,workflowName,conclusion
gh run view <run-id> --log-failed
```

Raise **one 🔴 blocker per failing check**, prefixed `[AXIS-C]`, in the review body (not as an inline diff comment — a CI failure usually has no single diff line to anchor to; anchor it inline only when the log points at a specific changed line). Include the check name, the extracted assertion/test name, and the run URL.

### 6.5d. Axis C is never conceded

Axis-B findings are style and design judgments; after 3 rejects the orchestrator may concede them. **Axis-C findings are objective facts about a red suite.** They are never eligible for the concession path, and the concession-suppression set from Step 4.5 never applies to them. Conceding Axis C would merge known-broken code — the exact failure mode this axis exists to prevent.

If an Axis-C failure is genuinely pre-existing on the base branch (not caused by this PR), say so explicitly in the finding, and still report `axis_c: "fail"` — the orchestrator routes pre-existing CI breakage to the cleanup issue rather than blaming the child, but it must not be silently swallowed.

## Step 7 — Compose review body

```markdown
Claude comment 🤖

Reviewed at commit `<sha>`.

## Review Summary

[Overall impression. Counts: <X> 🔴 blockers, <Y> 🟡 suggestions, <Z> 💭 nits.]
[If follow-up: <P> threads resolved this pass, <Q> threads remain open, <R> pushbacks accepted, <S> pushbacks rejected.]

## Axis A — Requirements (Issue #<n>)

[Per-AC verdict.]

## Axis B — Code Standards

### <per loaded rule-file area>
### Universal

## Axis C — CI (commit `<REVIEWED_SHA>`)

[One line per check run: name → conclusion. For failures, the extracted assertion/test name and the run URL. If `unknown`/`superseded`, say which and why.]

## Suppressed Concerns (concessions)

[List any findings that would have been raised but matched a `[concession-axis-b]` entry in cleanup issue #<n>.]

## What Went Well
```

## Step 8 — Post the review

Build a JSON payload file under `tmp/afk/review-<pr>-<ts>.json`:

```json
{
  "event": "REQUEST_CHANGES" | "COMMENT" | "APPROVE",
  "body": "Claude comment 🤖\n\nReviewed at commit `<sha>`.\n...",
  "comments": [
    {"path": "...", "line": <n>, "body": "Claude comment 🤖\n\n[AXIS-A] 🔴 ..."}
  ]
}
```

Event selection:
- Any 🔴 blockers (Axis A, B, **or C**) → `REQUEST_CHANGES`
- Only 🟡 / 💭 → `COMMENT`
- No findings AND no unresolved skill-authored threads AND `axis_c == "pass"` → `APPROVE`

**Never `APPROVE` on `axis_c` of `fail`, `unknown`, or `superseded`.** Only an observed green counts as green.

The structured return must carry the axis-C result alongside the existing counts:

```json
{
  "verdict": "approve" | "request_changes" | "comment",
  "axis_a_blockers": <n>,
  "axis_b_blockers": <n>,
  "axis_c": "pass" | "fail" | "unknown" | "superseded",
  "axis_c_failing_checks": [
    {"check": "<failing-check-name>", "detail": "<extracted assertion/test name>", "url": "...", "pre_existing_on_base": true|false}
  ],
  "reviewed_sha": "<sha>"
}
```

```bash
gh api /repos/<owner>/<repo>/pulls/<n>/reviews --method POST --input <scratch>
rm <scratch>
```

Every inline comment body MUST start with `Claude comment 🤖\n\n`.

## Step 9 — Follow-up handling (if Step 3 detected prior threads)

### 9a. Judge each existing unresolved thread

For each thread that did not get resolved by pushback acceptance (Step 3.5):
1. Read the original concern
2. Read the current file content around `path:line` (use `originalLine` if `line` is null; grep nearby)
3. Decide: **addressed** / **partial** / **not addressed**

### 9b. Resolve addressed threads

```bash
gh api /repos/<owner>/<repo>/pulls/<n>/comments/<first-id>/replies --method POST -f body="Claude comment 🤖

✅ Resolved: <one-line reason>"
gh api graphql -f query='mutation($id: ID!) { resolveReviewThread(input: {threadId: $id}) { thread { isResolved } } }' -f id=<thread-id>
```

### 9c. Leave unaddressed threads open; increment per-thread reject-count

Optionally post a reply restating the concern. Do not resolve.

### 9d. Scan for new findings

Run Axes A and B again on the current state. Any new findings become new inline comments in this follow-up review.

## Step 10 — Emit structured return

```json
{
  "skill": "afk-review-pr",
  "result": "reviewed" | "local_diverged" | "dirty_tree_foreign" | "missing_pr",
  "verdict": "approve" | "request_changes" | "comment",
  "head_sha": "<sha>",
  "axis_a_blockers": <count>,
  "axis_b_blockers": <count>,
  "suggestion_count": <count>,
  "nit_count": <count>,
  "thread_outcomes": [
    {
      "thread_id": "<id>",
      "axis": "A" | "B",
      "state": "new" | "still_open" | "resolved" | "pushback_accepted" | "pushback_rejected",
      "reject_count_total": <n>,
      "file": "...",
      "line": <n>,
      "rule_source": "..." | null,
      "summary": "..."
    }
  ],
  "merge_conflicts": <bool>,
  "review_url": "...",
  "is_follow_up": <bool>,
  "pr_number": <n>,
  "prd_number": <n> | null,
  "child_number": <n> | null
}
```

`reject_count_total` is the cumulative count of follow-up rounds where this thread was *not* resolved — orchestrator uses this to trigger `/afk-concede-thread` at 3.

## Critical Rules

1. **Never invent findings.** Every 🔴 grounded in rule file + file:line evidence.
2. **Never skip reading a rule file.** No reconstructing from memory.
3. **Never post without `Claude comment 🤖` prefix.**
4. **Never resolve a thread you did not author.**
5. **Always sync local checkout (Step 1.5)** before any file reads.
6. **Axis B comments anchor to changed lines only**, except `[caused by this PR]` exception.
7. **Always emit the structured JSON return.**
8. **Suppress concerns already conceded** in the PRD cleanup issue.
9. **Pushback arbitration is reply-only.** Accept = reply + resolve. Reject = reply, no new thread, no resolve.
10. **Track per-thread reject-counts** in `thread_outcomes` for orchestrator concession logic.

## Edge Cases

- **PR is draft** → review with note "draft PR — review is advisory until marked ready"
- **PR has merge conflicts** → emit single 🔴 blocker, set `merge_conflicts: true`, do not continue Axis B
- **PR touches generated/vendored files** → skip in Axis B
- **Multiple linked issues** → review against union of ACs
- **Child has no AC section** → flag in body, review user stories only
- **Pushback reply on a thread where the concern is genuine** → reject; log reasoning
