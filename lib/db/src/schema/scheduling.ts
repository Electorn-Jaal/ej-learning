import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  smallint,
  text,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { classesInCore, dailyLessonsInLearning, learning } from "./database";
import { usersInCore } from "./identity";

/**
 * The three terms of a school year.
 *
 * A book is divided across them per grade, so the term is what a schedule
 * hangs off. Kept as rows rather than a computed date range because term
 * boundaries move: they are set by the school each year, not by a formula.
 */
export const termsInLearning = learning.table(
  "terms",
  {
    id: smallint()
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.terms_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        maxValue: 32767,
        cache: 1,
      }),
    schoolYear: varchar("school_year", { length: 20 }).notNull(),
    termNumber: smallint("term_number").notNull(),
    nameMn: varchar("name_mn", { length: 50 }).notNull(),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on").notNull(),
  },
  (table) => [
    unique("terms_year_number_key").on(table.schoolYear, table.termNumber),
    check("terms_term_number_check", sql`term_number BETWEEN 1 AND 3`),
    check("terms_range_check", sql`ends_on >= starts_on`),
  ],
);

/**
 * What a class studies on a given day.
 *
 * One lesson per class per day, enforced by the unique key: the product gives
 * a student "today's lesson", so two rows for one day would have no defined
 * answer. A day with no row is a day with no lesson, which is what holidays
 * and exam days are.
 *
 * createdBy records who put it there - the admin seeding a default plan or the
 * teacher overriding it for their own class. It is the first column in the
 * schema to actually point at core.users rather than hold a name as text.
 */
export const classScheduleInLearning = learning.table(
  "class_schedule",
  {
    id: bigint({ mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity({
        name: "learning.class_schedule_id_seq",
        startWith: 1,
        increment: 1,
        minValue: 1,
        cache: 1,
      }),
    classId: bigint("class_id", { mode: "number" }).notNull(),
    termId: smallint("term_id").notNull(),
    dailyLessonId: bigint("daily_lesson_id", { mode: "number" }).notNull(),
    scheduledOn: date("scheduled_on").notNull(),
    note: text(),
    createdBy: bigint("created_by", { mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    unique("class_schedule_class_day_key").on(table.classId, table.scheduledOn),
    index("idx_class_schedule_day").using(
      "btree",
      table.scheduledOn.asc().nullsLast(),
    ),
    index("idx_class_schedule_term").using("btree", table.termId.asc().nullsLast()),
    foreignKey({
      columns: [table.classId],
      foreignColumns: [classesInCore.id],
      name: "class_schedule_class_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.termId],
      foreignColumns: [termsInLearning.id],
      name: "class_schedule_term_id_fkey",
    }),
    foreignKey({
      columns: [table.dailyLessonId],
      foreignColumns: [dailyLessonsInLearning.id],
      name: "class_schedule_daily_lesson_id_fkey",
    }),
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [usersInCore.id],
      name: "class_schedule_created_by_fkey",
    }),
  ],
);
