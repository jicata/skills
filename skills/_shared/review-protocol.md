# Shared: the review verdict protocol

Included by `/review-pr`, `/afk-review-pr`, `/merge-pr`, `/afk-merge-pr`, `/concede-pr`, and the `afk-reviewer` agent. Defines how a review verdict is **written** to GitHub and how it is **read back** at the merge gate.

The law: **the verdict is a value the skills own, not a state GitHub infers.** GitHub's native review event is a *transport* for that value. Which transport is available depends on the repo's configured review identity — the verdict itself, and every gate decision made from it, are identical either way.

## 1. Review identity

Read `review_identity` from `.claude/doctrine/project-profile.md`. **If the key is absent, assume `self`** — that is the zero-config default and every repo set up before this protocol existed is correct under it.

| `review_identity` | Who authors reviews | Native events available |
|---|---|---|
| `self` (default) | The same account that authored the PR | `COMMENT` only |
| `app` | A GitHub App installation, distinct from the PR author | `APPROVE`, `REQUEST_CHANGES`, `COMMENT` |

**Why `self` is constrained:** GitHub rejects `APPROVE` and `REQUEST_CHANGES` submitted by the PR's own author with `422 Unprocessable Entity` ("Can not approve your own pull request"). This is not a permissions setting and cannot be configured away — it is a property of the author relationship. A skill that submits either event in `self` mode does not degrade; the API call **fails outright and no review is posted at all**.

Under `self`, a repo therefore only ever accumulates `COMMENTED` reviews and `reviewDecision` is permanently `null`. That is expected and is not a signal of anything.

**Absent-key default vs. recommended setting are different things.** `/setup` recommends `app` (Q12b) because it makes the audit trail honest. The *schema* default stays `self` so that every repo configured before this protocol existed, and every repo where App installation is restricted, reads correctly with no edit. Never treat a missing key as misconfiguration.

To set up `app` mode, see [`setup/github-app.md`](../../setup/github-app.md) — scripted via `setup/create-review-app.js`.

## 2. The verdict marker — written identically in both modes

Every review body this library posts opens with exactly these two lines:

```
Claude comment 🤖

**Verdict: <APPROVE|REQUEST_CHANGES|COMMENT>** · reviewed at `<head-sha>`
```

- `Claude comment 🤖` stays the **first** line — every skill-authored-thread detector in this library keys off it, and moving it breaks follow-up detection permanently.
- `<head-sha>` is the full 40-char SHA of the commit actually reviewed. Not `HEAD`, not a short SHA, not "latest".
- The marker is written in **both** identity modes. In `app` mode it is redundant with the native event by design: it keeps one body format across modes, and it survives the native event being dismissed or superseded.

Machine-readable form for the reader, anchored to the start of a line:

```
^\*\*Verdict:\s*(APPROVE|REQUEST_CHANGES|COMMENT)\*\*\s*·\s*reviewed at `([0-9a-f]{40})`
```

## 3. Event selection when posting

Decide the verdict first, from findings alone — the identity mode never influences *what* the verdict is, only how it is transported.

| Verdict | `self` mode event | `app` mode event |
|---|---|---|
| `APPROVE` | `COMMENT` | `APPROVE` |
| `REQUEST_CHANGES` | `COMMENT` | `REQUEST_CHANGES` |
| `COMMENT` | `COMMENT` | `COMMENT` |

In `app` mode, acquire the token first (§5) and post with it. In `self` mode post as normal.

**Never submit `APPROVE` or `REQUEST_CHANGES` while in `self` mode.** The call fails and the review is silently lost — including all of its inline comments.

## 4. Reading the verdict at the merge gate

One resolution routine, used by `/merge-pr` and `/afk-merge-pr`. Fetch `headRefOid`, `reviewThreads`, `latestReviews` (author + state), and `reviews` (body + state, newest last).

