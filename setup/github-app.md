# Setting up a GitHub App as the review identity

Optional. Enables `review_identity: app`, which lets the review skills post **native `APPROVE` and `REQUEST_CHANGES` events** instead of comment-only reviews. Everything works without it — see [`skills/_shared/review-protocol.md`](../skills/_shared/review-protocol.md) for what `self` mode does and why it is the default.

## Why you would want this

GitHub refuses `APPROVE` and `REQUEST_CHANGES` from the PR's own author (`422`, not configurable). When the agent authors the PR *and* reviews it from the same account, the only event it can ever post is `COMMENT`, so `reviewDecision` stays `null` forever and the GitHub UI shows "commented" for a decision that was actually an approval or a block.

An App installation is a **distinct actor**, so both events land. You get:

- Reviews carrying a real `APPROVED` / `CHANGES_REQUESTED` state instead of `COMMENTED`
- Reviews attributed to a named bot, visually distinct from your own comments
- Native blocking via branch protection, *where branch protection is available* (not on private repos on the free plan)

What it does **not** light up is the PR's `reviewDecision` field. That requires branch protection with a review requirement, so on a private repo on the free plan it stays `null` even with a genuine App `CHANGES_REQUESTED` on the PR. Read `latestReviews[].state` instead — the merge gate already does.

What it does **not** get you: an independent opinion. Same model, same doctrine, different badge.

## What it costs

Free. One App, one private key to keep safe, one token-minting command.

## Fast path — scripted (recommended)

GitHub has no token-authenticated endpoint for creating an App, so consent has to happen in a browser. `create-review-app.js` automates everything either side of it: it builds the manifest with least-privilege permissions, catches GitHub's redirect, exchanges the code, writes the private key with mode `600`, and prints the profile YAML.

```bash
node setup/create-review-app.js --name claude-reviewer-<yourhandle>   # add --org ACME for an org
```

Two clicks — **Create GitHub App**, then **Install** on the repo — and it prints the App ID, key path, and the exact `review_app_token_cmd`. Fill in the installation ID from the URL you land on, then go to §4 for the token script and §5 to verify.

> **Multiple GitHub accounts?** The App is owned by whichever account is signed in *in the browser that loads the page* — not by your `gh` CLI identity. If your default browser is signed in to the wrong account, ignore the window it opens and paste the printed `http://localhost:<port>/` URL into the right browser; the local server accepts a request from either. `--no-open` skips the auto-launch. Getting this wrong creates the App under the wrong account, and the fix is to delete it and start over.

Requires: Node 18+, and permission to install Apps on the target account. On an org that restricts App installation to owners, the script still creates the App — an owner has to approve the install.

> The manifest conversion is the **only** time GitHub returns the private key. If the script fails after that exchange, don't re-run it — generate a fresh key from the App's settings page instead.

## Manual path

Use this if the scripted flow can't run (no Node, no browser on the box, or an org policy that needs the App created by hand).

### 1. Create the App

<https://github.com/settings/apps/new> (or your org's **Settings → Developer settings → GitHub Apps → New**).

- **Name:** anything unique across GitHub — e.g. `claude-reviewer-<yourhandle>`. This is what shows on reviews, with a `[bot]` suffix.
- **Homepage URL:** any valid URL; unused.
- **Webhook:** **uncheck Active.** This App is polled, never called.

**Repository permissions** — grant only these:

| Permission | Access | Why |
|---|---|---|
| Pull requests | **Read & write** | Submitting reviews and inline comments |
| Contents | Read-only | Reading the diff under review |
| Metadata | Read-only | Mandatory; granted automatically |
| Checks | Read-only | Axis C reads check-run conclusions |

Nothing else. In particular **not** Administration, and **not** Actions write.

**Where can this app be installed:** "Only on this account".

Create it, then note the **App ID** from the settings page.

### 2. Generate a private key

Same page → **Private keys → Generate a private key**. A `.pem` downloads once.

Store it outside any repo — `~/.ssh/claude-reviewer.pem` is fine. **Never commit it.** If it leaks, revoke it on this page and generate a new one.

### 3. Install it on the repo

**Install App** in the left sidebar → your account → **Only select repositories** → pick the repo.

After installing, the URL of the settings page ends in the **installation ID**:
`https://github.com/settings/installations/12345678` → `12345678`.

You now have three values: App ID, installation ID, private key path.

### 4. Provide a token command

Installation tokens expire after an hour, so the profile holds a *command that mints one*, never a token. The base library runs it, uses the output, and discards it.

Save this as `~/.claude/gh-app-token.js` (Node 18+, no dependencies):

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

(The `iat: now - 60` backdate absorbs clock skew between you and GitHub — a JWT issued "in the future" is rejected. `exp` must be within 10 minutes.)

Then record it in `.claude/doctrine/project-profile.md`:

```yaml
review_identity: app
review_app_token_cmd: "GH_APP_ID=123456 GH_APP_INSTALLATION_ID=12345678 GH_APP_PRIVATE_KEY_PATH=$HOME/.ssh/claude-reviewer.pem node $HOME/.claude/gh-app-token.js"
```

The App ID and installation ID are not secrets — only the `.pem` is. Keeping the key *path* in the profile and the key itself outside the repo is the whole security boundary.

