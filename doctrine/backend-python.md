# Python Development Rules

**Priority:** High — load for any Python backend code change.

**Axis:** backend language. **Owns:** idiom — naming, typing, syntax, error handling, DI style, complexity limits, test tooling. **Defers to the repo's architecture core for:** placement — where a file lives, what may import what, whether a repository abstraction exists at all. See [`AXES.md`](./AXES.md).

Written for modern Python (3.11+) web backends. FastAPI is the reference framework and is named where its mechanics differ from the general rule; the rules hold for any ASGI framework. Repo-specifics — the framework, the ASGI server, the test stand-in, the lint/type toolchain — live in the repo's `.claude/doctrine/project-profile.md` overlay.

## Code style and structure

- Write concise, idiomatic Python. Prefer the standard library to a dependency; prefer a dependency to hand-rolling a protocol.
- Prefer comprehensions and generator expressions to `map`/`filter` chains; prefer an explicit loop to a comprehension that has grown a second `for` or a ternary.
- Use f-strings for interpolation — never `%` or `.format()` in new code, and never an f-string as a SQL query.
- Use `pathlib.Path` for filesystem paths, never string concatenation.
- **Modules are the unit of grouping, not classes.** A module of related functions is idiomatic Python; a class holding only static methods is Java wearing a disguise. Reach for a class when there is state to hold or a protocol to satisfy.
- Dataclasses (`@dataclass`, `frozen=True` and `slots=True` where they fit) for entities and value objects; Pydantic models for anything crossing the wire. A frozen dataclass gets `__eq__` and `__hash__` for free — do not hand-write them.
- **Use `Enum` (or `StrEnum`) for a closed set of values**, never bare string literals scattered across modules. A status, a kind, a mode with three legal values is an enum; the persistence layer's `CHECK` constraint and the enum should name the same set.

## Naming conventions

- `snake_case` for modules, packages, functions, variables, and parameters.
- `PascalCase` for classes, including Pydantic models, dataclasses, enums, and exceptions.
- `UPPER_SNAKE_CASE` for module-level constants.
- Exception classes end in `Error` (`OrderNotFoundError`), not `Exception`.
- A single leading underscore marks module-private. It is a convention, not enforcement, and it is the correct signal for a helper nobody outside the module should call. A double leading underscore invokes name mangling — reserve it for genuine attribute-collision avoidance in subclassing, which is rare.
- **Do not prefix protocols or interfaces with `I`.** A `typing.Protocol` is named for what it does — `OrderReader`, not `IOrderReader`. This is a deliberate divergence from the .NET core; do not carry the habit across languages.
- Boolean names read as predicates: `is_active`, `has_lines`, `should_retry`.
- **Never contract a domain entity stem.** The repo's canonical entity names are the vocabulary; a type or function name must not drop a **domain word** off a compound stem.
  - **The test — module qualifier vs. domain word.** You *may* strip a leading **module qualifier**: a prefix that leads several entities and is not itself an entity. You *may not* strip a word that leaves the **bare tail of a compound entity**, because the stripped word names a real entity you would be reaching *through*.
  - **Reviewer heuristic:** a new type or function whose leading word is the tail of a compound entity is the smell — rename to the full stem, or state explicitly in the diff that it is a repo-sanctioned structural alias.
- Match the persistence layer's field names in code that carries rows. Renaming `pack_size` to `packSize` on the way through adds a translation surface with no owner.

## Typing

- **Type-annotate every function signature** — parameters and return. Untyped signatures defeat Pydantic, defeat the type checker, and are the most visible marker of unidiomatic modern Python.
- Use built-in generics (`list[str]`, `dict[str, int]`), not `typing.List`. Use `X | None`, not `Optional[X]`.
- `typing.Protocol` for structural seams you intend to substitute in tests. Prefer it to ABCs: no registration, no inheritance required of the implementer.
- Reserve `Any` for genuinely dynamic boundaries and comment why. An `Any` in a signature erases every check downstream of it.
- Use `Literal` for a small fixed set of accepted values where an `Enum` would be overkill at a boundary, and `NewType` where two `str`s mean different things.
- **A type checker runs in `check_commands`.** Types nobody verifies decay into documentation, and wrong documentation is worse than none.

## Syntax, formatting and tooling

- **`ruff` is the default toolchain** — linter and formatter in one, replacing flake8, isort, and black. Run `ruff check` and `ruff format`; both belong in `check_commands`.
- **A type checker is separate and mandatory** — `mypy` or `pyright`. Linting does not typecheck, and a green lint run says nothing about type correctness.
- Configure both in `pyproject.toml`, never in scattered per-tool config files. One project file, one source of settings.
- Do not silence a diagnostic without a reason on the same line — `# type: ignore[arg-type]  # <why>`, never a bare `# noqa`. A blanket ignore hides the next, real failure.
- Line length and formatting are the formatter's job. Never hand-format around it, and never argue with it in review.

