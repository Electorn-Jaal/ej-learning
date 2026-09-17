import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  GetCurrentUserResponse,
  GetStudentAssignmentParams,
  GetStudentAssignmentResponse,
  GetStudentDashboardResponse,
  GetStudentProgressResponse,
  GetTeacherClassesResponse,
  GetTeacherDashboardResponse,
  GetTeacherReviewQueueResponse,
  GetWorkspaceIntegrationDashboardResponse,
  ReviewTeacherAttemptBody,
  ReviewTeacherAttemptParams,
  ReviewTeacherAttemptResponse,
  SaveStudentAssignmentStepBody,
  SaveStudentAssignmentStepParams,
  SaveStudentAssignmentStepResponse,
  SimulateWorkspaceIntegrationBody,
  SimulateWorkspaceIntegrationResponse,
  SetTeacherCurrentTopicBody,
  SetTeacherCurrentTopicResponse,
  StartStudentAssignmentParams,
  StartStudentAssignmentResponse,
  SubmitStudentAssignmentBody,
  SubmitStudentAssignmentParams,
  SubmitStudentAssignmentResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
// Legacy tables: these do not exist in ej_learning_dev. This router is not
// mounted (see routes/index.ts). Imported from the legacy entry point so the
// definitions stay out of the barrel drizzle-kit reads for migrations.
import {
  currentTopicsTable,
  learningAssignmentsTable,
  learningAttemptsTable,
  learningUsersTable,
  workspaceAuditEventsTable,
  workspaceCoursesTable,
  workspaceImportBatchesTable,
} from "@workspace/db/legacy";

const router: IRouter = Router();
const demoStudentId = "student-demo-1";
const demoTeacherName = "Б. Энхтуяа";
const localToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
  }).format(new Date());
const postgresCode = (error: unknown) => {
  const value = error as {
    code?: string;
    cause?: { code?: string };
  };
  return value.code ?? value.cause?.code;
};

const assignmentStatus = (attempt?: {
  status: string;
  score: number | null;
  maxScore: number;
}): "not_started" | "in_progress" | "pending_review" | "completed" => {
  if (attempt?.status === "reviewed") {
    return attempt.score === attempt.maxScore ? "completed" : "not_started";
  }
  if (attempt?.status === "submitted") return "pending_review";
  if (attempt?.status === "in_progress") return "in_progress";
  return "not_started";
};

