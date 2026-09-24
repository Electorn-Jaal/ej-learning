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

/**
 * A child's day: every period on their class's timetable, in bell order.
 *
 * One entry per slot, not per subject. Монгол хэл in the first period and
 * again in the second is two lessons and used to be collapsed into one, which
 * told a child they had half the day they really had.
 *
 * A slot with no prepared content still appears, carrying its subject, time
 * and teacher. The school has a full timetable and almost no lesson content,
 * so hiding the empty ones would hide the timetable.
 *
 * Personal work is attached to the first slot of its subject, and a subject
 * with personal work but nothing timetabled gets a slot of its own with no
 * period - it answers to no bell.
 */
export async function studentToday(user: AuthenticatedUser, date = todayInUlaanbaatar()) {
  if (user.studentId === null) {
    throw forbidden(
      "Энэ бүртгэл сурагчийн бүртгэлтэй холбогдоогүй байна.",
      "NO_STUDENT_LINK",
    );
  }

  const [[enrolment], timetable, assignments] = await Promise.all([
    repository.studentClass(user.studentId),
    repository.lessonsForDay(user.studentId, date),
    repository.assignmentsForDay(user.studentId, date),
  ]);

  type Extra = {
    lesson: ReturnType<typeof toLessonView>;
    source: "AUTO" | "TEACHER";
    reason: string | null;
  };
  const slots = timetable.map((row) => ({
    subjectCode: row.subjectCode,
    subjectName: row.subjectName,
    periodNo: row.periodNo,
    startsAt: row.startsAt ?? null,
    endsAt: row.endsAt ?? null,
    teacherName: row.teacherName ?? null,
    groupLabel: row.groupLabel ?? null,
    selectionPending: row.selectionPending ?? false,
    timetableSlotId: row.timetableSlotId ?? null,
    // Struck off the register. The child is told the lesson did not happen and
    // why, and gets no material and no check for it - there is nothing to
    // answer about an hour that did not take place.
    held: row.held ?? true,
    notHeldReason: row.notHeldReason ?? null,
    // Carrying the last period on rather than opening a new section, which
    // reads differently: pick the book up, do not start it.
    isContinuation: row.isContinuation ?? false,
    // Null where nobody has written the lesson, which is most of them.
    lesson: row.id === null || row.held === false ? null : toLessonView(row),
    extra: null as Extra | null,
  }));

  for (const assignment of assignments) {
    const extra: Extra = {
      lesson: toLessonView(assignment),
      source: assignment.source as "AUTO" | "TEACHER",
      reason: assignment.reason,
    };
    const slot = slots.find((row) => row.subjectCode === assignment.subjectCode);
    if (slot) {
      slot.extra = extra;
    } else {
      slots.push({
        subjectCode: assignment.subjectCode,
        subjectName: assignment.subjectName,
        periodNo: null,
        startsAt: null,
        endsAt: null,
        teacherName: null,
        groupLabel: null,
        selectionPending: false,
        timetableSlotId: null,
        held: true,
        notHeldReason: null,
        isContinuation: false,
        lesson: null,
        extra,
      });
    }
  }

  return {
    date,
    dateLabel: longDate(date),
    className: enrolment?.className ?? "",
    slots,
    notice:
      slots.length > 0
        ? "Хичээлээ дэвтэртээ гүйцэтгээд шалгах асуултад хариулна."
        : !enrolment
          ? "Та ангид бүртгэгдээгүй байна. Багштайгаа холбогдоно уу."
          : "Энэ өдөр хуваарьт хичээл алга.",
  };
}
