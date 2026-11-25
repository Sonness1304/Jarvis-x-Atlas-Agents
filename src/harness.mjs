import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SCHEMA_VERSION = 1;
const FEATURES_FILE = 'features.json';
const PROGRESS_FILE = 'progress.jsonl';
const MAX_OUTPUT_SNIPPET = 600;
const DEFAULT_VERIFY_TIMEOUT_MS = 60000;

export function printHelp() {
  console.log(`Usage: node src/harness.mjs <command> [options]

Long-running task harness: immutable feature list + structured progress log + verification-gated passes.

Commands:
  init       Initialize features.json and progress.jsonl in a harness directory
  add        Add a feature with acceptance criteria and optional verify command
  brief      Print compact JSON status (passed/remaining/nextFeature/recentProgress)
  next       Print the next actionable unpassed feature
  verify     Execute a feature's verification command and flip passes=true ONLY on exitCode 0
  record     Append a structured progress entry to progress.jsonl
  handoff    Generate a bounded (<= 2 KiB) Markdown handoff brief for a fresh chat session

Options:
  --dir <path>          Harness state directory (required for all commands)
  --goal <text>         Overall goal (for init)
  --features <file>     Optional JSON array of initial features (for init)
  --force               Allow re-initializing an existing features.json
  --id <id>             Feature ID (for add / verify)
  --title <text>        Feature title/description (for add)
  --category <name>     Feature category, default "core" (for add)
  --acceptance <text>   Acceptance criterion; may be passed multiple times (for add)
  --depends-on <id>     Prerequisite feature ID; may be passed multiple times (for add)
  --verify <cmd>        Verification shell command (for add)
  --cmd <cmd>           Override verification command (for verify)
  --cwd <path>          Working directory for verification command (default process.cwd())
  --timeout-ms <ms>     Verification timeout in ms (default 60000)
  --summary <text>      Progress note (for record)
  --feature <id>        Related feature ID (for record)
  --status <kind>       info | blocked | done (for record, default info)
  --next <text>         Recommended next step (for record)
  --note <text>         Optional note (for verify)
  --out <file>          Write handoff Markdown to file (for handoff)
  --help, -h            Show this help text

Examples:
  node src/harness.mjs init --dir tmp/demo-harness --goal "Ship feature X"
  node src/harness.mjs add --dir tmp/demo-harness --id feat-1 --title "Add API" --acceptance "Returns 200" --verify "node --test tests/api.test.mjs"
  node src/harness.mjs brief --dir tmp/demo-harness
  node src/harness.mjs verify --dir tmp/demo-harness --id feat-1
  node src/harness.mjs handoff --dir tmp/demo-harness
`);
}

function resolveHarnessPaths(dir) {
  if (!dir || typeof dir !== 'string') {
    throw new Error('Missing required --dir <path>. Run with --help for Examples.');
  }
  const resolvedDir = path.resolve(dir);
  return {
    dir: resolvedDir,
    featuresPath: path.join(resolvedDir, FEATURES_FILE),
    progressPath: path.join(resolvedDir, PROGRESS_FILE)
  };
}

function normalizeFeature(raw, index = 0) {
  const id = String(raw?.id || '').trim();
  const title = String(raw?.title || raw?.description || '').trim();
  if (!id) throw new Error(`Feature at index ${index} is missing a non-empty id.`);
  if (!title) throw new Error(`Feature "${id}" is missing a non-empty title.`);
  const acceptance = Array.isArray(raw.acceptance)
    ? raw.acceptance.map((x) => String(x).trim()).filter(Boolean)
    : [];
  const dependsOn = Array.isArray(raw.dependsOn)
    ? raw.dependsOn.map((x) => String(x).trim()).filter(Boolean)
    : [];
  return {
    id,
    category: String(raw.category || 'core').trim() || 'core',
    title,
    acceptance,
    dependsOn,
    verifyCmd: raw.verifyCmd ? String(raw.verifyCmd).trim() : null,
    passes: Boolean(raw.passes),
    lastVerification: raw.lastVerification || null
  };
}

function loadState(dir) {
  const paths = resolveHarnessPaths(dir);
  if (!fs.existsSync(paths.featuresPath)) {
    throw new Error(`Harness not initialized at ${paths.dir} (missing ${FEATURES_FILE}).`);
  }
  const data = JSON.parse(fs.readFileSync(paths.featuresPath, 'utf8'));
  if (!data || !Array.isArray(data.features)) {
    throw new Error(`Invalid ${FEATURES_FILE}: missing features array.`);
  }
  return { paths, data };
}

