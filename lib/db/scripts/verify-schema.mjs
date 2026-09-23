// Proves that a deployed database carries the same structure as the local one.
// Counting drizzle.__drizzle_migrations only proves how many files ran; it says
// nothing about whether the resulting tables match. This reads the structure
// itself, so a hand-edited or partially migrated server becomes visible.
//
// Capture one fingerprint per database, then compare the two files:
//   node scripts/verify-schema.mjs --out local.json
//   docker compose ... run --rm tools node lib/db/scripts/verify-schema.mjs --out server.json
//   node scripts/verify-schema.mjs --compare local.json server.json
//
// Exit status is 1 when the two differ, so a release script can gate on it.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i < 0 ? null : argv[i + 1] ?? null;
};

// Schemas PostgreSQL owns. Everything else belongs to this application.
const SYSTEM_SCHEMAS = "('pg_catalog','information_schema','pg_toast')";
const NOT_INTERNAL = `table_schema NOT IN ${SYSTEM_SCHEMAS} AND table_schema NOT LIKE 'pg\\_%'`;

// Always derived from the structure in hand, never read back from the file:
// a digest a caller could edit would let a mismatched server report as clean.
const digestOf = ({ migrations, enums, objects }) =>
  createHash('sha256').update(JSON.stringify({ migrations, enums, objects })).digest('hex');

async function capture() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not configured. Set it in the workspace .env.');
    process.exit(1);
  }
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    // Reading structure must never be able to change it.
    options: '-c default_transaction_read_only=on',
  });
  await client.connect();
  try {
    const { rows: [identity] } = await client.query('SELECT current_database() AS database');

    const { rows: columns } = await client.query(`
      SELECT table_schema AS s, table_name AS t, column_name AS c,
             data_type AS type, is_nullable AS nullable, column_default AS def,
             character_maximum_length AS len, numeric_precision AS prec, numeric_scale AS scale
      FROM information_schema.columns
      WHERE ${NOT_INTERNAL}
      ORDER BY 1, 2, 3`);

    const { rows: constraints } = await client.query(`
      SELECT n.nspname AS s, rel.relname AS t, con.conname AS name,
             pg_get_constraintdef(con.oid) AS def
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = rel.relnamespace
      WHERE n.nspname NOT IN ${SYSTEM_SCHEMAS} AND n.nspname NOT LIKE 'pg\\_%'
      ORDER BY 1, 2, 3`);

    const { rows: indexes } = await client.query(`
      SELECT schemaname AS s, tablename AS t, indexname AS name, indexdef AS def
      FROM pg_indexes
      WHERE schemaname NOT IN ${SYSTEM_SCHEMAS} AND schemaname NOT LIKE 'pg\\_%'
      ORDER BY 1, 2, 3`);

    // Enum labels are part of the contract: an importer writing a label the
    // server does not know fails at runtime, not at migration time.
    const { rows: enums } = await client.query(`
      SELECT n.nspname AS s, ty.typname AS name,
             array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
      FROM pg_type ty
      JOIN pg_namespace n ON n.oid = ty.typnamespace
      JOIN pg_enum e ON e.enumtypid = ty.oid
      WHERE n.nspname NOT IN ${SYSTEM_SCHEMAS} AND n.nspname NOT LIKE 'pg\\_%'
      GROUP BY 1, 2
      ORDER BY 1, 2`);

    let migrations = null;
    const { rows: journalled } = await client.query(
      `SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'`);
    if (journalled.length) {
      const { rows } = await client.query(
        'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at, id');
      migrations = { count: rows.length, hashes: rows.map((r) => r.hash) };
    }

    const objects = {};
    const put = (s, t, key, value) => {
      const id = `${s}.${t}`;
      (objects[id] ??= { columns: [], constraints: [], indexes: [] })[key].push(value);
    };
    for (const r of columns) {
      const width = r.len ?? (r.prec == null ? null : `${r.prec},${r.scale}`);
      put(r.s, r.t, 'columns',
        `${r.c} ${r.type}${width == null ? '' : `(${width})`}` +
        ` ${r.nullable === 'YES' ? 'NULL' : 'NOT NULL'}` +
        `${r.def == null ? '' : ` DEFAULT ${r.def}`}`);
    }
    for (const r of constraints) put(r.s, r.t, 'constraints', `${r.name} ${r.def}`);
    for (const r of indexes) put(r.s, r.t, 'indexes', `${r.name} ${r.def}`);

    const structure = {
      migrations,
      enums: Object.fromEntries(enums.map((r) => [`${r.s}.${r.name}`, r.labels])),
      objects,
    };
    return {
      database: identity.database,
      capturedAt: new Date().toISOString(),
      // Recorded for the human reading the file; comparison recomputes it.
      digest: digestOf(structure),
      ...structure,
    };
  } finally {
    await client.end();
  }
}

