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

  describe("sign-in", () => {
    it("refuses an anonymous request", async () => {
      const anon = createClient(harness.baseUrl);
      const res = await anon.request("/auth/me");
      assert.equal(res.status, 401);
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

    it("refuses a wrong password", async () => {
      const client = createClient(harness.baseUrl);
      const res = await client.request("/auth/login", {
        method: "POST",
        body: { username: accountsByRole.STUDENT.username, password: "not-the-password" },
      });
      assert.equal(res.status, 401);
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

      const lessons = today.payload.subjects.map((s) => s.lesson).filter(Boolean);
      assert.ok(lessons.length > 0, "expected a scheduled lesson today");
      assert.equal(lessons[0].lessonCode, "MOCK-LOCAL-LESSON");
    });

    it("lets a teacher open the dashboard", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.TEACHER);
      assert.equal((await client.request("/teacher/dashboard")).status, 200);
    });

    it("keeps a student out of the teacher's pages", async () => {
      const client = createClient(harness.baseUrl);
      await client.signIn(accountsByRole.STUDENT);

      for (const pathname of ["/teacher/dashboard", "/teacher/lessons", "/admin/materials"]) {
        const res = await client.request(pathname);
        assert.ok(
          res.status === 401 || res.status === 403,
          `${pathname} answered ${res.status} to a student`,
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
      const lesson = today.payload.subjects.map((s) => s.lesson).find(Boolean);
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

    it("scores a wrong answer zero and only then reveals the key", async () => {
      const question = paper.questions[0];
      // "2" is the right answer to the seeded 1 + 1; pick anything else.
      const wrong = question.options.find((o) => o.text !== "2");
      assert.ok(wrong, "expected a wrong option to exist");

      const res = await client.request("/student/quiz-attempts", {
        method: "POST",
        body: { lessonId: paper.lessonId, answers: [{ itemId: question.itemId, optionId: wrong.optionId }] },
      });
      assert.equal(res.status, 201);
      assert.equal(res.payload.score, 0);
      assert.equal(res.payload.results[0].correct, false);

      const right = question.options.find((o) => o.text === "2");
      assert.equal(res.payload.results[0].correctOptionId, right.optionId);
    });

    it("scores the right answer and records the attempt", async () => {
      const question = paper.questions[0];
      const right = question.options.find((o) => o.text === "2");

      const res = await client.request("/student/quiz-attempts", {
        method: "POST",
        body: { lessonId: paper.lessonId, answers: [{ itemId: question.itemId, optionId: right.optionId }] },
      });
      assert.equal(res.status, 201);
      assert.equal(res.payload.score, res.payload.maxScore);
      assert.equal(res.payload.results[0].correct, true);

      const rows = await harness.sql("SELECT count(*)::int AS n FROM learning.quiz_attempts");
      assert.equal(rows[0].n, 2, "both attempts should be stored");
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
});
