<!-- TEMPLATE — materialized by /setup as `.claude/rules/<topic>.md`, one per row of the generated
     doctrine index's path-routing table. Fill every <FILL: …> slot; delete this comment. -->

<!-- THE ONE RULE ABOUT RULES: `paths:` is mandatory.

     `.claude/rules/*.md` is a Claude Code mechanism, not a naming convention. A rule WITHOUT
     `paths:` frontmatter loads at launch in every session, at the same priority as CLAUDE.md —
     forever, whether or not it is relevant. That is how a rules directory silently grows into
     thousands of lines of always-on context, which costs tokens every session and measurably
     reduces adherence to the rules it contains.

     A rule WITH `paths:` costs nothing until Claude READS a matching file, and then arrives
     exactly when it is needed. Every rule this library generates is path-scoped. If a constraint
     cannot be tied to a path, it is not a rule — it belongs in the doctrine index (activity-scoped)
     or, if it is genuinely catastrophic, in CLAUDE.md. -->

<!-- WHAT ACTUALLY TRIGGERS A PATH RULE (verified 2026-09-23 in headless Claude Code sessions on
     the donor repo; re-verify if the harness changes):

     * Absent at session start. Injected after a Read tool call on a file matching `paths:`.
     * NOT injected by Glob — listing matching files loads nothing. Per the docs and open issues,
       not by Write or Edit either.
     * So a brand-new file written without first reading a neighbour gets NO rule. For a path
       class where new files are the common case (a new migration, a new slice), either make the
       authoring skill read an existing sibling first, or carry the imperative in CLAUDE.md /
       the coder lens as well.
     * Several rules can inject on one Read when their globs overlap — keep overlapping rules
       non-contradictory, and prefer one broad rule to three that always fire together.
     * Only `paths:` is honoured. Cursor-style `globs:` / `alwaysApply:` keys are silently
       ignored by Claude Code — a rule scoped with them is either always-on (no `paths:`) or
       dead. The donor carried such dead keys unnoticed. -->

---
paths:
  - "<FILL: glob, e.g. src/**/*.ts>"
  - "<FILL: additional globs — migrations, a test tree, a sibling project>"
---

# <FILL: what this path class is, in three or four words>

Full doctrine: `.claude/doctrine/<FILL>.md`<FILL: + any second file>. Read <FILL: it | them> in full before asserting anything structural — this file carries only the constraints that get broken most.

<FILL: 3–6 bullets. Each one an imperative, then the WHY in a clause. Choose them by asking "which
of this doctrine's rules has actually been broken, or would be most expensive to break?" — not by
summarizing the doctrine top to bottom.>

<!-- DISCIPLINE — delete this block once filled:

     * A rule is a LOADER, not a copy. Duplicating doctrine here guarantees the two drift, and the
       copy wins because it is the one in context. Point at the doctrine; carry only the sharpest
       few imperatives so that an agent which ignores the pointer still has the load-bearing ones.
     * Keep it short. ~15 lines is plenty. The cost is paid on every matching file read.
     * Verify the globs match real files before committing. A rule that matches nothing is worse
       than no rule: it looks like coverage and provides none.
     * Prefer a few broad rules over many narrow ones. Each file open evaluates every rule.
-->
