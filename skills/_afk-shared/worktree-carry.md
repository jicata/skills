# Worktree carry — bring gitignored local config into a fresh worktree

**Applies only when the profile sets `worktree_carry`.** Absent or `none`, skip this file entirely — a fresh worktree gets tracked content only, which is git's default.

`git worktree add` checks out **tracked content only**. Gitignored files the app or its tooling reads at a fixed relative path — an API key for a sync tool, cloud credentials, `.env`, a local settings overlay — are silently absent in the new worktree. The run then fails in a way that looks like a code or permissions problem, once per missing file, for every worktree the pipeline creates.

> **Donor scar (ADF, 2026-07):** two children of one PRD each logged a cleanup entry for a failed wire-contract publish. The code was fine; the gitignored publish key simply was not in either worktree.

Not a registered skill (no `SKILL.md`). Referenced by relative path `.claude/skills/_afk-shared/worktree-carry.md`. Called by every skill that runs `git worktree add` for a pipeline run — `ship-issue`, `ship-feature` (the base worktree and every parallel slot), `execute-issue` — immediately after that call, once per **newly created** worktree, before any agent reads from it. A reused worktree needs nothing new; the step is idempotent regardless.

## The two modes

| `worktree_carry` | What is carried |
|---|---|
| `none` (default) | Nothing. |
| `ignored` | Every gitignored file present in the primary checkout, minus the exclude list below. |
| `[<path>, …]` | Exactly those repo-relative paths (files or directories), if present. |

**Prefer `ignored` where local secrets keep appearing.** An allowlist is open-ended: it must grow every time someone adds a local credential, and it fails silently until someone does. `ignored` enumerates what is ignored-and-present via git's own logic and vetoes only the closed set of bulky, generated categories — a new secret is carried the moment it exists on disk. Choose the explicit list when the repo's ignored set is dominated by large local state that the exclude list cannot describe cheaply.

## The mechanism

1. **Enumerate.** `ignored` mode: `git -C <primary> clean -ndX` — git's own report of every ignored-and-present path (`-n` dry run, never deletes; `-d` whole directories; `-X` ignored only). No hand-parsing of `.gitignore`. List mode: the profile's paths.
2. **Filter** (`ignored` mode only). Drop every candidate matching a built-in exclude pattern or one of the profile's `worktree_carry_exclude` patterns — each checked as an exact match, a path prefix, a path suffix, or a glob.
3. **Size-cap.** Skip anything over **10 MB** (file size, or total size of a directory) with a one-line note — never silently included, never silently dropped. The size check itself runs under a 5-second timeout; a timeout counts as "too big". `git clean -d` reports a directory with no tracked content as one collapsed entry, so a stray local virtualenv arrives as a single line — the cap is what keeps it out.
4. **Hardlink, file by file.** Recreate each file at the same relative path in the target with a **hardlink**; mirror a directory as real subdirectories plus per-file hardlinks. Hardlinks need no elevated rights (unlike Windows symlinks) and share bytes with the primary, so content cannot drift.
5. **Idempotent.** A path already present in the target is left alone.

**Never link a directory as a junction or symlink.** A junction points back at the primary's directory; a later teardown that `rm -rf`s the worktree follows it and deletes the **primary's** real files. A per-file hardlink has no back-reference, so deleting the worktree's copy drops only that name.

> **Donor scar (ADF, 2026-07-24):** an early version junctioned the credentials directory into a smoke-test worktree. Tearing the worktree down with `rm -rf` followed the junction and wiped the primary checkout's credentials.

## Built-in exclude patterns (`ignored` mode)

Generated and bulky categories that never belong in a carried set. The profile's `worktree_carry_exclude` **adds** to these; it cannot remove them.

```
bin/ obj/ node_modules/ dist/ build/ target/ out/
.venv venv/ __pycache__ .pytest_cache/ .mypy_cache/ .ruff_cache/ .tox/
coverage* *.log logs/ .worktrees/
.vs/ .idea/ .vscode/ .cursor/
```

