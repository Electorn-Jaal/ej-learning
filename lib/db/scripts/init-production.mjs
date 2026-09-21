// Explicit, schema-only bootstrap. Refuses any non-empty database; no demo seed.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

if (process.argv[2] !== '--empty-database' || !process.env.DATABASE_URL) {
  console.error('Use init-production.mjs --empty-database with DATABASE_URL set.');
  process.exit(1);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await client.connect();
  await client.query('BEGIN');
  await client.query("SELECT pg_advisory_xact_lock(hashtext('ej-learning-production-init'))");
  const { rows } = await client.query(`
    SELECT 1 FROM pg_namespace WHERE nspname <> 'public'
      AND nspname <> 'information_schema' AND nspname NOT LIKE 'pg_%'
    UNION ALL SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public'
    UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    UNION ALL SELECT 1 FROM pg_extension WHERE extname <> 'plpgsql' LIMIT 1`);
  if (rows.length) throw new Error('Database is not empty; initialization refused.');
  const folder = new URL('../drizzle/', import.meta.url);
  const journal = JSON.parse(await readFile(new URL('meta/_journal.json', folder), 'utf8'));
  await client.query('CREATE SCHEMA drizzle');
  await client.query('CREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)');
  for (const entry of journal.entries) {
    const source = await readFile(new URL(entry.tag + '.sql', folder), 'utf8');
    let sql = source;
    if (entry.idx === 0) {
      const begin = source.indexOf('/*');
      const end = source.lastIndexOf('*/');
      if (begin < 0 || end < begin || source.slice(end + 2).trim()) throw new Error('Unexpected baseline format.');
      // Same baseline normalization as the existing, tested local bootstrap.
      sql = source.slice(begin + 2, end).replace(/CREATE INDEX[^;]+;/g,
        statement => statement.replace(/\s+(?:int[248]|text|uuid|enum)_ops\b/g, ''));
    }
    await client.query(sql);
    await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1,$2)',
      [createHash('sha256').update(source).digest('hex'), entry.when]);
  }
  await client.query('COMMIT');
  console.log(`Initialized schema with ${journal.entries.length} migrations; no accounts or demo data created.`);
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Initialization failed: ' + (error.code ?? error.message));
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
