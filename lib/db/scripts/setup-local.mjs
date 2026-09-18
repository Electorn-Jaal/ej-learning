// Bootstrap a NEW, empty local database. Never reset or adopt an existing one.
import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { seedLocalDemo } from './seed-local-demo.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const migrations = path.join(root, 'lib/db/drizzle');
const createdFiles = [];
let client;
let committed = false;
try {
  if (process.env.NODE_ENV === 'production') throw new Error('Local setup is disabled in production.');
  if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL in .env.');
  const url = new URL(process.env.DATABASE_URL);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.search) {
    throw new Error('Use a loopback PostgreSQL URL without query parameters.');
  }
  if (!/^ej_learning_(local|test)(_[a-z0-9]+)*$/.test(database)) {
    throw new Error('Database name must be ej_learning_local or ej_learning_test, optionally with _suffix. Existing ej_learning_dev is intentionally excluded.');
  }
  if (!process.env.EJ_STORAGE_DIR || !path.isAbsolute(process.env.EJ_STORAGE_DIR)) {
    throw new Error('Set EJ_STORAGE_DIR to an absolute local storage path.');
  }
  const storage = path.resolve(process.env.EJ_STORAGE_DIR);
  client = new pg.Client({ connectionString: url.href, connectionTimeoutMillis: 5000 });
  await client.connect();
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('ej-learning-local-setup'))");
  const { rows: identity } = await client.query('SELECT current_database() AS name');
  if (identity[0].name !== database) throw new Error('Connected database does not match URL.');
  // Empty means no user schemas, relations, types, functions or extensions.
  // A second invocation must fail without changing accounts or existing data.
  const { rows: occupied } = await client.query(`
    SELECT 1 FROM pg_namespace WHERE nspname <> 'public'
      AND nspname <> 'information_schema' AND nspname NOT LIKE 'pg_%'
    UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
    UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    UNION ALL SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql' LIMIT 1`);
  if (occupied.length) throw new Error('Database is not empty. No changes made. Use migrate for an already initialized database.');
  const journal = JSON.parse(await readFile(path.join(migrations, 'meta/_journal.json'), 'utf8'));
  await client.query('CREATE SCHEMA drizzle');
  await client.query('CREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
  for (const entry of journal.entries) {
    const source = await readFile(path.join(migrations, entry.tag + '.sql'), 'utf8');
    let sql = source;
    if (entry.idx === 0) {
      // Preserve the historical file/hash for databases already using migrations.
      // Introspection wrapped the baseline in a comment and assigned incorrect
      // explicit operator classes to several indexes. Let PostgreSQL choose
      // the default operator class from each indexed column's actual type.
      const begin = source.indexOf('/*');
      const end = source.lastIndexOf('*/');
      if (begin < 0 || end < begin || source.slice(end + 2).trim()) throw new Error('Unexpected baseline format.');
      sql = source.slice(begin + 2, end).replace(/CREATE INDEX[^;]+;/g, statement =>
        statement.replace(/\s+(?:int[248]|text|uuid|enum)_ops\b/g, ''));
    }
    await client.query(sql);
    await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1,$2)',
      [createHash('sha256').update(source).digest('hex'), entry.when]);
  }
  const demo = await seedLocalDemo(client, database);
  const pdfPath = path.join(storage, demo.storageKey);
  const accountsPath = path.join(root, 'local-data/generated', database + '-accounts.json');
  for (const [filename, contents] of [[pdfPath, demo.pdf], [accountsPath, JSON.stringify(demo.accounts, null, 2) + '\n']]) {
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, contents, { flag: 'wx', mode: 0o600 });
    createdFiles.push(filename);
  }
  await client.query('COMMIT');
  committed = true;
  console.log('Local database initialized: ' + database);
  console.log('Applied ' + journal.entries.length + ' migrations; seeded synthetic accounts, class, lesson, PDF and quiz.');
  console.log('Account credentials (local only; do not share): ' + path.relative(root, accountsPath));
  console.log('Run corepack pnpm dev, then sign in as demo-admin, demo-teacher or demo-student.');
} catch (error) {
  if (client && !committed) await client.query('ROLLBACK').catch(() => {});
  if (!committed) for (const filename of createdFiles) await unlink(filename).catch(() => {});
  // No connection string, password, SQL values or database error detail in logs.
  console.error('Local setup failed: ' + (error.code ? 'database/file error ' + error.code : error.message));
  process.exitCode = 1;
} finally {
  if (client) await client.end().catch(() => {});
}
