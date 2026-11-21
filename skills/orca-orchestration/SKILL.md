---
name: orca-orchestration
category: orchestration
owner: Jarvis x Atlas
description: Bounded multi-agent worker orchestration enforcing <= 3 active workers, max depth 2, one writer per path, and exact-SHA handoffs.
triggers: [orca, multi-agent, parallel workers, subagent, delegate, spawn workers]
tags: [orchestration, multi-agent, worktree, concurrency]
---

# Orca Multi-Agent Orchestration

## Purpose
Scale complex, multi-module engineering tasks across independent workers without file write collisions, runaway nesting, or unverified worker merges.

## Lane Caps & Ownership Invariants
- **DIRECT (`0` workers):** small or tightly coupled edits.
- **PARALLEL Read-Only (`1-2` native subagents):** independent research, tracing, or read-only review.
- **ORCA Multi-Worker (`<= 3` active workers, max depth `2`):** dedicated Developer, Tester, and Reviewer roles on isolated Git worktrees.
- **One Writer Per Path:** no two workers may modify the same directory/file concurrently.
- **Exact-SHA Handoff:** Developer commits exact verified changes before Tester or Reviewer runs against that commit SHA.

## Guardrails
- Workers never push, open PRs, merge to main, or deploy.
- Native subagents and Orca workers are never stacked to bypass worker caps.
- On `OUTCOME_UNKNOWN`, reconcile status first; never blindly re-dispatch duplicate mutating workers.
