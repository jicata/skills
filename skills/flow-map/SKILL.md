---
name: flow-map
description: Build and grow a living "flow discovery map" on Miro — a colour-coded, big-block diagram of a runtime flow, grown incrementally through reason↔confirm↔block-lands dialogue, where each stage can explode into a smaller detail panel one altitude deeper. Companion to /miro-diagram (one-shot diagrams). Use when the user wants to visually map a request/flow step-by-step as they reason about it, or to drill a stage into its sub-steps. Every block is grounded in real code, never invented.
---

# Flow Map

Turn a walked-through runtime flow into a **legible, colour-coded Miro diagram that grows as you reason**. Distinct from `/miro-diagram` (a one-shot, fully-designed diagram): flow-map is the **incremental, conversation-driven** variant — the human reasons about a step, you reason back and correct/confirm against the real code, and the agreed version **lands as a block**. A visual trail of the conversation. Each stage can later **drill in** to its own smaller detail panel.

**Requires** the Miro MCP server to be connected.

## Invocation
- `/flow-map <subject>` — start (or continue) the map for a flow (an endpoint, a request lifecycle, a pipeline).
- `/flow-map detail <step>` — explode one stage into a smaller detail panel one altitude deeper.
- Always confirm the **target board URL** first; never create a new board without asking. Place new frames **off to the side** (far right, e.g. board x ≥ 8000) — these boards are usually busy shared boards.

## The loop (how the map grows)
1. **Human reasons** about a step ("the user posts to X, which does A, B, C…").
2. **You reason back, grounded in code** — read the real handler/method, confirm what's right, correct what's wrong. This is the single most valuable move in the skill: the correction is where the human's model actually updates (e.g. "eligibility is *rules*, not the model call").
3. **The agreed version lands as a block.** Extend the spine downward; never invent.
4. Repeat. Offer the next step and/or a drill-in.

**Ground every block in real code.** Read the actual handler/store/util before drawing it. A block that isn't in the code lies — and on a recovery map, a plausible-but-wrong block is worse than a gap, because it gets believed. Sub-steps in a detail panel are the real function's real steps, not a guess.

## Visual grammar (the thesis: **colour = who does the work**)
One meaning per colour, legend mandatory. Reading the colours should *be* an insight ("the AI is one box; the rest is deterministic").

| Actor | Fill | Border / badge | Meaning |
|---|---|---|---|
| Input / Output | `#e3f3ea` | `#147a45` | request in, response out, data endpoints |
| Deterministic code | `#e6ecfb` | `#1f57c3` | plain code — the default |
| AI model (LLM) | `#fbedd8` | `#b5620a` | a model call — usually the smallest part |
| Persistence | `#dff1ef` | `#0e857a` | a store read/write |
| Phase band (grouping) | `#f7f8fa` bg, `#e3e6ea` border | badge `#64748b` | groups sibling blocks (e.g. "ASSESS") |

Text: title `#191c22`, body grey `#5b6472`, subtitle/caption grey `#6b7280`. Legend bg `#f4f5f7`. Drill-in dashed connector stroke `#8a92a0`.

**Block anatomy** (badged step block): a container rectangle + a **solid-colour circle badge** holding a big number (this is the legible, scannable layer AND the colour key) + a **title** (dark, larger) + a **prose body** (grey, a real sentence — not terse `X → Y`; the arrow style is for legends only). Endpoints (input/output) are plain shapes, no badge. The ★ entry / "heart" gets a heavier border.

**Layout:** vertical spine, `input → entry(★) → ① → ② → … → output`. Siblings that run off the same value (e.g. two assessments off one payload) go inside a **phase band** with a branch. Terse boxes; **no connector captions on the tight spine** (they pile up unreadably) — plain arrows down the spine, captions only on side/drill-in links.

### Block internal offsets (badged block at frame-relative top-left `left,top`, size `w,h`)
- **container** `<rect x=left y=top width=w height=h rx="12">`, actor fill + actor border.
- **badge** `<circle cx=left+48 cy=top+46 r=26>` (main) / `r=17` (detail), the number as `data-content`, `fill`=actor border, `data-text-color="#ffffff"`.
- **title** `<textArea x=left+90 y=top+24 width=w-140>`, left-aligned, size 19 (main) / 14 (detail), dark.
- **body** `<textArea x=left+40 y=top+76 (main) / top+52 (detail) width=w-80>`, left-aligned, grey, size 14 (main) / 11 (detail). A `textArea` grows downward; when the result reports a grown body, grow the container to match.

Main frame ≈ `w1500 h1720`, blocks `w460–680 h160–230`.