const buildWorkspaceDashboard = async () => {
  const [courses, importBatches, auditEvents] = await Promise.all([
    db.select().from(workspaceCoursesTable).orderBy(workspaceCoursesTable.name),
    db
      .select()
      .from(workspaceImportBatchesTable)
      .orderBy(desc(workspaceImportBatchesTable.createdAt)),
    db
      .select()
      .from(workspaceAuditEventsTable)
      .orderBy(desc(workspaceAuditEventsTable.createdAt)),
  ]);
  const sourceStats = (source: string) => {
    const batches = importBatches.filter((batch) => batch.source === source);
    return {
      count: batches.reduce((total, batch) => total + batch.validCount, 0),
      lastSyncAt: batches[0]?.createdAt.toISOString() ?? null,
    };
  };
  const classroomLastSync = courses
    .map((course) => course.lastSyncAt)
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    mode: "mock" as const,
    systemOfRecord: "EJ Learning PostgreSQL",
    principle:
      "Google Workspace нь гаднын эх сурвалж ба түгээлтийн суваг; суралцах нотолгоо, хувилбар, зөвшөөрөл PostgreSQL-д хадгалагдана.",
    sources: [
      {
        source: "classroom" as const,
        role: "Анги, сурагчийн roster болон coursework түгээлт",
        status: "mock_ready" as const,
        recordCount: courses.reduce(
          (total, course) => total + course.studentCount,
          0,
        ),
        lastSyncAt: classroomLastSync?.toISOString() ?? null,
      },
      {
        source: "sheets" as const,
        role: "Асуултын санг validation pipeline руу бөөнөөр импортлох",
        status: "mock_ready" as const,
        recordCount: sourceStats("sheets").count,
        lastSyncAt: sourceStats("sheets").lastSyncAt,
      },
      {
        source: "drive" as const,
        role: "Материалын source file, revision болон approval metadata",
        status: "mock_ready" as const,
        recordCount: sourceStats("drive").count,
        lastSyncAt: sourceStats("drive").lastSyncAt,
      },
      {
        source: "forms" as const,
        role: "Legacy quiz response импортлох optional bridge",
        status: "optional" as const,
        recordCount: 0,
        lastSyncAt: null,
      },
    ],
    entities: [
      {
        name: "Class membership",
        ownership: "postgresql" as const,
        fields: [
          "internal_class_id",
          "student_id",
          "external_course_id",
          "sync_status",
        ],
        relation: "Classroom course → EJ class → learner identity",
      },
      {
        name: "Question version",
        ownership: "postgresql" as const,
        fields: [
          "question_id",
          "skill_code",
          "source_batch_id",
          "version",
          "approval_status",
        ],
        relation: "Sheet row → validated draft → approved assessment item",
      },
      {
        name: "Material source",
        ownership: "external_reference" as const,
        fields: [
          "drive_file_id",
          "drive_revision_id",
          "material_version",
          "visibility",
        ],
        relation: "Drive file revision → approved learning material",
      },
      {
        name: "Learning evidence",
        ownership: "postgresql" as const,
        fields: [
          "attempt_id",
          "assignment_version",
          "score",
          "reviewer",
          "reviewed_at",
        ],
        relation: "Immutable attempt → skill evidence → next action",
      },
    ],
    pipeline: [
      "Гаднын эх сурвалж",
      "Draft import",
      "Schema validation",
      "Skill mapping",
      "Content review",
      "Approved version",
      "Student assignment",
      "Immutable evidence",
    ],
    courses: courses.map((course) => ({
      externalCourseId: course.externalCourseId,
      internalClassId: course.internalClassId,
      name: course.name,
      teacher: course.teacher,
      studentCount: course.studentCount,
      syncStatus: course.syncStatus,
    })),
    importBatches: importBatches.map((batch) => ({
      id: batch.id,
      source: batch.source,
      fileName: batch.fileName,
      status: batch.status,
      rowCount: batch.rowCount,
      validCount: batch.validCount,
      errorCount: batch.errorCount,
      version: batch.version,
    })),
    auditEvents: auditEvents.slice(0, 12).map((event) => ({
      id: event.id,
      action: event.action,
      source: event.source,
      summary: event.summary,
      idempotencyKey: event.idempotencyKey,
      createdAt: event.createdAt.toISOString(),
    })),
    dataNotice:
      "Энэ дэлгэц бодит Google account-д холбогдоогүй mock integration. Sync/import үйлдэл PostgreSQL-д audit мөр болон хувилбартай demo өгөгдөл үүсгэнэ.",
  };
};

router.get("/session/me", async (_req, res): Promise<void> => {
  const [user] = await db
    .select()
    .from(learningUsersTable)
    .where(eq(learningUsersTable.id, demoStudentId))
    .limit(1);
  if (!user) {
    res.status(503).json({ error: "Туршилтын хэрэглэгч тохируулагдаагүй." });
    return;
  }
  res.json(
    GetCurrentUserResponse.parse({
      id: user.id,
      displayName: user.displayName,
      role: user.role,
      gradeLevel: user.gradeLevel,
      className: user.className,
      isDemo: user.isDemo,
      authConfigured: false,
    }),
  );
});

router.get("/student/dashboard", async (_req, res): Promise<void> => {
  const assignments = await db
    .select()
    .from(learningAssignmentsTable)
    .where(
      and(
        eq(learningAssignmentsTable.studentId, demoStudentId),
        eq(learningAssignmentsTable.approved, true),
        eq(learningAssignmentsTable.assignedDate, localToday()),
      ),
    )
    .orderBy(asc(learningAssignmentsTable.priority));
  const attempts = await db
    .select()
    .from(learningAttemptsTable)
    .where(eq(learningAttemptsTable.studentId, demoStudentId));
  const byAssignment = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    const current = byAssignment.get(attempt.assignmentId);
    if (!current || current.startedAt < attempt.startedAt) {
      byAssignment.set(attempt.assignmentId, attempt);
    }
  }
  const completed = assignments.filter(
    (assignment) =>
      assignmentStatus(byAssignment.get(assignment.id)) === "completed",
  ).length;
  const activities = assignments.map((assignment) => {
    const attempt = byAssignment.get(assignment.id);
    const completedSteps = new Set(attempt?.completedSteps ?? []);
    return {
      id: assignment.id,
      subject: assignment.subject,
      subjectCode: assignment.subjectCode,
      activityType: assignment.activityType,
      topic: assignment.topic,
      goal: assignment.goal,
      reason: assignment.reason,
      estimatedMinutes: assignment.estimatedMinutes,
      status: assignmentStatus(attempt),
      actionLabel:
        attempt?.status === "submitted"
          ? "Үнэлгээ хүлээж байна"
          : attempt?.status === "in_progress"
            ? "Үргэлжлүүлэх"
            : assignment.actionLabel,
      actionPath: `/assignment/${assignment.id}`,
      steps: assignment.steps.map((step) => ({
        ...step,
        state:
          step.kind === "check" && attempt?.status === "submitted"
            ? ("current" as const)
            : completedSteps.has(step.kind)
              ? ("done" as const)
              : ("todo" as const),
      })),
      materialAvailable: assignment.materialBlocks.some(
        (block) => block.available,
      ),
      gradeLevel: assignment.gradeLevel,
    };
  });

  res.json(
    GetStudentDashboardResponse.parse({
      displayName: "Тэмүүлэн",
      dateLabel: new Intl.DateTimeFormat("mn-MN", {
        dateStyle: "long",
        timeZone: "Asia/Ulaanbaatar",
      }).format(new Date()),
      currentStreak: 0,
      completedToday: completed,
      totalToday: assignments.length,
      focusTopic: assignments[0]?.topic ?? "Одоогийн сэдэв сонгогдоогүй",
      activities,
      subjects: [
        {
          subject: "Монгол хэл",
          completed,
          total: assignments.length,
          minutes: assignments.reduce(
            (total, assignment) => total + assignment.estimatedMinutes,
            0,
          ),
          accent: "indigo",
        },
      ],
      dataNotice:
        assignments.length > 0
          ? "Туршилтын баталгаажсан pilot өгөгдөл. Бодит workbook болон эх материал хараахан импортлогдоогүй."
          : "Өнөөдөр оноосон баталгаажсан ажил алга.",
    }),
  );
});

