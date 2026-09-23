# Pull Live State First — a mutable live store has zero local copies

**Priority:** High — always-on in its one-line form ("state held in a live store — `<the profile's live_state_sources>` — is pulled before it is quoted or reasoned about, and never transcribed into a tracked file"), which the generated `CLAUDE.md` carries whenever this file is installed. The trigger is a question, not a file type, so no `paths:` rule can load it. This file carries the rules and the reasoning and is on-trigger from the doctrine index.

**Axis:** none — axis-independent. See [`AXES.md`](./AXES.md).

(Extracted 2026-09 from the donor stack's `aigw-instruction-pull-first.md`, generalized from its one store — prompt instructions held on an AI gateway — to any store of its kind. Installed when the setup interview answers yes to Q4b. Repo-specifics — which stores, the exact pull command for each, which environment it reads — live in the profile's `live_state_sources` key.)

Some behaviour-shaping state does not live in the repo at all: stored prompt instructions on a model gateway, feature-flag rules, remote config, a tenant's settings row. It is edited out of band — through an admin UI, by another team, mid-afternoon — and nothing tells this repo. **When that state is one command away, it has exactly one copy: the live store.** Not one trustworthy copy among several. One.

Reasoning about it from a committed transcription is the same mistake as reasoning about runtime from the app repo instead of the chassis, or about a contract from the producer instead of the consumer — one layer further out: **reasoning about a system's current state from a document about it, when the system itself is one command away.**

## The rules

1. **Pull before reasoning about, quoting, or proposing a change to it.** Use the pull command the profile records. It must be read-only and use credentials the app or the operator already holds — no new secrets, no write access.
2. **Keep no committed transcription, in any form, for any reason.** No `docs/<store>/` mirror, no "canonical copy", no appendix in an ADR or spec, no fixture, no test constant. It is pulled, or it is not known. The tempting exceptions — "it's only a proposal", "it's just for review" — are exactly how the stale copies come to exist. If you catch yourself pasting the store's text into a tracked file, stop.
3. **Never trust any recorded quotation as current state.** An old PR description, an ADR excerpt, a memory note, an issue comment — all are dated snapshots at best. Re-pull before relying on one.
4. **Changes are proposed on the work item, not applied from the repo.** Draft the new text in an issue comment, next to the **pre-edit pull it was written against — the item's id and its version/updated-at stamp**. A human applies it through the store's own admin surface. Then **re-pull to verify** the apply landed as intended and record the post-apply stamp in a follow-up comment. A comment is the right home because it is explicitly point-in-time and carries no upkeep contract; a tracked file silently claims to be current. Nothing in the repo writes to the store.
5. **Scope the pull to the environment it read.** A pull from dev proves nothing about staging or production, which usually hold separate instances. Say so whenever the distinction matters.
6. **No automated test may depend on a live pull.** The store is external, mutable, and credentialed — exactly the dependency a test suite must never carry. Live verification is an operator action, never a CI assertion.

## Why "keep no file" and not "distrust the file"

The donor ran the weaker rule first — committed transcriptions were allowed, labelled proposal-only, never current state. The discipline was followed in form and still failed.

> **Donor scar (ADF, 2026-09-21):** an audit pulled all four committed prompt-instruction transcriptions and diffed each against its live counterpart the same hour. Two matched exactly. One was **31 lines behind** — two merged PRs' worth — although it carried the most careful process of the four (a pre-edit pull, a seven-edit diff, a filled post-apply table): its post-apply record predated an out-of-band gateway edit three days later. The fourth **named no instruction id at all**, so there was no mechanical way to tell what it corresponded to; the live instruction was nearly twice its length. The files were deleted, not re-caveated.

What the audit made plain, none of which a stronger caveat would fix:

- **Half were clean, and that is the problem.** Nothing distinguishes the clean copies from the stale ones without a pull — which is the whole cost the copy was supposed to save.
- **Process rigor does not keep a mirror current.** The worst copy was the one under active development, with the best process attached.
- **A copy that cannot be diffed against its original** (no id, no version stamp) is strictly worse than no copy.

Deleting the copies loses nothing recoverable: the store holds the current text, version control holds every historical draft, and the reviewable proposal lives on the issue.

## Reviewer red flags

- **A diff that adds the store's content to a tracked file** — a mirror directory, a "canonical copy" appendix, a fixture, a test constant. Block on this one; the rest are its symptoms.
- A spec or review quoting the store's current content with no same-session pull behind the quote.
- A proposed change drafted anywhere but the work item, or one that omits the pre-edit id + version stamp.
- An apply with no follow-up re-pull recording the post-apply stamp.
- A test or CI step that reaches the live store.
- A claim about one environment's state sourced from another environment's pull.
