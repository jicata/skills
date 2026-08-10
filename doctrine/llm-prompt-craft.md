# LLM Prompt Craft & Visibility

**Priority:** High
**Instruction:** You MUST follow these guidelines whenever you create or change any text that will be sent to a language model.

(Extracted 2026-08 from the donor stack's `llm-prompt-craft.md`; the incident and worked example below are the donor's, kept concrete because they teach the rule better than an abstraction does. Repo-specifics — which models the app calls, where prompt builders live, which tests assert on rendered prompts — live in the repo's `.claude/doctrine/project-profile.md` overlay. Installed when the setup interview answers yes to "does this app construct prompts or call models?")

## Identity

You write prompts the way this project writes its doctrine: **plain, example-driven, self-contained, jargon-free.** A prompt is a user-facing artifact even when it lives inside source code — it is the actual instruction a model executes, and it must be as legible and as carefully authored as any doctrine file.

This governs **any text bound for a model**: prompt builders, inline prompt strings, system prompts, structured-output instructions, and the prompt text of subagents and orchestration scripts. It is model-agnostic. When the target is a Claude model, also consult the `claude-api` skill for model ids and capabilities.

## Why this exists (the concrete failure it prevents)

> **Donor scar.** A recall-sweep stage shipped with a prompt opening *"You are performing a recall check on the fills from a recipe rendering step... a first-pass renderer that may have missed..."* — pipeline lore meaningless to a model with zero context, two absolutist precision rules that drowned the one permission that mattered, and **zero worked examples**. The result: a discounted product rendered as a plain text bullet in one output while grounding correctly in its batch-sibling. The defect survived because the prompt was **never seen as text** — it lived as string-builder append chains, the PR diff showed plumbing rather than the message, and it was never held to the house writing standard.

Two gaps caused it: **invisibility** (Part A) and **poor craft** (Part B). This doctrine closes both.

---

## Part A: The visibility gate (non-negotiable)

**Whenever you create or change a prompt, render the final prompt as plain text and surface it to the user at implementation time — every change, no size threshold.**

1. **Render, don't describe.** Reconstruct the prompt exactly as the model receives it — placeholders filled with one realistic example — and put it in a plaintext block in chat. Never report a prompt change as "I updated the prompt builder" with the message itself hidden inside append calls.
2. **Every change.** A one-word tweak to a rule line still changes model behaviour. For a small edit, render the changed region in full surrounding context; for a new prompt or a material rewrite, render the whole thing.
3. **Before/after on edits.** Show both, so the delta in *instruction* — not just code — is reviewable.
4. **The diff must carry the message, not just the plumbing.** Author prompts so a reviewer reading the PR sees the words. Assert on rendered prompt content in tests; a prompt change with no test-visible string change is a smell.
5. **Reviewers enforce this too.** In the review skills, a changed prompt builder whose rendered text was not surfaced is a **blocking** finding — request the rendered prompt before approving.

The point: the user must be able to read and veto the actual words a model is given, the same way they can read any rule. Prompts are not implementation detail.

---

## Part B: Prompt craft doctrine

### B1. Self-contained — assume zero system context
The reader is a model that knows nothing about your pipeline, stages, slices, or internal nouns. Strip all lore. Field names are a separate **contract** layer (keep them); the *instructions* must stand alone.
- ✅ "You are an expert at matching cooking-recipe ingredients to supermarket products."
- ❌ "You are performing a recall check on the fills from a recipe rendering step."

### B2. Plain language over jargon
If a term needs project knowledge to parse, replace it with a plain description.
- ✅ "Ignore brand names inside product names."
- ❌ "Apply anchor-greediness to tier-2 grounded fills."

### B3. Show, don't just tell — positive AND negative examples
Models follow examples more reliably than assertions. Every non-trivial rule gets at least one worked example; for judgment calls give **both** a positive (this IS a match) and a negative (this is NOT), so the boundary is concrete. A rule asserted with no example is exactly what failed in the donor incident.

### B4. Mind rule priority and disposition
Order rules so the behaviour you actually want isn't buried under guardrails. Absolutist caution ("when in doubt, return nothing") suppresses recall — if you want the model to find matches, say so positively and reserve the brake for genuine ambiguity. **State the disposition explicitly.**
- ✅ "Match every ingredient you can. Only skip when you are genuinely unsure two things are the same."
- ❌ Two loud prohibitions followed by one quiet permission the model never reaches.

### B5. Separate the I/O contract from the teaching prose
Field names, output schema, and the data table are the **contract** the parser depends on — keep them stable and explicit, and don't rename them as a "prompt change" (that is a code change touching the deserializer). The surrounding prose is the **teaching** — that is what you rewrite for clarity.

### B6. Prompt nudges over engines
Reach for a prompt change before a deterministic engine, config knob, or new code path. Use code only for what a prompt physically cannot do. (Donor: a deterministic fuzzy matcher was deliberately rejected precisely to keep the model as the precision judge.)

### B7. Treat the prompt as testable text
Prompts are best-effort and non-deterministic; a model-based safety net improves a metric, it does not guarantee it. Assert the *presence* of key rules and examples in the rendered prompt (cheap, stable), log hit-rates for behaviour you can't unit-test, and prefer fix-forward tuning with a feedback signal over assuming perfection.

---

## Part C: Worked example — the donor's sweep prompt, before → after

### ❌ BAD (as shipped)
```
You are performing a recall check on the fills from a recipe rendering step.
The fills below were produced by a first-pass renderer that may have missed
matching some ingredients to discounted basket products.

Rules:
1. ANTI-SUBSTITUTION (highest priority): Never promote a fill to a product that is
   not exactly what the fill describes. ... When in doubt, return nothing.
2. PRECISION OVER RECALL: If there is any ambiguity ... skip it.
3. A fill phrased as alternatives ("X или Y") can be promoted if ONE matches.
```
Faults: system lore (B1), jargon "fill / renderer / promote" (B2), **no examples at all** (B3), two prohibitions burying the one permission (B4).

### ✅ GOOD (after)
```
You are an expert at matching cooking-recipe ingredients to supermarket products.
You are given a numbered list of recipe ingredients and a list of discounted
products on offer (with their product ids). For each ingredient genuinely available
in the product list, return the matching product id. Many will have no match — skip those.

How to decide a match:
1. Anti-substitution (most important): match only when the product really IS that
   ingredient — minced meat (кайма) is not a burger patty; кашкавал is not сирене.
2. Ignore words about how an ingredient is used ("за пържене", "ситно нарязан").
3. Ignore brand names in product names — "Олио EXTRA LINE слънчогледово" is sunflower oil.
4. Alternatives ("X или Y"): match when the product is any ONE alternative. Narrowing
   "sunflower or vegetable oil" to a specific sunflower oil is a correct match.

Read each ingredient carefully — some good matches are easy to overlook. But if you
are genuinely unsure two things are the same ingredient, leave it out.

Worked examples:
- "слънчогледово или растително олио за пържене" + "Олио EXTRA LINE слънчогледово" → match.
- "200 г кайма" + "Кюфте бургер, мляно месо" → no match (a patty is not minced meat).
```
Self-contained (B1), plain (B2), positive + negative examples (B3), recall-positive disposition with the brake reserved for real ambiguity (B4), contract tokens and schema preserved separately (B5).

---

## 🚫 Anti-patterns (flag in review, fix on sight)

1. **Buried prompt** — a prompt change landed as plumbing without the rendered text being surfaced (Part A violation).
2. **System lore in the prompt** — internal stage/slice/pipeline nouns the model cannot know.
3. **Assertion without example** — a judgment rule with no worked example; especially a permission with no demonstration.
4. **Only negative or only positive examples** — boundary cases need both.
5. **Guardrail drowning intent** — absolutist "when in doubt, skip" placed above the behaviour you actually want, with no disposition statement.
6. **Renaming a contract token as a "prompt tweak"** — changing a field name the parser reads without the matching code and test change.
7. **Engine where a nudge would do** — a new deterministic code path for something a prompt example could fix (B6).
8. **Untestable prompt change** — a behaviour change with no rendered-text assertion or logged signal.

---

## 🔗 When to load this

Load whenever a task **creates or changes any model-bound text**: a prompt builder, an inline prompt string, a structured-output instruction, an orchestration script's agent prompt, or a subagent prompt. The repo's doctrine index and the file-routing tables in the review skills should route to it on those paths.
