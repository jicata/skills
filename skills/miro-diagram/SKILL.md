---
name: miro-diagram
description: Produce clean, descriptive technical diagrams on a Miro board via the Miro MCP — hand-placed as Canvas Composer SVG (not auto-laid-out), research-backed visual doctrine, plus the hard-won canvas gotchas. Use when asked to draw/refresh a system diagram, architecture/pipeline/flow diagram, or to visualize a slice/system on Miro.
---

# Miro Diagram

Build **legible, descriptive** technical diagrams on a Miro board. The tool path is **hand-placed**: you author every box's position as Canvas Composer SVG and send it with `canvas_create_from_svg` — **not** an auto-layouter (a Mermaid `data-type="diagram"` block, or the legacy `diagram_*` tools), which produces lopsided branches and dumps edge labels on top of boxes.

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
5. **Agree the layout in text.** Before any call, lay out the frame in prose — altitude, bands, spine order, colour per box, side panels — and get the user's yes. Every edit after the first draw costs several API calls (Part B), so the cheap place to change your mind is here.
6. **Hand-place inside a FRAME** with one `canvas_create_from_svg` call (see Part B). Frame = one movable/exportable unit.
7. **Surface + iterate.** Tell the user where it is (`?moveToWidget=<frame-id>`), describe the modelling choices, and offer the next level down.

## Part A — Design doctrine (what "good" looks like)

These are the rules that turn an "ugly" diagram into a clear one. Each maps to a research principle.