## Two altitudes — stages and drill-ins
- **Top-level stage map = a FRAME.** It's the portable/exportable unit; children move/export together.
- **A substep detail = a SMALLER FRAME (~⅓ the parent's footprint, e.g. `w620 h700`), same grammar**, one C4 altitude deeper. Badges become sub-numbers (`1a/1b/1c`). **Size is the hierarchy signal** — a small frame reads as subordinate. Reuse the SAME colour key (often only green+blue appear, which itself says "this stage is pure deterministic code").
- **Link, don't nest.** Miro frames can't nest and connectors can't attach to a frame — so draw a **dashed connector from the parent block to the detail panel's input block**, captioned `"detail of ①"`. That's the visible drill-in trail.
- Frames vs loose containers: keep substeps as **small frames** (parts stay glued as one movable unit). Only drop to a plain container if the user wants it visually *nested* — at the cost of the boxes becoming individually loose.

## Miro-MCP mechanics & the hard-won gotchas
The board tools are `canvas_*` and `board_*`; the old `layout_*` DSL tools are deprecated and no longer exposed. `/miro-diagram` Part B carries the full mechanics — read it once. The ones this skill leans on hardest:

1. **Load `canvas_get_canvas_composer_skill` once per session** before the first draw (no step → it routes you to `design` / `edit`, then `dsl`). Reuse its instructions; don't re-fetch. This skill's grammar (the colour key, dashed drill-in links) is the explicit requirement and beats the composer's default house style.
2. **Text first, then one draw.** The loop's agreement happens in chat; the board only receives what was agreed. API edits cost **4–5× the first draw** and the free plan allows **100 calls/day**, so a map redrawn per thought exhausts the quota mid-session. Land agreed blocks in batches when the dialogue allows.
3. **One `canvas_create_from_svg` call per frame, at its first draw** — the stage map once, each detail panel once. A frame is `<g data-frame="…" transform="translate(X,Y)">` with a first child `<rect data-type="frame" x="0" y="0" …/>`; children are relative to its top-left.
4. **Save every `result_svg`** where the next session can find it (one file per frame; the user picks the place). Growing the spine is then a `canvas_update_from_svg` that adds new elements (no `data-miro-id`) and patches moved ones by `data-miro-id` — never transcribed ids, never a from-scratch regeneration.
5. **Drill-in links across frames:** a connector attaches to items, **never to a frame**, so it runs from the parent block to the detail panel's input block (`stroke-dasharray="5,5"`, `data-content="detail of ①"`). It references the parent block, which already exists on the board — reference it the way the composer's `dsl`/`edit` instructions say an existing widget is referenced, using the `data-miro-id` from the saved `result_svg`. If the composer cannot express the link, put `detail of ①` in the detail frame's title and tell the user.
6. **NEVER delete a frame to remove a diagram** — Miro **orphans** the children (they float at board-absolute positions), it does not cascade. Delete the children first (`data-deleted="true"` stubs, after the user confirms the list), or have the user delete the frame in the UI.
7. **Frames move between sessions.** Before a position edit, re-read (`canvas_search` for the frame title, then one `canvas_read_as_svg` with the frame's id); never trust cached coordinates. Fix every size change a result reports before calling the block landed.
8. **Glyphs that render:** `①②③④ ⑤…`, `★`, `·`, `→`, `—`, `–`. Avoid emoji (inconsistent). Escape `&` `<` `>` in every label — one raw `&` fails the whole call.

## Process
1. **Confirm the board** (reuse the existing board; place far-right). Load the composer skill once.
2. **Source the truth** — read the real code for the current step before drawing it (delegate deep reads to a subagent; keep the conclusion).
3. **Pick the altitude** — one per frame. Stage map = the flow; detail panel = one stage's sub-steps.
4. **Place / extend** — only what the loop agreed: the first block of a frame is its `canvas_create_from_svg`; later blocks are one batched `canvas_update_from_svg` from the saved `result_svg`, following the grammar + offset scheme.
5. **Surface + iterate** — give the `?moveToWidget=<frameId>` link, describe the modelling choice, offer the next step or a drill-in. Keep it a dialogue.
6. **Keep synced** — if the map reveals a genuine decision gap, propose an ADR at whatever gate the repo's ADR convention defines (the profile records where the canon docs live); behaviour gaps become tests, not docs.

## Where this fits
Companion to `/miro-diagram` (one-shot, fully-designed board diagram — borrow its design doctrine for colour/altitude/anti-clutter) and to `/teach` (resource-grounded, prose-and-HTML learning). flow-map is the **conversational, incremental, drill-in** presentation layer for a system you can read the source of: reason → confirm against code → block lands → optionally explode.
