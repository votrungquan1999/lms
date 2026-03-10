---
name: tdd-design
description: Guides Test-Driven Development using the Red-Green-Refactor cycle with a test-first approach.
---

# TDD Design

Test-Driven Development: write tests before implementation, one test at a time.

## Core Principles

1. **Test First** - Always write and run tests before implementation
2. **One Test at a Time** - Write one test → run it → implement → run again → next test
3. **Minimum Implementation** - Only write code needed to make the current test pass
4. **Test Quality** - Follow 4 Pillars of Testing (Reliability, Validity, Sensitivity, Resilience)

---

## Test-First Loop

**Follow this loop for EVERY test case. Do NOT batch tests or skip steps.**

### Step 1: Write ONE Test

1. Write exactly ONE test describing desired behavior
2. Use descriptive test names
3. Follow Arrange-Act-Assert structure

### Step 2: Run the Test (Before Implementation)

1. Run the new test BEFORE writing any implementation
2. If it **fails** → proceed to Step 3 (this is the expected path)
3. If it **already passes** (covered by previous implementation) → this is acceptable, go back to Step 1 for the next test

### Step 3: Minimum Implementation

1. Write the **minimum** code needed to make this test pass
2. Focus on correctness, not elegance or optimization

### Step 4: Verify

1. Run the test again
2. If it **passes** → go back to Step 1 for the next test
3. If it **fails** → go back to Step 3 and fix the implementation

---

## Test Quality Checklist

**4 Pillars:**

- **Reliability** - Consistent results, no flaky tests, mock external dependencies
- **Validity** - Verify intended behavior, specific assertions, all execute
- **Sensitivity** - Detect defects, specific assertions, test edge cases
- **Resilience** - Survive refactoring, test through public interfaces

**Code Quality:**

- ✅ All tests pass
- ✅ Linting passes
- ✅ Follows conventions

---

## TDD Rules

**Never:**

- ❌ Write multiple tests before implementing
- ❌ Write implementation before running the new test
- ❌ Consider test passed when the test not actually run
- ❌ Skip running the test before writing implementation

## Related Skills

- `@bdd-design` - Use BDD for behavior-level/acceptance testing alongside TDD for unit-level testing
- `@test-quality-reviewer` - Review test quality using the 4 Pillars framework after writing tests
- `@code-refactoring` - Apply refactoring patterns to improve code quality
