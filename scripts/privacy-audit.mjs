import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const ALLOWED_EMAIL_DOMAINS = new Set([
  "example.com",
  "example.org",
  "users.noreply.github.com"
]);

const RULES = [
  { id: "windows-user-path", regex: /[A-Za-z]:\\Users\\[A-Za-z0-9._-]+/g },
  { id: "macos-user-path", regex: /\/Users\/[A-Za-z0-9._-]+/g },
  {
    id: "secret-key-pattern",
    regex: /(?:sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})/g
  },
  {
    id: "private-local-config",
    regex: /\b(?:models-9router\.json|model-rules-template\.md|Local State)\b/gi
  }
];

const EMAIL_RE = /[A-Za-z0-9._%+-]+@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(rootDir);
const findings = [];

for (const file of files) {
  const rel = path.relative(rootDir, file).replace(/\\/g, "/");
  if (rel === "scripts/privacy-audit.mjs") continue;
  const content = fs.readFileSync(file, "utf8");

  for (const rule of RULES) {
    const matches = content.match(rule.regex);
    if (matches && matches.length > 0) {
      findings.push({ file: rel, rule: rule.id, count: matches.length });
    }
  }

  let emailCount = 0;
  for (const match of content.matchAll(EMAIL_RE)) {
    const domain = match[1].toLowerCase();
    if (!ALLOWED_EMAIL_DOMAINS.has(domain)) {
      emailCount += 1;
    }
  }
  if (emailCount > 0) {
    findings.push({ file: rel, rule: "non-placeholder-email", count: emailCount });
  }
}

console.log(JSON.stringify({ ok: findings.length === 0, scannedFiles: files.length, findings }, null, 2));
process.exit(findings.length === 0 ? 0 : 1);
