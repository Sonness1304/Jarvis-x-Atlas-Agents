import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRecoveryController, readCheckpointSnapshot, HOT_CHECKPOINT_BUDGET_BYTES } from '../src/recovery.mjs';
import { routeSkillsForIntent, validateSkillsCatalog, MAX_SKILLS_PER_TURN } from '../src/skills.mjs';
import { checkTaskContext } from '../src/task-context.mjs';

test('recovery enforces <= 8 KiB hot checkpoint budget and deduplicates within a turn', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-rec-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    fs.writeFileSync(
      path.join(tmp, 'docs/project-checkpoint.md'),
      '# Checkpoint\n- **Active Task**: `TASK-42`\n- **Active Plan**: `docs/plan.md`\n\n## Next Steps\n1. Run tests\n',
      'utf8'
    );
    const ctrl = createRecoveryController({ root: tmp });
    const first = ctrl.brief();
    assert.equal(first.ok, true);
    assert.equal(first.selector.activeTask, 'TASK-42');
    assert.equal(first.provenance.deliveredEarlierInTurn, false);
    assert.ok(first.checkpointSize.bytes <= HOT_CHECKPOINT_BUDGET_BYTES);

    const second = ctrl.brief();
    assert.equal(second.provenance.deliveredEarlierInTurn, true);

    // Oversized checkpoint (> 8 KiB) fails closed
    fs.writeFileSync(path.join(tmp, 'docs/project-checkpoint.md'), 'x'.repeat(HOT_CHECKPOINT_BUDGET_BYTES + 100), 'utf8');
    const oversized = readCheckpointSnapshot({ root: tmp });
    assert.equal(oversized.ok, false);
    assert.equal(oversized.status, 'BUDGET_EXCEEDED');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('progressive skills catalog validates all installed skills and caps intent routing at <= 8', () => {
  const validation = validateSkillsCatalog();
  assert.equal(validation.ok, true);
  assert.ok(validation.count >= 14);
  assert.deepEqual(validation.issues, []);

  const routed = routeSkillsForIntent('debug failing unit test and run code review with git worktree', { limit: 50 });
  assert.equal(routed.ok, true);
  assert.ok(routed.selectedCount >= 2);
  assert.ok(routed.selectedCount <= MAX_SKILLS_PER_TURN);
  assert.ok(routed.budget.reductionPct > 0);
});

test('task-context fails closed on --expected-task drift and isolates one-shot mode', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-ctx-'));
  try {
    fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'docs/project-checkpoint.md'), '# CP\n- **Active Task**: `TASK-REAL`\n', 'utf8');

    const okRes = checkTaskContext({ root: tmp, expectedTask: 'TASK-REAL', intent: 'write unit test' });
    assert.equal(okRes.ok, true);
    assert.equal(okRes.status, 'READY_STATIC');

    const drift = checkTaskContext({ root: tmp, expectedTask: 'TASK-STALE', intent: 'write unit test' });
    assert.equal(drift.ok, false);
    assert.equal(drift.status, 'FAIL_CLOSED_TASK_MISMATCH');

    const oneShot = checkTaskContext({ root: tmp, mode: 'one-shot', intent: 'design svg flowchart' });
    assert.equal(oneShot.ok, true);
    assert.equal(oneShot.status, 'READY_STATIC_ONESHOT');
    assert.equal(oneShot.stateMutated, false);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
