#!/usr/bin/env python3
"""Telemetry, Context Budget & Offline Eval Analyzer for Jarvis x Atlas Agents.

Executes the local Node.js doctor, progressive skill router, and offline eval runner,
then computes estimated prompt-token savings and summarizes pass rates cleanly.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional


def estimate_tokens(byte_count: int) -> int:
    """Approximate LLM token count (~4 UTF-8 bytes per token for English Markdown/code)."""
    return max(0, (byte_count + 3) // 4)


def run_json_command(cmd: List[str], cwd: Path) -> Dict[str, Any]:
    proc = subprocess.run(
        cmd,
        cwd=str(cwd),
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(cmd)}\n{proc.stderr.strip()}")
    return json.loads(proc.stdout)


def analyze_workspace(repo_root: Path, sample_intent: str) -> Dict[str, Any]:
    doctor = run_json_command(["node", "src/cli.mjs", "doctor", "--root", str(repo_root)], repo_root)
    routed = run_json_command(["node", "src/cli.mjs", "skills", "route", sample_intent], repo_root)
    eval_report = run_json_command(["node", "src/eval-runner.mjs"], repo_root)

    budget = routed.get("budget", {})
    total_bytes = int(budget.get("totalCatalogBytes", 0))
    loaded_bytes = int(budget.get("loadedBytes", 0))
    saved_bytes = int(budget.get("savedBytes", 0))

    checkpoint_pillar = next(
        (p for p in doctor.get("pillars", []) if p.get("pillar") == "lean-memory-checkpoint"),
        {},
    )
    cp_size = checkpoint_pillar.get("size") or {}

    return {
        "ok": bool(doctor.get("ok") and eval_report.get("ok")),
        "artifact": "JARVIS_PYTHON_BUDGET_AND_EVAL_SUMMARY",
        "doctorScore": doctor.get("score"),
        "evalSummary": eval_report.get("summary"),
        "hotCheckpoint": {
            "bytes": cp_size.get("bytes", 0),
            "limitBytes": cp_size.get("limitBytes", 8192),
            "estimatedTokens": estimate_tokens(int(cp_size.get("bytes", 0))),
            "withinBudget": bool(cp_size.get("withinBudget", False)),
        },
        "progressiveSkillSavings": {
            "sampleIntent": sample_intent,
            "catalogSkills": routed.get("catalogCount", 0),
            "selectedSkills": routed.get("selectedCount", 0),
            "fullCatalogTokensEst": estimate_tokens(total_bytes),
            "loadedSkillsTokensEst": estimate_tokens(loaded_bytes),
            "savedTokensEst": estimate_tokens(saved_bytes),
            "reductionPct": budget.get("reductionPct", 0.0),
        },
    }


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Analyze Jarvis x Atlas evals and context token budget")
    parser.add_argument(
        "--intent",
        default="debug failing api test and run hybrid code review",
        help="Sample intent used to measure progressive skill routing efficiency",
    )
    args = parser.parse_args(argv)
    repo_root = Path(__file__).resolve().parent.parent
    summary = analyze_workspace(repo_root, args.intent)
    print(json.dumps(summary, indent=2))
    return 0 if summary["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
