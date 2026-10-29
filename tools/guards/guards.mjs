#!/usr/bin/env node
// Repo guards: source-only files, no hardcoded URLs/hosts/IPs, no PII or key material.
// Usage: node tools/guards/guards.mjs [files|urls|pii|all] [--staged] [--config path]
// Scans `git ls-files` (or the staged index with --staged). Exit 1 on findings.
// Config: .github/guards/config.json. Per-line escape hatch: a `guard:allow` comment.
// Secrets proper are gitleaks' job (.gitleaks.toml); the key patterns here are a cheap backstop.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') {
      i++;
      if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*';
    } else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}
export const matchesAny = (path, globs = []) => globs.some((g) => globToRegExp(g).test(path) || (!g.includes('/') && globToRegExp(g).test(posix.basename(path))));

const ALLOW_PRAGMA = /guard:allow/;
const ext = (p) => { const b = posix.basename(p); const i = b.lastIndexOf('.'); return i > 0 ? b.slice(i + 1).toLowerCase() : ''; };
export const isBinary = (buf) => buf.subarray(0, 8000).includes(0);

// ---------- files ----------
export function checkFile(path, size, buf, cfg) {
  const c = cfg.files; const out = [];
  if (matchesAny(path, c.allowPaths)) return out;
  const base = posix.basename(path);
  if (/^\.env(\..*)?$/.test(base) && !c.allowedEnvFiles.includes(base))
    out.push(`${path}: env file committed (only ${c.allowedEnvFiles.join(', ')} are allowed). Remove it and rotate anything it held.`);
  if (matchesAny(path, c.blockedPaths)) out.push(`${path}: blocked path (build output, dependencies, OS junk or key material). Add it to .gitignore.`);
  const e = ext(path);
  if (c.blockedExtensions.includes(e)) out.push(`${path}: .${e} files are not source. Link to it or store it outside the repo.`);
  if (c.imageExtensions.includes(e) && size > c.maxImageBytes) out.push(`${path}: image is ${size} bytes (> ${c.maxImageBytes}). Compress it or host it outside the repo.`);
  else if (size > c.maxFileBytes && !matchesAny(path, c.sizeExemptPaths)) out.push(`${path}: ${size} bytes exceeds maxFileBytes (${c.maxFileBytes}).`);
  if (buf && isBinary(buf) && !c.imageExtensions.includes(e) && !['woff', 'woff2', 'ttf', 'otf', 'ico'].includes(e) && !c.blockedExtensions.includes(e))
    out.push(`${path}: binary content. Only source belongs in the repo (allowlist it in files.allowPaths if it truly must be here).`);
  return out;
}

