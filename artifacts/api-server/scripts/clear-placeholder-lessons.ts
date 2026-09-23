/**
 * Empties the filler a seeder wrote into lessons that came from a book.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server clear-placeholder-lessons
 * Apply:             pnpm --filter @workspace/api-server clear-placeholder-lessons -- --apply --yes
 *
 * When the school's timetable was imported, every section of every book got a
 * lesson row, and the rows were filled with sentences nobody wrote: "Жишээ
 * бодолт энд орно." under the heading Жишээ, "Номын дасгалыг гүйцэтгэнэ."
 * under Бие даан хийх. A child opening their day read three headings and
 * three sentences that told them nothing, and the page looked like a lesson
 * while containing none.
 *
 * An empty field is honest and the screens already handle it: a section with
 * no body is not drawn, so what remains is the section title, the book, the
 * pages and the teacher's own instruction - all of which are true. The text is
 * matched exactly, so anything a person has since written is left alone.
 */
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

/** Exactly what the seeder wrote, column by column. Nothing else is touched. */
const FILLER: { column: string; texts: string[] }[] = [
  {
    column: "remember_mn",
    texts: [
      "Номын энэ сэдвийг уншиж, дасгалыг гүйцэтгэнэ.",
      "Энэ бол хуваарийг харуулах зорилгоор оруулсан жишээ агуулга.",
    ],
  },
  { column: "worked_example_mn", texts: ["Жишээ бодолт энд орно."] },
  { column: "independent_practice_mn", texts: ["Номын дасгалыг гүйцэтгэнэ."] },
  {
    column: "student_message_mn",
    texts: [
      "Номын сэдвээр явна.",
      "Жишээ агуулга — жинхэнэ сургалтын материал биш.",
    ],
  },
];

const client = await pool.connect();
try {
  for (const field of FILLER) {
    const { rows: [count] } = await client.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM learning.daily_lessons
        WHERE ${field.column} = ANY($1::text[])`,
      [field.texts],
    );
    console.log(`${field.column.padEnd(26)} ${count!.n} мөр`);
  }

  if (!apply) {
    console.log("\nТуршилт. Устгахдаа --apply --yes нэм.");
  } else {
    await client.query("BEGIN");
    try {
      let cleared = 0;
      for (const field of FILLER) {
        const result = await client.query(
          `UPDATE learning.daily_lessons SET ${field.column} = NULL
            WHERE ${field.column} = ANY($1::text[])`,
          [field.texts],
        );
        cleared += result.rowCount ?? 0;
      }
      await client.query("COMMIT");

      const { rows: [left] } = await client.query<Record<string, string>>(`
        SELECT count(*)::text AS total,
               count(*) FILTER (
                 WHERE remember_mn IS NULL AND worked_example_mn IS NULL
                   AND guided_practice_mn IS NULL AND independent_practice_mn IS NULL
               )::text AS empty
          FROM learning.daily_lessons`);
      console.log(`\nЦэвэрлэлээ: ${cleared} талбар.`);
      console.log(`Хичээл нийт ${left!.total}, үүнээс ${left!.empty} нь одоо`
        + " бичигдсэн агуулгагүй — ном, хуудас, багшийн тайлбартай.");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
} finally {
  client.release();
  await pool.end();
}
