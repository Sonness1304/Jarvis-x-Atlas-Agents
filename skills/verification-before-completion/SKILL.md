---
name: verification-before-completion
category: quality-gate
owner: Atlas
description: Hard evidence gate requiring fresh command execution, observed exit codes, and explicit VERIFIED vs UNVERIFIED reporting before concluding.
triggers: [verify, done, complete, ready to commit, ship, final check]
tags: [verification, evidence, quality-gate, honesty]
---

# Verification Before Completion

## Purpose
Prevent false-positive "all done" reports by coupling every completion claim to direct, fresh runtime evidence.

## Checklist
1. Re-run targeted unit/integration tests (`npm test`) after the **final** edit.
2. Run deterministic offline evals (`npm run eval`) and compare against baseline if present.
3. Run privacy/secret hygiene scan (`npm run audit:privacy`) before any public commit or release.
4. Inspect `git diff --stat` and `git status -sb` to confirm only intended files changed.
5. Label every claim accurately:
   - `VERIFIED`: directly executed and observed in this turn for the exact revision.
   - `UNVERIFIED`: any check not executed (e.g., live external API, manual browser flow).

## Guardrails
- Prior-turn test results do not verify subsequent edits.
- Readiness (`READY`) is static and never replaces runtime execution proof.