Add a pattern to the profile only for a genuinely new **category** of generated output (a codegen target, a new cache). Never add one to "fix" a missing secret — secrets are carried by design. Keeping a particular secret *out* of worktrees is a deliberate decision: record it in the profile with its reason, not as exclude-list churn.

## Reference implementation

```bash
# carry_gitignored_runtime_files <primary> <target> [<mode>] [<extra-exclude-pattern>...]
#   mode: "ignored" (default) or "list"; in list mode the remaining args are the paths to carry.
carry_gitignored_runtime_files() {
  local PRIMARY="$1" TARGET="$2" MODE="${3:-ignored}"; shift 3 2>/dev/null || shift $#
  local SIZE_CAP=10485760
  local BUILTIN=(bin obj node_modules dist build target out .venv venv __pycache__ .pytest_cache
                 .mypy_cache .ruff_cache .tox 'coverage*' '*.log' logs .worktrees .vs .idea .vscode .cursor)

  candidates() {
    if [ "$MODE" = "list" ]; then printf '%s\n' "$@"
    else git -C "$PRIMARY" clean -ndX | sed 's/^Would remove //'; fi
  }
  link() {  # $1 src file, $2 dst file
    [ -e "$2" ] && return 0
    mkdir -p "$(dirname "$2")"
    ln "$1" "$2" 2>/dev/null \
      || MSYS2_ARG_CONV_EXCL="*" cmd.exe /c mklink /H "$(cygpath -w "$2")" "$(cygpath -w "$1")" >/dev/null 2>&1 \
      || echo "[worktree-carry] hardlink failed for $2" >&2
  }

  candidates "$@" | while IFS= read -r rel; do
    rel="${rel%/}"; [ -z "$rel" ] && continue
    if [ "$MODE" != "list" ]; then
      skip=false
      for p in "${BUILTIN[@]}" "$@"; do
        p="${p%/}"
        case "$rel" in "$p"|"$p"/*|*/"$p"|*/"$p"/*|$p) skip=true; break ;; esac
      done
      $skip && continue
    fi

    SRC="$PRIMARY/$rel"; DST="$TARGET/$rel"
    [ -e "$SRC" ] || continue
    SIZE=$(timeout 5 du -sb "$SRC" 2>/dev/null | cut -f1)
    if [ -z "$SIZE" ] || [ "$SIZE" -gt "$SIZE_CAP" ]; then
      echo "[worktree-carry] skipped $rel (${SIZE:-size check timed out}) — carry by hand if needed" >&2; continue
    fi

    if [ -d "$SRC" ]; then
      # real subdirectories + per-file hardlinks — NEVER a junction or symlink (see the scar above)
      find "$SRC" -type f -print0 | while IFS= read -r -d '' f; do link "$f" "$DST/${f#"$SRC"/}"; done
    else
      link "$SRC" "$DST"
    fi
  done
}

# ignored mode, with the profile's worktree_carry_exclude patterns appended:
carry_gitignored_runtime_files "$REPO_ROOT" "$WORKTREE_PATH" ignored <worktree_carry_exclude...>
# list mode, with the profile's worktree_carry paths:
carry_gitignored_runtime_files "$REPO_ROOT" "$WORKTREE_PATH" list <worktree_carry paths...>
```

`cmd.exe /c mklink /H` is the fallback for Windows shells without a coreutils `ln`. `MSYS2_ARG_CONV_EXCL` is scoped to that one call: Git-Bash otherwise rewrites the lone-slash `/H` into a path, while exporting it for the whole function would also stop the conversion `git -C` needs for a `/c/...` path; both source and target must sit on the same volume, which holds for sibling worktrees.

**Never halt the caller on a failure here.** A failed link is a `[worktree-carry]` note on stderr — and a cleanup-issue entry where the caller keeps one — never a reason to stop provisioning the worktree.

## What this does not do

- Touch anything tracked — worktree creation already handles that.
- Isolate writes. A hardlink is the same bytes under two names, so an in-worktree edit mutates the primary's copy too. None of the carried categories (keys, credentials, local overlays) is something a coder should edit; a future file that needs copy-on-write isolation is special-cased by its caller.
- Push anything anywhere. It exists only so the worktree's local processes find a file at the path they already expect.
