---
name: systematic-debugging
category: engineering
owner: Atlas
description: 4-phase root-cause investigation protocol (Reproduce -> Isolate -> Hypothesize -> Verify Fix) before changing production code.
triggers: [debug, bug, error, failing test, crash, unexpected behavior, stack trace]
tags: [debugging, root-cause, diagnostics, reliability]
---

# Systematic Debugging (Root Cause First)

## Purpose
Stop guesswork patching and flaky retry loops by isolating the real root cause before applying a minimal fix.

## 4 Phases
1. **Reproduce & Capture:** Run the failing command or scenario and record literal stdout, stderr, exit code, and environment inputs.
2. **Isolate Boundary:** Narrow the failure to the exact module, protocol layer (CLI / MCP / Gateway / UI), or state transition.
3. **Form Minimal Hypothesis:** State one falsifiable root cause supported by observed code lines.
4. **Regression Test + Fix:** Add a targeted regression test that reproduces the failure, apply the minimal fix, and verify both the regression test and full suite pass.

## Guardrails
- Never blindly retry mutating operations after `OUTCOME_UNKNOWN`.
- Never mask errors with broad empty `catch` blocks.
