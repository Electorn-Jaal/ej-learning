// Applies drizzle/*.sql in journal order and records them in
// drizzle.__drizzle_migrations. Used instead of `drizzle-kit migrate`, whose
// CLI exits without applying anything on Windows.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not configured. Set it in the workspace .env.');
  process.exit(1);
}

const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../drizzle',
);
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder });
  const { rows } = await pool.query(
    'SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations',
  );
  console.log(`Migrations applied. Recorded entries: ${rows[0].n}`);
} catch (error) {
  console.error(`Migration failed (${error.code ?? 'unknown'}): ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