router.get(
  "/student/assignments/:assignmentId",
  async (req, res): Promise<void> => {
    const params = GetStudentAssignmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const { assignmentId } = params.data;
    const [assignment] = await db
      .select()
      .from(learningAssignmentsTable)
      .where(
        and(
          eq(learningAssignmentsTable.id, assignmentId),
          eq(learningAssignmentsTable.studentId, demoStudentId),
          eq(learningAssignmentsTable.approved, true),
        ),
      )
      .limit(1);
    if (!assignment) {
      res.status(404).json({ error: "Оноосон ажил олдсонгүй." });
      return;
    }
    const [attempt] = await db
      .select()
      .from(learningAttemptsTable)
      .where(
        and(
          eq(learningAttemptsTable.assignmentId, assignmentId),
          eq(learningAttemptsTable.studentId, demoStudentId),
        ),
      )
      .orderBy(desc(learningAttemptsTable.startedAt))
      .limit(1);
    res.json(
      GetStudentAssignmentResponse.parse({
        id: assignment.id,
        subject: assignment.subject,
        activityType: assignment.activityType,
        topic: assignment.topic,
        targetSkill: assignment.targetSkill,
        targetSkillCode: assignment.targetSkillCode,
        reason: assignment.reason,
        estimatedMinutes: assignment.estimatedMinutes,
        status: assignmentStatus(attempt),
        materialVersion: assignment.materialVersion,
        materialBlocks: assignment.materialBlocks,
        question: assignment.question,
        answerKeyVisible: false,
        dataNotice: assignment.dataNotice,
        completedSteps: attempt?.completedSteps ?? [],
      }),
    );
  },
);

router.post(
  "/student/assignments/:assignmentId/start",
  async (req, res): Promise<void> => {
    const params = StartStudentAssignmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [assignment] = await db
      .select()
      .from(learningAssignmentsTable)
      .where(
        and(
          eq(learningAssignmentsTable.id, params.data.assignmentId),
          eq(learningAssignmentsTable.studentId, demoStudentId),
          eq(learningAssignmentsTable.approved, true),
        ),
      )
      .limit(1);
    if (!assignment) {
      res.status(404).json({ error: "Оноосон ажил олдсонгүй." });
      return;
    }
    const [existing] = await db
      .select()
      .from(learningAttemptsTable)
      .where(
        and(
          eq(learningAttemptsTable.assignmentId, params.data.assignmentId),
          eq(learningAttemptsTable.studentId, demoStudentId),
          eq(learningAttemptsTable.status, "in_progress"),
        ),
      )
      .limit(1);
    let attempt = existing;
    if (!attempt) {
      try {
        [attempt] = await db
          .insert(learningAttemptsTable)
          .values({
            id: randomUUID(),
            assignmentId: params.data.assignmentId,
            studentId: demoStudentId,
            studentName: "Тэмүүлэн",
            className: "9А анги",
            status: "in_progress",
            maxScore: assignment.question?.maxScore ?? 0,
          })
          .returning();
      } catch (error) {
        if (postgresCode(error) !== "23505") throw error;
        [attempt] = await db
          .select()
          .from(learningAttemptsTable)
          .where(
            and(
              eq(learningAttemptsTable.assignmentId, params.data.assignmentId),
              eq(learningAttemptsTable.studentId, demoStudentId),
              eq(learningAttemptsTable.status, "in_progress"),
            ),
          )
          .limit(1);
      }
    }
    if (!attempt) {
      res.status(409).json({ error: "Оролдлогыг эхлүүлж чадсангүй." });
      return;
    }
    res.json(
      StartStudentAssignmentResponse.parse({
        assignmentId: params.data.assignmentId,
        status: "in_progress",
        startedAt: attempt.startedAt.toISOString(),
        attemptId: attempt.id,
        completedSteps: attempt.completedSteps,
      }),
    );
  },
);

