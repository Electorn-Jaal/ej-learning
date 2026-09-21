// Cross-platform integration test. Uses only a uniquely named temporary stack.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = 'ej-smoke-' + randomBytes(6).toString('hex');
const temp = await mkdtemp(path.join(os.tmpdir(), project + '-'));
const storage = path.join(temp, 'storage');
await mkdir(storage);
const envFile = path.join(temp, 'compose.env');
const override = path.join(temp, 'override.json');
const password = randomBytes(24).toString('hex');
await writeFile(envFile, [
  'EJ_IMAGE_PREFIX=' + (process.env.EJ_TEST_IMAGE_PREFIX ?? 'ej-learning'),
  'EJ_VERSION=' + (process.env.EJ_TEST_VERSION ?? 'ej-check'),
  'POSTGRES_PASSWORD=' + password,
  'DATABASE_URL=postgresql://ej_owner:' + password + '@db:5432/ej_learning',
  'EJ_STORAGE_PATH=' + storage.replaceAll('\\', '/'),
  'EJ_HTTP_PORT=0',
].join('\n'), { mode: 0o600 });
await writeFile(override, JSON.stringify({ services: {
  tools: { user: '0:0', environment: { EJ_SMOKE_TEST: '1' },
    volumes: [{ type: 'bind', source: storage, target: '/app/storage', read_only: false }] },
} }));
const flags = ['compose', '-p', project, '--env-file', envFile,
  '-f', path.join(root, 'deploy/compose.yml'), '-f', override];
function compose(args, allowFailure = false) {
  const result = spawnSync('docker', [...flags, ...args], { encoding: 'utf8', timeout: 240000, maxBuffer: 8 * 1024 * 1024 });
  if (!allowFailure && result.status !== 0) {
    throw new Error(`Docker command failed: ${args[0]}\n${(result.stderr ?? '').replaceAll(password, '[redacted]')}`);
  }
  return result;
}
let cleanupComplete = false;
try {
  console.log('Starting disposable PostgreSQL');
  compose(['up', '-d', '--wait', 'db']);
  console.log('Checking empty schema initialization and migration compatibility');
  compose(['run', '--rm', 'tools', 'node', 'lib/db/scripts/init-production.mjs', '--empty-database']);
  assert.notEqual(compose(['run', '--rm', 'tools', 'node', 'lib/db/scripts/init-production.mjs', '--empty-database'], true).status, 0);
  compose(['run', '--rm', 'tools']); // Must not replay the initialized baseline.
  compose(['run', '--rm', 'tools', 'node', 'deploy/smoke-seed.mjs']);
  console.log('Starting API and web; waiting for both healthchecks');
  compose(['up', '-d', '--wait', 'api', 'web']);
  const address = compose(['port', 'web', '80']).stdout.trim();
  const origin = 'http://' + address;
  const request = (url, options) => fetch(origin + url, options);
  console.log('Checking /ej browser paths, auth and PDF requests');
  const redirect = await request('/ej', { redirect: 'manual' });
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('location'), '/ej/');
  const html = await (await request('/ej/')).text();
  const asset = html.match(/src="(\/ej\/assets\/[^\"]+\.js)"/)?.[1];
  assert(asset, 'Frontend scripts must use /ej/assets');
  assert.equal((await request(asset)).status, 200);
  assert.equal(await (await request('/ej/teacher/schedule')).text(), html, 'SPA deep links');
  assert.equal((await request('/api/healthz')).status, 404, 'No root API collision with TMS');
  assert.equal((await request('/ej/api/healthz')).status, 200);
  assert.equal((await request('/ej/api/auth/me')).status, 401);
  const login = await request('/ej/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'demo-student', password: 'demo1234' }),
  });
  assert.equal(login.status, 200);
  const setCookie = login.headers.get('set-cookie');
  assert.match(setCookie, /Path=\/ej\//i);
  assert.match(setCookie, /; Secure/i);
  assert.match(setCookie, /; HttpOnly/i);
  const cookie = setCookie.split(';')[0];
  // Node sends the cookie explicitly to test proxy/auth. This does not claim
  // that a browser can use Secure cookies on the public HTTP server.
  const headers = { cookie };
  assert.equal((await request('/ej/api/auth/me', { headers })).status, 200);
  const today = await (await request('/ej/api/student/today', { headers })).json();
  const findFile = value => {
    if (value && typeof value === 'object') {
      if (typeof value.fileUrl === 'string') return value.fileUrl;
      for (const child of Object.values(value)) { const found = findFile(child); if (found) return found; }
    }
    return null;
  };
  const file = findFile(today);
  assert(file?.startsWith('/api/'), 'Seed must expose a PDF link');
  const pdf = await request('/ej' + file, { headers });
  assert.equal(pdf.status, 200);
  assert.match(pdf.headers.get('content-type'), /application\/pdf/);
  assert((await pdf.text()).startsWith('%PDF-'));
  const logout = await request('/ej/api/auth/logout', { method: 'POST', headers });
  assert.equal(logout.status, 204);
  assert.match(logout.headers.get('set-cookie'), /Path=\/ej\//i);
  assert.equal((await request('/ej/api/auth/me', { headers })).status, 401);
  console.log('PASS: /ej assets, deep links, API isolation, schema init/migrate, login, scoped Secure cookies, PDF, logout');
} catch (error) {
  console.error(compose(['logs', '--tail', '25', 'api', 'web'], true).stdout);
  throw error;
} finally {
  assert(/^ej-smoke-[0-9a-f]{12}$/.test(project));
  // The seed writes into the bind-mounted storage as root, so on Linux the
  // files it leaves belong to root and the user running this script cannot
  // remove them. Clearing them from inside the container, which is root, is
  // what makes the temporary directory disposable on a CI runner as well as
  // on a desktop where the bind mount hides ownership.
  compose(['run', '--rm', 'tools', 'node', '-e',
    "const fs=require('node:fs');for(const entry of fs.readdirSync('/app/storage'))" +
    "fs.rmSync('/app/storage/'+entry,{recursive:true,force:true})"], true);
  const cleanup = compose(['down', '--volumes', '--remove-orphans'], true);
  cleanupComplete = cleanup.status === 0;
  if (cleanupComplete) await rm(temp, { recursive: true, force: true });
  else console.error(`Cleanup failed for disposable project ${project}; config retained at ${temp}`);
}
if (!cleanupComplete) process.exitCode = 1;