## Resource management

- **`with` for anything that must be released** — files, connections, locks, transactions. Manual `open()`/`close()` pairs leak on the exception path, which is exactly the path you did not test.
- **Write your own context manager for a paired acquire/release**, using `@contextlib.contextmanager` for the simple case or `__enter__`/`__exit__` for a class. A transaction helper, a temporarily-swapped setting, and a held lock are all context managers — this is the idiom that makes the release impossible to forget.
- Use `contextlib.ExitStack` when the number of resources is dynamic, and `contextlib.suppress` instead of a `try`/`except`/`pass` you would otherwise be embarrassed by.
- A generator that holds a resource must release it in a `finally`, because the consumer may never exhaust it.

## Async and blocking

- **Pick per endpoint, deliberately.** In FastAPI, a `def` endpoint runs on a threadpool and a blocking call inside it is fine; an `async def` endpoint runs on the event loop, and **a blocking call inside it stalls every other request in the process.**
- The failure is invisible under single-request testing and catastrophic under concurrency — exactly the profile of a load test or a live demo. If a handler calls a synchronous driver (a DB-API connection, `requests`, a file read), declare it `def`, or push the call through `run_in_threadpool`.
- Never `time.sleep` in async code; use `asyncio.sleep`. Never fire a coroutine without awaiting it or holding its task reference — an un-referenced task can be garbage-collected mid-flight.
- Use `asyncio.gather` for genuinely concurrent I/O; awaiting in a loop is sequential and is the async equivalent of an N+1.
- **Async is not thread-safety.** A module-level connection or client shared across a threadpool needs the same locking discipline it would need anywhere. See `relational-persistence.md`.

## Dependency style

- **Prefer explicit parameters to ambient module state.** A function that takes what it needs is testable without patching.
- Where the framework offers injection, use it. FastAPI's `Depends` is the seam for per-request resources — a session, the current user, a settings object — and it substitutes cleanly in tests via `app.dependency_overrides`. Prefer overriding a dependency to monkeypatching an import.
- **Module-level singletons are a deliberate trade, not a default.** They are simple, and they are global state: import order becomes load-bearing and tests share one instance unless they work to avoid it. If the repo uses one, its profile must say so and say what tests do about it.
- Cache expensive settings construction with `functools.lru_cache` on a provider function rather than building a module-level object at import.
- `monkeypatch` or `mock.patch` against your own internals is a smell — it means the seam is missing. Patch at external boundaries only.

## Error handling and validation

- **Validate at the edge with the framework's model layer** (Pydantic), not with hand-written checks inside the handler. A validation failure should become a 422 before your code runs.
- Express constraints in the model — `Field(gt=0)`, `Field(max_length=…)` — and reach for `field_validator` / `model_validator` only for rules the field types cannot express.
- **Raise the framework's HTTP exception only in the route layer.** Business logic raises domain exceptions; the route translates them. A handler that imports `HTTPException` has bound the domain to the transport.
- Define a small domain exception hierarchy with one base class per bounded context, so a route can translate by category instead of by enumeration.
- **Always chain when re-raising: `raise OrderNotFoundError(...) from exc`.** Without `from`, the original traceback is discarded and the log shows the symptom with no cause.
- Catch narrowly. A bare `except:` swallows `KeyboardInterrupt` and `SystemExit`; a bare `except Exception` wrapped around more than one statement hides which line actually failed.
- Never return `None` to signal failure where the caller cannot distinguish it from a legitimately absent value — raise, or return an explicit result type.
- Let unexpected exceptions reach the framework's handler and become a 500. Blanket try/except that logs and continues turns a crash into corrupt state.
- Log with the `logging` module and a module-level `logger = logging.getLogger(__name__)` — never `print`. Log exceptions with `logger.exception` inside the handler so the traceback is captured.

## API design

- Follow RESTful design: nouns in paths, verbs as HTTP methods, plural collection resources.
- **Group routes with `APIRouter`**, one router per feature, mounted in the app entry point with its `prefix` and `tags`. A single flat module of routes stops scaling at about a dozen endpoints.
- **Declare `response_model` on every route.** It is the wire contract, it filters unintended fields out of the response, and it is what makes the generated schema honest.
- Return the right status explicitly — `status_code=201` on create, `204` with no body on delete — rather than letting everything default to 200.
- Cross-cutting concerns go in middleware (request logging, correlation IDs) or a shared dependency (auth, tenancy), never copy-pasted into each route.
- **Route handlers stay thin** — validate, call, return. Business logic lives where the architecture core says it lives.
- Use `BackgroundTasks` for short work that must happen after the response; use a real worker (a queue, a scheduler) for anything long-running or that must survive a restart. Startup and shutdown work belongs in the `lifespan` context manager.