router.post(
  "/student/assignments/:assignmentId/steps",
  async (req, res): Promise<void> => {
    const params = SaveStudentAssignmentStepParams.safeParse(req.params);
    const body = SaveStudentAssignmentStepBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [attempt] = await db
      .select()
      .from(learningAttemptsTable)
      .where(
        and(
          eq(learningAttemptsTable.assignmentId, params.data.assignmentId),
          eq(learningAttemptsTable.studentId, demoStudentId),
          eq(learningAttemptsTable.status, "in_progress"),
        ),
      )
      .orderBy(desc(learningAttemptsTable.startedAt))
      .limit(1);
    if (!attempt) {
      res.status(409).json({ error: "Эхлээд ажлаа эхлүүлнэ үү." });
      return;
    }
    const completed = new Set(attempt.completedSteps);
    if (body.data.completed) completed.add(body.data.step);
    else completed.delete(body.data.step);
    const [updated] = await db
      .update(learningAttemptsTable)
      .set({ completedSteps: [...completed] })
      .where(eq(learningAttemptsTable.id, attempt.id))
      .returning();
    res.json(
      SaveStudentAssignmentStepResponse.parse({
        assignmentId: params.data.assignmentId,
        status: "in_progress",
        startedAt: updated.startedAt.toISOString(),
        attemptId: updated.id,
        completedSteps: updated.completedSteps,
      }),
    );
  },
);