function saveFeatures(featuresPath, data) {
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(featuresPath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function appendProgress(progressPath, entry) {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    ...entry
  });
  fs.appendFileSync(progressPath, line + '\n', 'utf8');
}

function readProgress(progressPath) {
  if (!fs.existsSync(progressPath)) return [];
  const raw = fs.readFileSync(progressPath, 'utf8').trim();
  if (!raw) return [];
  const entries = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      entries.push({ timestamp: null, status: 'corrupt-line', summary: trimmed.slice(0, 120) });
    }
  }
  return entries;
}

export function initHarness({ dir, goal, features = [], force = false }) {
  const paths = resolveHarnessPaths(dir);
  if (!goal || !String(goal).trim()) {
    throw new Error('Missing required --goal <text> for init.');
  }
  if (fs.existsSync(paths.featuresPath) && !force) {
    throw new Error(`Harness already exists at ${paths.featuresPath}. Pass --force to overwrite.`);
  }
  fs.mkdirSync(paths.dir, { recursive: true });
  const normalized = [];
  const seen = new Set();
  for (let i = 0; i < features.length; i += 1) {
    const feat = normalizeFeature(features[i], i);
    if (seen.has(feat.id)) throw new Error(`Duplicate feature id "${feat.id}".`);
    seen.add(feat.id);
    // Initial features start unverified unless explicit verified receipt is already present
    if (feat.passes && !feat.lastVerification) {
      feat.passes = false;
    }
    normalized.push(feat);
  }
  const now = new Date().toISOString();
  const state = {
    schemaVersion: SCHEMA_VERSION,
    goal: String(goal).trim(),
    createdAt: now,
    updatedAt: now,
    features: normalized
  };
  fs.writeFileSync(paths.featuresPath, JSON.stringify(state, null, 2) + '\n', 'utf8');
  if (force || !fs.existsSync(paths.progressPath)) {
    fs.writeFileSync(paths.progressPath, '', 'utf8');
  }
  appendProgress(paths.progressPath, {
    event: 'init',
    status: 'info',
    summary: `Initialized harness with ${normalized.length} feature(s) for goal: ${state.goal}`
  });
  return {
    ok: true,
    artifact: 'JARVIS_HARNESS_INIT',
    dir: paths.dir,
    featuresPath: paths.featuresPath,
    progressPath: paths.progressPath,
    featureCount: normalized.length
  };
}

export function addFeature({ dir, id, title, category = 'core', acceptance = [], dependsOn = [], verifyCmd = null }) {
  const { paths, data } = loadState(dir);
  const feat = normalizeFeature({
    id,
    title,
    category,
    acceptance,
    dependsOn,
    verifyCmd,
    passes: false,
    lastVerification: null
  });
  if (data.features.some((f) => f.id === feat.id)) {
    throw new Error(`Feature id "${feat.id}" already exists.`);
  }
  data.features.push(feat);
  saveFeatures(paths.featuresPath, data);
  appendProgress(paths.progressPath, {
    event: 'add-feature',
    featureId: feat.id,
    status: 'info',
    summary: `Added feature ${feat.id}: ${feat.title}`
  });
  return {
    ok: true,
    artifact: 'JARVIS_HARNESS_ADD',
    feature: feat,
    totalFeatures: data.features.length
  };
}

export function getNextFeature(dir) {
  const { data } = loadState(dir);
  const passedIds = new Set(data.features.filter((f) => f.passes).map((f) => f.id));
  const pending = data.features.filter((f) => !f.passes);
  const ready = pending.find((f) => (f.dependsOn || []).every((dep) => passedIds.has(dep)));
  return {
    ok: true,
    artifact: 'JARVIS_HARNESS_NEXT',
    done: pending.length === 0,
    nextFeature: ready || null,
    blockedPendingCount: ready ? 0 : pending.length,
    remainingCount: pending.length
  };
}

export function getHarnessBrief(dir) {
  const { paths, data } = loadState(dir);
  const progress = readProgress(paths.progressPath);
  const total = data.features.length;
  const passed = data.features.filter((f) => f.passes).length;
  const remaining = total - passed;
  const nextRes = getNextFeature(dir);
  const recentProgress = progress.slice(-5);
  const blockers = progress
    .filter((p) => p.status === 'blocked')
    .slice(-3)
    .map((p) => ({ featureId: p.featureId || null, summary: p.summary, timestamp: p.timestamp }));

  return {
    ok: true,
    schemaVersion: SCHEMA_VERSION,
    artifact: 'JARVIS_HARNESS_BRIEF',
    dir: paths.dir,
    goal: data.goal,
    updatedAt: data.updatedAt,
    summary: {
      total,
      passed,
      remaining,
      passRate: total === 0 ? 1 : Number((passed / total).toFixed(4))
    },
    nextFeature: nextRes.nextFeature
      ? {
          id: nextRes.nextFeature.id,
          category: nextRes.nextFeature.category,
          title: nextRes.nextFeature.title,
          acceptance: nextRes.nextFeature.acceptance,
          verifyCmd: nextRes.nextFeature.verifyCmd
        }
      : null,
    blockers,
    recentProgress
  };
}

