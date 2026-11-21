---
name: test-driven-development
category: engineering
owner: Atlas
description: Enforces strict RED -> GREEN -> REFACTOR cycle so every behavior change or bug fix is backed by a real failing-then-passing automated test.
triggers: [tdd, write test, implement feature, bugfix, unit test, regression test]
tags: [testing, tdd, quality, engineering]
---

# Test-Driven Development (RED -> GREEN -> REFACTOR)

## Purpose
Eliminate untested code paths and "looks right" assumptions by proving every requirement with a deterministic test.

## Loop
1. **RED:** Write the smallest automated test capturing the exact expected behavior or bug reproduction. Run it and confirm it fails for the expected reason.
2. **GREEN:** Write the minimal production code required to make the test pass. Re-run the test suite and confirm exit code `0`.
3. **REFACTOR:** Clean up duplication or naming while keeping the entire test suite green.
4. **HARNESS GATE:** Register and verify multi-step features via `node src/cli.mjs harness verify --id <ID>`.

## Guardrails
- Never modify unrelated passing tests just to make a broken implementation look green.
- Never claim tests pass without executing the test command and observing exit code `0`.
