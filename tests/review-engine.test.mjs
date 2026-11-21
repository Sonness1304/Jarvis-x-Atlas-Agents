import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseUnifiedDiff, sliceDiffIntoBatches, verifyReviewPacket } from '../src/review-engine.mjs';

test('review-engine slices multi-file diffs deterministically into bounded batches', () => {
  const sampleDiff = [
    'diff --git a/a.js b/a.js',
    '--- a/a.js',
    '+++ b/a.js',
    '+const a = 1;',
    'diff --git a/b.js b/b.js',
    '--- a/b.js',
    '+++ b/b.js',
    '+const b = 2;',
    'diff --git a/c.js b/c.js',
    '--- a/c.js',
    '+++ b/c.js',
    '+const c = 3;'
  ].join('\n');

  const files = parseUnifiedDiff(sampleDiff);
  assert.equal(files.length, 3);
  const batches = sliceDiffIntoBatches(files, { maxFiles: 2, maxBytes: 10000 });
  assert.equal(batches.length, 2);
  assert.deepEqual(batches[0].files, ['a.js', 'b.js']);
  assert.deepEqual(batches[1].files, ['c.js']);
});

test('review-engine enforces 100% file coverage and real existingCode anchors', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-rev-'));
  try {
    fs.writeFileSync(path.join(tmp, 'app.js'), 'export function sum(a, b) {\n  return a + b;\n}\n', 'utf8');
    fs.writeFileSync(path.join(tmp, 'util.js'), 'export const OK = true;\n', 'utf8');

    // Missing file -> rejected
    const incomplete = verifyReviewPacket({
      changedFiles: ['app.js', 'util.js'],
      reviewedFiles: ['app.js'],
      findings: [],
      root: tmp
    });
    assert.equal(incomplete.ok, false);
    assert.equal(incomplete.gateStatus, 'REJECTED_INVALID_REVIEW');
    assert.deepEqual(incomplete.coverage.missingFiles, ['util.js']);

    // Hallucinated existingCode -> rejected
    const badAnchor = verifyReviewPacket({
      changedFiles: ['app.js', 'util.js'],
      reviewedFiles: ['app.js', 'util.js'],
      findings: [{ id: 'F1', severity: 'P1', file: 'app.js', existingCode: 'return a * b;', summary: 'Wrong line' }],
      root: tmp
    });
    assert.equal(badAnchor.ok, false);
    assert.equal(badAnchor.anchors.anchorErrors[0].reason, 'EXISTING_CODE_ANCHOR_MISMATCH');

    // 100% coverage + real anchor -> passes
    const valid = verifyReviewPacket({
      changedFiles: ['app.js', 'util.js'],
      reviewedFiles: ['app.js', 'util.js'],
      findings: [{ id: 'F1', severity: 'P2', file: 'app.js', existingCode: 'return a + b;', summary: 'Minor style note' }],
      root: tmp
    });
    assert.equal(valid.ok, true);
    assert.equal(valid.gateStatus, 'APPROVED');
    assert.equal(valid.coverage.coveragePct, 100);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
