import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  classesInCore,
  core,
  studentsInCore,
  subjectsInCore,
} from "./database";

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
  // A parent's own login. Distinct from STUDENT because a parent reads a
  // child's work and never does it: nothing a guardian can reach writes an
  // answer, sits a paper, or appears in a register as the child.
  "GUARDIAN",
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
    // The photograph, as a key into the same storage the textbooks use. On the
    // user rather than the teacher: a child has a face too, and one upload
    // path serving everybody beats rebuilding it for the second audience.
    photoKey: varchar("photo_key", { length: 300 }),
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
    // What the school employs them as, what they trained in, and the formal
    // teaching rank. The register carries the first of these; the other two
    // are the school's to fill in.
    jobTitleMn: varchar("job_title_mn", { length: 200 }),
    specialityMn: varchar("speciality_mn", { length: 200 }),
    departmentMn: varchar("department_mn", { length: 200 }),
    rankMn: varchar("rank_mn", { length: 100 }),
    // When they started teaching, not how many years they have taught: a
    // count is wrong the day after it is entered.
    serviceSince: date("service_since"),
    phone: varchar({ length: 40 }),
    email: varchar({ length: 200 }),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    // See core.students: invented rows must stay distinguishable from real
    // staff for as long as the two sit in the same table.
    dataOrigin: varchar("data_origin", { length: 10 }).default("REAL").notNull(),
  },
  (table) => [
    unique("teachers_user_id_key").on(table.userId),
    unique("teachers_teacher_code_key").on(table.teacherCode),
    check(
      "teachers_data_origin_check",
      sql`(data_origin)::text = ANY ((ARRAY['REAL'::character varying, 'MOCK'::character varying])::text[])`,
    ),
    check(
      "teachers_service_since_check",
      sql`service_since IS NULL OR service_since >= DATE '1950-01-01'`,
    ),
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

/**
 * Which classes a teacher is responsible for.
 *
 * Nothing linked a teacher to a class before this, so "list my classes" was
 * unanswerable. The same link decides which workflow a teacher sees: the
 * primary-grade flow (the teacher enters diagnostic scores from paper) and the
 * secondary-grade flow (the system scores a web exam and the teacher reviews)
 * differ per class, not per person.
 *
 * The stage is therefore derived from the class's grade rather than stored on
 * core.teachers. A teacher who takes both a 5th and a 6th grade class needs
 * both workflows, and a column on the account could only name one of them.
 *
 * The row is keyed on its own id rather than on (class, teacher). That pair
 * was the key until it met a small school, where one person takes maths and
 * physics for the same year group: the second subject had nowhere to go, and
 * the seed scripts worked around it by inventing a second teacher. The unique
 * constraint carries the real rule instead - a teacher holds a given subject
 * in a given class once - and NULLS NOT DISTINCT keeps the "covers every
 * subject" row unique too, which a plain UNIQUE would not, since SQL counts
 * two NULLs as different values.
 */
export const classTeachersInCore = core.table(
  "class_teachers",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "core.class_teachers_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    classId: bigint("class_id", { mode: "number" }).notNull(),
    teacherId: bigint("teacher_id", { mode: "number" }).notNull(),
    // Nullable: a primary-grade teacher usually covers every subject.
    subjectId: bigint("subject_id", { mode: "number" }),
    isActive: boolean("is_active").default(true).notNull(),
    assignedAt: timestamp("assigned_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("class_teachers_class_teacher_subject_key")
      .on(table.classId, table.teacherId, table.subjectId)
      .nullsNotDistinct(),
    index("idx_class_teachers_teacher").using(
      "btree",
      table.teacherId.asc().nullsLast().op("int8_ops"),
    ),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classesInCore.id],
      name: "class_teachers_class_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.teacherId],
      foreignColumns: [teachersInCore.id],
      name: "class_teachers_teacher_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "class_teachers_subject_id_fkey",
    }),
  ],
);

