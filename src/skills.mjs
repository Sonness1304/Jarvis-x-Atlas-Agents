import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const MAX_SKILLS_PER_TURN = 8;

const DEFAULT_SKILLS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'skills');

export function parseSkillFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw, hasFrontmatter: false };
  const yamlBlock = m[1];
  const body = m[2];
  const meta = {};
  for (const line of yamlBlock.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    let val = kv[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key === 'triggers' || key === 'tags') {
      meta[key] = val
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      meta[key] = val;
    }
  }
  return { meta, body, hasFrontmatter: true };
}

export function loadSkillsCatalog(skillsDir = DEFAULT_SKILLS_DIR) {
  const absDir = path.resolve(skillsDir);
  if (!fs.existsSync(absDir)) return [];
  const entries = fs.readdirSync(absDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();

  const skills = [];
  for (const dirName of entries) {
    const file = path.join(absDir, dirName, 'SKILL.md');
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    const { meta, body, hasFrontmatter } = parseSkillFrontmatter(raw);
    const bytes = Buffer.byteLength(raw, 'utf8');
    const sha256 = createHash('sha256').update(raw, 'utf8').digest('hex');
    skills.push({
      id: dirName,
      name: meta.name || dirName,
      category: meta.category || 'general',
      owner: meta.owner || 'Jarvis x Atlas',
      description: meta.description || '',
      triggers: Array.isArray(meta.triggers) ? meta.triggers : [],
      tags: Array.isArray(meta.tags) ? meta.tags : [],
      entrypoint: path.relative(path.dirname(absDir), file).replace(/\\/g, '/'),
      absPath: file,
      bytes,
      sha256,
      hasFrontmatter,
      bodyPreview: body.trim().slice(0, 220)
    });
  }
  return skills;
}

export function routeSkillsForIntent(query, { skillsDir = DEFAULT_SKILLS_DIR, limit = MAX_SKILLS_PER_TURN } = {}) {
  const cappedLimit = Math.min(Math.max(1, Number(limit) || MAX_SKILLS_PER_TURN), MAX_SKILLS_PER_TURN);
  const catalog = loadSkillsCatalog(skillsDir);
  const text = String(query || '').toLowerCase();
  const STOPWORDS = new Set(['and', 'the', 'for', 'with', 'from', 'this', 'that', 'into', 'are', 'was', 'has', 'have', 'not', 'but', 'all', 'any', 'can', 'run', 'use', 'our', 'your']);
  const tokens = text.split(/[^a-z0-9_-]+/).filter((t) => t.length >= 2 && !STOPWORDS.has(t));

  const scored = catalog.map((skill) => {
    let score = 0;
    const matched = [];
    const hayId = skill.id.toLowerCase();
    const hayDesc = `${skill.name} ${skill.description} ${skill.category}`.toLowerCase();

    for (const trig of skill.triggers) {
      const tl = trig.toLowerCase();
      if (tl && text.includes(tl)) {
        score += 10;
        matched.push(`trigger:${trig}`);
      }
    }
    for (const tag of skill.tags) {
      const tl = tag.toLowerCase();
      if (tl && text.includes(tl)) {
        score += 6;
        matched.push(`tag:${tag}`);
      }
    }
    for (const tok of tokens) {
      if (hayId.includes(tok)) {
        score += 5;
        matched.push(`id:${tok}`);
      } else if (hayDesc.includes(tok)) {
        score += 2;
        matched.push(`desc:${tok}`);
      }
    }
    return { skill, score, matched: [...new Set(matched)] };
  });

  const hits = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.id.localeCompare(b.skill.id))
    .slice(0, cappedLimit);

  // Always include using-superpowers + verification-before-completion as lightweight anchors if space allows
  const selectedIds = new Set(hits.map((h) => h.skill.id));
  const selected = hits.map((h) => ({
    id: h.skill.id,
    category: h.skill.category,
    owner: h.skill.owner,
    entrypoint: h.skill.entrypoint,
    bytes: h.skill.bytes,
    score: h.score,
    matched: h.matched
  }));

  if (selected.length === 0) {
    for (const fallbackId of ['using-superpowers', 'verification-before-completion']) {
      const found = catalog.find((s) => s.id === fallbackId);
      if (found && !selectedIds.has(found.id) && selected.length < cappedLimit) {
        selected.push({
          id: found.id,
          category: found.category,
          owner: found.owner,
          entrypoint: found.entrypoint,
          bytes: found.bytes,
          score: 1,
          matched: ['default:anchor']
        });
      }
    }
  }

  const totalCatalogBytes = catalog.reduce((sum, s) => sum + s.bytes, 0);
  const loadedBytes = selected.reduce((sum, s) => sum + s.bytes, 0);

  return {
    ok: true,
    query: String(query || ''),
    policy: {
      maxEntrypointsPerTurn: MAX_SKILLS_PER_TURN,
      progressiveLoading: true,
      bulkCatalogLoadBlocked: true
    },
    catalogCount: catalog.length,
    selectedCount: selected.length,
    budget: {
      loadedBytes,
      totalCatalogBytes,
      savedBytes: Math.max(0, totalCatalogBytes - loadedBytes),
      reductionPct: totalCatalogBytes > 0 ? Number((((totalCatalogBytes - loadedBytes) / totalCatalogBytes) * 100).toFixed(1)) : 0
    },
    selected
  };
}

