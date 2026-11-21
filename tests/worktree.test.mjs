import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  listWorktrees,
  createWorktree,
  getWorktreeStatus,
  removeWorktree
} from '../src/worktree.mjs';

test('jarvis-worktree --help prints Usage and Examples instantly', () => {
  const out = execFileSync(process.execPath, ['src/worktree.mjs', '--help'], {
    encoding: 'utf8'
  });
  assert.match(out, /Usage:/);
  assert.match(out, /Examples:/);
});

test('jarvis-worktree creates, inspects, guards dirty/main removal, and removes secondary worktree cleanly', () => {
  const baseTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-wt-test-'));
  const repoDir = path.join(baseTmp, 'demo-repo');
  const wtRoot = path.join(baseTmp, 'worktrees');
  fs.mkdirSync(repoDir, { recursive: true });
  try {
    execFileSync('git', ['init', '-b', 'main'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Jarvis Test'], { cwd: repoDir, stdio: 'ignore' });
    fs.writeFileSync(path.join(repoDir, 'README.md'), '# Demo\n', 'utf8');
    execFileSync('git', ['add', 'README.md'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'init'], { cwd: repoDir, stdio: 'ignore' });

    // Create secondary worktree
    const created = createWorktree({ repo: repoDir, name: 'lane-alpha', root: wtRoot });
    assert.equal(created.ok, true);
    assert.equal(created.branch, 'codex/lane-alpha');
    assert.ok(fs.existsSync(created.path));

    // List sees 2 worktrees
    const listed = listWorktrees(repoDir);
    assert.equal(listed.count, 2);
    assert.equal(listed.worktrees[0].isMain, true);
    assert.equal(listed.worktrees[1].isMain, false);

    // Refuse removing main repo
    assert.throws(
      () => removeWorktree({ repo: repoDir, worktreePath: repoDir, force: true }),
      /main repository worktree/i
    );

    // Dirty the secondary worktree -> status detects dirty & non-forced remove refuses safely
    fs.writeFileSync(path.join(created.path, 'scratch.txt'), 'wip\n', 'utf8');
    const st = getWorktreeStatus(created.path);
    assert.equal(st.dirty, true);
    assert.equal(st.changedCount, 1);

    const blocked = removeWorktree({ repo: repoDir, worktreePath: created.path, force: false });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.removed, false);
    assert.match(blocked.reason, /uncommitted changes/i);

    // Forced remove succeeds cleanly
    const removed = removeWorktree({ repo: repoDir, worktreePath: created.path, force: true });
    assert.equal(removed.ok, true);
    assert.equal(removed.removed, true);
    assert.equal(listWorktrees(repoDir).count, 1);
  } finally {
    fs.rmSync(baseTmp, { recursive: true, force: true });
  }
});
