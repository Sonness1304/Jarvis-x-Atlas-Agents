# Skills Architecture & Complete 57-Skill Ecosystem Guide

> Most agent frameworks fail at scale because they stuff dozens of system prompts and domain guides into every single turn—burning thousands of tokens and diluting instruction adherence. **Jarvis × Atlas Agents** solves this with **Progressive Skill Loading (`<= 8` entrypoints/turn)**.

---

## 1. How Progressive Skill Loading Works

```text
User Natural-Language Request
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│  1. Intent Classification (src/skills.mjs / task-context)│
│     • Scans lightweight YAML frontmatter ONLY            │
│     • Scores triggers (+10), tags (+6), IDs (+5), desc   │
│     • Hard cap: MAX_SKILLS_PER_TURN = 8 (never bulk-load)│
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  2. Selective Playbook Injection                         │
│     • Reads ONLY the matched SKILL.md files (e.g. 2-4)   │
│     • Typical catalog byte reduction: 65% – 88% / turn   │
│     • Computes SHA-256 hash per skill for provenance     │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  3. Authority Boundary Enforcement                       │
│     • Loading a skill provides METHOD, NEVER PERMISSION  │
│     • Cannot auto-install, switch accounts/models,       │
│       dispatch unauthorized workers, or publish/push     │
└──────────────────────────────────────────────────────────┘
```

### Try Progressive Skill Routing Live

```bash
# 1. List all installed skills with category, owner, byte size, and SHA-256
node src/cli.mjs skills list

# 2. Route a natural-language task (automatically selects <= 8 matching skills & reports byte savings)
node src/cli.mjs skills route "debug failing api test, run hybrid code review in isolated git worktree"

# 3. Inspect any full SKILL.md playbook
node src/cli.mjs skills show test-driven-development

# 4. Validate YAML frontmatter, descriptions, and triggers across the entire skills/ directory
node src/cli.mjs skills validate
```

---

## 2. Bundled Ready-to-Install Core Skills (`skills/` — 14 Playbooks)

Every playbook below is included directly in [`skills/`](../skills/) and automatically copied into `.agents/skills/` when you run `node src/cli.mjs init --target <your-repo>`:

| Skill ID | Category | Lead | Primary Trigger / When It Activates | Key Deliverable & Gate |
|---|---|---|---|---|
| [`using-superpowers`](../skills/using-superpowers/SKILL.md) | `core-governance` | Jarvis × Atlas | Every cold start / new task | Reads checkpoint + routes `<= 8` skills before acting |
| [`brainstorming`](../skills/brainstorming/SKILL.md) | `planning` | Jarvis × Atlas | New feature, architecture options, spec | 2–3 trade-off options + crisp acceptance spec |
| [`writing-plans`](../skills/writing-plans/SKILL.md) | `planning` | Atlas | Approved spec ready for breakdown | Snapshot-bound milestones (`M1..Mn`) + verify cmds |
| [`test-driven-development`](../skills/test-driven-development/SKILL.md) | `engineering` | Atlas | Feature implementation or bug fix | Strict RED → GREEN → REFACTOR + harness verify |
| [`systematic-debugging`](../skills/systematic-debugging/SKILL.md) | `engineering` | Atlas | Bug, crash, test failure, stack trace | 4-phase root-cause isolation + regression test |
| [`verification-before-completion`](../skills/verification-before-completion/SKILL.md) | `quality-gate` | Atlas | Before claiming any task complete | Fresh `exitCode === 0` proof; `VERIFIED` vs `UNVERIFIED` |
| [`using-git-worktrees`](../skills/using-git-worktrees/SKILL.md) | `orchestration` | Atlas | Parallel feature branch / safe sandbox | Isolated worktree + dirty/main removal guard |
| [`orca-orchestration`](../skills/orca-orchestration/SKILL.md) | `orchestration` | Jarvis × Atlas | Multi-module parallel build/review | `<= 3` active workers, depth `<= 2`, 1 writer/path, exact-SHA handoff |
| [`requesting-code-review`](../skills/requesting-code-review/SKILL.md) | `quality-gate` | Atlas | Pre-merge or major milestone review | Hybrid Review v2: 100% file coverage + `existingCode` anchors |
| [`jarvis-ui-design`](../skills/jarvis-ui-design/SKILL.md) | `design-and-ui` | Jarvis | Frontend page, dashboard, responsive UI | WCAG AA + desktop/mobile/interaction verification |
| [`jarvis-diagram-design`](../skills/jarvis-diagram-design/SKILL.md) | `design-and-ui` | Jarvis | Architecture map, flowchart, ADR visual | Self-contained `#FAF9F5` editorial SVG, zero overlap |
| [`jarvis-desktop`](../skills/jarvis-desktop/SKILL.md) | `desktop-automation` | Jarvis × Atlas | Windows app GUI automation | API → DOM → UIA-first (`PID+HWND+processStart`) → Native COM |
| [`jarvis-report-writing`](../skills/jarvis-report-writing/SKILL.md) | `writing-and-research` | Jarvis | Technical report, ADR, executive summary | Evidence table + fact/inference split + SVG embed |
| [`agent-security-hardening`](../skills/agent-security-hardening/SKILL.md) | `security` | Atlas | MCP design, untrusted inputs, release | Untrusted-data framing + strict schemas + privacy audit |

