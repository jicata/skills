---
name: miro-diagram
description: Produce clean, descriptive technical diagrams on a Miro board via the Miro MCP — hand-placed (not auto-laid-out), research-backed visual doctrine, plus the hard-won layout-DSL gotchas. Use when asked to draw/refresh a system diagram, architecture/pipeline/flow diagram, or to visualize a slice/system on Miro.
---

# Miro Diagram

Build **legible, descriptive** technical diagrams on a Miro board. The default tool path is **hand-placed** (`layout_create`/`layout_update`), **not** the auto-layouter (`diagram_create`) — the auto-layouter produces lopsided branches and dumps edge labels on top of boxes.

**Requires** the Miro MCP server to be connected. Part A (design doctrine) is tool-agnostic and holds for any canvas; Part B is Miro-MCP-specific.

## Invocation
- `/miro-diagram <subject>` — design + place a new diagram for the subject (a system, a slice, a flow).
- `/miro-diagram refresh <frame-url>` — iterate on an existing diagram (re-label, re-colour, add a lane).
- Always confirm the **target board URL** first; never create a new board without asking.

## Process (always in this order)
1. **Source the truth.** Read the code first (the architecture/concept map the profile records, to locate; then the actual handlers, schema, tests). A diagram that isn't grounded in code lies. Delegate deep reads to a subagent; keep only the conclusion.
2. **Research once, if unsure.** For the *design* (not the content), the doctrine below already encodes the best-practice research (C4, Gestalt, visual-hierarchy, flowchart-clutter). Don't re-research per diagram.
3. **Pick the altitude.** One diagram = **one** level of abstraction (C4: Context → Container → Component). State it. Don't mix.
4. **Decide the semantic colour encoding** *before* placing anything (see A2). Colour must *mean* something specific to this system.
5. **Hand-place inside a FRAME** with `layout_create` (see "Mechanics"). Frame = one movable/exportable unit.
6. **Surface + iterate.** Tell the user where it is (`?moveToWidget=<frame-id>`), describe the modelling choices, and offer the next level down.

## Part A — Design doctrine (what "good" looks like)

These are the rules that turn an "ugly" diagram into a clear one. Each maps to a research principle.

