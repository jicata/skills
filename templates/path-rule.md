<!-- TEMPLATE — materialized by /setup as `.claude/rules/<topic>.md`, one per row of the generated
     doctrine index's path-routing table. Fill every <FILL: …> slot; delete this comment. -->

<!-- THE ONE RULE ABOUT RULES: `paths:` is mandatory.

     `.claude/rules/*.md` is a Claude Code mechanism, not a naming convention. A rule WITHOUT
     `paths:` frontmatter loads at launch in every session, at the same priority as CLAUDE.md —
     forever, whether or not it is relevant. That is how a rules directory silently grows into
     thousands of lines of always-on context, which costs tokens every session and measurably
     reduces adherence to the rules it contains.

     A rule WITH `paths:` costs nothing until Claude opens a matching file, and then arrives
     exactly when it is needed. Every rule this library generates is path-scoped. If a constraint
     cannot be tied to a path, it is not a rule — it belongs in the doctrine index (activity-scoped)
     or, if it is genuinely catastrophic, in CLAUDE.md. -->

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
     * Keep it short. ~15 lines is plenty. The cost is paid on every matching file open.
     * Verify the globs match real files before committing. A rule that matches nothing is worse
       than no rule: it looks like coverage and provides none.
     * Prefer a few broad rules over many narrow ones. Each file open evaluates every rule.
-->
