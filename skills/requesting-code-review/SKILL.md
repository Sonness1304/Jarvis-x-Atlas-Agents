---
name: requesting-code-review
category: quality-gate
owner: Atlas
description: Runs Independent Hybrid Review v2 with bounded diff slicing, 100% changed-file coverage gate, and existingCode line-anchoring.
triggers: [code review, review diff, audit changes, hybrid review, pr review]
tags: [review, atlas, quality, diff, coverage]
---

# Requesting Code Review (Independent Hybrid Review v2)

## Purpose
Catch correctness bugs, regressions, and security defects before merging without relying on a single external review gateway or unanchored LLM opinions.

## Workflow
1. Slice the Git diff into bounded batches: `node src/cli.mjs review slice --repo . --base HEAD~1`.
2. Inspect every file in every batch so **100% of changed files** are covered.
3. Record findings as structured JSON where **every finding quotes exact `existingCode` lines** from the real file.
4. Validate completeness and anchors mechanically: `node src/cli.mjs review verify --repo . --packet review-packet.json`.
5. Fix all `P0` / `P1` blocking issues and re-run `npm test` before reporting completion.

## Guardrails
- Review packets below 100% file coverage or containing mismatched `existingCode` anchors are automatically rejected (`REJECTED_INVALID_REVIEW`).
