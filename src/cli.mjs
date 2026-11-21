#!/usr/bin/env node
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SRC_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SRC_DIR, '..');

const COMMAND_MAP = {
  init: path.join(SRC_DIR, 'init-workspace.mjs'),
  doctor: path.join(SRC_DIR, 'doctor.mjs'),
  harness: path.join(SRC_DIR, 'harness.mjs'),
  worktree: path.join(SRC_DIR, 'worktree.mjs'),
  recovery: path.join(SRC_DIR, 'recovery.mjs'),
  skills: path.join(SRC_DIR, 'skills.mjs'),
  context: path.join(SRC_DIR, 'task-context.mjs'),
  review: path.join(SRC_DIR, 'review-engine.mjs'),
  'mcp-read': path.join(SRC_DIR, 'read-mcp.mjs'),
  'mcp-windows': path.join(SRC_DIR, 'windows-mcp-core.mjs'),
  eval: path.join(SRC_DIR, 'eval-runner.mjs'),
  audit: path.join(ROOT_DIR, 'scripts/privacy-audit.mjs')
};

function printMainHelp() {
  console.log(`Jarvis x Atlas Agents — Unified Multi-Agent Engineering OS CLI

Usage:
  node src/cli.mjs <command> [args...]
  jarvis <command> [args...]          (after running: npm link)

Commands:
  init         Bootstrap AGENTS.md, <= 8 KiB checkpoint, MCP config & skills into any repo
  doctor       Run the 6-pillar workspace health & readiness check
  harness      Long-running verify-gated feature ledger & <= 2 KiB cross-session handoff
  worktree     Isolated Git worktree manager for parallel agent lanes
  recovery     Lean memory cold-start checkpoint brief (<= 8 KiB + 20 KiB turn budget)
  skills       Progressive skill registry & intent router (<= 8 entrypoints/turn)
  context      Fail-closed task-context readiness & anti-drift --expected-task gate
  review       Independent Hybrid Review v2 (diff slicing, 100% coverage, existingCode anchors)
  mcp-read     Start zero-dep JSON-RPC 2.0 Read-Only MCP server (github | telegram | discord)
  mcp-windows  Start UIA-first Windows automation JSON-RPC 2.0 MCP server core
  eval         Run deterministic offline eval suites (--save-baseline / --compare)
  audit        Run automated PII, local-path, and secret-pattern scanner

Examples:
  node src/cli.mjs doctor
  node src/cli.mjs skills list
  node src/cli.mjs skills route "design dashboard ui and verify mobile layout"
  node src/cli.mjs context --mode one-shot --intent "fix failing mcp unit test"
  node src/cli.mjs init --target ../my-project
`);
}

const [cmd, ...rest] = process.argv.slice(2);
if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
  printMainHelp();
  process.exit(0);
}

const script = COMMAND_MAP[cmd];
if (!script) {
  console.error(`Unknown command: ${cmd}\nRun "node src/cli.mjs --help" to list available commands.`);
  process.exit(1);
}

try {
  execFileSync(process.execPath, [script, ...rest], { stdio: 'inherit' });
} catch (err) {
  process.exit(typeof err.status === 'number' ? err.status : 1);
}
