---
name: wayfinder
description: Plan a huge chunk of work — more than one agent session can hold — as a shared map of decision tickets on GitHub, and resolve them one at a time until the way to the destination is clear.
disable-model-invocation: true
---

# Wayfinder

A loose idea has arrived — too big for one agent session, and wrapped in fog: the way from here to the **destination** isn't visible yet. Wayfinding is about finding that way, not charging at the destination. This skill charts the way as a **shared map** on GitHub, then works its **decision tickets** — questions whose resolution is a decision, not slices of a build to execute — one at a time until the route is clear.

The destination varies per effort, and naming it is the first act of charting — it shapes every ticket. Here it is usually **a set of specs to hand to the repo's spec-authoring skill** — but it might be a single decision to lock, or a change made in place.

## Plan, don't do

Wayfinder is **planning** by default: each ticket resolves a decision, and the map is done when the way is clear — nothing left to decide before someone goes and builds. The pull to just do the work is usually the signal you've reached the edge of the map and it's time to hand off. An effort can override this in its **Notes** — absent that, produce decisions, not deliverables.

**Hand-off, not build:** when the frontier and fog are empty, collapse the map's linked decisions into the repo's spec-authoring skill (per its pipeline; in the donor: `/write-a-prd`) — one map often spawns several specs, and the map is the parent context they share. An effort that turned out single-spec-sized exits via the repo's issue-authoring skill instead. Wayfinder tickets never enter the executor path: they carry `wayfinder:*` labels and `## Question` bodies, so a repo's build-pipeline executors (which select by their own labels/templates) never pick them up.

## Refer by name

Every map and ticket is an issue, so it has a **name** — its title. In everything the human reads — narration, the map's Decisions-so-far — refer to it by that name, never by a bare number. The number and URL ride *inside* the name as its link, never stand in for it.

## The Map

The map is a single GitHub issue labelled `wayfinder:map` — the canonical artifact. Its tickets are **native sub-issues** of the map. The map is an **index**, not a store: it lists the decisions made and points at the tickets that hold their detail; a decision lives in exactly one place — its ticket — so the map never restates it, only gists and links.

### The map body

The whole map at low resolution, loaded once per session. Open tickets are **not** listed — they are open sub-issues, found by query.

```markdown
## Destination

<what reaching the end of this map looks like — the spec set, decision, or change this effort is finding its way to. One or two lines; every session orients to it before choosing a ticket.>

## Notes

<domain; skills every session should consult (the repo's domain glossary is always in this list); standing preferences for this effort>

## Decisions so far

<!-- the index — one line per closed ticket: enough to judge relevance, then zoom the link for detail -->

- [<closed ticket title>](link) — <one-line gist of the answer>

## Not yet specified

<!-- in-scope fog you can't ticket yet; graduates as the frontier advances -->

## Out of scope

<!-- work ruled beyond the destination; closed, never graduates -->
```

### Tickets

Each ticket is a sub-issue of the map. Its body is the question, sized to one agent session:

```markdown
## Question

<the decision or investigation this ticket resolves>
```

Each ticket carries a `wayfinder:<type>` label — `research`, `prototype`, `grilling`, or `task`.

A session **claims** a ticket by assigning it to the dev driving the map (`gh issue edit <n> --add-assignee "@me"`), **first**, before any work. The assignee _is_ the claim: an open, unassigned ticket is unclaimed.

Blocking uses GitHub's **native dependency relationship**. A ticket is **unblocked** when every issue blocking it is closed; the **frontier** is the open, unblocked, unclaimed sub-issues — the edge of the known. Native edges render "Blocked" in GitHub's own UI, so the human sees what's takeable without opening the map.

The answer isn't part of the body — it's recorded on resolution. Assets created while resolving are linked from the ticket, not pasted in; research findings land as a **cited comment on the ticket** (a branch only for genuinely large artifacts).

### GitHub recipe

`{owner}/{repo}` below are placeholders — `gh api` substitutes the current repo for them automatically; fill them explicitly when operating on another repo.

```bash
# labels (idempotent, once per repo)
for t in map research prototype grilling task; do gh label create "wayfinder:$t" --color 0e8a16 --force; done

# create map / ticket
gh issue create --title "<name>" --label "wayfinder:map" --body-file <map.md>
gh issue create --title "<name>" --label "wayfinder:grilling" --body-file <ticket.md>

# bind ticket as sub-issue of the map (needs database ids, not numbers)
TID=$(gh api repos/{owner}/{repo}/issues/<ticket-number> --jq .id)
gh api repos/{owner}/{repo}/issues/<map-number>/sub_issues -f sub_issue_id=$TID

# wire a blocking edge: <ticket> is blocked by <blocker>
BID=$(gh api repos/{owner}/{repo}/issues/<blocker-number> --jq .id)
gh api repos/{owner}/{repo}/issues/<ticket-number>/dependencies/blocked_by -f issue_id=$BID

# frontier: open sub-issues, unassigned, with no open blockers
gh api repos/{owner}/{repo}/issues/<map-number>/sub_issues --jq '.[] | select(.state=="open" and (.assignees|length)==0) | .number'
#   then per candidate: gh api repos/{owner}/{repo}/issues/<n>/dependencies/blocked_by --jq '[.[] | select(.state=="open")] | length'   # 0 → frontier
```

