---
name: brainstorming
category: planning
owner: Jarvis x Atlas
description: Spec-first design exploration that clarifies goals, constraints, trade-offs, and acceptance criteria before writing code.
triggers: [brainstorm, design, new feature, architecture options, proposal, spec]
tags: [planning, design, architecture, spec]
---

# Brainstorming (Spec-First Design)

## Purpose
Turn ambiguous feature ideas into a crisp, verifiable design spec before touching source files.

## Workflow
1. Inspect existing repository architecture, conventions, and constraints first.
2. Identify 2-3 viable engineering approaches with explicit trade-offs (complexity, token/runtime cost, maintainability, risk).
3. Recommend one default approach and justify why.
4. Define explicit **Scope**, **Non-Goals**, **Interfaces**, and **Acceptance Criteria** (machine-checkable tests/commands).
5. Save agreed specs under `docs/specs/<feature>.md` before creating an implementation plan.

## Guardrails
- Never rewrite existing user architecture without evidence that incremental extension is insufficient.
- Separate observed repository facts from design assumptions.
