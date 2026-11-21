---
name: using-superpowers
category: core-governance
owner: Jarvis x Atlas
description: Cold-start skill discovery and invocation discipline that selects <= 8 relevant playbooks per turn before acting.
triggers: [start task, resume session, choose skill, cold start, workflow]
tags: [governance, routing, startup, skills]
---

# Using Superpowers (Cold-Start Skill Discipline)

## Purpose
Ensure the coordinator loads only the exact domain playbooks needed for the active user request instead of improvising or bulk-loading the entire skill catalog.

## Mandatory Execution Order
1. Read target repository checkpoint (`docs/project-checkpoint.md`) and Git snapshot (`branch`, `HEAD`, `dirty`).
2. Classify the user request into intent signals and run `node src/cli.mjs skills route "<intent>"` (hard cap: `<= 8` entrypoints/turn).
3. Read the selected `SKILL.md` files before proposing designs, modifying code, or claiming completion.
4. Keep simple factual questions direct—do not force heavy planning workflows onto one-line lookups.

## Guardrails
- Never bulk-load all skills into context.
- Reading a skill never grants install, account/model switching, subagent dispatch, or publish authority.
