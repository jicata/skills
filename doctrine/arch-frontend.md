# Frontend Architecture Guidelines

**Priority:** High
**Instruction:** You MUST follow these guidelines when organizing, generating, or refactoring frontend code.

**Axis:** frontend architecture. **Owns:** placement — the page/component boundary, folder roots, promotion, where server state lives. **Defers to the repo's frontend framework core (`frontend-react.md`, `frontend-vue.md`) for:** state primitives, data-fetching mechanics, component syntax. See [`AXES.md`](./AXES.md).

(Extracted 2026-08 from the donor stack's `frontend-architect.md`. Repo-specifics — component library, router, state library, folder roots — live in the repo's `.claude/doctrine/project-profile.md` overlay.)

This doctrine governs **how the frontend is organized**: folder boundaries, page/component separation, data ownership, and state placement. Its job is to prevent the drift where pages, layouts, modals, and leaf components all sit flat in one directory. It is the frontend counterpart to the repo's backend architecture core — same instinct (colocate by feature, isolate at the boundary, promote only on a second real consumer), applied to a component tree.

---

## Part A: Structure

### A1. The page/component boundary (non-negotiable)
- A **page** is a route-addressable entry point. It owns a URL, it owns data fetching, and it composes components.
- A **component** is a reusable building block. It receives data via props. **It does not fetch.**
- A page and a component must **never** sit at the same folder level. A route entry point next to a leaf component in one folder is a structural bug.

### A2. Canonical folder structure
```text
src/
├── pages/
│   └── {PageName}/
│       ├── {PageName}Page.{ext}          ← the route entry point
│       ├── {PageName}Page.test.{ext}     ← colocated test
│       ├── components/                   ← page-scoped components
│       └── {composables|hooks}/           ← page-scoped stateful logic (optional; named per the framework core)
├── components/                           ← CROSS-page shared components only
│   └── {Shared}/
├── services/                             ← API wrappers grouped by domain
│   └── {domain}Api.{ext}
└── types/                                ← shared types
```

**Promotion rule**: a page-scoped component moves to the shared root **only when a second page actually imports it.** Never preemptively. This is the same promotion rule the backend architecture cores apply to boundary-local types, and it fails the same way when ignored.

### A3. One component per file
Filename matches the default export. No multi-component files. A small helper used only by its parent may be inlined as a named function, but once it grows past ~20 lines or earns its own test, it gets its own file.

### A4. Service module conventions
One file per domain. Each exported function maps 1:1 to a backend endpoint — do not bundle several endpoints behind a "facade" function. Types used by the service live in the shared types root, not inline.

### A5. Test colocation
Tests sit next to the file they cover. Pages get integration-style tests that render the page and assert on user-visible behaviour (query by role/label, not by implementation detail). Components get focused tests with fixture props — **no service mocking, because components should not touch services.** If a component test needs a service mock, the component is violating A1.

### A6. Styling
Use the repo's component library as the primitive layer (the profile names it). Don't hand-roll markup and CSS when the library has the component. Custom styling uses the library's styling mechanism, not stylesheet files, unless the styling is genuinely global or page-level layout. **Theme tokens come from the theme** — no hard-coded colours, spacings, or font sizes in components.

---

## Part B: Data & state ownership

### B1. Separate server state from client state
This is the distinction the rest of Part B rests on:
- **Server state** (anything fetched from an API) → the server-state cache. Never duplicated into local component state. Never manually synchronized.
- **Local client state** (form inputs, UI toggles, hover, "is this modal open") → component-level state.
- **Shared client state across siblings within one page** → lift to the page.
- **Cross-page client state** → a context provider at the appropriate level. No prop drilling past 2 levels. A dedicated client-state library is not required until context causes *measurable* re-render pain — defer that decision.

### B2. Pages own the data
Pages call service functions through the framework core's server-state primitives. Components receive resolved data (and loading/error state if they need it) **via props**. Components do not import from `services/` and do not call query hooks directly.

Why: components become trivially testable with fixture props, the data graph stays visible at one place per route, and caching, deduping, background refetch, and stale-while-revalidate come for free.

### B3. Cache keys are structured and factored
Use a structured key (e.g. a tuple `['domain', 'entity', ...params]`). **Define key factories in the service module** so mutations can invalidate precisely rather than guessing at key shapes.

### B4. Mutations invalidate — they do not manually refetch
After a successful write, invalidate the relevant keys. Never manually re-call the read function.

### B5. One cache instance, mounted once at the app root.
Long-lived cross-cutting client state (current user, theme) may live in a context provider at the app level. The server-state cache is for *server* state — don't misuse it for pure UI state.

---

## Part C: framework specifics

**Moved to the framework axis.** What used to live here — the state primitives, the server-state mechanism, and the component syntax — differs per framework and is now a separate core:

- `frontend-react.md` — where the profile records React
- `frontend-vue.md` — where the profile records Vue

Load exactly one, alongside this file. Parts A and B above are framework-neutral and apply to both.

---

## 🎨 The design artifact is the build target

Where the repo runs a **design-handoff pipeline** (the profile records whether it does, and where artifacts live), a component's design artifact — its screenshots, API notes, and design notes — **is the source of truth for that component's visual treatment.** Not the surrounding code, not the markup you happen to be moving.

This matters most during **extraction and relocation**. When you lift a leaf out of a parent, the markup you are lifting tells you the **data wiring and behaviour to preserve** — props, conditional render rules, formatting, empty and edge states. It does **not** define the look. If the component has a design artifact, (re)build the visual treatment to the artifact, even if the result looks materially different from the inline version you started with.

- ❌ **Lift-and-shift the look.** Extract a headline from its parent by copying the inline markup verbatim, when the component's accepted design specifies a different container, type scale, and treatment. The result matches the source you extracted from, not the design.
- ✅ **Preserve behaviour, build the design.** Carry over render rules, props, and formatting from the inline source; build the visual treatment from the artifact.

> **Donor scar:** exactly this shipped — an economics headline extracted from its parent section kept the parent's inline 22px split-headline markup, while its own accepted design specified a 30px carded band with stacked eyebrows and filled pills.

A "placement", "extract", "move", or "refactor" task headline does **not** license skipping the design. If the component has an artifact, fidelity to it is in scope by default.

---

## 🚫 Anti-patterns to flag

1. **Flat page folders** — pages, modals, layouts, and leaf components at one level with no `components/` subfolder.
2. **Fetching inside components** — a leaf importing from `services/`, calling `fetch()`, or invoking a server-state primitive directly.
3. **Raw lifecycle effects for server data** instead of the framework core's server-state mechanism.
4. **Manual refetch after mutation** instead of invalidating keys.
5. **Server data stuffed into local state** — duplicated state that will drift from the cache.
6. **Multi-component files.**
7. **Prop drilling >2 levels** — if a prop passes through a component that doesn't use it, lift state or use context.
8. **Hand-rolled primitives** when the component library has them.
9. **Hard-coded theme values** (colours, spacing, type).
10. **Speculatively shared components** promoted without a second consumer.
11. **Cross-page reach-in** — one page importing from another page's `components/`. Promote it to the shared root; do not import across the boundary. (Same rule, same reasoning, as the backend architecture core's cross-boundary reach-in.)
12. **Lift-and-shift of a designed component's look** during extraction, where a design artifact exists.

---

## 🔗 Relationship to implementation quality

This doctrine covers **structure and data ownership**. In-component implementation quality — performance, accessibility, memoization, web vitals — is a separate concern; where the repo keeps such rules, the profile's doctrine index points at them. When advice conflicts, prefer this file for folder, boundary, and state-placement decisions.
