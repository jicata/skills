---
name: fix-review-identity
description: Diagnose and repair the repo's review identity when reviews are degrading to comment-only — a missing token helper, a misplaced private key, an uninstalled or re-permissioned GitHub App, or a profile that declares `app` mode without the config to back it. Use when a /ship-* run's Execution conformance block reports a review-identity mismatch, when /review-pr says it posted as the PR author, or when the user asks to fix, check, or set up review identity.
---

# Fix Review Identity

Repairs the gap between the `review_identity` a repo **declares** and the one its reviews **execute** as. Invoked by name from the run report that detected the gap — the operator should never have to reconstruct the fix from a one-line hint.

Read [`../_shared/review-protocol.md`](../_shared/review-protocol.md) §7 first; this skill is its repair path.

## Invocation

`/fix-review-identity` — diagnose, repair what can be repaired, verify, report.

`/fix-review-identity --check` — diagnose and verify only. Change nothing.

## What this skill may and may not touch

- **May** write the token helper, correct a path in `review_app_token_cmd`, fill in an installation ID, and re-verify. Profile edits touch the `review_app_token_cmd` line only and stay in the working tree — never commit them; leave the diff for the human.
- **May not** invent, move, or transmit key material. A private key is a credential: if it is genuinely absent, the human must place it or generate a new one. Never print it, never copy it into the repo, never echo a token.
- **May not** flip `review_identity` to `self` to make the warning stop. That hides the fault instead of fixing it — only the human decides to stop using the App.

## Step 1 — Read the declared state

From `.claude/doctrine/project-profile.md`: `review_identity` and `review_app_token_cmd`.

- **Key absent, or `self`** → nothing is broken; `self` is a valid configuration. Report that, and offer the upgrade: creating an App takes two browser clicks via `setup/create-review-app.js` in the base library (`--org <org>` for an org-owned repo; walkthrough: `setup/github-app.md`). **On an org that restricts App installs to owners, say plainly that the install needs an org owner's approval:** the App is created immediately, but the token command fails `not_installed` until an owner approves, so the profile must not be flipped to `app` before `setup/github-app.md` §5 passes. Stop unless the user asks for it.
- **`app`** → continue.

## Step 2 — Probe and classify

Run `review_app_token_cmd`, capturing stderr. Discard any token immediately; never print it.

```bash
ERR="$(mktemp)"; TOK="$(<review_app_token_cmd> 2>"$ERR")"; rc=$?; unset TOK
head -n1 "$ERR"; rm -f "$ERR"
```

`rc == 0` → skip to Step 4. Failure → classify per protocol §7.1: `not_configured`, `helper_missing`, `key_missing`, `auth_failed`, `not_installed`, `forbidden`, `token_error`.

## Step 3 — Repair by cause

### `helper_missing` — repairable with no human input

The helper is machine-level tooling, not a secret. Write it to the path named in `review_app_token_cmd` (create parent directories), then re-probe:

```js
const crypto = require('crypto');
const fs = require('fs');

const appId = process.env.GH_APP_ID;
const installationId = process.env.GH_APP_INSTALLATION_ID;
const pem = fs.readFileSync(process.env.GH_APP_PRIVATE_KEY_PATH, 'utf8');

const now = Math.floor(Date.now() / 1000);
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const signingInput = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iat: now - 60, exp: now + 540, iss: appId })}`;
const signature = crypto.createSign('RSA-SHA256').update(signingInput).sign(pem).toString('base64url');
const jwt = `${signingInput}.${signature}`;

// `--jwt`: print the App JWT instead (for App-level endpoints: `app`, `app/installations[/<id>]`).
if (process.argv.includes('--jwt')) { process.stdout.write(jwt); process.exit(0); }

fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json' },
})
  .then((r) => r.json())
  .then((d) => {
    if (!d.token) { console.error(d); process.exit(1); }
    process.stdout.write(d.token);
  })
  .catch((e) => { console.error(e); process.exit(1); });
