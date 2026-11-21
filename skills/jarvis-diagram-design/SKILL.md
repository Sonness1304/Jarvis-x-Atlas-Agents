---
name: jarvis-diagram-design
category: design-and-ui
owner: Jarvis
description: Builds publication-grade, self-contained editorial SVG architecture diagrams and execution flowcharts with strict contrast and zero overlap.
triggers: [diagram, flowchart, architecture svg, visual map, system diagram, mermaid]
tags: [svg, diagram, flowchart, architecture, visual]
---

# Jarvis Editorial SVG Diagram Design

## Purpose
Replace cramped, inconsistent raw Mermaid blocks in docs and ADRs with crisp, self-contained, Light/Dark-mode-safe editorial SVG diagrams.

## Design Standards
- **Solid Canvas:** Use an explicit opaque background (e.g., `#FAF9F5`) so labels remain legible on both GitHub Light and Dark themes.
- **Explicit Geometry:** Compute deterministic box widths, padding, arrow endpoints, and line heights so zero text clips or overlaps edges.
- **Semantic Hierarchy:** Group architecture into clear horizontal tiers, color-coded by subsystem role (Governance, MCP, Execution Lanes, Quality Gates, Safety Rail).
- **Visual QA:** Render SVG to PNG and visually inspect before committing.
