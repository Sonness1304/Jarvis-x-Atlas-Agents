import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const DEFAULT_SUITES = [
  { id: "harness-lifecycle", description: "Verify-gated feature tracking and <= 2 KiB handoff generation.", files: ["tests/harness.test.mjs"] },
  { id: "worktree-isolation", description: "Isolated Git worktree creation and dirty-tree safety guards.", files: ["tests/worktree.test.mjs"] },
  { id: "read-only-mcp", description: "JSON-RPC 2.0 Read-Only MCP protocol, schema guards, and untrusted-data framing.", files: ["tests/read-mcp.test.mjs"] }
];

function stripNodeTestEnv(env) {
  const next = { ...env };
  delete next.NODE_TEST_CONTEXT;
  return next;
}

export function parseTapCounts(output) {
  const get = (key) => {
    const m = output.match(new RegExp(`^# ${key}\\s+(\\d+)`, "m"));
    return m ? Number(m[1]) : 0;
  };
  return {
    tests: get("tests"),
    pass: get("pass"),
    fail: get("fail"),
    skipped: get("skipped")
  };
}

export function runEvalSuites(rootDir, { suiteFilter = null, suites = DEFAULT_SUITES } = {}) {
  const started = Date.now();
  const selected = suiteFilter ? suites.filter(s => s.id === suiteFilter) : suites;
  if (selected.length === 0) throw new Error(`Unknown suite: ${suiteFilter}`);

  const results = [];
  for (const suite of selected) {
    const t0 = Date.now();
    const res = spawnSync(process.execPath, ["--test", "--test-reporter=tap", ...suite.files], {
      cwd: rootDir,
      encoding: "utf8",
      env: stripNodeTestEnv(process.env)
    });
    const counts = parseTapCounts(String(res.stdout || ""));
    const ok = res.status === 0 && counts.fail === 0 && counts.tests > 0;
    results.push({
      id: suite.id,
      description: suite.description,
      ok,
      exitCode: res.status ?? 1,
      elapsedMs: Date.now() - t0,
      ...counts,
      passRate: counts.tests > 0 ? Number((counts.pass / counts.tests).toFixed(4)) : 0
    });
  }

  const totalTests = results.reduce((a, s) => a + s.tests, 0);
  const totalPass = results.reduce((a, s) => a + s.pass, 0);
  const totalFail = results.reduce((a, s) => a + s.fail, 0);
  return {
    schemaVersion: 1,
    artifact: "JARVIS_ATLAS_EVAL_REPORT",
    ok: results.every(s => s.ok),
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - started,
    summary: {
      suitesTotal: results.length,
      suitesPassed: results.filter(s => s.ok).length,
      tests: totalTests,
      pass: totalPass,
      fail: totalFail,
      passRate: totalTests > 0 ? Number((totalPass / totalTests).toFixed(4)) : 0
    },
    suites: results
  };
}

export function compareReports(current, baseline) {
  const baseById = new Map((baseline.suites || []).map(s => [s.id, s]));
  const regressions = [];
  for (const s of current.suites || []) {
    const prev = baseById.get(s.id);
    if (!prev) continue;
    if (s.passRate < prev.passRate || (prev.ok && !s.ok)) {
      regressions.push({ suite: s.id, baselinePassRate: prev.passRate, currentPassRate: s.passRate });
    }
  }
  return { hasRegressions: regressions.length > 0, regressions };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log([
      "Usage: node src/eval-runner.mjs [--suite <id>] [--save-baseline] [--compare]",
      "",
      "Examples:",
      "  node src/eval-runner.mjs",
      "  node src/eval-runner.mjs --save-baseline",
      "  node src/eval-runner.mjs --compare"
    ].join("\n"));
    process.exit(0);
  }
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const suiteIdx = args.indexOf("--suite");
  const suiteFilter = suiteIdx !== -1 ? args[suiteIdx + 1] : null;
  const baselinePath = path.join(rootDir, ".eval-baseline.json");
  const report = runEvalSuites(rootDir, { suiteFilter });
  if (args.includes("--save-baseline")) {
    fs.writeFileSync(baselinePath, JSON.stringify(report, null, 2) + "\n", "utf8");
    report.baselineSaved = baselinePath;
  }
  if (args.includes("--compare")) {
    if (!fs.existsSync(baselinePath)) throw new Error("No baseline found. Run with --save-baseline first.");
    const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
    report.comparison = compareReports(report, baseline);
    if (report.comparison.hasRegressions) report.ok = false;
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
