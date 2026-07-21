---
name: prototype
description: Build a throwaway prototype to answer a design question. Use when the user wants to sanity-check whether a state model, domain shape, or API surface feels right before committing to real implementation.
---

# Prototype

A prototype is **throwaway code that answers a question** — a tiny interactive console app that lets the user drive a state model by hand. Use it when the question is about **business logic, state transitions, or data shape**: the kind of thing that looks reasonable on paper but only feels wrong once you push it through real cases.

When this is the right shape:

- "I'm not sure this session/state machine handles the edge case where X then Y."
- "Does this data model actually let me represent the case where…"
- "I want to feel out what the interface should look like before writing the real code."
- Anything where the user wants to **press buttons and watch state change**.

## Rules

1. **Throwaway from day one, clearly marked.** Put it under `prototypes/<question-slug>/` at the repo root — its own standalone console program in the repo's language (per the project profile's stack facts), **not** wired into the main build (no CI noise).
2. **One command to run** — put it at the top of the prototype's README.
3. **No persistence by default.** State lives in memory. If the question is specifically about persistence, use the repo's local stand-in (per profile — emulator, container, in-memory DB) with a clearly-named scratch database — never a live environment.
4. **Skip the polish.** No tests, no error handling beyond runnable, no abstractions. The point is to learn fast.
5. **Surface the state.** Re-render the full state after every action.
6. **Capture it when done** — see step 5.

## Process

### 1. State the question

Before writing code, write down what state model and what question you're prototyping — one paragraph at the top of the prototype's README. Use the repo's glossary vocabulary (per profile). A prototype that answers the wrong question is pure waste.

### 2. Isolate the logic in a portable module

Put the actual logic — the bit answering the question — behind a small, pure interface that could be lifted into real code later. The console shell is throwaway; the logic module isn't. Pick the shape that fits the question:

- **A pure reducer** — `(state, action) => state`. Discrete events, single state value.
- **A state machine** — explicit states + transitions. Good when "which actions are even legal right now" is part of the question.
- **A small set of pure functions** over a plain record type. Good when there's no current state, just transformations.
- **A class with a clear method surface** when the logic genuinely owns ongoing internal state.

Keep it pure: no I/O, no console calls inside the logic. The shell calls in; nothing flows the other direction.

### 3. Build the smallest console shell that exposes the state

On every action, clear the screen and re-render the whole frame — one stable view, not scrollback. Each frame: **current state** pretty-printed (one field per line), then **keyboard shortcuts** (`[a] add answer  [t] advance state  [q] quit`). Read one keystroke, dispatch to the logic, re-render, loop until quit. The whole frame fits on one screen.

### 4. Hand it over

Give the user the run command. They drive it; the interesting moments are "wait, that shouldn't be possible" and "huh, I assumed X" — those are bugs in the *idea*, which is the whole point. Add actions as they ask. Prototypes evolve.

### 5. Capture the answer and the prototype

Fold the validated decision into the real work: the verdict + the question it settled go **onto the implementation issue/PRD** in the repo's tracker — the validated state machine/type shape may be inlined there, trimmed to the decision-rich parts. Commit the prototype itself to a throwaway branch, out of the main branch, and leave a pointer to that branch on the issue. The main branch keeps only the validated decision — the `prototypes/` folder does not merge.

## Anti-patterns

- **Don't add tests.** A prototype that needs tests is no longer a prototype.
- **Don't wire it to real infrastructure.** In-memory unless the question is persistence — and then the local stand-in only.
- **Don't generalise.** No "what if we wanted X later." One question per prototype.
- **Don't blur logic and shell.** If the reducer references the console, it's no longer portable.
- **Don't merge the prototype.** The logic module gets *re-created* in the real code via TDD (it's the design that transfers, not the code); the prototype stays on its branch as a primary source.
