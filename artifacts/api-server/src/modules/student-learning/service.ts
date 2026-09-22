import { forbidden } from "../../shared/http-error";
import { todayInUlaanbaatar } from "../../shared/school-date";
import type { AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";

const longDate = (isoDate: string) =>
  new Intl.DateTimeFormat("mn-MN", { dateStyle: "long", timeZone: "UTC" }).format(
    new Date(`${isoDate}T00:00:00Z`),
  );

function toLessonView(row: repository.LessonRow) {
  return {
    id: row.id,
    lessonCode: row.lessonCode,
    lessonType: row.lessonType,
    skillName: row.skillName,
    learningGoal: row.learningGoal,
    remember: row.remember,
    workedExample: row.workedExample,
    guidedPractice: row.guidedPractice,
    independentPractice: row.independentPractice,
    studentMessage: row.studentMessage,
    teacherNote: row.teacherNote,
    estimatedMinutes: row.estimatedMinutes,
    book:
      row.materialId === null
        ? null
        : {
            materialId: row.materialId,
            title: row.materialTitle,
            chapterTitle: row.chapterTitle,
            pageFrom: row.pageFrom,
            pageTo: row.pageTo,
            filePage: row.pageFrom === null ? null : row.pageFrom + row.pageOffset,
            fileUrl: `/api/content/materials/${row.materialId}/file`,
          },
  };
}

export async function studentToday(user: AuthenticatedUser, date = todayInUlaanbaatar()) {
  if (user.studentId === null) {
    throw forbidden(
      "Энэ бүртгэл сурагчийн бүртгэлтэй холбогдоогүй байна.",
      "NO_STUDENT_LINK",
    );
  }

  const [[enrolment], classRows, assignments] = await Promise.all([
    repository.studentClass(user.studentId),
    repository.lessonsForDay(user.studentId, date),
    repository.assignmentsForDay(user.studentId, date),
  ]);
  const bySubject = new Map<
    string,
    {
      subjectCode: string;
      subjectName: string;
      periodNo: number | null;
      lesson: ReturnType<typeof toLessonView> | null;
      extra: {
        lesson: ReturnType<typeof toLessonView>;
        source: "AUTO" | "TEACHER";
        reason: string | null;
      } | null;
    }
  >();

  const entryFor = (subjectCode: string, subjectName: string) => {
    const existing = bySubject.get(subjectCode);
    if (existing) return existing;
    const created = { subjectCode, subjectName, periodNo: null, lesson: null, extra: null };
    bySubject.set(subjectCode, created);
    return created;
  };

  for (const row of classRows) {
    const entry = entryFor(row.subjectCode, row.subjectName);
    entry.lesson = toLessonView(row);
    entry.periodNo = row.periodNo;
  }
  for (const assignment of assignments) {
    entryFor(assignment.subjectCode, assignment.subjectName).extra = {
      lesson: toLessonView(assignment),
      source: assignment.source as "AUTO" | "TEACHER",
      reason: assignment.reason,
    };
  }

  const subjects = [...bySubject.values()].sort((a, b) =>
    a.subjectName.localeCompare(b.subjectName, "mn"),
  );
  return {
    date,
    dateLabel: longDate(date),
    className: enrolment?.className ?? "",
    subjects,
    notice:
      subjects.length > 0
        ? "Хичээлээ дэвтэртээ гүйцэтгээд шалгах асуултад хариулна."
        : !enrolment
          ? "Та ангид бүртгэгдээгүй байна. Багштайгаа холбогдоно уу."
          : "Энэ өдөр хуваарьт хичээл алга.",
  };
}