router.post(
  "/student/assignments/:assignmentId/submit",
  async (req, res): Promise<void> => {
    const params = SubmitStudentAssignmentParams.safeParse(req.params);
    const body = SubmitStudentAssignmentBody.safeParse(req.body);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const sendSubmission = (
      attempt: {
        id: string;
        status: string;
        score: number | null;
        maxScore: number;
        feedback: string | null;
      },
      message: string,
    ) => {
      const pending = attempt.status === "submitted";
      const correct =
        attempt.status === "reviewed" && attempt.score === attempt.maxScore;
      res.json(
        SubmitStudentAssignmentResponse.parse({
          attemptId: attempt.id,
          status: pending ? "pending_review" : "reviewed",
          score: attempt.score,
          maxScore: attempt.maxScore,
          feedback: attempt.feedback,
          nextAction: pending
            ? {
                kind: "teacher_support",
                label: "Багшийн үнэлгээг хүлээх",
                description:
                  "Бичгийн хариуг рубрикийн дагуу үнэлсний дараа ахиц шинэчлэгдэнэ.",
              }
            : correct
              ? {
                  kind: "next_skill",
                  label: "Дараагийн ажил руу очих",
                  description: "Энэ нотолгоо зорилтот чадварт хадгалагдлаа.",
                }
              : {
                  kind: "reinforce",
                  label: "Тайлбарыг дахин харах",
                  description: "Өөр жишээгээр нэг удаа дахин бататгая.",
                },
          message,
        }),
      );
    };
    const [duplicate] = await db
      .select()
      .from(learningAttemptsTable)
      .where(eq(learningAttemptsTable.submissionKey, body.data.idempotencyKey))
      .limit(1);
    if (duplicate) {
      if (
        duplicate.assignmentId !== params.data.assignmentId ||
        duplicate.studentId !== demoStudentId
      ) {
        res.status(409).json({ error: "Submission түлхүүр өөр ажилд ашиглагдсан." });
        return;
      }
      sendSubmission(duplicate, "Энэ хариулт өмнө нь бүртгэгдсэн байна.");
      return;
    }
    const [assignment] = await db
      .select()
      .from(learningAssignmentsTable)
      .where(
        and(
          eq(learningAssignmentsTable.id, params.data.assignmentId),
          eq(learningAssignmentsTable.studentId, demoStudentId),
          eq(learningAssignmentsTable.approved, true),
        ),
      )
      .limit(1);
    if (!assignment?.question) {
      res.status(409).json({ error: "Шалгах асуулт бэлэн биш байна." });
      return;
    }
    const [attempt] = await db
      .select()
      .from(learningAttemptsTable)
      .where(
        and(
          eq(learningAttemptsTable.assignmentId, params.data.assignmentId),
          eq(learningAttemptsTable.studentId, demoStudentId),
          eq(learningAttemptsTable.status, "in_progress"),
        ),
      )
      .orderBy(desc(learningAttemptsTable.startedAt))
      .limit(1);
    if (!attempt) {
      res.status(409).json({ error: "Идэвхтэй оролдлого олдсонгүй." });
      return;
    }
    const isWritten = assignment.question.type === "written";
    const objectiveCorrect =
      !isWritten &&
      assignment.answerKey != null &&
      body.data.answer.trim() === assignment.answerKey;
    let updated;
    try {
      [updated] = await db
        .update(learningAttemptsTable)
        .set({
        answer: body.data.answer,
        status: isWritten ? "submitted" : "reviewed",
        score: isWritten ? null : objectiveCorrect ? assignment.question.maxScore : 0,
        maxScore: assignment.question.maxScore,
        submissionKey: body.data.idempotencyKey,
        feedback: isWritten
          ? null
          : objectiveCorrect
            ? "Шалгасан чадварын хариу зөв байна."
            : "Энэ хэсгийг өөр жишээгээр дахин бататгая.",
        reviewer: isWritten ? null : "Баталгаажсан автомат түлхүүр",
        submittedAt: new Date(),
        reviewedAt: isWritten ? null : new Date(),
        })
        .where(
          and(
            eq(learningAttemptsTable.id, attempt.id),
            eq(learningAttemptsTable.status, "in_progress"),
          ),
        )
        .returning();
    } catch (error) {
      if (postgresCode(error) !== "23505") throw error;
    }
    if (!updated) {
      const [replayed] = await db
        .select()
        .from(learningAttemptsTable)
        .where(eq(learningAttemptsTable.submissionKey, body.data.idempotencyKey))
        .limit(1);
      if (
        !replayed ||
        replayed.assignmentId !== params.data.assignmentId ||
        replayed.studentId !== demoStudentId
      ) {
        res.status(409).json({ error: "Оролдлогыг өөр хүсэлт эцэслэсэн байна." });
        return;
      }
      sendSubmission(replayed, "Энэ хариулт өмнө нь бүртгэгдсэн байна.");
      return;
    }
    sendSubmission(
      updated,
      isWritten
        ? "Хариулт амжилттай илгээгдлээ."
        : "Хариулт хадгалагдаж, шалгалт дууслаа.",
    );
  },
);

router.get("/student/progress", async (_req, res): Promise<void> => {
  const assignments = await db
    .select()
    .from(learningAssignmentsTable)
    .where(
      and(
        eq(learningAssignmentsTable.studentId, demoStudentId),
        eq(learningAssignmentsTable.approved, true),
      ),
    );
  const attempts = await db
    .select()
    .from(learningAttemptsTable)
    .where(eq(learningAttemptsTable.studentId, demoStudentId))
    .orderBy(desc(learningAttemptsTable.startedAt));
  const reviewed = attempts.filter((attempt) => attempt.status === "reviewed");
  const assignmentsById = new Map(
    assignments.map((assignment) => [assignment.id, assignment]),
  );
  const bySkill = new Map<
    string,
    { assignment: (typeof assignments)[number]; attempts: typeof reviewed }
  >();
  for (const assignment of assignments) {
    const group = bySkill.get(assignment.targetSkillCode) ?? {
      assignment,
      attempts: [],
    };
    group.attempts.push(
      ...reviewed.filter((attempt) => attempt.assignmentId === assignment.id),
    );
    bySkill.set(assignment.targetSkillCode, group);
  }
  res.json(
    GetStudentProgressResponse.parse({
      skills: [...bySkill.values()].map(({ assignment, attempts: evidence }) => {
        const latest = evidence.sort(
          (a, b) =>
            (b.reviewedAt?.getTime() ?? 0) - (a.reviewedAt?.getTime() ?? 0),
        )[0];
        const percentage = latest
          ? Math.round(((latest.score ?? 0) / latest.maxScore) * 100)
          : 0;
        return {
          skill: assignment.targetSkill,
          code: assignment.targetSkillCode,
          gradeLevel: assignment.gradeLevel,
          status: !latest
            ? ("unassessed" as const)
            : percentage === 100
              ? ("mastered" as const)
              : percentage >= 50
                ? ("developing" as const)
                : ("needs_support" as const),
          percentage,
          evidenceCount: evidence.length,
          lastEvidenceDate: latest?.reviewedAt?.toISOString() ?? null,
        };
      }),
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        assignment:
          assignmentsById.get(attempt.assignmentId)?.topic ?? "Сургалтын ажил",
        submittedAt: (attempt.submittedAt ?? attempt.startedAt).toISOString(),
        status:
          attempt.status === "submitted"
            ? "Багшийн үнэлгээ хүлээж байна"
            : attempt.status === "reviewed"
              ? "Үнэлэгдсэн"
              : "Үргэлжилж байна",
        score: attempt.score,
        maxScore: attempt.maxScore,
        reviewer: attempt.reviewer,
      })),
      dataNotice:
        "Ахиц зөвхөн үнэлэгдсэн нотолгооноос шинэчлэгдэнэ. Уншиж дуусгасан тэмдэглэгээ дангаараа чадвар эзэмшсэнд тооцогдохгүй.",
    }),
  );
});

