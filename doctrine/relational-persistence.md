# Relational Persistence Guidelines

**Priority:** High
**Instruction:** You MUST follow these guidelines on any task touching schema, migrations, queries, indexes, or data persistence.

**Axis:** none — this file is axis-independent and must hold under every architecture and language core. See [`AXES.md`](./AXES.md).

(Extracted 2026-08 from the donor stack's `database-optimizer.md`. Generic to any relational store behind an ORM; the donor ran Postgres + EF Core with a SQLite in-memory test harness, and its incidents are kept below as attributed examples. Repo-specifics — canonical store, migration owner, test stand-in, connection facts — live in the repo's `.claude/doctrine/project-profile.md` overlay.)

## 🧭 The spine: the test stand-in lies

Almost every rule here descends from one fact. Most repos run a **canonical store** in production and a **faster stand-in** in tests (an in-memory database, an embedded engine, an emulator). The stand-in is more permissive than the real thing — looser typing, serialized access, different collation, different casing. So an entire class of defect is **green in CI and broken in production**.

The discipline: every persistence change is evaluated against **both** realities, and where they disagree, the canonical store wins and the divergence is made explicit.

Which store is canonical and which is the stand-in is a repo fact — read it from the profile.

---

## Part A: Store & migration discipline

### A1. One store is canonical. The stand-in is test-only.
Production and local development run the canonical store. The stand-in exists **only** as a test harness. If the runtime can fall back to the stand-in (e.g. "use the embedded engine when no connection string is configured"), that branch exists for the test path — never rely on it for development, and never for migrations.

### A2. Migrations are scaffolded against the canonical store only.
Keep a **design-time guardrail** — a factory or config hook the migration tooling goes through, which refuses a missing or stand-in-shaped connection string with a loud error.

If you hit that error, **fix your local config**. Do not disable the guard, mock around it, or scaffold the migration from a different process. The guard is the only thing standing between you and a migration full of stand-in types.

### A3. Preflight before any migration command.
1. The canonical store is up and healthy.
2. Local config points at it (the profile records the expected host/port/database).
3. Your migration tool version matches the project's ORM runtime version. Mismatched tooling produces subtly broken snapshots.

### A4. Always read the generated migration before committing.
A clean migration adds only what the model changed: new tables, new columns, new indices.

🚨 **Red flags meaning it was scaffolded against the wrong provider** — abort and regenerate:
- Dozens of column-retype operations against pre-existing columns.
- Stand-in type-affinity strings instead of canonical-store types.
- A suspiciously large migration file for a small feature.

Recover by rolling the migration back through the tooling (so the snapshot rolls back too), fixing local config, and regenerating.

### A5. Type-incompatible column changes need explicit casts.
Strict stores reject a type change that needs data conversion, and the ORM will not emit the cast for you.

- **Preferred**: multi-step migration — add new column, backfill, drop old, rename. Each step is reversible and survives concurrent writes.
- **Acceptable for empty/dev tables only**: hand-edit the migration to emit the raw cast.

The same change usually works silently on a loosely-typed stand-in, so this bug is invisible until the canonical store executes it.

### A6. Migrations must apply to both realities.
Integration tests typically replay the full migration history against the stand-in. Avoid canonical-store-only types in the model unless you add per-provider configuration. Donor examples of the trap: array columns, JSON columns queried with store-native operators, full-text and trigram types — all extension-bound or absent in the stand-in.

If a slice genuinely needs a store-only type, guard the affected tests on the stand-in and record the divergence in the profile.

### A7. After regenerating or applying a migration, run the schema suite.
The fast feedback loop on cross-provider portability is a test that applies the full migration chain to the stand-in and asserts structural expectations (FK indices, table shape). The profile names this suite in `check_commands`. If it passes, your migration is portable.

### A8. Data access respects the architecture core's boundary — whatever that boundary is.
This file governs *how* you query; **the repo's architecture core governs where the query lives**, and the two architectures disagree on purpose:

- Under `arch-vsa`: no generic shared repositories across slices. Each slice owns its own queries.
- Under `arch-clean` / `arch-onion`: a repository interface owned by the inner ring, implemented outward — the shared abstraction is the point, not a smell.

What holds under **all** of them: **reaching across a boundary to another unit's data is a smell.** Whether the boundary is a slice or a ring, the fix is the same — extract a domain event or a focused read model instead of importing your way in.

### A9. Address existing reference data by its natural key, never by a hardcoded surrogate Id.
**If a table's rows can be created or edited through the app, its surrogate Ids are environment-specific.** A code-side seed invents its own Ids; every real database has different ones. The seed only ever materializes into a *blank* database — the test harness, a brand-new environment.

**Consequence:** any migration, seed, or query referencing such a row by a literal Id is a loaded gun. It passes tests (the blank stand-in is seeded from the same fiction, so the Ids line up) and fails against every real database.

- ❌ Hardcoding a literal Id and inserting or referencing the row by it.
- ✅ Resolve by the stable business key, which should carry a unique index:
  ```sql
  INSERT INTO child (parent_id, role, created_at)
  SELECT id, 'SomeRole', '2026-01-01' FROM parent WHERE slug = 'known/business-key'
  ON CONFLICT (parent_id) DO NOTHING;
  ```

> **Donor scar:** an admin-managed category taxonomy carried random GUIDs assigned at creation time, while the code-side seed used its own invented Ids — the two forked long ago. A migration hardcoding a literal category GUID shipped and broke startup with a duplicate-key violation on the primary key, then on the slug index. Tests were green throughout.

**Reviewer red flag:** a literal entity Id in a migration, a seed, or a `WHERE id = '<literal>'` against a runtime-managed table. Blocker even if tests pass.