function compare(a, b, labelA, labelB) {
  const problems = [];
  const say = (line) => problems.push(line);
  const describe = (m) => (m ? m.count : 'no drizzle schema');

  if (a.migrations?.count !== b.migrations?.count) {
    say(`migrations: ${labelA}=${describe(a.migrations)}, ${labelB}=${describe(b.migrations)}`);
  }

  for (const [kind, left, right] of [['enum', a.enums, b.enums], ['table', a.objects, b.objects]]) {
    const all = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const id of all) {
      if (!(id in right)) { say(`${kind} ${id}: present in ${labelA}, missing in ${labelB}`); continue; }
      if (!(id in left)) { say(`${kind} ${id}: present in ${labelB}, missing in ${labelA}`); continue; }
      if (kind === 'enum') {
        if (JSON.stringify(left[id]) !== JSON.stringify(right[id])) {
          say(`enum ${id}: ${labelA}=[${left[id]}], ${labelB}=[${right[id]}]`);
        }
        continue;
      }
      for (const part of ['columns', 'constraints', 'indexes']) {
        for (const x of left[id][part].filter((v) => !right[id][part].includes(v))) {
          say(`${id} ${part}: only in ${labelA} -> ${x}`);
        }
        for (const x of right[id][part].filter((v) => !left[id][part].includes(v))) {
          say(`${id} ${part}: only in ${labelB} -> ${x}`);
        }
      }
    }
  }
  return problems;
}

if (argv[0] === '--compare') {
  const [, pathA, pathB] = argv;
  if (!pathA || !pathB) {
    console.error('Usage: verify-schema.mjs --compare <a.json> <b.json>');
    process.exit(1);
  }
  const a = JSON.parse(await readFile(pathA, 'utf8'));
  const b = JSON.parse(await readFile(pathB, 'utf8'));
  const labelA = a.database ?? pathA;
  const labelB = b.database ?? pathB;
  const [digestA, digestB] = [digestOf(a), digestOf(b)];
  for (const [label, file, stored, actual] of [[labelA, pathA, a.digest, digestA], [labelB, pathB, b.digest, digestB]]) {
    if (stored && stored !== actual) {
      console.error(`Warning: ${file} (${label}) was edited after capture; comparing its current contents.`);
    }
  }
  if (digestA === digestB) {
    console.log(`Identical structure: ${labelA} == ${labelB} (${digestA.slice(0, 12)})`);
    console.log(`Tables: ${Object.keys(a.objects).length}, migrations: ${a.migrations?.count ?? 'n/a'}`);
  } else {
    const problems = compare(a, b, labelA, labelB);
    console.error(`Structure differs: ${labelA} vs ${labelB}`);
    for (const line of problems) console.error('  ' + line);
    console.error(`\n${problems.length} difference(s).`);
    process.exitCode = 1;
  }
} else {
  let fingerprint;
  try {
    fingerprint = await capture();
  } catch (error) {
    console.error(`Schema capture failed (${error.code ?? 'unknown'}): ${error.message}`);
    process.exit(1);
  }
  const out = flag('--out');
  if (!out) {
    process.stdout.write(JSON.stringify(fingerprint, null, 2) + '\n');
  } else {
    await writeFile(out, JSON.stringify(fingerprint, null, 2));
    console.log(`${fingerprint.database}: ${Object.keys(fingerprint.objects).length} tables, ` +
      `${fingerprint.migrations?.count ?? 'no'} migrations, digest ${fingerprint.digest.slice(0, 12)}`);
    console.log(`Written to ${out}`);
  }
}
