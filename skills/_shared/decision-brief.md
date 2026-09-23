# Shared: The decision brief

Included by `/log-issue`, `/expand-issue`, and [`report-interrogation.md`](report-interrogation.md). Defines how a genuine fork is put to the human: **in prose, as a full brief** — never an option picker, never a one-line "A or B?".

## Why a brief, not a question

The human decides from what you write, without the homework you did. A picker compresses the decision into a few five-word labels — the *output* of thinking the reader has not been shown. It hides what the choice is between, why it is a choice at all, and what each branch costs. A reader who has to ask what a term means before answering was handed a question, not a decision.

## The five parts, in this order

1. **What is being decided, and why it came up now** — the code, doc, contract, or consumer fact that forced the fork, cited (`file:line`, spec line, issue number).
2. **The mechanism in play** — how the thing works today, in the system's own terms, enough that a reader who has not opened the files can follow the branches.
3. **Each branch, concretely** — what it means in code, data, or wire terms; a worked example with real values where one exists; what it costs (latency, a migration, another repo's change, a reversed earlier decision); what it forecloses later; which sibling work it touches.
4. **Your recommendation, its reasoning, and what would change your mind.**
5. **The question** — one sentence. Then stop and wait.

## Length follows stakes

A one-way door — a schema migration, a wire-contract field, a reversal of a recorded decision — takes several paragraphs. A trivial fork takes no question at all: pick the obvious default, say so in one line, move on. The bar for interrupting the human does not drop because the brief is thorough; it only governs the shape once a question is warranted.

Concision rules govern reports, not decisions: a brief that explains the fork properly is not verbosity.

One decision at a time. Resolve each before opening the next — a second fork opened before the first closes gets answered with half the reader's attention.

## Completion criterion

The reader could explain each branch back to you without asking what a term means, and has answered the one question.
