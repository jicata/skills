# Pre-PR Consolidation Pass

Run **exactly once per slice**: after every planned behavior is green, before opening the PR. Behavior stays unchanged; tests stay green after each step.

Look for:

- **Duplication** → extract function/class
- **Long methods** → break into private helpers (keep tests on the public interface)
- **Naming drift** → names that made sense in cycle 1 but not for the finished slice
- **Dead code** → scaffolding a later cycle made obsolete
- **Feature envy** → move logic to where the data lives
- **Primitive obsession** → introduce value objects
- **Existing code** the new code reveals as problematic — per the repo's ambient-smell rule, if it has one: name it in one line, don't expand the diff

Out of scope for this pass: design-level restructuring — deepening modules, moving seams, merging/splitting classes (see `/codebase-design`). That belongs to review.
