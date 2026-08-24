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

### Block internal offsets (badged block, container centre `cx,cy`, size `w,h`; `top=cy-h/2`, `left=cx-w/2`)
- **badge** circle: `x=left+48, y=top+46`, d≈52 (main) / 34 (detail), number as content, `fill=actor-border`, white text, `valign=middle align=center`.
- **title** TEXT: `x=cx+20, y=top+40, w=w-140`, `align=left`, size 19 (main) / 14 (detail).
- **body** TEXT: `x=cx, y=top+98 (main) / top+64 (detail), w=w-80`, `align=left`, grey, size 14 (main) / 11 (detail).

Main frame ≈ `w1500 h1720`, blocks `w460–680 h160–230`.

## Two altitudes — stages and drill-ins
- **Top-level stage map = a FRAME.** It's the portable/exportable unit; children move/export together.
- **A substep detail = a SMALLER FRAME (~⅓ the parent's footprint, e.g. `w620 h700`), same grammar**, one C4 altitude deeper. Badges become sub-numbers (`1a/1b/1c`). **Size is the hierarchy signal** — a small frame reads as subordinate. Reuse the SAME colour key (often only green+blue appear, which itself says "this stage is pure deterministic code").
- **Link, don't nest.** Miro frames can't nest and connectors can't attach to a frame — so draw a **dashed connector from the parent block to the detail panel's input block**, captioned `"detail of ①"`. That's the visible drill-in trail.
- Frames vs loose containers: keep substeps as **small frames** (parts stay glued as one movable unit). Only drop to a plain container if the user wants it visually *nested* — at the cost of the boxes becoming individually loose.

## Miro-MCP mechanics & the hard-won gotchas
Get the DSL spec once with `layout_get_dsl`, reuse it. Frames first, then children (`parent=<frame alias|url>`), then connectors. Child `x/y` = **centre**, relative to frame **top-left** (0,0); centre must stay within `[0,w]×[0,h]` or the whole batch fails.

**These cost real time — bake them in:**
1. **`layout_update` must target the FRAME url** (`?moveToWidget=<frameId>`), not the board URL — a board-scope update **can't see frame children** ("old_string not found").
2. **Text swaps: match the content substring only** (the unique sentence), not the whole line. **Avoid `+` `=` `&` in the matched text** — they're entity-encoded in the stored DSL (`&#43; &#61; &amp;`); `· – — → ① ★` stay literal and match fine.
3. **For geometry edits and deletes, `layout_read` the frame first and copy the EXACT line.** The read format differs from the create/update *echo*: reads render `fill_opacity=0.0`, `border_width=2.0`, `1.0`; echoes render `0`, `2`, `1`. Match the **read** format or it won't find it. Deleting needs a full-line match.
4. **NEVER delete a frame to remove a diagram** — Miro **orphans** the children (they float at board-absolute positions), it does not cascade. To remove: delete the children first, then the frame — or don't wrap throwaway detail in a frame.
5. **Adding items via `layout_create`: target the frame URL** (`?moveToWidget=<frameId>`) so the frame is the default parent; a board-URL create with `parent=<frameURL>` can mis-place items at board origin. Single-item reads render children *without* `parent=` and mislead — **trust a frame-scope read**, not a single-item read, to judge parentage.
6. **Connectors** can't attach to frames; attach to items (a block, or the detail panel's input). Use `stroke_style=dashed` + a caption for drill-in / secondary links; plain arrows for the spine.
7. **Glyphs that render:** `①②③④ ⑤…`, `★`, `·`, `→`, `—`, `–`. Avoid emoji (inconsistent). Use a coloured circle badge, not an emoji.
8. **Frame auto-reflow:** adding items can shift the frame's board position and every child's echoed `x`; re-read before the next position edit.

## Process
1. **Confirm the board** (reuse the existing board; place far-right). Read the DSL spec once.
2. **Source the truth** — read the real code for the current step before drawing it (delegate deep reads to a subagent; keep the conclusion).
3. **Pick the altitude** — one per frame. Stage map = the flow; detail panel = one stage's sub-steps.
4. **Place / extend** with `layout_create` inside the frame, following the grammar + offset scheme.
5. **Surface + iterate** — give the `?moveToWidget=<frameId>` link, describe the modelling choice, offer the next step or a drill-in. Keep it a dialogue.
6. **Keep synced** — if the map reveals a genuine decision gap, propose an ADR at whatever gate the repo's ADR convention defines (the profile records where the canon docs live); behaviour gaps become tests, not docs.

## Where this fits
Companion to `/miro-diagram` (one-shot, fully-designed board diagram — borrow its design doctrine for colour/altitude/anti-clutter) and to `/teach` (resource-grounded, prose-and-HTML learning). flow-map is the **conversational, incremental, drill-in** presentation layer for a system you can read the source of: reason → confirm against code → block lands → optionally explode.
