# Doctrine axes — how cores compose

Doctrine cores are **pluggable along independent axes**. A repo picks one core per axis and the setup interview installs that combination: *Python + VSA*, *.NET + Clean*, *Vue + VSA*. Any pick on one axis must work against any pick on another, which is only true if the cores never reach into each other.

This file is the contract that makes that true. Read it before authoring or editing any core.

## The axes

| Axis | Filename prefix | Owns | Cores today |
| --- | --- | --- | --- |
| **Backend architecture** | `arch-` | **Placement** — where a file lives, what may import what, when a type is promoted | `arch-vsa.md`, `arch-layered.md`, `arch-clean.md`, `arch-onion.md` |
| **Backend language** | `backend-` | **Idiom** — naming, syntax, error handling, DI style, test framework, complexity limits | `backend-dotnet.md`, `backend-python.md` |
| **Frontend architecture** | `arch-` | Placement — the page/component boundary, folder roots, promotion | `arch-frontend.md` |
| **Frontend framework** | `frontend-` | Idiom — state primitives, data-fetching mechanics, component syntax | `frontend-react.md`, `frontend-vue.md` |

Axis-independent doctrine (`relational-persistence.md`, `fowler-smell-baseline.md`, `how-to-explain.md`, …) carries no prefix. It installs on its own trigger and must hold under every combination.

## The law: no core names a peer on another axis

A core may reference **its own axis** freely. It must **never** name a specific core on another axis — not by filename, not by link, not by assuming its idiom.

This is the whole of pluggability. A single hardlink from `arch-vsa.md` to `backend-dotnet.md` means "VSA implies .NET", and Python + VSA becomes a combination the library claims to support and quietly contradicts.

**Instead of naming a peer, defer to the role:**

| Don't write | Write |
| --- | --- |
| "…violates the limits in `dotnet-backend.md`" | "…violates the single-responsibility limits in **the repo's backend language core**" |
| "`CreatePostCommand.cs`" | "`CreatePostCommand.{ext}`" — or name the role: "the command file" |
| "each a `record` request model" | "each a request model — an immutable data carrier in whatever form the language core prescribes" |
| "avoid generic repository interfaces shared across features" (in a language core) | nothing — that is a *placement* ruling and belongs to the architecture axis |

### The exception: enumerating a peer axis is not depending on it

A core **may** name the *complete menu* of an adjacent axis, where the point is that the reader picks one:

- `arch-frontend.md` says "load `frontend-react.md` **or** `frontend-vue.md`" — a menu, and the file works identically whichever you pick.
- `backend-dotnet.md` says "directly in the slice under `arch-vsa`, with the feature that owns it under `arch-layered`, behind a port under `arch-clean`/`arch-onion`" — it enumerates every architecture and states what each implies, assuming none.

What is forbidden is naming a **single** peer as though it were the only one, which silently makes that pairing mandatory. The test: **if a new core were added to the peer axis, would this sentence become wrong?** A menu goes stale and gets a new entry. A dependency was always a bug.

The per-repo **generated coder lens** is the one artifact that knows both picks, so it is where cross-axis *routing* legitimately happens. Cores stay ignorant of which peer was chosen; the lens composes them.

## The tie-break: architecture wins on placement, language wins on idiom

Genuine contradictions exist between axes, and every combination will re-litigate them unless the resolution is written down once.

- **Placement** — where a file goes, what may import what, whether a repository interface exists at all: **the architecture core wins.** Under `arch-clean` a repository interface in the domain layer is mandatory; under `arch-vsa` a generic cross-feature repository is a smell. The language core has no vote.
- **Idiom** — what the file is called, how the type is declared, how errors surface, which test framework: **the language core wins.** `arch-clean` does not get to mandate PascalCase in a Python repo.
- **Repo reality beats both.** A constraint in the repo's `project-profile.md` overrides any core; it is the recorded scar, they are the generic default.

State this order in the generated coder lens's *Conflict resolution* section so a coder run resolves it without re-deriving.

## The shape of a core

Every core opens with a provenance-and-scope line naming its axis and what it defers:

```markdown
**Axis:** backend language. **Owns:** idiom. **Defers to the repo's architecture core for:** placement.
```

Then:

- **Language cores** cover: naming conventions, type/function declaration style, error handling and how errors become responses, dependency injection or its absence, complexity limits, the test framework and mocking policy, and the language's specific footguns. They never draw a folder tree.
- **Architecture cores** cover: the unit of organization, the canonical folder tree in `{ext}`-neutral form, the import/dependency rules, promotion rules, and the anti-patterns that signal drift. They never prescribe naming case or syntax.
- **Frontend framework cores** cover only what the shared `arch-frontend.md` leaves open: state primitives, the server-state mechanism, and component syntax.

## Adding a core

1. Pick the axis; name the file with its prefix.
2. Write the scope line. If you cannot state what it defers, the axis is wrong.
3. Grep your draft for peer-axis leakage — language names, file extensions, framework APIs in an `arch-` core; folder trees and import rules in a `backend-`/`frontend-` core.
4. Add it to the axis table above, to the README's doctrine section, and to the setup interview's Q5/Q6 menus.
5. Do **not** add a cross-reference to a *single* peer. Enumerating a peer axis's full menu is fine (see the exception above); anything narrower belongs in the coder-lens template instead.
6. Re-run the law check: for every peer-axis name your draft mentions, confirm the file mentions **all** of that axis's cores. A partial menu is a dependency in disguise.

## Combinations are not pre-blessed

The library does not maintain a matrix of "supported" pairings. Any `arch-*` composes with any `backend-*` by construction — that is what the law buys. A pairing that feels wrong in practice is evidence that one of the two cores has leaked across its axis; fix the leak, don't add an exception.
