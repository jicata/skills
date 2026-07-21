---
name: drain-cleanup
description: Process a `[ship-cleanup]` GitHub issue created by `/ship-feature` or `/ship-issue`. Parses the structured checklist of residual concerns, re-verifies each entry against the current default branch (regressions might already be fixed, conceded files might already be deleted), classifies what remains as stale / actionable / unknown, groups related actionables, and spins off properly-formed bug/enhancement issues that `/ship-issue` can pick up. This skill triages and decomposes — it does not fix code. The actual remediation flows through existing skills (`/ship-issue`, `/ship-feature`).
---

# Drain Cleanup

A queue-processing skill for `[ship-cleanup]` issues — the residue logs created by the autonomous orchestrators when concessions, force-merges, regressions, or env failures occurred during a run.

Cleanup issues accumulate entries that share a structured tag vocabulary (`[concession-axis-b]`, `[regression]`, `[contradictory-threads]`, ...) but **have wildly different remediation paths** — a regression is a failing test to fix, an Axis-B concession is a refactor, an Axis-A concession is a missed requirement, a `[finalize-blocked]` is a manual merge. One skill cannot do all of that work. This skill instead does the part the remediation skills can't: **triage, re-verification against current state, classification, and spin-off.**

The fixing then happens via `/ship-issue` on the spun-off issues.

Repo facts this skill keys off (test/check commands, wire-contract collection skill, standards doctrine) live in the profile: `.claude/doctrine/project-profile.md`.

## What this skill is NOT

- **Not a code-fixing skill.** Never edits source files, never opens PRs against feature branches. Its output is updates to the cleanup issue itself and brand-new bug/enhancement issues queued for `/ship-issue`.
- **Not autonomous.** Has a user gate between the verification table (Step 5) and the spin-off action (Step 6). Cleanup entries can be expensive — the user picks per-entry whether to drain, defer, or bundle.
- **Not a substitute for `/log-issue`.** Spin-offs reuse the bug/enhancement issue templates but skip the Explore + grill loop, because the cleanup entry already encodes the investigation that originally surfaced it.

## Invocation

`/drain-cleanup <issue-number>` — process a specific `[ship-cleanup]` issue.

`/drain-cleanup` — no argument: list all open issues with the `ship-cleanup` label, ask the user to pick.

## Process

### Step 1 — Acquire the cleanup issue

If no argument supplied:

```bash
gh issue list --label ship-cleanup --state open --json number,title,updatedAt
```

Present the list, ask the user which to drain. If only one, proceed without asking.

Then fetch full content:

```bash
gh issue view <n> --json number,title,body,labels,state,comments
```

