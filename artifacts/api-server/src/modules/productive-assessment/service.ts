import { badRequest, forbidden } from "../../shared/http-error";
import type { AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";

/** Only English has a placement paper, so only English can be marked here. */
const SUBJECT = "ENG";

const isAdmin = (user: AuthenticatedUser) => user.roles.includes("ADMIN");

export const markableClasses = (user: AuthenticatedUser) =>
  repository.markableClasses(user.teacherId, isAdmin(user));

/**
 * One class's children, each with the tasks their own level asks of them.
 *
 * Flat rows come back from the query and are grouped per child here, because
 * the screen is a list of children and the tasks are what you open one to
 * see. A child with four tasks and none marked is the normal state today.
 */
export async function classMarkSheet(user: AuthenticatedUser, classId: string) {
  const allowed = await repository.markableClasses(user.teacherId, isAdmin(user));
  if (!allowed.some((row) => row.classId === classId)) {
    throw forbidden("Энэ ангийг дүгнэх эрхгүй байна.", "CLASS_NOT_YOURS");
  }

  const rows = await repository.marksForClass(classId, SUBJECT);
  const students = new Map<string, {
    studentId: string; studentCode: string; studentName: string;
    levelCode: string; levelName: string; objectiveScore: number | null;
    tasks: {
      itemId: string; itemCode: string; domain: string; prompt: string;
      rubric: string | null; maxScore: number; score: number | null;
      comment: string | null; ratedByName: string | null; ratedAt: string | null;
    }[];
  }>();

  for (const row of rows) {
    let entry = students.get(row.studentId);
    if (!entry) {
      entry = {
        studentId: row.studentId, studentCode: row.studentCode,
        studentName: row.studentName, levelCode: row.levelCode,
        levelName: row.levelName, objectiveScore: row.objectiveScore, tasks: [],
      };
      students.set(row.studentId, entry);
    }
    entry.tasks.push({
      itemId: row.itemId, itemCode: row.itemCode, domain: row.domain,
      prompt: row.prompt, rubric: row.rubric, maxScore: row.maxScore,
      score: row.score, comment: row.comment,
      ratedByName: row.ratedByName, ratedAt: row.ratedAt,
    });
  }

  return {
    classId,
    className: allowed.find((row) => row.classId === classId)!.className,
    students: [...students.values()],
  };
}

export type RatingInput = {
  classId: string; studentId: string; itemId: string;
  score: number; comment?: string | null;
};

/**
 * Records one judgement and re-checks whether the child's level is confirmed.
 *
 * The confirmation is derived rather than set: a level counts as confirmed
 * exactly when every judged task at that level has been marked, so it cannot
 * drift out of step with the ratings behind it, and removing a rating takes
 * it back to provisional on its own.
 */
export async function rate(user: AuthenticatedUser, input: RatingInput) {
  const sheet = await classMarkSheet(user, input.classId);
  const student = sheet.students.find((row) => row.studentId === input.studentId);
  if (!student) throw badRequest("Энэ сурагч энэ ангид алга байна.", "STUDENT_NOT_IN_CLASS");
  if (!student.tasks.some((task) => task.itemId === input.itemId)) {
    throw badRequest("Энэ даалгавар тухайн сурагчийн түвшинд алга.", "TASK_NOT_AT_LEVEL");
  }

  const [item] = await repository.judgedItem(input.itemId);
  if (!item) throw badRequest("Дүгнэх даалгавар олдсонгүй.", "TASK_NOT_FOUND");
  if (input.score < 0 || input.score > item.maxScore) {
    throw badRequest(`Оноо 0–${item.maxScore} хооронд байна.`, "SCORE_OUT_OF_RANGE");
  }

  await repository.saveRating({
    studentId: input.studentId,
    itemId: input.itemId,
    score: input.score,
    maxScore: item.maxScore,
    comment: input.comment?.trim() || null,
    ratedBy: user.id,
  });
  await repository.refreshPlacementConfidence(input.studentId, SUBJECT);

  return classMarkSheet(user, input.classId);
}