1. **One altitude per diagram** (C4). A context view shows systems + the one running input → output; it does **not** show `file:line` mechanism. Descend in a *separate* diagram.
2. **Colour carries the thesis, with a legend.** ≤4 fills, each one meaning. The strongest descriptive choice is **colour = who does the work** (deterministic code · AI model · human-in-the-loop · input/output). Reading the colours should *be* an insight ("the AI is the smallest part"). A legend strip up top is mandatory when colour is encoded.
3. **Size = hierarchy.** The most important node (the "heart") is bigger, heavier border, with a `★` tag. The eye must land there first.
4. **Group with labeled phase bands** (Gestalt proximity). Background bands (`fill #f7f8fa`) with short headers (`① PREPARE`, `② WRITE`, `③ DELIVER`). Input/output sit *outside* the bands as endpoints.
5. **Title card + one-line thesis** on the canvas (purpose + audience). The subtitle is where the punchline lives.
6. **Terse boxes; the legend/lane carries the rest.** Box = bold action line + one short qualifier. **Never put edge captions on a tight vertical spine** — they pile on the boxes and become unreadable (the #1 "crammed" complaint). Plain arrows down the spine; labels only on side-branches that have open space.
7. **Side panels for sub-systems.** A loop or sub-domain (e.g. a human+AI Q&A dialogue) gets its **own bordered panel** with its own mini-flow and a clear title — not inline boxes crammed into the spine. Use a **border-only** container (`fill_opacity=0`) so it groups without hiding anything.
8. **Cross-cutting concerns get a lane, not a wire.** Persistence/eventing that touches many steps = a **store icon** (`type=can`) in a side lane, with **cards parked at the step that performs each operation** (position encodes *who/when*), connected by short dashed arrows. Name the **entity + verb** on each card (`READ PromptTemplate → CREATE Session`), not vague prose. Don't run one long wire through the whole diagram.
9. **No silent dead space / no double-explanation.** One accessible pass per system; if you have a verbose reference and a glanceable card of the same fact, keep the card and cut the prose (or move it to a footnote and say so).

### Anti-patterns (the exact mistakes made & fixed)
- A connector caption stacked on every spine box → text "runs through the diagram". **Fix:** strip spine captions.
- A long single wire from a side node across the full height. **Fix:** reroute to the nearest semantically-correct target; make it dashed (secondary path).
- A dense paragraph list crammed in a narrow lane. **Fix:** break into cards placed at step heights.
- Auto-layouter branch lopsidedness. **Fix:** hand-place.

## Part B — Miro-MCP mechanics & gotchas (hard-won)

Get the DSL spec first: `layout_get_dsl` (board items) — call once, reuse. (`diagram_get_dsl` is for the auto-layouter; avoid.)

1. **Frame first.** `F1 FRAME x.. y.. w.. h.. fill=#ffffff "Title"`; give all children `parent=<frame-url>`. The frame is the unit users move/export.
2. **Coordinates:** child `x/y` is the **centre**, relative to the **frame top-left** (0,0). Plan a grid on paper-coords first.
3. **Border-only containers:** `type=round_rectangle fill_opacity=0 border_style=dashed` — groups visually without covering shapes underneath. Z-order = creation order; create background bands/containers *before* the boxes that sit on them.
4. **Store icon:** `type=can` for a database/session store.
5. **Connectors** re-point by editing `to=`/`from=` on the connector line (connector lines have no `fill_opacity`, so they match cleanly). Use `stroke_style=dashed` for secondary/feedback paths, `start_snap`/`end_snap` to control which side they attach.

### `layout_update` matching — the pitfalls that cost the most time
`layout_update` does find-and-replace against the **current board DSL**, which differs from what `layout_create` echoed. To make `old_string` match:
- **Include `parent=https://…/?moveToWidget=<frame-id>`** for frame children — it sits between the type and `x=`. Omitting it = "not found".
- Miro **auto-adds `fill=#ffffff fill_opacity=0`** to TEXT/SHAPE lines. Match a **prefix that stops before `color=`/`fill=`** (e.g. `…<id> TEXT parent=… x=.. y=.. w=..`) for geometry edits.
- **Content is entity-encoded**: `+`→`&#43;`, `=`→`&#61;`, `&`→`&amp;`. But `·` `–` `—` `①②③` `★` stay **literal**. So when editing text content, **avoid `+`/`=`/`&` in the matched substring** (use commas, "and", entities) or it won't match.
- **Adding items can auto-reflow the frame** (it grows + recentres; every child's `x` shifts, e.g. `430`→`527.504`). After a `layout_create`, **re-read the returned DSL** and use the *new* coordinates for the next position edit.
- **Same-line edits must be sequential**, not parallel (two edits to one line race). Different-line edits can be parallel, but one occasionally loses a race — retry the failure.
- **Deleting** needs an exact full-line match (fragile due to the above). Prefer **repurpose/reposition** over delete. `ai_generation_result` groups (from `diagram_create`) **cannot** be deleted via the API at all — tell the user to select + Delete manually.
6. **Emoji/glyphs that render:** circled numbers `①–⑨`, `★`, `·`, `→`, em/en dashes. Avoid relying on `💾`-style emoji (inconsistent); use a coloured badge + legend instead.

## Worked skeleton (vertical pipeline + bands + side panel + store lane)
```
F1 FRAME x.. y.. w=1200 h.. fill=#ffffff "Title"
# bands first (behind)
band1 SHAPE parent=F1 .. type=round_rectangle fill=#f7f8fa border_color=#e3e6ea ""
legbg SHAPE parent=F1 .. type=round_rectangle fill=#f4f5f7 ""
# header
title TEXT parent=F1 .. size=30 align=center "… in plain language"
subtitle TEXT parent=F1 .. size=15 color=#6b7280 "in → out.  Colour = who does the thinking — the punchline."
# legend swatches (one per actor) + labels …
# input (green) → spine boxes (blue=deterministic, orange=AI), heart box bigger + black border …
# side panel: border-only container + mini-flow + loop connector …
# store lane: can-cylinder + cards parked at step heights + dashed Wn arrows …
# connectors: plain arrows down the spine (NO captions); dashed for side/feedback paths
```

## Where this fits
The **one-shot** half of the visualization pair: you already understand the system, and you want it drawn well. `/flow-map` is the **incremental, conversation-driven** half — it borrows this file's colour/altitude/anti-clutter doctrine and grows a board one confirmed block at a time. Neither teaches; `/teach` does that in prose and HTML.
