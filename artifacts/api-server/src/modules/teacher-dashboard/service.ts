import { todayInUlaanbaatar } from "../../shared/school-date";
import type { AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";

export async function teacherDashboard(user: AuthenticatedUser) {
  const classes = await repository.teacherClasses(
    user.teacherId,
    user.roles.includes("ADMIN"),
  );
  const onDate = todayInUlaanbaatar();
  const rows = await Promise.all(
    classes.map(async (klass) => {
      const [framework] = await repository.frameworkOfSubject(klass.subjectId);
      const levelled = Boolean(framework?.framework);
      const [[lesson], [counts], attention] = await Promise.all([
        repository.classLessonToday(klass.classId, onDate, klass.subjectId),
        repository.classCounts(klass.classId, onDate),
        repository.classAttention(klass.classId, onDate, levelled),
      ]);
      return {
        ...klass,
        levelFramework: framework?.framework ?? null,
        lessonCode: lesson?.lessonCode ?? null,
        skillName: lesson?.skillName ?? null,
        pageFrom: lesson?.pageFrom ?? null,
        pageTo: lesson?.pageTo ?? null,
        studentCount: counts?.studentCount ?? 0,
        answeredToday: counts?.answeredToday ?? 0,
        attention,
      };
    }),
  );
  return {
    teacherName: user.displayName,
    dateLabel: new Intl.DateTimeFormat("mn-MN", {
      dateStyle: "long",
      timeZone: "Asia/Ulaanbaatar",
    }).format(new Date(`${onDate}T00:00:00Z`)),
    classes: rows,
  };
}

/**
 * The Google Workspace panel, which describes a connection nobody has made.
 *
 * Every figure in it is a zero and every status is "not_connected", which is
 * the honest state: PostgreSQL is the system of record and no Google account
 * has been linked. It is a fixed description rather than a query because
 * there is nothing yet to query.
 */
export const workspaceIntegration = () => ({
  mode: 'not_connected', systemOfRecord: 'EJ Learning PostgreSQL',
  principle: 'Үндсэн бүртгэл PostgreSQL-д байна. Google-ийн бодит холболт хийгдээгүй.',
  sources: [
    { source: 'classroom', role: 'Анги, сурагчийн холбоос' },
    { source: 'sheets', role: 'Материал, асуултын импорт' },
    { source: 'drive', role: 'Эх материалын файл' },
    { source: 'forms', role: 'Нэмэлт оношилгооны эх сурвалж' },
  ].map((source) => ({ ...source, status: source.source === 'forms' ? 'optional' : 'not_connected', recordCount: 0, lastSyncAt: null })),
  entities: [
    { name: 'Сурагч ба анги', ownership: 'postgresql', fields: ['core.students', 'core.classes', 'core.student_enrollments'], relation: 'Сурагч → ангийн бүртгэл' },
    { name: 'Импорт', ownership: 'postgresql', fields: ['staging.import_jobs', 'staging.import_rows'], relation: 'Эх сурвалж → шалгах мөр → баталгаажуулалт' },
    { name: 'Эх материал', ownership: 'postgresql', fields: ['content.source_materials', 'content.source_versions'], relation: 'Материал → файлын хувилбар' },
  ],
  pipeline: ['Эх сурвалж', 'Ноорог импорт', 'Шалгалт', 'Баталгаажуулалт', 'Сургалтын материал'],
  courses: [], importBatches: [], auditEvents: [], dataNotice: 'Google account холбогдоогүй.',
});
