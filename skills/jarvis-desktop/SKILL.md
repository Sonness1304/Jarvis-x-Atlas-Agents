---
name: jarvis-desktop
category: desktop-automation
owner: Jarvis x Atlas
description: UIA-first Windows desktop automation protocol enforcing PID+HWND+processStart binding, observe-before-act, Native COM fallback, and anti-replay.
triggers: [windows app, desktop automation, uia, click button, cua, hwnd, gui]
tags: [windows, mcp, uia, desktop, safety]
---

# Jarvis Windows Desktop Automation (UIA-First)

## Purpose
Automate Windows desktop applications reliably and safely by preferring structured APIs and UI Automation trees over fragile blind coordinate clicks.

## Control Hierarchy
1. Native API / CLI (first choice when available)
2. Browser DOM (for web apps in verified user profile)
3. **Windows UIA via `jarvis-windows-mcp`** (bind exact `pid + windowId + processStart`, observe controls before sending input)
4. **Native COM UIAutomationClient fallback** (for Chromium/Electron apps whose controls flatten under managed UIA)
5. Conditional Vision fallback (only when UIA cannot observe or dispatch, never to bypass UIPI/permissions)

## Guardrails
- Verify CUA driver binary SHA-256 integrity before invoking elevated helpers.
- Always read back window state after dispatching input.
- On `OUTCOME_UNKNOWN`, **read back only** (`windows_readback_state`)—never replay an action blindly through another backend.
