#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "[CI] Step 1: Doctor 6/6"
npm run doctor

echo "[CI] Step 2: Skill Frontmatter Validation"
npm run skills:validate

echo "[CI] Step 3: Full Node Test Suite"
npm test

echo "[CI] Step 4: Deterministic Offline Evals"
npm run eval

echo "[CI] Step 5: Privacy & Secret Hygiene Gate"
npm run audit:privacy

if command -v python3 >/dev/null 2>&1; then
  echo "[CI] Step 6: Python MCP Client Smoke"
  python3 python/jarvis_mcp_client.py --server github
  python3 python/jarvis_mcp_client.py --server windows
fi

echo "[CI] ALL QUALITY GATES PASSED."
