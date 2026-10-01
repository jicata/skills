# Shared: the review verdict protocol

Included by `/review-pr`, `/afk-review-pr`, `/merge-pr`, `/afk-merge-pr`, `/concede-pr`, `/fix-review-identity`, and the `afk-reviewer` agent. Defines how a review verdict is **written** to GitHub and how it is **read back** at the merge gate.

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

To set up `app` mode, see `setup/github-app.md` **in the base skill library** — scripted via its `setup/create-review-app.js`. Those live in the base repo, not in consuming repos: `setup/` is not installed.

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

Write the payload with the event for the **configured** mode; the §5 single-call post mints the token and, if the mint fails, downgrades the event to `COMMENT` (effective mode `self`) before posting. Never mint in one Bash call and post in another.

**Never submit `APPROVE` or `REQUEST_CHANGES` while in `self` mode.** The call fails and the review is silently lost — including all of its inline comments.

## 4. Reading the verdict at the merge gate

One resolution routine, used by `/merge-pr` and `/afk-merge-pr`. Fetch `headRefOid`, `reviewThreads`, `latestReviews` (author `__typename` + `login`, state, `submittedAt`), and `reviews(last: 100)` (body + state + `submittedAt`, newest last). **The window must be 100, not 20:** every thread reply creates an empty-body `COMMENTED` review, so a busy follow-up pass can push the marker review out of a small window and misread the PR as `not_reviewed`. The governing review is found by filtering those bodies to the ones starting with `Claude comment 🤖` and taking the newest — never by position.

1. **A native `CHANGES_REQUESTED` blocks — with one supersession case.** For each `latestReviews` entry with `state == "CHANGES_REQUESTED"`:
   - **The configured review App** — `author.__typename == "Bot"` **and** `author.login` equals `<review_app_slug>[bot]` (`review_app_slug` from the profile; GraphQL may return the login without the `[bot]` suffix, so compare against both `<slug>` and `<slug>[bot]`) → **superseded**, not blocking, when the governing marker review (step 2) was submitted **after** that `CHANGES_REQUESTED` and its `reviewed_sha == headRefOid`. Otherwise → **blocked**.
   - **Anyone else** — a human, or **any other bot** → **blocked**, always. Authoritative regardless of what any marker says. **If `review_app_slug` is absent from the profile, no bot is superseded** — every `CHANGES_REQUESTED` blocks.

   Why the App case exists: in `app` mode, round 1 posts a native `CHANGES_REQUESTED` as the App; if round 2's token then fails, it degrades to a self-authored `COMMENT` carrying an `APPROVE` marker (§7). `latestReviews` reduces per reviewer, so the App's stale block stays there forever — nothing the degraded path can post replaces it. Letting it block would turn a credential hiccup into a permanently stuck PR, which §7.3 forbids. The App is the same reviewer as the marker; its newer marker on the current head is its newer word.

   > **Read `latestReviews[].state`, not `reviewDecision`.** `reviewDecision` is only populated when the repo *requires* reviews via branch protection — on a private repo on the free plan (where protection is unavailable) it stays `null` **even in `app` mode with a genuine `CHANGES_REQUESTED` review on the PR**. Verified 2026-08-07 on a donor repo's PR: an App-authored `CHANGES_REQUESTED` review registered `state: CHANGES_REQUESTED` on the review object and in `latestReviews`, while `reviewDecision` stayed empty. Gating on `reviewDecision` silently never fires. `latestReviews` gives one entry per reviewer, already reduced to their most recent review, and a dismissed review reads as `DISMISSED` — which correctly stops blocking.
2. **Find the governing verdict.** Take the newest review whose body starts with `Claude comment 🤖`, and parse its marker per §2 → `verdict` + `reviewed_sha`. **If that review has no parseable marker, its verdict is `COMMENT`** (legacy review, see below) — go to step 4 with it; there is no `reviewed_sha`, so skip step 3. Never fall past it to an older marker or to step 5.
3. **Staleness.** If `reviewed_sha != headRefOid` → **`review_stale`**. The review graded a commit that is no longer the head; its approval says nothing about the current code. This is a *route-back*, not a failure — the caller re-reviews and continues.
4. **Apply the verdict:**
   - `REQUEST_CHANGES` → **blocked** (`changes_requested`)
   - `COMMENT` with any unresolved thread → **blocked** (`unresolved_threads`)
   - `COMMENT` with all threads resolved → **blocked** (`not_approved`) — a comment review is not an approval, and inferring one from thread state is what let unreviewed work through before this protocol existed
   - `APPROVE` with all threads resolved → **pass**
   - `APPROVE` with any unresolved thread → **blocked** (`unresolved_threads`)
5. **No `Claude comment 🤖` review at all.** Only when **no** review body starts with `Claude comment 🤖`:
   - any `latestReviews[].state == "APPROVED"` (someone approved natively) → **pass**, subject to the same thread check
   - otherwise → **blocked** (`not_reviewed`)