export function recordProgress({ dir, summary, featureId = null, status = 'info', next = null }) {
  const { paths } = loadState(dir);
  if (!summary || !String(summary).trim()) {
    throw new Error('Missing required --summary <text> for record.');
  }
  const allowed = new Set(['info', 'blocked', 'done']);
  if (!allowed.has(status)) {
    throw new Error(`Invalid --status "${status}". Expected one of: info, blocked, done.`);
  }
  const entry = {
    event: 'note',
    featureId: featureId || null,
    status,
    summary: String(summary).trim(),
    next: next ? String(next).trim() : null
  };
  appendProgress(paths.progressPath, entry);
  return {
    ok: true,
    artifact: 'JARVIS_HARNESS_RECORD',
    entry
  };
}

export function parseCommandArgv(command) {
  const input = String(command ?? '').trim();
  if (!input) {
    throw new Error('Verification command cannot be empty.');
  }
  const argv = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) {
        quote = null;
      } else if (ch === '\\' && quote === '"' && (input[i + 1] === '"' || input[i + 1] === '\\')) {
        current += input[i + 1];
        i += 1;
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (/\s/.test(ch)) {
      if (current.length > 0) {
        argv.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (quote) {
    throw new Error('Unterminated quote in verification command.');
  }
  if (current.length > 0) {
    argv.push(current);
  }
  if (argv.length === 0) {
    throw new Error('Verification command produced empty argv.');
  }
  return argv;
}

export function verifyFeature({
  dir,
  id,
  cmd = null,
  cwd = process.cwd(),
  timeoutMs = DEFAULT_VERIFY_TIMEOUT_MS,
  note = null
}) {
  const { paths, data } = loadState(dir);
  const feat = data.features.find((f) => f.id === id);
  if (!feat) {
    throw new Error(`Unknown feature id "${id}".`);
  }
  const commandToRun = (cmd && String(cmd).trim()) || feat.verifyCmd;
  if (!commandToRun) {
    throw new Error(`Feature "${id}" has no verifyCmd. Pass --cmd <command> to verify.`);
  }

  const startedAt = Date.now();
  const argv = Array.isArray(commandToRun) ? commandToRun.map(String) : parseCommandArgv(commandToRun);
  const proc = spawnSync(argv[0], argv.slice(1), {
    cwd: path.resolve(cwd),
    shell: false,
    encoding: 'utf8',
    timeout: Number(timeoutMs) > 0 ? Number(timeoutMs) : DEFAULT_VERIFY_TIMEOUT_MS,
    windowsHide: true
  });
  const elapsedMs = Date.now() - startedAt;
  const exitCode = typeof proc.status === 'number' ? proc.status : 1;
  const timedOut = Boolean(proc.error && proc.error.code === 'ETIMEDOUT');
  const passed = exitCode === 0 && !proc.error;

  const receipt = {
    verifiedAt: new Date().toISOString(),
    command: commandToRun,
    cwd: path.resolve(cwd),
    exitCode,
    timedOut,
    elapsedMs,
    stdoutSnippet: String(proc.stdout || '').trim().slice(-MAX_OUTPUT_SNIPPET),
    stderrSnippet: String(proc.stderr || '').trim().slice(-MAX_OUTPUT_SNIPPET),
    note: note ? String(note).trim() : null
  };

  feat.lastVerification = receipt;
  feat.passes = passed;
  saveFeatures(paths.featuresPath, data);

  appendProgress(paths.progressPath, {
    event: 'verify',
    featureId: feat.id,
    status: passed ? 'done' : 'blocked',
    summary: passed
      ? `VERIFIED ${feat.id} (exitCode=0, ${elapsedMs}ms): ${commandToRun}`
      : `FAILED ${feat.id} (exitCode=${exitCode}, timedOut=${timedOut}): ${commandToRun}`
  });

  return {
    ok: passed,
    artifact: 'JARVIS_HARNESS_VERIFY',
    featureId: feat.id,
    passes: feat.passes,
    receipt,
    remediation: passed
      ? null
      : `Fix failing verification for "${feat.id}", then re-run: node src/harness.mjs verify --dir "${paths.dir}" --id "${feat.id}"`
  };
}

export function buildHandoffMarkdown(dir, maxBytes = 2048) {
  const brief = getHarnessBrief(dir);
  const lines = [
    `# Harness Handoff — ${brief.goal}`,
    `- Progress: ${brief.summary.passed}/${brief.summary.total} passed (${Math.round(brief.summary.passRate * 100)}%)`,
    `- Harness dir: ${brief.dir}`
  ];
  if (brief.nextFeature) {
    lines.push(`- Next feature: ${brief.nextFeature.id} — ${brief.nextFeature.title}`);
    if (brief.nextFeature.verifyCmd) {
      lines.push(`- Verify command: \`${brief.nextFeature.verifyCmd}\``);
    }
    if (brief.nextFeature.acceptance.length > 0) {
      lines.push(`- Acceptance: ${brief.nextFeature.acceptance.join('; ')}`);
    }
  } else {
    lines.push('- Next feature: ALL_FEATURES_PASSED');
  }
  if (brief.blockers.length > 0) {
    lines.push('## Blockers');
    for (const b of brief.blockers) {
      lines.push(`- [${b.featureId || 'general'}] ${b.summary}`);
    }
  }
  if (brief.recentProgress.length > 0) {
    lines.push('## Recent Progress');
    for (const p of brief.recentProgress) {
      lines.push(`- [${p.status || 'info'}] ${p.summary}`);
    }
  }
  let md = lines.join('\n') + '\n';
  if (Buffer.byteLength(md, 'utf8') > maxBytes) {
    while (Buffer.byteLength(md, 'utf8') > maxBytes - 20 && md.length > 40) {
      md = md.slice(0, -30);
    }
    md = md.trimEnd() + '\n...(truncated)\n';
  }
  return {
    ok: true,
    artifact: 'JARVIS_HARNESS_HANDOFF',
    bytes: Buffer.byteLength(md, 'utf8'),
    maxBytes,
    markdown: md
  };
}

function parseCliArgs(argv) {
  const out = { command: null, flags: {}, multi: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') {
      out.flags.help = true;
      continue;
    }
    if (!a.startsWith('--') && !out.command) {
      out.command = a;
      continue;
    }
    if (a === '--force') {
      out.flags.force = true;
      continue;
    }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1];
      if (val === undefined) {
        throw new Error(`Missing value for flag --${key}`);
      }
      i += 1;
      if (key === 'acceptance' || key === 'depends-on') {
        out.multi[key] = out.multi[key] || [];
        out.multi[key].push(val);
      } else {
        out.flags[key] = val;
      }
    }
  }
  return out;
}

