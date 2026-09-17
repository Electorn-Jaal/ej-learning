import pg from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not configured. Set it in the workspace .env.');
  process.exit(1);
}
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  options: '-c default_transaction_read_only=on',
});
try {
  await client.connect();
  const { rows: [identity] } = await client.query(
    'SELECT current_database() AS database, current_user AS role, inet_server_addr() AS host, inet_server_port() AS port',
  );
  console.log(JSON.stringify(identity, null, 2));
  const { rows } = await client.query(`
    SELECT table_schema, table_name FROM information_schema.tables
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
    ORDER BY table_schema, table_name
  `);
  console.table(rows);
  if (identity.database !== 'ej_learning_dev') {
    console.error('Database differs from the expected ej_learning_dev. No changes made.');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(`Database check failed (${error.code ?? 'unknown'}). Check credentials, host and database name.`);
  process.exitCode = 1;
} finally {
  await client.end();
}