```

(`iat` is backdated 60s for clock skew; `exp` must be within 10 minutes.)

**Two token kinds, two endpoint families — do not mix them.** Wherever this skill says "mint a JWT", run `review_app_token_cmd` with `--jwt` appended (the helper above prints the App JWT and exits). The JWT authenticates as the **App** and is the only credential `app` and `app/installations[/<id>]` accept. The plain command prints an **installation token**, which is the only credential `installation/repositories` and repo endpoints accept. An older helper without the `--jwt` branch silently prints an installation token (`ghs_…`) instead, and every App-level call then 401s — treat that as `helper_missing` and rewrite the helper (see Step 4).

### `key_missing` — search before asking

The key is often present under a different name or path, especially after a machine move. **Search, then verify by use** — a file named like a key proves nothing:

```bash
ls ~/.ssh/*.pem ~/.claude/*.pem ~/Downloads/*.private-key.pem 2>/dev/null
```

For each candidate, mint a JWT with the profile's `GH_APP_ID` and call `GH_TOKEN="<jwt>" gh api app` (the JWT, never the installation token). The one that authenticates is the right key — matching by filename is a guess, matching by successful auth is proof. A key for a **personal-account** App (one created for the operator's own repos) authenticates as *that* App, not as the one installed on `<org>` — report that as a mismatch, don't repoint at it.

- **A candidate authenticates** → update the path in `review_app_token_cmd`. Do **not** copy or move the key; point at where it already lives.
- **None do** → the key is genuinely gone. GitHub cannot re-issue it and there is no API to create one, so the human must generate a fresh key: App settings → **Private keys → Generate a private key**, save outside any repo, then re-run this skill. Print the App's settings URL — `https://github.com/settings/apps/<slug>` for a personal-account App, `https://github.com/organizations/<org>/settings/apps/<slug>` for an org-owned one — and say plainly that the old key should be deleted on that page once replaced.

### `not_installed` — one click, then automatic

The App exists but isn't installed on this repo, or the installation ID is wrong. Mint a JWT and list installations:

```bash
GH_TOKEN="<jwt>" gh api app/installations --jq '.[] | "\(.id) \(.account.login) \(.repository_selection)"'
```

- **An installation exists** → the recorded ID is simply wrong. Correct it in `review_app_token_cmd`. No human input needed.
- **None** → print `https://github.com/apps/<slug>/installations/new`, ask for **Only select repositories** → this repo, then re-list and fill the ID in automatically. The operator clicks; this skill does the rest. On an org that restricts installs to owners, the click raises an install **request** that an org owner must approve — say so, and that the request can sit pending with no error: the probe keeps reporting `not_installed` until it is approved, and the profile stays as it is until then.

### `forbidden` — re-approval, then verify

Permissions changed and the installation needs re-approval (on an org, by an org owner). Print the installation URL and the four required permissions (`pull_requests: write`, `contents: read`, `checks: read`, `metadata: read`). After approval, re-probe.

### `auth_failed` — the key and the App ID disagree

Test the configured key against the configured `GH_APP_ID`. If `GH_TOKEN="<jwt>" gh api app` fails, run the `key_missing` search to find which App the key *does* belong to, and report the mismatch concretely — name both the App ID in the profile and the App the key authenticates as, rather than reporting a bare 401.

### `not_configured` — declared `app` with nothing behind it

`review_identity: app` with no usable `review_app_token_cmd`. If the account already has a suitable App (`gh api app/installations` after a JWT, or ask), rebuild the command from its App ID, installation ID, and key path. Otherwise this is first-time setup, not a repair: point at `setup/create-review-app.js` in the base library, and at the org-owner approval it will need on an org repo.

## Step 4 — Verify end to end

Never report success from a probe alone — a token that mints can still be scoped to the wrong repo.

```bash
# Installation token → installation-scoped endpoint: which repos can this token reach?
TOK=$(<review_app_token_cmd>)
[ -n "$TOK" ] && GH_TOKEN="$TOK" gh api installation/repositories --jq '.repositories[].full_name'   # must list this repo
unset TOK

# App JWT → App-level endpoint: what did the installation actually grant? (GET app and
# app/installations/<id> reject installation tokens — they need the JWT.)
JWT=$(<review_app_token_cmd> --jwt)
case "$JWT" in
  ghs_*|"") echo "jwt=outdated_helper" ;;          # old helper ignored --jwt (or printed nothing)
  *) GH_TOKEN="$JWT" gh api "app/installations/<GH_APP_INSTALLATION_ID>" \
       --jq '"\(.app_slug) \(.account.login) perms=\(.permissions)"' \
       || echo "jwt=outdated_helper" ;;          # must show pull_requests: write
esac
unset JWT
```

`pull_requests: write` is the load-bearing permission — without it the token mints happily and every review 403s.

**A failed JWT call here means an outdated helper — treat it as `helper_missing`.** Step 2 already proved the key and App ID mint a working installation token, so the helper can sign a valid JWT; if `--jwt` returns an installation token (`ghs_…`), nothing, or a JWT that 401s on `app/installations/<id>`, the helper on disk predates the `--jwt` branch. Rewrite it per `helper_missing` (Step 3) — in `--check` mode, report it instead — and re-run Step 4. Do not reclassify it as `auth_failed`: the successful mint already ruled out a key/App-ID problem.

Check the **installation's** permissions (`app/installations/<id>`), not the App's (`app`): after a permission change the App declares the new set immediately, but the installation keeps the old one until it is re-approved — the installation's set is what the token actually gets.

Do **not** post a test review to verify. Use `setup/github-app.md` §5 if the user explicitly wants an end-to-end proof on a real PR, and dismiss the review afterwards.

## Step 5 — Report

State what was broken, what changed, and what the operator (or org owner) did. Then confirm recovery in the operator's terms: **the next review runs as the App — tokens are minted per call, so no cache to clear and nothing to re-run.** If a `/ship-*` run reported the original mismatch, its next run's Execution conformance block will read `✅ Ran as configured.`

If the repair needed the human (or an org owner's approval) and that hasn't happened yet, say exactly what remains and that re-invoking this skill resumes from there.

## Critical Rules

1. **Never print a token, a private key, or more than the first line of a helper's stderr.** Stderr can carry the key path; it must never carry key material.
2. **Never copy a private key into the repo** — not even temporarily, not even gitignored.
3. **Never flip `review_identity` to `self` to silence the warning.** That is hiding the fault. Only the human retires the App.
4. **Verify by use, never by filename.** A candidate key counts only if it authenticates against the configured App ID.
5. **Never post a review to test.** Verification uses read-only endpoints.
6. **`--check` changes nothing** — no files written, no profile edits, no directories created.
7. **Repair what needs no human, ask for only what does.** A missing helper is a silent auto-fix; a missing key or a pending org install approval is not.
8. **Never commit.** Profile edits stay in the working tree for the human to review.
