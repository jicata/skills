# Vue Frontend Rules

**Priority:** High — load for any Vue component change, alongside `arch-frontend.md`.

**Axis:** frontend framework. **Owns:** idiom — reactivity primitives, server-state mechanics, component syntax, framework footguns. **Defers to `arch-frontend.md` for:** the page/component boundary, folder roots, promotion rules, where server state lives. See [`AXES.md`](./AXES.md).

Written for Vue 3 with `<script setup lang="ts">`. Repo-specifics — component library, router, server-state library, whether a store exists — live in the repo's `.claude/doctrine/project-profile.md` overlay.

## Component syntax

- **`<script setup lang="ts">` is the default.** The Options API is legacy for new code; mixing both across a codebase means two mental models for the same problem.
- One component per file; filename matches the component and is `PascalCase.vue`.
- Props via `defineProps<T>()` with a TypeScript type, not an object literal with runtime types — the type is the contract and it is checked by `vue-tsc`.
- Emits are declared with `defineEmits<T>()`. An undeclared emit is untyped and invisible to the parent.
- `defineExpose` only where a parent genuinely needs imperative access. It is a hole in the boundary; the default is props down, events up.

## Reactivity — the part that actually bites

- **`ref` for everything by default; `reactive` only for an object you will never replace wholesale.** `reactive` loses reactivity the moment it is reassigned or destructured, and that failure is silent — the UI simply stops updating.
- **`.value` in script, never in template.** A `ref` read in script without `.value` compares a `RefImpl` object and is always truthy — the most common Vue bug and it throws no error.
- Destructuring props breaks reactivity. Use `toRefs()` where you need the pieces, or read `props.x` at the point of use.
- `computed` for derived values — never a `watch` that assigns to another ref. A watcher chain is a derived value with extra steps and an ordering bug.
- `watch` for side effects; `watchEffect` when the dependencies are obvious and you want them tracked automatically. Return a cleanup from either where it starts something.
- **Reach for `shallowRef` for large immutable payloads.** Deep reactivity on a big API response walks the whole object graph for nothing.

## Server state

- Where the repo has a server-state library (`@tanstack/vue-query`, `useAsyncData`, …), it owns caching, deduplication, and invalidation; after a mutation, invalidate the factored key rather than refetching by hand.
- **Where the repo has none**, `onMounted` + a typed API wrapper is the correct minimal pattern, and the loading/error/data triple is explicit local state. Do not hand-roll a cache — either adopt a library or keep it honestly simple.
- Never copy server data into a second `ref` that must be kept in sync.
- Guard against the unmounted-write race: a component that awaits and then assigns to a `ref` should tolerate having been torn down mid-flight.

## Composables

- **A composable is Vue's unit of reusable stateful logic** — the equivalent of a hook. Name it `useThing`, put it in `composables/`, return refs and functions.
- Call composables at the top level of `setup`, never inside a conditional, loop, or callback — lifecycle hooks registered inside them must bind to the component instance.
- A composable that only wraps a pure function should be a plain function. Not everything needs to be a composable.

## Template discipline

- **Never `v-if` and `v-for` on the same element.** `v-for` has higher priority in Vue 3, so the condition evaluates per-item against a variable that may not be in scope. Wrap in `<template v-if>` or filter in a `computed`.
- **Keys are stable identity, never the array index** where the list can reorder, insert, or delete.
- Keep template expressions to a single readable operation; anything longer belongs in a `computed`.
- Prefer the component library's primitives and its theme tokens over hand-rolled markup and hard-coded colours, spacing, or type scales.
- `v-html` only on content you produced. It is an XSS hole by construction.

## Typing

- **`npm run dev` does not typecheck** — Vite strips types without checking them. `vue-tsc --noEmit` is a separate, mandatory gate and must be in the repo's `check_commands`.
- Type the API layer's responses and let inference flow from there rather than annotating every intermediate.

## Anti-patterns (Vue-specific — the structural ones live in `arch-frontend.md`)

1. **`reactive` on something that gets reassigned** — reactivity silently lost.
2. **A missing `.value`** in script — an always-truthy `RefImpl` comparison.
3. **Destructured props** used as though still reactive.
4. **`watch` writing to another ref** where a `computed` was the answer.
5. **`v-if` with `v-for` on one element.**
6. **Index keys on a reorderable list.**
7. **Options API in new code** in a `<script setup>` codebase.
8. **Hand-rolled fetch caching** — either a library or honest local state, not a half cache.
9. **Business logic in the template** instead of a `computed`.
10. **Relying on `npm run dev` as the type gate.**
