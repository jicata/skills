# Conventional PR titles — when the squash subject is a release input

**Applies only when the profile sets `pr_title_convention: conventional`.** Absent or `none`, every skill that points here uses its own title rule and skips the verification gate.

Every PR the pipeline opens is eventually **squash-merged** — child → PRD base branch, single issue → default branch, `/merge-pr` — and on a squash the PR **title** becomes the commit subject. On a base→default-branch finalize (a non-squash merge that preserves child commits), the child squash subjects — the child PR titles — are what lands on the default branch. Release tooling that reads [Conventional Commits](https://www.conventionalcommits.org/) (release-please, semantic-release, …) parses exactly those subjects. A title that does not match is **silently dropped**: no changelog line, no version bump, no error.

> **Donor scar (ADF, 2026-08):** a PRD's children were titled with the repo's legacy `ADF: …` prefix. Each squash-merged cleanly into the base branch, the finalize preserved them onto master, and release-please skipped every one — the feature shipped with no changelog entry and no version bump, and nobody noticed until the release notes were read.

Not a registered skill (no `SKILL.md`). Referenced by relative path `.claude/skills/_afk-shared/conventional-pr-title.md`.

## Build the title

**Never pass a raw issue title.** Build `--title` as `<type>(<scope>): <description>`.

**type** — from the issue's labels, else its intent:
- `bug` → `fix`
- enhancement / new capability → `feat`
- docs-only → `docs` · test-only → `test` · pure refactor → `refactor` · perf → `perf` · build or CI plumbing → `build` / `ci`
- Genuinely ambiguous: a feature slice is `feat`. **Never omit the type.**

**scope** — the module or slice the diff primarily touches, kebab-case, matching scopes already in the repo's changelog or history. Cross-cutting change with no single home → omit the scope (`feat: …`); don't invent one.

**description** — the issue title with any tracker prefix stripped (`PRD #<n>:`, a legacy project prefix), imperative mood, lowercase initial, no trailing period, the whole subject kept to ~70 characters (GitHub appends ` (#<pr>)` on squash).

## Verify before creating, and again before any squash-merge

```bash
title=$(gh pr view <pr-number> --json title -q .title)
printf '%s' "$title" | grep -qE '^(feat|fix|perf|revert|build|ci|chore|docs|test|style|refactor)(\(.+\))?(!)?: .+' \
  || echo "NON-CONVENTIONAL — fix before merge"
```

If a repo's commit hook or release config accepts a narrower or wider type list, the profile's Merge gates section says so and that list wins.

On a mismatch, rewrite the title before merging: `gh pr edit <pr-number> --title "<type>(<scope>): <description>"`. The pre-squash check is the last line of defence — it catches human-opened PRs as well as skill-created ones.

## Examples

- issue `Duplicate rows on concurrent upsert` (bug) → `fix(orders): prevent duplicate rows on concurrent upsert`
- issue `PRD #12: Tenant-scoped pagination for the session list` → `feat(sessions): add tenant-scoped pagination to the session list`