/**
 * What a teacher is qualified to teach - their specialty, not their timetable.
 *
 * This is NOT core.class_teachers. That table answers "who is answerable for
 * 6a's maths"; this one answers "who is a maths teacher at all". The school's
 * staff register carries the second and not the first, so keeping them apart
 * is what lets a teacher's screens work at all before the class assignments
 * arrive: a maths teacher can be shown every class that studies maths, which
 * is a wider answer than "my classes" but never a wrong one.
 *
 * A row per subject rather than a column on core.teachers, because the
 * register is full of paired specialties - "Багш, монгол хэл, уран зохиолын",
 * "Багш, хими-биологи", "Багш, англи-орос хэлний". Five of the eighteen
 * subject teachers hold two. A single column would have to drop one of them,
 * and dropping уран зохиол would leave nine classes with a book and no
 * teacher who can see it.
 *
 * isPrimary marks the one to show when a screen has room for a single label.
 * Primary-grade teachers get no rows at all: they cover every subject, so the
 * honest representation is an absence, and their screens have to wait for
 * core.class_teachers.
 */
export const teacherSubjectsInCore = core.table(
  "teacher_subjects",
  {
    teacherId: bigint("teacher_id", { mode: "number" }).notNull(),
    subjectId: bigint("subject_id", { mode: "number" }).notNull(),
    isPrimary: boolean("is_primary").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    // Where the claim came from, kept verbatim: the register's job-title text
    // is the only evidence, and a mapping made by reading Mongolian prose is
    // worth auditing later against what the school actually confirms.
    sourceTitle: varchar("source_title", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.teacherId, table.subjectId],
      name: "teacher_subjects_pkey",
    }),
    index("idx_teacher_subjects_subject").using(
      "btree",
      table.subjectId.asc().nullsLast().op("int8_ops"),
    ),
    foreignKey({
      columns: [table.teacherId],
      foreignColumns: [teachersInCore.id],
      name: "teacher_subjects_teacher_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.subjectId],
      foreignColumns: [subjectsInCore.id],
      name: "teacher_subjects_subject_id_fkey",
    }),
  ],
);

/**
 * Who to ring about this child.
 *
 * The admissions sheet carries "88111672-аав, 80111672-ээж" - two numbers and
 * which parent each belongs to - and the system had nowhere to put either. A
 * school that cannot reach a parent cannot run a parents' evening.
 *
 * relationMn is nullable because two thirds of the numbers arrive without one.
 * Inventing "Аав" for an unlabelled number would put a name to a person the
 * sheet never named. fullName is nullable for the same reason: the sheet gives
 * a number and a role at best, never a parent's name.
 *
 * This is the most sensitive table in core. Nothing on a child's own screens
 * needs another family's numbers, and a teacher needs them only for the
 * classes they are answerable for - so any listing built on it is scoped the
 * way core.class_teachers scopes a roll, never by role alone.
 */
export const studentGuardiansInCore = core.table(
  "student_guardians",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    relationMn: varchar("relation_mn", { length: 40 }),
    fullName: varchar("full_name", { length: 300 }),
    phone: varchar({ length: 40 }).notNull(),
    sequenceNo: smallint("sequence_no").notNull(),
    // The cell as it was written, so a re-parse can be checked against it.
    sourceNote: text("source_note"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("student_guardians_student_phone_key").on(table.studentId, table.phone),
    check("student_guardians_sequence_check", sql`sequence_no > 0`),
    index("idx_student_guardians_student").using(
      "btree",
      table.studentId.asc().nullsLast().op("int8_ops"),
    ),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "student_guardians_student_id_fkey",
    }).onDelete("cascade"),
  ],
);

/**
 * A parent's login, and the child it reads.
 *
 * Separate from student_guardians, which is the phone book the admissions
 * sheet fills in: a number to ring, and sometimes a name. This is an account -
 * somebody who signs in - and most of the numbers in that table will never
 * have one. Joining the two would mean either inventing logins for phone
 * numbers or losing the numbers that have no login.
 *
 * One active account per child, which is the school's rule: a parents' evening
 * arranged twice because two people both had the password is worse than one
 * arranged badly. A second parent is added by making the first inactive, and
 * the history stays.
 *
 * A guardian reads; they never write anything the child is answerable for.
 * That is enforced route by route, but the shape here says it too - there is
 * no column on this table that a child's work could hang from.
 */
export const guardianStudentsInCore = core.table(
  "guardian_students",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity({
      name: "core.guardian_students_id_seq",
      startWith: 1,
      increment: 1,
      minValue: 1,
      cache: 1,
    }),
    userId: bigint("user_id", { mode: "number" }).notNull(),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    relationMn: varchar("relation_mn", { length: 40 }),
    isActive: boolean("is_active").default(true).notNull(),
    linkedBy: bigint("linked_by", { mode: "number" }),
    linkedAt: timestamp("linked_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("guardian_students_user_student_key").on(table.userId, table.studentId),
    index("idx_guardian_students_student").using(
      "btree",
      table.studentId.asc().nullsLast(),
    ),
    index("idx_guardian_students_user").using("btree", table.userId.asc().nullsLast()),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [usersInCore.id],
      name: "guardian_students_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "guardian_students_student_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.linkedBy],
      foreignColumns: [usersInCore.id],
      name: "guardian_students_linked_by_fkey",
    }),
  ],
);