> **Always write the path with forward slashes**, including on Windows (`C:/Users/you/.ssh/app.pem`). The value is consumed by a POSIX shell *and* by a YAML parser: bash silently eats backslashes (`C:\Users\you` → `C:Usersyou`) and `\U` is an invalid escape inside a double-quoted YAML scalar. Node accepts forward slashes on Windows, so they are inert in both.
>
> Note also that `chmod 600` has no real effect on Windows — the key file will still list as `-rw-r--r--` under Git Bash. Protect it with NTFS ACLs or by location, not by mode bits.

### 5. Verify before relying on it

```bash
TOK=$(<review_app_token_cmd>)      # the command itself, substituted in verbatim

# 1. It minted an installation token
echo "${TOK:0:4}...  (len ${#TOK})"        # expect ghs_...

# 2. The token is the App, and is scoped to the repo you installed it on
GH_TOKEN="$TOK" gh api installation/repositories --jq '.repositories[].full_name'

# 3. Baseline — prove your own account CANNOT do this (expect 422 twice)
gh api repos/<owner>/<repo>/pulls/<n>/reviews --method POST -f event=APPROVE -f body=probe
gh api repos/<owner>/<repo>/pulls/<n>/reviews --method POST -f event=REQUEST_CHANGES -f body=probe

# 4. The real test — the same call as the App
SHA=$(gh pr view <n> --json headRefOid -q .headRefOid)
GH_TOKEN="$TOK" gh api repos/<owner>/<repo>/pulls/<n>/reviews \
  --method POST -f event=APPROVE -f body="Claude comment 🤖

**Verdict: APPROVE** · reviewed at \`$SHA\`

Verifying App review identity." --jq '"state=\(.state) author=\(.user.login) id=\(.id)"'
```

**Step 4 printing `state=APPROVED author=<your-app>[bot]` is the proof**, against step 3's two `422`s. Do **not** verify with `gh pr view <n> --json reviewDecision` — that field stays `null` without branch protection and will make a working App look broken.

Dismiss the test review afterwards so it doesn't sit on the PR as a real approval:

```bash
gh api repos/<owner>/<repo>/pulls/<n>/reviews/<id>/dismissals \
  --method PUT -f message="Verification only."
```

## Failure modes

| Symptom | Cause |
|---|---|
| `422 Can not approve your own pull request` | The review ran as you, not the App — `review_app_token_cmd` failed and the run fell back to `self`. Check the return's `review_identity_fallback` flag. |
| `401 A JWT could not be decoded` | Wrong private key, or the key belongs to a different App than `GH_APP_ID`. |
| `404` on `/app/installations/<id>/access_tokens` | Wrong installation ID, or the App was uninstalled from the repo. |
| `403 Resource not accessible by integration` | Missing **Pull requests: Read & write**. Permission changes need re-approval on the installation page. |
| Token works but reviews 404 | The App is installed on the account but not on *this* repository. |
| `reviewDecision` still empty after a successful App review | Not a failure. That field needs branch protection with a review requirement; without it, it stays `null` no matter who reviews. Check the review's own `state` and `latestReviews[].state` instead. |
| `Hook url is not supported because it isn't reachable over the public Internet` | Only from a hand-written manifest — `hook_attributes.url` is host-validated even when `active: false`, so it cannot be `localhost`. `redirect_url` may be. The bundled script already uses a public placeholder. |
| `invalid API endpoint: "C:/Program Files/Git/..."` | Git Bash on Windows rewrote a leading-slash API path into a filesystem path. Call `gh api repos/...` without the leading slash — that form is correct in every shell. |
| App created under the wrong account | Ownership follows the browser session that loaded the consent page, not `gh auth status`. Delete the App and re-run in the right browser. |

Per the protocol, any failure here degrades to `self` behaviour for that run rather than losing the review — the verdict marker still carries the decision and the merge gate still reads it correctly.

## Moving to another machine

`review_app_token_cmd` lives in the repo, but the two things it points at deliberately do not. A fresh clone therefore has the *configuration* for `app` mode without the *capability*, and reviews will degrade to comment-only.

Copy both, to the exact paths named in the command:

| What | Typical path | Why it isn't in the repo |
|---|---|---|
| The private key | `~/.ssh/<app-slug>.pem` | It's a credential. Committing it would let anyone review, and GitHub auto-revokes keys it finds in public repos. |
| The token helper | `~/.claude/gh-app-token.js` | Machine-level tooling, shared by every repo using this App. |

Then re-run §5 to confirm. Prefer `$HOME`-relative paths in `review_app_token_cmd` so the same value works on every machine.

**You will not silently get this wrong.** A repo configured `review_identity: app` whose token command fails says so in the run's **Execution conformance** block — the closing section of `/ship-issue` and `/ship-feature`, which states configured vs executed mode and the fix. `/review-pr` on its own leads its chat summary with the same line. The orchestrators additionally probe the token at startup (`/ship-issue` Step 0d, `/ship-feature` Step 0b), so a fresh machine is reported before any work begins rather than several review rounds in. See `skills/_shared/review-protocol.md` §7.

Recovery needs no repair command: tokens are minted per call, so once the key and helper are in place the next review is back to `app` mode on its own.

## Reverting

Set `review_identity: self` (or delete both keys) in the profile. Nothing else changes; the gate reads the marker either way.
