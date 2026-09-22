import { db, readRows } from '@workspace/db';
import { sql } from 'drizzle-orm';

export const findDayPlan = (studentId: number, onDate: string) =>
  readRows<{ body: string }>(
    `SELECT body FROM learning.student_day_plans
     WHERE student_id = $1::bigint AND plan_on = $2::date`,
    [studentId, onDate],
  );

export async function saveDayPlan(studentId: number, onDate: string, body: string | null) {
  if (body === null) {
    await db.execute(sql`
      DELETE FROM learning.student_day_plans
      WHERE student_id = ${studentId} AND plan_on = ${onDate}::date`);
    return;
  }
  await db.execute(sql`
    INSERT INTO learning.student_day_plans (student_id, plan_on, body)
    VALUES (${studentId}, ${onDate}::date, ${body})
    ON CONFLICT ON CONSTRAINT student_day_plans_student_day_key DO UPDATE SET
      body = EXCLUDED.body,
      updated_at = now()`);
}