router.get("/teacher/dashboard", async (_req, res): Promise<void> => {
  const pending = await db
    .select()
    .from(learningAttemptsTable)
    .where(eq(learningAttemptsTable.status, "submitted"));
  const students = await db
    .select({ studentId: learningAssignmentsTable.studentId })
    .from(learningAssignmentsTable);
  const [topic] = await db
    .select()
    .from(currentTopicsTable)
    .where(eq(currentTopicsTable.classId, "class-9a"))
    .limit(1);
  res.json(
    GetTeacherDashboardResponse.parse({
      teacherName: demoTeacherName,
      classCount: 1,
      studentCount: new Set(students.map((row) => row.studentId)).size,
      awaitingReview: pending.length,
      currentTopic:
        topic?.topic ?? "Эхийн гол санаа ба дэмжих баримт",
      insight:
        "Шалгуулаагүй чадварыг сул гэж тэмдэглэхгүй. Ахиц зөвхөн үнэлэгдсэн нотолгооноос шинэчлэгдэнэ.",
    }),
  );
});

router.get("/teacher/classes", async (_req, res): Promise<void> => {
  const [topic] = await db
    .select()
    .from(currentTopicsTable)
    .where(eq(currentTopicsTable.classId, "class-9a"))
    .limit(1);
  const pending = await db
    .select()
    .from(learningAttemptsTable)
    .where(eq(learningAttemptsTable.status, "submitted"));
  res.json(
    GetTeacherClassesResponse.parse([
      {
        id: "class-9a",
        name: "9А анги",
        gradeLevel: 9,
        subject: "Монгол хэл",
        studentCount: 1,
        currentTopic: topic?.topic ?? "Эхийн гол санаа ба дэмжих баримт",
        needsReview: pending.length,
      },
    ]),
  );
});

router.get(
  "/teacher/integrations/workspace",
  async (_req, res): Promise<void> => {
    res.json(
      GetWorkspaceIntegrationDashboardResponse.parse(
        await buildWorkspaceDashboard(),
      ),
    );
  },
);