/**
 * A child who left, and where they went.
 *
 * The register's transfer sheet carries the school they moved to, why, when
 * the personal file was handed over and to whom, and when the removal was
 * processed. Without it the system cannot answer "how many left this term" and
 * last year's roll of 239 does not reconcile with this year's 247.
 *
 * leftClassMn is text rather than a class id on purpose. Four of these
 * children were in 8б, and 8б is not a class this year: a foreign key would
 * either fail the import or quietly drop the only record of which class they
 * left.
 *
 * The child keeps a core.students row with isActive false rather than being
 * deleted. A register that forgets who has been through it cannot produce a
 * leaving certificate, and a child who comes back should come back to their
 * own record.
 */
export const studentTransfersInCore = core.table(
  "student_transfers",
  {
    id: bigint({ mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    studentId: bigint("student_id", { mode: "number" }).notNull(),
    leftClassMn: varchar("left_class_mn", { length: 40 }),
    destinationMn: varchar("destination_mn", { length: 300 }),
    reasonMn: varchar("reason_mn", { length: 200 }),
    fileHandoverMn: varchar("file_handover_mn", { length: 120 }),
    removedOn: date("removed_on"),
    // The removal column holds a date for most rows and the word "Хийсэн" for
    // the rest. Both are kept: one says when, the other only that it happened.
    removedNoteMn: varchar("removed_note_mn", { length: 60 }),
    recordedAt: timestamp("recorded_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("student_transfers_student_key").on(table.studentId),
    index("idx_student_transfers_removed").using(
      "btree",
      table.removedOn.desc().nullsLast(),
    ),
    foreignKey({
      columns: [table.studentId],
      foreignColumns: [studentsInCore.id],
      name: "student_transfers_student_id_fkey",
    }).onDelete("cascade"),
  ],
);

/**
 * What a staff profile is made of, as rows a school can change.
 *
 * A field with a column_name is backed by a real column on core.teachers - the
 * ones the register fills - so the import, the timetable and the class screens
 * keep reading typed, constrained data. A field the school adds later has no
 * column and its values live in staffFieldValuesInCore. One list on screen,
 * two homes underneath.
 */
export const staffFieldsInCore = core.table(
  "staff_fields",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({ name: "core.staff_fields_id_seq", startWith: 1, increment: 1, minValue: 1, cache: 1 }),
    // Stable across renames: the label is what the school edits, this is what
    // the code refers to.
    fieldKey: varchar("field_key", { length: 60 }).notNull(),
    labelMn: varchar("label_mn", { length: 120 }).notNull(),
    columnName: varchar("column_name", { length: 60 }),
    valueKind: varchar("value_kind", { length: 20 }).default("TEXT").notNull(),
    sortOrder: smallint("sort_order").default(100).notNull(),
    // Whether the staff member may write it themselves. A telephone number is
    // theirs; a job title is a decision the school made about them.
    selfEditable: boolean("self_editable").default(false).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    unique("staff_fields_field_key_key").on(table.fieldKey),
    check(
      "staff_fields_value_kind_check",
      sql`value_kind IN ('TEXT', 'LONG_TEXT', 'DATE', 'PHONE', 'EMAIL')`,
    ),
    check(
      "staff_fields_builtin_stays_active",
      sql`column_name IS NULL OR is_active`,
    ),
  ],
);

/** Values of the fields that have no column of their own. */
export const staffFieldValuesInCore = core.table(
  "staff_field_values",
  {
    teacherId: bigint("teacher_id", { mode: "number" }).notNull(),
    fieldId: bigint("field_id", { mode: "number" }).notNull(),
    valueText: text("value_text"),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.teacherId, table.fieldId], name: "staff_field_values_pkey" }),
    foreignKey({
      columns: [table.teacherId],
      foreignColumns: [teachersInCore.id],
      name: "staff_field_values_teacher_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.fieldId],
      foreignColumns: [staffFieldsInCore.id],
      name: "staff_field_values_field_id_fkey",
    }).onDelete("cascade"),
  ],
);
