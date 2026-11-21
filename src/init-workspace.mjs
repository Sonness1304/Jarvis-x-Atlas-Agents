import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function copyFileSafe(src, dest, { force = false } = {}) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && !force) {
    return { dest, status: 'SKIPPED_EXISTS' };
  }
  fs.copyFileSync(src, dest);
  return { dest, status: 'WRITTEN' };
}

function copyDirSafe(srcDir, destDir, { force = false } = {}) {
  const results = [];
  if (!fs.existsSync(srcDir)) return results;
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const src = path.join(srcDir, entry.name);
    const dest = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...copyDirSafe(src, dest, { force }));
    } else {
      results.push(copyFileSafe(src, dest, { force }));
    }
  }
  return results;
}

export function initWorkspace({ targetDir, force = false, withSkills = true } = {}) {
  if (!targetDir) throw new Error('Missing required --target <directory>');
  const absTarget = path.resolve(targetDir);
  fs.mkdirSync(absTarget, { recursive: true });

  const operations = [];
  operations.push(copyFileSafe(
    path.join(PACKAGE_ROOT, 'templates/AGENTS.md'),
    path.join(absTarget, 'AGENTS.md'),
    { force }
  ));
  operations.push(copyFileSafe(
    path.join(PACKAGE_ROOT, 'templates/project-checkpoint.md'),
    path.join(absTarget, 'docs/project-checkpoint.md'),
    { force }
  ));
  operations.push(copyFileSafe(
    path.join(PACKAGE_ROOT, 'templates/mcp-config.toml'),
    path.join(absTarget, '.jarvis/mcp-config.example.toml'),
    { force }
  ));

  if (withSkills) {
    operations.push(...copyDirSafe(
      path.join(PACKAGE_ROOT, 'skills'),
      path.join(absTarget, '.agents/skills'),
      { force }
    ));
  }

  const written = operations.filter((o) => o.status === 'WRITTEN').length;
  const skipped = operations.filter((o) => o.status === 'SKIPPED_EXISTS').length;

  return {
    ok: true,
    targetDir: absTarget,
    written,
    skipped,
    nextSteps: [
      `Review ${path.join(absTarget, 'AGENTS.md')} and customize project-specific commands.`,
      `Check readiness: node src/cli.mjs doctor --root "${absTarget}"`,
      `Route skills for a task: node src/cli.mjs skills route "debug failing api test" --dir "${path.join(absTarget, '.agents/skills')}"`
    ]
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    console.log(`Usage: node src/init-workspace.mjs --target <dir> [--force] [--no-skills]

Bootstraps Jarvis x Atlas Agents (AGENTS.md, <= 8 KiB checkpoint, MCP config template, and .agents/skills/)
into any target repository without overwriting existing files unless --force is passed.
`);
    process.exit(0);
  }
  const tIdx = args.indexOf('--target');
  const targetDir = tIdx >= 0 ? args[tIdx + 1] : null;
  const force = args.includes('--force');
  const withSkills = !args.includes('--no-skills');
  const res = initWorkspace({ targetDir, force, withSkills });
  console.log(JSON.stringify(res, null, 2));
}