**Legacy tolerance.** A review body that starts with `Claude comment 🤖` but carries no marker predates this protocol. When it is the newest `Claude comment 🤖` review, it governs as verdict `COMMENT` — never as an approval: `not_approved`, or `unresolved_threads` if any thread is open. It is **not** `not_reviewed` (a skill review exists) and it does **not** fall through to step 5's native-approval check. One fresh review pass clears it. That is the intended migration cost; do not add a fallback that infers approval from thread state.

## 5. Acquiring the App token (`app` mode only)

The base library never handles JWTs, private keys, or installation IDs. The repo supplies one command that prints a valid token to stdout, in the profile:

```yaml
review_identity: app
review_app_token_cmd: "<command that prints an installation access token to stdout>"
review_app_slug: "<app-slug>"   # its bot login is <app-slug>[bot]; used by the §4 step 1 supersession check
```

**The token does not survive between Bash calls** — each tool call is a fresh shell. Minting in one call and posting in the next leaves the token variable empty, `GH_TOKEN=""` makes `gh` fall back to its keyring login (the PR author), and a native `APPROVE`/`REQUEST_CHANGES` then 422s — **the whole review is lost**, inline comments included. So:

1. **Write the payload file first** (the `Write` tool is fine), with `event` set per §3 for the **configured** identity — the verdict in `app` mode, `COMMENT` in `self` mode — and the plain marker line.
2. **Post with exactly one Bash call** — the snippet below, used verbatim by `/review-pr`, `/afk-review-pr`, and `/concede-pr`. In that one call it (a) mints, (b) checks exit code **and** non-empty output, (c) on failure classifies the reason per §7.1, rewrites the payload's `event` to `COMMENT`, appends the §7.2 degraded clause to the marker line, and posts **without** setting `GH_TOKEN`, (d) on success posts with `GH_TOKEN` set inline, and (e) prints one line — `identity=<app|self> reason=<none|§7.1 reason> post_rc=<n> review_url=<url>` — from which the skill fills its `review_identity_*` fields and summary. It never prints the token or the helper's stderr. If the payload rewrite itself fails, it posts **nothing** (`post_rc=payload_rewrite_failed`) rather than risk a native event from the PR author's account.
3. **Never `GH_TOKEN=""`**, and never split the snippet across calls.

```bash
# ONE Bash call — mint, guard, (degrade), post. Shell state does not survive between calls.
# Substitute: <review_identity> (self|app, absent ⇒ self), <has_token_cmd> (yes|no),
# <review_app_token_cmd> (verbatim from the profile), <payload> (the JSON file),
# <owner>/<repo>, <n> (PR number).
PAYLOAD="<payload>"; ERR="$PAYLOAD.err"; IDENTITY=self; REASON=none; TOK=
if [ "<review_identity>" = app ]; then
  if [ "<has_token_cmd>" != yes ]; then
    REASON=not_configured
  else
    TOK="$(<review_app_token_cmd> 2>"$ERR")"; rc=$?
    if [ $rc -eq 0 ] && [ -n "$TOK" ]; then
      IDENTITY=app
    else
      TOK=; e="$(cat "$ERR" 2>/dev/null)"   # classified here, never printed
      case "$e" in
        *"Cannot find module"*)                          REASON=helper_missing ;;
        *ENOENT*)                                        REASON=key_missing ;;
        *"No such file"*|*"command not found"*)          REASON=helper_missing ;;
        *401*|*"JWT could not be decoded"*)              REASON=auth_failed ;;
        *404*|*"Not Found"*)                             REASON=not_installed ;;
        *403*|*"not accessible by integration"*)         REASON=forbidden ;;
        *)                                               REASON=token_error ;;
      esac
    fi
  fi
fi
rm -f "$ERR"
if [ "$IDENTITY" = self ]; then
  # Posting as the PR author: the event MUST be COMMENT (APPROVE/REQUEST_CHANGES 422 and lose the
  # whole review). If app mode degraded, also append the §7.2 clause to the marker line.
  PY="$(command -v python3 || command -v python)"
  "$PY" - "$PAYLOAD" "$REASON" <<'PYEOF'
import json, sys
path, reason = sys.argv[1], sys.argv[2]
with open(path, encoding="utf-8") as f:
    d = json.load(f)
d["event"] = "COMMENT"
clause = " · ⚠️ posted as PR author (App token unavailable)"
if reason != "none":
    lines = d["body"].split("\n")
    for i, line in enumerate(lines):
        if line.startswith("**Verdict:") and clause not in line:
            lines[i] = line + clause
            break
    d["body"] = "\n".join(lines)
with open(path, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False)
PYEOF
  if [ $? -ne 0 ]; then   # rewrite failed: never post a possibly-native event as the PR author
    URL=; post_rc=payload_rewrite_failed
  else
    URL="$(gh api repos/<owner>/<repo>/pulls/<n>/reviews --method POST --input "$PAYLOAD" --jq .html_url)"; post_rc=$?
  fi
else
  URL="$(GH_TOKEN="$TOK" gh api repos/<owner>/<repo>/pulls/<n>/reviews --method POST --input "$PAYLOAD" --jq .html_url)"; post_rc=$?
fi
unset TOK
echo "identity=$IDENTITY reason=$REASON post_rc=$post_rc review_url=$URL"
```

Rules:

