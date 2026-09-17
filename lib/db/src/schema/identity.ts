import {
  bigint,
  boolean,
  foreignKey,
  index,
  primaryKey,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { core, studentsInCore, subjectsInCore } from "./database";

/**
 * Account identity for the application.
 *
 * The database had no notion of a user: core.students carries a display name
 * only, there was no teacher table, and every "who did this" column
 * (audit.change_logs.changed_by, staging.import_jobs.created_by/approved_by,
 * assessment.web_diagnostic_submissions.reviewed_by) is a free-text varchar
 * with nothing behind it. Approving material, assigning work and reviewing an
 * answer all need a real actor, so they are all blocked on this table.
 *
 * The link to core.students is held here rather than as students.user_id, so
 * this module depends on the introspected baseline and never the other way
 * round. A student record can exist before anyone can sign in as that student.
 */
export const userRoleInCore = core.enum("user_role", [
  "STUDENT",
  "TEACHER",
  "ADMIN",
]);

export const usersInCore = core.table(
  "users",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "core.users_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    username: varchar({ length: 100 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 300 }).notNull(),
    studentId: bigint("student_id", { mode: "number" }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("users_username_key").on(table.username),
    // One account per student record at most.
    unique("users_student_id_key").on(table.studentId),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "users_student_id_fkey",
    }),
  ],
);

/**
 * Roles are a set, not a column: a teacher can also be an admin, and the
 * committee-style flows that come later need that without a second account.
 */
export const userRolesInCore = core.table(
  "user_roles",
  {
    userId: bigint("user_id", { mode: "number" }).notNull(),
    role: userRoleInCore().notNull(),
    grantedAt: timestamp("granted_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.role], name: "user_roles_pkey" }),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInCore.id],
      name: "user_roles_user_id_fkey",
    }).onDelete("cascade"),
  ],
);

export const teachersInCore = core.table(
  "teachers",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "core.teachers_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    teacherCode: varchar("teacher_code", { length: 100 }).notNull(),
    // Nullable: an admin or a teacher of record may not map to one subject.
    subjectId: bigint("subject_id", { mode: "number" }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("teachers_user_id_key").on(table.userId),
    unique("teachers_teacher_code_key").on(table.teacherCode),
    index("idx_teachers_subject").using(
      "btree",
      table.subjectId.asc().nullsLast().op("int8_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInCore.id],
      name: "teachers_user_id_fkey",
    }),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "teachers_subject_id_fkey",
    }),
  ],
);

/**
 * Server-side sessions.
 *
 * Opaque tokens rather than JWTs: the browser holds a random string, the
 * server holds its SHA-256, and sign-out or a compromised account revokes
 * immediately by row. A stateless JWT cannot be withdrawn before it expires,
 * which is the wrong trade for a school system where an account is handed
 * over, a teacher leaves mid-term, or a shared classroom machine stays signed
 * in. Only the hash is stored, so a dump of this table cannot be replayed.
 */
export const sessionsInCore = core.table(
  "sessions",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "core.sessions_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "string" }),
  },
  (table) => [
    unique("sessions_token_hash_key").on(table.tokenHash),
    index("idx_sessions_user").using(
      "btree",
      table.userId.asc().nullsLast().op("int8_ops"),
    ),
    index("idx_sessions_expires").using(
      "btree",
      table.expiresAt.asc().nullsLast(),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInCore.id],
      name: "sessions_user_id_fkey",
    }).onDelete("cascade"),
  ],
);
