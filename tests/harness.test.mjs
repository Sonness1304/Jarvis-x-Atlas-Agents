import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  initHarness,
  addFeature,
  getNextFeature,
  getHarnessBrief,
  verifyFeature,
  recordProgress,
  buildHandoffMarkdown
} from '../src/harness.mjs';

test('jarvis-harness --help prints Usage and Examples instantly', () => {
  const out = execFileSync(process.execPath, ['src/harness.mjs', '--help'], {
    encoding: 'utf8'
  });
  assert.match(out, /Usage:/);
  assert.match(out, /Examples:/);
});

test('jarvis-harness enforces verification-gated passes, dependencies, and bounded handoff', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-harness-test-'));
  try {
    // 1. Init strips unverified passes=true without receipt
    const initRes = initHarness({
      dir: tmpDir,
      goal: 'Build resilient agent workflow',
      features: [
        {
          id: 'feat-1',
          title: 'Core check',
          acceptance: ['Exit code 0'],
          verifyCmd: `"${process.execPath}" -e "process.exit(0)"`,
          passes: true
        }
      ]
    });
    assert.equal(initRes.ok, true);
    assert.equal(initRes.featureCount, 1);

    // Refuses overwrite without --force
    assert.throws(() => initHarness({ dir: tmpDir, goal: 'Overwrite' }), /already exists/i);

    // 2. Add dependent feature
    addFeature({
      dir: tmpDir,
      id: 'feat-2',
      title: 'Dependent check',
      dependsOn: ['feat-1'],
      acceptance: ['Must fail first then pass'],
      verifyCmd: `"${process.execPath}" -e "process.exit(1)"`
    });

    // Reject duplicate ID
    assert.throws(
      () => addFeature({ dir: tmpDir, id: 'feat-2', title: 'Dup' }),
      /already exists/i
    );

    // Next feature must be feat-1 (since feat-1 had passes stripped and feat-2 depends on feat-1)
    let next = getNextFeature(tmpDir);
    assert.equal(next.nextFeature.id, 'feat-1');

    // 3. Verify feat-1 -> passes=true
    const v1 = verifyFeature({ dir: tmpDir, id: 'feat-1' });
    assert.equal(v1.ok, true);
    assert.equal(v1.passes, true);
    assert.equal(v1.receipt.exitCode, 0);

    // Next feature is now feat-2
    next = getNextFeature(tmpDir);
    assert.equal(next.nextFeature.id, 'feat-2');

    // 4. Verify feat-2 fails -> stays passes=false with remediation
    const v2Fail = verifyFeature({ dir: tmpDir, id: 'feat-2' });
    assert.equal(v2Fail.ok, false);
    assert.equal(v2Fail.passes, false);
    assert.equal(v2Fail.receipt.exitCode, 1);
    assert.match(v2Fail.remediation, /harness\.mjs verify/);

    // Record manual note
    const rec = recordProgress({
      dir: tmpDir,
      featureId: 'feat-2',
      status: 'info',
      summary: 'Prepared fix for feat-2'
    });
    assert.equal(rec.ok, true);

    // Verify feat-2 with passing override cmd
    const v2Pass = verifyFeature({
      dir: tmpDir,
      id: 'feat-2',
      cmd: `"${process.execPath}" -e "console.log('ok')"`
    });
    assert.equal(v2Pass.ok, true);
    assert.equal(v2Pass.passes, true);

    // 5. Brief & bounded handoff
    const brief = getHarnessBrief(tmpDir);
    assert.equal(brief.summary.total, 2);
    assert.equal(brief.summary.passed, 2);
    assert.equal(brief.summary.passRate, 1);
    assert.equal(brief.nextFeature, null);

    const handoff = buildHandoffMarkdown(tmpDir, 2048);
    assert.equal(handoff.ok, true);
    assert.ok(handoff.bytes <= 2048);
    assert.match(handoff.markdown, /ALL_FEATURES_PASSED/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
