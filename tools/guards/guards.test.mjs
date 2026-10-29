import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { checkFile, checkUrls, checkPii, globToRegExp, matchesAny } from './guards.mjs';

const cfg = JSON.parse(readFileSync(new URL('../../.github/guards/config.json', import.meta.url)));
const H = 'h' + 'ttps://'; // keep this file free of literal URLs the guard would flag

test('glob matching', () => {
  assert.ok(globToRegExp('**/node_modules/**').test('a/b/node_modules/x/y.js'));
  assert.ok(globToRegExp('docs/**').test('docs/a/b.md'));
  assert.ok(!globToRegExp('*.md').test('a/b.md'));
  assert.ok(matchesAny('a/b/README.md', ['**/*.md']));
  assert.ok(matchesAny('x/CODEOWNERS', ['CODEOWNERS']));
});

test('files: blocks env files but allows .env.example', () => {
  assert.equal(checkFile('.env', 10, Buffer.from('A=1'), cfg).length, 1);
  assert.equal(checkFile('apps/web/.env.local', 10, Buffer.from('A=1'), cfg).length, 1);
  assert.deepEqual(checkFile('.env.example', 10, Buffer.from('A='), cfg), []);
});
test('files: blocks downloaded artifacts, build dirs and key files', () => {
  for (const p of ['docs/spec.pdf', 'vendor/tool.zip', 'bin/app.exe', 'lib/x.jar', 'node_modules/a/i.js', 'apps/web/.next/x.js', 'certs/server.pem', '.ssh/id_rsa'])
    assert.ok(checkFile(p, 10, Buffer.from('x'), cfg).length > 0, p);
});
test('files: size limits and binary detection', () => {
  assert.ok(checkFile('public/hero.png', 400_000, null, cfg)[0].includes('image'));
  assert.deepEqual(checkFile('public/icon.png', 4_000, null, cfg), []);
  assert.ok(checkFile('data/big.json', 2_000_000, Buffer.from('{}'), cfg).length);
  assert.deepEqual(checkFile('pnpm-lock.yaml', 2_000_000, Buffer.from('x'), cfg), []);
  assert.ok(checkFile('tools/blob', 10, Buffer.from([1, 0, 2]), cfg)[0].includes('binary'));
});
test('files: allowPaths exempts', () => {
  const c = structuredClone(cfg); c.files.allowPaths = ['fixtures/**'];
  assert.deepEqual(checkFile('fixtures/sample.pdf', 10, Buffer.from('x'), c), []);
});

test('urls: flags unknown hosts in source, allows allowlisted and templated', () => {
  assert.equal(checkUrls('src/api.ts', `fetch("${H}api.acme-prod.io/v1")`, cfg).length, 1);
  assert.deepEqual(checkUrls('src/a.ts', `// ${H}github.com/o/r`, cfg), []);
  assert.deepEqual(checkUrls('src/a.ts', 'const u = `' + H + '${process.env.API_HOST}/v1`', cfg), []);
  assert.deepEqual(checkUrls('README.md', `${H}anything.dev/x`, cfg), []);
  assert.deepEqual(checkUrls('src/a.ts', `x("${H}acme.io") // guard:allow`, cfg), []);
});
test('urls: flags internal hosts and IPs, except in tests', () => {
  assert.equal(checkUrls('src/db.ts', 'const h = "10.0.3.7";', cfg).length, 1);
  assert.equal(checkUrls('src/db.ts', `x = "h${'ttp'}://localhost:5432"`, cfg).length, 1);
  assert.equal(checkUrls('src/db.ts', 'host: db1.corp', cfg).length, 1);
  assert.equal(checkUrls('README.md', 'ssh build.internal', cfg).length, 1);
  assert.deepEqual(checkUrls('src/a.test.ts', `h${'ttp'}://localhost:3000`, cfg), []);
  assert.deepEqual(checkUrls('src/a.ts', 'version 1.2.3 and 999.1.1.1 and 0.0.0.0', cfg), []);
});

test('pii: key material is flagged everywhere', () => {
  assert.equal(checkPii('src/a.ts', '-----BEGIN RSA PRIVATE KEY-----', cfg).length, 1);
  assert.equal(checkPii('src/a.test.ts', 'k = "AKIA' + 'ABCDEFGHIJKLMNOP"', cfg).length, 1);
  assert.equal(checkPii('src/a.ts', 'k = "sk-ant-' + 'a'.repeat(30) + '"', cfg).length, 1);
});
test('pii: emails and phones, with allowlists', () => {
  assert.equal(checkPii('src/a.ts', 'to: "jane.doe@gmail.com"', cfg).length, 1);
  assert.deepEqual(checkPii('src/a.ts', 'to: "jane@example.com"', cfg), []);
  assert.deepEqual(checkPii('src/a.ts', '"1234+bot@users.noreply.github.com"', cfg), []);
  assert.equal(checkPii('src/a.ts', 'call (602) 555-1234', cfg).length, 1);
  assert.deepEqual(checkPii('src/a.test.ts', 'jane.doe@gmail.com', cfg), []);
  assert.deepEqual(checkPii('src/a.ts', 'v1.2.3-4567 id 1234567890', cfg), []);
});