router.post(
  "/teacher/integrations/workspace/simulate",
  async (req, res): Promise<void> => {
    const body = SimulateWorkspaceIntegrationBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [existing] = await db
      .select()
      .from(workspaceAuditEventsTable)
      .where(
        eq(
          workspaceAuditEventsTable.idempotencyKey,
          body.data.idempotencyKey,
        ),
      )
      .limit(1);
    if (existing && existing.action !== body.data.action) {
      res.status(409).json({
        error: "Idempotency key өөр mock үйлдэлтэй холбогдсон байна.",
      });
      return;
    }
    const action = body.data.action;
    const source =
      action === "sync_classroom" || action === "publish_coursework"
        ? "classroom"
        : action === "import_sheet"
          ? "sheets"
          : "drive";
    const summary = {
      sync_classroom:
        "2 mock Classroom course болон 54 roster membership reference синк хийв.",
      import_sheet:
        "48 асуултаас 45 мөр validation давж, 3 мөр review шаардлагатай болов.",
      import_drive:
        "3 материалын mock Drive revision metadata-г approved version-той холбов.",
      publish_coursework:
        "EJ Learning assignment холбоосыг mock Classroom coursework болгон нийтлэв.",
    }[action];
    if (!existing) {
      try {
      await db.transaction(async (tx) => {
        await tx.insert(workspaceAuditEventsTable).values({
          id: randomUUID(),
          action,
          source,
          summary,
          idempotencyKey: body.data.idempotencyKey,
        });
        if (action === "sync_classroom") {
          await tx
            .insert(workspaceCoursesTable)
            .values([
              {
                externalCourseId: "classroom-course-9a-mn",
                internalClassId: "class-9a",
                name: "9А — Монгол хэл",
                teacher: demoTeacherName,
                studentCount: 28,
                syncStatus: "synced_mock",
                lastSyncAt: new Date(),
              },
              {
                externalCourseId: "classroom-course-9b-mn",
                internalClassId: "class-9b",
                name: "9Б — Монгол хэл",
                teacher: demoTeacherName,
                studentCount: 26,
                syncStatus: "synced_mock",
                lastSyncAt: new Date(),
              },
            ])
            .onConflictDoUpdate({
              target: workspaceCoursesTable.externalCourseId,
              set: {
                syncStatus: "synced_mock",
                lastSyncAt: new Date(),
              },
            });
        }
        if (action === "import_sheet") {
          await tx
            .insert(workspaceImportBatchesTable)
            .values({
              id: "mock-sheet-simulation",
              source: "sheets",
              fileName: "MN9_question_bank_mock.xlsx",
              status: "validated",
              rowCount: 48,
              validCount: 45,
              errorCount: 3,
              version: 1,
            })
            .onConflictDoUpdate({
              target: workspaceImportBatchesTable.id,
              set: {
                status: "validated",
                rowCount: 48,
                validCount: 45,
                errorCount: 3,
              },
            });
        }
        if (action === "import_drive") {
          await tx
            .insert(workspaceImportBatchesTable)
            .values({
              id: "mock-drive-simulation",
              source: "drive",
              fileName: "MN9_main_idea_materials_mock",
              status: "approved",
              rowCount: 3,
              validCount: 3,
              errorCount: 0,
              version: 2,
            })
            .onConflictDoUpdate({
              target: workspaceImportBatchesTable.id,
              set: {
                status: "approved",
                rowCount: 3,
                validCount: 3,
                errorCount: 0,
              },
            });
        }
      });
      } catch (error) {
        if (postgresCode(error) !== "23505") throw error;
        const [keyConflict] = await db
          .select()
          .from(workspaceAuditEventsTable)
          .where(
            eq(
              workspaceAuditEventsTable.idempotencyKey,
              body.data.idempotencyKey,
            ),
          )
          .limit(1);
        if (keyConflict && keyConflict.action !== action) {
          res.status(409).json({
            error: "Idempotency key өөр mock үйлдэлтэй холбогдсон байна.",
          });
          return;
        }
        const [actionReplay] = await db
          .select()
          .from(workspaceAuditEventsTable)
          .where(eq(workspaceAuditEventsTable.action, action))
          .limit(1);
        if (!keyConflict && !actionReplay) throw error;
      }
    }
    res.json(
      SimulateWorkspaceIntegrationResponse.parse(
        await buildWorkspaceDashboard(),
      ),
    );
  },
);

router.get("/teacher/review-queue", async (_req, res): Promise<void> => {
  const pending = await db
    .select()
    .from(learningAttemptsTable)
    .where(eq(learningAttemptsTable.status, "submitted"))
    .orderBy(learningAttemptsTable.submittedAt);
  const assignments = await db.select().from(learningAssignmentsTable);
  const assignmentsById = new Map(
    assignments.map((assignment) => [assignment.id, assignment]),
  );
  res.json(
    GetTeacherReviewQueueResponse.parse(
      pending.flatMap((attempt) => {
        const assignment = assignmentsById.get(attempt.assignmentId);
        if (!assignment || assignment.question?.type !== "written") return [];
        return [{
          attemptId: attempt.id,
          studentName: attempt.studentName,
          className: attempt.className,
          topic: assignment.topic,
          skill: assignment.targetSkill,
          answer: attempt.answer ?? "",
          submittedAt: (
            attempt.submittedAt ?? attempt.startedAt
          ).toISOString(),
          rubric: assignment.rubric ?? [],
        }];
      }),
    ),
  );
});

