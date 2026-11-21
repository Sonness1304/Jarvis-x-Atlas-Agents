import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runDoctor } from '../src/doctor.mjs';
import { initWorkspace } from '../src/init-workspace.mjs';

test('doctor passes all 6 pillars on the repository itself', () => {
  const report = runDoctor();
  assert.equal(report.ok, true);
  assert.equal(report.score, '6/6');
});

test('init-workspace scaffolds starter files and skills safely without clobbering existing files', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-init-'));
  try {
    const first = initWorkspace({ targetDir: tmp });
    assert.equal(first.ok, true);
    assert.ok(first.written >= 17);
    assert.ok(fs.existsSync(path.join(tmp, 'AGENTS.md')));
    assert.ok(fs.existsSync(path.join(tmp, 'docs/project-checkpoint.md')));
    assert.ok(fs.existsSync(path.join(tmp, '.agents/skills/test-driven-development/SKILL.md')));

    // Second run skips existing files instead of overwriting user customizations
    const second = initWorkspace({ targetDir: tmp });
    assert.equal(second.written, 0);
    assert.ok(second.skipped >= 17);

    // Doctor passes on the newly scaffolded project too
    const doc = runDoctor({ root: tmp });
    assert.equal(doc.ok, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('unified cli prints help and executes skills list cleanly', () => {
  const help = execFileSync(process.execPath, ['src/cli.mjs', '--help'], { encoding: 'utf8' });
  assert.match(help, /Jarvis x Atlas Agents/);
  const listJson = execFileSync(process.execPath, ['src/cli.mjs', 'skills', 'list'], { encoding: 'utf8' });
  const parsed = JSON.parse(listJson);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.count >= 14);
});
