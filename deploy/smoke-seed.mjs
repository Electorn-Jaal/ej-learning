// Only called by smoke.mjs inside its disposable Docker project.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { seedLocalDemo } from '../lib/db/scripts/seed-local-demo.mjs';
const pg = createRequire(new URL('../lib/db/package.json', import.meta.url))('pg');
if (process.env.EJ_SMOKE_TEST !== '1') throw new Error('Smoke fixture only');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  const fixture = await seedLocalDemo(client, 'ej_learning_test_smoke');
  const filename = path.join(process.env.EJ_STORAGE_DIR, fixture.storageKey);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, fixture.pdf);
  await client.query('COMMIT');
  console.log('Synthetic fixture ready');
} finally {
  await client.end();
}
