# React Frontend Rules

**Priority:** High — load for any React component change, alongside `arch-frontend.md`.

**Axis:** frontend framework. **Owns:** idiom — state primitives, server-state mechanics, component syntax, framework footguns. **Defers to `arch-frontend.md` for:** the page/component boundary, folder roots, promotion rules, where server state lives. See [`AXES.md`](./AXES.md).

(Extracted 2026-08 from `frontend-architecture.md` Part C when the frontend axis was split. The donor ran React + a query-cache library + a component library with a theme.)

## Server state

- **Server state is managed by the query-cache library** — `useQuery` for reads, `useMutation` for writes. Raw `useEffect` + `fetch` + `useState` for server data is an anti-pattern: it re-implements caching, deduplication, and staleness by hand and gets them wrong.
- The provider is mounted **once at the app root** with a single shared client instance.
- After a mutation succeeds, **invalidate the factored key** (`arch-frontend.md` B3) rather than manually refetching.
- Never copy server data into `useState`. The duplicate drifts from the cache the moment anything else invalidates it.

## Client state

- `useState` for local UI state; `useReducer` when transitions are related and multi-field.
- Context for long-lived cross-cutting client state (current user, theme) — mounted at the app root. Context is not a state manager; putting frequently-changing values in it re-renders every consumer.
- Derive during render instead of storing derived values in state and syncing with effects.

## Effects

- **`useEffect` is for synchronizing with something outside React** — a subscription, a timer, an imperative DOM API. It is not the place to fetch, and it is not the place to react to a prop change by setting state.
- Every effect declares complete dependencies. Silencing the lint rule hides a stale closure, which surfaces later as a value that will not update.
- Every subscription returns a cleanup function.

## Components

- Function components only. One component per file; filename matches the default export.
- Props are typed explicitly. Avoid `React.FC` — it adds implicit `children` and buys nothing.
- **Keys are stable identity, never the array index** where the list can reorder, insert, or delete — index keys make React reuse the wrong node and preserve the wrong local state.
- Reach for `memo`/`useMemo`/`useCallback` when a measurement says to, not preemptively. Premature memoization adds dependency arrays that go stale.

## Styling

- Prefer the component library's primitives and its `sx`/styled mechanism over hand-rolled markup and stylesheet files.
- Theme tokens, never hard-coded colours, spacing, or type scales.

## Anti-patterns (React-specific — the structural ones live in `arch-frontend.md`)

1. **Raw `useEffect` + `fetch` for server data** instead of the cache library.
2. **Manual refetch after mutation** instead of invalidating keys.
3. **Server data copied into `useState`.**
4. **Index keys on a reorderable list.**
5. **Effect-driven derived state** — an effect whose only job is to set state from props.
6. **Incomplete dependency arrays** with the lint rule silenced.
7. **Context holding fast-changing values**, re-rendering every consumer.
8. **`useEffect` cleanup omitted** on subscriptions and timers.