## Performance

- Use `async` for I/O-bound work, respecting the blocking rules above. CPU-bound work does not belong on the event loop at all — the GIL means threads will not help either; use a process pool or move it out of the request path.
- **Avoid N+1 queries.** Lazy loading is the default in most Python ORMs, so the N+1 is the *silent* case rather than the exceptional one — eager-load the relationship (`selectinload` / `joinedload` in SQLAlchemy) or restructure into one query. A loop containing a query is the signal.
- **Paginate every collection endpoint.** An unbounded list endpoint works on seed data and dies on production volume. Prefer keyset pagination over `OFFSET` for large or frequently-appended tables.
- Stream large responses with a generator rather than materializing the whole body in memory.
- Do not micro-optimize without a measurement. Reach for `lab` or a profiler before rewriting anything for speed.

## Single responsibility & decomposition

- Every module and class should have ONE reason to change. If you describe it with "and", it needs splitting.
- **Function length: ~30 lines max.** Past that, extract named helpers or a collaborator with a single purpose.
- **Parameter limit: 4–5 max.** More than that, and a group of them is a value object waiting to be named.
- **Nesting depth: 2 levels max.** Flatten with early returns and guard clauses.
- **Keep a single function's cognitive load at or below 17** — count variable declarations, branches, loops, `try` blocks, and boolean operators. Over that, split it.
- Prefer a new module or class with its own seam to adding a seventh method to an existing one.

## Key conventions

- Testability is a primary design concern, not something retrofitted.
- **Mutable default arguments are a bug, always** (`def f(items=[])`). Use `None` and build inside.
- **No wildcard imports.** `from x import *` breaks every tool that reads the module and makes the origin of a name unknowable.
- **Absolute imports within the application package.** Relative imports past one level (`from ...core import x`) make a module unmovable.
- Every package directory carries an `__init__.py` — keep it empty unless it deliberately defines the package's public surface.
- **Never mutate `sys.path` to make an import work.** That is a packaging problem in an import costume; fix the install or the layout.
- Guard scripts with `if __name__ == '__main__':`. **Import-time side effects run at startup, in tests, and in tooling** — if a module builds state at import, its profile must say so.
- Comments explain *why*, never *what*. Docstrings on public functions where the intent is not evident from the signature — this is a deliberate divergence from the .NET core's no-comments rule, because docstrings are idiomatic and tooling-consumed.
- Look for existing code resembling what you are about to write, and follow it.

## Testing

- **`pytest`** is the default. Plain `assert`, functions rather than classes, fixtures for setup — not `setUp` methods.
- **Every fixture that creates state tears it down.** A suite whose passes depend on file order is a sequence, not a suite.
- Choose fixture scope deliberately. A `session`-scoped fixture holding mutable state is a cross-test leak with a long fuse.
- Parametrize with `@pytest.mark.parametrize` rather than looping assertions inside one test — a parametrized failure names the case.
- Test async code with `pytest-asyncio` (or `anyio`), and make sure the test actually awaits what it asserts on.
- Mock at external boundaries (HTTP clients, third-party SDKs, clocks). Do not mock internal collaborators; if that seems necessary, the seam is in the wrong place — see `codebase-design`.
- **Test endpoints through the framework's test client** so routing, validation, and serialization are covered — not just the handler function.
- Net-new code uses red-green TDD. Brownfield repos with a declared legacy oracle (profile Q8) add parity gates per their overlay.

## Security

- **Never interpolate into SQL.** Parameterize every query — `?` or `:name` placeholders — including the ones you are sure are internal.
- Use the framework's auth pipeline rather than hand-rolling one: a dependency that resolves the caller's identity, applied at the router level so a new route cannot silently be public. Authorization is checked per resource, not just per route.
- Secrets come from the environment or a secret store, never source. Load and validate them once through a typed settings object (`pydantic-settings`), so a missing variable fails loudly at startup rather than as an `AttributeError` under load.
- Do not log secrets, and do not echo request bodies that may carry them.
- **Pin dependencies** with a lockfile. A floating upper bound is how a supply-chain change reaches production unreviewed.
- Use the CORS middleware deliberately — `allow_origins=['*']` is a development convenience that must not survive to a deployed environment.
- Never `pickle` untrusted input; it executes arbitrary code on load. Use JSON.

## API documentation

- The framework's generated OpenAPI schema **is** the API documentation. Keep it honest: `response_model` on every route, real status codes, and `tags` that match the feature structure.
- Docstrings on route handlers become endpoint descriptions in the schema — write them for the consumer, not for yourself.
- Give Pydantic fields `description` and `examples` where the name alone does not carry the meaning.

Follow the official framework documentation and PEP 8 / PEP 484 for anything this file does not cover.
