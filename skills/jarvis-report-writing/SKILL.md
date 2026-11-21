---
name: jarvis-report-writing
category: writing-and-research
owner: Jarvis
description: Produces evidence-backed technical reports, ADRs, incident analyses, and executive summaries separating observed facts from inference.
triggers: [report, adr, analysis, summary, documentation, postmortem, technical memo]
tags: [writing, documentation, adr, report, evidence]
---

# Jarvis Technical Report Writing

## Purpose
Structure substantive analyses, architecture decision records (ADRs), and project reviews so readers can verify every claim quickly.

## Structure
1. **Executive Summary:** 3-5 bullet bottom-line findings backed by observed metrics.
2. **Evidence Table:** Exact commands, file paths, revisions, and observed outputs (`VERIFIED` vs `UNVERIFIED`).
3. **Architecture / Trade-off Analysis:** Embed editorial SVG diagrams when illustrating multi-component systems or lifecycles.
4. **Actionable Next Steps:** Prioritized, scoped recommendations with clear owners and acceptance checks.

## Guardrails
- Never fabricate metrics, benchmarks, or unobserved token savings.
- Keep casual short answers concise; do not force full report formatting onto simple questions.
