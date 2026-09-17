# Google Workspace integration readiness

Assessment date: 2026-09-17. This is an implementation assessment, not a successful
connection test against a Google account.

Update after database integration: the active router is now `native-learning.ts`.
It reads the existing schemas in local read-only mode and reports Google as
`not_connected`. The legacy mock router below is no longer mounted. The actual
database has `staging.import_jobs`, `staging.import_rows`, `content.source_materials`
and `content.source_versions`; use the [database mapping](database-mapping.md)
when designing OAuth and imports. The old `ej_workspace_*` tables do not exist
in this database and should not be created automatically.

## Current implementation

- `artifacts/api-server/src/routes/ej-learning.ts` returns `mode: "mock"` and
  `mock_ready` source states. The simulate endpoint writes predefined data.
- PostgreSQL tables cover course references, import batch summaries and audit events.
- The UI and generated OpenAPI client already provide an integrations dashboard.
- No Google OAuth start/callback flow, refresh-token storage or live API clients
  were found in the application. The installed Replit connectors SDK is not wired
  into this feature.
- App authentication is not configured. Student identity and teacher display name
  are fixed demo values; teacher routes do not enforce a real teacher session.
- The workspace audit table has a unique index on `action`, suitable only for the
  bounded mock scenario. Repeated real syncs need a migration removing that index
  while retaining per-operation idempotency protection.
- Sheet row validation, question versions, Drive revision persistence and real
  roster membership mapping are described in the dashboard but not implemented
  as a complete import pipeline.

## Feasible next implementation

1. Inspect the existing `ej_learning_dev` schema, establish user/teacher identity
   and authorization, then design additive migrations compatible with that schema.
2. Configure a Google Cloud project with Classroom, Sheets and Drive APIs enabled,
   an OAuth consent screen/audience, test users if applicable, and a Web application
   OAuth client. Register an exact callback URL; the proposed local URL is
   `http://localhost:5173/api/integrations/google/callback` (route not built yet).
3. Implement server-side authorization-code OAuth with single-use session-bound
   state, offline access, encrypted refresh-token storage, reconnect and disconnect.
   Associate each connection with the authenticated teacher. Never expose secrets
   or refresh tokens through Vite variables, API responses or logs.
4. Start with Classroom course and roster reads, mapping external IDs to the
   existing classes and users. Handle pagination, token expiry and API errors.
5. Let the teacher select a Sheet and range; preview and validate rows into draft
   records, then explicitly approve versions before assigning student work.
6. Let the teacher select Drive materials; preserve file ID/version and access
   metadata, and connect approved material versions to assignments.
7. Add repeatable sync jobs with per-run idempotency, audit events and status.
   Test revocation, denied access, partial imports and retry behavior before enabling
   live mode. Classroom publishing can follow as a separate write feature.

## Initial permissions

| Feature | Candidate Google scope | Constraint |
|---|---|---|
| Classroom courses | `classroom.courses.readonly` | Only courses accessible to the authorizing user |
| Classroom roster | `classroom.rosters.readonly` | Additional profile scopes only if required |
| Selected Sheets and Drive files | `drive.file` | Use Google Picker or an explicit app file-selection flow; arbitrary file IDs do not grant access |
| Read all accessible Sheets if required | `spreadsheets.readonly` | Broader than selected-file access; not restricted to an individual tab |

Scope names above have the prefix `https://www.googleapis.com/auth/`.
`drive.file` is compatible with Sheets API access to the selected files. It permits
file writes too, so an import-only implementation should issue read operations.
Avoid broad Drive access unless the product actually needs it.

## Inputs still needed

- The existing PostgreSQL connection configuration and schema inspection results.
- Google Cloud project and OAuth client configuration; credentials belong in a
  local ignored environment file or a server secret store.
- The teacher account, pilot Classroom course, source Sheet/range and Drive files.
- Agreement on mapping source columns to the existing skill/question schema.

No live Google connectivity can be confirmed until authorization and API requests
are performed. Adding environment variables alone will not activate the mock UI.

## Official references

- [Server-side OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Classroom scopes](https://developers.google.com/workspace/classroom/guides/auth)
- [Sheets scopes](https://developers.google.com/workspace/sheets/api/scopes)
- [Drive scopes and file selection](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
