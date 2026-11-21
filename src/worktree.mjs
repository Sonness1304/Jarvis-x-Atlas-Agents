import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/;

export function printHelp() {
  console.log(`Usage: node src/worktree.mjs <command> [options]

Safe Git worktree isolation manager for parallel agent lanes without touching the live working tree.

Commands:
  list       List all Git worktrees for a repository with branch and dirty state
  create     Create an isolated worktree on a dedicated branch (default prefix: codex/)
  status     Inspect branch, HEAD, and uncommitted changes in a specific worktree
  remove     Safely remove a secondary worktree (refuses main repo or dirty worktree without --force)

Options:
  --repo <path>      Target Git repository root (default: current working directory)
  --name <slug>      Short alphanumeric slug for the worktree (for create)
  --branch <name>    Branch name to create/checkout (default: codex/<slug>)
  --base <ref>       Base Git ref/commit (default: HEAD)
  --root <path>      Base folder for managed worktrees (default: ~/.jarvis/worktrees)
  --path <path>      Worktree path (for status / remove)
  --force            Allow removing a dirty secondary worktree (never allows removing main repo)
  --help, -h         Show this help text

Examples:
  node src/worktree.mjs list --repo .
  node src/worktree.mjs create --repo . --name feature-experiment
  node src/worktree.mjs status --path ~/.jarvis/worktrees/<repo>/feature-experiment
  node src/worktree.mjs remove --repo . --path ~/.jarvis/worktrees/<repo>/feature-experiment
`);
}

