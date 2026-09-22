import { badRequest } from "../../shared/http-error";
import type { AuthenticatedUser } from "../identity/service";
import { schedulableLessons } from "../schedule/service";
import * as repository from "./repository";

/**
 * Assigns extra work to one student.
 *
 * The teacher must teach that student's class, and the lesson must be one the
 * class could be taught - the endpoint takes ids, and without both checks any
 * lesson could be pushed onto any child.
 *
 * Both checks come from the schedule module rather than being re-implemented
 * here. "Which lessons may this teacher put in front of this class" is one
 * question whether it is being timetabled or handed to a single child, and
 * the second copy of that SQL is the one that would quietly drift.
 */
export async function assignExtraWork(
  user: AuthenticatedUser,
  input: { studentId: number; lessonId: number; assignedOn: string; reason: string | null },
) {
  const [enrolment] = await repository.classOfStudent(input.studentId);
  if (!enrolment) {
    throw badRequest("Сурагч ангид бүртгэгдээгүй байна.", "STUDENT_NOT_ENROLLED");
  }

  const lessons = await schedulableLessons(user, enrolment.classId, null);
  if (!lessons.some((lesson) => lesson.id === input.lessonId)) {
    throw badRequest(
      "Энэ хичээлийг тухайн сурагчид оноох боломжгүй.",
      "LESSON_NOT_SCHEDULABLE",
    );
  }

  await repository.upsertStudentAssignment({
    studentId: input.studentId,
    dailyLessonId: input.lessonId,
    assignedOn: input.assignedOn,
    assignedBy: user.id,
    reason: input.reason,
  });

  const [lesson] = await repository.lessonSummary(input.lessonId);
  return {
    studentName: enrolment.studentName,
    lessonCode: lesson.lessonCode,
    skillName: lesson.skillName,
    assignedOn: input.assignedOn,
  };
}
