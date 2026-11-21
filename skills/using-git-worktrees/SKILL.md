---
name: using-git-worktrees
category: orchestration
owner: Atlas
description: Isolates feature branches and parallel agent lanes in dedicated Git worktrees without touching the primary working tree or user staging.
triggers: [worktree, isolate branch, parallel development, sandbox branch, clean checkout]
tags: [git, worktree, isolation, safety]
---

# Using Git Worktrees

## Purpose
Enable clean, conflict-free feature builds and parallel agent testing while keeping the user main checkout and staged changes completely untouched.

## Commands
- Inspect worktrees: `node src/cli.mjs worktree list --repo .`
- Create isolated lane: `node src/cli.mjs worktree create --repo . --name <slug>`
- Check lane state: `node src/cli.mjs worktree status --path <worktree-path>`
- Clean up lane safely: `node src/cli.mjs worktree remove --repo . --path <worktree-path>`

## Guardrails
- Hard-refuse removing the main repository worktree.
- Refuse removing a dirty secondary worktree unless explicitly confirmed with `--force`.
- Never run `git reset --hard`, `git clean -fd`, or force-push inside shared checkouts.