**Refuse** if:
- Issue is closed → tell the user, ask if they want to reopen.
- Issue lacks the `ship-cleanup` label → tell the user this skill is for orchestrator-residue issues only; suggest `/ship-issue` directly.
- The associated PRD is still in flight (open PRs against a PRD base branch matching the cleanup issue's PRD number) → refuse with a clear message. Draining a live PRD races the orchestrator's appends and will lose entries.

### Step 2 — Parse the checklist

The cleanup-issue body follows the cleanup-issue template bundled with the `/ship-feature` skill. Each entry is a markdown checklist item starting with a tag in square brackets.

Parse both the issue **body** and all issue **comments** (parallel-mode runs append entries as comments to avoid body-edit races). Each entry yields a struct:

```yaml
- tag: "[concession-axis-b]" | "[concession-axis-a]" | "[regression]" | ...
  checked: true | false
  pr_number: <int or null>
  thread_id: <string or null>
  file: <path or null>
  line: <int or null>
  test_id: <string or null>
  ac_ref: <string or null>
  rule_source: <string or null>      # for axis-b concessions
  summary: <string>
  reason: <string or null>
  raw_line: <verbatim markdown line>  # so we can rewrite the body precisely
  location: body | comment#<id>
```

Skip already-checked entries — they are previously drained.

### Step 3 — Re-verify each unchecked entry

This is where the skill earns its keep. Most entries that have sat for more than a few days are stale: the file got deleted, the test was fixed by a sibling PR, the AC got resolved elsewhere. **Re-verification is tag-dispatched.**

Run verifications in parallel where independent. Dispatch table:

| Tag | Verification |
|---|---|
| `[regression]` | Locate the test by `test_id`. Run it on the current default branch with the repo's test runner, narrowed to that test (per profile `check_commands`). If passing → **stale** (mark with "fixed by HEAD as of <sha>"). If still failing → **actionable**. If test no longer exists → **stale** (note: "test removed"). |
| `[regression-from-fix]` | Same as `[regression]` plus inspect the originating PR's merged diff to confirm the fix landed without re-introducing the symptom. |
| `[concession-axis-b]` | Read the cited `file:line` on the current default branch. File missing → **stale** ("file deleted in #<sha>"). File present but the rule citation no longer applies (e.g., the offending import was removed, the file moved to where the standards rule wants it) → **stale**. Rule still violated → **actionable**. |
| `[concession-axis-a]` 🚨 | Re-read the AC from the original PRD. Search for follow-up PRs that mention the AC: `gh pr list --search "<ac-keywords>" --state merged --limit 10`. If a later PR addresses it → **stale**. Otherwise → **actionable** (high priority — Axis-A gaps are functional). |
| `[contradictory-threads]` | Inspect the two threads on the originating PR. Both resolved? → **stale**. Still contradictory and the affected code path is still present? → **actionable** (file as a design-clarification issue). |
| `[ac-conflict]` | Re-read the AC and the cited file. Has the AC been clarified in a later PRD revision? → **stale**. Code still implements the chosen-over-AC behavior? → **actionable** (escalate; this is an AC/code drift). |
| `[rebase-conflict]`, `[git-failure]`, `[push-failure]` | Did the originating PR eventually merge? `gh pr view <pr> --json state,mergedAt`. Merged → **stale**. Still open → **actionable** (env issue, may need human). |
| `[finalize-conflict]` | Inspect the cited hunks on the default branch. If the file is unchanged since the strategic merge → **unknown** (recommend manual eyeball — the skill can't tell if the merge resolution was semantically correct). If the file has been substantially rewritten → **stale**. |
| `[finalize-blocked]` | Check if the PRD→master PR has since been opened/merged manually. Merged → **stale**. Still blocked → **actionable** (human ops). |
| `[cycle]`, `[ac-missing]` | PRD authoring bugs. If the PRD shipped → **stale**. Otherwise → **actionable** (file against the PRD itself). |
| `[pending-push]` | The repo's wire-contract collection cloud copy is unsynced (only meaningful if the profile declares a wire-contract collection skill — otherwise **unknown**). Run that skill's diff against the default branch. Empty diff → **stale** ("cloud already synced"). Non-empty → **actionable** (one push via the collection skill; consult that skill for its own gotchas, e.g. request shapes that must be authored in the vendor GUI first). |
| `[doc-drift]` | Read the cited file/collection on the current default branch. Drift already reconciled (route/field/doc now matches code) → **stale**. Still divergent → **actionable** (a wire-contract-collection edit or canon-doc update — *not* a `/ship-issue` code candidate unless the entry cites a source file). |
| Unknown tag | → **unknown**. Surface to the user. |

For each verification, capture the **evidence** — the test output, the file read, the PR query result — so the eventual stale-mark comment can cite it.

### Step 4 — Group actionables

Among entries classified **actionable**, identify natural bundles. Heuristics:

- **Same file path** → almost certainly one fix (e.g., two Axis-B concessions in the same handler file).
- **Same rule source** (e.g., two violations of the same standards-doctrine rule — a constructor-dependency limit, a slice-structure rule) → likely one refactor PR even across files.
- **Same root cause** in linked PRs (e.g., a regression + a concession both pointing at the same handler) → bundle.
- **Same originating PR** with multiple concessions → check whether the reviewer's threads were thematically related; bundle if so.

Do not over-bundle. Two regressions in two unrelated test files are separate issues — bundling forces the spun-off `/ship-issue` to fix both before it can close, which loses the orchestrator's incremental shipping property. Default to splitting unless the bundling signal is strong.

### Step 5 — Present the table + ask the user

Present, in chat, a table per cleanup entry. Group by classification.

```markdown
### Stale (will be checked off, N entries)

| # | Tag | Summary | Evidence |
|---|---|---|---|
| 1 | [regression] | failing test `SomeResolverTests.X` | Passes on HEAD (sha abcd1234) |
| 2 | [concession-axis-b] | god-handler violation in GenerateThingHandler | File refactored in #500 |

### Actionable (will spin off into issues, M groups)

**Group A** — bundle entries 3, 4 (same file, same rule):
- [concession-axis-b] `GenerateThingHandler.cs` constructor exceeds the standards doctrine's dependency limit
- [concession-axis-b] handler body exceeds the slice-architecture doctrine's god-orchestrator threshold
→ Proposed title: `Decompose GenerateThingHandler to honour single-responsibility limits`

**Group B** — entry 5 standalone:
- 🚨 [concession-axis-a] AC §2.3 partial implementation
→ Proposed title: `Complete AC §2.3 for <feature>`

### Unknown (will be left as-is with verification notes, K entries)

| # | Tag | Summary | Why unknown |
|---|---|---|---|
| 6 | [finalize-conflict] | merge resolution in Detector.cs:140-180 | Hunks still in place; cannot tell if semantics correct |
```

After the table, ask **one** consolidated question: which actions to apply. Options:

- **Apply all** — check off stale, file actionable groups, leave unknown notes.
- **Apply stale only** — only check off stale; defer actionable for later.
- **Per-entry decision** — walk through entries one by one.
- **Abort** — do nothing.

If "per-entry", loop a follow-up question per entry/group (check off / spin off / skip).

### Step 6 — Execute

For **stale** entries to be checked off:

1. Update the body (or the comment that contained the entry — track `location` from Step 2) by changing `- [ ]` → `- [x]` for the precise `raw_line`.
2. Append a single drain comment to the cleanup issue summarizing what was checked off and why:
   ```markdown
   `/drain-cleanup` pass on <ISO-date>:
   - Entry N (`[regression]` ...): stale — <evidence>
   - Entry M (`[concession-axis-b]` ...): stale — <evidence>
   ```

For **actionable** entries / groups to spin off:

1. Synthesize an issue body using the existing bug/enhancement templates from `/log-issue` (its Step 8). Pre-populate:
   - **Problem** / **Motivation** — from the cleanup entry's summary + reason.
   - **Root Cause Analysis** / **Design Note** — for concessions, paste the standards-rule quote and the original reviewer thread context; for regressions, paste the test output and the originating PR. **Do NOT re-run Explore** — the original concession/review already encoded the investigation.
   - **Behavior Contract** — for concessions, this is "the rule says X, code does Y, after fix code does X." For regressions, it's "test asserts X, currently observes Y, after fix observes X."
   - **TDD Plan** — for regressions, the failing test is already the RED. For concessions, the RED is a new test asserting the rule (e.g., a structural test that the offending file lives where the standards rule wants it).
   - **Acceptance Criteria** — derived from the Behavior Contract.
   - **Cleanup linkage** — a `## Origin` section at the top: `Spun off from #<cleanup-issue> entry N (originally PR #<pr>, thread <id>). Tag: <tag>.`
2. Create the issue:
   ```bash
   gh issue create --title "<title>" --label <bug|enhancement>,from-cleanup --body-file <scratch>
   ```
   Use the additional label `from-cleanup` so spun-off issues are queryable. Create the label if missing.
3. In the cleanup issue, replace the original `- [ ]` line with a checked + linked variant:
   ```
   - [x] [<tag>] <original summary> → spun off to #<new>
   ```
4. Drain comment on the cleanup issue appends a `Spun off:` section listing each new issue.

For **unknown** entries:

- Leave the checkbox unchecked.
- The drain comment appends an `Unknown — needs human review:` section with the entry and the reason verification was inconclusive.

### Step 7 — Final summary

After execution, print:

```
Drained cleanup issue #<n> (PRD #<m>):
- <X> entries checked off as stale
- <Y> entries spun off into: #<a>, #<b>, ...
- <Z> entries left unknown for manual review

Cleanup issue state: <all-clear | partial | needs-human>
```

### Step 8 — Sequential auto-ship gate (conditional)

If `<Y>` is 0 (no spin-offs), skip to Step 9.

Otherwise, ask **one** question:

> Spun off `<Y>` issues. Fire `/ship-issue` on each one **sequentially** now?

Options:
- **Yes, fire all sequentially** — invoke `/ship-issue <a>`, await completion, then `/ship-issue <b>`, etc.
- **Per-issue decision** — walk the list; for each spin-off ask fire / skip / stop.
- **No, I'll fire them myself later** — exit; the spin-offs remain queued.

**Sequential only — never parallel.** This skill does not reuse `/ship-feature`'s parallel slot machinery. Cleanup spin-offs lack a Blocked-by DAG, frequently touch overlapping files (multiple Axis-B concessions from the same originating PR are common), and racing N PRs against the default branch produces rebase storms and lazy-creates N new per-issue cleanup issues — defeating the point of the drain. If the user wants throughput, they can run multiple `/ship-issue` invocations themselves in separate sessions, owning the collision risk explicitly.

For each fire decision, invoke `/ship-issue <issue-number>` and wait for it to return before proceeding to the next. Print a one-line status between invocations:

```
[2/6] /ship-issue #<a> → <merged | conceded | force-merged | unmergeable>
```

If a `/ship-issue` run fails or force-merges with new residue, **do not stop** the batch — log the outcome and continue to the next spin-off. The point of the batch is to drain; per-spin-off failure handling is `/ship-issue`'s job, not this skill's.

After the batch completes, print a final summary:

```
Auto-ship batch on cleanup #<n>:
- <merged>: #<a>, #<c>, #<f>
- <conceded>: #<b> (new cleanup issue #<X>)
- <force-merged>: #<d> (new cleanup issue #<Y>)
- <skipped>: #<e>
```

New per-issue cleanup issues produced by the batch are themselves drainable via `/drain-cleanup` on a future invocation — the lineage is preserved.

### Step 9 — Close-out

If **all** entries are now checked (`<Z>` is 0 and every spun-off entry has a checked line), suggest closing the cleanup issue, but **do not auto-close** — ask:

> All entries drained. Close #<n>? (it will reopen automatically if `/ship-feature` finds new residue, since lazy-creation searches by title.)

If the user says yes: `gh issue close <n> --comment "All entries drained; spin-offs tracked in linked issues."`

## Critical Rules

1. **Never fix code in this skill.** The skill creates issues and edits issue bodies/comments — that's it. All source-code remediation flows through `/ship-issue` (or `/ship-feature` if a spin-off turns out to be PRD-sized).
2. **Re-verify before acting.** No entry gets checked off without recorded evidence. No entry gets spun off without confirming the underlying problem still exists on the default branch.
3. **Respect entry provenance.** When rewriting the cleanup issue, preserve the original `raw_line` text inside the strikethrough/checked variant. The audit trail is the point of these issues.
4. **Do not race a live orchestrator.** Refuse to drain a cleanup issue whose PRD still has open PRs against its base branch (the orchestrator may append more entries; body edits race with the orchestrator's comment-append path).
5. **Do not over-bundle.** Default to one spin-off per actionable entry. Bundle only when the file, rule, or root-cause overlap is unambiguous.
6. **Spin-off issues are concession-aware.** Axis-A spin-offs get the `bug` label and a 🚨 prefix in the title; the user is told this is a functional gap, not a refactor. Axis-B spin-offs get `enhancement` (it's a refactor, not a defect).
7. **Never auto-close.** The cleanup-issue close is a separate user gate, asked after the drain completes.
8. **Track work as labels, not as comments-only.** Spun-off issues carry `from-cleanup`; the cleanup issue retains `ship-cleanup`. Two labels make `gh issue list --label from-cleanup` a queryable drained-work backlog.
9. **`/drain-cleanup` is idempotent.** Re-running on a partially-drained issue picks up only unchecked entries; previously-checked entries are skipped without re-verification.
10. **Auto-ship is sequential only.** Never invoke `/ship-issue` runs in parallel from this skill. Cleanup spin-offs do not declare a Blocked-by DAG and frequently touch overlapping files; parallel execution produces rebase races and multiplies cleanup issues. Users who want throughput run extra `/ship-issue` invocations in separate sessions with eyes open.
11. **Auto-ship does not abort on per-spin-off failure.** A spin-off that concedes or force-merges produces its own new cleanup issue; the batch continues. Per-issue remediation is `/ship-issue`'s responsibility, not this skill's.

## Edge Cases

- **Cleanup issue has zero unchecked entries** → tell the user it's already drained; ask if they want to close.
- **Cleanup issue is from `/ship-issue` (single-issue lazy-create)** → same flow; the "PRD in flight" check inspects the originating issue rather than a PRD base branch.
- **Test cited in `[regression]` no longer exists** → stale, with a note. Do not try to find a "renamed" version — that's guesswork; if the test was renamed and the regression is real, it'll resurface in the next orchestrator run.
- **File cited in `[concession-axis-b]` was moved** → if the file's new location is unambiguous (e.g., git tracked the rename), re-verify at the new location; otherwise treat as unknown.
- **Two entries spin off into what would be the same issue** → bundle them, even if they were filed separately in the cleanup issue. The bundling proposal in Step 4 catches most of these; if the user discovers the duplication mid-execution, ask whether to merge the spin-offs.
- **User says "just spin off everything, skip verification"** → refuse politely. Re-verification is the load-bearing feature of this skill; skipping it produces a backlog of issues that are mostly already-fixed. If the user really wants to bulk-file, suggest they edit the cleanup issue directly and use `/log-issue` for the ones they care about.
- **Spun-off issue's `/ship-issue` run later fails or concedes** → that's a new cleanup entry on a new cleanup issue. The lineage is preserved via the `from-cleanup` label + the `## Origin` section.

## Relationship to other skills

```text
/ship-feature  → creates [ship-cleanup] issue with residue entries (append-only)
/ship-issue    → may lazy-create a single-issue cleanup issue
   ↓
/drain-cleanup → triages cleanup issue, spins off actionable entries,
                 optionally auto-ships them sequentially via /ship-issue
   ↓
/ship-issue    → autonomously implements each spin-off (sequential batch
                 or user-driven; never parallel from this skill)
   ↓
/ship-feature  → if a spin-off proves too big, escalate (rare for cleanup work)
```

`/drain-cleanup` is intentionally the bridge between the "ship something" skills, not a peer of them. It does the queue-management work that none of them are positioned to do.

**Why no parallel auto-ship?** `/ship-feature` runs PRD children in parallel safely because (a) it has a Blocked-by DAG declaring which children may run concurrently and (b) it serializes merges through GitHub's merge queue on the PRD base branch. Cleanup spin-offs have neither: no DAG, and they merge directly to the default branch. Inferring a file-overlap DAG from cleanup entries is plausible but the failure mode (two PRs colliding mid-flight on a file the heuristic missed) is hard to recover from, and the user-visible payoff is small — cleanup is residue, not critical-path work. If parallel cleanup throughput becomes a real need later, the right shape is a separate orchestrator that wraps the spin-offs into a synthetic mini-PRD and reuses `/ship-feature`'s machinery — not a flag on this skill.