router.post(
  "/teacher/reviews/:attemptId",
  async (req, res): Promise<void> => {
    const params = ReviewTeacherAttemptParams.safeParse(req.params);
    const body = ReviewTeacherAttemptBody.safeParse(req.body);
    if (!params.success || !body.success || body.data.score > 4) {
      res.status(400).json({
        error:
          !params.success
            ? params.error.message
            : !body.success
              ? body.error.message
              : "Оноо 0–4 хооронд байна.",
      });
      return;
    }
    const buildReviewResponse = (attempt: {
      id: string;
      score: number | null;
      feedback: string | null;
    }) =>
      ReviewTeacherAttemptResponse.parse({
        attemptId: attempt.id,
        status: "reviewed",
        score: attempt.score ?? 0,
        feedback: attempt.feedback ?? "",
        nextAction:
          (attempt.score ?? 0) >= 3
            ? {
                kind: "return_to_target",
                label: "Зорилтот чадвар руу буцах",
                description:
                  "Энэ нотолгоо хангалттай тул дараагийн зорилтот ажил нээгдэнэ.",
              }
            : {
                kind: "reinforce",
                label: "Өөр жишээгээр бататгах",
                description:
                  "Ижил зорилготой өөр дасгал өгөх шаардлагатай.",
              },
      });
    const [replayed] = await db
      .select()
      .from(learningAttemptsTable)
      .where(eq(learningAttemptsTable.reviewKey, body.data.idempotencyKey))
      .limit(1);
    if (replayed) {
      if (replayed.id !== params.data.attemptId) {
        res.status(409).json({ error: "Review түлхүүр өөр оролдлогод ашиглагдсан." });
        return;
      }
      res.json(buildReviewResponse(replayed));
      return;
    }
    const [attempt] = await db
      .select()
      .from(learningAttemptsTable)
      .where(
        and(
          eq(learningAttemptsTable.id, params.data.attemptId),
          eq(learningAttemptsTable.status, "submitted"),
        ),
      )
      .limit(1);
    if (!attempt) {
      res.status(409).json({ error: "Хариулт аль хэдийн эцэслэгдсэн эсвэл илгээгдээгүй байна." });
      return;
    }
    const [assignment] = await db
      .select()
      .from(learningAssignmentsTable)
      .where(eq(learningAssignmentsTable.id, attempt.assignmentId))
      .limit(1);
    if (assignment?.question?.type !== "written") {
      res.status(409).json({ error: "Зөвхөн бичгийн хариуг багш үнэлнэ." });
      return;
    }
    try {
      const [updated] = await db
        .update(learningAttemptsTable)
        .set({
          status: "reviewed",
          score: Math.round(body.data.score),
          feedback: body.data.feedback,
          rubricNotes: body.data.rubricNotes,
          reviewer: demoTeacherName,
          reviewKey: body.data.idempotencyKey,
          reviewedAt: new Date(),
        })
        .where(
          and(
            eq(learningAttemptsTable.id, attempt.id),
            eq(learningAttemptsTable.status, "submitted"),
          ),
        )
        .returning();
      if (!updated) {
        const [concurrentReplay] = await db
          .select()
          .from(learningAttemptsTable)
          .where(eq(learningAttemptsTable.reviewKey, body.data.idempotencyKey))
          .limit(1);
        if (concurrentReplay?.id === params.data.attemptId) {
          res.json(buildReviewResponse(concurrentReplay));
          return;
        }
        res.status(409).json({ error: "Хариултыг өөр review эцэслэсэн байна." });
        return;
      }
      res.json(buildReviewResponse(updated));
    } catch (error) {
      if (postgresCode(error) !== "23505") throw error;
      const [duplicate] = await db
        .select()
        .from(learningAttemptsTable)
        .where(eq(learningAttemptsTable.reviewKey, body.data.idempotencyKey))
        .limit(1);
      if (!duplicate || duplicate.id !== params.data.attemptId) {
        res.status(409).json({ error: "Review түлхүүрийн зөрчил гарлаа." });
        return;
      }
      res.json(buildReviewResponse(duplicate));
    }
  },
);

router.post(
  "/teacher/current-topic",
  async (req, res): Promise<void> => {
    const body = SetTeacherCurrentTopicBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.message });
      return;
    }
    const [topic] = await db
      .insert(currentTopicsTable)
      .values({
        id: `${body.data.classId}:${body.data.subjectCode}`,
        classId: body.data.classId,
        subjectCode: body.data.subjectCode,
        topic: body.data.topic,
        topicCode: body.data.topicCode,
      })
      .onConflictDoUpdate({
        target: [
          currentTopicsTable.classId,
          currentTopicsTable.subjectCode,
        ],
        set: {
          topic: body.data.topic,
          topicCode: body.data.topicCode,
          updatedAt: new Date(),
        },
      })
      .returning();
    res.json(
      SetTeacherCurrentTopicResponse.parse({
        classId: topic.classId,
        subjectCode: topic.subjectCode,
        topic: topic.topic,
        topicCode: topic.topicCode,
        effectiveDate: topic.effectiveDate.toISOString(),
      }),
    );
  },
);

export default router;