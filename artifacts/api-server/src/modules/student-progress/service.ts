import { HttpError, forbidden } from '../../shared/http-error';
import type { AuthenticatedUser } from '../identity/service';
import * as repository from './repository';

const dataNotice = 'Сургалтын агуулга хараахан оруулаагүй байна.';

/** Dates come back as Date objects; the contract promises strings. */
const serializable = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/**
 * The student record behind the signed-in account.
 *
 * Every screen in this module is about one child and reads their own row, so
 * the id comes from the session and never from the request. An account with
 * no student link is a staff account on a student route, which is a refusal
 * rather than an empty page.
 */
async function currentStudent(user: AuthenticatedUser) {
  if (user.studentId === null || user.studentId === undefined) {
    throw forbidden('Энэ бүртгэл сурагчийн бүртгэлтэй холбогдоогүй байна.', 'NO_STUDENT_LINK');
  }
  const [student] = await repository.studentById(user.studentId);
  if (!student) throw new HttpError(404, 'Идэвхтэй сурагч олдсонгүй.', 'STUDENT_NOT_FOUND');
  return student;
}

export async function studentSubjects(user: AuthenticatedUser) {
  const student = await currentStudent(user);
  const [subjects, lessons] = await Promise.all([
    repository.subjects(student.id), repository.approvedLessons(student.id),
  ]);
  return subjects.map((subject) => ({
    ...subject,
    approvedLessons: lessons.filter((lesson) => lesson.subjectCode === subject.code).length,
  }));
}

export async function studentDashboard(user: AuthenticatedUser) {
  const student = await currentStudent(user);
  const lessons = await repository.approvedLessons(student.id);
  return {
    displayName: student.displayName,
    dateLabel: new Intl.DateTimeFormat('mn-MN', { dateStyle: 'long', timeZone: 'Asia/Ulaanbaatar' }).format(new Date()),
    currentStreak: 0, completedToday: 0, totalToday: 0,
    focusTopic: 'Баталгаажсан хичээлийн сан',
    activities: lessons.map((lesson) => ({
      ...lesson, activityType: 'lesson', status: 'not_started',
      actionLabel: 'Унших', actionPath: `/assignment/${lesson.id}`, steps: [],
      materialAvailable: Boolean(lesson.explanation || lesson.example || lesson.practice),
    })),
    subjects: [],
    dataNotice: `${dataNotice} Өдөр тутмын ажил оноох урсгал хараахан холбогдоогүй; зөвхөн баталгаажсан хичээл харагдана.`,
  };
}

export async function studentAssignment(user: AuthenticatedUser, assignmentId: string) {
  const student = await currentStudent(user);
  const lesson = (await repository.approvedLessons(student.id)).find((item) => item.id === assignmentId);
  if (!lesson) {
    throw new HttpError(404, 'Баталгаажсан, тухайн ангид тохирох хичээл олдсонгүй.', 'ASSIGNMENT_NOT_FOUND');
  }
  return {
    ...lesson, activityType: 'lesson', status: 'not_started', materialVersion: null,
    materialBlocks: [
      { kind: 'explanation', title: 'Тайлбар', body: lesson.explanation },
      { kind: 'example', title: 'Жишээ', body: lesson.example },
      { kind: 'practice', title: 'Дадлага', body: lesson.practice },
    ].filter((block) => block.body?.trim()).map((block) => ({ ...block, pageLabel: null, available: true })),
    question: null, answerKeyVisible: false, completedSteps: [], readOnly: true, dataNotice,
  };
}

export async function studentProgress(user: AuthenticatedUser) {
  const student = await currentStudent(user);
  const [skills, attempts] = await Promise.all([
    repository.progressSkills(student.id), repository.attemptHistory(student.id),
  ]);
  return serializable({
    skills, attempts,
    dataNotice: 'Чадварын хувь нь сүүлийн хариултыг илүү жинтэйгээр, өмнөх хариултуудтай нийлүүлж бодогддог. Нэг удаагийн сайн дүнгээр эзэмшсэн гэж тооцохгүй.',
  });
}

/**
 * The child's placement and the plan that follows from it.
 *
 * The one screen that shows the school doing what it says it does: a test was
 * sat, it produced a level, and the level names the work. Nothing here is
 * computed on the fly - the level came from a real sitting and the six steps
 * came from the school's own resource map - so a parent reading it is reading
 * the school's decision, not the system's guess.
 *
 * The level is reported with its provenance. A hundred of the hundred and five
 * children who sat the placement have had no writing or speaking assessed, so
 * their level rests on the objective half alone. Saying so on the screen is
 * the difference between a record and a claim.
 */
export async function studentPlacements(user: AuthenticatedUser) {
  const student = await currentStudent(user);
  const placements = await repository.latestPlacement(student.id);
  return Promise.all(placements.map(async (placement) => ({
    subjectCode: placement.subjectCode,
    subjectName: placement.subjectName,
    levelCode: placement.levelCode,
    levelName: placement.levelName,
    score: placement.score,
    maxScore: placement.maxScore,
    attemptedOn: placement.attemptedOn,
    // Objective-only placements are provisional until a teacher marks the
    // writing and speaking tasks; the screen says so rather than implying a
    // confirmed level.
    provisional: placement.answerSource !== "AUTHORITATIVE",
    note: placement.notes,
    steps: await repository.pathwayForLevel(placement.levelId),
  })));
}

/**
 * The child's own record: who the school has them down as, and who it rings.
 *
 * Fields the register never filled in come back null and the screen leaves
 * them out. A profile that lists "Төрсөн огноо: —" teaches a child the system
 * is broken; one that shows six real facts is a record.
 */
export async function studentRecord(user: AuthenticatedUser) {
  const student = await currentStudent(user);
  const [[record], guardians] = await Promise.all([
    repository.studentRecord(student.id),
    repository.guardiansOf(student.id),
  ]);
  if (!record) throw new HttpError(404, 'Идэвхтэй сурагч олдсонгүй.', 'STUDENT_NOT_FOUND');
  return { ...record, guardians };
}

/**
 * The child's own four-week plan, grouped into weeks.
 *
 * Two views of the same four weeks, because they answer different questions.
 * The days are what a child does on Tuesday; the skills are what the week is
 * for. A parent reads the second and a child works from the first.
 *
 * score and status come back untouched. Almost every day is NOT ASSESSED,
 * which is the truth - the plan is written and the term has not been taught -
 * and a screen that filled the gap with a zero would be inventing a mark.
 */
export async function studentStudyPlan(user: AuthenticatedUser) {
  const student = await currentStudent(user);
  const [days, skills] = await Promise.all([
    repository.studyPlanDays(student.id),
    repository.studyPlanWeeks(student.id),
  ]);

  const weeks = new Map<string, {
    subjectCode: string; weekNo: number;
    days: typeof days; skills: typeof skills;
  }>();
  const weekFor = (subjectCode: string, weekNo: number) => {
    const key = `${subjectCode}|${weekNo}`;
    const found = weeks.get(key);
    if (found) return found;
    const created = { subjectCode, weekNo, days: [] as typeof days, skills: [] as typeof skills };
    weeks.set(key, created);
    return created;
  };
  for (const day of days) weekFor(day.subjectCode, day.weekNo).days.push(day);
  for (const skill of skills) weekFor(skill.subjectCode, skill.weekNo).skills.push(skill);

  return [...weeks.values()].sort(
    (left, right) =>
      left.subjectCode.localeCompare(right.subjectCode) || left.weekNo - right.weekNo,
  );
}
