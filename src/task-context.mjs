import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCheckpointSnapshot } from './recovery.mjs';
import { routeSkillsForIntent, MAX_SKILLS_PER_TURN } from './skills.mjs';

export function checkTaskContext({
  root = process.cwd(),
  checkpointRel = 'docs/project-checkpoint.md',
  skillsDir,
  host = 'codex',
  mode = 'resume',
  expectedTask = null,
  intent = '',
  limit = MAX_SKILLS_PER_TURN
} = {}) {
  const validHosts = new Set(['codex', 'opencode', 'claude', 'cursor']);
  if (!validHosts.has(host)) {
    return {
      ok: false,
      status: 'INVALID_HOST',
      host,
      error: `Unsupported host "${host}". Allowed: ${[...validHosts].join(', ')}`
    };
  }

  const validModes = new Set(['resume', 'one-shot']);
  if (!validModes.has(mode)) {
    return {
      ok: false,
      status: 'INVALID_MODE',
      mode,
      error: `Unsupported mode "${mode}". Allowed: resume, one-shot`
    };
  }

  const skillBundle = routeSkillsForIntent(intent, { skillsDir, limit });
  if (mode === 'one-shot') {
    return {
      ok: true,
      status: 'READY_STATIC_ONESHOT',
      runtimeStatus: 'UNVERIFIED',
      host,
      mode,
      stateMutated: false,
      skills: skillBundle
    };
  }

  const checkpoint = readCheckpointSnapshot({ root, checkpointRel });
  if (!checkpoint.ok) {
    return {
      ok: false,
      status: checkpoint.status === 'BUDGET_EXCEEDED' ? 'FAIL_CLOSED_BUDGET' : 'FAIL_CLOSED_MISSING_CHECKPOINT',
      runtimeStatus: 'UNVERIFIED',
      host,
      mode,
      stateMutated: false,
      checkpoint: {
        path: checkpoint.checkpointPath,
        size: checkpoint.checkpointSize || null,
        error: checkpoint.error || 'Checkpoint exceeded <= 8 KiB hot budget'
      },
      skills: skillBundle
    };
  }

  const actualTask = checkpoint.selector?.activeTask || null;
  if (expectedTask && actualTask && expectedTask !== actualTask) {
    return {
      ok: false,
      status: 'FAIL_CLOSED_TASK_MISMATCH',
      runtimeStatus: 'UNVERIFIED',
      host,
      mode,
      stateMutated: false,
      expectedTask,
      actualTask,
      error: `Anti-drift gate blocked execution: expected "${expectedTask}" but checkpoint points to "${actualTask}"`
    };
  }

  return {
    ok: true,
    status: 'READY_STATIC',
    runtimeStatus: 'UNVERIFIED',
    host,
    mode,
    stateMutated: false,
    selector: checkpoint.selector,
    checkpoint: {
      path: checkpoint.checkpointPath,
      sourceHash: checkpoint.sourceHash,
      size: checkpoint.checkpointSize
    },
    git: checkpoint.git,
    skills: skillBundle
  };
}

export function printHelp() {
  console.log(`Usage: node src/task-context.mjs [options]

Fail-Closed Task Context & Progressive Skill Readiness Gate.
Separates resume vs one-shot mode, enforces <= 8 KiB hot checkpoint, and blocks task-ID drift.

Options:
  --root <dir>             Repository root (default: current working directory)
  --checkpoint <path>      Checkpoint relative path (default: docs/project-checkpoint.md)
  --skills-dir <path>      Skills directory (default: ./skills)
  --host <host>            codex | opencode | claude | cursor (default: codex)
  --mode <mode>            resume | one-shot (default: resume)
  --expected-task <id>     Fail-closed if active checkpoint task differs
  --intent "<text>"        Natural-language intent for progressive skill selection (<= 8)
  --limit <1..8>           Max skills to load (default: 8)
  --help, -h               Show help text
`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--checkpoint') out.checkpointRel = argv[++i];
    else if (a === '--skills-dir') out.skillsDir = argv[++i];
    else if (a === '--host') out.host = argv[++i];
    else if (a === '--mode') out.mode = argv[++i];
    else if (a === '--expected-task') out.expectedTask = argv[++i];
    else if (a === '--intent') out.intent = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }
  const res = checkTaskContext(args);
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.ok ? 0 : 1);
}
