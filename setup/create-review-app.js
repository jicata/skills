#!/usr/bin/env node
/**
 * Creates the review-identity GitHub App via GitHub's App-manifest flow.
 *
 *   node setup/create-review-app.js --name claude-reviewer-myhandle [--org ACME] [--port 8765]
 *
 * GitHub has no token-authenticated endpoint for creating an App, so consent must happen
 * in a browser. This automates everything either side of that: it builds the manifest,
 * serves the hand-off form, catches the redirect, exchanges the temporary code, writes the
 * private key, and prints the exact YAML to paste into the profile.
 *
 * The one-time conversion response is the ONLY time GitHub returns the private key. If this
 * script fails after the exchange, generate a fresh key from the App's settings page rather
 * than re-running it.
 *
 * Node 18+. No dependencies.
 */

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const argv = process.argv.slice(2);
const arg = (flag, fallback) => {
  const i = argv.indexOf(flag);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

const has = (flag) => argv.includes(flag);

const name = arg('--name');
const org = arg('--org');
const noOpen = has('--no-open');
const port = Number(arg('--port', '8765'));
const keyDir = arg('--key-dir', path.join(os.homedir(), '.ssh'));

if (!name) {
  console.error('Usage: node create-review-app.js --name <app-name> [--org <org>] [--port 8765] [--no-open]');
  console.error('  --name     must be unique across all of GitHub. Appears on reviews as "<name>[bot]".');
  console.error('  --no-open  print the URL instead of launching a browser. Use when your default');
  console.error('             browser is signed into the wrong GitHub account.');
  process.exit(1);
}

const redirectUrl = `http://localhost:${port}/callback`;

// Least privilege: exactly what posting a review and reading a diff + check runs requires.
const manifest = {
  name,
  url: 'https://github.com/anthropics/claude-code',
  redirect_url: redirectUrl,
  public: false,
  default_events: [],
  default_permissions: {
    pull_requests: 'write', // submit reviews + inline comments
    contents: 'read', // read the diff under review
    checks: 'read', // Axis C reads check-run conclusions
    metadata: 'read', // mandatory
  },
  // Webhooks are disabled, but GitHub still validates the URL's host and rejects
  // localhost/private addresses outright ("Hook url is not supported because it isn't
  // reachable over the public Internet"). It never calls this URL while active is false;
  // it only has to parse as a public one. redirect_url MAY be localhost — that is a
  // browser redirect, not a server-to-server call.
  hook_attributes: { url: 'https://example.com/unused', active: false },
};

const createUrl = org
  ? `https://github.com/organizations/${org}/settings/apps/new`
  : 'https://github.com/settings/apps/new';

const handoffPage = `<!doctype html>
<meta charset="utf-8">
<title>Create ${name}</title>
<body style="font-family:system-ui;max-width:34rem;margin:4rem auto;line-height:1.5">
<h2>Create the review App</h2>
<p>Submitting this form hands the prepared manifest to GitHub. Review the permissions on
GitHub's page, then click <b>Create GitHub App</b>.</p>
<form id="f" method="post" action="${createUrl}">
  <input type="hidden" name="manifest" id="m">
  <button type="submit" style="font-size:1rem;padding:.6rem 1.2rem">Continue to GitHub</button>
</form>
<script>
  document.getElementById('m').value = ${JSON.stringify(JSON.stringify(manifest))};
  document.getElementById('f').submit();
</script>
</body>`;

function openBrowser(url) {
  try {
    if (process.platform === 'win32') execFileSync('cmd', ['/c', 'start', '', url]);
    else if (process.platform === 'darwin') execFileSync('open', [url]);
    else execFileSync('xdg-open', [url]);
    return true;
  } catch {
    return false;
  }
}

async function exchange(code) {
  const res = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'claude-code-setup' },
  });
  if (!res.ok) throw new Error(`Conversion failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);

  if (url.pathname === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(handoffPage);
  }

  if (url.pathname !== '/callback') {
    res.writeHead(404);
    return res.end();
  }

  const code = url.searchParams.get('code');
  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('No code in callback. Re-run the script.');
    server.close();
    return process.exit(1);
  }

  try {
    const app = await exchange(code);
    fs.mkdirSync(keyDir, { recursive: true });
    const keyPath = path.join(keyDir, `${app.slug}.pem`);
    fs.writeFileSync(keyPath, app.pem, { mode: 0o600 });

    const installUrl = `https://github.com/apps/${app.slug}/installations/new`;

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;max-width:34rem;margin:4rem auto;line-height:1.5">
      <h2>✅ App created — one step left</h2>
      <p>Private key saved to <code>${keyPath}</code>.</p>
      <p><a href="${installUrl}"><b>Install it on your repository →</b></a></p>
      <p>Then return to the terminal.</p></body>`);

    console.log('\n✅ App created.\n');
    console.log(`   Name:      ${app.name}`);
    console.log(`   App ID:    ${app.id}`);
    console.log(`   Key saved: ${keyPath}  (chmod 600 — never commit this)`);
    console.log('\n── Next: install it on the repo ─────────────────────────────');
    console.log(`   ${installUrl}`);
    console.log('   Choose "Only select repositories" and pick the repo.');
    console.log('   The installation ID is the last path segment of the URL you land on:');
    console.log('   https://github.com/settings/installations/<INSTALLATION_ID>');
    // The command is consumed by a POSIX shell and by YAML. Windows backslashes are
    // eaten by bash (C:\Users\x -> C:Usersx) AND are escape sequences inside a
    // double-quoted YAML scalar. Forward slashes are accepted by Node on Windows and
    // are inert in both, so always emit them.
    const posix = (p) => p.replace(/\\/g, '/');
    console.log('\n── Then add to .claude/doctrine/project-profile.md ──────────');
    console.log('review_identity: app');
    console.log(
      `review_app_token_cmd: "GH_APP_ID=${app.id} GH_APP_INSTALLATION_ID=<INSTALLATION_ID> GH_APP_PRIVATE_KEY_PATH=${posix(keyPath)} node ${posix(path.join(os.homedir(), '.claude', 'gh-app-token.js'))}"`
    );
    console.log('\nVerify with setup/github-app.md §5 before relying on it.\n');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end(String(err));
    console.error(`\n✗ ${err.message}\n`);
    server.close();
    return process.exit(1);
  }

  server.close();
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`Port ${port} is in use. Re-run with --port <other>.`);
    process.exit(1);
  }
  throw err;
});

server.listen(port, () => {
  const url = `http://localhost:${port}/`;
  console.log(`\nCreating GitHub App "${name}"${org ? ` under org ${org}` : ''}.`);
  console.log('Permissions requested: pull_requests:write, contents:read, checks:read, metadata:read.\n');
  console.log('Open this in a browser signed in to the GitHub account that should OWN the App:');
  console.log(`   ${url}\n`);
  if (!noOpen && openBrowser(url)) {
    console.log('(Tried to open your default browser. If that browser is signed in to a');
    console.log(' different GitHub account, ignore the window it opened and paste the URL');
    console.log(' above into the right one — this server accepts either. Re-run with');
    console.log(' --no-open to skip the auto-launch entirely.)\n');
  }
  console.log('Waiting for GitHub to redirect back…');
});
