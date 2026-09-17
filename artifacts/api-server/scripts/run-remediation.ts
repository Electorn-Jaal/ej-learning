/**
 * Books extra work for every student who is currently behind.
 *
 *   node scripts/run-ts.mjs scripts/run-remediation.ts --yes [--on YYYY-MM-DD]
 *
 * The live path does this for one student the moment they answer. This is the
 * same decision applied to everyone at once - for students whose evidence
 * arrived before the rule existed, and as the shape of the nightly job that
 * should eventually run this on its own.
 *
 * Nothing is assigned to a student with no measured gap. No evidence is not
 * the same as no problem, and inventing work for a student nobody has assessed
 * would be a guess wearing the clothes of a decision.
 */
import { pool, readRows } from "@workspace/db";
import { assignRemediation, recommendationsFor, reasonFor } from "../src/modules/learning/remediation";

if (!process.argv.includes("--yes")) {
  console.error("Refusing to run without --yes.");
  process.exit(1);
}

const onFlag = process.argv.indexOf("--on");
const tomorrow = () => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(
    new Date(),
  );
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
};
const assignedOn = onFlag > -1 ? process.argv[onFlag + 1] : tomorrow();

try {
  const all = await recommendationsFor(null);
  const students = [...new Set(all.map((row) => row.studentId))];

  console.log(`${assignedOn}: ${all.length} gap(s) across ${students.length} student(s).`);

  let booked = 0;
  let heldByTeacher = 0;
  for (const studentId of students) {
    const result = await assignRemediation(studentId, assignedOn);
    if (!result) continue;
    if (result.written) booked += 1;
    else heldByTeacher += 1;
    const step = result.depth === 0 ? "давтана" : `${result.depth} алхам буцна`;
    console.log(
      `  ${result.written ? "→" : "·"} ${result.originSkillName} (${result.originScore}%) ` +
        `${step}: ${result.targetSkillName}`,
    );
  }

  console.log(`Booked ${booked}; ${heldByTeacher} left alone because a teacher had set that day.`);

  if (students.length === 0) {
    // Not a failure and not an empty database: it means nobody currently has a
    // measured gap. The placement rows the CEFR import wrote are a different
    // thing and are deliberately not listed here.
    console.log("Nobody has a measured gap, so nothing was booked.");
  } else {
    const names = await readRows<{ display_name: string; reason: string }>(
      `SELECT st.display_name, sa.reason
       FROM learning.student_assignments sa
       JOIN core.students st ON st.id = sa.student_id
       WHERE sa.assigned_on = $1::date AND sa.source = 'AUTO'
         AND sa.student_id = ANY($2::bigint[])
       ORDER BY st.display_name`,
      [assignedOn, students],
    );
    for (const row of names) console.log(`  ${row.display_name}: ${row.reason}`);
  }
} catch (error) {
  const cause = (error as { cause?: { message?: string; detail?: string } }).cause;
  console.error(`Failed: ${error instanceof Error ? error.message : String(error)}`);
  if (cause?.message) console.error(`  ${cause.message}`);
  if (cause?.detail) console.error(`  ${cause.detail}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
