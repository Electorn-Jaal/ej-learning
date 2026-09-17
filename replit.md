# EJ Learning

A Mongolian-language adaptive learning pilot that connects daily work, skill evidence, prerequisite support, teacher review, and progress.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for student and teacher API contracts
- `lib/db/src/schema/ej-learning.ts` — pilot persistence for attempts, reviews, and class topics
- `lib/db/src/schema/workspace-integrations.ts` — mock Workspace course references, import batches, and audit events
- `artifacts/api-server/src/routes/ej-learning.ts` — EJ Learning API implementation
- `artifacts/ej-learning/src/` — Mongolian student and teacher web interface
- `artifacts/ej-learning/src/index.css` — application design tokens and typography

## Architecture decisions

- The first build uses clearly labeled demo content because the referenced design document, migrations, live schema, and workbook were not supplied.
- Missing or unapproved learning material is shown as unavailable; the app must not fabricate content or silently treat drafts as approved.
- Attempt start, submission, review, and class-topic changes are server operations; idempotency keys protect submission and review retries.
- Authentication is intentionally reported as not configured until managed Clerk is set up. Preview role navigation is not a security boundary.
- PostgreSQL is the system of record. Classroom, Sheets, and Drive are external sources/distribution channels; Forms is an optional legacy bridge.
- Workspace simulations are bounded mock operations, not real Google authorization. Each action is atomic, audit-backed, and replay-safe.
- The existing supplied schema must be inspected before extending the pilot tables or importing real educational content.

## Product

- Student “Өнөөдрийн ажил” dashboard with recommendation reasons, time estimates, and explicit next actions
- Lesson reader with explanation, example, unavailable PDF state, objective checks, and teacher-reviewed written responses
- Skill progress and attempt evidence history
- Teacher class overview, current-topic planning, and rubric review queue
- Teacher Workspace integration showcase with data ownership, validation pipeline, mock sync/import actions, and audit history

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