1. **A native `CHANGES_REQUESTED` wins over everything.** If any entry in `latestReviews` has `state == "CHANGES_REQUESTED"` → **blocked**. A reviewer who explicitly requested changes is authoritative regardless of what any marker says.

   > **Read `latestReviews[].state`, not `reviewDecision`.** `reviewDecision` is only populated when the repo *requires* reviews via branch protection — on a private repo on the free plan (where protection is unavailable) it stays `null` **even in `app` mode with a genuine `CHANGES_REQUESTED` review on the PR**. Verified 2026-08-07 on `jicata/Brochures` #978: an App-authored `CHANGES_REQUESTED` review registered `state: CHANGES_REQUESTED` on the review object and in `latestReviews`, while `reviewDecision` stayed empty. Gating on `reviewDecision` silently never fires. `latestReviews` gives one entry per reviewer, already reduced to their most recent review, and a dismissed review reads as `DISMISSED` — which correctly stops blocking.
2. **Find the governing verdict.** Take the newest review whose body starts with `Claude comment 🤖`, and parse its marker per §2 → `verdict` + `reviewed_sha`.
3. **Staleness.** If `reviewed_sha != headRefOid` → **`review_stale`**. The review graded a commit that is no longer the head; its approval says nothing about the current code. This is a *route-back*, not a failure — the caller re-reviews and continues.
4. **Apply the verdict:**
   - `REQUEST_CHANGES` → **blocked** (`changes_requested`)
   - `COMMENT` with any unresolved thread → **blocked** (`unresolved_threads`)
   - `COMMENT` with all threads resolved → **blocked** (`not_approved`) — a comment review is not an approval, and inferring one from thread state is what let unreviewed work through before this protocol existed
   - `APPROVE` with all threads resolved → **pass**
   - `APPROVE` with any unresolved thread → **blocked** (`unresolved_threads`)
5. **No marker found.** If no review carries a parseable marker:
   - any `latestReviews[].state == "APPROVED"` (someone approved natively) → **pass**, subject to the same thread check
   - otherwise → **blocked** (`not_reviewed`)

**Legacy tolerance.** A review body that starts with `Claude comment 🤖` but carries no marker predates this protocol. Treat it as `COMMENT` — never as an approval. It will read as `not_approved` and require one fresh review pass to clear. That is the intended migration cost; do not add a fallback that infers approval from thread state.

## 5. Acquiring the App token (`app` mode only)

The base library never handles JWTs, private keys, or installation IDs. The repo supplies one command that prints a valid token to stdout, in the profile:

```yaml
review_identity: app
review_app_token_cmd: "<command that prints an installation access token to stdout>"
```

Run it, use the result for the review-posting calls only, and discard it:

```bash
REVIEW_TOKEN="$(<review_app_token_cmd>)"
GH_TOKEN="$REVIEW_TOKEN" gh api repos/<owner>/<repo>/pulls/<n>/reviews --method POST --input <scratch>
unset REVIEW_TOKEN
```

Rules:

- **Scope the token to review submission.** Thread resolution, replies, merges, and issue closes keep running as the normal account — the App is the reviewer, not the operator.
- **Never write the token to a file, a log, a PR comment, or the structured JSON return.**
- **Never echo the command's output** other than into the variable.
- If `review_app_token_cmd` is missing, empty, or exits non-zero, **fall back to `self` behaviour for this run** — but never silently. See §7.

## 6. What this protocol does and does not buy

- **Does:** a gate that reads an explicit verdict instead of inferring one from thread state; a stale-review check; identical behaviour across both identity modes; a GitHub audit trail that matches the decision actually made. In `app` mode, reviews carry a real `APPROVED`/`CHANGES_REQUESTED` state and a `[bot]` author, visibly distinct from the operator's own comments.
- **Does not:** server-side enforcement, and **not** a populated `reviewDecision`. That field needs branch protection with a review requirement, which is unavailable on private repos on the free plan — so even a genuine App-authored `CHANGES_REQUESTED` leaves it `null` there. Where protection *is* configured, `app` mode additionally blocks the merge via GitHub. Everywhere else the skill-level gate above is the only thing governing the agents, which is precisely why the marker is authoritative and `reviewDecision` is not consulted.
- **Does not:** independent review. A bot identity is a different actor to GitHub, not a different judgment. The reviewer is still the same model reading the same doctrine; `app` mode makes the trail honest, it does not make the review adversarial.