// ---------- urls ----------
const URL_RE = /\bhttps?:\/\/[^\s"'`<>()[\]{}\\,]+/gi;
const IPV4_RE = /(?<![\w.])(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?![\w.]*\d)/g;
const BARE_HOST_RE = /(?<![\w.@/-])([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:local|internal|corp|lan|intranet|localdomain|home\.arpa))\b/gi;
const hostAllowed = (host, allow) => allow.some((h) => host === h || host.endsWith(`.${h}`));
export function isPrivateIp([a, b]) {
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || a === 0;
}
export function checkUrls(path, text, cfg) {
  const c = cfg.urls; const out = [];
  const publicOk = matchesAny(path, c.allowPaths);
  const internalOk = matchesAny(path, c.internalAllowPaths);
  text.split('\n').forEach((line, i) => {
    if (ALLOW_PRAGMA.test(line)) return;
    const at = `${path}:${i + 1}`;
    for (const m of line.matchAll(URL_RE)) {
      const raw = m[0].replace(/[.;:]+$/, '');
      if (/[$]|__[A-Z_]+__|%s|\{\{/.test(raw)) continue; // templated: ${VAR}, ${{ }}, placeholders
      let host;
      try { host = new URL(raw).hostname.toLowerCase(); } catch { continue; }
      const internal = host === 'localhost' || c.internalHostSuffixes.some((s) => host.endsWith(s)) || /^[\d.]+$/.test(host) || host.startsWith('[');
      if (internal) { if (!internalOk) out.push(`${at}: hardcoded internal/IP URL ${raw} → read it from an env var`); continue; }
      if (!publicOk && !hostAllowed(host, c.allowHosts)) out.push(`${at}: hardcoded URL ${raw} → move it to config/env (or add the host to urls.allowHosts if it is a stable public docs/schema URL)`);
    }
    if (!internalOk) {
      const noUrls = line.replace(URL_RE, ' ');
      for (const m of noUrls.matchAll(IPV4_RE)) {
        const oct = m.slice(1, 5).map(Number);
        if (oct.some((o) => o > 255)) continue;
        if (oct.every((o) => o === 0)) continue; // 0.0.0.0 bind address
        out.push(`${at}: hardcoded ${isPrivateIp(oct) ? 'private ' : ''}IP ${m[0]} → read it from an env var`);
      }
      for (const m of noUrls.matchAll(BARE_HOST_RE)) out.push(`${at}: internal hostname ${m[1]} → read it from an env var`);
    }
  });
  return out;
}

// ---------- pii / key material ----------
const KEY_PATTERNS = [
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['Anthropic key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI key', /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}/],
  ['Stripe live key', /\b[rs]k_live_[A-Za-z0-9]{16,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ['Vercel token', /\bvercel_[A-Za-z0-9]{24,}\b/],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
];
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /(?<![\w.-])(?:\+\d{1,3}[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?![\w.-])|(?<![\w])\+\d{10,15}(?!\w)/g;
export function checkPii(path, text, cfg) {
  const c = cfg.pii; const out = [];
  const pathOk = matchesAny(path, c.allowPaths);
  const emailOk = (e) => c.allowEmails.some((g) => globToRegExp(g.toLowerCase()).test(e.toLowerCase()));
  text.split('\n').forEach((line, i) => {
    if (ALLOW_PRAGMA.test(line)) return;
    const at = `${path}:${i + 1}`;
    for (const [name, re] of KEY_PATTERNS) if (re.test(line)) out.push(`${at}: looks like a ${name}. Remove it, rotate it, and load it from an env var/secret store.`);
    if (pathOk) return;
    for (const m of line.matchAll(EMAIL_RE)) if (!emailOk(m[0]) && !/@[\d.]+$/.test(m[0]) && !/\.(png|jpe?g|svg|webp|gif)$/i.test(m[0])) out.push(`${at}: email address ${m[0]} → use an @example.com address or add it to pii.allowEmails`);
    if (c.checkPhones) for (const m of line.matchAll(PHONE_RE)) out.push(`${at}: phone number ${m[0].trim()} → use a fake number (555-01xx) or mark the line guard:allow`);
  });
  return out;
}

// ---------- driver ----------
function git(args) { return execFileSync('git', args, { maxBuffer: 1 << 30 }); }
export function listFiles(staged) {
  const out = staged ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']) : git(['ls-files', '-z']);
  return out.toString('utf8').split('\0').filter(Boolean);
}
function readBlob(path, staged) { return staged ? git(['show', `:${path}`]) : readFileSync(path); }

export function run(mode, { staged = false, config = '.github/guards/config.json', files } = {}) {
  const cfg = JSON.parse(readFileSync(config, 'utf8'));
  const findings = [];
  for (const path of files ?? listFiles(staged)) {
    let buf;
    try { buf = readBlob(path, staged); } catch { continue; } // deleted / submodule
    if (mode === 'files' || mode === 'all') findings.push(...checkFile(path, buf.length, buf, cfg));
    if (isBinary(buf) || buf.length > cfg.files.maxFileBytes * 4) continue;
    const text = buf.toString('utf8');
    if (mode === 'urls' || mode === 'all') findings.push(...checkUrls(path, text, cfg));
    if (mode === 'pii' || mode === 'all') findings.push(...checkPii(path, text, cfg));
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const mode = args.find((a) => !a.startsWith('--')) ?? 'all';
  if (!['files', 'urls', 'pii', 'all'].includes(mode)) { console.error(`unknown mode ${mode}`); process.exit(2); }
  const ci = args.indexOf('--config');
  const findings = run(mode, { staged: args.includes('--staged'), ...(ci >= 0 ? { config: args[ci + 1] } : {}) });
  const gh = process.env.GITHUB_ACTIONS === 'true';
  for (const f of findings) console.log(gh ? `::error::${f}` : `✗ ${f}`);
  if (findings.length) {
    console.error(`\nguards (${mode}): ${findings.length} finding(s). Tune .github/guards/config.json or add a guard:allow comment only if it is genuinely safe.`);
    process.exit(1);
  }
  console.log(`guards (${mode}): OK`);
}
