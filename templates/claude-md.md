<!-- TEMPLATE — materialized by /setup as `./CLAUDE.md` (or `./.claude/CLAUDE.md`) in EVERY repo.
     This is the ONLY file Claude Code loads into every session automatically, so it is the only
     place "always-on" is a fact rather than a wish. Keep it under ~50 lines: the docs warn that
     oversized always-on context costs tokens every session AND measurably reduces adherence.
     Anything path-specific belongs in `templates/path-rule.md` instead. Fill every <FILL: …>
     slot; delete this comment. -->

# <FILL: repo name>

<FILL: one or two lines — stack, and the architecture shape in a sentence. Enough that an agent
opening a file knows what kind of codebase it is in.>

## Where the rules actually live

- **`.claude/doctrine/project-profile.md`** — this repo's constraints, each with the incident behind it. Read it before <FILL: the two or three activities whose constraints bite hardest here>. It is the only writable skill surface; base files install verbatim.
- **`.claude/doctrine/00-doctrine-index.md`** — which doctrine governs which activity.
- **`.claude/rules/`** — path-scoped, loaded automatically when a matching file is opened. You do not need the index for those.

## Canon

<FILL: the durable documents, one line each, with what each answers. If the repo runs a lean canon,
say so and name what deliberately does NOT exist, so nobody recreates it.>

## Checks

```bash
<FILL: the profile's check_commands, verbatim>
```

<FILL: the one non-obvious thing about these commands — a gate that looks redundant but is not, a
test runner that does not typecheck, a lint that also enforces something else. If there is nothing
non-obvious, delete this line rather than padding it.>

## Never

<FILL: 2–4 constraints, and only those that are (a) catastrophic or expensive to get wrong, and
(b) not discoverable from the code. Each one: the imperative, then the scar in a clause. These are
the rules that must survive a compaction — everything else can live in the profile and load on
demand.>

> **EXAMPLE — delete:** **Never hardcode surrogate Ids of runtime-managed tables.** They carry
> random per-environment GUIDs; the code seed invents its own that match no real database. Resolve
> by natural key. A literal Id passes tests and fails everywhere real — it shipped once and broke
> startup with a duplicate-key violation.
