import { badRequest, forbidden } from '../../shared/http-error';
import type { AuthenticatedUser } from '../identity/service';
import {
  authorisedClass,
  editableSubjects,
  viewableSubjects,
} from '../class-access/service';
import { stageForGrade } from '../../shared/school-stage';
import { recordTeacherMastery } from '../mastery/service';
import * as repository from './repository';

export async function classSkillsForTeacher(
  user: AuthenticatedUser,
  classId: number,
  subjectId: number | null,
) {
  const klass = await authorisedClass(user, classId);
  const subjectIds = await viewableSubjects(user, klass.classId, subjectId);
  const skills = await repository.classSkillMastery(klass.classId, subjectIds);
  return {
    classId: klass.classId,
    className: klass.className,
    skills: skills.map((skill) => ({
      ...skill,
      weakest: skill.weakest.slice(0, 5),
      weakestTotal: skill.weakest.length,
    })),
  };
}

export async function assessmentSheet(
  user: AuthenticatedUser,
  classId: number,
  skillId: number | null,
  subjectId: number | null,
) {
  const klass = await authorisedClass(user, classId);
  const subjectIds = await editableSubjects(user, klass.classId, subjectId);
  const skills = await repository.assessableSkills(klass.classId, subjectIds);
  const chosen = skillId ?? skills[0]?.skillId ?? null;
  return {
    classId: klass.classId,
    className: klass.className,
    gradeLevel: klass.gradeLevel,
    stage: stageForGrade(klass.gradeLevel),
    skills,
    skillId: chosen,
    students: chosen === null ? [] : await repository.classRosterForSkill(klass.classId, chosen),
  };
}

export async function submitAssessment(
  user: AuthenticatedUser,
  input: {
    classId: number;
    skillId: number;
    entries: { studentId: number; status: 'MASTERED' | 'DEVELOPING' | 'GAP'; score: number | null }[];
  },
) {
  const klass = await authorisedClass(user, input.classId);
  if (!(await repository.skillAssessableForClass(klass.classId, input.skillId, null))) {
    throw badRequest('Энэ чадвар тухайн ангид тохирохгүй байна.', 'SKILL_NOT_FOR_CLASS');
  }
  const subjectIds = await editableSubjects(user, klass.classId, null);
  if (!(await repository.skillAssessableForClass(klass.classId, input.skillId, subjectIds))) {
    throw forbidden('Та энэ хичээлийг заадаггүй тул үнэлгээ оруулах эрхгүй.', 'NOT_YOUR_SUBJECT');
  }
  const enrolled = await repository.enrolledStudentIds(klass.classId);
  if (input.entries.some((entry) => !enrolled.has(entry.studentId))) {
    throw badRequest('Энэ ангид харьяалагдахгүй сурагч байна.', 'STUDENT_NOT_IN_CLASS');
  }
  for (const entry of input.entries) {
    await recordTeacherMastery({
      studentId: entry.studentId,
      skillId: input.skillId,
      status: entry.status,
      score: entry.score,
      teacherUsername: user.username,
    });
  }
  return { classId: klass.classId, skillId: input.skillId, recorded: input.entries.length };
}

export async function itemAnalysis(user: AuthenticatedUser, classId: number) {
  const klass = await authorisedClass(user, classId);
  // The class alone let a subject teacher read every other subject's questions
  // in a class they share. Same rule as the skills view: a subject teacher sees
  // their own subjects, a class teacher and an administrator the whole class.
  const subjectIds = await viewableSubjects(user, klass.classId, null);
  return {
    classId: klass.classId,
    className: klass.className,
    items: await repository.itemAnalysisForClass(klass.classId, subjectIds),
  };
}

/**
 * Work waiting to be marked, scoped to this teacher's own students.
 *
 * Serialised through JSON first: the rows carry timestamps as Date objects
 * and the contract promises strings.
 */
export const teacherReviewQueue = async (user: AuthenticatedUser) =>
  JSON.parse(JSON.stringify(
    await repository.reviewQueue(user.teacherId, user.roles.includes('ADMIN')),
  ));
