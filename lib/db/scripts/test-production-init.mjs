import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const url = new URL(process.env.DATABASE_URL);
assert(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname), 'Tests require local PostgreSQL');
url.pathname = '/postgres';
const admin = new pg.Client({ connectionString: url.href });
const name = 'ej_learning_test_' + randomBytes(6).toString('hex');
assert(/^ej_learning_test_[0-9a-f]{12}$/.test(name));
await admin.connect();
let client;
let created = false;
try {
  await admin.query(`CREATE DATABASE ${name}`);
  created = true;
  url.pathname = '/' + name;
  const env = { ...process.env, DATABASE_URL: url.href, NODE_ENV: 'production' };
  const run = (file, args = []) => spawnSync(process.execPath,
    [fileURLToPath(new URL(file, import.meta.url)), ...args], { env, encoding: 'utf8' });
  assert.equal(run('./init-production.mjs').status, 1, 'Explicit initialization flag required');
  const init = run('./init-production.mjs', ['--empty-database']);
  assert.equal(init.status, 0, init.stderr);
  client = new pg.Client({ connectionString: url.href });
  await client.connect();
  const count = async () => (await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0].n;
  const before = await count();
  assert(before > 0);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM core.users')).rows[0].n, 0);
  assert.equal(run('./init-production.mjs', ['--empty-database']).status, 1, 'Repeat init must refuse');
  assert.equal(await count(), before);
  const migrate = run('./migrate.mjs');
  assert.equal(migrate.status, 0, migrate.stderr);
  assert.equal(await count(), before, 'Migration must not replay initialized schema');
  console.log('PASS: empty production bootstrap, no demo accounts, repeat refusal, migration compatibility');
} finally {
  if (client) await client.end();
  if (created) await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);
  await admin.end();
}
