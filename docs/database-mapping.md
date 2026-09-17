# Existing database integration

Inspected `ej_learning_dev` on localhost:5432 on 2026-09-17 using read-only queries.
No tables, rows, statuses, or source materials were changed. Database passwords and
connection strings are not included in this document.

## Schema and API mapping

| Feature | Existing relations | Implementation |
|---|---|---|
| Student selection/profile | `core.students`, `core.student_enrollments`, `core.classes`, `core.grade_levels` | Active records, IDs preserved as strings; explicit selection |
| Class overview | `core.classes`, `core.student_enrollments`, `core.students` | Distinct active membership counts; no inferred class subject |
| Subjects | `core.subjects`, `content.skills`, `learning.student_skill_mastery` | Subjects with recorded student evidence; not a course-enrollment claim |
| Skill progress | `learning.student_skill_mastery`, `content.skills` | Existing mastery status, percentage, attempt count and assessment timestamp |
| Diagnostic history | `assessment.diagnostic_attempts` | Imported totals and status; not regraded |
| Web submission history | `assessment.web_diagnostic_submissions`, `assessment.web_diagnostic_answers`, `assessment.diagnostic_items` | Separate history entries; no inferred link/deduplication to imported attempts |
| Pending review | Same web diagnostic tables | Each answer is a review row; dashboard counts submissions, not answers |
| Teacher catalog | `learning.daily_lessons`, `learning.tasks`, `learning.mastery_checks`, `content.skills`, `content.source_materials` | Draft-aware read-only catalog; answer guides omitted |
| Student lesson reader | Approved, web-ready `learning.daily_lessons` for an active class grade | Lesson + skill + referenced source must be approved; recovery lesson also requires an approved recovery skill |
| Future imports | `staging.import_jobs`, `staging.import_rows` | Existing storage candidates; Google integration is not connected |

Counts at inspection: 26 students, 2 classes, 34 skills, 41 lessons, 82 tasks,
65 mastery checks, 265 mastery records, 26 imported diagnostic attempts, and
6 web submissions (4 pending, 2 reviewed). All skills, lessons, tasks and mastery
checks were DRAFT. These are observations, not hardcoded application counts.

Mastery mapping: `MASTERED → mastered`, `DEVELOPING → developing`,
`GAP → needs_support`, `NOT_ASSESSED → unassessed`. Existing evidence for draft
skills remains visible as history; a draft does not become approved by having
an assessment record. New unassessed skills are included only if approved and
appropriate for an active class grade. A missing score is not invented. Source
fractional total scores are retained. Web scores remain null until every answer
has a score and the submission is REVIEWED.

## Deliberate gaps

`learning.daily_lessons` is a content catalog, not a student/date assignment table.
There is no assignment start/step state or idempotent per-lesson submission table
in the inspected schema. There is also no class-to-subject relation, current-topic
record or authenticated teacher identity mapping. The UI does not invent these.
The student page is a lesson catalog, not a daily completion report. All writes
return `409 READ_ONLY_PREVIEW` until the authenticated workflow is implemented.

`content.source_versions.storage_key` is a storage reference, not a public URL.
No PDF URL is fabricated. The next phase must connect source storage, explicit
approvals, assignment persistence and authenticated learner/teacher access.

## Local operation and boundaries

Set `EJ_LOCAL_PREVIEW=true` in the ignored root `.env`, then run `corepack pnpm dev`.
Choose a student in the app dropdown, or optionally set `LOCAL_STUDENT_ID`.
The dropdown sends `X-Preview-Student-Id`; this is a development selection, not
authentication. No student is silently selected. Teacher views are also local
preview views, not authorized teacher sessions.

API and frontend bind to loopback by default. Preview routes require the explicit
flag, a loopback peer, a localhost host/origin, and non-production NODE_ENV.
Responses are no-store. Each repository query runs in a PostgreSQL READ ONLY
transaction. Deployment must implement real authentication; preview fails closed
in production. Do not expose this local preview through a tunnel or shared proxy.

The active router is `artifacts/api-server/src/routes/native-learning.ts`; SQL reads
are in `artifacts/api-server/src/lib/native-learning.ts`. The previous demo router
and `lib/db/src/schema/ej-learning.ts` remain as legacy reference, but are not the
active storage model. **Do not run Drizzle push from those legacy models against
this database.** Future migrations must be additive and reviewed against the real
schema. No migration is required for this read-only phase.

## Verification

`corepack pnpm build` checks types and builds the apps. After building, run
`corepack pnpm test:db` for read-only integration checks against the configured
database: identities, class counts, per-student evidence, catalog sizes, draft
exclusion, invalid selections and blocked mutations. Tests do not print names,
answers or credentials and do not insert fixtures into the database.