## 7. Degraded identity — loud, diagnosed, retriggerable

**A declared capability that is not actually available is a fault, not a mode.** `review_identity: self` behaving like `self` is correct and silent. `review_identity: app` behaving like `self` is a **mismatch between configured and effective**, and must never pass unremarked — a reviewer that quietly stops being the bot looks identical, in the GitHub UI, to a repo that was never configured for it.

Degrading is still the right *behaviour*: a credential problem must not cost a review, and the marker carries the verdict regardless. The requirement is that it is impossible to miss.

### 7.1 Detect and classify

Attempt the token once. On failure, classify — the remedy differs and a bare "it failed" is not actionable:

| `reason` | Signal | Remedy to print |
|---|---|---|
| `not_configured` | `review_identity: app` but no `review_app_token_cmd` | Add the key, per `setup/github-app.md` §4 |
| `helper_missing` | `Cannot find module` / `No such file` on the script path | Fresh machine — copy the token helper to the path in `review_app_token_cmd` |
| `key_missing` | `ENOENT` on the `.pem` path | Fresh machine — copy the private key to that path (it is intentionally not in the repo) |
| `auth_failed` | `401` / `A JWT could not be decoded` | Key does not match `GH_APP_ID`; regenerate per §2 of the setup doc |
| `not_installed` | `404` on the installations endpoint | App uninstalled from the repo, or wrong installation ID |
| `forbidden` | `403 Resource not accessible by integration` | Permissions changed and need re-approval on the installation page |
| `token_error` | anything else non-zero | Print the command's first stderr line verbatim |

Never print the token, and never print more than the first stderr line — helper output can contain the key path but must never contain key material.

### 7.2 Report it where the operator is actually looking

**The run's own final report is the primary surface.** An autonomous run ends with an execution-conformance block (`/ship-issue` Step 3, `/ship-feature` Step 4) that states, in plain terms, where the run's *executed* mode differed from its *configured* mode. Review identity is one row in that block. `/review-pr` invoked on its own has no run report, so its chat summary carries the same statement as its first line.

This is deliberately **not** a cleanup-issue entry. The cleanup issue tracks code debt to fix before release; a missing credential on one machine is neither code nor debt, and filing it there both buries real findings and implies the wrong remedy.

**In the structured return**, `configured` and `effective` are separate fields so an orchestrator can never conflate them — this is the mechanism the report is built from:

```json
"review_identity_configured": "app",
"review_identity_effective": "self",
"review_identity_fallback": true,
"review_identity_fallback_reason": "key_missing",
"review_identity_remedy": "Copy the private key to ~/.ssh/<app>.pem"
```

When they match, `review_identity_fallback` is `false` and the other fields are omitted.

**On the pull request**, add one clause to the existing marker line — not a banner, not a block:

```
**Verdict: APPROVE** · reviewed at `<sha>` · ⚠️ posted as PR author (App token unavailable)
```

The verdict stays binding and the gate is unaffected; the clause exists so that someone auditing this PR months later can tell a real App approval from a degraded one. Keep it to that single clause — the diagnosis and remedy belong in the run report, not in a code-review artifact.

### 7.3 Never block on it

A degraded identity must not halt the pipeline, fail the review, or change the verdict. The verdict is a value the skills own (§2) and travels in the marker either way, so the gate is unaffected. Blocking would convert a cosmetic problem into an outage.

### 7.4 Retrigger

There is no repair command and no cached state to clear: the token is minted per call. Fix the underlying cause, then re-run the review — `/review-pr <n>` for the human flow, or let the orchestrator's next review round run. Confirm recovery with `setup/github-app.md` §5, which distinguishes a working App from a silently-degraded one.

A run that has already merged past a degraded review needs nothing undone — the verdict was binding and correctly gated. Only the GitHub-visible attribution was wrong.
