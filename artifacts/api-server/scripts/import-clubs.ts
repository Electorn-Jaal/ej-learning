/**
 * Registers the clubs the school's timetable names but has nowhere to put.
 *
 *   pnpm --filter @workspace/api-server import-clubs            # туршилт
 *   pnpm --filter @workspace/api-server import-clubs -- --apply
 *
 * Speaking club, БС and ДС-1 are written into the box where a class name goes,
 * because that was the only box there was. The hours are on the sheet; who
 * attends is not, and it is not anywhere else either - a club's membership
 * lives in the head of whoever runs it.
 *
 * So the hours are loaded and the membership is left empty, which is the
 * honest state: a club with no members appears on nobody's timetable, and
 * nobody is told they are in a club they never joined. The teacher fills the
 * list in from the clubs screen.
 *
 * Reading them off the spreadsheet was considered and rejected. The sheet
 * merges a double session into one box, spells the same teacher two ways, and
 * puts a subject name in the class column; a parser for it would be longer
 * than this list and would still need checking by hand. Three clubs are
 * quicker to read than to parse.
 */
import { pool } from "@workspace/db";

const apply = process.argv.includes("--apply");

/** Straight off the timetable: the teacher's name, and the hours they meet. */
const CLUBS = [
  {
    nameMn: "Speaking club",
    teacher: "Dennis",
    subject: "Англи хэл яриа",
    // Мягмар IX-X, Пүрэв IX-X. The sheet merges each pair into one box, which
    // is why they look like one hour and are two.
    sessions: [
      { weekdayNo: 2, periodNo: 9 },
      { weekdayNo: 2, periodNo: 10 },
      { weekdayNo: 4, periodNo: 9 },
      { weekdayNo: 4, periodNo: 10 },
    ],
  },
  {
    nameMn: "БС",
    teacher: "Т.Акерке",
    subject: "Англи хэл",
    sessions: [
      { weekdayNo: 2, periodNo: 10 },
      { weekdayNo: 5, periodNo: 9 },
    ],
  },
  {
    nameMn: "ДС-1",
    teacher: "Э.Дуламсүрэн",
    subject: "Япон хэл",
    sessions: [
      { weekdayNo: 2, periodNo: 9 },
      { weekdayNo: 2, periodNo: 10 },
      { weekdayNo: 4, periodNo: 9 },
      { weekdayNo: 4, periodNo: 10 },
    ],
  },
];

const [{ schoolYear }] = (await pool.query<{ schoolYear: string }>(
  `SELECT school_year AS "schoolYear" FROM core.classes WHERE is_active
    GROUP BY school_year ORDER BY count(*) DESC LIMIT 1`,
)).rows;

const planned: Array<{ club: (typeof CLUBS)[number]; teacherId: number | null; subjectId: number | null; exists: boolean }> = [];

for (const club of CLUBS) {
  // Matched on the display name with the spacing taken out, because the
  // register writes "А. Цэрэндулам" and the timetable writes "А.Цэрэндулам".
  const { rows: teacherRows } = await pool.query<{ id: number }>(
    `SELECT t.id::int AS id FROM core.teachers t JOIN core.users u ON u.id = t.user_id
      WHERE replace(lower(u.display_name), ' ', '') = replace(lower($1), ' ', '')
        AND t.is_active LIMIT 1`,
    [club.teacher],
  );
  const { rows: subjectRows } = await pool.query<{ id: number }>(
    "SELECT id::int AS id FROM core.subjects WHERE name_mn = $1 AND is_active LIMIT 1",
    [club.subject],
  );
  const { rows: already } = await pool.query<{ id: number }>(
    "SELECT id::int AS id FROM learning.clubs WHERE name_mn = $1 AND school_year = $2",
    [club.nameMn, schoolYear],
  );
  planned.push({
    club,
    teacherId: teacherRows[0]?.id ?? null,
    subjectId: subjectRows[0]?.id ?? null,
    exists: already.length > 0,
  });
}

for (const row of planned) {
  const bits = [
    row.exists ? "бүртгэлтэй" : "шинэ",
    `${row.club.sessions.length} цаг`,
    row.teacherId === null ? `БАГШ ОЛДСОНГҮЙ: ${row.club.teacher}` : row.club.teacher,
    row.subjectId === null ? `ХИЧЭЭЛ ОЛДСОНГҮЙ: ${row.club.subject}` : row.club.subject,
  ];
  console.log(`${row.club.nameMn}: ${bits.join(" · ")}`);
}

if (!apply) {
  console.log("\nТуршилт. Хэрэгжүүлэхдээ --apply нэм.");
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
let made = 0;
try {
  await client.query("BEGIN");
  for (const row of planned) {
    if (row.exists) continue;
    const created = await client.query<{ id: number }>(
      `INSERT INTO learning.clubs (name_mn, subject_id, teacher_id, school_year, note)
       VALUES ($1, $2::bigint, $3::bigint, $4, $5)
       RETURNING id::int AS id`,
      [row.club.nameMn, row.subjectId, row.teacherId, schoolYear,
       "Хуваариас оруулсан. Сурагчдыг нь багш өөрөө нэмнэ."],
    );
    const clubId = created.rows[0]!.id;
    await client.query(
      `INSERT INTO learning.club_sessions (club_id, weekday_no, period_no, valid_from)
       SELECT $1::bigint, x.weekday, x.period, CURRENT_DATE
         FROM unnest($2::smallint[], $3::smallint[]) AS x(weekday, period)
       ON CONFLICT ON CONSTRAINT club_sessions_key DO NOTHING`,
      [clubId, row.club.sessions.map((s) => s.weekdayNo),
       row.club.sessions.map((s) => s.periodNo)],
    );
    made += 1;
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
}

console.log(`\nБүртгэв: ${made} дугуйлан.`);
console.log("Сурагчид нь хоосон — багшийн «Дугуйлан» хуудаснаас нэмнэ.");
await pool.end();
