---
name: writing-plans
category: planning
owner: Atlas
description: Breaks an approved specification into bite-sized, dependency-ordered, snapshot-bound implementation milestones with explicit verification commands.
triggers: [write plan, implementation plan, roadmap, task breakdown, milestones]
tags: [planning, atlas, milestones, verification]
---

# Writing Plans (Snapshot-Bound Execution Plans)

## Purpose
Produce an execution plan that any engineer or fresh agent session can execute deterministically without guessing file paths or done criteria.

## Required Plan Structure
1. **Snapshot Header:** target repo, branch, baseline commit SHA, and explicit task ID.
2. **Ordered Milestones (`M1..Mn`):** each milestone lists exact target files, concrete changes, and a real verification command.
3. **Dependencies & Isolation:** identify which tasks can run in parallel read-only lanes vs. sequential writes.
4. **Rollback & Safety Boundaries:** confirm zero destructive Git operations and zero credential/config mutations.

## Guardrails
- `PLANNED` status does not authorize live edits or external publishing.
- Active plans are selected by the checkpoint pointer, never by file modification time (`mtime`).