function runGit(args, cwd) {
  return execFileSync('git', args, {
    cwd: path.resolve(cwd),
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function resolveRepoTop(repoPath = process.cwd()) {
  const out = runGit(['rev-parse', '--show-toplevel'], repoPath).trim();
  return path.resolve(out);
}

function normalizePathKey(p) {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function isWorktreeDirty(wtPath) {
  if (!fs.existsSync(wtPath)) return false;
  const out = runGit(['status', '--porcelain'], wtPath).trim();
  return out.length > 0;
}

export function listWorktrees(repoPath = process.cwd()) {
  const repoRoot = resolveRepoTop(repoPath);
  const raw = runGit(['worktree', 'list', '--porcelain'], repoRoot);
  const blocks = raw.trim().split(/\r?\n\r?\n/).filter(Boolean);
  const items = [];
  for (let i = 0; i < blocks.length; i += 1) {
    const entry = {
      path: null,
      head: null,
      branch: null,
      detached: false,
      bare: false,
      isMain: i === 0,
      dirty: false
    };
    for (const line of blocks[i].split(/\r?\n/)) {
      if (line.startsWith('worktree ')) entry.path = path.resolve(line.slice(9).trim());
      else if (line.startsWith('HEAD ')) entry.head = line.slice(5).trim();
      else if (line.startsWith('branch ')) entry.branch = line.slice(7).trim().replace(/^refs\/heads\//, '');
      else if (line === 'detached') entry.detached = true;
      else if (line === 'bare') entry.bare = true;
    }
    if (entry.path && !entry.bare) {
      try {
        entry.dirty = isWorktreeDirty(entry.path);
      } catch {
        entry.dirty = false;
      }
    }
    if (entry.path) items.push(entry);
  }
  return {
    ok: true,
    artifact: 'JARVIS_WORKTREE_LIST',
    repoRoot,
    count: items.length,
    worktrees: items
  };
}

export function createWorktree({
  repo = process.cwd(),
  name,
  branch = null,
  base = 'HEAD',
  root = path.join(os.homedir(), '.jarvis', 'worktrees')
}) {
  if (!name || !SLUG_RE.test(String(name))) {
    throw new Error('Invalid or missing --name <slug>. Use 1-64 chars matching [a-zA-Z0-9._-].');
  }
  const repoRoot = resolveRepoTop(repo);
  const repoSlug = path.basename(repoRoot).replace(/[^a-zA-Z0-9._-]+/g, '-');
  const managedRoot = path.resolve(root, repoSlug);
  const targetPath = path.resolve(managedRoot, String(name));
  if (!normalizePathKey(targetPath).startsWith(normalizePathKey(managedRoot) + path.sep)) {
    throw new Error('Resolved worktree path escapes managed worktrees root.');
  }
  if (fs.existsSync(targetPath)) {
    throw new Error(`Worktree path already exists: ${targetPath}`);
  }
  const branchName = branch ? String(branch).trim() : `codex/${name}`;
  fs.mkdirSync(managedRoot, { recursive: true });

  // Check if branch already exists
  let branchExists = false;
  try {
    runGit(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], repoRoot);
    branchExists = true;
  } catch {
    branchExists = false;
  }

  const args = branchExists
    ? ['worktree', 'add', targetPath, branchName]
    : ['worktree', 'add', '-b', branchName, targetPath, base];

  runGit(args, repoRoot);
  const head = runGit(['rev-parse', 'HEAD'], targetPath).trim();
  return {
    ok: true,
    artifact: 'JARVIS_WORKTREE_CREATE',
    repoRoot,
    path: targetPath,
    branch: branchName,
    base,
    head,
    reusedExistingBranch: branchExists
  };
}

export function getWorktreeStatus(worktreePath) {
  if (!worktreePath) throw new Error('Missing required --path <worktree-path>.');
  const resolved = path.resolve(worktreePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Worktree path does not exist: ${resolved}`);
  }
  const head = runGit(['rev-parse', 'HEAD'], resolved).trim();
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], resolved).trim();
  const porcelain = runGit(['status', '--porcelain'], resolved).trim();
  const changedFiles = porcelain ? porcelain.split(/\r?\n/).filter(Boolean) : [];
  return {
    ok: true,
    artifact: 'JARVIS_WORKTREE_STATUS',
    path: resolved,
    branch,
    head,
    dirty: changedFiles.length > 0,
    changedCount: changedFiles.length,
    changedFiles: changedFiles.slice(0, 30)
  };
}

export function removeWorktree({ repo = process.cwd(), worktreePath, force = false }) {
  if (!worktreePath) throw new Error('Missing required --path <worktree-path>.');
  const listed = listWorktrees(repo);
  const targetKey = normalizePathKey(worktreePath);
  const match = listed.worktrees.find((w) => normalizePathKey(w.path) === targetKey);
  if (!match) {
    throw new Error(`Path is not a registered Git worktree of ${listed.repoRoot}: ${path.resolve(worktreePath)}`);
  }
  if (match.isMain) {
    throw new Error('Refusing to remove the main repository worktree.');
  }
  if (match.dirty && !force) {
    return {
      ok: false,
      artifact: 'JARVIS_WORKTREE_REMOVE',
      removed: false,
      path: match.path,
      reason: 'Worktree has uncommitted changes. Commit/stash them or re-run with --force.',
      remediation: `Review changes with: node src/worktree.mjs status --path "${match.path}"`
    };
  }
  const args = force ? ['worktree', 'remove', '--force', match.path] : ['worktree', 'remove', match.path];
  runGit(args, listed.repoRoot);
  return {
    ok: true,
    artifact: 'JARVIS_WORKTREE_REMOVE',
    removed: true,
    path: match.path,
    branch: match.branch
  };
}

function parseCliArgs(argv) {
  const out = { command: null, flags: {} };
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
      if (val === undefined) throw new Error(`Missing value for --${key}`);
      i += 1;
      out.flags[key] = val;
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
  if (parsed.command === 'list') {
    result = listWorktrees(f.repo || process.cwd());
  } else if (parsed.command === 'create') {
    result = createWorktree({
      repo: f.repo || process.cwd(),
      name: f.name,
      branch: f.branch || null,
      base: f.base || 'HEAD',
      root: f.root || path.join(os.homedir(), '.jarvis', 'worktrees')
    });
  } else if (parsed.command === 'status') {
    result = getWorktreeStatus(f.path);
  } else if (parsed.command === 'remove') {
    result = removeWorktree({
      repo: f.repo || process.cwd(),
      worktreePath: f.path,
      force: Boolean(f.force)
    });
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