---

## 3. Full Production 57-Skill Ecosystem Map (7 Domains)

In the full Jarvis × Atlas production workspace, the 14 core playbooks above sit inside a modular **57-skill taxonomy** organized across 7 domains (with pinned upstream SHA-256 verification and bounded `<= 8` loading per turn):

### Domain 1 — Core Engineering & Code Quality (14 Skills)
- `using-superpowers`, `brainstorming`, `writing-plans`, `executing-plans`, `test-driven-development`, `systematic-debugging`, `verification-before-completion`, `requesting-code-review`, `receiving-code-review`, `finishing-a-development-branch`, `diagnosing-superpowers`, `backend-patterns`, `domain-modeling`, `product-engineering-review`

### Domain 2 — Multi-Agent Orchestration & Isolation (5 Skills)
- `orca-orchestration`, `dispatching-parallel-agents`, `subagent-driven-development`, `using-git-worktrees`, `jarvis-mission`

### Domain 3 — UI/UX, Web & Interactive Media (9 Skills)
- `jarvis-ui-design`, `frontend-design`, `modern-web-guidance`, `jarvis-reference-build`, `jarvis-diagram-design`, `anatomy`, `slide-studio`, `video-studio`, `playwright-cli`

### Domain 4 — Design Systems & Canva Automation (6 Skills)
- `brand-check`, `bulk-create`, `edit-design`, `get-design-feedback`, `implement-feedback`, `resize-for-social-media`

### Domain 5 — Technical Writing, Academic Research & Coaching (7 Skills)
- `jarvis-report-writing`, `jarvis-scientific-research` *(selective loader for 177 local academic/LaTeX K-Dense skills + Tectonic/Vale)*, `humanizer`, `writing-for-agents`, `writing-skills`, `jarvis-socratic-tutor`, `jarvis-marketing`

### Domain 6 — Public Research, Delegation & Daily Operations (7 Skills)
- `jarvis-last30days` *(1–90 day signals across Reddit/HN/GitHub/arXiv)*, `agent-reach`, `jarvis-sherlock`, `jarvis-work-search`, `jarvis-workday`, `jarvis-deepseek` *(bounded public-text subtask delegation)*, `cli-anything`

### Domain 7 — Windows Automation, Security & Lean Code Hygiene (9 Skills)
- `jarvis-desktop`, `agent-security-hardening`, `mcp-dependency-review`, `ponytail`, `ponytail-audit`, `ponytail-debt`, `ponytail-gain`, `ponytail-help`, `ponytail-review`

---

## 4. Authoring Your Own Custom Skill

1. Create a folder under `skills/<your-skill-id>/SKILL.md` (or `.agents/skills/<your-skill-id>/SKILL.md` inside your bootstrapped repo).
2. Add valid YAML frontmatter with explicit `triggers` and `tags`:

```markdown
---
name: api-migration-safety
category: engineering
owner: Atlas
description: Verifies backward compatibility, rollback SQL, and contract tests before executing schema migrations.
triggers: [migration, alter table, schema change, database upgrade]
tags: [database, sql, rollback, safety]
---

# API & Schema Migration Safety

## Workflow
1. Capture pre-migration schema snapshot.
2. Require expand-and-contract dual-read compatibility.
3. Verify rollback script on an isolated fixture database.
```

3. Validate immediately with:

```bash
node src/cli.mjs skills validate
node src/cli.mjs skills route "plan database schema change with safe rollback"
```
