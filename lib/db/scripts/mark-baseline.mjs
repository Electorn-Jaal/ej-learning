// One-time: records drizzle/0000 as applied without executing it.
//
// 0000 was produced by `drizzle-kit introspect` against a database whose tables
// already existed, so its body is wrapped in /* */. drizzle-orm's migrator
// splits each file on `--> statement-breakpoint` before executing, which cuts
// that comment into fragments that are valid SQL again - it would try to
// CREATE SCHEMA "content" over the live database. Marking it applied is the
// documented way to adopt migrations on an existing schema.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not configured. Set it in the workspace .env.');
  process.exit(1);
}

const folder = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../drizzle');
const journal = JSON.parse(fs.readFileSync(path.join(folder, 'meta/_journal.json'), 'utf8'));
const baseline = journal.entries.find((entry) => entry.idx === 0);
if (!baseline) {
  console.error('No baseline entry (idx 0) in meta/_journal.json.');
  process.exit(1);
}

const sql = fs.readFileSync(path.join(folder, `${baseline.tag}.sql`), 'utf8');
if (!sql.includes('/*')) {
  console.error(`${baseline.tag} is not a commented-out introspection baseline. Refusing.`);
  process.exit(1);
}
// Must match drizzle-orm readMigrationFiles: sha256 over the whole file.
const hash = crypto.createHash('sha256').update(sql).digest('hex');

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  await client.query(`CREATE SCHEMA IF NOT EXISTS drizzle`);
  await client.query(`CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
    id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)`);
  const { rowCount } = await client.query(
    `INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
     SELECT $1, $2
     WHERE NOT EXISTS (SELECT 1 FROM drizzle.__drizzle_migrations WHERE hash = $1)`,
    [hash, baseline.when],
  );
  console.log(
    rowCount
      ? `Baseline ${baseline.tag} marked as applied.`
      : `Baseline ${baseline.tag} was already recorded. No change.`,
  );
} catch (error) {
  console.error(`Failed (${error.code ?? 'unknown'}): ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
