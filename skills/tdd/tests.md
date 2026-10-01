# Good and Bad Tests

## Good Tests

**Integration-style**: Test through real interfaces, not mocks of internal parts.

```typescript
// GOOD: Tests observable behavior
test("user can checkout with valid cart", async () => {
  const cart = createCart();
  cart.add(product);
  const result = await checkout(cart, paymentMethod);
  expect(result.status).toBe("confirmed");
});
```

Characteristics:

- Tests behavior users/callers care about
- Uses public API only
- Survives internal refactors
- Describes WHAT, not HOW
- One logical assertion per test

## Bad Tests

**Implementation-detail tests**: Coupled to internal structure.

```typescript
// BAD: Tests implementation details
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});
```

Red flags:

- Mocking internal collaborators
- Testing private methods
- Asserting on call counts/order
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying through external means instead of interface

```typescript
// BAD: Bypasses interface to verify
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});

// GOOD: Verifies through interface
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

**Tautological tests**: Expected value restates the implementation, so the test passes by construction.

```typescript
// BAD: Expected value is recomputed the way the code computes it
test("calculateTotal sums line items", () => {
  const items = [{ price: 10 }, { price: 5 }];
  const expected = items.reduce((sum, i) => sum + i.price, 0);
  expect(calculateTotal(items)).toBe(expected);
});

// GOOD: Expected value is an independent, known literal
test("calculateTotal sums line items", () => {
  expect(calculateTotal([{ price: 10 }, { price: 5 }])).toBe(15);
});
```

## Live-service tests: diagnostics, never gates

Some tests call a real external service with real credentials — a model gateway, a payment sandbox, a third-party API. They belong in their own **lane**, off by default, and they never gate anything.

- **Never in a gate.** Not the pre-push check, not CI. They assert over output that drifts for reasons unrelated to the diff — model changes, provider config, rate limits. **A non-deterministic check inside a deterministic gate makes every red ambiguous**, and an ambiguous red trains everyone to re-run until green. They also spend real calls on every push of every review round.
- **Opt-in is explicit.** Exclude the lane by category/marker in every filtered run — the local fast gate and CI select the same set — and run it by hand, on purpose, when the diff touches the integration it exercises.
- **Once opted in, a missing prerequisite fails loudly.** No credential, no fixture file, no rig → a hard failure with a message that says what to supply. Never a silent pass, and never a result that vanishes.
- **A skip must stay counted.** Know what your framework does with a skipped test. In NUnit, `Ignore` reports **Skipped** and is counted in the total; `Assume` reports **Inconclusive**, which the test runner counts in no column — the test disappears from the report. pytest's `skip` and `xfail`, and xUnit's `Skip`, each have their own reporting; check before relying on one. A green run with tests silently missing is worse than a red one.

> **Donor scar:** a live-service test's guard used the inconclusive-style mechanism. The run was green with 116 tests silently missing from the report. The guard was rewritten to fail loudly, and the off-by-default switch moved to one that stays counted.

### Ignoring a test: the one sanctioned case

**Never ignore a test to make a suite green.** Leave it failing and log it; a test that ran yesterday and is red today is a regression, whatever it touches.

The one exception is a **manual diagnostic** — a live-service fixture that cannot pass on a machine without credentials or a gitignored fixture file, where a category alone is not enough because an IDE's "run all" passes no filter. A fixture-level ignore is sanctioned there, and only on these terms:

1. Fixture-level, and only on a fixture that talks to a live service.
2. The reason string says **what to supply** and that the attribute is deleted to run it — e.g. *"Manual live-service diagnostic — delete this attribute to run. Needs local credentials in `<gitignored settings file>`."*
3. The lane's category/marker stays on it as well, so filtered runs still exclude it explicitly while a developer has it un-ignored.
4. Un-ignored, missing prerequisites still fail loudly.
5. **Never on a test that was running before.** That is not a diagnostic; it is a hidden regression.

The test of which case you are in is *why* the test is not running: a machine lacking a credential (sanctioned — there is no defect to hide) or code that is broken (banned — the ignore buys a false green).

**Any new loud-failing lane is added to CI's filter and to the local gate's filter in the same change** (and to the profile's lane map). Updating one and not the other produces exactly the false regression the loud failure was meant to prevent.
