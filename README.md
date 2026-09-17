# EJ Learning — local development

Requires Node.js 24+, Corepack and PostgreSQL. On Windows PowerShell use
`corepack pnpm` (or `npm.cmd` for npm) so no execution-policy change is needed.

```powershell
corepack pnpm install
Copy-Item .env.example .env
# Edit .env: replace CHANGE_ME with the existing PostgreSQL password.
corepack pnpm db:check
corepack pnpm dev
```

Do not overwrite an existing `.env`. Credentials containing URL-special characters
must be percent-encoded. The app uses `DATABASE_URL`; the example targets
`localhost:5432/ej_learning_dev`, but that is not proof of the connected database.
`db:check` makes a read-only connection and prints the actual database and table
names without printing the connection string or password.

Frontend: http://localhost:5173. API: http://localhost:5000/api.
Set `EJ_LOCAL_PREVIEW=true` in `.env` and select a student in the app dropdown.
This is a local read-only view of the existing database, not authenticated access.
It is disabled in production. Both servers bind to loopback by default.
Vite proxies `/api` to the backend in development and preview. Change `WEB_PORT`
and `API_PORT` in `.env` if needed. The API and database commands load the root
`.env`; existing process variables take precedence. Separate `PORT` overrides
remain available for hosted processes. Local `pnpm dev` uses the separate ports.

```powershell
corepack pnpm typecheck
corepack pnpm build
corepack pnpm --filter @workspace/api-spec run codegen
```

The API dev command builds and starts the server; restart it after backend edits.
The frontend supports Vite hot reload. The auxiliary mockup sandbox defaults to
port 5174 and can be started separately.

## Existing database

The active API reads the existing `core`, `content`, `learning` and `assessment`
schemas. It displays real student progress, class counts, diagnostic history and
the teacher's draft catalog. No seed or migration is required for the existing DB.
See [database mapping](docs/database-mapping.md) for relationships and limitations.
The old `ej_learning_*` Drizzle models are legacy reference only: do not run
`db push` against the existing database using those models.

After building, `corepack pnpm test:db` verifies the read-only API against the
configured database, including every active student's evidence and draft exclusion.

## Google Workspace

The integration screen reports Google as not connected; mock writes are disabled
in the real-data preview. See
[the readiness assessment](docs/google-workspace-readiness.md) for the actual
implementation gaps and Google Cloud setup needed to continue.