### A10. Data-seed migrations must be idempotent against the natural key.
Seed migrations meet **already-populated** databases. A blind insert collides the moment the row exists. Make every reference-data insert idempotent on the natural key:

```sql
INSERT INTO parent (id, slug, ...) VALUES (...)
ON CONFLICT (slug) DO NOTHING;
```

Target the **natural-key** column, not the primary key — a real row that already owns the key is preserved with its real Id, while a blank database still gets seeded. Verify the existing row matches what you'd insert before relying on "do nothing"; if live data legitimately differs you want an update, not a silent skip.

---

## Part B: Query & schema practice

### B1. Index strategy
- **Index every foreign key.** Many stores do not do this automatically, and cascading deletes then scan the child table per parent row.
- **Composite indexes follow query order.** An index on `(a, b)` serves `WHERE a = ? ORDER BY b DESC` but not `WHERE b > ?`.
- **Partial indexes for filtered queries.** If you only ever query one slice of a skewed column, a partial index is dramatically smaller and faster.
- **Match the index type to the operator.** B-tree is the default and fits equality/ordering. Range-overlap, containment on JSON/arrays, full-text, and fuzzy/trigram matching each need their store's specialized index type — and often an extension.

### B2. Query plan literacy
- Read the plan on any query touching >1k rows or sitting in a hot path.
- A **sequential scan** on a large table means a missing or unusable index. Index scans are best for highly-selective lookups.
- Compare actual vs estimated rows. Off by >10x means stale statistics — refresh them.
- A nested loop with a high outer-row count is usually an N+1 in disguise.

### B3. Avoid N+1
ORMs make N+1 easy to ship. Catch it with eager loading for parent→child navigation, split queries where a one-to-many join would blow up the cartesian, projection to fetch exactly the shape you need, and **logging generated SQL in development** so you can see when the ORM emits a loop.

### B4. Safe migration patterns
- **Before writing a data migration that names specific rows, run the SELECT** against the real store to confirm those rows exist and in what shape. Do not trust Ids in the code-side seed or the model snapshot — they are blank-database fiction. (One such query would have caught the entire A9 incident before it shipped.)
- **Adding an index on a large table**: use the store's concurrent/online index creation via raw SQL — ORMs generally cannot emit it, and the default form locks the table for writes.
- **Dropping a column**: two-step across releases — ship it unused first, drop next — so mid-deploy instances never reference a missing column.
- **Renaming a column**: prefer add-new + backfill + drop-old over rename, for the same reason.

### B5. Connection management
Know your driver's pool defaults and how to observe live connections when you see pool exhaustion. Test harnesses that open their own dedicated connection per test class are a harness pattern — never reach for it in production code.

### B6. Things that look fine on the stand-in but break on the canonical store
- Type changes without an explicit cast (A5).
- **Case sensitivity**: pattern matching and comparison are frequently case-insensitive on embedded stand-ins and case-sensitive on real stores. Be explicit.
- **Quoted identifiers**: stores that preserve case for quoted identifiers will demand exact casing in raw SQL; stand-ins often ignore quoting entirely.
- **Boolean storage**: a real boolean type vs an integer. `WHERE col = 1` works on the stand-in and fails on the real store.
- **Timestamp semantics**: timezone-anchored columns reject ambiguous local times. Always persist UTC-anchored values.
- **Concurrent queries on a shared context** — see B7, the pitfall most likely to ship through CI undetected.

### B7. Never run concurrent queries on the same scoped ORM context
An ORM session/context is typically **not thread-safe and not pipeline-safe**. A scoped context holds exactly one connection — two queries cannot be in flight on it simultaneously. Violating this produces disposed-socket errors, half-consumed readers, and pool corruption.

**The anti-pattern:**
```csharp
// BAD — both queries race on the same scoped context
var confirmationTask = confirmationReader.ReadAsync(id, ct);   // starts, not awaited
var entries = await LoadEntriesAsync(dbContext, id, ct);       // starts a second query
var confirmation = await confirmationTask;
```
The reader was injected with the *same* scoped context the handler holds. The unawaited assignment starts the first query; the next line starts a second on the same connection. They fight over the socket and one is left corrupted.

**The fix is almost always sequential awaits.** ORMs are fast enough that the parallel-start optimization rarely pays back the risk. If you genuinely need concurrency, obtain a **separate context per branch** through a context factory.

**Why this slips through CI.** Stand-ins that serialize operations at the driver level never materialize the race. It only appears against a real network connection.

**Reviewer red flags** — scan diffs for:
- An assignment to a non-awaited task involving data access, followed by another await on the same context (fine for HTTP calls, lethal for an ORM).
- `Task.WhenAll` / parallel iteration over queries sharing one context.
- Injecting a scoped context into a service *and* injecting that service alongside the context into a handler — that is the same context twice.
- Background work capturing a context from a parent scope and using it after the request returned.

---

## 🚫 Anti-patterns (flag in review)

1. Disabling or working around the design-time migration guard (A2).
2. A migration full of stand-in type affinities (A4).
3. A literal surrogate Id for runtime-managed reference data (A9).
4. A non-idempotent data seed (A10).
5. An unindexed foreign key (B1).
6. Server data fetched in a loop / unprojected full-entity reads in a hot path (B3).
7. A blocking index creation on a large table (B4).
8. Concurrent queries on one scoped context (B7).

## 🗣️ Communication style

When you propose a nontrivial query, show the plan. When you propose a migration, show the generated body and the review you did against the A4 red flags. When a model change might break the stand-in path, say so explicitly with the failing scenario — not "this should be fine".

Be skeptical of premature denormalization, partitioning, and optimization. Do not be skeptical of indexes on foreign keys.
