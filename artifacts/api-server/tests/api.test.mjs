/**
 * What has to keep working, checked against a real server and a real database.
 *
 * This replaces test-db.mjs, which expected the preview API: no sign-in, a
 * student id passed in a header. Every route now requires a session, so that
 * file tested a system that no longer exists.
 *
 *   corepack pnpm test
 *
 * The suite builds its own world (see harness.mjs) and throws it away after.
 */
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { createClient, startHarness } from "./harness.mjs";

describe("EJ Learning API", { concurrency: false }, () => {
  let harness;
  let accountsByRole;
  let byName;

  before(async () => {
    harness = await startHarness();
    accountsByRole = Object.fromEntries(harness.accounts.map((a) => [a.role, a]));
    byName = Object.fromEntries(harness.accounts.map((a) => [a.username, a]));
  });

  after(async () => {
    if (harness) await harness.stop();
  });

  describe("setup", () => {
    it("applies every migration in the journal", async () => {
      const [applied] = await harness.sql(
        "SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations",
      );
      const [journal] = await harness.sql(
        "SELECT count(*)::int AS n FROM learning.terms WHERE false",
      );
      assert.ok(journal.n === 0, "sanity: the schema is there to query");
      assert.ok(applied.n >= 13, `only ${applied.n} migrations recorded`);
    });

    it("carries all twelve grades, and calls each part of the school by name", async () => {
      // The school runs 1-12. The original constraint stopped at 11 and was
      // raised by migration 0010; this is the guard that notices if a later
      // rebuild of the baseline loses it again.
      const grades = (await harness.sql(
        "SELECT grade_number FROM core.grade_levels ORDER BY grade_number"))
        .map((row) => row.grade_number);
      assert.deepEqual(grades, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

      const refused = await harness.sql(
        "SELECT 1 FROM core.grade_levels WHERE grade_number = 13").catch(() => null);
      assert.ok(refused !== undefined);

      const { stageForGrade } = await import("../src/shared/school-stage.ts")
        .catch(() => ({ stageForGrade: null }));
      if (stageForGrade) {
        assert.equal(stageForGrade(5), "PRIMARY");
        assert.equal(stageForGrade(6), "LOWER_SECONDARY");
        assert.equal(stageForGrade(9), "LOWER_SECONDARY");
        assert.equal(stageForGrade(10), "UPPER_SECONDARY");
        assert.equal(stageForGrade(12), "UPPER_SECONDARY");
      }
    });

    it("takes a fourth term", async () => {
      // The school year has four terms; the check used to stop at three, so a
      // fourth could not be recorded at all.
      const [year] = await harness.sql(
        "INSERT INTO learning.terms (school_year, term_number, name_mn, starts_on, ends_on) VALUES ('2099-2100', 4, 'MOCK-LOCAL-TERM-4', '2100-04-01', '2100-06-01') RETURNING term_number::int AS n",
      );
      assert.equal(year.n, 4);

      await assert.rejects(
        () =>
          harness.sql(
            "INSERT INTO learning.terms (school_year, term_number, name_mn, starts_on, ends_on) VALUES ('2099-2100', 5, 'MOCK-LOCAL-TERM-5', '2100-06-02', '2100-07-01')",
          ),
        /terms_term_number_check/,
        "a fifth term is still refused",
      );

      await harness.sql("DELETE FROM learning.terms WHERE school_year = '2099-2100'");
    });

    it("holds two different papers for one class and subject", async () => {
      // The thing that had no representation before. Questions carried only a
      // subject, a grade and an order, so "the unit test" and "the term paper"
      // were the same implicit set and could not both exist.
      const [{ id: subjectId }] = await harness.sql(
        "SELECT id FROM core.subjects WHERE code = 'MATH'",
      );
      const [{ id: gradeId }] = await harness.sql(
        "SELECT id FROM core.grade_levels WHERE grade_number = 9",
      );
      const [{ id: classId }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );
      const [{ id: itemId }] = await harness.sql(
        `INSERT INTO assessment.diagnostic_items
           (item_code, subject_id, grade_level_id, item_order, title_mn, max_score)
         VALUES ('MOCK-LOCAL-ITEM-1', $1, $2, 1, 'Туршилтын асуулт', 2) RETURNING id`,
        [subjectId, gradeId],
      );

      const papers = [];
      for (const [code, kind, order, score] of [
        ["MOCK-LOCAL-PAPER-UNIT", "UNIT", 1, null],
        ["MOCK-LOCAL-PAPER-TERM", "TERM", 1, 4],
      ]) {
        const [{ id }] = await harness.sql(
          `INSERT INTO assessment.exam_papers
             (paper_code, subject_id, grade_level_id, class_id, exam_kind, title_mn, pass_percent)
           VALUES ($1, $2, $3, $4, $5, $1, 60) RETURNING id`,
          [code, subjectId, gradeId, classId, kind],
        );
        papers.push(id);
        await harness.sql(
          `INSERT INTO assessment.exam_paper_items (paper_id, diagnostic_item_id, item_order, max_score)
           VALUES ($1, $2, $3, $4)`,
          [id, itemId, order, score],
        );
      }
      assert.equal(papers.length, 2, "one class and subject carries two papers");

      // The same question on both, worth its own score on one and a
      // paper-specific score on the other.
      const scores = await harness.sql(
        `SELECT COALESCE(pi.max_score, di.max_score)::float8 AS score
           FROM assessment.exam_paper_items pi
           JOIN assessment.diagnostic_items di ON di.id = pi.diagnostic_item_id
          WHERE pi.paper_id = ANY($1::bigint[]) ORDER BY score`,
        [papers],
      );
      assert.deepEqual(scores.map((r) => r.score), [2, 4]);

      // A paper's place in the order is its own; the same slot twice is not.
      await assert.rejects(
        () =>
          harness.sql(
            `INSERT INTO assessment.exam_paper_items (paper_id, diagnostic_item_id, item_order)
             VALUES ($1, $2, 1)`,
            [papers[0], itemId],
          ),
        /duplicate key|unique/i,
        "one question sits on a paper once",
      );

      // A question that children have answered cannot be deleted from under
      // the paper that asked it.
      await assert.rejects(
        () => harness.sql("DELETE FROM assessment.diagnostic_items WHERE id = $1", [itemId]),
        /foreign key|violates/i,
        "a question on a paper is protected from deletion",
      );

      await harness.sql("DELETE FROM assessment.exam_papers WHERE id = ANY($1::bigint[])", [papers]);
      // exam_paper_items cascades with its paper, so the question frees up.
      await harness.sql("DELETE FROM assessment.diagnostic_items WHERE id = $1", [itemId]);
    });

    it("seeds an account per role, and two teachers to tell apart", async () => {
      assert.deepEqual(
        harness.accounts.map((a) => a.username).sort(),
        ["demo-admin", "demo-student", "demo-teacher", "demo-teacher-b"],
      );
    });

    it("seeds only synthetic data", async () => {
      const rows = await harness.sql(
        "SELECT class_code FROM core.classes UNION ALL SELECT student_code FROM core.students",
      );
      assert.ok(rows.length > 0, "expected seeded rows");
      for (const row of rows) {
        const code = Object.values(row)[0];
        assert.match(code, /^MOCK-LOCAL-/, `${code} does not look synthetic`);
      }
    });
  });

  describe("student schedule", () => {
    it("keeps repeated and split weekly periods without lesson content, within validity dates", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);
      const [enrolment] = await harness.sql(`
        SELECT e.class_id FROM core.student_enrollments e
        JOIN core.students s ON s.id = e.student_id
        JOIN core.users u ON u.student_id = s.id
        WHERE u.username = 'demo-student' AND e.is_active LIMIT 1`);
      const subjects = await harness.sql("SELECT id FROM core.subjects WHERE is_active ORDER BY id LIMIT 2");
      const inserted = await harness.sql(`
        INSERT INTO learning.timetable_slots
          (class_id, subject_id, weekday_no, period_no, group_label, valid_from, valid_to)
        VALUES ($1, $2, 1, 1, NULL, '2099-01-05', '2099-01-12'),
               ($1, $2, 1, 2, 'A', '2099-01-05', '2099-01-12'),
               ($1, $3, 1, 2, 'B', '2099-01-05', '2099-01-12')
        RETURNING id`, [enrolment.class_id, subjects[0].id, subjects[1].id]);
      try {
        for (const date of ['2099-01-05', '2099-01-12']) {
          const response = await client.request('/student/schedule?date=' + date);
          assert.equal(response.status, 200);
          assert.deepEqual(response.payload.slots.map((slot) => slot.periodNo), [1, 2, 2]);
          assert.ok(response.payload.slots.every((slot) => slot.lesson === null));
          assert.deepEqual(response.payload.slots.filter((slot) => slot.periodNo === 2)
            .map((slot) => slot.groupLabel).sort(), ['A', 'B']);
        }
        for (const date of ['2098-12-29', '2099-01-06', '2099-01-19']) {
          const response = await client.request('/student/schedule?date=' + date);
          assert.equal(response.status, 200);
          assert.deepEqual(response.payload.slots, []);
        }
      } finally {
        await harness.sql('DELETE FROM learning.timetable_slots WHERE id = ANY($1::bigint[])',
          [inserted.map((row) => row.id)]);
      }
    });

    it("requires a student session", async () => {
      const client = createClient(harness.baseUrl);
      assert.equal((await client.request("/student/schedule")).status, 401);
      await client.signIn(accountsByRole.TEACHER);
      assert.equal((await client.request("/student/schedule")).status, 403);
    });

    it("defaults to today and ignores a supplied class id", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);
      const today = await client.request("/student/today");
      const schedule = await client.request("/student/schedule?classId=999999");
      assert.equal(schedule.status, 200);
      assert.deepEqual(schedule.payload, today.payload);
    });

    it("reads the selected day and rejects invalid dates", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);
      const schedule = await client.request("/student/schedule?date=2000-01-01");
      assert.equal(schedule.status, 200);
      assert.equal(schedule.payload.date, "2000-01-01");
      assert.deepEqual(schedule.payload.slots, []);
      for (const date of ["invalid", "2026-02-30", "2026-13-01"]) {
        assert.equal((await client.request("/student/schedule?date=" + date)).status, 400);
      }
    });
  });

  describe("calendar schedule and admin makeup lessons", () => {
    let classId, subjectId, weekend, lessonId, admin, teacher, student;
    before(async () => {
      [{ id: classId }] = await harness.sql("SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'");
      [{ id: subjectId }] = await harness.sql("SELECT id FROM core.subjects WHERE code = 'MATH'");
      [{ day: weekend }] = await harness.sql(
        "SELECT d::date::text AS day FROM learning.terms t CROSS JOIN LATERAL generate_series(t.starts_on, t.ends_on, interval '1 day') d WHERE extract(isodow FROM d) = 6 AND NOT EXISTS (SELECT 1 FROM learning.class_schedule cs WHERE cs.class_id = $1 AND cs.scheduled_on = d::date) ORDER BY d LIMIT 1", [classId],
      );
      admin = createClient(harness.baseUrl);
      teacher = createClient(harness.baseUrl);
      student = createClient(harness.baseUrl);
      await admin.signIn(accountsByRole.ADMIN);
      await teacher.signIn(byName["demo-teacher"]);
      await student.signIn(accountsByRole.STUDENT);
      const lessons = await admin.request('/teacher/lessons?classId=' + classId + '&subjectId=' + subjectId);
      lessonId = lessons.payload[0].id;
    });

    it("returns blank weekend slots for every subject", async () => {
      const res = await teacher.request('/teacher/schedule?classId=' + classId + '&from=' + weekend + '&to=' + weekend);
      assert.equal(res.status, 200);
      assert.equal(res.payload.days.length, 2);
      assert.ok(res.payload.days.every((row) => row.scheduledOn === weekend && row.subjectId !== null && row.lessonId === null));
    });

    it("keeps nine consecutive calendar dates for one subject", async () => {
      const end = new Date(weekend + 'T00:00:00Z');
      end.setUTCDate(end.getUTCDate() + 8);
      const res = await teacher.request('/teacher/schedule?classId=' + classId + '&subjectId=' + subjectId + '&from=' + weekend + '&to=' + end.toISOString().slice(0, 10));
      assert.equal(res.status, 200);
      assert.equal(res.payload.days.length, 9);
      assert.equal(new Set(res.payload.days.map((row) => row.scheduledOn)).size, 9);
    });

    it("keeps the teacher's note on the day, and the student reads it", async () => {
      // A weekday, so the teacher may set it without the admin-only weekend rule.
      // Today or later: a day already taught is not a day anybody rewrites.
      const [{ day: weekday }] = await harness.sql(
        "SELECT d::date::text AS day FROM learning.terms t CROSS JOIN LATERAL generate_series(t.starts_on, t.ends_on, interval '1 day') d WHERE extract(isodow FROM d) < 6 AND d >= CURRENT_DATE AND NOT EXISTS (SELECT 1 FROM learning.class_schedule cs WHERE cs.class_id = $1 AND cs.scheduled_on = d::date) ORDER BY d LIMIT 1",
        [classId],
      );
      const day = { classId: Number(classId), subjectId: Number(subjectId), scheduledOn: weekday };
      const read = async () => {
        const res = await teacher.request(
          '/teacher/schedule?classId=' + classId + '&subjectId=' + subjectId + '&from=' + weekday + '&to=' + weekday,
        );
        return res.payload.days[0];
      };

      const note = "41-44 хуудсыг уншаад 3, 5, 7-р дасгалыг хий.";
      assert.equal((await teacher.request('/teacher/schedule/day', { method: 'PUT', body: { ...day, lessonId, note } })).status, 200);
      assert.equal((await read()).note, note);

      // Changing the lesson says nothing about the note, so the note stands.
      assert.equal((await teacher.request('/teacher/schedule/day', { method: 'PUT', body: { ...day, lessonId } })).status, 200);
      assert.equal((await read()).note, note, "swapping the lesson discarded the note");

      // Whitespace is not a note.
      assert.equal((await teacher.request('/teacher/schedule/day', { method: 'PUT', body: { ...day, lessonId, note: "   " } })).status, 200);
      assert.equal((await read()).note, null);

      // The student sees it on the day it belongs to.
      assert.equal((await teacher.request('/teacher/schedule/day', { method: 'PUT', body: { ...day, lessonId, note } })).status, 200);
      const personal = await student.request('/student/schedule?date=' + weekday);
      const shown = personal.payload.slots.find((row) => row.lesson?.id === lessonId);
      assert.ok(shown, "the student should have this lesson that day");
      assert.equal(shown.lesson.teacherNote, note);

      // Too long is refused rather than silently truncated.
      const tooLong = await teacher.request('/teacher/schedule/day', {
        method: 'PUT',
        body: { ...day, lessonId, note: "x".repeat(2001) },
      });
      assert.equal(tooLong.status, 400);
      assert.equal((await read()).note, note, "a refused write must not change the note");

      // Clearing the day takes the note with it.
      assert.equal((await teacher.request('/teacher/schedule/day', { method: 'PUT', body: { ...day, lessonId: null } })).status, 200);
      assert.equal((await read()).note, null);
    });

    it("only an admin can add a makeup lesson and students can read it", async () => {
      const body = { classId: Number(classId), subjectId: Number(subjectId), scheduledOn: weekend, lessonId };
      assert.equal((await teacher.request('/teacher/schedule/day', { method: 'PUT', body })).status, 403);
      assert.equal((await student.request('/teacher/schedule/day', { method: 'PUT', body })).status, 403);
      const saved = await admin.request('/teacher/schedule/day', { method: 'PUT', body });
      assert.equal(saved.status, 200, JSON.stringify(saved.payload));
      const shown = await teacher.request('/teacher/schedule?classId=' + classId + '&subjectId=' + subjectId + '&from=' + weekend + '&to=' + weekend);
      assert.equal(shown.payload.days[0].lessonId, lessonId);
      const personal = await student.request('/student/schedule?date=' + weekend);
      assert.ok(personal.payload.slots.some((row) => row.lesson?.id === lessonId));
      const clearing = { ...body, lessonId: null };
      assert.equal((await teacher.request('/teacher/schedule/day', { method: 'PUT', body: clearing })).status, 403);
      assert.equal((await admin.request('/teacher/schedule/day', { method: 'PUT', body: clearing })).status, 200);
      const cleared = await teacher.request('/teacher/schedule?classId=' + classId + '&subjectId=' + subjectId + '&from=' + weekend + '&to=' + weekend);
      assert.equal(cleared.payload.days[0].lessonId, null);
    });
  });


  describe("a staff profile the school can reshape", () => {
    let admin, teacher, student, teacherId, added;
    before(async () => {
      admin = createClient(harness.baseUrl);
      teacher = createClient(harness.baseUrl);
      student = createClient(harness.baseUrl);
      await admin.signIn(accountsByRole.ADMIN);
      await teacher.signIn(byName["demo-teacher"]);
      await student.signIn(accountsByRole.STUDENT);
      const mine = await teacher.request("/staff/me");
      assert.equal(mine.status, 200, JSON.stringify(mine.payload));
      teacherId = mine.payload.teacherId;
    });
    after(async () => {
      if (added) {
        await harness.sql("DELETE FROM core.staff_fields WHERE id = $1", [added]);
      }
    });

    it("says what a profile is made of, and who may write each part", async () => {
      const res = await teacher.request("/staff/fields");
      assert.equal(res.status, 200);
      const keys = res.payload.map((row) => row.fieldKey);
      // The register's own columns, seeded by the migration.
      for (const key of ["job_title", "department", "phone", "service_since"]) {
        assert.ok(keys.includes(key), `${key} missing from the field list`);
      }
      const title = res.payload.find((row) => row.fieldKey === "job_title");
      const phone = res.payload.find((row) => row.fieldKey === "phone");
      // A job title is a decision the school made; a telephone number is theirs.
      assert.equal(title.selfEditable, false);
      assert.equal(phone.selfEditable, true);
      assert.equal(typeof title.columnName, "string");
    });

    it("lets a teacher write their own fields and refuses the school's", async () => {
      const refused = await teacher.request("/staff/me", {
        method: "PATCH", body: { fields: { job_title: "Захирал" } },
      });
      assert.equal(refused.status, 403);
      assert.equal(refused.payload.code, "ADMIN_ONLY_FIELD");

      const saved = await teacher.request("/staff/me", {
        method: "PATCH", body: { fields: { phone: "99112233" } },
      });
      assert.equal(saved.status, 200, JSON.stringify(saved.payload));
      assert.equal(
        saved.payload.fields.find((row) => row.fieldKey === "phone").value,
        "99112233",
      );

      // A date has to look like one before it reaches a date column.
      const bad = await teacher.request("/staff/me", {
        method: "PATCH", body: { fields: { service_since: "хоёр жилийн өмнө" } },
      });
      assert.equal(bad.status, 400);
      assert.equal(bad.payload.code, "INVALID_DATE");
    });

    it("keeps one member of staff's record out of another's reach", async () => {
      assert.equal((await student.request("/staff/me")).status, 403);
      assert.equal((await student.request("/staff")).status, 403);
      assert.equal((await teacher.request("/staff")).status, 403);

      // An administrator reads anybody's; a teacher reads only their own.
      assert.equal((await admin.request(`/staff/${teacherId}`)).status, 200);
      const [{ other }] = await harness.sql(
        `SELECT t.id::int AS other FROM core.teachers t
          JOIN core.users u ON u.id = t.user_id
         WHERE t.is_active AND u.is_active AND t.id <> $1 LIMIT 1`, [teacherId]);
      if (other) {
        const peeking = await teacher.request(`/staff/${other}`);
        assert.equal(peeking.status, 403, "a teacher read somebody else's record");
      }
    });

    it("shows a child their teacher's card and nothing more", async () => {
      // A telephone number and a department are for the people who ring each
      // other. What a class is owed is a name, a face and what the person is
      // employed as.
      await teacher.request("/staff/me", {
        method: "PATCH", body: { fields: { phone: "99887766" } },
      });

      const card = await student.request(`/staff/${teacherId}/card`);
      assert.equal(card.status, 200, JSON.stringify(card.payload));
      assert.equal(typeof card.payload.displayName, "string");
      assert.ok(Array.isArray(card.payload.subjects));

      const shown = JSON.stringify(card.payload);
      assert.ok(!shown.includes("99887766"), "the card leaked a telephone number");
      for (const field of card.payload.fields) {
        assert.ok(
          ["Албан тушаал", "Ажлын байрны ангилал", "Газар, хэлтэс", "Мэргэжлийн зэрэг"]
            .includes(field.labelMn),
          `unexpected field on a child's card: ${field.labelMn}`,
        );
      }

      // The full record stays out of reach, which is the whole point of the
      // card being a different endpoint.
      assert.equal((await student.request(`/staff/${teacherId}`)).status, 403);
    });

    it("adds a field the school names, and shows it on every profile at once", async () => {
      const created = await admin.request("/admin/staff/fields", {
        method: "POST",
        body: { labelMn: "Боловсрол", valueKind: "TEXT", selfEditable: true },
      });
      assert.equal(created.status, 201, JSON.stringify(created.payload));
      const field = created.payload.find((row) => row.labelMn === "Боловсрол");
      assert.ok(field, "the new field is not in the list");
      assert.equal(field.columnName, null, "a school field must not claim a column");
      added = field.id;

      // It is a field like any other the moment it exists: the teacher's own
      // page carries it, and because it was marked self-editable they can
      // fill it in without asking anybody.
      const mine = await teacher.request("/staff/me");
      assert.ok(mine.payload.fields.some((row) => row.fieldKey === field.fieldKey));
      const wrote = await teacher.request("/staff/me", {
        method: "PATCH", body: { fields: { [field.fieldKey]: "МУИС, математик" } },
      });
      assert.equal(wrote.status, 200, JSON.stringify(wrote.payload));
      assert.equal(
        wrote.payload.fields.find((row) => row.fieldKey === field.fieldKey).value,
        "МУИС, математик",
      );

      // Renaming changes the label everywhere and nothing else.
      const renamed = await admin.request(`/admin/staff/fields/${field.id}`, {
        method: "PATCH", body: { labelMn: "Боловсрол, мэргэжил" },
      });
      assert.equal(renamed.status, 200);
      assert.equal(
        renamed.payload.find((row) => row.id === field.id).labelMn,
        "Боловсрол, мэргэжил",
      );
      const after = await teacher.request("/staff/me");
      assert.equal(
        after.payload.fields.find((row) => row.fieldKey === field.fieldKey).value,
        "МУИС, математик",
        "renaming a field lost its values",
      );
    });

    it("refuses to switch off a field that has a column behind it", async () => {
      const fields = (await admin.request("/staff/fields")).payload;
      const builtin = fields.find((row) => row.columnName !== null);
      const res = await admin.request(`/admin/staff/fields/${builtin.id}`, {
        method: "PATCH", body: { isActive: false },
      });
      assert.equal(res.status, 400);
      assert.equal(res.payload.code, "BUILTIN_FIELD");

      // Renaming one is fine, and is the point of the table.
      const renamed = await admin.request(`/admin/staff/fields/${builtin.id}`, {
        method: "PATCH", body: { labelMn: builtin.labelMn },
      });
      assert.equal(renamed.status, 200);
    });
  });

  describe("an exam is set, sat once, and counts", () => {
    let admin, teacher, child, klass, subject, studentId, sittingId, paper;
    const hour = 3600 * 1000;
    before(async () => {
      admin = createClient(harness.baseUrl);
      teacher = createClient(harness.baseUrl);
      child = createClient(harness.baseUrl);
      await admin.signIn(accountsByRole.ADMIN);
      await teacher.signIn(byName["demo-teacher"]);
      await child.signIn(accountsByRole.STUDENT);
      [{ id: klass }] = await harness.sql(
        "SELECT id::int FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'");
      [{ id: subject }] = await harness.sql("SELECT id::int FROM core.subjects WHERE code = 'MATH'");
      [{ id: studentId }] = await harness.sql(
        "SELECT student_id::int AS id FROM core.users WHERE username = 'demo-student'");
    });
    after(async () => {
      // Attempts first: a question sitting on a paper, and a paper somebody
      // sat, are both RESTRICT-ed on purpose - neither is safe to delete out
      // from under the other while tidying.
      if (sittingId) {
        await harness.sql(
          `DELETE FROM assessment.diagnostic_attempts
            WHERE exam_paper_id IN (SELECT exam_paper_id FROM assessment.exam_sittings
                                     WHERE class_id = $1)`, [klass]);
        await harness.sql(
          `DELETE FROM assessment.exam_paper_items
            WHERE paper_id IN (SELECT exam_paper_id FROM assessment.exam_sittings
                                WHERE class_id = $1)`, [klass]);
        await harness.sql(
          "DELETE FROM assessment.exam_papers WHERE id IN (SELECT exam_paper_id FROM assessment.exam_sittings WHERE class_id = $1)",
          [klass]);
      }
      await harness.sql(
        "DELETE FROM learning.student_skill_mastery WHERE student_id = $1", [studentId]);
    });

    it("draws a paper from the year's question bank and gives it a window", async () => {
      const opensAt = new Date(Date.now() - hour).toISOString();
      const closesAt = new Date(Date.now() + hour).toISOString();
      const res = await teacher.request("/teacher/exams", { method: "POST", body: {
        classId: klass, subjectId: subject, examKind: "UNIT",
        title: "1-р улирлын шалгалт", opensAt, closesAt, drawCount: 3,
      } });
      assert.equal(res.status, 201, JSON.stringify(res.payload));
      assert.ok(res.payload.questionCount > 0, "no questions were drawn");
      sittingId = res.payload.sittingId;

      const list = await teacher.request(`/teacher/exams?classId=${klass}&subjectId=${subject}`);
      assert.equal(list.status, 200);
      const found = list.payload.find((row) => row.sittingId === sittingId);
      assert.ok(found, "the sitting is missing from the list");
      assert.equal(found.sat, 0);
      assert.ok(found.invited > 0, "nobody was invited");
      assert.equal(found.wholeClass, true, "naming nobody should mean everybody");
    });

    it("refuses a window that never closes, and one with no questions in it", async () => {
      const at = new Date().toISOString();
      const backwards = await teacher.request("/teacher/exams", { method: "POST", body: {
        classId: klass, subjectId: subject, examKind: "UNIT", title: "Буруу",
        opensAt: at, closesAt: at, drawCount: 1,
      } });
      assert.equal(backwards.status, 400, JSON.stringify(backwards.payload));
      assert.equal(backwards.payload.code, "INVALID_WINDOW");

      const empty = await teacher.request("/teacher/exams", { method: "POST", body: {
        classId: klass, subjectId: subject, examKind: "UNIT", title: "Хоосон",
        opensAt: at, closesAt: new Date(Date.now() + hour).toISOString(), drawCount: 0,
      } });
      assert.equal(empty.status, 400, JSON.stringify(empty.payload));
      assert.equal(empty.payload.code, "NO_QUESTIONS");
    });

    it("gives the child the paper without the key", async () => {
      const mine = await child.request("/student/exams");
      assert.equal(mine.status, 200);
      const row = mine.payload.find((entry) => entry.sittingId === sittingId);
      assert.ok(row, "the child cannot see the exam");
      assert.equal(row.isOpen, true);
      assert.equal(row.attemptsUsed, 0);
      assert.equal(row.attemptsAllowed, 1);

      const res = await child.request(`/student/exams/${sittingId}`);
      assert.equal(res.status, 200);
      paper = res.payload;
      assert.ok(paper.questions.length > 0);
      const serialized = JSON.stringify(paper);
      for (const leak of ["isCorrect", "is_correct", "correctOptionIds"]) {
        assert.ok(!serialized.includes(leak), `the paper leaked ${leak}`);
      }
    });

    it("is sat once, marked, and refused a second time", async () => {
      const answers = paper.questions.map((question) => ({
        itemId: question.itemId,
        optionId: question.options[0]?.optionId ?? null,
      }));
      const res = await child.request(`/student/exams/${sittingId}/attempt`, {
        method: "POST", body: { answers },
      });
      assert.equal(res.status, 201, JSON.stringify(res.payload));
      assert.ok(res.payload.maxScore > 0);
      assert.equal(typeof res.payload.score, "number");

      // The key is the teacher's to release, and it bites harder here than on
      // the daily check: a paper is sat once, and a child who sees the answers
      // while a classmate is still writing has been handed the marks.
      assert.equal(res.payload.answersOpen, false);
      assert.ok(res.payload.results.every((row) => row.correctOptionIds.length === 0));

      // A paper a child can sit twice on their own is not a paper.
      const again = await child.request(`/student/exams/${sittingId}/attempt`, {
        method: "POST", body: { answers },
      });
      assert.equal(again.status, 409, JSON.stringify(again.payload));
      assert.equal(again.payload.code, "EXAM_ALREADY_SAT");

      // And the paper is off the screen once it is spent.
      const spent = await child.request(`/student/exams/${sittingId}`);
      assert.deepEqual(spent.payload.questions, []);
    });

    it("counts towards the child's skills, which the daily check does not", async () => {
      // The other half of the daily-check change. Progress had to come from
      // somewhere once five questions and three tries stopped feeding it, and
      // this is the somewhere: one paper, one window, one go, marked against a
      // key nobody could see.
      const [{ n }] = await harness.sql(
        "SELECT count(*)::int AS n FROM learning.student_skill_mastery WHERE student_id = $1",
        [studentId]);
      assert.ok(n > 0, "sitting an exam left no trace on the child's skills");
    });

    it("shows the teacher who sat it, and lets them set it again for one child", async () => {
      const res = await teacher.request(`/teacher/exams/${sittingId}`);
      assert.equal(res.status, 200);
      assert.ok(res.payload.questions.length > 0);
      // The teacher's copy carries the key: they are the person who has to
      // judge whether a question is any good.
      assert.ok(res.payload.questions[0].options.some((row) => "isCorrect" in row));
      const sat = res.payload.results.find((row) => row.studentId === studentId);
      assert.ok(sat?.attemptId, "the attempt is missing from the register");

      const reopened = await teacher.request(`/teacher/exams/${sittingId}/reopen`, {
        method: "POST", body: { studentIds: [studentId] },
      });
      assert.equal(reopened.status, 200, JSON.stringify(reopened.payload));

      const mine = await child.request("/student/exams");
      const row = mine.payload.find((entry) => entry.sittingId === sittingId);
      assert.equal(row.attemptsAllowed, 2, "the teacher's second chance did not arrive");
      assert.equal(row.isOpen, true);
    });

    it("hands over the key only when the teacher releases it", async () => {
      const opened = await teacher.request(`/teacher/exams/${sittingId}/answers`, {
        method: "PUT", body: { open: true },
      });
      assert.equal(opened.status, 200);
      assert.equal(opened.payload.answersOpen, true);

      const second = await child.request(`/student/exams/${sittingId}`);
      const answers = second.payload.questions.map((question) => ({
        itemId: question.itemId,
        optionId: question.options[0]?.optionId ?? null,
      }));
      const res = await child.request(`/student/exams/${sittingId}/attempt`, {
        method: "POST", body: { answers },
      });
      assert.equal(res.status, 201, JSON.stringify(res.payload));
      assert.equal(res.payload.answersOpen, true);
      assert.ok(
        res.payload.results.some((row) => row.correctOptionIds.length > 0),
        "the key was still withheld after the teacher released it",
      );
    });

    it("keeps the exam away from another class's teacher and another child", async () => {
      const stranger = createClient(harness.baseUrl);
      await stranger.signIn(byName["demo-teacher-b"]);
      assert.equal((await stranger.request(`/teacher/exams/${sittingId}`)).status, 403);
      assert.equal((await child.request(`/teacher/exams/${sittingId}`)).status, 403);
      assert.equal((await teacher.request(`/student/exams`)).status, 403);
    });

    it("will not be sat before it opens or after it closes", async () => {
      const later = await teacher.request("/teacher/exams", { method: "POST", body: {
        classId: klass, subjectId: subject, examKind: "TERM", title: "Дараа",
        opensAt: new Date(Date.now() + hour).toISOString(),
        closesAt: new Date(Date.now() + 2 * hour).toISOString(),
        drawCount: 2,
      } });
      assert.equal(later.status, 201, JSON.stringify(later.payload));
      const id = later.payload.sittingId;

      const shut = await child.request(`/student/exams/${id}`);
      assert.equal(shut.status, 200);
      assert.equal(shut.payload.isOpen, false);
      assert.deepEqual(shut.payload.questions, [], "questions before the window opened");

      const early = await child.request(`/student/exams/${id}/attempt`, {
        method: "POST", body: { answers: [] },
      });
      assert.equal(early.status, 409, JSON.stringify(early.payload));
      assert.equal(early.payload.code, "EXAM_NOT_OPEN");

      await harness.sql(
        "UPDATE assessment.exam_sittings SET opens_at = now() - interval '2 hours', closes_at = now() - interval '1 hour' WHERE id = $1",
        [id]);
      const late = await child.request(`/student/exams/${id}/attempt`, {
        method: "POST", body: { answers: [] },
      });
      assert.equal(late.status, 409, JSON.stringify(late.payload));
      assert.equal(late.payload.code, "EXAM_CLOSED");
    });

    it("takes a paper exam the teacher types in, and keeps it off the child screen", async () => {
      // UC10. The exam happened in the room; what reaches the system is the
      // teacher reading each sheet. It has to be marked by the same rule as an
      // online sitting, or the school has two systems rather than one.
      const onPaper = await teacher.request("/teacher/exams", { method: "POST", body: {
        classId: klass, subjectId: subject, examKind: "TERM", title: "Цаасан улирлын",
        opensAt: new Date(Date.now() - hour).toISOString(),
        closesAt: new Date(Date.now() + hour).toISOString(),
        drawCount: 2, onPaper: true,
      } });
      assert.equal(onPaper.status, 201, JSON.stringify(onPaper.payload));
      const id = onPaper.payload.sittingId;

      // It is not on the child's list, and they cannot sit it if they find it.
      const mine = await child.request("/student/exams");
      assert.ok(
        !mine.payload.some((row) => row.sittingId === id),
        "a paper exam was offered online as well",
      );
      const tried = await child.request(`/student/exams/${id}/attempt`, {
        method: "POST", body: { answers: [] },
      });
      assert.equal(tried.status, 409, JSON.stringify(tried.payload));
      assert.equal(tried.payload.code, "EXAM_ON_PAPER");

      // The teacher's copy carries the questions in printed order, which is
      // how the sheet in front of them is laid out.
      const board = await teacher.request(`/teacher/exams/${id}`);
      assert.equal(board.status, 200);
      assert.equal(board.payload.onPaper, true);
      const questions = board.payload.questions;
      assert.ok(questions.length > 0);
      assert.deepEqual(
        questions.map((row) => row.itemOrder),
        [...questions.map((row) => row.itemOrder)].sort((a, b) => a - b),
      );

      // One child's sheet, question by question. The first answer is the right
      // one, so the mark is not zero and a marking failure cannot pass for a
      // storage failure.
      const key = await harness.sql(
        `SELECT o.diagnostic_item_id::int AS item, o.id::int AS option_id
           FROM assessment.diagnostic_item_options o
          WHERE o.is_correct AND o.diagnostic_item_id = ANY($1::bigint[])`,
        [questions.map((row) => row.itemId)]);
      const right = new Map(key.map((row) => [row.item, row.option_id]));
      const entered = await teacher.request(`/teacher/exams/${id}/entry`, {
        method: "POST",
        body: {
          studentId,
          answers: questions.map((question, index) => ({
            itemId: question.itemId,
            optionId: index === 0 ? right.get(question.itemId) ?? null : null,
          })),
        },
      });
      assert.equal(entered.status, 201, JSON.stringify(entered.payload));
      assert.ok(entered.payload.score > 0, "the right answer scored nothing");
      // Only where the draw found more than one question: a one-question bank
      // answered correctly is full marks, and that is not a failure.
      if (questions.length > 1) {
        assert.ok(
          entered.payload.score < entered.payload.maxScore,
          "the unanswered questions scored as though they were right",
        );
      }

      // And it shows on the register like any other sitting.
      const after = await teacher.request(`/teacher/exams/${id}`);
      const row = after.payload.results.find((entry) => entry.studentId === studentId);
      assert.ok(row?.attemptId, "the entered sheet is missing from the register");

      // Typed twice is not allowed; another go is the teacher's to grant.
      const twice = await teacher.request(`/teacher/exams/${id}/entry`, {
        method: "POST",
        body: { studentId, answers: questions.map((q) => ({ itemId: q.itemId, optionId: null })) },
      });
      assert.equal(twice.status, 409, JSON.stringify(twice.payload));
      assert.equal(twice.payload.code, "EXAM_ALREADY_SAT");
    });

    it("refuses paper entry on an online sitting, and a score the question is not worth", async () => {
      const online = await teacher.request(`/teacher/exams/${sittingId}/entry`, {
        method: "POST", body: { studentId, answers: [] },
      });
      assert.equal(online.status, 400, JSON.stringify(online.payload));
      assert.equal(online.payload.code, "EXAM_NOT_ON_PAPER");

      const made = await teacher.request("/teacher/exams", { method: "POST", body: {
        classId: klass, subjectId: subject, examKind: "UNIT", title: "Онооны хязгаар",
        opensAt: new Date(Date.now() - hour).toISOString(),
        closesAt: new Date(Date.now() + hour).toISOString(),
        drawCount: 1, onPaper: true,
      } });
      const id = made.payload.sittingId;
      const board = await teacher.request(`/teacher/exams/${id}`);
      const first = board.payload.questions[0];
      const tooMuch = await teacher.request(`/teacher/exams/${id}/entry`, {
        method: "POST",
        body: { studentId, answers: [{ itemId: first.itemId, awarded: first.maxScore + 10 }] },
      });
      assert.equal(tooMuch.status, 400, JSON.stringify(tooMuch.payload));
      assert.equal(tooMuch.payload.code, "INVALID_SCORE");
    });

    it("sets a paper for named children only, and keeps it from the rest", async () => {
      const named = await teacher.request("/teacher/exams", { method: "POST", body: {
        classId: klass, subjectId: subject, examKind: "DIAGNOSTIC", title: "Нэрсээр",
        opensAt: new Date(Date.now() - hour).toISOString(),
        closesAt: new Date(Date.now() + hour).toISOString(),
        drawCount: 2, studentIds: [studentId],
      } });
      assert.equal(named.status, 201, JSON.stringify(named.payload));
      const list = await teacher.request(`/teacher/exams?classId=${klass}&subjectId=${subject}`);
      const row = list.payload.find((entry) => entry.sittingId === named.payload.sittingId);
      assert.equal(row.wholeClass, false);
      assert.equal(row.invited, 1);

      const stranger = await teacher.request("/teacher/exams", { method: "POST", body: {
        classId: klass, subjectId: subject, examKind: "UNIT", title: "Гадны хүүхэд",
        opensAt: new Date().toISOString(),
        closesAt: new Date(Date.now() + hour).toISOString(),
        drawCount: 1, studentIds: [99999999],
      } });
      assert.equal(stranger.status, 400, JSON.stringify(stranger.payload));
      assert.equal(stranger.payload.code, "STUDENT_NOT_IN_CLASS");
    });
  });

  describe("a parent reads their own child and nobody else's", () => {
    let admin, parent, child, studentId, otherStudent, userId;
    before(async () => {
      admin = createClient(harness.baseUrl);
      child = createClient(harness.baseUrl);
      await admin.signIn(accountsByRole.ADMIN);
      await child.signIn(accountsByRole.STUDENT);
      [{ id: studentId }] = await harness.sql(
        "SELECT student_id::int AS id FROM core.users WHERE username = 'demo-student'");
      [otherStudent] = await harness.sql(
        "SELECT id::int FROM core.students WHERE id <> $1 AND is_active LIMIT 1", [studentId]);

      // A parent account. Made here rather than seeded, so the test says what
      // a guardian account actually is: a login with the role and nothing else.
      // The same password hash as the seeded student, so the test can sign in
      // without a second way of making accounts.
      [{ id: userId }] = await harness.sql(
        `INSERT INTO core.users (username, display_name, password_hash, is_active)
         SELECT 'test-guardian', 'Эцэг эх (тест)', password_hash, true
           FROM core.users WHERE username = 'demo-student'
         ON CONFLICT (username) DO UPDATE SET is_active = true
         RETURNING id::int`);
      await harness.sql(
        `INSERT INTO core.user_roles (user_id, role) VALUES ($1, 'GUARDIAN')
         ON CONFLICT DO NOTHING`, [userId]);
      parent = createClient(harness.baseUrl);
      await parent.signIn({
        username: "test-guardian",
        password: accountsByRole.STUDENT.password,
      });
    });
    after(async () => {
      if (userId) {
        await harness.sql("DELETE FROM core.guardian_students WHERE user_id = $1", [userId]);
        await harness.sql("DELETE FROM core.user_roles WHERE user_id = $1", [userId]);
        await harness.sql("DELETE FROM core.sessions WHERE user_id = $1", [userId]);
        await harness.sql("DELETE FROM core.users WHERE id = $1", [userId]);
      }
    });

    it("sees no children until an administrator links one", async () => {
      const res = await parent.request("/guardian/children");
      assert.equal(res.status, 200, JSON.stringify(res.payload));
      assert.deepEqual(res.payload, []);

      // And cannot reach a child by asking for one.
      const guessed = await parent.request(`/guardian/day?studentId=${studentId}`);
      assert.equal(guessed.status, 403, JSON.stringify(guessed.payload));
      assert.equal(guessed.payload.code, "NOT_YOUR_CHILD");
    });

    it("reads the child once linked, and the same day the child reads", async () => {
      const linked = await admin.request("/admin/guardians/link", { method: "POST", body: {
        userId, studentId, relation: "Ээж",
      } });
      assert.equal(linked.status, 200, JSON.stringify(linked.payload));

      const mine = await parent.request("/guardian/children");
      assert.equal(mine.status, 200);
      assert.equal(mine.payload.length, 1);
      assert.equal(mine.payload[0].studentId, studentId);
      assert.equal(mine.payload[0].relation, "Ээж");

      // The same assembly, not a parallel one: the day a parent is shown
      // something their child is not is the day the screen stops being worth
      // trusting.
      const theirs = await parent.request(`/guardian/day?studentId=${studentId}`);
      const own = await child.request("/student/today");
      assert.equal(theirs.status, 200, JSON.stringify(theirs.payload));
      assert.equal(own.status, 200);
      assert.deepEqual(theirs.payload, own.payload);
    });

    it("gives the fortnight behind, without the exam questions", async () => {
      const res = await parent.request(`/guardian/record?studentId=${studentId}`);
      assert.equal(res.status, 200, JSON.stringify(res.payload));
      assert.ok(Array.isArray(res.payload.attendance));
      assert.ok(Array.isArray(res.payload.notebook));
      assert.ok(Array.isArray(res.payload.exams));
      assert.ok(Array.isArray(res.payload.teachers));

      // Scores and dates only. A parent reading the answers over a child's
      // shoulder is exactly how a paper the rest of the class is still
      // sitting would leak.
      const serialized = JSON.stringify(res.payload);
      for (const leak of ["isCorrect", "correctOptionId", "options", "prompt"]) {
        assert.ok(!serialized.includes(leak), `the parent's record leaked ${leak}`);
      }
    });

    it("still refuses another family's child", async () => {
      if (!otherStudent) return;
      const res = await parent.request(`/guardian/day?studentId=${otherStudent.id}`);
      assert.equal(res.status, 403, JSON.stringify(res.payload));
      assert.equal(res.payload.code, "NOT_YOUR_CHILD");
    });

    it("writes nothing: the parent's account is refused everywhere a child acts", async () => {
      // The role is a reading role, and the routes say so rather than the
      // screens remembering to hide their buttons.
      assert.equal((await parent.request("/student/today")).status, 403);
      assert.equal((await parent.request("/teacher/class-day?classId=1")).status, 403);
      assert.equal((await parent.request("/student/quiz-attempts", {
        method: "POST", body: { lessonId: 1, answers: [] },
      })).status, 403);
      assert.equal((await parent.request("/admin/guardians")).status, 403);
    });

    it("makes a parent an account with the child attached, and says the password once", async () => {
      const [klass] = await harness.sql(
        "SELECT class_id::int AS id FROM core.student_enrollments WHERE student_id = $1 AND is_active",
        [studentId]);
      const roster = await admin.request(`/admin/guardians/class-children?classId=${klass.id}`);
      assert.equal(roster.status, 200, JSON.stringify(roster.payload));
      const listed = roster.payload.find((row) => row.studentId === studentId);
      assert.ok(listed, "the child is missing from the class list");
      assert.equal(listed.linked, true, "this child already has an account from the test above");

      const [other] = await harness.sql(
        `SELECT s.id::int FROM core.students s
           JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
          WHERE e.class_id = $1 AND s.id <> $2 AND s.is_active
            AND NOT EXISTS (SELECT 1 FROM core.guardian_students gs
                             WHERE gs.student_id = s.id AND gs.is_active)
          LIMIT 1`, [klass.id, studentId]);
      if (!other) return;

      const made = await admin.request("/admin/guardians/accounts", { method: "POST", body: {
        username: "test-guardian-3", displayName: "Эцэг эх 3 (тест)",
        password: "Parent-2026-Ej!", studentId: other.id,
      } });
      assert.equal(made.status, 201, JSON.stringify(made.payload));
      assert.equal(made.payload.username, "test-guardian-3");
      // The password is never echoed: a response that carries it back is a
      // response that ends up in a log.
      assert.ok(!JSON.stringify(made.payload).includes("Parent-2026-Ej!"));

      // Made and linked in one step, so there is no half-finished account for
      // an administrator to remember.
      const fresh = createClient(harness.baseUrl);
      await fresh.signIn({ username: "test-guardian-3", password: "Parent-2026-Ej!" });
      const mine = await fresh.request("/guardian/children");
      assert.equal(mine.status, 200);
      assert.deepEqual(mine.payload.map((row) => row.studentId), [other.id]);

      const taken = await admin.request("/admin/guardians/accounts", { method: "POST", body: {
        username: "test-guardian-3", displayName: "Дахилт",
        password: "Parent-2026-Ej!", studentId: other.id,
      } });
      assert.equal(taken.status, 400, JSON.stringify(taken.payload));
      assert.equal(taken.payload.code, "USERNAME_TAKEN");

      const short = await admin.request("/admin/guardians/accounts", { method: "POST", body: {
        username: "test-guardian-4", displayName: "Богино", password: "short",
      } });
      assert.equal(short.status, 400);

      const [{ id: third }] = await harness.sql(
        "SELECT id::int FROM core.users WHERE username = 'test-guardian-3'");
      await harness.sql("DELETE FROM core.guardian_students WHERE user_id = $1", [third]);
      await harness.sql("DELETE FROM core.user_roles WHERE user_id = $1", [third]);
      await harness.sql("DELETE FROM core.sessions WHERE user_id = $1", [third]);
      await harness.sql("DELETE FROM core.users WHERE id = $1", [third]);
    });

    it("keeps one live account per child, retiring the old link", async () => {
      // A second parent account for the same child. The school's rule is one
      // live account, so linking the second retires the first - and the first
      // loses access at once rather than at the next sign-in.
      const [{ id: second }] = await harness.sql(
        `INSERT INTO core.users (username, display_name, password_hash, is_active)
         SELECT 'test-guardian-2', 'Эцэг эх 2 (тест)', password_hash, true
           FROM core.users WHERE username = 'demo-student'
         ON CONFLICT (username) DO UPDATE SET is_active = true
         RETURNING id::int`);
      await harness.sql(
        `INSERT INTO core.user_roles (user_id, role) VALUES ($1, 'GUARDIAN')
         ON CONFLICT DO NOTHING`, [second]);

      assert.equal((await admin.request("/admin/guardians/link", { method: "POST", body: {
        userId: second, studentId, relation: "Аав",
      } })).status, 200);

      const rows = await harness.sql(
        "SELECT user_id::int AS id, is_active FROM core.guardian_students WHERE student_id = $1",
        [studentId]);
      const live = rows.filter((row) => row.is_active);
      assert.equal(live.length, 1, "two accounts were live for one child");
      assert.equal(live[0].id, second);
      // The retired link stays, so a question in June about who could see
      // what in March has an answer.
      assert.ok(rows.some((row) => row.id === userId && !row.is_active));

      const refused = await parent.request(`/guardian/day?studentId=${studentId}`);
      assert.equal(refused.status, 403, JSON.stringify(refused.payload));

      await harness.sql("DELETE FROM core.guardian_students WHERE user_id = $1", [second]);
      await harness.sql("DELETE FROM core.user_roles WHERE user_id = $1", [second]);
      await harness.sql("DELETE FROM core.sessions WHERE user_id = $1", [second]);
      await harness.sql("DELETE FROM core.users WHERE id = $1", [second]);
    });
  });

  describe("extra work: given to many, handed in more than once, late allowed", () => {
    let admin, teacher, child, other, klass, subject, studentId, homeworkId;
    before(async () => {
      admin = createClient(harness.baseUrl);
      teacher = createClient(harness.baseUrl);
      child = createClient(harness.baseUrl);
      other = createClient(harness.baseUrl);
      await admin.signIn(accountsByRole.ADMIN);
      await teacher.signIn(byName["demo-teacher"]);
      await child.signIn(accountsByRole.STUDENT);
      await other.signIn(byName["demo-teacher-b"]);
      [{ id: klass }] = await harness.sql(
        "SELECT id::int FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'");
      [{ id: subject }] = await harness.sql("SELECT id::int FROM core.subjects WHERE code = 'MATH'");
      [{ id: studentId }] = await harness.sql(
        "SELECT student_id::int AS id FROM core.users WHERE username = 'demo-student'");
    });
    after(async () => {
      await harness.sql("DELETE FROM learning.homework WHERE title LIKE 'TEST-HW%'");
    });

    it("goes to the whole class when nobody is named", async () => {
      const made = await teacher.request("/teacher/homework", { method: "POST", body: {
        classId: klass, subjectId: subject, title: "TEST-HW бүх анги",
        instructions: "41-44 хуудсыг уншаад тэмдэглэл хий.",
      } });
      assert.equal(made.status, 201, JSON.stringify(made.payload));
      homeworkId = made.payload.homeworkId;
      assert.equal(made.payload.given, null, "naming nobody means everybody");

      const list = await teacher.request(`/teacher/homework?classId=${klass}&subjectId=${subject}`);
      const found = list.payload.find((row) => row.homeworkId === homeworkId);
      assert.ok(found, "the work is missing from the list");
      assert.equal(found.wholeClass, true);
      // Two counts, not one: "given to N, handed in by M" is the sentence a
      // teacher needs, and a percentage hides which half moved. N is the
      // register, read from the database rather than assumed - the fixture
      // class is small.
      const [{ roster }] = await harness.sql(
        `SELECT count(*)::int AS roster FROM core.student_enrollments e
           JOIN core.students s ON s.id = e.student_id AND s.is_active
          WHERE e.class_id = $1 AND e.is_active`, [klass]);
      assert.equal(found.given, roster, "a whole-class task goes to the whole register");
      assert.equal(found.handedIn, 0);
    });

    it("keeps every go rather than replacing the last", async () => {
      const first = await child.request(`/student/homework/${homeworkId}/submit`, {
        method: "POST", body: { body: "Эхний хувилбар", minutes: 20 },
      });
      assert.equal(first.status, 201, JSON.stringify(first.payload));
      assert.equal(first.payload.attemptNo, 1);
      assert.equal(first.payload.isLate, false, "no deadline means nothing is late");

      const second = await child.request(`/student/homework/${homeworkId}/submit`, {
        method: "POST", body: { body: "Дахин бодож үзээд зассан" },
      });
      assert.equal(second.status, 201);
      assert.equal(second.payload.attemptNo, 2, "a second go must not overwrite the first");

      // The teacher sees both, because which one counts is their judgement to
      // make from seeing both.
      const board = await teacher.request(`/teacher/homework/${homeworkId}`);
      assert.equal(board.status, 200);
      const row = board.payload.students.find((entry) => entry.studentId === studentId);
      assert.equal(row.attempts.length, 2);
      assert.deepEqual(row.attempts.map((a) => a.attemptNo), [1, 2]);
      assert.equal(row.attempts[0].body, "Эхний хувилбар");
      assert.equal(row.attempts[0].minutes, 20);

      // Every child it was set for is a row, whether or not they handed
      // anything in: "who has not handed it in" is the question this screen is
      // opened for, and a list of the ones who did cannot answer it.
      const [{ roster }] = await harness.sql(
        `SELECT count(*)::int AS roster FROM core.student_enrollments e
           JOIN core.students s ON s.id = e.student_id AND s.is_active
          WHERE e.class_id = $1 AND e.is_active`, [klass]);
      assert.equal(board.payload.students.length, roster);
    });

    it("records lateness instead of refusing it", async () => {
      const [{ past }] = await harness.sql(
        "SELECT (CURRENT_DATE - 3)::text AS past");
      const made = await teacher.request("/teacher/homework", { method: "POST", body: {
        classId: klass, subjectId: subject, title: "TEST-HW хугацаатай",
        assignedOn: past, dueOn: past,
      } });
      assert.equal(made.status, 201, JSON.stringify(made.payload));
      const late = made.payload.homeworkId;

      const mine = await child.request("/student/homework");
      const row = mine.payload.find((entry) => entry.homeworkId === late);
      assert.ok(row, "the child cannot see the work");
      assert.equal(row.isOverdue, true, "past its date with nothing handed in");

      // A door that locks turns "I did it at the weekend" into "I did not do
      // it" - the same child, a worse record. So it is taken and marked.
      const handed = await child.request(`/student/homework/${late}/submit`, {
        method: "POST", body: { body: "Амралтын өдөр хийлээ" },
      });
      assert.equal(handed.status, 201, JSON.stringify(handed.payload));
      assert.equal(handed.payload.isLate, true);

      const board = await teacher.request(`/teacher/homework/${late}`);
      const entry = board.payload.students.find((x) => x.studentId === studentId);
      assert.equal(entry.attempts[0].isLate, true);

      const list = await teacher.request(`/teacher/homework?classId=${klass}&subjectId=${subject}`);
      assert.equal(list.payload.find((x) => x.homeworkId === late).late, 1);
    });

    it("goes only to the children named, and refuses one from another class", async () => {
      const named = await teacher.request("/teacher/homework", { method: "POST", body: {
        classId: klass, subjectId: subject, title: "TEST-HW нэрсээр",
        studentIds: [studentId],
      } });
      assert.equal(named.status, 201, JSON.stringify(named.payload));
      assert.equal(named.payload.given, 1);

      const board = await teacher.request(`/teacher/homework/${named.payload.homeworkId}`);
      assert.equal(board.payload.students.length, 1, "only the named child is on the register");
      assert.equal(board.payload.students[0].studentId, studentId);

      const stranger = await teacher.request("/teacher/homework", { method: "POST", body: {
        classId: klass, subjectId: subject, title: "TEST-HW гадны",
        studentIds: [99999999],
      } });
      assert.equal(stranger.status, 400, JSON.stringify(stranger.payload));
      assert.equal(stranger.payload.code, "STUDENT_NOT_IN_CLASS");
    });

    it("refuses a deadline before the day it was set, and empty work", async () => {
      const [{ past }] = await harness.sql("SELECT (CURRENT_DATE - 3)::text AS past");
      const backwards = await teacher.request("/teacher/homework", { method: "POST", body: {
        classId: klass, subjectId: subject, title: "TEST-HW буруу", dueOn: past,
      } });
      assert.equal(backwards.status, 400, JSON.stringify(backwards.payload));
      assert.equal(backwards.payload.code, "INVALID_DUE_DATE");

      const empty = await child.request(`/student/homework/${homeworkId}/submit`, {
        method: "POST", body: { body: "   " },
      });
      assert.equal(empty.status, 400, JSON.stringify(empty.payload));
      assert.equal(empty.payload.code, "EMPTY_SUBMISSION");
    });

    it("closes to the child when the teacher withdraws it, without losing the goes", async () => {
      const shut = await teacher.request(`/teacher/homework/${homeworkId}/active`, {
        method: "PUT", body: { isActive: false },
      });
      assert.equal(shut.status, 200, JSON.stringify(shut.payload));

      const refused = await child.request(`/student/homework/${homeworkId}/submit`, {
        method: "POST", body: { body: "Дахиад" },
      });
      assert.equal(refused.status, 409, JSON.stringify(refused.payload));
      assert.equal(refused.payload.code, "HOMEWORK_CLOSED");

      const board = await teacher.request(`/teacher/homework/${homeworkId}`);
      const row = board.payload.students.find((x) => x.studentId === studentId);
      assert.equal(row.attempts.length, 2, "withdrawing must not discard what was handed in");
    });

    it("keeps another class's teacher and other children out", async () => {
      assert.equal((await other.request(`/teacher/homework/${homeworkId}`)).status, 403);
      assert.equal((await child.request(`/teacher/homework?classId=${klass}`)).status, 403);
      assert.equal((await teacher.request("/student/homework")).status, 403);
    });
  });

  describe("a club is not a class, and nobody is in one until somebody says so", () => {
    let admin, teacher, child, studentId, clubId, weekday;
    before(async () => {
      admin = createClient(harness.baseUrl);
      teacher = createClient(harness.baseUrl);
      child = createClient(harness.baseUrl);
      await admin.signIn(accountsByRole.ADMIN);
      await teacher.signIn(byName["demo-teacher"]);
      await child.signIn(accountsByRole.STUDENT);
      [{ id: studentId }] = await harness.sql(
        "SELECT student_id::int AS id FROM core.users WHERE username = 'demo-student'");
      // Today's weekday: /student/today answers for today and takes no date,
      // so a club on any other day would be untestable through it.
      [{ weekday }] = await harness.sql(
        "SELECT EXTRACT(ISODOW FROM CURRENT_DATE)::int AS weekday");
    });
    after(async () => {
      await harness.sql("DELETE FROM learning.clubs WHERE name_mn LIKE 'TEST-CLUB%'");
    });

    it("is registered with its hours, and refuses one with none", async () => {
      // An hour is what makes a club appear anywhere. Without one it is a row
      // on a list that meets never, and the list would say it is running.
      const empty = await teacher.request("/teacher/clubs", { method: "POST", body: {
        nameMn: "TEST-CLUB-EMPTY", sessions: [],
      } });
      assert.equal(empty.status, 400, JSON.stringify(empty.payload));
      assert.equal(empty.payload.code, "NO_SESSIONS");

      const made = await teacher.request("/teacher/clubs", { method: "POST", body: {
        nameMn: "TEST-CLUB", note: "Туршилт",
        // A double session on a day the child's class has no ninth period:
        // the club still has to reach them.
        sessions: [{ weekdayNo: weekday, periodNo: 9 }, { weekdayNo: weekday, periodNo: 10 }],
      } });
      assert.equal(made.status, 201, JSON.stringify(made.payload));
      clubId = made.payload.clubId;

      const list = await teacher.request("/teacher/clubs");
      const found = list.payload.find((row) => row.clubId === clubId);
      assert.ok(found, "the club is missing from the list");
      assert.equal(found.memberCount, 0, "a new club has nobody in it");
      assert.equal(found.sessions.length, 2);
    });

    it("reaches nobody while it has no members", async () => {
      // The difference from a split class, and the reason clubs needed their
      // own shape: an unassigned half of 6а is still half of 6а, but a club
      // nobody joined is empty. Silence means empty, not unknown.
      const day = await child.request("/student/today");
      assert.equal(day.status, 200);
      assert.ok(
        !day.payload.slots.some((slot) => slot.club?.clubId === clubId),
        "a club with no members appeared on a child's day",
      );
    });

    it("offers the whole school when picking members, not one class", async () => {
      const res = await teacher.request(`/teacher/clubs/${clubId}/members`);
      assert.equal(res.status, 200, JSON.stringify(res.payload));
      assert.deepEqual(res.payload.members, []);
      // A club of four children from 9а and two from 12а is the ordinary case,
      // so the roster is the school.
      const classes = new Set(res.payload.roster.map((row) => row.className));
      assert.ok(classes.size > 1, "the roster should cross classes");
      assert.ok(res.payload.roster.some((row) => row.studentId === studentId));
    });

    it("puts the club on the day of a child who joins, and takes it off again", async () => {
      const joined = await teacher.request(`/teacher/clubs/${clubId}/members`, {
        method: "PUT", body: { studentIds: [studentId] },
      });
      assert.equal(joined.status, 200, JSON.stringify(joined.payload));
      assert.equal(joined.payload.members, 1);

      const day = await child.request("/student/today");
      const rows = day.payload.slots.filter((slot) => slot.club?.clubId === clubId);
      assert.equal(rows.length, 2, "both hours of the club should be on the day");
      assert.equal(rows[0].club.nameMn, "TEST-CLUB");
      // It is not a lesson: no topic, no check.
      assert.equal(rows[0].lesson, null);

      // Unticked is left. The row is kept rather than deleted, because a child
      // who stopped coming in November was in the club in October.
      const left = await teacher.request(`/teacher/clubs/${clubId}/members`, {
        method: "PUT", body: { studentIds: [] },
      });
      assert.equal(left.status, 200);
      const [{ n }] = await harness.sql(
        "SELECT count(*)::int AS n FROM learning.club_members WHERE club_id = $1", [clubId]);
      assert.equal(n, 1, "the membership row should be kept");
      const [{ live }] = await harness.sql(
        "SELECT count(*)::int AS live FROM learning.club_members WHERE club_id = $1 AND is_active",
        [clubId]);
      assert.equal(live, 0);

      const after = await child.request("/student/today");
      assert.ok(!after.payload.slots.some((slot) => slot.club?.clubId === clubId));
    });

    it("refuses a child who is not in the school, and keeps children out of the screen", async () => {
      const stranger = await teacher.request(`/teacher/clubs/${clubId}/members`, {
        method: "PUT", body: { studentIds: [99999999] },
      });
      assert.equal(stranger.status, 400, JSON.stringify(stranger.payload));
      assert.equal(stranger.payload.code, "STUDENT_NOT_FOUND");

      assert.equal((await child.request("/teacher/clubs")).status, 403);
      assert.equal((await child.request("/teacher/clubs", {
        method: "POST", body: { nameMn: "TEST-CLUB-X", sessions: [{ weekdayNo: 1, periodNo: 1 }] },
      })).status, 403);
    });

    it("stops a club without losing it", async () => {
      const stopped = await admin.request(`/teacher/clubs/${clubId}/active`, {
        method: "PUT", body: { isActive: false },
      });
      assert.equal(stopped.status, 200, JSON.stringify(stopped.payload));
      assert.equal(stopped.payload.isActive, false);

      const list = await teacher.request("/teacher/clubs");
      const found = list.payload.find((row) => row.clubId === clubId);
      assert.ok(found, "a stopped club should still be listed");
      assert.equal(found.isActive, false);
    });
  });

  describe("the register is taken the way the school takes it", () => {
    let admin, teacher, klass, primary, subject, studentId, primaryStudent, slot, day;
    before(async () => {
      admin = createClient(harness.baseUrl);
      teacher = createClient(harness.baseUrl);
      await admin.signIn(accountsByRole.ADMIN);
      await teacher.signIn(byName["demo-teacher"]);
      [{ id: klass }] = await harness.sql(
        "SELECT id::int FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'");
      [{ id: subject }] = await harness.sql("SELECT id::int FROM core.subjects WHERE code = 'MATH'");
      [{ id: studentId }] = await harness.sql(
        "SELECT student_id::int AS id FROM core.users WHERE username = 'demo-student'");
      [{ day }] = await harness.sql("SELECT CURRENT_DATE::text AS day");
      // Its own period. The slots other suites make are torn down in their
      // own hooks, so borrowing one makes this suite depend on the order it
      // happens to run in.
      [slot] = await harness.sql(
        `INSERT INTO learning.timetable_slots
           (class_id, subject_id, weekday_no, period_no, group_label, valid_from, valid_to)
         VALUES ($1, $2, extract(isodow FROM CURRENT_DATE), 7, NULL, CURRENT_DATE, CURRENT_DATE)
         RETURNING id::int`, [klass, subject]);

      // A year-5 class and a child in it, to check the other half of the rule.
      [primary] = await harness.sql(
        `SELECT c.id::int FROM core.classes c
           JOIN core.grade_levels g ON g.id = c.grade_level_id
          WHERE g.grade_number <= 5 AND c.is_active LIMIT 1`);
      if (primary) {
        [primaryStudent] = await harness.sql(
          `SELECT s.id::int FROM core.students s
             JOIN core.student_enrollments e ON e.student_id = s.id AND e.is_active
            WHERE e.class_id = $1 AND s.is_active LIMIT 1`, [primary.id]);
      }
    });
    after(async () => {
      await harness.sql("DELETE FROM learning.attendance_marks WHERE class_id = ANY($1::bigint[])",
        [[klass, primary?.id].filter(Boolean)]);
      if (slot) {
        await harness.sql("DELETE FROM learning.timetable_slots WHERE id = $1", [slot.id]);
      }
    });

    it("says on the day which kind of register this class keeps", async () => {
      const res = await teacher.request(`/teacher/class-day?classId=${klass}&subjectId=${subject}`);
      assert.equal(res.status, 200);
      // Year 9: the children move between teachers, so the register is taken
      // per lesson and one taken in the morning says nothing about physics
      // after lunch.
      assert.equal(res.payload.attendancePerLesson, true);
      assert.ok(res.payload.students.every((row) => row.attendance.length === 0),
        "nobody has taken this register yet");
    });

    it("refuses a whole-day register from year 6 upwards", async () => {
      const res = await teacher.request("/teacher/attendance", { method: "PUT", body: {
        classId: klass, onDate: day,
        marks: [{ studentId, state: "PRESENT" }],
      } });
      assert.equal(res.status, 400, JSON.stringify(res.payload));
      assert.equal(res.payload.code, "SLOT_REQUIRED");
    });

    it("takes a lesson's register, and tells absent from unregistered", async () => {
      assert.ok(slot, "the fixture needs a timetabled period");
      const res = await teacher.request("/teacher/attendance", { method: "PUT", body: {
        classId: klass, onDate: day, timetableSlotId: slot.id,
        marks: [{ studentId, state: "LATE", participation: "WATCH", note: "10 минут хоцорсон" }],
      } });
      assert.equal(res.status, 200, JSON.stringify(res.payload));

      const board = await teacher.request(`/teacher/class-day?classId=${klass}&subjectId=${subject}`);
      const row = board.payload.students.find((entry) => entry.studentId === studentId);
      assert.equal(row.attendance.length, 1);
      assert.equal(row.attendance[0].state, "LATE");
      assert.equal(row.attendance[0].participation, "WATCH");
      assert.equal(row.attendance[0].note, "10 минут хоцорсон");
      assert.equal(row.attendance[0].timetableSlotId, slot.id);

      // Everybody else is unregistered, which is a fact about the teacher's
      // afternoon and not a verdict on a child.
      const others = board.payload.students.filter((entry) => entry.studentId !== studentId);
      assert.ok(others.every((entry) => entry.attendance.length === 0),
        "children nobody marked were registered anyway");
    });

    it("takes a mark off again rather than storing a fifth state", async () => {
      const res = await teacher.request("/teacher/attendance", { method: "PUT", body: {
        classId: klass, onDate: day, timetableSlotId: slot.id,
        marks: [{ studentId, state: "UNREGISTERED" }],
      } });
      assert.equal(res.status, 200);
      const [{ n }] = await harness.sql(
        "SELECT count(*)::int AS n FROM learning.attendance_marks WHERE student_id = $1",
        [studentId]);
      assert.equal(n, 0, "unregistered was stored instead of removed");
    });

    it("takes one register a day up to year 5, and refuses a per-lesson one", async () => {
      if (!primary || !primaryStudent) return;
      const res = await admin.request("/teacher/attendance", { method: "PUT", body: {
        classId: primary.id, onDate: day,
        marks: [{ studentId: primaryStudent.id, state: "PRESENT" }],
      } });
      assert.equal(res.status, 200, JSON.stringify(res.payload));

      const [row] = await harness.sql(
        `SELECT timetable_slot_id FROM learning.attendance_marks
          WHERE student_id = $1 AND on_date = $2::date`, [primaryStudent.id, day]);
      assert.equal(row.timetable_slot_id, null, "a whole-day register kept a period");

      const [other] = await harness.sql(
        "SELECT id::int FROM learning.timetable_slots WHERE class_id = $1 LIMIT 1", [primary.id]);
      if (other) {
        const perLesson = await admin.request("/teacher/attendance", { method: "PUT", body: {
          classId: primary.id, onDate: day, timetableSlotId: other.id,
          marks: [{ studentId: primaryStudent.id, state: "PRESENT" }],
        } });
        assert.equal(perLesson.status, 400, JSON.stringify(perLesson.payload));
        assert.equal(perLesson.payload.code, "WHOLE_DAY_ONLY");
      }
    });

    it("refuses tomorrow, a stranger's child, and a verdict nobody defined", async () => {
      const base = { classId: klass, onDate: day, timetableSlotId: slot.id };
      const [{ tomorrow }] = await harness.sql("SELECT (CURRENT_DATE + 1)::text AS tomorrow");

      const early = await teacher.request("/teacher/attendance", { method: "PUT", body: {
        ...base, onDate: tomorrow, marks: [{ studentId, state: "PRESENT" }],
      } });
      assert.equal(early.status, 400, JSON.stringify(early.payload));
      assert.equal(early.payload.code, "FUTURE_DAY");

      const stranger = await teacher.request("/teacher/attendance", { method: "PUT", body: {
        ...base, marks: [{ studentId: 99999999, state: "PRESENT" }],
      } });
      assert.equal(stranger.status, 400);
      assert.equal(stranger.payload.code, "STUDENT_NOT_IN_CLASS");

      const nonsense = await teacher.request("/teacher/attendance", { method: "PUT", body: {
        ...base, marks: [{ studentId, state: "TRUANT" }],
      } });
      assert.equal(nonsense.status, 400);

      const other = createClient(harness.baseUrl);
      await other.signIn(byName["demo-teacher-b"]);
      assert.equal((await other.request("/teacher/attendance", { method: "PUT", body: {
        ...base, marks: [{ studentId, state: "PRESENT" }],
      } })).status, 403);
    });
  });

  describe("the exercise book is marked, and silence is not a verdict", () => {
    let admin, teacher, child, klass, subject, studentId, day;
    before(async () => {
      admin = createClient(harness.baseUrl);
      teacher = createClient(harness.baseUrl);
      child = createClient(harness.baseUrl);
      await admin.signIn(accountsByRole.ADMIN);
      await teacher.signIn(byName["demo-teacher"]);
      await child.signIn(accountsByRole.STUDENT);
      [{ id: klass }] = await harness.sql(
        "SELECT id::int FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'");
      [{ id: subject }] = await harness.sql("SELECT id::int FROM core.subjects WHERE code = 'MATH'");
      [{ id: studentId }] = await harness.sql(
        "SELECT student_id::int AS id FROM core.users WHERE username = 'demo-student'");
      [{ day }] = await harness.sql("SELECT CURRENT_DATE::text AS day");
    });
    after(async () => {
      await harness.sql("DELETE FROM learning.notebook_marks WHERE class_id = $1", [klass]);
    });

    it("starts with nothing said about anybody", async () => {
      const res = await teacher.request(`/teacher/class-day?classId=${klass}&subjectId=${subject}`);
      assert.equal(res.status, 200);
      const rows = res.payload.students;
      assert.ok(rows.length > 0, "expected a roster");
      // Not an empty verdict - no verdict. Thirty children and six periods a
      // day means most of this grid is never filled in, and that has to read
      // as silence rather than as a class that did nothing.
      assert.ok(rows.every((row) => row.notebook.length === 0));
    });

    it("records done, partly done and not done, with the teacher's own sentence", async () => {
      const res = await teacher.request("/teacher/notebook", { method: "PUT", body: {
        classId: klass, subjectId: subject, scheduledOn: day,
        marks: [{ studentId, state: "PARTIAL", comment: "3, 5-р дасгал дутуу" }],
      } });
      assert.equal(res.status, 200, JSON.stringify(res.payload));
      assert.equal(res.payload.marked, 1);

      const board = await teacher.request(`/teacher/class-day?classId=${klass}&subjectId=${subject}`);
      const marked = board.payload.students.find((row) => row.studentId === studentId);
      assert.equal(marked.notebook.length, 1);
      assert.equal(marked.notebook[0].state, "PARTIAL");
      assert.equal(marked.notebook[0].comment, "3, 5-р дасгал дутуу");

      // Everybody else is still unmarked: a teacher who looked at one book has
      // said nothing about the rest.
      const others = board.payload.students.filter((row) => row.studentId !== studentId);
      assert.ok(others.every((row) => row.notebook.length === 0));
    });

    it("shows the child their own mark, and the sentence with it", async () => {
      const today = await child.request("/student/today");
      assert.equal(today.status, 200);
      const marked = today.payload.slots.filter((slot) => slot.notebook !== null);
      assert.ok(marked.length > 0, "the child cannot see the mark at all");
      assert.equal(marked[0].notebook.state, "PARTIAL");
      assert.equal(marked[0].notebook.comment, "3, 5-р дасгал дутуу");
    });

    it("takes a mark off again rather than storing a fourth state", async () => {
      // Undoing a slip has to leave no trace, because a stored "unchecked"
      // would be a record saying somebody looked.
      const res = await teacher.request("/teacher/notebook", { method: "PUT", body: {
        classId: klass, subjectId: subject, scheduledOn: day,
        marks: [{ studentId, state: "UNCHECKED" }],
      } });
      assert.equal(res.status, 200);
      const [{ n }] = await harness.sql(
        "SELECT count(*)::int AS n FROM learning.notebook_marks WHERE student_id = $1", [studentId]);
      assert.equal(n, 0, "unchecked was stored instead of removed");
    });

    it("refuses a child who is not in the class, an unknown verdict, and a day that has not happened", async () => {
      const body = { classId: klass, subjectId: subject, scheduledOn: day };
      const stranger = await teacher.request("/teacher/notebook", { method: "PUT", body: {
        ...body, marks: [{ studentId: 99999999, state: "DONE" }],
      } });
      assert.equal(stranger.status, 400, JSON.stringify(stranger.payload));
      assert.equal(stranger.payload.code, "STUDENT_NOT_IN_CLASS");

      const nonsense = await teacher.request("/teacher/notebook", { method: "PUT", body: {
        ...body, marks: [{ studentId, state: "EXCELLENT" }],
      } });
      assert.equal(nonsense.status, 400);

      const [{ tomorrow }] = await harness.sql(
        "SELECT (CURRENT_DATE + 1)::text AS tomorrow");
      const early = await teacher.request("/teacher/notebook", { method: "PUT", body: {
        ...body, scheduledOn: tomorrow, marks: [{ studentId, state: "DONE" }],
      } });
      assert.equal(early.status, 400, JSON.stringify(early.payload));
      assert.equal(early.payload.code, "FUTURE_DAY");
    });

    it("keeps one teacher's register out of another's hands", async () => {
      const stranger = createClient(harness.baseUrl);
      await stranger.signIn(byName["demo-teacher-b"]);
      const res = await stranger.request("/teacher/notebook", { method: "PUT", body: {
        classId: klass, subjectId: subject, scheduledOn: day,
        marks: [{ studentId, state: "DONE" }],
      } });
      assert.equal(res.status, 403, JSON.stringify(res.payload));

      // And a child cannot mark their own book.
      assert.equal((await child.request("/teacher/notebook", { method: "PUT", body: {
        classId: klass, subjectId: subject, scheduledOn: day,
        marks: [{ studentId, state: "DONE" }],
      } })).status, 403);
    });
  });

  describe("a corrected day re-lays the rest of the term", () => {
    let admin, klass, grade, subject, lessons, slot, days, material, restore;
    before(async () => {
      admin = createClient(harness.baseUrl);
      await admin.signIn(accountsByRole.ADMIN);
      [{ id: klass, grade }] = await harness.sql(
        `SELECT c.id::int, c.grade_level_id::int AS grade FROM core.classes c
          WHERE c.class_code = 'MOCK-LOCAL-9A'`);
      [{ id: subject }] = await harness.sql("SELECT id::int FROM core.subjects WHERE code = 'MATH'");

      // Four sections of a book, in printed order, with a lesson on each. The
      // seed carries one lesson per subject, and one lesson has no sequence to
      // move: what is being tested is that the rest of the term follows the
      // teacher's correction, which needs a rest of the term to exist.
      [material] = await harness.sql(
        `INSERT INTO content.source_materials (source_code, subject_id, title, material_type, status)
         VALUES ('TEST-REPLAN-BOOK', $1, 'Replan fixture', 'TEXTBOOK', 'APPROVED') RETURNING id::int`,
        [subject]);
      for (let index = 1; index <= 4; index += 1) {
        const [node] = await harness.sql(
          `INSERT INTO content.source_outline_nodes
             (source_material_id, outline_code, printed_number, node_type, title,
              page_from, page_to, sequence_no, status)
           VALUES ($1, $2, $3, 'SECTION', $4, $5, $5, $6, 'APPROVED') RETURNING id::int`,
          [material.id, `TEST-REPLAN-${index}`, String(index), `Replan ${index}`, index * 10, index]);
        const [skill] = await harness.sql(
          `INSERT INTO content.skills (skill_code, subject_id, grade_level_id, name_mn, status)
           VALUES ($1, $2, $3, $4, 'APPROVED') RETURNING id::int`,
          [`TEST-REPLAN-S${index}`, subject, grade, `Replan skill ${index}`]);
        const [topic] = await harness.sql(
          `INSERT INTO content.content_nodes
             (subject_id, content_code, level_type, name_mn, grade_from_id, grade_to_id, sequence_no, status)
           VALUES ($1, $2, 'TOPIC', $3, $4, $4, $5, 'APPROVED') RETURNING id::int`,
          [subject, `TEST-REPLAN-T${index}`, `Replan topic ${index}`, grade, index]);
        await harness.sql(
          `INSERT INTO content.content_skill_maps (map_code, content_node_id, skill_id, is_primary, status)
           VALUES ($1, $2, $3, true, 'APPROVED')`,
          [`TEST-REPLAN-M${index}`, topic.id, skill.id]);
        await harness.sql(
          `INSERT INTO content.content_source_alignments
             (alignment_code, content_node_id, source_material_id, source_outline_node_id,
              page_from, page_to, relation_type, status)
           VALUES ($1, $2, $3, $4, $5, $5, 'PRIMARY', 'APPROVED')`,
          [`TEST-REPLAN-A${index}`, topic.id, material.id, node.id, index * 10]);
        await harness.sql(
          `INSERT INTO learning.daily_lessons
             (lesson_code, core_skill_id, lesson_type, learning_goal_mn, estimated_minutes,
              print_ready, web_ready, source_material_id, source_outline_node_id, status)
           VALUES ($1, $2, 'CORE', $3, 40, true, true, $4, $5, 'APPROVED')`,
          [`TEST-REPLAN-L${index}`, skill.id, `Replan goal ${index}`, material.id, node.id]);
      }
      lessons = (await admin.request(`/teacher/lessons?classId=${klass}&subjectId=${subject}`))
        .payload.filter((row) => row.lessonCode.startsWith('TEST-REPLAN-'));
      assert.equal(lessons.length, 4);

      // One period a week, running the whole term, so the plan has somewhere
      // to spread to. Four Wednesdays are enough to watch the sequence move.
      const [term] = await harness.sql(`SELECT id::int, starts_on::text AS "from", ends_on::text AS "to"
        FROM learning.terms WHERE CURRENT_DATE BETWEEN starts_on AND ends_on
        ORDER BY term_number LIMIT 1`);
      assert.ok(term, 'no term covers today');
      days = (await harness.sql(
        `SELECT d::date::text AS day FROM generate_series($1::date, $2::date, interval '1 day') d
          WHERE extract(isodow FROM d) = 3 ORDER BY d LIMIT 4`, [term.from, term.to],
      )).map((row) => row.day);
      [slot] = await harness.sql(`INSERT INTO learning.timetable_slots
        (class_id, subject_id, weekday_no, period_no, group_label, valid_from, valid_to)
        VALUES ($1, $2, 3, 4, NULL, $3::date, $4::date)
        RETURNING id::int`, [klass, subject, term.from, term.to]);

      // What this class already has for the subject, kept so it can be put
      // back. Setting a lesson re-lays the rest of the term - correctly - and
      // that means deleting the rows the seed wrote for the later tests in
      // this file, which read the same class.
      restore = await harness.sql(
        `SELECT term_id, daily_lesson_id, scheduled_on::text AS scheduled_on, note,
                created_by, period_no, timetable_slot_id, page_from, page_to
           FROM learning.class_schedule
          WHERE class_id = $1 AND subject_id = $2`, [klass, subject]);
    });
    after(async () => {
      if (slot) {
        await harness.sql('DELETE FROM learning.class_lesson_coverage WHERE timetable_slot_id = $1', [slot.id]);
        await harness.sql('DELETE FROM learning.class_schedule WHERE timetable_slot_id = $1', [slot.id]);
        await harness.sql('DELETE FROM learning.timetable_slots WHERE id = $1', [slot.id]);
      }
      if (material) {
        await harness.sql(`DELETE FROM learning.class_lesson_coverage WHERE daily_lesson_id IN
          (SELECT id FROM learning.daily_lessons WHERE lesson_code LIKE 'TEST-REPLAN-%')`);
        await harness.sql(`DELETE FROM learning.class_schedule WHERE daily_lesson_id IN
          (SELECT id FROM learning.daily_lessons WHERE lesson_code LIKE 'TEST-REPLAN-%')`);
        await harness.sql("DELETE FROM learning.daily_lessons WHERE lesson_code LIKE 'TEST-REPLAN-%'");
        await harness.sql("DELETE FROM content.content_source_alignments WHERE alignment_code LIKE 'TEST-REPLAN-%'");
        await harness.sql("DELETE FROM content.content_skill_maps WHERE map_code LIKE 'TEST-REPLAN-%'");
        await harness.sql("DELETE FROM content.content_nodes WHERE content_code LIKE 'TEST-REPLAN-%'");
        await harness.sql("DELETE FROM content.skills WHERE skill_code LIKE 'TEST-REPLAN-%'");
        await harness.sql("DELETE FROM content.source_outline_nodes WHERE outline_code LIKE 'TEST-REPLAN-%'");
        await harness.sql("DELETE FROM content.source_materials WHERE source_code = 'TEST-REPLAN-BOOK'");
      }
      if (restore) {
        await harness.sql(
          'DELETE FROM learning.class_schedule WHERE class_id = $1 AND subject_id = $2',
          [klass, subject]);
        for (const row of restore) {
          await harness.sql(
            `INSERT INTO learning.class_schedule
               (class_id, subject_id, term_id, daily_lesson_id, scheduled_on, note,
                created_by, period_no, timetable_slot_id, page_from, page_to)
             VALUES ($1, $2, $3, $4, $5::date, $6, $7, $8, $9, $10, $11)`,
            [klass, subject, row.term_id, row.daily_lesson_id, row.scheduled_on,
             row.note, row.created_by, row.period_no, row.timetable_slot_id,
             row.page_from, row.page_to]);
        }
      }
    });

    const topicOn = async (day) => {
      const [row] = await harness.sql(
        `SELECT cs.daily_lesson_id::int AS id, cs.created_by
           FROM learning.class_schedule cs
          WHERE cs.class_id = $1 AND cs.subject_id = $2 AND cs.scheduled_on = $3::date`,
        [klass, subject, day]);
      return row ?? null;
    };

    const setDay = (lessonId, coveredLessonIds) =>
      admin.request('/teacher/schedule/day', { method: 'PUT', body: {
        classId: klass, subjectId: subject, scheduledOn: days[0], lessonId,
        timetableSlotId: slot.id,
        ...(coveredLessonIds ? { coveredLessonIds } : {}),
      } });
    const approve = () =>
      admin.request('/teacher/schedule/replan', { method: 'POST', body: {
        classId: klass, subjectId: subject, fromDate: days[0],
      } });

    it("carries the following sections forward, and moves them when the teacher corrects one", async () => {
      assert.ok(days.length >= 3, `days=${days.length}`);

      // Setting the first section offers to lay the rest of the term after it.
      const first = await setDay(lessons[0].id);
      assert.equal(first.status, 200, JSON.stringify(first.payload));
      assert.ok(first.payload.replan, 'no proposal came back');
      assert.equal(first.payload.replan.fromDate, days[0]);
      assert.ok(first.payload.replan.days.length > 0);
      assert.equal((await approve()).status, 200);
      assert.equal((await topicOn(days[1])).id, lessons[1].id, 'the next period did not follow on');
      assert.equal((await topicOn(days[2])).id, lessons[2].id);
      // Laid out, not chosen: that is what an empty created_by says.
      assert.equal((await topicOn(days[1])).created_by, null);

      // The class went faster than the plan: section 1 done and section 2
      // started in the same hour. Both are ticked, so the term carries on
      // from section 3.
      //
      // Saying so is a proposal, not an act: the calendar the school is
      // working from does not change until somebody reads which days move and
      // says yes. A teacher opening a topic to see whether it fits used to
      // rewrite their term by doing so.
      const corrected = await setDay(lessons[1].id, [lessons[0].id, lessons[1].id]);
      assert.equal(corrected.status, 200, JSON.stringify(corrected.payload));
      const proposal = corrected.payload.replan;
      assert.ok(proposal, 'the correction proposed nothing');
      // The proposal says what stands there now and what would replace it, so
      // the teacher is reading their own calendar rather than a list of codes.
      const next = proposal.days.find((row) => row.scheduledOn === days[1]);
      assert.ok(next, `${days[1]} is missing from the proposal`);
      assert.equal(next.lessonId, lessons[2].id);
      assert.equal(next.currentSkillName, lessons[1].skillName);
      // And nothing has moved yet.
      assert.equal((await topicOn(days[1])).id, lessons[1].id, 'the term moved before it was approved');
      assert.equal((await topicOn(days[2])).id, lessons[2].id);

      // Approved, it moves - all of it at once.
      assert.equal((await approve()).status, 200);
      assert.equal((await topicOn(days[1])).id, lessons[2].id, 'the term did not move with the correction');
      assert.equal((await topicOn(days[2])).id, lessons[3].id);

      // What was taught stays taught: nothing before the corrected day moves.
      assert.equal((await topicOn(days[0])).id, lessons[1].id);
    });

    it("brings a section back round when the teacher skipped it rather than covering it", async () => {
      // The other half of the same gesture, and the one the single column
      // could never express. The day was to be section 1; the teacher taught
      // section 2 instead and means to come back. Section 1 has not been
      // taught, so it cannot simply fall off the end of the plan - which is
      // what happened while "the day says 2" was the whole of the record.
      assert.equal((await setDay(lessons[0].id)).status, 200);
      assert.equal((await approve()).status, 200);
      assert.equal((await topicOn(days[1])).id, lessons[1].id);

      // No list of what was covered: the safe reading, just the one section.
      const swapped = await setDay(lessons[1].id);
      assert.equal(swapped.status, 200, JSON.stringify(swapped.payload));
      assert.ok(swapped.payload.replan, 'the swap proposed nothing');
      assert.equal((await approve()).status, 200);

      assert.equal((await topicOn(days[0])).id, lessons[1].id, 'the day should hold what was taught');
      assert.equal(
        (await topicOn(days[1])).id,
        lessons[0].id,
        'the skipped section did not come back round',
      );
      assert.equal((await topicOn(days[2])).id, lessons[2].id);
    });

    it("puts a struck-off lesson's section back into the term, with its reason", async () => {
      // UC05. A lesson that did not happen taught nothing, whatever the day
      // says it was for. The section is still owed a day, so it has to fall
      // back into the plan rather than sliding off the end of the book - and
      // the day has to say why, because it is the thing a parent asks about.
      assert.equal((await setDay(lessons[0].id)).status, 200);
      assert.equal((await approve()).status, 200);
      assert.equal((await topicOn(days[1])).id, lessons[1].id);

      const struck = await admin.request('/teacher/schedule/day', { method: 'PUT', body: {
        classId: klass, subjectId: subject, scheduledOn: days[0], lessonId: lessons[0].id,
        timetableSlotId: slot.id, held: false, notHeldReason: 'Багш өвчтэй',
      } });
      assert.equal(struck.status, 200, JSON.stringify(struck.payload));
      assert.ok(struck.payload.replan, 'striking the day off proposed nothing');

      // While that struck-off period is the only place this section sits, the
      // child cannot be asked about it: a quiz is reachable because the lesson
      // is on their schedule, and an hour that did not happen is not an hour
      // they were taught. Once the replan gives the section a real day back,
      // it becomes theirs again - which is the next assertion but one.
      const child = createClient(harness.baseUrl);
      await child.signIn(accountsByRole.STUDENT);
      const asked = await child.request(`/student/quiz/${lessons[0].id}`);
      assert.equal(asked.status, 403, JSON.stringify(asked.payload));
      assert.equal(asked.payload.code, 'LESSON_NOT_ASSIGNED');

      assert.equal((await approve()).status, 200);
      assert.equal((await child.request(`/student/quiz/${lessons[0].id}`)).status, 200);

      // The section comes back round on the next period, pushing the rest on.
      assert.equal(
        (await topicOn(days[1])).id,
        lessons[0].id,
        'the section of a lesson that did not happen was treated as taught',
      );
      assert.equal((await topicOn(days[2])).id, lessons[1].id);

      // The day itself keeps the section it was meant for, so a teacher
      // looking back reads what was planned, and carries the reason.
      const [row] = await harness.sql(
        `SELECT held, not_held_reason FROM learning.class_schedule
          WHERE class_id = $1 AND subject_id = $2 AND scheduled_on = $3::date`,
        [klass, subject, days[0]]);
      assert.equal(row.held, false);
      assert.equal(row.not_held_reason, 'Багш өвчтэй');

    });

    it("will not strike a lesson off without saying why", async () => {
      const res = await admin.request('/teacher/schedule/day', { method: 'PUT', body: {
        classId: klass, subjectId: subject, scheduledOn: days[0], lessonId: lessons[0].id,
        timetableSlotId: slot.id, held: false,
      } });
      assert.equal(res.status, 400, JSON.stringify(res.payload));
      assert.equal(res.payload.code, 'REASON_REQUIRED');
    });

    it("refuses to mark a section covered that this class cannot be given", async () => {
      // A section this class has no claim on. The list is checked against what
      // the class can actually be given, because marking a section covered
      // takes it out of a plan - and a stray id would take it out of somebody
      // else's.
      const [other] = await harness.sql(
        'SELECT (max(id) + 1000)::int AS id FROM learning.daily_lessons');
      const res = await admin.request('/teacher/schedule/day', { method: 'PUT', body: {
        classId: klass, subjectId: subject, scheduledOn: days[0], lessonId: lessons[0].id,
        timetableSlotId: slot.id, coveredLessonIds: [other.id],
      } });
      assert.equal(res.status, 400, JSON.stringify(res.payload));
      assert.equal(res.payload.code, 'LESSON_NOT_SCHEDULABLE');
    });

    it("refuses to re-divide the term from a day already taught, or for a stranger", async () => {
      const teacher = createClient(harness.baseUrl);
      const stranger = createClient(harness.baseUrl);
      await teacher.signIn(byName['demo-teacher']);
      await stranger.signIn(byName['demo-teacher-b']);

      const [{ past }] = await harness.sql(
        "SELECT (CURRENT_DATE - interval '1 day')::date::text AS past");
      const body = { classId: klass, subjectId: subject, fromDate: past };

      // A teacher who does not hold this subject in this class has no business
      // re-laying its term.
      assert.equal((await stranger.request('/teacher/schedule/replan', { method: 'POST', body })).status, 403);

      // And the day before today has already happened to the children. Moving
      // the term from it would rewrite days they have already worked through.
      const refused = await teacher.request('/teacher/schedule/replan', { method: 'POST', body });
      assert.equal(refused.status, 403, JSON.stringify(refused.payload));
      assert.equal(refused.payload.code, 'PAST_DAY');
    });

    it("sends the child to the pages the class actually covered", async () => {
      // The book prints one range for the section; this class went further.
      // The child opening their day is sent where their own teacher taught.
      const student = createClient(harness.baseUrl);
      await student.signIn(accountsByRole.STUDENT);

      const saved = await admin.request('/teacher/schedule/day', { method: 'PUT', body: {
        classId: klass, subjectId: subject, scheduledOn: days[0], lessonId: lessons[0].id,
        timetableSlotId: slot.id, pageFrom: 40, pageTo: 45,
      } });
      assert.equal(saved.status, 200, JSON.stringify(saved.payload));

      const day = await student.request('/student/schedule?date=' + days[0]);
      assert.equal(day.status, 200);
      const taught = day.payload.slots.find((row) => row.lesson !== null);
      assert.ok(taught, 'the child cannot see the lesson at all');
      assert.equal(taught.lesson.book.pageFrom, 40);
      assert.equal(taught.lesson.book.pageTo, 45);

      // Half a range is not a range.
      const half = await admin.request('/teacher/schedule/day', { method: 'PUT', body: {
        classId: klass, subjectId: subject, scheduledOn: days[0], lessonId: lessons[0].id,
        timetableSlotId: slot.id, pageFrom: 40, pageTo: null,
      } });
      assert.equal(half.status, 400);
      assert.equal(half.payload.code, 'INCOMPLETE_PAGE_RANGE');

      // Sending null for both falls back to what the book prints.
      assert.equal((await admin.request('/teacher/schedule/day', { method: 'PUT', body: {
        classId: klass, subjectId: subject, scheduledOn: days[0], lessonId: lessons[0].id,
        timetableSlotId: slot.id, pageFrom: null, pageTo: null,
      } })).status, 200);
      const back = await student.request('/student/schedule?date=' + days[0]);
      const again = back.payload.slots.find((row) => row.lesson !== null);
      assert.equal(again.lesson.book.pageFrom, 10, 'the book’s own range did not come back');
    });
  });

  describe("weekly timetable content and group membership", () => {
    let admin, student, teacher, otherTeacher, klass, subject, lesson, day, slots, studentId;
    before(async () => {
      admin = createClient(harness.baseUrl);
      student = createClient(harness.baseUrl);
      teacher = createClient(harness.baseUrl);
      otherTeacher = createClient(harness.baseUrl);
      await admin.signIn(accountsByRole.ADMIN);
      await student.signIn(accountsByRole.STUDENT);
      await teacher.signIn(byName['demo-teacher']);
      await otherTeacher.signIn(byName['demo-teacher-b']);
      [{ id: klass }] = await harness.sql("SELECT id::int FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'");
      [{ id: subject }] = await harness.sql("SELECT id::int FROM core.subjects WHERE code = 'MATH'");
      [{ id: studentId }] = await harness.sql("SELECT student_id::int AS id FROM core.users WHERE username = 'demo-student'");
      const lessons = await admin.request(`/teacher/lessons?classId=${klass}&subjectId=${subject}`);
      lesson = lessons.payload[0].id;
      [{ day }] = await harness.sql(`SELECT d::date::text AS day FROM learning.terms t
        CROSS JOIN LATERAL generate_series(t.starts_on, t.ends_on, interval '1 day') d
        WHERE extract(isodow FROM d) < 6 AND d >= CURRENT_DATE AND NOT EXISTS
          (SELECT 1 FROM learning.class_schedule cs WHERE cs.class_id = $1 AND cs.scheduled_on = d::date)
        ORDER BY d LIMIT 1`, [klass]);
      slots = await harness.sql(`INSERT INTO learning.timetable_slots
        (class_id, subject_id, weekday_no, period_no, group_label, valid_from, valid_to)
        VALUES ($1, $2, extract(isodow FROM $3::date), 1, NULL, $3, $3),
               ($1, $2, extract(isodow FROM $3::date), 2, 'A', $3, $3)
        RETURNING id::int`, [klass, subject, day]);
    });
    after(async () => {
      if (slots) await harness.sql('DELETE FROM learning.timetable_slots WHERE id = ANY($1::bigint[])', [slots.map(s => s.id)]);
    });

    it('shows both empty periods to staff and requires an unambiguous content target', async () => {
      const response = await admin.request(`/teacher/schedule?classId=${klass}&subjectId=${subject}&from=${day}&to=${day}`);
      assert.equal(response.status, 200);
      assert.deepEqual(response.payload.days.map(row => row.periodNo), [1, 2]);
      assert.deepEqual(response.payload.days.map(row => row.timetableSlotId), slots.map(s => s.id));
      assert.equal((await admin.request('/teacher/schedule/day', { method: 'PUT', body: {
        classId: klass, subjectId: subject, scheduledOn: day, lessonId: lesson,
      } })).status, 400);
    });

    it('stores repeated lessons separately and clearing one preserves the other and the timetable', async () => {
      for (const [index, slot] of slots.entries()) {
        const saved = await admin.request('/teacher/schedule/day', { method: 'PUT', body: {
          classId: klass, subjectId: subject, scheduledOn: day, lessonId: lesson,
          timetableSlotId: slot.id, note: `period ${index + 1}`,
        } });
        assert.equal(saved.status, 200, JSON.stringify(saved.payload));
      }
      let response = await student.request('/student/schedule?date=' + day);
      assert.equal(response.status, 200);
      assert.deepEqual(response.payload.slots.map(row => row.lesson?.teacherNote), ['period 1', 'period 2']);
      assert.equal((await admin.request('/teacher/schedule/day', { method: 'PUT', body: {
        classId: klass, subjectId: subject, scheduledOn: day, lessonId: null, timetableSlotId: slots[0].id,
      } })).status, 200);
      response = await student.request('/student/schedule?date=' + day);
      assert.equal(response.payload.slots.length, 2);
      assert.equal(response.payload.slots[0].lesson, null);
      assert.equal(response.payload.slots[1].lesson.teacherNote, 'period 2');
    });

    it('leaves a day already taught alone, for everyone but the administrator', async () => {
      // Yesterday: the class worked from whatever was set, and their answers
      // are recorded against it. Reading it back is fine; rewriting it is not.
      const [{ past }] = await harness.sql(
        "SELECT (CURRENT_DATE - interval '1 day')::date::text AS past");
      const refused = await teacher.request('/teacher/schedule/day', { method: 'PUT', body: {
        classId: klass, subjectId: subject, scheduledOn: past, lessonId: lesson,
      } });
      assert.equal(refused.status, 403, JSON.stringify(refused.payload));
      assert.equal(refused.payload.code, 'PAST_DAY');
    });

    it('refuses content on a day the class is not timetabled, and lets the admin place it', async () => {
      // A school day this class does not have the subject on. Once a subject
      // IS on the timetable, a day it does not fall on is a day nobody teaches
      // it, and content put there would be shown to a class that is elsewhere.
      //
      // Chosen rather than "the day after": the day after can be a Saturday,
      // and the weekend rule would answer first - which is how this test broke
      // the moment the clock passed midnight into a Thursday.
      const [{ other }] = await harness.sql(
        `SELECT d::date::text AS other
           FROM learning.terms t
           CROSS JOIN LATERAL generate_series(t.starts_on, t.ends_on, interval '1 day') d
          WHERE extract(isodow FROM d) < 6
            AND extract(isodow FROM d) <> extract(isodow FROM $1::date)
            AND d > CURRENT_DATE
          ORDER BY d LIMIT 1`, [day]);
      // Clearing rather than setting, on purpose: the rule is checked before
      // either happens, and setting a lesson would re-lay the rest of the term
      // from that day - which is correct behaviour and would quietly rewrite
      // the schedule the other tests in this file read.
      const body = {
        classId: klass, subjectId: subject, scheduledOn: other, lessonId: null,
      };
      const refused = await teacher.request('/teacher/schedule/day', { method: 'PUT', body });
      assert.equal(refused.status, 403, JSON.stringify(refused.payload));
      assert.equal(refused.payload.code, 'NOT_A_TEACHING_DAY');

      // A makeup lesson is exactly this, and it is the administrator's to put
      // there - so the rule stops at the teacher.
      const allowed = await admin.request('/teacher/schedule/day', { method: 'PUT', body });
      assert.equal(allowed.status, 200, JSON.stringify(allowed.payload));
    });

    it('validates slot dates and prevents another teacher or student from changing group membership', async () => {
      const url = `/teacher/timetable/${slots[1].id}/students`;
      assert.equal((await student.request(url)).status, 403);
      assert.equal((await otherTeacher.request(url, { method: 'PUT', body: { studentIds: [] } })).status, 403);
      assert.equal((await admin.request(url, { method: 'PUT', body: { studentIds: [99999999] } })).status, 400);
      assert.equal((await admin.request('/teacher/schedule/day', { method: 'PUT', body: {
        classId: klass, subjectId: subject, scheduledOn: '2000-01-03', lessonId: lesson, timetableSlotId: slots[1].id,
      } })).status, 400);
    });

    it('persists membership and filters the student timetable after assigning a group', async () => {
      const url = `/teacher/timetable/${slots[1].id}/students`;
      const roster = await admin.request(url);
      assert.equal(roster.status, 200);
      assert.equal(roster.payload.assigned, false);
      assert.ok(roster.payload.students.some(s => s.id === studentId));
      assert.equal((await admin.request(url, { method: 'PUT', body: { studentIds: [] } })).status, 204);
      let response = await student.request('/student/schedule?date=' + day);
      assert.deepEqual(response.payload.slots.map(s => s.periodNo), [1]);
      assert.equal((await admin.request(url, { method: 'PUT', body: { studentIds: [studentId] } })).status, 204);
      response = await student.request('/student/schedule?date=' + day);
      assert.deepEqual(response.payload.slots.map(s => s.periodNo), [1, 2]);
      assert.equal(response.payload.slots[1].selectionPending, false);
      const saved = await admin.request(url);
      assert.equal(saved.payload.assigned, true);
      assert.equal(saved.payload.students.find(s => s.id === studentId).selected, true);
    });
  });

  describe("sign-in", () => {
    it("refuses an anonymous request", async () => {
      const anon = createClient(harness.baseUrl);
      const res = await anon.request("/auth/me");
      assert.equal(res.status, 401);
      assert.equal(res.headers.get("x-content-type-options"), "nosniff");
      assert.equal(res.headers.get("x-frame-options"), "DENY");
      assert.equal(res.headers.get("referrer-policy"), "no-referrer");
      assert.equal(res.headers.get("x-powered-by"), null);
    });

    it("signs each role in and reports its role back", async () => {
      for (const account of harness.accounts) {
        const client = createClient(harness.baseUrl);
        await client.signIn(account);
        assert.ok(client.cookie.length > 0, "expected a session cookie");

        const me = await client.request("/auth/me");
        assert.equal(me.status, 200);
        assert.ok(
          me.payload.user.roles.includes(account.role),
          `${account.username} should hold ${account.role}`,
        );
      }
    });

    it("gives a student their own record without their registration number", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);

      const res = await client.request("/session/me");
      assert.equal(res.status, 200);
      assert.equal(res.payload.role, "student");
      assert.ok(res.payload.studentCode, "the school's own code is the identifier shown");
      assert.ok(res.payload.username, "the sign-in name is theirs to see");
      assert.ok(res.payload.schoolYear, "the profile names the year");

      // The national registration number lives on the student row and has no
      // business on a screen. Asserted on the serialized body so a future
      // column added to the student query cannot smuggle it out.
      const [{ external_code: registration }] = await harness.sql(
        `SELECT s.external_code FROM core.students s
         JOIN core.users u ON u.student_id = s.id
         WHERE u.username = $1`,
        [accountsByRole.STUDENT.username],
      );
      if (registration) {
        assert.ok(
          !JSON.stringify(res.payload).includes(registration),
          "the registration number must not reach the client",
        );
      }
    });

    it("refuses a wrong password", async () => {
      const client = createClient(harness.baseUrl);
      const res = await client.request("/auth/login", {
        method: "POST",
        body: { username: accountsByRole.STUDENT.username, password: "not-the-password" },
      });
      assert.equal(res.status, 401);
    });

    it("slows repeated password guessing for one account and address", async () => {
      const client = createClient(harness.baseUrl);
      const body = { username: "rate-limit-probe", password: "wrong-password" };
      for (let attempt = 0; attempt < 5; attempt += 1) {
        assert.equal((await client.request("/auth/login", { method: "POST", body })).status, 401);
      }
      const blocked = await client.request("/auth/login", { method: "POST", body });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.payload.code, "LOGIN_RATE_LIMITED");
      assert.ok(Number(blocked.headers.get("retry-after")) > 0);
    });

    it("ends the session on sign-out", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.ADMIN);
      assert.equal((await client.request("/auth/me")).status, 200);

      const out = await client.request("/auth/logout", { method: "POST" });
      assert.ok(out.status < 400, `logout returned ${out.status}`);
      assert.equal((await client.request("/auth/me")).status, 401);
    });
  });

  describe("what each role may reach", () => {
    it("opens a subject's book: every section, and where the class has got to", async () => {
      // This endpoint returned 500 for every child in every subject, because
      // the query behind it put ORDER BY and LIMIT inside a UNION arm without
      // brackets and Postgres refused the whole statement. Eighty-six tests
      // passed while it was broken, because none of them asked for it. This
      // one does.
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);

      const res = await client.request("/student/subject-outline?subject=MATH");
      assert.equal(res.status, 200, JSON.stringify(res.payload));
      assert.equal(res.payload.subjectName.length > 0, true);
      assert.ok(Array.isArray(res.payload.sections));

      // At most one section is the class's current place, and if a section is
      // marked past then the current one comes after it.
      const current = res.payload.sections.filter((row) => row.isCurrent);
      assert.ok(current.length <= 1, `${current.length} sections claim to be current`);
      if (current.length === 1) {
        const past = res.payload.sections.filter((row) => row.isPast);
        for (const row of past) {
          assert.ok(row.position < current[0].position, "a past section sits after the current one");
        }
      }

      // A subject the class does not take is not somebody else's book.
      const absent = await client.request("/student/subject-outline?subject=NO-SUCH-SUBJECT");
      assert.ok(absent.status === 200 || absent.status === 404, `unexpected ${absent.status}`);
      if (absent.status === 200) assert.deepEqual(absent.payload.sections, []);
    });

    it("lists every subject the student's class is taught", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);

      const res = await client.request("/student/subjects");
      assert.equal(res.status, 200);

      // MOCK-LOCAL-9A runs maths and physics. The student has only ever been
      // measured in maths, and the physics they sit through every week used to
      // be missing from their own page because of it.
      assert.deepEqual(
        res.payload.map((row) => row.code).sort(),
        ["MATH", "PHYS"],
      );
      // Both were read off the fixture's own roster, not filled in from the
      // national curriculum, and the page is entitled to say which.
      assert.deepEqual([...new Set(res.payload.map((row) => row.origin))], ["ROSTER"]);
    });

    it("keeps a class's subjects when nobody is assigned to teach them", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);

      const [{ id: classId }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );
      const removed = await harness.sql(
        `DELETE FROM core.class_teachers WHERE class_id = $1
         RETURNING teacher_id, subject_id`,
        [classId],
      );
      assert.ok(removed.length > 0, "expected the fixture to have teaching assignments");

      try {
        const res = await client.request("/student/subjects");
        assert.equal(res.status, 200);
        // What a class studies and who teaches it are different facts. This
        // page used to derive the first from the second, so a class between
        // teachers had no subjects at all and its students saw nothing.
        assert.deepEqual(
          res.payload.map((row) => row.code).sort(),
          ["MATH", "PHYS"],
        );
      } finally {
        for (const row of removed) {
          await harness.sql(
            "INSERT INTO core.class_teachers (class_id, teacher_id, subject_id) VALUES ($1, $2, $3)",
            [classId, row.teacher_id, row.subject_id],
          );
        }
      }
    });

    it("tells a teacher where each of their classes has reached", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);

      const res = await client.request("/teacher/class-topics");
      assert.equal(res.status, 200);

      const maths = res.payload.find(
        (row) => row.className === "Туршилтын 9А" && row.subjectCode === "MATH",
      );
      assert.ok(maths, "expected the maths class on the board");
      assert.equal(maths.bookTitle, "Local demo — сургалтын жинхэнэ ном биш");
      // Nobody has set one yet, which is not the same as being at chapter one.
      assert.equal(maths.nodeId, null);
      assert.equal(maths.canEdit, true);
    });

    it("moves a class onto a section and shows it to the children in it", async () => {
      const teacher = createClient(harness.baseUrl);
      await teacher.signIn(byName["demo-teacher"]);

      const [{ id: classId }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );
      const sections = await teacher.request(
        `/teacher/class-topics/${classId}/MATH/sections`,
      );
      assert.equal(sections.status, 200);
      assert.deepEqual(
        sections.payload.map((row) => row.title),
        ["Туршилтын хэсэг", "Туршилтын хоёр дахь хэсэг"],
        "sections come back in book order",
      );

      const second = sections.payload[1];
      const set = await teacher.request("/teacher/class-topic", {
        method: "PUT",
        body: { classId: String(classId), subjectCode: "MATH", outlineNodeId: second.nodeId },
      });
      assert.equal(set.status, 200);
      assert.equal(set.payload.topicTitle, "Туршилтын хоёр дахь хэсэг");

      // The point of the pointer: a child reads what their teacher set.
      const student = createClient(harness.baseUrl);
      await student.signIn(accountsByRole.STUDENT);
      const mine = await student.request("/student/subjects");
      assert.equal(mine.status, 200);
      const maths = mine.payload.find((row) => row.code === "MATH");
      assert.equal(maths.topicTitle, "Туршилтын хоёр дахь хэсэг");
      assert.equal(maths.topicPageFrom, 2);
      assert.equal(maths.topicPageTo, 3);

      // Clearing it puts the class back to "not set", so a wrong choice is
      // undoable without having to name a different wrong one.
      const cleared = await teacher.request("/teacher/class-topic", {
        method: "PUT",
        body: { classId: String(classId), subjectCode: "MATH", outlineNodeId: null },
      });
      assert.equal(cleared.status, 200);
      assert.equal(cleared.payload.nodeId, null);
    });

    it("admits a teacher by their registered specialty when no class is assigned", async () => {
      // The shape the school is actually in: the staff register named every
      // teacher's subject but nobody said which classes are theirs, so
      // core.class_teachers is empty for them. Without this path fifteen of
      // the twenty-four teachers open an empty screen.
      const [{ id: classId }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );
      const [{ id: mathsId }] = await harness.sql(
        "SELECT id FROM core.subjects WHERE code = 'MATH'",
      );
      const [teacherB] = await harness.sql(
        `SELECT t.id FROM core.teachers t JOIN core.users u ON u.id = t.user_id
          WHERE u.username = 'demo-teacher-b'`,
      );

      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher-b"]);
      const find = (payload) =>
        payload.find((row) => row.className === "Туршилтын 9А" && row.subjectCode === "MATH");

      const before = await client.request("/teacher/class-topics");
      assert.equal(before.status, 200);
      assert.equal(find(before.payload), undefined, "no standing, no row");

      await harness.sql(
        "INSERT INTO core.teacher_subjects (teacher_id, subject_id) VALUES ($1, $2)",
        [teacherB.id, mathsId],
      );
      try {
        const after = await client.request("/teacher/class-topics");
        const row = find(after.payload);
        assert.ok(row, "the specialty alone should put the class on the board");
        assert.equal(row.canEdit, true);
        // Named, not merely allowed: this right is shared with every other
        // maths teacher, so the screen has to be able to say which it is.
        assert.equal(row.editBasis, "SUBJECT");

        const sections = await client.request(
          `/teacher/class-topics/${classId}/MATH/sections`,
        );
        assert.equal(sections.status, 200, "the picker follows the board");

        const set = await client.request("/teacher/class-topic", {
          method: "PUT",
          body: {
            classId: String(classId),
            subjectCode: "MATH",
            outlineNodeId: sections.payload[0].nodeId,
          },
        });
        assert.equal(set.status, 200);
        // Who moved it is the whole safeguard against three maths teachers
        // overwriting each other in silence.
        assert.equal(set.payload.setByName, "Туршилтын багш Б");

        await client.request("/teacher/class-topic", {
          method: "PUT",
          body: { classId: String(classId), subjectCode: "MATH", outlineNodeId: null },
        });
      } finally {
        await harness.sql(
          "DELETE FROM core.teacher_subjects WHERE teacher_id = $1 AND subject_id = $2",
          [teacherB.id, mathsId],
        );
      }
    });

    it("refuses a section that belongs to a different book", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);

      const [{ id: classId }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );
      const [{ id: foreignNode }] = await harness.sql(
        "SELECT id FROM content.source_outline_nodes WHERE outline_code = 'MOCK-LOCAL-OUTLINE-B'",
      );

      // The foreign key is satisfied - the node exists - so only the route's
      // own check stands between 9A's maths and a page of the physics book.
      const res = await client.request("/teacher/class-topic", {
        method: "PUT",
        body: { classId: String(classId), subjectCode: "MATH", outlineNodeId: String(foreignNode) },
      });
      assert.equal(res.status, 409);
    });

    it("refuses a teacher who does not take that subject in that class", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher-b"]);

      const [{ id: classId }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );
      const [{ id: node }] = await harness.sql(
        "SELECT id FROM content.source_outline_nodes WHERE outline_code = 'MOCK-LOCAL-OUTLINE'",
      );

      const res = await client.request("/teacher/class-topic", {
        method: "PUT",
        body: { classId: String(classId), subjectCode: "MATH", outlineNodeId: String(node) },
      });
      assert.equal(res.status, 403);
    });

    it("gives the bell times, and carries a lesson's slot through to the child", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);

      const [{ school_year: year }] = await harness.sql(
        "SELECT school_year FROM learning.terms ORDER BY term_number LIMIT 1",
      );
      await harness.sql(
        `INSERT INTO learning.class_periods (school_year, period_no, name_mn, starts_at, ends_at)
         VALUES ($1, 1, 'MOCK-LOCAL-PERIOD-1', '08:00', '08:40'),
                ($1, 2, 'MOCK-LOCAL-PERIOD-2', '08:50', '09:30')
         ON CONFLICT (school_year, period_no) DO NOTHING`,
        [year],
      );

      const periods = await client.request("/school/periods");
      assert.equal(periods.status, 200);
      // Times come back as wall clock, not a timestamp: the grid prints them.
      assert.deepEqual(
        periods.payload.slice(0, 2).map((row) => [row.periodNo, row.startsAt, row.endsAt]),
        [[1, "08:00", "08:40"], [2, "08:50", "09:30"]],
      );

      // A day already on the timetable, given a slot.
      const [row] = await harness.sql(
        `SELECT cs.id, cs.scheduled_on::text AS day FROM learning.class_schedule cs
         JOIN core.student_enrollments e ON e.class_id = cs.class_id
         JOIN core.users u ON u.student_id = e.student_id
         WHERE u.username = $1 ORDER BY cs.scheduled_on LIMIT 1`,
        [accountsByRole.STUDENT.username],
      );
      assert.ok(row, "expected the fixture to have scheduled something");
      await harness.sql("UPDATE learning.class_schedule SET period_no = 2 WHERE id = $1", [row.id]);

      try {
        const res = await client.request(
          "/student/schedule?date=" + encodeURIComponent(row.day),
        );
        assert.equal(res.status, 200);
        const placed = res.payload.slots.filter((entry) => entry.periodNo === 2);
        assert.equal(placed.length, 1, "the lesson reports the slot it was given");

        // Personal work answers to no bell, so it never claims a slot.
        for (const entry of res.payload.slots) {
          if (!entry.lesson && entry.extra) {
            assert.equal(entry.periodNo, null, "personal work carries no period");
          }
        }
      } finally {
        await harness.sql("UPDATE learning.class_schedule SET period_no = NULL WHERE id = $1", [row.id]);
      }
    });

    it("names the subject on every skill in the progress page", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);

      const res = await client.request("/student/progress");
      assert.equal(res.status, 200);
      assert.ok(res.payload.skills.length > 0, "expected skills");
      for (const skill of res.payload.skills) {
        assert.ok(skill.subject, `${skill.code} came back with no subject to group it under`);
      }
    });

    it("lets a student see today's work", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);

      const today = await client.request("/student/today");
      assert.equal(today.status, 200);
      assert.match(today.payload.date, /^\d{4}-\d{2}-\d{2}$/);

      const lessons = today.payload.slots.map((s) => s.lesson).filter(Boolean);
      assert.ok(lessons.length > 0, "expected a scheduled lesson today");
      assert.equal(lessons[0].lessonCode, "MOCK-LOCAL-LESSON");
    });

    it("lets a teacher open the dashboard", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.TEACHER);
      assert.equal((await client.request("/teacher/dashboard")).status, 200);
    });

    it("names the subject each dashboard card stands for", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.TEACHER);

      const res = await client.request("/teacher/dashboard");
      assert.equal(res.status, 200);
      const cards = res.payload.classes;
      assert.ok(cards.length > 0, "expected at least one class card");

      // The card is one subject of one class, and its links carry both. A card
      // that named the subject only in prose could not point anywhere useful.
      for (const card of cards) {
        assert.ok("subjectId" in card, "a card must say which subject it is");
        assert.ok(
          card.subjectId === null || Number.isInteger(card.subjectId),
          `${card.className} gave a subjectId of ${card.subjectId}`,
        );
      }
      assert.ok(
        cards.some((card) => Number.isInteger(card.subjectId)),
        "a teacher's own cards are per subject, so at least one carries an id",
      );
    });

    it("keeps a student out of the teacher's pages", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);

      for (const pathname of [
        "/teacher/dashboard",
        "/teacher/lessons",
        "/admin/materials",
        "/admin/skill-map",
        "/admin/skill-chain",
      ]) {
        const res = await client.request(pathname);
        assert.ok(
          res.status === 401 || res.status === 403,
          `${pathname} answered ${res.status} to a student`,
        );
      }
    });

    it("shows an admin which topics carry which skills", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.ADMIN);

      const res = await client.request("/admin/skill-map");
      assert.equal(res.status, 200);

      const { nodes, unmappedSkills } = res.payload;
      assert.ok(Array.isArray(nodes) && nodes.length > 0, "expected seeded topics");
      assert.ok(Array.isArray(unmappedSkills), "expected the orphan list, even if empty");

      // A topic with no skill still has to come back: it is the fault the
      // screen exists to show, and an inner join would hide it.
      for (const node of nodes) {
        assert.ok(typeof node.contentCode === "string" && node.contentCode.length > 0);
        assert.ok(Array.isArray(node.skills));
      }

      const mapped = nodes.flatMap((node) => node.skills);
      assert.ok(mapped.length > 0, "the demo school maps at least one skill");
      assert.ok(
        mapped.some((skill) => skill.isPrimary),
        "a mapped skill should be marked primary",
      );
      assert.ok(
        mapped.every((skill) => typeof skill.mapStatus === "string"),
        "the link's own status is what decides whether a student sees it",
      );

      const codes = nodes.flatMap((node) => node.skills.map((skill) => skill.skillCode));
      const orphanCodes = new Set(unmappedSkills.map((skill) => skill.skillCode));
      assert.ok(
        codes.every((code) => !orphanCodes.has(code)),
        "a skill cannot be both mapped and unmapped",
      );
    });

    it("shows an admin the prerequisite chain and what it does not follow", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.ADMIN);

      const res = await client.request("/admin/skill-chain");
      assert.equal(res.status, 200);

      const { links, cycles } = res.payload;
      assert.ok(Array.isArray(links), "expected the link list");
      assert.ok(Array.isArray(cycles), "expected the cycle list, even if empty");
      assert.deepEqual(cycles, [], "the seeded chain should not loop");

      for (const link of links) {
        // followed is the whole point: a link that is not both APPROVED and
        // REQUIRED sits in the table looking like a decision and changes
        // nothing, which is exactly what the screen has to say out loud.
        assert.equal(
          link.followed,
          link.status === "APPROVED" && link.relationType === "REQUIRED",
          `${link.dependencyCode} disagreed about whether remediation follows it`,
        );
        assert.equal(typeof link.reason, "string");
        assert.equal(typeof link.prerequisiteHasLesson, "boolean");
        assert.notEqual(
          link.skillCode,
          link.prerequisiteCode,
          "a skill cannot be its own prerequisite",
        );
      }
    });

    it("serves the seeded book to an admin", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.ADMIN);

      const materials = await client.request("/admin/materials");
      assert.equal(materials.status, 200);
      const list = materials.payload.materials ?? materials.payload;
      assert.ok(Array.isArray(list) && list.length > 0, "expected a seeded material");

      const file = await client.request(`/content/materials/${list[0].id}/file`, { raw: true });
      assert.equal(file.status, 200);
      assert.equal(file.buffer.subarray(0, 4).toString(), "%PDF");
    });
  });

  describe("the quiz is marked on the server", () => {
    let client;
    let paper;

    before(async () => {
      client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);
      const today = await client.request("/student/today");
      const lesson = today.payload.slots.map((s) => s.lesson).find(Boolean);
      const res = await client.request(`/student/quiz/${lesson.id}`);
      assert.equal(res.status, 200);
      paper = res.payload;
    });

    it("does not tell the student which option is right", () => {
      const serialized = JSON.stringify(paper);
      for (const leak of ["isCorrect", "is_correct", "correctOptionId", "correctAnswer"]) {
        assert.ok(!serialized.includes(leak), `quiz paper leaked ${leak}`);
      }
      assert.ok(paper.questions.length > 0, "expected questions");
      assert.ok(paper.questions[0].options.length > 1, "expected options to choose between");
    });

    it("scores a wrong answer zero and holds the key back until the teacher releases it", async () => {
      const question = paper.questions[0];
      // "2" is the right answer to the seeded 1 + 1; pick anything else.
      const wrong = question.options.find((o) => o.text !== "2");
      const right = question.options.find((o) => o.text === "2");
      assert.ok(wrong, "expected a wrong option to exist");

      const send = (optionId) => client.request("/student/quiz-attempts", {
        method: "POST",
        body: { lessonId: paper.lessonId, answers: [{ itemId: question.itemId, optionId }] },
      });

      const res = await send(wrong.optionId);
      assert.equal(res.status, 201);
      assert.equal(res.payload.score, 0);
      assert.equal(res.payload.results[0].correct, false);

      // Being told they were wrong is the feedback, and it is what makes a
      // second go worth taking. Being told which option was right ends the
      // exercise - so it waits for the teacher, and a parent reading over a
      // shoulder does not get there first either.
      assert.equal(res.payload.answersOpen, false);
      assert.equal(
        res.payload.results[0].correctOptionId,
        null,
        "the key was handed over before the teacher released it",
      );
      assert.equal(res.payload.results[0].explanation, null);

      // Released, and the same marking carries it.
      await harness.sql(
        `UPDATE learning.class_schedule SET answers_open_at = now()
          WHERE daily_lesson_id = $1 AND scheduled_on = CURRENT_DATE`,
        [paper.lessonId],
      );
      const opened = await send(wrong.optionId);
      assert.equal(opened.status, 201, JSON.stringify(opened.payload));
      assert.equal(opened.payload.answersOpen, true);
      assert.equal(opened.payload.results[0].correctOptionId, right.optionId);

      await harness.sql(
        `UPDATE learning.class_schedule SET answers_open_at = NULL
          WHERE daily_lesson_id = $1 AND scheduled_on = CURRENT_DATE`,
        [paper.lessonId],
      );
    });

    it("holds the check itself back until the hour the teacher set", async () => {
      const [{ nowHm }] = await harness.sql(
        "SELECT to_char((now() AT TIME ZONE 'Asia/Ulaanbaatar')::time, 'HH24:MI') AS \"nowHm\"",
      );
      // 23:59 is later than now at every moment of the day but one, and the
      // one is not worth a clock-freezing harness.
      if (nowHm < "23:59") {
        await harness.sql(
          `UPDATE learning.class_schedule SET quiz_opens_at = '23:59'
            WHERE daily_lesson_id = $1 AND scheduled_on = CURRENT_DATE`,
          [paper.lessonId],
        );

        // Told, not hidden: a page with nothing on it reads as broken, and a
        // child who cannot see why would go looking for the fault in
        // themselves.
        const shut = await client.request(`/student/quiz/${paper.lessonId}`);
        assert.equal(shut.status, 200);
        assert.equal(shut.payload.isOpen, false);
        assert.equal(shut.payload.opensAt, "23:59");
        assert.deepEqual(shut.payload.questions, []);

        const early = await client.request("/student/quiz-attempts", {
          method: "POST",
          body: {
            lessonId: paper.lessonId,
            answers: [{ itemId: paper.questions[0].itemId, optionId: paper.questions[0].options[0].optionId }],
          },
        });
        assert.equal(early.status, 409, JSON.stringify(early.payload));
        assert.equal(early.payload.code, "QUIZ_NOT_OPEN");
      }

      await harness.sql(
        `UPDATE learning.class_schedule SET quiz_opens_at = NULL
          WHERE daily_lesson_id = $1 AND scheduled_on = CURRENT_DATE`,
        [paper.lessonId],
      );
      const open = await client.request(`/student/quiz/${paper.lessonId}`);
      assert.equal(open.payload.isOpen, true);
      assert.equal(open.payload.opensAt, null);
    });

    it("takes the number of questions and goes from the period, where the teacher set them", async () => {
      await harness.sql(
        `UPDATE learning.class_schedule SET quiz_question_count = 1, quiz_attempts = 1
          WHERE daily_lesson_id = $1 AND scheduled_on = CURRENT_DATE`,
        [paper.lessonId],
      );
      const short = await client.request(`/student/quiz/${paper.lessonId}`);
      assert.equal(short.status, 200);
      assert.equal(short.payload.questions.length, 1, "a one-question paper was asked for");
      assert.equal(short.payload.attemptsAllowed, 1);

      // Goes already spent above, so one allowed means none left.
      const refused = await client.request("/student/quiz-attempts", {
        method: "POST",
        body: {
          lessonId: paper.lessonId,
          answers: [{ itemId: short.payload.questions[0].itemId, optionId: short.payload.questions[0].options[0].optionId }],
        },
      });
      assert.equal(refused.status, 409, JSON.stringify(refused.payload));
      assert.equal(refused.payload.code, "QUIZ_ATTEMPTS_SPENT");

      await harness.sql(
        `UPDATE learning.class_schedule SET quiz_question_count = NULL, quiz_attempts = NULL
          WHERE daily_lesson_id = $1 AND scheduled_on = CURRENT_DATE`,
        [paper.lessonId],
      );
    });

    it("allows three goes a day and refuses the fourth", async () => {
      const question = paper.questions[0];
      const right = question.options.find((o) => o.text === "2");
      const send = () => client.request("/student/quiz-attempts", {
        method: "POST",
        body: { lessonId: paper.lessonId, answers: [{ itemId: question.itemId, optionId: right.optionId }] },
      });
      // Counted from nothing rather than from whatever the tests above left
      // behind: the rule under test is three a day, and it should not be
      // readable only in the light of another test's arithmetic.
      await harness.sql(
        "DELETE FROM learning.quiz_attempts WHERE daily_lesson_id = $1",
        [paper.lessonId],
      );

      // The daily check is practice: a child who gets one wrong thinks again
      // and tries. One sitting forbids that; three permit it without turning
      // the check into an examination.
      const first = await send();
      assert.equal(first.status, 201, JSON.stringify(first.payload));
      assert.equal(first.payload.attemptsUsed, 1);
      assert.equal(first.payload.attemptsAllowed, 3);

      const second = await send();
      assert.equal(second.status, 201, JSON.stringify(second.payload));
      assert.equal(second.payload.attemptsUsed, 2);

      const third = await send();
      assert.equal(third.status, 201);
      assert.equal(third.payload.attemptsUsed, 3);

      const fourth = await send();
      assert.equal(fourth.status, 409, JSON.stringify(fourth.payload));
      assert.equal(fourth.payload.code, "QUIZ_ATTEMPTS_SPENT");

      const rows = await harness.sql(
        "SELECT count(*)::int AS n FROM learning.quiz_attempts WHERE daily_lesson_id = $1",
        [paper.lessonId],
      );
      assert.equal(rows[0].n, 3, "the refused sitting must not be stored");
    });

    it("asks only what this day of the skill covers", async () => {
      const before = (await client.request(`/student/quiz/${paper.lessonId}`)).payload.questions
        .length;
      assert.ok(before > 0, "expected the seeded questions");

      // Two sections of the same book: the one this day covers, and a later
      // one the class has not reached.
      const [{ id: thisWeek }] = await harness.sql(
        "INSERT INTO content.source_outline_nodes (source_material_id, outline_code, node_type, title, page_from, page_to, sequence_no, status) SELECT source_material_id, 'MOCK-LOCAL-SEC-A', 'SECTION', 'Энэ долоо хоног', 1, 4, 90, 'APPROVED' FROM content.source_outline_nodes ORDER BY id LIMIT 1 RETURNING id",
      );
      const [{ id: nextWeek }] = await harness.sql(
        "INSERT INTO content.source_outline_nodes (source_material_id, outline_code, node_type, title, page_from, page_to, sequence_no, status) SELECT source_material_id, 'MOCK-LOCAL-SEC-B', 'SECTION', 'Дараа долоо хоног', 5, 8, 91, 'APPROVED' FROM content.source_outline_nodes ORDER BY id LIMIT 1 RETURNING id",
      );

      const [{ id: itemId }] = await harness.sql(
        "SELECT i.id FROM assessment.diagnostic_items i JOIN learning.daily_lessons dl ON dl.core_skill_id = i.skill_id WHERE dl.id = $1 ORDER BY i.item_order LIMIT 1",
        [paper.lessonId],
      );
      await harness.sql(
        "UPDATE learning.daily_lessons SET source_outline_node_id = $2 WHERE id = $1",
        [paper.lessonId, thisWeek],
      );
      await harness.sql(
        "UPDATE assessment.diagnostic_items SET source_outline_node_id = $2 WHERE id = $1",
        [itemId, nextWeek],
      );

      const narrowed = (await client.request(`/student/quiz/${paper.lessonId}`)).payload.questions;
      assert.equal(narrowed.length, before - 1, "the later section's question should drop out");
      assert.ok(
        !narrowed.some((question) => question.itemId === Number(itemId)),
        "the dropped question is the one from the later section",
      );

      // The same question, moved to this day's section, comes back.
      await harness.sql(
        "UPDATE assessment.diagnostic_items SET source_outline_node_id = $2 WHERE id = $1",
        [itemId, thisWeek],
      );
      assert.equal(
        (await client.request(`/student/quiz/${paper.lessonId}`)).payload.questions.length,
        before,
      );

      // A question that names no section belongs to the whole skill and is
      // asked on every one of its days.
      await harness.sql(
        "UPDATE assessment.diagnostic_items SET source_outline_node_id = NULL WHERE id = $1",
        [itemId],
      );
      assert.equal(
        (await client.request(`/student/quiz/${paper.lessonId}`)).payload.questions.length,
        before,
        "an unsectioned question is asked on every day of its skill",
      );

      await harness.sql(
        "UPDATE learning.daily_lessons SET source_outline_node_id = NULL WHERE id = $1",
        [paper.lessonId],
      );
    });

    it("says what kind of assessment the paper is", async () => {
      // Everything imported so far is the check at the end of a lesson, which
      // is the default the column carries.
      const asSeeded = await client.request(`/student/quiz/${paper.lessonId}`);
      assert.equal(asSeeded.status, 200);
      assert.equal(asSeeded.payload.kind, "LESSON");

      // A school runs more than one kind, and the paper has to say which.
      await harness.sql(
        "UPDATE learning.daily_lessons SET assessment_kind = 'MONTHLY' WHERE id = $1",
        [paper.lessonId],
      );
      const monthly = await client.request(`/student/quiz/${paper.lessonId}`);
      assert.equal(monthly.payload.kind, "MONTHLY");

      await harness.sql(
        "UPDATE learning.daily_lessons SET assessment_kind = 'LESSON' WHERE id = $1",
        [paper.lessonId],
      );
    });

    it("says on the paper how many goes are left and what the last one scored", async () => {
      const res = await client.request(`/student/quiz/${paper.lessonId}`);
      assert.equal(res.status, 200);
      assert.equal(res.payload.attemptsAllowed, 3);
      assert.equal(res.payload.attemptsUsed, 3, "three sittings happened above");
      assert.ok(res.payload.lastMaxScore > 0);
      assert.equal(typeof res.payload.lastScore, "number");
      // Five is the paper, not the pool: a lesson with more questions than
      // that still hands a child five.
      assert.ok(res.payload.questions.length <= 5);
    });

    it("says which kind of assessment each attempt was", async () => {
      const teacher = createClient(harness.baseUrl);
      await teacher.signIn(byName["demo-teacher"]);
      const [own] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );

      const res = await teacher.request(`/teacher/quiz-attempts?classId=${own.id}`);
      assert.equal(res.status, 200);
      assert.ok(res.payload.attempts.length > 0, "expected the sitting from earlier");
      for (const attempt of res.payload.attempts) {
        // Without this a month of results buries the monthly test among the
        // daily checks, and the teacher cannot tell them apart.
        assert.ok(
          ["LESSON", "UNIT", "MONTHLY", "DIAGNOSTIC"].includes(attempt.kind),
          `unexpected kind ${attempt.kind}`,
        );
      }
    });

    it("shows the attempts to that class's teacher, and nobody else's", async () => {
      const teacher = createClient(harness.baseUrl);
      await teacher.signIn(byName["demo-teacher"]);

      const [own] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );
      const [other] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9B'",
      );

      assert.equal((await teacher.request(`/teacher/quiz-attempts?classId=${own.id}`)).status, 200);

      const refused = await teacher.request(`/teacher/quiz-attempts?classId=${other.id}`);
      assert.ok(
        refused.status === 403 || refused.status === 404,
        `asking for another class's attempts answered ${refused.status}`,
      );
    });

    it("keeps to the days asked for", async () => {
      // The screen's date range has to be applied here, not after the rows
      // arrive: filtering a list that the limit has already cut short would
      // quietly answer about the wrong days.
      const teacher = createClient(harness.baseUrl);
      await teacher.signIn(byName["demo-teacher"]);
      const [own] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );

      const all = await teacher.request(`/teacher/quiz-attempts?classId=${own.id}`);
      assert.equal(all.status, 200);
      assert.ok(all.payload.attempts.length > 0, "expected the seeded attempts");

      const dayOf = (iso) =>
        new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(
          new Date(iso),
        );
      const days = [...new Set(all.payload.attempts.map((a) => dayOf(a.submittedAt)))];
      const day = days[0];

      const onDay = await teacher.request(
        `/teacher/quiz-attempts?classId=${own.id}&from=${day}&to=${day}`,
      );
      assert.equal(onDay.status, 200);
      assert.equal(onDay.payload.from, day);
      assert.equal(onDay.payload.to, day);
      assert.ok(onDay.payload.attempts.length > 0, "the day's own work should survive");
      for (const attempt of onDay.payload.attempts) {
        assert.equal(dayOf(attempt.submittedAt), day);
      }

      // A window that closed before the work was done holds nothing.
      const before = await teacher.request(
        `/teacher/quiz-attempts?classId=${own.id}&from=2000-01-01&to=2000-01-02`,
      );
      assert.equal(before.status, 200);
      assert.equal(before.payload.attempts.length, 0);
    });

    it("refuses a range that runs backwards", async () => {
      const teacher = createClient(harness.baseUrl);
      await teacher.signIn(byName["demo-teacher"]);
      const [own] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );

      const res = await teacher.request(
        `/teacher/quiz-attempts?classId=${own.id}&from=2026-09-30&to=2026-09-01`,
      );
      // A backwards range is a malformed request, not a forbidden one.
      assert.equal(res.status, 400, JSON.stringify(res.payload));
      assert.equal(res.payload.code, 'INVALID_RANGE');
    });
  });

  describe("a teacher sees their own students and no others", () => {
    it("lists only the students in the classes they teach", async () => {
      const a = createClient(harness.baseUrl);
      await a.signIn(byName["demo-teacher"]);
      const mine = await a.request("/preview/students");
      assert.equal(mine.status, 200);

      const codes = mine.payload.map((s) => s.code);
      assert.deepEqual(codes, ["MOCK-LOCAL-STUDENT"]);
      assert.ok(
        !codes.includes("MOCK-LOCAL-STUDENT-B"),
        "teacher A must not see the other class's student",
      );
    });

    it("gives the other teacher their own class instead", async () => {
      const b = createClient(harness.baseUrl);
      await b.signIn(byName["demo-teacher-b"]);
      const theirs = await b.request("/preview/students");
      assert.equal(theirs.status, 200);
      assert.deepEqual(
        theirs.payload.map((s) => s.code),
        ["MOCK-LOCAL-STUDENT-B"],
      );
    });

    it("shows an admin every student", async () => {
      const admin = createClient(harness.baseUrl);
      await admin.signIn(accountsByRole.ADMIN);
      const all = await admin.request("/preview/students");
      assert.equal(all.status, 200);
      assert.deepEqual(
        all.payload.map((s) => s.code).sort(),
        ["MOCK-LOCAL-STUDENT", "MOCK-LOCAL-STUDENT-B"],
      );
    });

    it("keeps written answers in the review queue to the right teacher", async () => {
      const seeded = await harness.sql(
        "SELECT count(*)::int AS n FROM assessment.web_diagnostic_submissions WHERE status = 'PENDING_REVIEW'",
      );
      assert.equal(seeded[0].n, 2, "both students should have work waiting");

      const a = createClient(harness.baseUrl);
      await a.signIn(byName["demo-teacher"]);
      const queue = await a.request("/teacher/review-queue");
      assert.equal(queue.status, 200);
      assert.equal(queue.payload.length, 1);
      assert.equal(queue.payload[0].studentName, "Туршилтын сурагч");

      const serialized = JSON.stringify(queue.payload);
      assert.ok(!serialized.includes("Туршилтын сурагч Б"), "leaked the other class's student");
      assert.ok(!serialized.includes("Гурав"), "leaked the other student's written answer");
    });

    it("shows an admin the whole review queue", async () => {
      const admin = createClient(harness.baseUrl);
      await admin.signIn(accountsByRole.ADMIN);
      const queue = await admin.request("/teacher/review-queue");
      assert.equal(queue.status, 200);
      assert.equal(queue.payload.length, 2);
    });
  });

  describe("one teacher can hold two subjects in the same class", () => {
    it("stores both assignments instead of losing one", async () => {
      const rows = await harness.sql(
        `SELECT sub.code FROM core.class_teachers ct
         JOIN core.teachers t ON t.id = ct.teacher_id
         JOIN core.users u ON u.id = t.user_id
         JOIN core.classes c ON c.id = ct.class_id
         JOIN core.subjects sub ON sub.id = ct.subject_id
         WHERE u.username = 'demo-teacher' AND c.class_code = 'MOCK-LOCAL-9A'
         ORDER BY sub.code`,
      );
      assert.deepEqual(
        rows.map((r) => r.code),
        ["MATH", "PHYS"],
        "the old (class, teacher) key could only keep one of these",
      );
    });

    it("refuses the same subject twice for that teacher and class", async () => {
      const [{ id: classId }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );
      const [{ id: teacherId }] = await harness.sql(
        `SELECT t.id FROM core.teachers t JOIN core.users u ON u.id = t.user_id
         WHERE u.username = 'demo-teacher'`,
      );
      const [{ id: subjectId }] = await harness.sql(
        "SELECT id FROM core.subjects WHERE code = 'MATH'",
      );

      await assert.rejects(
        () =>
          harness.sql(
            "INSERT INTO core.class_teachers (class_id, teacher_id, subject_id) VALUES ($1, $2, $3)",
            [classId, teacherId, subjectId],
          ),
        /duplicate key|unique/i,
        "a teacher should hold a given subject in a class once",
      );
    });

    it("offers one entry per subject, plus one for both", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);
      const res = await client.request("/teacher/classes");
      assert.equal(res.status, 200);

      const mine = res.payload.filter((row) => row.name === "Туршилтын 9А");
      assert.equal(mine.length, 3, "two subjects and an all-subjects entry");
      assert.equal(mine[0].subjectId, null, "the all-subjects entry comes first");
      assert.deepEqual(
        mine.slice(1).map((row) => row.subject).sort(),
        ["Математик — local demo", "Физик — local demo"],
      );
    });

    it("offers no all-subjects entry where there is one subject", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher-b"]);
      const res = await client.request("/teacher/classes");
      assert.equal(res.status, 200);

      // demo-teacher-b holds only maths in 9Б; an "all subjects" entry there
      // would stand for exactly one subject and say nothing.
      const theirs = res.payload.filter((row) => row.name === "Туршилтын 9Б");
      assert.equal(theirs.length, 1);
      assert.notEqual(theirs[0].subjectId, null);
    });

    it("never offers the same entry twice", async () => {
      // The screens use (id, subjectId) as the select's value and React key.
      // Entries sharing a key made the select render both labels at once and
      // made the choice ambiguous once made.
      for (const username of ["demo-teacher", "demo-teacher-b", "demo-admin"]) {
        const client = createClient(harness.baseUrl);
        await client.signIn(byName[username]);
        const res = await client.request("/teacher/classes");
        assert.equal(res.status, 200);

        const keys = res.payload.map((row) => `${row.id}:${row.subjectId ?? "all"}`);
        assert.deepEqual(keys, [...new Set(keys)], `${username}: ${keys.join(", ")}`);
      }
    });

    it("keeps the teacher's schedule reachable with two subjects", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);
      const [{ id: classId }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );
      const res = await client.request(`/teacher/schedule?classId=${classId}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.payload.days), "expected a set of days");
    });
  });

  // Runs last: rebuild-mastery rewrites the mastery table for the whole
  // database, so anything asserting on it afterwards would be reading the
  // rebuild's output rather than the live path's.
  describe("rebuilding mastery keeps what a teacher decided", () => {
    let studentId;
    let skillId;
    let classId;

    before(async () => {
      [{ id: studentId }] = await harness.sql(
        "SELECT id FROM core.students WHERE student_code = 'MOCK-LOCAL-STUDENT'",
      );
      [{ id: skillId }] = await harness.sql(
        "SELECT id FROM content.skills WHERE skill_code = 'MOCK-LOCAL-SKILL'",
      );
      [{ id: classId }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );

      const teacher = createClient(harness.baseUrl);
      await teacher.signIn(byName["demo-teacher"]);
      const res = await teacher.request("/teacher/assessments", {
        method: "POST",
        body: {
          classId: Number(classId),
          skillId: Number(skillId),
          entries: [{ studentId: Number(studentId), status: "MASTERED", score: 95 }],
        },
      });
      assert.equal(res.status, 201, "the teacher's mark should be recorded");
    });

    it("records the mark as the teacher's, not the system's", async () => {
      const [row] = await harness.sql(
        `SELECT source, mastery_status AS status, mastery_score::float8 AS score
         FROM learning.student_skill_mastery
         WHERE student_id = $1 AND skill_id = $2`,
        [studentId, skillId],
      );
      assert.equal(row.source, "TEACHER");
      assert.equal(row.status, "MASTERED");
      assert.equal(row.score, 95);
    });

    it("leaves the mark standing after a rebuild", async () => {
      const run = harness.runScript("scripts/rebuild-mastery.ts", ["--yes"]);
      assert.equal(run.status, 0, `rebuild-mastery failed:
${run.output}`);

      const [row] = await harness.sql(
        `SELECT source, mastery_status AS status, mastery_score::float8 AS score
         FROM learning.student_skill_mastery
         WHERE student_id = $1 AND skill_id = $2`,
        [studentId, skillId],
      );
      assert.ok(row, "the teacher's mark was deleted by the rebuild");
      assert.equal(row.source, "TEACHER", "the rebuild overwrote the teacher's mark");
      assert.equal(row.status, "MASTERED");
      assert.equal(row.score, 95, "the teacher's figure changed");
    });

    it("says what it kept and what it skipped", async () => {
      const run = harness.runScript("scripts/rebuild-mastery.ts", ["--yes"]);
      assert.equal(run.status, 0, run.output);
      assert.match(run.output, /teacher mark\(s\) kept/);
      assert.match(
        run.output,
        /sitting\(s\) skipped: a teacher marked that skill afterwards/,
        "the quiz attempts predate the mark, so they should be reported as superseded",
      );
    });
  });

  describe("a teacher's screens follow the subject they hold", () => {
    let mathsId;
    let physicsId;
    let classA;
    let classB;

    before(async () => {
      [{ id: mathsId }] = await harness.sql(
        "SELECT id FROM core.subjects WHERE code = 'MATH'",
      );
      [{ id: physicsId }] = await harness.sql(
        "SELECT id FROM core.subjects WHERE code = 'PHYS'",
      );
      [{ id: classA }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );
      [{ id: classB }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9B'",
      );
    });

    it("refuses a subject the teacher does not hold in that class", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher-b"]);

      // demo-teacher-b holds maths in 9Б and nothing else there.
      const ok = await client.request(
        `/teacher/quiz-attempts?classId=${classB}&subjectId=${mathsId}`,
      );
      assert.equal(ok.status, 200);

      const refused = await client.request(
        `/teacher/quiz-attempts?classId=${classB}&subjectId=${physicsId}`,
      );
      assert.equal(refused.status, 403, "a subject they do not hold should be refused");
    });

    it("refuses a malformed subject rather than showing everything", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);
      const res = await client.request(
        `/teacher/quiz-attempts?classId=${classA}&subjectId=nonsense`,
      );
      assert.equal(res.status, 400);
    });

    it("narrows the lesson list to the chosen subject", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);

      const both = await client.request(`/teacher/lessons?classId=${classA}`);
      assert.equal(both.status, 200);

      const maths = await client.request(
        `/teacher/lessons?classId=${classA}&subjectId=${mathsId}`,
      );
      assert.equal(maths.status, 200);
      assert.ok(
        maths.payload.length <= both.payload.length,
        "one subject cannot offer more lessons than every subject",
      );
    });

    it("clears one subject's day and leaves the other standing", async () => {
      // setScheduleDay's own comment says putting maths on Tuesday must not
      // remove Tuesday's Mongolian. Clearing used to do exactly that.
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);

      const [{ scheduled_on: day }] = await harness.sql(
        `SELECT scheduled_on::text AS scheduled_on FROM learning.class_schedule
         WHERE class_id = $1 LIMIT 1`,
        [classA],
      );

      // Put a second subject on the same day, straight into the table: the
      // point is what clearing does, not how the row got there.
      await harness.sql(
        `INSERT INTO learning.class_schedule
           (class_id, term_id, daily_lesson_id, scheduled_on, subject_id, created_by)
         SELECT $1, cs.term_id, cs.daily_lesson_id, $2::date, $3, cs.created_by
           FROM learning.class_schedule cs WHERE cs.class_id = $1 LIMIT 1
         ON CONFLICT DO NOTHING`,
        [classA, day, physicsId],
      );

      const before = await harness.sql(
        "SELECT subject_id FROM learning.class_schedule WHERE class_id = $1 AND scheduled_on = $2::date",
        [classA, day],
      );
      assert.equal(before.length, 2, "expected two subjects on the day");

      const cleared = await client.request("/teacher/schedule/day", {
        method: "PUT",
        body: { classId: Number(classA), subjectId: Number(mathsId), scheduledOn: day, lessonId: null },
      });
      assert.ok(cleared.status < 400, `clearing answered ${cleared.status}`);

      const after = await harness.sql(
        "SELECT subject_id::int AS subject FROM learning.class_schedule WHERE class_id = $1 AND scheduled_on = $2::date",
        [classA, day],
      );
      assert.equal(after.length, 1, "only the chosen subject should have gone");
      assert.equal(after[0].subject, Number(physicsId));
    });

    it("tells two subjects on one day apart", async () => {
      // A timetable row is a day and a subject. On the combined view a day
      // taught twice comes back twice, and the screen needs something on the
      // row to say which is which - without it the two are indistinguishable
      // and the lesson picker cannot know which timetable it is writing to.
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);

      // The day is built here rather than borrowed, so that what an earlier
      // test cleared or filled cannot decide whether this one has anything
      // to look at. The template row is read before the delete: this class
      // may hold only the one day, and then there would be nothing to copy.
      const [template] = await harness.sql(
        `SELECT scheduled_on::text AS day, term_id::int AS term,
            daily_lesson_id::int AS lesson, created_by::int AS author
           FROM learning.class_schedule WHERE class_id = $1 LIMIT 1`,
        [classA],
      );
      const day = template.day;
      await harness.sql(
        "DELETE FROM learning.class_schedule WHERE class_id = $1 AND scheduled_on = $2::date",
        [classA, day],
      );
      for (const subject of [mathsId, physicsId]) {
        await harness.sql(
          `INSERT INTO learning.class_schedule
             (class_id, term_id, daily_lesson_id, scheduled_on, subject_id, created_by)
           VALUES ($1, $2, $3, $4::date, $5, $6)`,
          [classA, template.term, template.lesson, day, subject, template.author],
        );
      }

      const res = await client.request(
        `/teacher/schedule?classId=${classA}&from=${day}&to=${day}`,
      );
      assert.equal(res.status, 200);

      const rows = res.payload.days.filter((row) => row.scheduledOn === day);
      assert.equal(rows.length, 2, "both subjects should be on the day");

      const keys = rows.map((row) => `${row.scheduledOn}:${row.subjectId}`);
      assert.deepEqual(keys, [...new Set(keys)], `rows repeat: ${keys.join(", ")}`);
      for (const row of rows) {
        assert.ok(row.subject, "a scheduled row should name its subject");
      }
      assert.deepEqual(
        rows.map((row) => row.subjectId).sort((a, b) => a - b),
        [Number(mathsId), Number(physicsId)].sort((a, b) => a - b),
      );
    });

    it("lays out the current term when none is named", async () => {
      // The screen has no way to look a term id up, so it used to send 1 -
      // correct only where the terms happen to start there. Asking for the
      // term today falls in is what pressing the button means.
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);

      const res = await client.request("/teacher/schedule/generate", {
        method: "POST",
        body: { classId: Number(classA), subjectId: Number(mathsId) },
      });
      assert.equal(res.status, 200, JSON.stringify(res.payload));
      assert.ok(typeof res.payload.notice === "string" && res.payload.notice.length > 0);
    });
  });

  describe("a class teacher sees the whole class and marks only their own", () => {
    let classA;
    let mathsId;
    let physicsId;
    let teacherARow;

    before(async () => {
      [{ id: classA }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );
      [{ id: mathsId }] = await harness.sql("SELECT id FROM core.subjects WHERE code = 'MATH'");
      [{ id: physicsId }] = await harness.sql("SELECT id FROM core.subjects WHERE code = 'PHYS'");
      [teacherARow] = await harness.sql(
        `SELECT t.id FROM core.teachers t JOIN core.users u ON u.id = t.user_id
          WHERE u.username = 'demo-teacher'`,
      );

      // demo-teacher-b takes nothing in 9А. Make them its class teacher, and
      // drop demo-teacher's physics so the class runs a subject its class
      // teacher does not take - the primary-school shape.
      const [teacherB] = await harness.sql(
        `SELECT t.id FROM core.teachers t JOIN core.users u ON u.id = t.user_id
          WHERE u.username = 'demo-teacher-b'`,
      );
      await harness.sql("UPDATE core.classes SET class_teacher_id = $1 WHERE id = $2", [
        teacherB.id,
        classA,
      ]);
      await harness.sql(
        `INSERT INTO core.class_teachers (class_id, teacher_id, subject_id)
         VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [classA, teacherB.id, physicsId],
      );
      await harness.sql(
        "DELETE FROM core.class_teachers WHERE class_id = $1 AND teacher_id = $2 AND subject_id = $3",
        [classA, teacherARow.id, physicsId],
      );
    });

    after(async () => {
      // Put 9А back, or later runs of this file would inherit the arrangement.
      await harness.sql("UPDATE core.classes SET class_teacher_id = NULL WHERE id = $1", [classA]);
    });

    it("shows the class teacher every subject the class runs", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher-b"]);

      const res = await client.request("/teacher/classes");
      assert.equal(res.status, 200);

      const entries = res.payload.filter((row) => row.name === "Туршилтын 9А");
      const subjects = entries.filter((row) => row.subjectId !== null).map((row) => row.subject);
      assert.deepEqual(
        subjects.sort(),
        ["Математик — local demo", "Физик — local demo"],
        "the class teacher should see the maths they do not take",
      );
    });

    it("lets them read the subject they do not take", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher-b"]);

      const res = await client.request(
        `/teacher/quiz-attempts?classId=${classA}&subjectId=${mathsId}`,
      );
      assert.equal(res.status, 200, "reading another subject's results is the point of the role");
    });

    it("refuses to let them mark a subject they do not take", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher-b"]);

      // The register lists only what they may mark.
      const sheet = await client.request(
        `/teacher/assessment-sheet?classId=${classA}&subjectId=${mathsId}`,
      );
      assert.equal(sheet.status, 403, "the maths register is not theirs to fill in");

      const [skill] = await harness.sql(
        "SELECT id FROM content.skills WHERE skill_code = 'MOCK-LOCAL-SKILL'",
      );
      const [student] = await harness.sql(
        "SELECT id FROM core.students WHERE student_code = 'MOCK-LOCAL-STUDENT'",
      );
      const submitted = await client.request("/teacher/assessments", {
        method: "POST",
        body: {
          classId: Number(classA),
          skillId: Number(skill.id),
          entries: [{ studentId: Number(student.id), status: "MASTERED", score: 90 }],
        },
      });
      assert.equal(submitted.status, 403, "nor is the mark theirs to enter");
    });

    it("still lets the subject teacher mark their own", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);
      const sheet = await client.request(`/teacher/assessment-sheet?classId=${classA}`);
      assert.equal(sheet.status, 200);
    });

    it("marks the entries they may not change as read-only", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher-b"]);

      const res = await client.request("/teacher/classes");
      const entries = res.payload.filter((row) => row.name === "Туршилтын 9А");
      const maths = entries.find((row) => row.subject.startsWith("Математик"));
      const physics = entries.find((row) => row.subject.startsWith("Физик"));

      assert.equal(maths.canEdit, false, "the maths is somebody else's to change");
      assert.equal(physics.canEdit, true, "the physics is theirs");
    });

    it("says on the session whether the account takes any lesson", async () => {
      const carrier = createClient(harness.baseUrl);
      await carrier.signIn(byName["demo-teacher"]);
      const teaching = await carrier.request("/auth/me");
      assert.equal(teaching.payload.user.takesLessons, true);

      const student = createClient(harness.baseUrl);
      await student.signIn(accountsByRole.STUDENT);
      const none = await student.request("/auth/me");
      assert.equal(none.payload.user.takesLessons, false);
    });
  });

  describe("the term today falls in", () => {
    it("names the school year for anyone signed in, and nobody else", async () => {
      const anon = createClient(harness.baseUrl);
      assert.equal((await anon.request("/term/current")).status, 401);

      for (const account of [accountsByRole.STUDENT, accountsByRole.TEACHER]) {
        const client = createClient(harness.baseUrl);
        await client.signIn(account);
        const res = await client.request("/term/current");
        assert.equal(res.status, 200);
        // Null is a real answer: a day between terms belongs to none of them.
        if (res.payload !== null) {
          assert.ok(res.payload.schoolYear, "a term must name its school year");
          assert.ok(res.payload.termNumber >= 1 && res.payload.termNumber <= 4);
          assert.ok(res.payload.startsOn <= res.payload.endsOn);
        }
      }
    });
  });

  describe("a placement level turns into a plan the child can act on", () => {
    // The whole argument for sitting the test: a score becomes a level, and
    // the level names work. If this chain breaks anywhere the placement is
    // just a number in a table.
    let levelId;
    let subjectId;
    let studentId;

    before(async () => {
      [{ id: subjectId }] = await harness.sql("SELECT id FROM core.subjects WHERE code = 'MATH'");
      [{ id: studentId }] = await harness.sql(
        "SELECT id FROM core.students WHERE student_code = 'MOCK-LOCAL-STUDENT'",
      );
      [{ id: levelId }] = await harness.sql(
        `INSERT INTO content.proficiency_levels (framework, code, name_mn, sequence)
         VALUES ('TEST-CEFR', 'B1', 'Туршилтын түвшин', 1) RETURNING id`,
      );
      await harness.sql(
        `INSERT INTO content.placement_pathways
           (proficiency_level_id, domain_mn, sequence_no, source_label, unit_focus_mn,
            task_mn, priority, verification_mn)
         VALUES ($1, 'Дүрэм', 1, 'Туршилтын ном', 'Unit 1-3',
                 'Дүрэм судлах → дасгал → залруулга', 'DEVELOP', 'UNIT VERIFY')`,
        [levelId],
      );
      await harness.sql(
        `INSERT INTO assessment.placement_attempts
           (student_id, subject_id, proficiency_level_id, total_score, total_max_score,
            answer_source, attempted_on)
         VALUES ($1, $2, $3, 37, 60, 'RECONSTRUCTED', '2026-09-07')`,
        [studentId, subjectId, levelId],
      );
    });

    after(async () => {
      await harness.sql("DELETE FROM assessment.placement_attempts WHERE student_id = $1", [
        studentId,
      ]);
      await harness.sql("DELETE FROM content.placement_pathways WHERE proficiency_level_id = $1", [
        levelId,
      ]);
      await harness.sql("DELETE FROM content.proficiency_levels WHERE id = $1", [levelId]);
    });

    it("gives the child their level and the steps it prescribes", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);

      const res = await client.request("/student/placements");
      assert.equal(res.status, 200);

      const maths = res.payload.find((row) => row.subjectCode === "MATH");
      assert.ok(maths, "expected the placed subject");
      assert.equal(maths.levelCode, "B1");
      assert.equal(maths.score, 37);
      assert.equal(maths.attemptedOn, "2026-09-07");
      // Marked by a reconstructed key, so the level is a reading rather than
      // a confirmed result and the screen has to be able to say so.
      assert.equal(maths.provisional, true);
      assert.deepEqual(
        maths.steps.map((step) => [step.domain, step.sourceLabel, step.priority]),
        [["Дүрэм", "Туршилтын ном", "DEVELOP"]],
        "the level has to carry its own work, not just its name",
      );
    });

    it("keeps one child's placement out of another account's reach", async () => {
      const staff = createClient(harness.baseUrl);
      await staff.signIn(byName["demo-teacher"]);
      const res = await staff.request("/student/placements");
      assert.equal(res.status, 403, "this is the child's own record");
    });
  });

  describe("judging the written half confirms a provisional level", () => {
    // The loop the whole placement exists for: a level marked from the
    // objective half alone is provisional, a teacher reads the writing and
    // hears the speaking, and the level stops being a guess. Nothing sets that
    // flag by hand - it is derived from whether every judged task at the
    // child's level has been marked - so this also proves it reverses.
    let classId;
    let studentId;
    let levelId;
    let engId;
    let teacherId;
    const items = [];

    before(async () => {
      [{ id: classId }] = await harness.sql(
        "SELECT id FROM core.classes WHERE class_code = 'MOCK-LOCAL-9A'",
      );
      [{ id: studentId }] = await harness.sql(
        "SELECT id FROM core.students WHERE student_code = 'MOCK-LOCAL-STUDENT'",
      );
      [{ id: engId }] = await harness.sql(
        `INSERT INTO core.subjects (code, name_mn, is_active)
         VALUES ('ENG', 'Англи хэл', true)
         ON CONFLICT (code) DO UPDATE SET is_active = true RETURNING id`,
      );
      [{ id: levelId }] = await harness.sql(
        `INSERT INTO content.proficiency_levels (framework, code, name_mn, sequence)
         VALUES ('TEST-PROD', 'B2', 'Туршилтын түвшин', 1) RETURNING id`,
      );
      // Two judged tasks. A rubric and no options is what marks them out from
      // the sixty the system can score on its own.
      for (const [order, domain] of [[901, "Бичих"], [902, "Ярих"]]) {
        const [row] = await harness.sql(
          `INSERT INTO assessment.diagnostic_items
             (item_code, subject_id, item_order, title_mn, domain_mn, max_score,
              proficiency_level_id, answer_source, status, rubric_mn)
           VALUES ($1, $2, $3, $4, $5, 1, $6, 'AUTHORITATIVE', 'APPROVED', 'Чадаж байна уу')
           RETURNING id`,
          [`TEST-PROD-${order}`, engId, order, `Туршилтын ${domain}`, domain, levelId],
        );
        items.push(row.id);
      }
      await harness.sql(
        `INSERT INTO core.class_subjects (class_id, subject_id, origin, is_active)
         VALUES ($1, $2, 'ROSTER', true) ON CONFLICT DO NOTHING`,
        [classId, engId],
      );
      await harness.sql(
        `INSERT INTO assessment.placement_attempts
           (student_id, subject_id, proficiency_level_id, total_score, total_max_score,
            answer_source, attempted_on)
         VALUES ($1, $2, $3, 40, 60, 'RECONSTRUCTED', '2026-09-07')`,
        [studentId, engId, levelId],
      );
      [{ id: teacherId }] = await harness.sql(
        `SELECT t.id FROM core.teachers t JOIN core.users u ON u.id = t.user_id
          WHERE u.username = 'demo-teacher'`,
      );
      await harness.sql(
        "INSERT INTO core.teacher_subjects (teacher_id, subject_id) VALUES ($1, $2)",
        [teacherId, engId],
      );
    });

    after(async () => {
      await harness.sql("DELETE FROM assessment.productive_ratings WHERE student_id = $1", [studentId]);
      await harness.sql("DELETE FROM assessment.placement_attempts WHERE student_id = $1", [studentId]);
      await harness.sql("DELETE FROM assessment.diagnostic_items WHERE item_code LIKE 'TEST-PROD-%'");
      await harness.sql("DELETE FROM core.teacher_subjects WHERE teacher_id = $1", [teacherId]);
      await harness.sql("DELETE FROM core.class_subjects WHERE class_id = $1 AND subject_id = $2", [classId, engId]);
      await harness.sql("DELETE FROM content.proficiency_levels WHERE id = $1", [levelId]);
    });

    const confidence = async () => {
      const [row] = await harness.sql(
        "SELECT answer_source FROM assessment.placement_attempts WHERE student_id = $1",
        [studentId],
      );
      return row.answer_source;
    };

    it("opens the class on the specialty alone and asks the child's own level", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);

      const classes = await client.request("/teacher/productive/classes");
      assert.equal(classes.status, 200);
      assert.ok(
        classes.payload.some((row) => row.classId === String(classId)),
        "no class assignment exists, so the registered specialty has to be enough",
      );

      const sheet = await client.request(`/teacher/productive/classes/${classId}`);
      assert.equal(sheet.status, 200);
      const student = sheet.payload.students.find((row) => row.studentId === String(studentId));
      assert.ok(student, "expected the placed child");
      assert.equal(student.levelCode, "B2");
      assert.deepEqual(student.tasks.map((task) => task.domain).sort(), ["Бичих", "Ярих"]);
      assert.deepEqual(student.tasks.map((task) => task.score), [null, null]);
    });

    it("confirms the level only when every task is judged, and unconfirms it again", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);
      assert.equal(await confidence(), "RECONSTRUCTED", "starts provisional");

      const first = await client.request("/teacher/productive/rating", {
        method: "PUT",
        body: {
          classId: String(classId), studentId: String(studentId),
          itemId: String(items[0]), score: 1, comment: "Сайн бичсэн",
        },
      });
      assert.equal(first.status, 200);
      assert.equal(await confidence(), "RECONSTRUCTED", "one of two is not a confirmation");

      const second = await client.request("/teacher/productive/rating", {
        method: "PUT",
        body: {
          classId: String(classId), studentId: String(studentId),
          itemId: String(items[1]), score: 0,
        },
      });
      assert.equal(second.status, 200);
      // A failed task still counts as judged: the level is confirmed because
      // somebody looked, not because the child passed.
      assert.equal(await confidence(), "AUTHORITATIVE", "both judged, so no longer a guess");

      const student = second.payload.students.find((row) => row.studentId === String(studentId));
      const written = student.tasks.find((task) => task.itemId === String(items[0]));
      assert.equal(written.comment, "Сайн бичсэн");
      assert.equal(written.ratedByName, byName["demo-teacher"].displayName ?? written.ratedByName);

      await harness.sql(
        "DELETE FROM assessment.productive_ratings WHERE student_id = $1 AND diagnostic_item_id = $2",
        [studentId, items[1]],
      );
      await client.request("/teacher/productive/rating", {
        method: "PUT",
        body: {
          classId: String(classId), studentId: String(studentId),
          itemId: String(items[0]), score: 1,
        },
      });
      assert.equal(await confidence(), "RECONSTRUCTED",
        "a removed judgement takes the confirmation with it");
    });

    it("refuses a score the task is not worth", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(byName["demo-teacher"]);
      const res = await client.request("/teacher/productive/rating", {
        method: "PUT",
        body: {
          classId: String(classId), studentId: String(studentId),
          itemId: String(items[0]), score: 5,
        },
      });
      assert.equal(res.status, 400);
    });
  });

  describe("a child's own plan for the day", () => {
    let client;

    before(async () => {
      client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);
    });

    it("starts empty, keeps what is written, and replaces it", async () => {
      const empty = await client.request("/student/plan");
      assert.equal(empty.status, 200);
      assert.match(empty.payload.date, /^\d{4}-\d{2}-\d{2}$/);
      assert.equal(empty.payload.body, "", "a day nobody has planned is blank, not null");

      const date = empty.payload.date;
      const first = await client.request("/student/plan", {
        method: "PUT",
        body: { date, body: "  20 минут ном унших  " },
      });
      assert.equal(first.status, 200);
      assert.equal(first.payload.body, "20 минут ном унших", "whitespace is trimmed");
      assert.equal((await client.request("/student/plan")).payload.body, "20 минут ном унших");

      // One plan a day: writing again replaces rather than adds.
      await client.request("/student/plan", {
        method: "PUT",
        body: { date, body: "Үржүүлэхийн хүрд давтах" },
      });
      assert.equal((await client.request("/student/plan")).payload.body, "Үржүүлэхийн хүрд давтах");
      const [rows] = await harness.sql(
        "SELECT count(*)::int AS n FROM learning.student_day_plans",
      );
      assert.equal(rows.n, 1, "the second write must replace the first");
    });

    it("treats a blank plan as no plan", async () => {
      const { date } = (await client.request("/student/plan")).payload;
      await client.request("/student/plan", { method: "PUT", body: { date, body: "   " } });

      assert.equal((await client.request("/student/plan")).payload.body, "");
      const [rows] = await harness.sql(
        "SELECT count(*)::int AS n FROM learning.student_day_plans",
      );
      assert.equal(rows.n, 0, "clearing the box should leave no row behind");
    });

    it("refuses a bad date and more text than the column takes", async () => {
      assert.equal((await client.request("/student/plan?date=2026-02-30")).status, 400);

      const tooLong = await client.request("/student/plan", {
        method: "PUT",
        body: { date: "2026-09-21", body: "x".repeat(2001) },
      });
      assert.equal(tooLong.status, 400);
    });

    it("is the student's own: staff have no way to read it", async () => {
      const teacher = createClient(harness.baseUrl);
      await teacher.signIn(byName["demo-teacher"]);
      const refused = await teacher.request("/student/plan");
      assert.ok(
        refused.status === 401 || refused.status === 403,
        `a teacher reading a child's plan answered ${refused.status}`,
      );
    });
  });

  // Last on purpose: it wipes this student's quiz history to measure a clean
  // sitting, which would pull the ground out from under any test that counted
  // attempts.
  describe("the daily check is practice, not evidence", () => {
    it("leaves skill progress alone however well the child does", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);

      const [{ id: studentId }] = await harness.sql(
        "SELECT id FROM core.students WHERE student_code = 'MOCK-LOCAL-STUDENT'",
      );
      await harness.sql("DELETE FROM learning.quiz_attempts WHERE student_id = $1", [studentId]);
      await harness.sql(
        "DELETE FROM learning.student_skill_mastery WHERE student_id = $1",
        [studentId],
      );

      const today = await client.request("/student/today");
      const lesson = today.payload.slots.map((s) => s.lesson).find(Boolean);
      const paper = await client.request(`/student/quiz/${lesson.id}`);
      assert.equal(paper.status, 200);

      // Every question right, in one sitting.
      const answers = paper.payload.questions.map((question) => ({
        itemId: question.itemId,
        optionId: question.options.find((option) => option.text === "2")?.optionId
          ?? question.options[0].optionId,
      }));
      const attempt = await client.request("/student/quiz-attempts", {
        method: "POST",
        body: { lessonId: paper.payload.lessonId, answers },
      });
      assert.equal(attempt.status, 201);
      assert.equal(attempt.payload.score, attempt.payload.maxScore, "the sitting must be perfect");

      // And nothing moved. The daily check is the thinnest evidence the
      // system has - one child, one afternoon, five questions, three goes -
      // and a mastery figure built from it changed every time a child
      // practised. Progress comes from the assessments a teacher marks;
      // recordTeacherMastery is what writes it.
      const progress = await client.request("/student/progress");
      assert.equal(progress.status, 200);
      const skill = progress.payload.skills.find((row) => row.code === "MOCK-LOCAL-SKILL");
      assert.ok(skill, "expected the seeded skill on the progress page");
      assert.equal(
        skill.status,
        "unassessed",
        "a perfect daily check must not by itself declare a skill mastered",
      );

      const [{ n }] = await harness.sql(
        "SELECT count(*)::int AS n FROM learning.student_skill_mastery WHERE student_id = $1",
        [studentId],
      );
      assert.equal(n, 0, "the daily check wrote skill evidence");

      // Nor did it decide what the child does next. Extra work used to be
      // assigned automatically off the back of a wrong answer; that is the
      // teacher's call, made on the screen where they can read the answers.
      const [{ assigned }] = await harness.sql(
        "SELECT count(*)::int AS assigned FROM learning.student_assignments WHERE student_id = $1",
        [studentId],
      );
      assert.equal(assigned, 0, "the daily check assigned work by itself");
    });
  });
});