## Ticket Types

Every ticket is either **HITL** — human in the loop, worked *with* a human who speaks for themselves — or **AFK**, driven by the agent alone. A HITL ticket only resolves through that live exchange; the agent never stands in for the human's side of it (a grilling agent that answers its own questions has broken this).

- **Research** (AFK): surface a fact a decision waits on. Codebase questions → a background Explore/general-purpose agent; external questions → `deep-research`. Findings land as a cited comment on the ticket. Use when knowledge outside the current conversation is required.
- **Prototype** (HITL): raise the fidelity of the discussion with a cheap concrete artifact to react to, via `/prototype`. Links the prototype branch as an asset. Use when "how should it behave" is the key question.
- **Grilling** (HITL): conversation via `/grill-me`'s interview discipline — one question at a time, facts looked up, decisions put to the human, stop-gated. Use `/grill-with-docs` when the decision should update the doc matrix as it crystallises. The default type.
- **Task** (HITL or AFK): manual work that must happen before a *decision* can be made — provisioning access, capturing live fixtures, getting a BA window. The one type that *does* rather than decides — it earns its place by unblocking a decision, not by delivering the destination. The answer records what was done and the facts later tickets depend on.

## Fog of war

The map is _deliberately_ incomplete: don't chart what you can't yet see. Beyond the live tickets lies the **fog of war** — decisions you can tell are coming but can't pin down, because they hang on questions still open. Resolving a ticket clears the fog ahead of it, graduating whatever's now specifiable into fresh tickets — until the way to the destination is clear and no tickets remain.

**Fog or ticket?** The test is whether you can state the question precisely now — _not_ whether you can answer it now. Ticket when the question is sharp (even if blocked); **Not yet specified** when you can't yet phrase it that sharply. Don't pre-slice fog into ticket-sized pieces — one patch may graduate into several tickets, or none.

## Out of scope

Fog only gathers _toward_ the destination. Work beyond it is **out of scope** — its own map section, not fog. When an existing ticket turns out to sit past the destination, **close it** and leave one line in Out of scope (gist + why, linking the closed ticket). It stays out of Decisions-so-far, which records the route actually walked. Out-of-scope work returns only if the destination is redrawn — as a fresh effort, not a resumption.

## Invocation

Two modes. Either way, **never resolve more than one ticket per session** — except research tickets, which run in the background.

### Chart the map

User invokes with a loose idea.

1. **Name the destination.** Grill (per `/grill-me`'s discipline) to pin down what this map is finding its way to. The destination fixes the scope, so it's settled first.
2. **Map the frontier.** Grill again, **breadth-first**: fan out across the whole space, surfacing the open decisions and the first steps takeable now. **If this surfaces no fog** — the journey fits one session — you don't need a map. Stop and ask the user how they'd like to proceed (usually straight to a grilling session → the repo's spec- or issue-authoring skill).
3. **Create the map** (label `wayfinder:map`): Destination and Notes filled, Decisions-so-far empty, the fog sketched into Not yet specified.
4. **Create the tickets you can specify now** as sub-issues — then wire blocking edges in a **second pass** (issues need ids before they can reference each other).
5. **Fire the research agents.** For each research ticket, spin up its background agent now; findings arrive as ticket comments.
6. Stop — charting is one session's work; it hand-resolves nothing.

### Work through the map

User invokes with a map (number or URL). A ticket is optional — without one, you pick the next, not the user.

1. Load the **map** — the low-res view, not every ticket body.
2. Choose the ticket: the one the user named, else the first frontier ticket. **Claim it** (assign) before any work.
3. Resolve it — **zoom as needed**: fetch full bodies of related/closed tickets on demand; invoke the skills the Notes block names.
4. Record the resolution: post the answer as a **resolution comment**, **close** the ticket, append one line to the map's Decisions-so-far.
5. Add newly-surfaced tickets (create-then-wire); graduate fog the answer made specifiable, clearing each graduated patch from Not yet specified. If the answer reveals a ticket sits beyond the destination, rule it out of scope. If it invalidates other tickets, update or delete them.

The user may run unblocked tickets in parallel sessions, so expect concurrent tracker edits.
