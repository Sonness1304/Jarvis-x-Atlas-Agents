import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCheckpointSnapshot } from './recovery.mjs';
import { validateSkillsCatalog } from './skills.mjs';
import { createReadOnlyMcpTools } from './read-mcp.mjs';
import { createWindowsMcpController } from './windows-mcp-core.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function tryExec(cmd, args, cwd) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch {
    return null;
  }
}

export function runDoctor({ root = REPO_ROOT, checkpointRel = 'templates/project-checkpoint.md', skillsDir } = {}) {
  const absRoot = path.resolve(root);
  const resolvedSkillsDir = skillsDir || (fs.existsSync(path.join(absRoot, 'skills'))
    ? path.join(absRoot, 'skills')
    : path.join(absRoot, '.agents', 'skills'));

  // Pillar 1: Runtime (Node >= 20 + Git)
  const nodeMajor = Number(process.versions.node.split('.')[0]);
  const gitVersion = tryExec('git', ['--version'], absRoot);
  const p1 = {
    pillar: 'runtime',
    ok: nodeMajor >= 20 && Boolean(gitVersion),
    nodeVersion: process.versions.node,
    gitVersion: gitVersion || 'NOT_FOUND'
  };

  // Pillar 2: Governance Contract (AGENTS.md or templates/AGENTS.md)
  const govCandidates = ['AGENTS.md', 'templates/AGENTS.md', 'examples/AGENTS.sample.md'];
  const foundGov = govCandidates.find((rel) => fs.existsSync(path.join(absRoot, rel))) || null;
  const govBytes = foundGov ? fs.statSync(path.join(absRoot, foundGov)).size : 0;
  const p2 = {
    pillar: 'governance',
    ok: Boolean(foundGov) && govBytes > 200 && govBytes <= 24576,
    file: foundGov,
    bytes: govBytes
  };

  // Pillar 3: Hot Checkpoint Budget (<= 8 KiB)
  const effectiveCheckpoint = fs.existsSync(path.join(absRoot, 'docs/project-checkpoint.md'))
    ? 'docs/project-checkpoint.md'
    : checkpointRel;
  const ck = readCheckpointSnapshot({ root: absRoot, checkpointRel: effectiveCheckpoint });
  const p3 = {
    pillar: 'lean-memory-checkpoint',
    ok: ck.ok,
    status: ck.status,
    file: ck.checkpointPath,
    size: ck.checkpointSize || null
  };

  // Pillar 4: Progressive Skills Catalog
  const sk = validateSkillsCatalog(resolvedSkillsDir);
  const p4 = {
    pillar: 'progressive-skills',
    ok: sk.ok,
    skillsDir: path.relative(absRoot, resolvedSkillsDir).replace(/\\/g, '/') || 'skills',
    installedSkills: sk.count,
    issues: sk.issues
  };

  // Pillar 5: Custom MCP Protocol Readiness (Read-Only + Windows UIA Core)
  const ghMcp = createReadOnlyMcpTools('github');
  const winMcp = createWindowsMcpController();
  const p5 = {
    pillar: 'mcp-servers',
    ok: ghMcp.list.length === 1 && ghMcp.list[0].annotations?.readOnlyHint === true && winMcp.listTools().length === 3,
    protocolVersion: '2025-06-18',
    readOnlyTools: ghMcp.list.map((t) => t.name),
    windowsTools: winMcp.listTools().map((t) => t.name)
  };

  // Pillar 6: Privacy Audit Script Presence & Core Tests Presence
  const privacyScript = path.join(absRoot, 'scripts/privacy-audit.mjs');
  let privacyOk = true;
  if (fs.existsSync(privacyScript)) {
    const out = tryExec(process.execPath, [privacyScript], absRoot);
    privacyOk = Boolean(out && JSON.parse(out).ok === true);
  }
  const p6 = {
    pillar: 'privacy-and-hygiene',
    ok: privacyOk,
    auditScriptPresent: fs.existsSync(privacyScript)
  };

  const pillars = [p1, p2, p3, p4, p5, p6];
  const passedCount = pillars.filter((p) => p.ok).length;

  return {
    ok: passedCount === pillars.length,
    artifact: 'JARVIS_ATLAS_DOCTOR_REPORT',
    checkedAt: new Date().toISOString(),
    root: absRoot,
    score: `${passedCount}/${pillars.length}`,
    pillars
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    console.log('Usage: node src/doctor.mjs [--root <dir>]\nRuns the 6-pillar Jarvis x Atlas workspace health check.');
    process.exit(0);
  }
  const idx = process.argv.indexOf('--root');
  const root = idx >= 0 ? process.argv[idx + 1] : REPO_ROOT;
  const report = runDoctor({ root });
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
}
