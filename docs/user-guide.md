# User Guide — Installing & Operating Jarvis × Atlas Agents

> Complete hands-on guide for developers cloning **Jarvis × Atlas Agents** to run locally, bootstrap into their own repositories, connect custom MCP servers to Codex / OpenCode / Claude Code, and operate every CLI subsystem.

---

## 1. Prerequisites & Installation (Zero External Dependencies)

- **Node.js `>= 20.0.0`** (`node -v`)
- **Git** (`git --version`)
- **Zero `npm install` needed** — every runtime module in `src/` uses only Node.js built-in modules (`node:fs`, `node:path`, `node:crypto`, `node:child_process`, `node:readline`, `node:test`).

```bash
git clone https://github.com/Sonness1304/Jarvis-x-Atlas-Agents.git
cd Jarvis-x-Atlas-Agents

# Optional: expose `jarvis` command globally on your PATH
npm link

# Verify all 6 engineering pillars, 20 unit tests, 6 offline eval suites, and privacy audit
npm run doctor
npm test
npm run eval
npm run audit:privacy
```

---

## 2. Bootstrap Jarvis × Atlas Into Your Own Repository (1 Command)

You do not need to copy files manually. Run `init` pointing at any existing or new project folder:

```bash
node src/cli.mjs init --target ../my-project
```

What this safely scaffolds (skipping any existing file unless `--force` is passed):
- `../my-project/AGENTS.md` — Co-Lead governance contract (Jarvis × Atlas roles, Git hygiene, `VERIFIED`/`UNVERIFIED` evidence rules).
- `../my-project/docs/project-checkpoint.md` — Hot checkpoint starter capped at `<= 8 KiB`.
- `../my-project/.jarvis/mcp-config.example.toml` — Ready-to-paste MCP server config.
- `../my-project/.agents/skills/*` — All **14 core `SKILL.md` playbooks** ready for Codex / OpenCode / Claude Code.

Verify your newly bootstrapped project immediately:

```bash
node src/cli.mjs doctor --root ../my-project
```

---

## 3. Daily Operator Workflow (All 8 CLI Subsystems)

### A. Cold-Start Recovery & Anti-Drift Task Context
At the start of any fresh chat session, load only the compact hot checkpoint (`<= 8 KiB`) and route `<= 8` matching skills:

```bash
# Compact checkpoint brief with SHA-256 provenance and 20 KiB turn budget tracking
node src/cli.mjs recovery brief --root ../my-project

# Fail-closed context check: blocks execution if checkpoint task != expected task
node src/cli.mjs context --root ../my-project \
  --expected-task TASK-001-bootstrap \
  --intent "implement billing endpoint with tdd and code review"

# One-shot exploratory question (never mutates active project state)
node src/cli.mjs context --mode one-shot --intent "draw architecture flowchart svg"
```

### B. Progressive Skill Routing
```bash
# Inspect all installed playbooks
node src/cli.mjs skills list

# Match natural-language intent -> returns <= 8 skills + exact byte reduction %
node src/cli.mjs skills route "windows desktop automation uia click button safely"

# Print full playbook instructions for one skill
node src/cli.mjs skills show systematic-debugging

# Lint YAML frontmatter and trigger definitions
node src/cli.mjs skills validate
```

### C. Long-Running Verify-Gated Feature Harness
Prevent optimistic "fake passes" across multi-session builds:

```bash
node src/cli.mjs harness init --dir ./sandbox --goal "Ship order processing API"
node src/cli.mjs harness add --dir ./sandbox --id F1 --title "Create order endpoint" --verify "node -e \"process.exit(0)\""
node src/cli.mjs harness add --dir ./sandbox --id F2 --title "Payment webhook test" --depends F1 --verify "node -e \"process.exit(1)\""

# Inspect next unblocked task
node src/cli.mjs harness next --dir ./sandbox

# F1 passes because exitCode === 0; F2 stays passes: false because exitCode === 1
node src/cli.mjs harness verify --dir ./sandbox --id F1
node src/cli.mjs harness verify --dir ./sandbox --id F2

# Generate a bounded <= 2048 byte Markdown handoff packet for a fresh chat thread
node src/cli.mjs harness handoff --dir ./sandbox
```

### D. Isolated Git Worktrees for Parallel Lanes
Never pollute your primary branch or overwrite staged work while running experimental/parallel agents:

```bash
node src/cli.mjs worktree list --repo .
node src/cli.mjs worktree create --repo . --name feat-payments
node src/cli.mjs worktree status --path ~/.jarvis/worktrees/<repo>/feat-payments
node src/cli.mjs worktree remove --repo . --path ~/.jarvis/worktrees/<repo>/feat-payments
```
*Safety:* Refuses removing the main repository worktree under all circumstances, and refuses removing dirty secondary worktrees without explicit `--force`.

### E. Independent Hybrid Review v2 (100% Diff Coverage + `existingCode` Anchors)
```bash
# 1. Deterministically slice changed files into bounded review batches
node src/cli.mjs review slice --repo . --base HEAD~1

# 2. Verify a structured review packet (rejects <100% file coverage or hallucinated code anchors)
node src/cli.mjs review verify --repo . --packet review-packet.json
```

Example `review-packet.json`:
```json
{
  "changedFiles": ["src/cli.mjs"],
  "reviewedFiles": ["src/cli.mjs"],
  "findings": [
    {
      "id": "F1",
      "severity": "P2",
      "file": "src/cli.mjs",
      "existingCode": "execFileSync(process.execPath, [script, ...rest], { stdio: 'inherit' });",
      "summary": "Document exit code forwarding behavior in README."
    }
  ]
}
```

### F. Deterministic Offline Evals & Regression Guard
```bash
# Run all 6 offline eval suites (zero LLM API cost)
node src/cli.mjs eval

# Save a passing baseline snapshot (.eval-baseline.json)
node src/cli.mjs eval --save-baseline

# Block CI/commits if any suite's passRate regresses below baseline
node src/cli.mjs eval --compare
```

---

## 4. Connecting Custom MCP Servers to Codex / OpenCode / Claude Code

Copy the relevant blocks from [`templates/mcp-config.toml`](../templates/mcp-config.toml) into your host MCP configuration (for Codex CLI/Desktop: `~/.codex/config.toml`), replacing `<PATH_TO_REPO>` with your absolute clone path:

```toml
[mcp_servers.jarvis_github_public]
command = "node"
args = ["<PATH_TO_REPO>/src/read-mcp.mjs", "github"]

[mcp_servers.jarvis_windows_uia]
command = "node"
args = ["<PATH_TO_REPO>/src/windows-mcp-core.mjs"]
```

### Smoke-Test Both MCP Servers Directly Over `stdio`

```bash
# Read-Only GitHub MCP (JSON-RPC 2.0, protocolVersion 2025-06-18)
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n' | node src/cli.mjs mcp-read github

# Windows UIA-First MCP Core (JSON-RPC 2.0, protocolVersion 2025-06-18)
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list"}\n' | node src/cli.mjs mcp-windows
```

For optional read-only Telegram or Discord modes, supply credentials **only via OS environment variables / Credential Vault**—never commit them into config files:
- Telegram: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
- Discord: `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`

---

## 5. Pre-Release Privacy & Hygiene Gate

Before pushing any fork or derivative repo publicly:

```bash
node src/cli.mjs audit
```

This scans every file in the repository for OS user paths, non-placeholder email addresses, API keys (`sk-`, `ghp_`, `github_pat_`, `AIza`, `xox*`), and local config leaks, exiting non-zero if any finding appears.
