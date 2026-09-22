import { forbidden } from "../../shared/http-error";
import type { AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";

export async function authorisedClass(user: AuthenticatedUser, classId: number) {
  const [klass] = user.roles.includes('ADMIN')
    ? await repository.anyClass(classId)
    : user.teacherId === null
      ? []
      : await repository.teacherClass(user.teacherId, classId);
  if (!klass) {
    throw forbidden("Энэ ангид хандах эрхгүй байна.", "NOT_YOUR_CLASS");
  }
  return klass;
}

export async function viewableSubjects(
  user: AuthenticatedUser,
  classId: number,
  requested: number | null,
) {
  if (user.roles.includes("ADMIN")) return requested === null ? null : [requested];
  if (await repository.isClassTeacher(user.teacherId, classId)) {
    return requested === null ? null : [requested];
  }
  const held = await repository.subjectsTaughtBy(user.teacherId, classId);
  if (requested === null) return held;
  if (!held.includes(requested)) {
    throw forbidden("Та энэ ангид тухайн хичээлийг заадаггүй байна.", "NOT_YOUR_SUBJECT");
  }
  return [requested];
}

export async function editableSubjects(
  user: AuthenticatedUser,
  classId: number,
  requested: number | null,
) {
  if (user.roles.includes("ADMIN")) return requested === null ? null : [requested];
  const held = await repository.subjectsTaughtBy(user.teacherId, classId);
  if (held.length === 0) {
    throw forbidden(
      "Та энэ ангид хичээл заадаггүй тул өөрчлөх эрхгүй.",
      "NOT_YOUR_SUBJECT",
    );
  }
  if (requested === null) return held;
  if (!held.includes(requested)) {
    throw forbidden("Та энэ ангид тухайн хичээлийг заадаггүй байна.", "NOT_YOUR_SUBJECT");
  }
  return [requested];
}

/** Public module boundary for the class/subject choices visible to staff. */
export const teacherClassChoices = (user: AuthenticatedUser) =>
  repository.teacherClassOptions(user.teacherId, user.roles.includes("ADMIN"));

/** The students this account may look at, for a teacher-side picker. */
export const previewStudents = (user: AuthenticatedUser) =>
  repository.studentsForTeacher(user.teacherId, user.roles.includes("ADMIN"));
