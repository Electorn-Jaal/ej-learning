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
      const rows = await harness.sql("SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations");
      assert.equal(rows[0].n, 12);
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
});
