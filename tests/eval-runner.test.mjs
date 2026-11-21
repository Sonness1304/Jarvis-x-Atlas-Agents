import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compareReports, runEvalSuites } from "../src/eval-runner.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("eval-runner executes deterministic offline suite and computes passRate=1", () => {
  const report = runEvalSuites(rootDir, { suiteFilter: "read-only-mcp" });
  assert.equal(report.ok, true);
  assert.equal(report.summary.suitesPassed, 1);
  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.passRate, 1);
});

test("compareReports flags passRate regressions accurately", () => {
  const baseline = { suites: [{ id: "s1", ok: true, passRate: 1 }] };
  const degraded = { suites: [{ id: "s1", ok: false, passRate: 0.75 }] };
  const diff = compareReports(degraded, baseline);
  assert.equal(diff.hasRegressions, true);
  assert.equal(diff.regressions[0].suite, "s1");
});
