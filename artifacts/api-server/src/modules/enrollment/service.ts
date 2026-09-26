import type { AuthenticatedUser } from "../identity/service";
import { badRequest, conflict, notFound } from "../../shared/http-error";
import { todayInUlaanbaatar, validIsoDate } from "../../shared/school-date";
import * as repository from "./repository";

/**
 * Moving children between classes (FR28) and a school year up (FR29).
 *
 * Administrator only for now: the manager role these belong to in the
 * requirements does not exist until D05 is decided. What is deliberately not
 * done here, because it is still open with the school: nothing a child left
 * unfinished is carried into the new class or year (D07, D08), and a graduate's
 * account is left exactly as it was (D09). Their answers, marks and attendance
 * are keyed to the child, not the class, so every move leaves them in place.
 */

function day(value: string, field: string) {
  if (!validIsoDate(value)) throw badRequest(`${field} буруу байна.`, "INVALID_DATE");
  return value;
}

export async function overview() {
  const [classes, teachers] = await Promise.all([repository.classes(), repository.teachers()]);
  const schoolYears = [...new Set(classes.map((c) => c.schoolYear))];
  return { classes, teachers, schoolYears };
}

export const searchStudents = (q: string) => repository.searchStudents(q.trim());

export const history = (studentId: number | null) => repository.history(studentId);

