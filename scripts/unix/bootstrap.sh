#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "=== Jarvis x Atlas Agents — POSIX Bootstrap & Verification ==="
echo "Node.js : $(node -v)"
echo "Git     : $(git --version)"

echo ""
echo "[1/4] 6-Pillar Doctor"
npm run doctor

echo ""
echo "[2/4] Unit & Integration Tests"
npm test

echo ""
echo "[3/4] Deterministic Offline Eval Suite"
npm run eval

echo ""
echo "[4/4] Pre-Release Privacy & Secret Audit"
npm run audit:privacy

if command -v python3 >/dev/null 2>&1; then
  echo ""
  echo "[Bonus] Python 3 MCP Stdio Handshake Check"
  python3 python/jarvis_mcp_client.py --server github
fi

echo ""
echo "Bootstrap complete. To scaffold into another repo run:"
echo "  node src/cli.mjs init --target ../your-project"
