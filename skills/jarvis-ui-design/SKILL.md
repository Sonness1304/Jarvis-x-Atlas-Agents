---
name: jarvis-ui-design
category: design-and-ui
owner: Jarvis
description: End-to-end UI/UX engineering workflow combining design-system lookup, responsive desktop/mobile verification, accessibility, and visual QA.
triggers: [ui, ux, frontend, dashboard, css, responsive, layout, component, landing page]
tags: [ui, ux, frontend, accessibility, design-system]
---

# Jarvis UI/UX Design Workflow

## Purpose
Deliver cohesive, accessible, production-ready web interfaces verified across desktop, mobile, and interactive states rather than untested static markup.

## Workflow
1. Inspect the existing project design system, tokens, typography, and layout patterns first—preserve working user styles and features.
2. Establish clear visual hierarchy, contrast (WCAG AA), keyboard focus states, and semantic HTML landmarks.
3. Build responsive breakpoints (desktop `>= 1280px`, tablet, mobile `375px-390px`) without horizontal overflow or clipped controls.
4. Verify rendered desktop, mobile, and interactive states (forms, modals, hover/focus, empty/error states) using real browser inspection or Playwright before marking `VERIFIED`.

## Guardrails
- Audit-only UI requests must never mutate live source files.
- Never claim visual verification without actual rendered output inspection; label unrendered checks `UNVERIFIED`.