function runCli() {
  const parsed = parseCliArgs(process.argv.slice(2));
  if (parsed.flags.help || !parsed.command) {
    printHelp();
    process.exit(0);
  }
  const f = parsed.flags;
  let result;
  if (parsed.command === 'init') {
    let features = [];
    if (f.features) {
      features = JSON.parse(fs.readFileSync(path.resolve(f.features), 'utf8'));
    }
    result = initHarness({ dir: f.dir, goal: f.goal, features, force: Boolean(f.force) });
  } else if (parsed.command === 'add') {
    result = addFeature({
      dir: f.dir,
      id: f.id,
      title: f.title,
      category: f.category || 'core',
      acceptance: parsed.multi.acceptance || [],
      dependsOn: parsed.multi['depends-on'] || [],
      verifyCmd: f.verify || null
    });
  } else if (parsed.command === 'brief') {
    result = getHarnessBrief(f.dir);
  } else if (parsed.command === 'next') {
    result = getNextFeature(f.dir);
  } else if (parsed.command === 'record') {
    result = recordProgress({
      dir: f.dir,
      summary: f.summary,
      featureId: f.feature || null,
      status: f.status || 'info',
      next: f.next || null
    });
  } else if (parsed.command === 'verify') {
    result = verifyFeature({
      dir: f.dir,
      id: f.id,
      cmd: f.cmd || null,
      cwd: f.cwd || process.cwd(),
      timeoutMs: f['timeout-ms'] ? Number(f['timeout-ms']) : DEFAULT_VERIFY_TIMEOUT_MS,
      note: f.note || null
    });
  } else if (parsed.command === 'handoff') {
    result = buildHandoffMarkdown(f.dir);
    if (f.out) {
      const outPath = path.resolve(f.out);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, result.markdown, 'utf8');
      result.outPath = outPath;
    }
  } else {
    throw new Error(`Unknown command "${parsed.command}". Run with --help.`);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.ok ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    runCli();
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message }, null, 2));
    process.exit(1);
  }
}
