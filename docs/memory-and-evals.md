# Lean Memory Tiering, Independent Hybrid Review & Deterministic Evals

> Long-lived AI coding workflows fail silently when memory grows unbounded, reviews rubber-stamp diffs, or prompt/tooling refactors introduce undetected regressions. Jarvis × Atlas treats **context budget**, **review coverage**, and **offline evals** as first-class engineering contracts.

---

## 1. Lean Memory Tiering & Token Efficiency

### The Problem With Naive Agent Memory
Loading full changelogs, historical session transcripts, and complete skill catalogs on every turn inflates prompt tokens, degrades instruction adherence after compaction, and introduces stale assumptions from older tasks.

### The Jarvis × Atlas Tiered Design

| Tier | Artifact | Budget / Rule | Loaded When |
|---|---|---|---|
| **Tier 0 — Governance** | Global + Repo `AGENTS.md` | English-normalized, `0` duplicated shared blocks (`~15.8 KB` combined in production) | Session boot |
| **Tier 1 — Hot Checkpoint** | `docs/project-checkpoint.md` | Hard budget **`<= 8 KiB`** (`7.8 KiB` live) | Every cold start via `recovery brief` |
| **Tier 2 — Active Plan / Handoff** | Selected `plan.md` + `harness handoff` | Pointer chosen by checkpoint (never by `mtime`); handoff capped at **`<= 2 KiB`** | Only for active task |
| **Tier 3 — Progressive Skills** | Modular `SKILL.md` entrypoints | Bounded to **`<= 8` entrypoints/turn** based on task intent | On demand per task |
| **Tier 4 — Cold Archives** | Historical logs, completed plans, raw artifacts | Zero auto-load; queried only by explicit ID or search | Explicit drill-down only |

### Provenance & Fail-Closed Context Readiness
- **SHA-256 Source Provenance:** Checkpoints and vendored upstream skills track exact hashes so drift or accidental edits are surfaced immediately.
- **Anti-Drift Task Selector:** When resuming an existing task, `--expected-task <TASK_ID>` must match the checkpoint state; on mismatch or budget overflow, the readiness check **fails closed** instead of guessing.
- **One-Shot Isolation:** Ad-hoc questions or quick experiments never overwrite the active project checkpoint.

---

## 2. Independent Hybrid Review v2

Early multi-agent setups often rely on either self-review (high confirmation bias) or a single external review gateway (brittle when unavailable or rate-limited). **Independent Hybrid Review v2** removes external gateway lock-in while enforcing strict review completeness:

1. **Deterministic Diff Slicing & Batching**
   - Splits changed files into bounded review batches so large refactors never truncate silently past context limits.
2. **100% Changed-File Coverage Gate**
   - Every file in the target diff must be accounted for in the review manifest before a review pass can be accepted.
3. **`existingCode` Line Anchoring**
   - Review findings must quote exact existing lines from the inspected diff, eliminating hallucinated file paths, stale line numbers, or generic boilerplate critique.
4. **Severity & Actionability Triage**
   - Separates blocking correctness/security defects from non-blocking suggestions, and re-runs verification after fixes before concluding.

---

## 3. Deterministic Offline Evaluation Framework

Included directly in this showcase repository at [`src/eval-runner.mjs`](../src/eval-runner.mjs), the eval runner executes deterministic suites via Node's built-in test runner (`node --test`), parses TAP results, computes pass rates, and blocks regressions against a saved baseline—with **zero LLM API cost** and **100% repeatability**.

### Production Workspace Eval Architecture (5 Suites — `157/157` PASS)

In the full Jarvis × Atlas workspace, the offline eval harness validates five core engineering pillars in ~33 seconds:

| Suite | What It Verifies |
|---|---|
| **1. Policy & Setup Integrity** | `AGENTS.md` structure, link integrity, no stale hooks, English-normalized contract invariants |
| **2. Recovery & Context Readiness** | Hot checkpoint budget (`<= 8 KiB`), anti-drift `--expected-task` mismatch blocking, one-shot non-mutation |
| **3. Harness & Worktree Safety** | Verify-gated `passes: true` enforcement, `<= 2 KiB` handoff cap, main-worktree & dirty-tree removal blocks |
| **4. MCP & Protocol Contracts** | JSON-RPC 2.0 `2025-06-18` framing, strict parameter rejection, read-only hints, redirect blocking, untrusted-data framing |
| **5. Gateway & Multi-Provider Sync** | `base_instructions` catalog sync (`33/33`), sealed gateway manifest integrity, multi-`developer` message append in Responses translator |

### Running the Showcase Eval Runner Locally

```bash
# Run all deterministic suites in this repo
npm run eval

# Save a baseline snapshot
node src/eval-runner.mjs --save-baseline

# Compare current run against saved baseline (exits non-zero on pass-rate regression)
node src/eval-runner.mjs --compare
```

### Continuous Hygiene: Doctor CLI & Repo Audit
- **6-Pillar Doctor CLI:** Single-command diagnostic verifying Git cleanliness, checkpoint size, skill entrypoint health, catalog sync (`unsyncedBaseInstructions: 0`), sealed gateway manifest integrity, and MCP readiness.
- **Inventory-Aware Repo Audit (`94/100`):** Classifies workspace scripts by lifecycle role (runtime CLI, library, test, migration, archive) so dead code and undocumented sprawl are caught early without accidentally deleting rollback backups or operational tools.
