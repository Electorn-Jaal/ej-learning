// Row counts for every application table, plus the data_origin breakdown.
//
// This is the before/after evidence for any data move: capture it on the source,
// restore, capture it on the target, and the two must match. A restore that
// "succeeded" while silently dropping a table is otherwise invisible until a
// teacher opens a screen that has no rows behind it.
//
//   node scripts/census.mjs                      # human-readable table
//   node scripts/census.mjs --out before.json    # machine-readable snapshot
//   node scripts/census.mjs --compare a.json b.json
//
// Exit status is 1 when two snapshots disagree.
import { readFile, writeFile } from 'node:fs/promises';
import pg from 'pg';

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i < 0 ? null : argv[i + 1] ?? null;
};

// Identifiers come from the catalogue, never from user input, but they are still
// interpolated into SQL — quote them so an unusual name cannot change the query.
const quote = (name) => '"' + name.replaceAll('"', '""') + '"';

async function capture() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not configured. Set it in the workspace .env.');
    process.exit(1);
  }
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5000,
    options: '-c default_transaction_read_only=on',
  });
  await client.connect();
  try {
    const { rows: [identity] } = await client.query('SELECT current_database() AS database');
    const { rows: tables } = await client.query(`
      SELECT table_schema AS s, table_name AS t
      FROM information_schema.tables
      WHERE table_type = 'BASE TABLE'
        AND table_schema NOT IN ('pg_catalog', 'information_schema', 'drizzle')
        AND table_schema NOT LIKE 'pg\\_%'
      ORDER BY 1, 2`);
    const { rows: tagged } = await client.query(`
      SELECT table_schema AS s, table_name AS t
      FROM information_schema.columns
      WHERE column_name = 'data_origin'`);
    const hasOrigin = new Set(tagged.map((r) => `${r.s}.${r.t}`));

    const counts = {};
    const origins = {};
    for (const { s, t } of tables) {
      const id = `${s}.${t}`;
      const relation = `${quote(s)}.${quote(t)}`;
      const { rows: [row] } = await client.query(`SELECT count(*)::int AS n FROM ${relation}`);
      counts[id] = row.n;
      if (!hasOrigin.has(id) || row.n === 0) continue;
      const { rows } = await client.query(
        `SELECT COALESCE(data_origin::text, '(null)') AS origin, count(*)::int AS n
         FROM ${relation} GROUP BY 1 ORDER BY 1`);
      origins[id] = Object.fromEntries(rows.map((r) => [r.origin, r.n]));
    }
    return {
      database: identity.database,
      capturedAt: new Date().toISOString(),
      totalRows: Object.values(counts).reduce((a, b) => a + b, 0),
      counts,
      origins,
    };
  } finally {
    await client.end();
  }
}

function report(census) {
  const entries = Object.entries(census.counts);
  const filled = entries.filter(([, n]) => n > 0);
  const empty = entries.filter(([, n]) => n === 0).map(([id]) => id);
  const width = Math.max(...filled.map(([id]) => id.length), 10);

  console.log(`${census.database} — ${census.totalRows} rows in ${filled.length} tables`);
  console.log('');
  for (const [id, n] of filled.sort((a, b) => b[1] - a[1])) {
    const origin = census.origins[id];
    const suffix = origin ? '   ' + Object.entries(origin).map(([k, v]) => `${k}=${v}`).join(' ') : '';
    console.log(`${String(n).padStart(7)}  ${id.padEnd(width)}${suffix}`);
  }
  if (empty.length) {
    console.log('');
    console.log(`Empty (${empty.length}):`);
    for (const id of empty) console.log(`         ${id}`);
  }
}

if (argv[0] === '--compare') {
  const [, pathA, pathB] = argv;
  if (!pathA || !pathB) {
    console.error('Usage: census.mjs --compare <a.json> <b.json>');
    process.exit(1);
  }
  const a = JSON.parse(await readFile(pathA, 'utf8'));
  const b = JSON.parse(await readFile(pathB, 'utf8'));
  const ids = [...new Set([...Object.keys(a.counts), ...Object.keys(b.counts)])].sort();
  const problems = [];
  for (const id of ids) {
    const left = a.counts[id];
    const right = b.counts[id];
    if (left === right) continue;
    problems.push(`${id}: ${a.database}=${left ?? 'table missing'}, ${b.database}=${right ?? 'table missing'}`);
  }
  if (!problems.length) {
    console.log(`Row counts match: ${a.database} == ${b.database} (${a.totalRows} rows, ${ids.length} tables)`);
  } else {
    console.error(`Row counts differ: ${a.database} vs ${b.database}`);
    for (const line of problems) console.error('  ' + line);
    console.error(`\n${problems.length} table(s) differ.`);
    process.exitCode = 1;
  }
} else {
  let census;
  try {
    census = await capture();
  } catch (error) {
    console.error(`Census failed (${error.code ?? 'unknown'}): ${error.message}`);
    process.exit(1);
  }
  const out = flag('--out');
  report(census);
  if (out) {
    await writeFile(out, JSON.stringify(census, null, 2));
    console.log('');
    console.log(`Written to ${out}`);
  }
}
