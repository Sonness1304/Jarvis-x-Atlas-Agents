import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const HOT_CHECKPOINT_BUDGET_BYTES = 8192;
export const TURN_PAYLOAD_LIMIT_BYTES = 20480;
export const TURN_OVERHEAD_RESERVE_BYTES = 4096;

export function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function tryGit(args, cwd) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {
    return null;
  }
}

export function parseCheckpointMarkdown(content) {
  const sections = {};
  const meta = {};
  let current = 'header';
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      current = heading[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      sections[current] = [];
      continue;
    }
    const kv = line.match(/^-\s*\*\*([^*]+)\*\*:\s*(.+?)\s*$/);
    if (kv) {
      const key = kv[1].trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
      meta[key] = kv[2].trim().replace(/^`|`$/g, '');
    }
    if (!sections[current]) sections[current] = [];
    sections[current].push(line);
  }

  return {
    meta,
    sections: Object.fromEntries(
      Object.entries(sections).map(([k, v]) => [k, v.join('\n').trim()])
    )
  };
}

export function readCheckpointSnapshot({ root = process.cwd(), checkpointRel = 'docs/project-checkpoint.md' } = {}) {
  const absRoot = path.resolve(root);
  const absPath = path.resolve(absRoot, checkpointRel);
  const gitBranch = tryGit(['rev-parse', '--abbrev-ref', 'HEAD'], absRoot);
  const gitHead = tryGit(['rev-parse', 'HEAD'], absRoot);
  const gitDirty = (tryGit(['status', '--porcelain'], absRoot) || '').length > 0;

  if (!fs.existsSync(absPath)) {
    return {
      status: 'MISSING_CHECKPOINT',
      ok: false,
      checkpointPath: checkpointRel,
      git: { branch: gitBranch, head: gitHead, dirty: gitDirty },
      error: `Checkpoint file not found at ${checkpointRel}`
    };
  }

  const raw = fs.readFileSync(absPath, 'utf8');
  const sizeBytes = Buffer.byteLength(raw, 'utf8');
  const sourceHash = sha256Text(raw);
  const parsed = parseCheckpointMarkdown(raw);
  const withinBudget = sizeBytes <= HOT_CHECKPOINT_BUDGET_BYTES;

  return {
    status: withinBudget ? 'VERIFIED' : 'BUDGET_EXCEEDED',
    ok: withinBudget,
    checkpointPath: checkpointRel.replace(/\\/g, '/'),
    sourceHash,
    checkpointSize: {
      bytes: sizeBytes,
      limitBytes: HOT_CHECKPOINT_BUDGET_BYTES,
      utilizationPct: Number(((sizeBytes / HOT_CHECKPOINT_BUDGET_BYTES) * 100).toFixed(1)),
      withinBudget
    },
    selector: {
      activeTask: parsed.meta.active_task || parsed.meta.task_id || null,
      activePlan: parsed.meta.active_plan || parsed.meta.plan || null,
      owner: parsed.meta.owner || 'Jarvis x Atlas',
      baselineRevision: parsed.meta.baseline_revision || parsed.meta.revision || null
    },
    git: {
      branch: gitBranch,
      head: gitHead,
      dirty: gitDirty,
      checkpointCommit: tryGit(['log', '-1', '--format=%H', '--', checkpointRel], absRoot)
    },
    sections: parsed.sections,
    raw
  };
}

export function createRecoveryController({ root = process.cwd(), checkpointRel = 'docs/project-checkpoint.md' } = {}) {
  const delivered = new Set();
  let usedBytes = 0;
  let closed = false;

  const byteSize = (obj) => Buffer.byteLength(JSON.stringify(obj) + '\n', 'utf8');

  function emit(payload) {
    if (closed) throw new Error('TURN_CLOSED');
    let packet = {
      ...payload,
      budget: {
        payloadLimitBytes: TURN_PAYLOAD_LIMIT_BYTES,
        overheadReserveBytes: TURN_OVERHEAD_RESERVE_BYTES,
        usedBytes: 0
      }
    };
    for (let i = 0; i < 6; i++) {
      const total = usedBytes + byteSize(packet);
      if (packet.budget.usedBytes === total) break;
      packet.budget.usedBytes = total;
    }
    if (packet.budget.usedBytes > TURN_PAYLOAD_LIMIT_BYTES - 512) {
      closed = true;
      return {
        status: 'INCOMPLETE',
        partial: true,
        error: 'TURN_BUDGET_EXHAUSTED',
        pointers: { checkpoint: checkpointRel },
        budget: packet.budget
      };
    }
    usedBytes = packet.budget.usedBytes;
    return packet;
  }

  function brief() {
    const snap = readCheckpointSnapshot({ root, checkpointRel });
    if (!snap.ok && snap.status === 'MISSING_CHECKPOINT') return emit(snap);

    const key = `${snap.checkpointPath}:${snap.sourceHash}`;
    const alreadySent = delivered.has(key);
    delivered.add(key);

    return emit({
      status: snap.status,
      ok: snap.ok,
      selector: snap.selector,
      checkpointSize: snap.checkpointSize,
      git: snap.git,
      provenance: {
        sourcePath: snap.checkpointPath,
        sourceHash: snap.sourceHash,
        deliveredEarlierInTurn: alreadySent
      },
      summary: alreadySent
        ? { reference: key, note: 'Deduplicated within current turn' }
        : {
            nextSteps: snap.sections.next_steps || snap.sections.remaining_steps || '',
            verifiedBaseline: snap.sections.verified_baseline || ''
          }
    });
  }

  return { brief };
}

export function printHelp() {
  console.log(`Usage: node src/recovery.mjs <command> [options]

Lean Memory & Cold-Start Checkpoint Recovery (<= 8 KiB Hot Checkpoint + 20 KiB Turn Budget).

Commands:
  brief     Read compact checkpoint brief with SHA-256 provenance and byte budget
  check     Validate checkpoint size <= 8 KiB and print machine-readable health status

Options:
  --root <dir>          Target repository root (default: current directory)
  --checkpoint <path>   Relative path to checkpoint file (default: docs/project-checkpoint.md)
  --help, -h            Show help text
`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--root') out.root = argv[++i];
    else if (a === '--checkpoint') out.checkpoint = argv[++i];
    else out._.push(a);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'brief';
  if (args.help || cmd === 'help') {
    printHelp();
    process.exit(0);
  }
  const root = args.root || process.cwd();
  const checkpointRel = args.checkpoint || 'docs/project-checkpoint.md';
  if (cmd === 'brief') {
    const ctrl = createRecoveryController({ root, checkpointRel });
    const res = ctrl.brief();
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  } else if (cmd === 'check') {
    const snap = readCheckpointSnapshot({ root, checkpointRel });
    const { raw, sections, ...compact } = snap;
    console.log(JSON.stringify(compact, null, 2));
    process.exit(snap.ok ? 0 : 1);
  } else {
    console.error(`Unknown recovery command: ${cmd}`);
    process.exit(1);
  }
}
