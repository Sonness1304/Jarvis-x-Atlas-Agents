import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const DEFAULT_BATCH_MAX_BYTES = 16384;
export const DEFAULT_BATCH_MAX_FILES = 6;

export function parseUnifiedDiff(diffText) {
  const files = [];
  const chunks = String(diffText || '').split(/^diff --git /m).slice(1);
  for (const chunk of chunks) {
    const firstLine = chunk.split(/\r?\n/, 1)[0] || '';
    const m = firstLine.match(/^a\/(.+?)\s+b\/(.+)$/);
    const filePath = m ? m[2] : 'unknown';
    const fullChunk = 'diff --git ' + chunk;
    const addedLines = [];
    const removedLines = [];
    for (const line of fullChunk.split(/\r?\n/)) {
      if (line.startsWith('+') && !line.startsWith('+++')) addedLines.push(line.slice(1));
      else if (line.startsWith('-') && !line.startsWith('---')) removedLines.push(line.slice(1));
    }
    files.push({
      path: filePath,
      bytes: Buffer.byteLength(fullChunk, 'utf8'),
      addedCount: addedLines.length,
      removedCount: removedLines.length,
      diff: fullChunk
    });
  }
  return files;
}

export function sliceDiffIntoBatches(files, { maxBytes = DEFAULT_BATCH_MAX_BYTES, maxFiles = DEFAULT_BATCH_MAX_FILES } = {}) {
  const batches = [];
  let current = [];
  let currentBytes = 0;

  for (const file of files) {
    const wouldExceed = current.length > 0 && (current.length >= maxFiles || currentBytes + file.bytes > maxBytes);
    if (wouldExceed) {
      batches.push({
        batchId: `B${batches.length + 1}`,
        fileCount: current.length,
        bytes: currentBytes,
        files: current.map((f) => f.path)
      });
      current = [];
      currentBytes = 0;
    }
    current.push(file);
    currentBytes += file.bytes;
  }

  if (current.length > 0) {
    batches.push({
      batchId: `B${batches.length + 1}`,
      fileCount: current.length,
      bytes: currentBytes,
      files: current.map((f) => f.path)
    });
  }

  return batches;
}

export function verifyReviewPacket({ changedFiles, reviewedFiles, findings = [], root = process.cwd() }) {
  const expectedSet = new Set(changedFiles);
  const reviewedSet = new Set(reviewedFiles);
  const missingFiles = changedFiles.filter((f) => !reviewedSet.has(f));
  const coveragePct = changedFiles.length === 0
    ? 100
    : Number((((changedFiles.length - missingFiles.length) / changedFiles.length) * 100).toFixed(1));

  const anchorErrors = [];
  const verifiedFindings = [];

  for (let i = 0; i < findings.length; i++) {
    const finding = findings[i];
    const id = finding.id || `F${i + 1}`;
    if (!finding.file || !expectedSet.has(finding.file)) {
      anchorErrors.push({ id, reason: 'FILE_NOT_IN_CHANGED_SET', file: finding.file || null });
      continue;
    }
    if (typeof finding.existingCode !== 'string' || finding.existingCode.trim().length < 3) {
      anchorErrors.push({ id, reason: 'MISSING_EXISTING_CODE_ANCHOR', file: finding.file });
      continue;
    }
    const absFile = path.resolve(root, finding.file);
    if (!fs.existsSync(absFile)) {
      anchorErrors.push({ id, reason: 'ANCHOR_FILE_NOT_FOUND', file: finding.file });
      continue;
    }
    const content = fs.readFileSync(absFile, 'utf8');
    const needle = finding.existingCode.trim();
    if (!content.includes(needle)) {
      anchorErrors.push({ id, reason: 'EXISTING_CODE_ANCHOR_MISMATCH', file: finding.file, existingCode: needle });
      continue;
    }
    verifiedFindings.push({
      id,
      severity: finding.severity || 'P2',
      file: finding.file,
      existingCode: needle,
      summary: finding.summary || '',
      anchored: true
    });
  }

  const coveragePassed = missingFiles.length === 0;
  const anchorsPassed = anchorErrors.length === 0;
  const blockingCount = verifiedFindings.filter((f) => f.severity === 'P0' || f.severity === 'P1').length;

  return {
    ok: coveragePassed && anchorsPassed,
    gateStatus: coveragePassed && anchorsPassed ? (blockingCount > 0 ? 'CHANGES_REQUESTED' : 'APPROVED') : 'REJECTED_INVALID_REVIEW',
    coverage: {
      changedCount: changedFiles.length,
      reviewedCount: changedFiles.length - missingFiles.length,
      coveragePct,
      requiredPct: 100,
      missingFiles,
      passed: coveragePassed
    },
    anchors: {
      submittedFindings: findings.length,
      verifiedFindings: verifiedFindings.length,
      anchorErrors,
      passed: anchorsPassed
    },
    blockingCount,
    findings: verifiedFindings
  };
}

export function getGitDiff({ repo = process.cwd(), base = null, staged = false } = {}) {
  const args = ['diff', '--unified=3'];
  if (staged) args.push('--cached');
  else if (base) args.push(base);
  return execFileSync('git', args, {
    cwd: path.resolve(repo),
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

export function printHelp() {
  console.log(`Usage: node src/review-engine.mjs <command> [options]

Independent Hybrid Review v2 — Gateway-independent diff slicing, 100% file coverage gate,
and existingCode line-anchoring verification.

Commands:
  slice      Slice current Git diff (or --base <ref>) into bounded review batches
  verify     Validate a review findings JSON file for 100% file coverage & real existingCode anchors

Options:
  --repo <dir>          Target Git repository (default: current working directory)
  --base <ref>          Compare against Git ref (e.g. HEAD~1 or main)
  --staged              Inspect staged changes
  --max-bytes <n>       Max bytes per review batch (default: 16384)
  --max-files <n>       Max files per review batch (default: 6)
  --packet <file.json>  JSON file with { changedFiles, reviewedFiles, findings } for verify
  --help, -h            Show help text
`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--repo') out.repo = argv[++i];
    else if (a === '--base') out.base = argv[++i];
    else if (a === '--staged') out.staged = true;
    else if (a === '--max-bytes') out.maxBytes = Number(argv[++i]);
    else if (a === '--max-files') out.maxFiles = Number(argv[++i]);
    else if (a === '--packet') out.packet = argv[++i];
    else out._.push(a);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'slice';
  if (args.help || cmd === 'help') {
    printHelp();
    process.exit(0);
  }
  if (cmd === 'slice') {
    const diff = getGitDiff({ repo: args.repo, base: args.base, staged: args.staged });
    const files = parseUnifiedDiff(diff);
    const batches = sliceDiffIntoBatches(files, {
      maxBytes: args.maxBytes || DEFAULT_BATCH_MAX_BYTES,
      maxFiles: args.maxFiles || DEFAULT_BATCH_MAX_FILES
    });
    console.log(JSON.stringify({
      ok: true,
      engine: 'hybrid-review-v2',
      gatewayIndependent: true,
      changedFilesCount: files.length,
      batchCount: batches.length,
      batches
    }, null, 2));
  } else if (cmd === 'verify') {
    if (!args.packet || !fs.existsSync(args.packet)) {
      console.error('Provide --packet <path-to-review-packet.json>');
      process.exit(1);
    }
    const packet = JSON.parse(fs.readFileSync(args.packet, 'utf8'));
    const res = verifyReviewPacket({ ...packet, root: args.repo || process.cwd() });
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  } else {
    console.error(`Unknown review command: ${cmd}`);
    process.exit(1);
  }
}
