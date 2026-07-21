# AFK shared resilience conventions

Single source of truth for the resilience mechanics shared by the autonomous ship flow:

1. **Non-interactive, time-boxed shell** — prevent the wedge at the operation that can hang (§1). This carries the load.
2. **Heartbeat progress log** — an *optional*, passive progress trace (§2). Not a kill trigger.

Hang **detection** is deliberately not an orchestrator mechanism. Coder, Reviewer, and Axis-C all run as **visible** background `Agent` dispatches; the operator watches the live agent display and judges *slow* (forward tool activity) from *stuck* (frozen on one call) directly, nudging if ever needed. There is intentionally **no** `ScheduleWakeup` / timed-re-invocation watchdog — see "Why there is no watchdog" below.

Loaded by the afk-* child skills (`afk-execute-issue`, `afk-address-pr`, `afk-review-pr`, `afk-merge-pr`, `afk-concede-thread`) and by the `/ship-feature` and `/ship-issue` orchestrators. When this file and a skill disagree on a resilience mechanic, **this file wins**.

This is not a registered skill (no `SKILL.md`) — it is a shared reference doc. Skills point to it by relative path `.claude/skills/_afk-shared/resilience.md`.

## Why this exists

A subagent dispatched in the background can wedge *inside a tool call* — a pager waiting for `q`, a credential prompt with no human, a stalled network read, a dev-server boot that never completes. When that happens the child stops making progress but never errors.

The defense is to **prevent the wedge at the layer where it happens** (§1): wrap every external call that could block — `gh`, remote `git`, browser/CI provisioning — in a non-interactive, time-boxed shell so it fails fast instead of hanging. §1 carries essentially the whole load: with pagers disabled, terminal prompts disabled, and a generous per-operation `timeout`, the common wedge cases cannot occur in the first place.

## Why there is no watchdog

An earlier version of this doc defined a §3 "supervised dispatch + progress watchdog": after each background dispatch the orchestrator armed `ScheduleWakeup(240)` and, on each timed re-invocation, read a heartbeat file to decide whether to `TaskStop` the child. **It was removed.** It cost more than it bought:

- It re-fired the orchestrator's own input (the `/ship-*` command) as the wakeup prompt, so a tick mid-run **cold-re-entered the skill from the top** while a subagent was still working — duplicate dispatch and visible command spam.
- Its state (`stall_strikes`, `last_mtime`, …) lived only in conversation context, so it **died silently on context compaction** — exactly during the long runs it was meant to protect.
- It never even covered Axis-C, which ran via `Monitor` (no heartbeat) outside the watchdog entirely — the very case that motivated it.
- A fixed elapsed-time budget is a poor wedge detector: it cannot tell a slow-but-working child from a stuck one, so it eventually kills healthy work.

The replacement is simpler and strictly better for an **attended** flow (the operator is watching the run): **§1 prevents operation-level hangs**, every long-running step (Coder, Reviewer, Axis-C) is a **visible `Agent` dispatch** the operator can cycle to and read live, and the harness's own completion notification advances the state machine. The operator's eyes are a richer slow-vs-stuck detector than any heartbeat line, and they don't evaporate on compaction. A genuinely lost completion notification (rare) is recovered by the operator nudging — not by a self-firing loop.

---

## 1. Non-interactive, time-boxed shell (prevention — carries the load)

Every `gh` command and every **remote** `git` command (`fetch`, `pull`, `push`, `clone`, `ls-remote`, `checkout` of a remote ref) MUST be written non-interactive and time-boxed:

```bash
GH_PAGER=cat GIT_PAGER=cat GIT_TERMINAL_PROMPT=0 timeout <N> <command>
```

- `GH_PAGER=cat` / `GIT_PAGER=cat` — no pager opens to block waiting for `q`. Pager-on-a-TTY is the single most common silent wedge.
- `GIT_TERMINAL_PROMPT=0` — git fails instantly instead of blocking on a username/password prompt no human will answer.
- `timeout <N>` — a hard ceiling on one atomic external call. This is **not** a hang *detector* (it cannot tell slow from stuck); it is a bound on a single I/O call that has no business taking minutes. It runs in the same shell the Bash tool spawned, so it stays alive and fires even when the layers above it are blocked.

`<N>` budgets (seconds):

| Operation class | `<N>` |
|---|---|
| gh metadata / GraphQL / `pr comment` / `pr review` / `issue` calls | `120` |
| `git fetch` / `pull` / `push`, `gh pr checkout`, `git ls-remote` | `180` |
| Local-only git (`status`, `add`, `commit`, `rev-parse`, `branch --list`, working-tree `diff`) | none needed — with the pager disabled these cannot hang |
| Test suites (the profile's `check_commands`) / local rig boot (e.g. `docker compose up`) | **not** wrapped in a short `timeout` — these are legitimately long; let them run and watch them in the agent display. |

On `timeout` exit code `124` (or a non-zero from the guarded call): **retry once**. If it times out / fails a second time, take this skill's documented failure path for that operation (`git_failure` / `push_failure` / `local_diverged` / `rebase_conflict` / `dirty_tree_foreign` as applicable) and add a `[hang-timeout op=<cmd>]` entry via the skill's cleanup-issue helper. Never loop a third time.

Keep the guards **inline** (env on the call) — do **not** mutate `core.pager` / pager config globally. Inline env survives across the fresh shell the Bash tool spawns per call and mutates nothing on the user's machine.

---

## 2. Heartbeat progress log (optional, passive)

**Nothing kills a child based on this log.** It exists only as a human-readable progress trace you can `tail` while watching a run; the state machine never reads it and omitting it has no effect. It is retained because the afk-* children already emit it and it is a cheap debugging aid — not because anything depends on it.

A child *may* append a line at the start of each Step and before any command expected to exceed ~30s:

```bash
echo "$(date +%s) | <phase> | <detail>" >> tmp/afk/heartbeat-<token>.log
```

- `<phase>` — a short label (`setup`, `sync`, `tests:backend`, `address:thread-4`, `push`).
- `<detail>` — free text (the file being read, the command about to run).

Emit **inline** if you emit at all — env exports and shell functions do not persist across the Bash tool's fresh shells. The append is cheap; over-emitting is harmless and under-emitting (or not emitting) costs nothing.