export function validateSkillsCatalog(skillsDir = DEFAULT_SKILLS_DIR) {
  const catalog = loadSkillsCatalog(skillsDir);
  const issues = [];
  for (const s of catalog) {
    if (!s.hasFrontmatter) issues.push({ id: s.id, error: 'MISSING_YAML_FRONTMATTER' });
    if (!s.description || s.description.length < 15) issues.push({ id: s.id, error: 'SHORT_OR_MISSING_DESCRIPTION' });
    if (s.triggers.length === 0) issues.push({ id: s.id, error: 'MISSING_TRIGGERS' });
  }
  return {
    ok: catalog.length > 0 && issues.length === 0,
    count: catalog.length,
    issues
  };
}

export function printHelp() {
  console.log(`Usage: node src/skills.mjs <command> [options]

Progressive Skill Registry & Intent Router (<= 8 entrypoints/turn, zero bulk catalog bloat).

Commands:
  list                  List all installed skills with category, owner, size, and SHA-256
  route "<intent>"      Select <= 8 matching skills for a natural-language task intent
  show <skill-id>       Print the full SKILL.md playbook for one skill
  validate              Validate YAML frontmatter, descriptions, and triggers across skills/

Options:
  --dir <path>          Skills directory (default: ./skills)
  --limit <1..8>        Max entrypoints to return for route (default: 8)
  --help, -h            Show help text
`);
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--dir') out.dir = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else out._.push(a);
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0] || 'list';
  if (args.help || cmd === 'help') {
    printHelp();
    process.exit(0);
  }
  const skillsDir = args.dir || DEFAULT_SKILLS_DIR;
  if (cmd === 'list') {
    const list = loadSkillsCatalog(skillsDir).map(({ bodyPreview, absPath, ...rest }) => rest);
    console.log(JSON.stringify({ ok: true, count: list.length, skills: list }, null, 2));
  } else if (cmd === 'route') {
    const query = args._.slice(1).join(' ');
    console.log(JSON.stringify(routeSkillsForIntent(query, { skillsDir, limit: args.limit }), null, 2));
  } else if (cmd === 'show') {
    const id = args._[1];
    const found = loadSkillsCatalog(skillsDir).find((s) => s.id === id);
    if (!found) {
      console.error(`Skill not found: ${id}`);
      process.exit(1);
    }
    console.log(fs.readFileSync(found.absPath, 'utf8'));
  } else if (cmd === 'validate') {
    const res = validateSkillsCatalog(skillsDir);
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.ok ? 0 : 1);
  } else {
    console.error(`Unknown skills command: ${cmd}`);
    process.exit(1);
  }
}
