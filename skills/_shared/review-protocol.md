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
- If `review_app_token_cmd` is missing, empty, or exits non-zero, **fall back to `self` behaviour for this run** (post `COMMENT` with the marker) and note `review_identity_fallback: true` in the structured return. A token problem must never cost a review — the marker still carries the verdict, and the gate still reads it correctly.

## 6. What this protocol does and does not buy

- **Does:** a gate that reads an explicit verdict instead of inferring one from thread state; a stale-review check; identical behaviour across both identity modes; a GitHub audit trail that matches the decision actually made. In `app` mode, reviews carry a real `APPROVED`/`CHANGES_REQUESTED` state and a `[bot]` author, visibly distinct from the operator's own comments.
- **Does not:** server-side enforcement, and **not** a populated `reviewDecision`. That field needs branch protection with a review requirement, which is unavailable on private repos on the free plan — so even a genuine App-authored `CHANGES_REQUESTED` leaves it `null` there. Where protection *is* configured, `app` mode additionally blocks the merge via GitHub. Everywhere else the skill-level gate above is the only thing governing the agents, which is precisely why the marker is authoritative and `reviewDecision` is not consulted.
- **Does not:** independent review. A bot identity is a different actor to GitHub, not a different judgment. The reviewer is still the same model reading the same doctrine; `app` mode makes the trail honest, it does not make the review adversarial.