export async function transfer(
  user: AuthenticatedUser,
  input: { studentId: number; toClassId: number; effectiveOn: string; reason: string },
) {
  const effectiveOn = day(input.effectiveOn, "Огноо");
  // A move is recorded when it happens. Scheduling one for next month would
  // need a job to carry it out, and a register that is wrong until then.
  if (effectiveOn > todayInUlaanbaatar()) {
    throw badRequest("Ирээдүйн огноогоор шилжүүлэхгүй. Шилжих өдөр нь бүртгэнэ үү.", "FUTURE_DATE");
  }
  if (!(await repository.activeStudent(input.studentId))[0]) {
    throw notFound("Идэвхтэй сурагч олдсонгүй.", "STUDENT_NOT_FOUND");
  }
  const [target] = await repository.activeClass(input.toClassId);
  if (!target) throw notFound("Идэвхтэй анги олдсонгүй.", "CLASS_NOT_FOUND");

  const client = await repository.pool.connect();
  let id: number;
  try {
    await client.query("BEGIN");
    const current = await repository.currentClassOf(client, input.studentId);
    if (current?.classId === target.id) {
      throw conflict("Сурагч аль хэдийн энэ ангид байна.", "ALREADY_IN_CLASS");
    }
    id = await repository.moveStudent(client, {
      studentId: input.studentId, toClassId: target.id, kind: "TRANSFER", effectiveOn,
      reason: input.reason.trim(), userId: user.id, fromClassId: current?.classId ?? null,
    });
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return (await repository.change(id))[0]!;
}

export async function setClassTeacher(
  user: AuthenticatedUser,
  input: { classId: number; teacherId: number | null; effectiveOn: string },
) {
  const effectiveOn = day(input.effectiveOn, "Огноо");
  if (!(await repository.activeClass(input.classId))[0]) throw notFound("Идэвхтэй анги олдсонгүй.", "CLASS_NOT_FOUND");
  if (input.teacherId !== null && !(await repository.teacher(input.teacherId))[0]) {
    throw notFound("Идэвхтэй багш олдсонгүй.", "TEACHER_NOT_FOUND");
  }
  await repository.setClassTeacher({ ...input, effectiveOn, userId: user.id });
  const row = (await repository.classes()).find((c) => c.classId === input.classId);
  return row!;
}

/** 2026-2027 -> 2027-2028. */
export function nextYear(schoolYear: string) {
  const m = /^(\d{4})-(\d{4})$/.exec(schoolYear);
  if (!m || Number(m[2]) !== Number(m[1]) + 1) throw badRequest("Хичээлийн жил буруу байна.", "INVALID_YEAR");
  return `${Number(m[1]) + 1}-${Number(m[2]) + 1}`;
}

/**
 * Next year's name for a class: the leading grade goes up by one, the rest is
 * kept - "9а" becomes "10а", "6а-1" becomes "7а-1". A name that does not start
 * with its own grade ("10-12 сонгон") cannot be moved by rule and is left for
 * the administrator.
 */
export function promotedName(className: string, gradeLevel: number, step: 0 | 1) {
  // The grade must be followed by a letter: "10-12 сонгон" is a group spanning
  // grades, not class 10 named "-12 сонгон".
  const m = /^(\d{1,2})(\p{L}.*)$/u.exec(className.trim());
  if (!m || Number(m[1]) !== gradeLevel) return null;
  return `${gradeLevel + step}${m[2]}`;
}

export async function promotionPreview(fromYear: string) {
  const toYear = nextYear(fromYear);
  const [roster, existing] = await Promise.all([repository.yearRoster(fromYear), repository.classesInYear(toYear)]);
  const have = new Set(existing.map((c) => c.name));
  const rows = roster.map((r) => {
    if (r.gradeLevel >= 12) return { studentId: r.studentId, name: r.name, fromClass: r.className, gradeLevel: r.gradeLevel, proposed: "GRADUATE" as const, toClass: null };
    const toClass = promotedName(r.className, r.gradeLevel, 1);
    return { studentId: r.studentId, name: r.name, fromClass: r.className, gradeLevel: r.gradeLevel,
      proposed: toClass ? "PROMOTE" as const : "MANUAL" as const, toClass };
  });
  const newClasses = [...new Set(rows.flatMap((r) => r.toClass && !have.has(r.toClass) ? [r.toClass] : []))];
  return { fromYear, toYear, rows, newClasses };
}

/**
 * Applies the year in one transaction (NFR03): either every child listed moves,
 * or none does. A child already enrolled in next year's class is skipped, so
 * running it twice does not move anybody twice.
 */
export async function applyPromotion(
  user: AuthenticatedUser,
  input: { fromYear: string; effectiveOn: string; decisions: { studentId: number; action: "PROMOTE" | "REPEAT" | "GRADUATE" | "SKIP" }[] },
) {
  const effectiveOn = day(input.effectiveOn, "Огноо");
  const toYear = nextYear(input.fromYear);
  const roster = new Map((await repository.yearRoster(input.fromYear)).map((r) => [r.studentId, r]));
  const seen = new Set<number>();
  for (const d of input.decisions) {
    if (seen.has(d.studentId)) throw badRequest("Нэг сурагч давхар байна.", "DUPLICATE_STUDENT");
    seen.add(d.studentId);
    const r = roster.get(d.studentId);
    if (!r) throw badRequest("Энэ жилийн идэвхтэй ангид байхгүй сурагч байна.", "STUDENT_NOT_IN_YEAR");
    if (d.action === "PROMOTE" && (r.gradeLevel >= 12 || !promotedName(r.className, r.gradeLevel, 1))) {
      throw badRequest(`${r.name}: дараагийн ангийг нэрээр нь тодорхойлж чадсангүй.`, "CANNOT_PROMOTE");
    }
    if (d.action === "REPEAT" && !promotedName(r.className, r.gradeLevel, 0)) {
      throw badRequest(`${r.name}: ангийн нэрээс анги тодорхойлж чадсангүй.`, "CANNOT_REPEAT");
    }
    if (d.action === "GRADUATE" && r.gradeLevel < 12) {
      throw badRequest(`${r.name}: зөвхөн 12-р анги төгсөнө.`, "NOT_FINAL_GRADE");
    }
  }

  const result = { toYear, promoted: 0, repeated: 0, graduated: 0, skipped: 0, createdClasses: [] as string[] };
  const client = await repository.pool.connect();
  try {
    await client.query("BEGIN");
    const target = new Map<string, number>();
    for (const row of (await client.query<{ id: number; name: string }>(
      `SELECT id::int AS id, name_mn AS name FROM core.classes WHERE school_year = $1 AND is_active FOR UPDATE`, [toYear])).rows) {
      target.set(row.name, row.id);
    }
    const classFor = async (name: string, grade: number) => {
      const found = target.get(name);
      if (found) return found;
      const { rows: [made] } = await client.query<{ id: number }>(
        `INSERT INTO core.classes (class_code, grade_level_id, name_mn, school_year)
         SELECT $1, gl.id, $2, $3 FROM core.grade_levels gl WHERE gl.grade_number = $4
         RETURNING id::int AS id`, [`${toYear}-${name}`, name, toYear, grade]);
      if (!made) throw badRequest(`${grade}-р анги бүртгэлд алга.`, "GRADE_NOT_FOUND");
      target.set(name, made.id);
      result.createdClasses.push(name);
      return made.id;
    };
    for (const d of input.decisions) {
      const r = roster.get(d.studentId)!;
      if (d.action === "SKIP") { result.skipped++; continue; }
      const current = await repository.currentClassOf(client, d.studentId);
      if (current && current.schoolYear === toYear) { result.skipped++; continue; }
      if (d.action === "GRADUATE") {
        await repository.moveStudent(client, { studentId: d.studentId, toClassId: null, kind: "GRADUATE",
          effectiveOn, reason: "", userId: user.id, fromClassId: r.classId });
        result.graduated++;
        continue;
      }
      const step = d.action === "PROMOTE" ? 1 : 0;
      const name = promotedName(r.className, r.gradeLevel, step)!;
      const toClassId = await classFor(name, r.gradeLevel + step);
      await repository.moveStudent(client, { studentId: d.studentId, toClassId, kind: d.action,
        effectiveOn, reason: "", userId: user.id, fromClassId: r.classId });
      if (step) result.promoted++; else result.repeated++;
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return result;
}
