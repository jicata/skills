# Fowler Smell Baseline — judgement-call heuristics for review

**Priority:** Medium (never blocks on its own)

(Extracted 2026-07 from the donor stack. Generic; repo-specific suppressions live in the repo's `project-profile.md` overlay / ADRs.)

A curated subset of Fowler's "Bad Smells in Code" (*Refactoring*, ch. 3) for the Standards axis of code review. These cover design-quality ground **no other doctrine file codifies** — reviewers may cite this file as the standard behind such a finding without "inventing" one.

## Binding rules (read first)

1. **Always a judgement call.** A smell is reported as a *labelled heuristic* — "possible Feature Envy" — at 🟡 or 💭 per the reviewer rubric, **never** 🔴 on its own. A smell plus a real consequence (a bug, a violated doctrine rule) escalates on the strength of the consequence, not the smell.
2. **Documented doctrine overrides.** Where a doctrine file, ADR, or the repo's profile endorses the shape (an ADR-chosen structure is not a smell), suppress it. A repo's profile/ADRs may exempt specific framework-mandated shapes — check before reporting. (Attributed donor example: indirection mandated by its base chassis is not a Middle Man.)
3. **Skip what tooling enforces.** Anything the analyzers/formatter already catch is not a finding.
4. **Don't double-report.** Several classic smells are already owned by other installed doctrine — check the repo's installed doctrine for smells it already owns (its doctrine index tells you) and cite *those* sources instead. Typically: Mysterious Name & Duplicated Code → the backend-standards doctrine + karpathy; Shotgun Surgery & Divergent Change → the VSA slice-root census; Speculative Generality → karpathy (no speculative features).

## The smells

Each reads *what it is* → *how to fix*. Match against the diff, not the whole file.

- **Feature Envy** — a method that reaches into another object's data more than its own (`order.Customer.Address.Zone` math inside a handler that owns none of it). → move the logic onto the type it envies.
- **Data Clumps** — the same few fields or parameters keep travelling together (a type wanting to be born: `institutionId, sessionId, blueprintId` threading through four signatures). → bundle them into one type, pass that.
- **Primitive Obsession** — a `string`/`Guid`/`decimal` standing in for a domain concept that has invariants of its own. → give the concept a small value type. (Weigh against karpathy simplicity — a type earning no invariant is speculative.)
- **Repeated Switches** — the same `switch`/`if`-cascade on the same discriminator recurring across the change. → polymorphism, or one map both sites share.
- **Message Chains** — long `a.B().C().D()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or method that mostly just delegates onward (the shallow-module smell in miniature — see the `codebase-design` skill). → cut it, call the real target. (Framework-mandated indirection is not a Middle Man — rule 2.)
- **Refused Bequest** — a subclass or interface implementer that ignores or throws on most of what it inherits. → drop the inheritance, use composition. (A deliberate, ADR-documented marker-interface pattern is not Refused Bequest — rule 2.)