1. **One altitude per diagram** (C4). A context view shows systems + the one running input → output; it does **not** show `file:line` mechanism. Descend in a *separate* diagram.
2. **Colour carries the thesis, with a legend.** ≤4 fills, each one meaning. The strongest descriptive choice is **colour = who does the work** (deterministic code · AI model · human-in-the-loop · input/output). Reading the colours should *be* an insight ("the AI is the smallest part"). A legend strip up top is mandatory when colour is encoded.
3. **Size = hierarchy.** The most important node (the "heart") is bigger, heavier border, with a `★` tag. The eye must land there first.
4. **Group with labeled phase bands** (Gestalt proximity). Background bands (`fill #f7f8fa`) with short headers (`① PREPARE`, `② WRITE`, `③ DELIVER`). Input/output sit *outside* the bands as endpoints.
5. **Title card + one-line thesis** on the canvas (purpose + audience). The subtitle is where the punchline lives.
6. **Terse boxes; the legend/lane carries the rest.** Box = bold action line + one short qualifier. **Never put edge captions on a tight vertical spine** — they pile on the boxes and become unreadable (the #1 "crammed" complaint). Plain arrows down the spine; labels only on side-branches that have open space.
7. **Side panels for sub-systems.** A loop or sub-domain (e.g. a human+AI Q&A dialogue) gets its **own bordered panel** with its own mini-flow and a clear title — not inline boxes crammed into the spine. Use a **border-only** container (transparent fill, dashed stroke) so it groups without hiding anything.
8. **Cross-cutting concerns get a lane, not a wire.** Persistence/eventing that touches many steps = a **store icon** (`data-shape="can"`) in a side lane, with **cards parked at the step that performs each operation** (position encodes *who/when*), connected by short dashed arrows. Name the **entity + verb** on each card (`READ PromptTemplate → CREATE Session`), not vague prose. Don't run one long wire through the whole diagram.
9. **No silent dead space / no double-explanation.** One accessible pass per system; if you have a verbose reference and a glanceable card of the same fact, keep the card and cut the prose (or move it to a footnote and say so).

### Anti-patterns (the exact mistakes made & fixed)
- A connector caption stacked on every spine box → text "runs through the diagram". **Fix:** strip spine captions.
- A long single wire from a side node across the full height. **Fix:** reroute to the nearest semantically-correct target; make it dashed (secondary path).
- A dense paragraph list crammed in a narrow lane. **Fix:** break into cards placed at step heights.
- Auto-layouter branch lopsidedness. **Fix:** hand-place.

## Part B — Miro-MCP mechanics & gotchas (hard-won)

The board tools are `canvas_*` (author, read, search) and `board_*` (find, create, share boards). The old `layout_*` DSL tools (`layout_get_dsl`, `layout_create`, `layout_update`, `layout_read`) are deprecated and no longer exposed; never plan around them.

1. **Load the composer skill first, once per session.** Call `canvas_get_canvas_composer_skill` with no step: it routes you to `design` (new composition) or `edit` (existing widgets), then to `dsl` for the SVG grammar. Reuse each returned step's instructions for the rest of the conversation; don't re-fetch. Its house style (palette, type ramp, "no dashed borders") is a default for boards nobody specified. Part A and the user's ask are the explicit requirements, and they win where the two disagree. Say so in your design notes.
2. **One `canvas_create_from_svg` call per frame.** The whole frame — frame, bands, legend, boxes, connectors — goes in one SVG document. A frame is `<g id="f1" data-frame="Title" transform="translate(X,Y)">` whose first child is `<rect data-type="frame" x="0" y="0" width=".." height=".." fill="#ffffff"/>`. Point `miro_url` at the board; place the frame far from existing content (e.g. board x ≥ 8000 on a busy shared board).
3. **Coordinates:** inside a frame everything is **relative to the frame's top-left**. `<rect>` and `<textArea>` x/y are **top-left**; `<circle>` cx/cy is the **centre**; `<text>` y is the **baseline**. Plan the grid in frame coordinates first.
4. **Z-order = document order.** Bands and border-only containers first, then connectors, then the boxes that sit on them, so boxes cover the line ends.
5. **Labels:** a box's own text goes in its `data-content` (`<b>`, `<br>` allowed), never a `<text>` laid on top. Use `<textArea>` for multi-line copy (width wraps, height grows). **Escape `&` `<` `>`** in every attribute and body; one raw `&` fails the whole request and nothing is created.
6. **Store icon:** `data-shape="can"` on a shape.
7. **Connectors** are `<line data-start="<id>" data-end="<id>" data-arrow="end"/>` between local `id`s. They attach to widgets, **never to frames**. `stroke-dasharray="5,5"` for secondary/feedback paths, `data-content` for a caption (side branches only), `data-start-side`/`data-end-side` to pin the attachment side.
8. **Save the returned `result_svg`.** It carries the server-assigned `data-miro-id` of every widget, and it is the only cheap handle for later edits. Write it to a file the next session can find (the user picks the place; gitignored is fine). Without it, the next edit first pays for a `canvas_search` + `canvas_read_as_svg` to recover the ids.
9. **Fix reported size changes before you report done.** Some widgets grow (text wraps, `textArea` heights). The result names the ids whose dimensions changed; reposition the affected neighbours with `canvas_update_from_svg` until nothing overlaps.

### Editing an existing diagram — expensive, so rare
Measured on Miro: editing through the API costs **4–5× the first draw** in calls, and the free plan caps at **100 calls/day**. Agree the change in text first, then make it one batched update.
- **Patch by id.** Start from the latest saved `result_svg`, change only what moves, and send it to `canvas_update_from_svg`. On an element carrying `data-miro-id` an omitted attribute keeps its board value, so a colour-only change is a stub. Never author, guess or transcribe a `data-miro-id` — reuse ones a result or read returned. Connectors must be restated in full.
- **Adding** = an element with no `data-miro-id`. **Removing an element from the SVG deletes nothing** (updates are additive).
- **Deleting** = a stub with `data-miro-id` + `data-deleted="true"`. Destructive and not undoable: confirm the exact items with the user first. Prefer repurpose/reposition over delete.
- **Lost the `result_svg`?** `canvas_search` (`areas`/`matches` on the frame title) to find it, then **one** `canvas_read_as_svg` with the frame's id in `widget_ids` (a frame pulls in its children). Never brute-force reads.
- **Frames move between sessions** (someone drags them). Re-read before a position edit; never trust cached coordinates. Grow a frame *before* moving a child past its old bounds.
- **Never delete a frame through the API** to remove a diagram — Miro orphans its children at board-absolute positions rather than cascading. Delete the children first, or have the user delete the frame in the UI.
- **Glyphs that render:** circled numbers `①–⑨`, `★`, `·`, `→`, em/en dashes. Avoid emoji (inconsistent); use a coloured badge + legend instead.

## Worked skeleton (vertical pipeline + bands + side panel + store lane)
```xml
<svg xmlns="http://www.w3.org/2000/svg">
<g id="f1" data-frame="Title" transform="translate(8000,0)">
  <rect data-type="frame" x="0" y="0" width="1200" height="1600" fill="#ffffff"/>
  <!-- bands + legend background first (behind) -->
  <rect id="band1" x=".." y=".." width=".." height=".." rx="12" fill="#f7f8fa" stroke="#e3e6ea"/>
  <rect id="legbg" x=".." y=".." width=".." height=".." rx="12" fill="#f4f5f7" stroke="none"/>
  <!-- header -->
  <text x="600" y="70" text-anchor="middle" font-size="30" font-weight="bold" fill="#191c22">… in plain language</text>
  <text x="600" y="110" text-anchor="middle" font-size="15" fill="#6b7280">in → out. Colour = who does the thinking: the punchline.</text>
  <!-- legend swatches (one per actor) + labels … -->
  <!-- spine connectors BEFORE the boxes: plain arrows, NO captions -->
  <line x1=".." y1=".." x2=".." y2=".." stroke="#313131" stroke-width="2" data-arrow="end" data-start="in" data-end="s1"/>
  <!-- input (green) → spine boxes (blue = deterministic, orange = AI); the heart bigger, heavier border, ★ -->
  <rect id="in" x=".." y=".." width=".." height=".." rx="12" fill="#e3f3ea" stroke="#147a45" data-content="&lt;b&gt;Request in&lt;/b&gt;"/>
  <rect id="s1" x=".." y=".." width=".." height=".." rx="12" fill="#e6ecfb" stroke="#1f57c3" data-content="&lt;b&gt;Validate&lt;/b&gt;&lt;br&gt;rules, not the model"/>
  <!-- side panel: border-only container + mini-flow + dashed loop connector … -->
  <!-- store lane: can-cylinder + cards parked at step heights + dashed arrows … -->
</g>
</svg>
```

## Where this fits
The **one-shot** half of the visualization pair: you already understand the system, and you want it drawn well. `/flow-map` is the **incremental, conversation-driven** half — it borrows this file's colour/altitude/anti-clutter doctrine and grows a board one confirmed block at a time. Neither teaches; `/teach` does that in prose and HTML.
