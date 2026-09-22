import { readRows } from "@workspace/db";

/** The term a date falls in, with the year and name a screen can print. */
export const termOn = (isoDate: string) =>
  readRows<{
    schoolYear: string;
    termNumber: number;
    name: string;
    startsOn: string;
    endsOn: string;
  }>(
    `SELECT school_year AS "schoolYear", term_number::int AS "termNumber",
       name_mn AS name, starts_on::text AS "startsOn", ends_on::text AS "endsOn"
     FROM learning.terms
     WHERE $1::date BETWEEN starts_on AND ends_on
     ORDER BY term_number
     LIMIT 1`,
    [isoDate],
  );

/**
 * The school's bell times for a year, in order.
 *
 * Every period is returned whether or not anything is timetabled in it: the
 * grid draws a row per period, and a missing row would close a gap in the day
 * that is really there.
 */
export const schoolPeriods = (schoolYear: string) =>
  readRows<{ periodNo: number; nameMn: string | null; startsAt: string; endsAt: string }>(
    `SELECT period_no::int AS "periodNo", name_mn AS "nameMn",
       to_char(starts_at, 'HH24:MI') AS "startsAt",
       to_char(ends_at, 'HH24:MI') AS "endsAt"
     FROM learning.class_periods
     WHERE school_year = $1
     ORDER BY period_no`,
    [schoolYear],
  );
