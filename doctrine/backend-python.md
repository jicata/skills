# Python Backend Rules

**Priority:** High — load for any Python backend code change.

**Axis:** backend language. **Owns:** idiom — naming, typing, error handling, dependency style, complexity limits, test tooling. **Defers to the repo's architecture core for:** placement — where a file lives, what may import what, whether a repository abstraction exists at all. See [`AXES.md`](./AXES.md).

Written for modern Python (3.11+) web backends — FastAPI is the reference framework and named where its mechanics differ from the general rule. Repo-specifics — the framework in use, the ASGI server, the test stand-in, the lint/format toolchain — live in the repo's `.claude/doctrine/project-profile.md` overlay.

## Code style and structure

- Write concise, idiomatic Python. Prefer the standard library over a dependency; prefer a dependency over hand-rolling a protocol.
- **Type-annotate every function signature** — parameters and return. Untyped signatures defeat the whole point of Pydantic and the type checker, and they are the single most visible marker of unidiomatic modern Python.
- Prefer comprehensions and generator expressions to `map`/`filter` chains; prefer an explicit loop to a comprehension that has grown a second `for` or a ternary.
- Use `pathlib.Path` for filesystem paths, never string concatenation.
- **Modules are the unit of grouping, not classes.** A module of related functions is idiomatic Python; a class holding only static methods is Java wearing a disguise. Reach for a class when there is state to hold or a protocol to satisfy.
- Dataclasses (`@dataclass`, `frozen=True` where it fits) for entities and value objects; Pydantic models for anything crossing the wire.

## Naming conventions

- `snake_case` for modules, packages, functions, variables, and parameters.
- `PascalCase` for classes, including Pydantic models and dataclasses.
- `UPPER_SNAKE_CASE` for module-level constants.
- A single leading underscore marks module-private; it is a convention, not enforcement, and it is the correct signal for a helper nobody outside the module should call.
- **Do not prefix interfaces or protocols with `I`.** A `typing.Protocol` is named for what it does — `OrderReader`, not `IOrderReader`.
- **Never contract a domain entity stem.** The repo's canonical entity names are the vocabulary; a type or function name must not drop a domain word off a compound stem. You may strip a leading *module qualifier* that names no entity; you may not strip a word that leaves the bare tail of a compound entity, because the stripped word names something you would be reaching through.
- Match the persistence layer's field names in code that carries rows — renaming `pack_size` to `packSize` on the way through adds a translation surface with no owner.

## Typing

- Use built-in generics (`list[str]`, `dict[str, int]`) — not `typing.List`. Use `X | None`, not `Optional[X]`.
- `typing.Protocol` for structural seams you want to substitute in tests. Prefer it to ABCs: it needs no registration and no inheritance from the implementer.
- Reserve `Any` for genuinely dynamic boundaries and comment why. An `Any` that leaks into a signature erases every check downstream of it.
- Run a type checker in the repo's check commands. Types nobody verifies decay into documentation, and wrong documentation is worse than none.

## Async and blocking

- **Pick per endpoint, deliberately.** In FastAPI, a `def` endpoint runs on a threadpool and a blocking call inside it is fine; an `async def` endpoint runs on the event loop and **a blocking call inside it stalls every other request in the process.**
- The failure is invisible under single-request testing and catastrophic under concurrency, which is exactly the profile of a load test or a demo. If a handler calls a synchronous driver — a DB-API connection, `requests`, a file read — declare it `def`, or push the call through `run_in_threadpool`.
- Never `time.sleep` in async code; never fire an un-awaited coroutine and drop the reference.
- Thread-safety is not a given just because the framework is: a module-level connection or client shared across a threadpool needs the same locking discipline it would need anywhere. See `relational-persistence.md`.

## Dependency style

- **Prefer explicit parameters to ambient module state.** A handler that takes what it needs is testable without patching.
- Where the framework offers injection, use it: FastAPI's `Depends` is the seam for per-request resources (a session, the current user, a settings object), and it substitutes cleanly in tests via `app.dependency_overrides`.
- **Module-level singletons are a deliberate trade, not a default.** They are simple and they are global state: import order becomes load-bearing, and tests share one instance unless they work to avoid it. If the repo uses one, its profile must say so and say what tests do about it.
- `monkeypatch`/`unittest.mock.patch` against your own internals is a smell — it means the seam is missing. Patch at external boundaries only.

## Error handling and validation

- **Validate at the edge with the framework's model layer** (Pydantic), not with hand-written checks inside the handler. A validation error should become a 422 before your code runs.
- Raise the framework's HTTP exception (`HTTPException`) **only in the route layer.** Business logic raises domain exceptions; the route translates. A handler that imports `HTTPException` has bound the domain to the transport.
- Catch narrowly. A bare `except:` swallows `KeyboardInterrupt` and `SystemExit`; a bare `except Exception` around more than one statement hides the line that actually failed.
- Never return `None` to signal failure where the caller cannot tell it from a legitimately absent value — raise, or return an explicit result type.
- Let unexpected exceptions reach the framework's handler and become a 500. Blanket try/except that logs and continues turns a crash into corrupt state.

## Complexity limits

- **Function length: ~30 lines max.** Past that, extract named helpers or a collaborator with a single purpose.
- **Nesting depth: 2 levels max.** Flatten with early returns and guard clauses.
- **Keep a single function's cognitive load at or below 17** — count variable declarations, branches, loops, `try` blocks, and boolean operators. Over that, split it.
- Prefer a new module or class with its own seam over adding a seventh method to an existing one.
- **Mutable default arguments are a bug, always** (`def f(items=[])`). Use `None` and build inside.

## Testing

- `pytest` is the default. Plain `assert`, functions not classes, fixtures for setup — not `setUp` methods.
- **Fixtures own state, and every fixture that creates state must tear it down.** A test suite whose passes depend on file order is not a suite, it is a sequence.
- Parametrize with `@pytest.mark.parametrize` rather than looping assertions inside one test — a parametrized failure names the case.
- Mock at external boundaries (HTTP clients, third-party SDKs, clocks). Do not mock internal collaborators; if that seems necessary, the seam is in the wrong place — see `codebase-design`.
- Test the endpoint through the framework's test client so routing, validation, and serialization are covered — not just the handler function.
- Net-new code uses red-green TDD. Brownfield repos with a declared legacy oracle (profile Q8) add parity gates per their overlay.

## Packaging and imports

- **Absolute imports within the application package.** Relative imports past one level (`from ...core import x`) make a module unmovable.
- Every package directory carries an `__init__.py` — keep it empty unless it deliberately defines the package's public surface.
- **Never mutate `sys.path` to make an import work.** That is a packaging problem wearing an import costume; fix the install or the layout.
- Guard scripts with `if __name__ == '__main__':`. Import-time side effects in a module the app imports run at startup, in tests, and in tooling — if a module builds state at import, its profile must say so.

## Security

- Never interpolate into SQL. Parameterize every query — `?` or `:name` placeholders — including the ones you are sure are internal.
- Secrets come from the environment or a secret store, never from source. Do not log them, and do not echo request bodies that may carry them.
- Pin dependencies; a floating upper bound is how a supply-chain change reaches production unreviewed.
- Use the framework's CORS middleware deliberately — `allow_origins=['*']` is a development convenience and must not survive to a deployed environment.

## Documentation

- The framework's generated OpenAPI schema is the API documentation. Keep it honest: declare `response_model` on every route so the schema reflects reality.
- Docstrings on public functions where the *why* is not evident. No comment that restates the code.