- **Scope the token to review submission.** Thread resolution, replies, merges, and issue closes keep running as the normal account — the App is the reviewer, not the operator.
- **Never write the token to a file, a log, a PR comment, or the structured JSON return.**
- **Never echo the command's output** other than into the variable, and never print the helper's stderr — the snippet classifies it in place.
- **Windows / Git Bash:** call `gh api repos/...` with **no leading slash** — MSYS rewrites `/repos/...` into a filesystem path. And write every path inside `review_app_token_cmd` with forward slashes (`C:/Users/...`) — bash eats backslashes, and `\U` is an invalid escape in a double-quoted YAML scalar.
- If `review_app_token_cmd` is missing, empty, exits non-zero, or prints nothing, **fall back to `self` behaviour for this run** — but never silently. See §7.

## 6. What this protocol does and does not buy

- **Does:** a gate that reads an explicit verdict instead of inferring one from thread state; a stale-review check; identical behaviour across both identity modes; a GitHub audit trail that matches the decision actually made. In `app` mode, reviews carry a real `APPROVED`/`CHANGES_REQUESTED` state and a `[bot]` author, visibly distinct from the operator's own comments.
- **Does not:** server-side enforcement, and **not** a populated `reviewDecision`. That field needs branch protection with a review requirement, which is unavailable on private repos on the free plan — so even a genuine App-authored `CHANGES_REQUESTED` leaves it `null` there. Where protection *is* configured, `app` mode additionally blocks the merge via GitHub. Everywhere else the skill-level gate above is the only thing governing the agents, which is precisely why the marker is authoritative and `reviewDecision` is not consulted.
- **Does not:** independent review. A bot identity is a different actor to GitHub, not a different judgment. The reviewer is still the same model reading the same doctrine; `app` mode makes the trail honest, it does not make the review adversarial.

## 7. Degraded identity — loud, diagnosed, retriggerable

**A declared capability that is not actually available is a fault, not a mode.** `review_identity: self` behaving like `self` is correct and silent. `review_identity: app` behaving like `self` is a **mismatch between configured and effective**, and must never pass unremarked — a reviewer that quietly stops being the bot looks identical, in the GitHub UI, to a repo that was never configured for it.

Degrading is still the right *behaviour*: a credential problem must not cost a review, and the marker carries the verdict regardless. The requirement is that it is impossible to miss.

### 7.1 Detect and classify

Attempt the token once. On failure, classify — the remedy differs and a bare "it failed" is not actionable:

| `reason` | Signal | Repairable by `/fix-review-identity`? |
|---|---|---|
| `not_configured` | `review_identity: app` but no `review_app_token_cmd` | Partly — rebuilds the command if an App already exists |
| `helper_missing` | `Cannot find module` / `No such file` on the script path | **Fully, no human input** — rewrites the helper |
| `key_missing` | `ENOENT` on the `.pem` path | Partly — finds a misplaced key and repoints at it; a genuinely lost key must be regenerated by the human |
| `auth_failed` | `401` / `A JWT could not be decoded` | Diagnoses which of key/App-ID is wrong |
| `not_installed` | `404` on the installations endpoint | **Fully** if an installation exists (wrong ID); otherwise one click, then automatic |
| `forbidden` | `403 Resource not accessible by integration` | One click to re-approve, then verifies |
| `token_error` | anything else non-zero | Diagnoses; reports the first stderr line |

**The remedy printed to the operator is always the skill, never the underlying steps.** A hand-executed fix rots — paths drift, docs go stale, and the operator has to reconstruct intent from a one-line hint. Print `Fix: run /fix-review-identity`, and let the skill work out which of the above applies.

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
"review_identity_remedy": "run /fix-review-identity"
```

When they match, `review_identity_fallback` is `false` and the reason/remedy fields are `null`.

**On the pull request**, add one clause to the existing marker line — not a banner, not a block:

```
**Verdict: APPROVE** · reviewed at `<sha>` · ⚠️ posted as PR author (App token unavailable)
```

The verdict stays binding and the gate is unaffected; the clause exists so that someone auditing this PR months later can tell a real App approval from a degraded one. Keep it to that single clause — the diagnosis and remedy belong in the run report, not in a code-review artifact.

### 7.3 Never block on it

A degraded identity must not halt the pipeline, fail the review, or change the verdict. The verdict is a value the skills own (§2) and travels in the marker either way, so the gate is unaffected. Blocking would convert a cosmetic problem into an outage. That includes a native `CHANGES_REQUESTED` the App posted in an earlier round: it stays visible in the GitHub UI after a degraded round, but the gate treats it as superseded by the newer marker on the current head (§4 step 1).

### 7.4 Retrigger

Run **`/fix-review-identity`**. It diagnoses per §7.1, repairs everything that does not require a human (rewriting a missing helper, repointing at a misplaced key, correcting an installation ID), and reduces what does to a single browser click before verifying.

There is no cached state to clear: tokens are minted per call, so once the cause is fixed the next review runs as the App with nothing to re-run.

A run that has already merged past a degraded review needs nothing undone — the verdict was binding and correctly gated. Only the GitHub-visible attribution was wrong.
