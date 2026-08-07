# Setting up a GitHub App as the review identity

Optional. Enables `review_identity: app`, which lets the review skills post **native `APPROVE` and `REQUEST_CHANGES` events** instead of comment-only reviews. Everything works without it — see [`skills/_shared/review-protocol.md`](../skills/_shared/review-protocol.md) for what `self` mode does and why it is the default.

## Why you would want this

GitHub refuses `APPROVE` and `REQUEST_CHANGES` from the PR's own author (`422`, not configurable). When the agent authors the PR *and* reviews it from the same account, the only event it can ever post is `COMMENT`, so `reviewDecision` stays `null` forever and the GitHub UI shows "commented" for a decision that was actually an approval or a block.

An App installation is a **distinct actor**, so both events land. You get:

- A real `reviewDecision` on the PR
- Reviews attributed to a named bot, visually distinct from your own comments
- Native blocking via branch protection, *where branch protection is available* (not on private repos on the free plan)

What it does **not** get you: an independent opinion. Same model, same doctrine, different badge.

## What it costs

Free. One App, one private key to keep safe, one token-minting command.

## Fast path — scripted (recommended)

GitHub has no token-authenticated endpoint for creating an App, so consent has to happen in a browser. `create-review-app.js` automates everything either side of it: it builds the manifest with least-privilege permissions, catches GitHub's redirect, exchanges the code, writes the private key with mode `600`, and prints the profile YAML.

```bash
node setup/create-review-app.js --name claude-reviewer-<yourhandle>   # add --org ACME for an org
```

Two clicks — **Create GitHub App**, then **Install** on the repo — and it prints the App ID, key path, and the exact `review_app_token_cmd`. Fill in the installation ID from the URL you land on, then go to §4 for the token script and §5 to verify.

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

### 5. Verify before relying on it

```bash
# 1. The command prints a token (starts with ghs_)
eval "$(<review_app_token_cmd>)" | head -c 4

# 2. The token identifies as the App, not you
GH_TOKEN="$(<review_app_token_cmd>)" gh api /installation/repositories --jq '.repositories[].full_name'

# 3. The real test — a native APPROVE on an open PR authored by you
GH_TOKEN="$(<review_app_token_cmd>)" gh api /repos/<owner>/<repo>/pulls/<n>/reviews \
  --method POST -f event=APPROVE -f body="Claude comment 🤖

**Verdict: APPROVE** · reviewed at \`$(gh pr view <n> --json headRefOid -q .headRefOid)\`

Verifying App review identity."

# 4. Confirm it registered as a real decision
gh pr view <n> --json reviewDecision
```

Step 4 printing `APPROVED` is the proof. Under `self` mode step 3 would have failed with `422` — that difference is the entire point.

Dismiss the test review afterwards if you don't want it on the record:

```bash
gh api /repos/<owner>/<repo>/pulls/<n>/reviews/<review-id>/dismissals \
  --method PUT -f message="Identity verification only."
```

## Failure modes

| Symptom | Cause |
|---|---|
| `422 Can not approve your own pull request` | The review ran as you, not the App — `review_app_token_cmd` failed and the run fell back to `self`. Check the return's `review_identity_fallback` flag. |
| `401 A JWT could not be decoded` | Wrong private key, or the key belongs to a different App than `GH_APP_ID`. |
| `404` on `/app/installations/<id>/access_tokens` | Wrong installation ID, or the App was uninstalled from the repo. |
| `403 Resource not accessible by integration` | Missing **Pull requests: Read & write**. Permission changes need re-approval on the installation page. |
| Token works but reviews 404 | The App is installed on the account but not on *this* repository. |

Per the protocol, any failure here degrades to `self` behaviour for that run rather than losing the review — the verdict marker still carries the decision and the merge gate still reads it correctly.

## Reverting

Set `review_identity: self` (or delete both keys) in the profile. Nothing else changes; the gate reads the marker either way.
