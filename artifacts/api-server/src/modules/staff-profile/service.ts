import path from "node:path";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { badRequest, forbidden, notFound } from "../../shared/http-error";
import type { AuthenticatedUser } from "../identity/service";
import * as repository from "./repository";

/**
 * A member of staff, as their own page and the school's register see them.
 *
 * The fields are not hard-coded here. core.staff_fields says what a profile
 * consists of, what each part is called and where its value lives, so a school
 * that renames "Албан тушаал" or adds "Боловсрол" changes rows rather than
 * waiting for a release. Everything below reads that list.
 */
const isAdmin = (user: AuthenticatedUser) => user.roles.includes("ADMIN");

/** Where photographs live, beside the textbooks. */
const storageRoot = () =>
  path.resolve(process.env.EJ_STORAGE_DIR ?? path.resolve(process.cwd(), "storage"));

const PHOTO_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function fieldList(user: AuthenticatedUser) {
  // A teacher is shown the fields their page renders; an administrator is also
  // shown the ones that have been switched off, because turning one back on is
  // something only they can do and they cannot do it blind.
  return repository.fields(isAdmin(user));
}

async function assemble(teacherId: number | null) {
  const [people, definitions, cells] = await Promise.all([
    repository.staff(teacherId),
    repository.fields(false),
    repository.values(teacherId),
  ]);

  const byTeacher = new Map<number, Map<string, string | null>>();
  for (const cell of cells) {
    const found = byTeacher.get(cell.teacherId) ?? new Map<string, string | null>();
    found.set(cell.fieldKey, cell.value);
    byTeacher.set(cell.teacherId, found);
  }

  return people.map((person) => ({
    teacherId: person.teacherId,
    userId: person.userId,
    displayName: person.displayName,
    username: person.username,
    teacherCode: person.teacherCode,
    // A URL rather than the key: the key is where the file sits on disk and
    // nothing outside this module has any business knowing that.
    photoUrl: person.hasPhoto ? `/api/staff/${person.teacherId}/photo` : null,
    subjects: person.subjects,
    classes: person.classes,
    fields: definitions.map((field) => ({
      fieldKey: field.fieldKey,
      labelMn: field.labelMn,
      valueKind: field.valueKind,
      selfEditable: field.selfEditable,
      value: byTeacher.get(person.teacherId)?.get(field.fieldKey) ?? null,
    })),
  }));
}

/** The whole staff, for the administrator's register. */
export async function staffList(user: AuthenticatedUser) {
  if (!isAdmin(user)) throw forbidden("Зөвхөн админ харна.", "ADMIN_ONLY");
  return assemble(null);
}

/**
 * One profile.
 *
 * A member of staff may read their own; an administrator may read anybody's.
 * Nobody else may read any: a staff record carries a telephone number and a
 * home department, which is not something one teacher is owed about another
 * merely because they work in the same school.
 */
export async function profile(user: AuthenticatedUser, teacherId: number | null) {
  const own = user.teacherId ?? (await repository.teacherByUser(user.id))[0]?.id ?? null;
  const wanted = teacherId ?? own;
  if (wanted === null) throw notFound("Ажилтны бүртгэл олдсонгүй.", "NO_STAFF_RECORD");
  if (wanted !== own && !isAdmin(user)) {
    throw forbidden("Өөр хүний бүртгэлийг харах эрхгүй.", "NOT_YOUR_RECORD");
  }
  const [found] = await assemble(wanted);
  if (!found) throw notFound("Ажилтны бүртгэл олдсонгүй.", "NO_STAFF_RECORD");
  return found;
}

/**
 * Writes what the caller is allowed to write, and says so when they are not.
 *
 * An administrator writes anything. A member of staff writes only the fields
 * marked self_editable on their own record - their telephone number, when they
 * started - because a job title is a decision the school made about them and
 * not a preference.
 */
export async function saveProfile(
  user: AuthenticatedUser,
  teacherId: number | null,
  patch: Record<string, string | null>,
) {
  const own = user.teacherId ?? (await repository.teacherByUser(user.id))[0]?.id ?? null;
  const wanted = teacherId ?? own;
  if (wanted === null) throw notFound("Ажилтны бүртгэл олдсонгүй.", "NO_STAFF_RECORD");
  const admin = isAdmin(user);
  if (wanted !== own && !admin) {
    throw forbidden("Өөр хүний бүртгэлийг засах эрхгүй.", "NOT_YOUR_RECORD");
  }

  const definitions = await repository.fields(false);
  const byKey = new Map(definitions.map((field) => [field.fieldKey, field]));

  for (const [key, raw] of Object.entries(patch)) {
    const field = byKey.get(key);
    if (!field) throw badRequest(`Ийм талбар алга: ${key}`, "NO_SUCH_FIELD");
    if (!admin && !field.selfEditable) {
      throw forbidden(`"${field.labelMn}" талбарыг зөвхөн админ засна.`, "ADMIN_ONLY_FIELD");
    }
    const value = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : null;
    if (field.valueKind === "DATE" && value !== null && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw badRequest(`"${field.labelMn}" огноо буруу байна.`, "INVALID_DATE");
    }
    await repository.writeValue(wanted, field, value);
  }

  return profile(user, wanted);
}

/** The school renames a field, moves it, or puts it away. */
export async function editField(
  user: AuthenticatedUser,
  id: number,
  patch: { labelMn?: string; sortOrder?: number; selfEditable?: boolean; isActive?: boolean },
) {
  if (!isAdmin(user)) throw forbidden("Зөвхөн админ засна.", "ADMIN_ONLY");
  const [field] = (await repository.fields(true)).filter((row) => row.id === id);
  if (!field) throw notFound("Талбар олдсонгүй.", "NO_SUCH_FIELD");
  if (patch.isActive === false && field.columnName !== null) {
    throw badRequest(
      "Бүртгэлийн үндсэн талбарыг нуух боломжгүй. Нэрийг нь өөрчилж болно.",
      "BUILTIN_FIELD",
    );
  }
  if (patch.labelMn !== undefined && patch.labelMn.trim() === "") {
    throw badRequest("Талбарын нэр хоосон байж болохгүй.", "EMPTY_LABEL");
  }
  await repository.updateField(id, { ...patch, labelMn: patch.labelMn?.trim() });
  return repository.fields(true);
}

/** The school adds a field of its own. */
export async function addField(
  user: AuthenticatedUser,
  input: { labelMn: string; valueKind: string; selfEditable: boolean },
) {
  if (!isAdmin(user)) throw forbidden("Зөвхөн админ нэмнэ.", "ADMIN_ONLY");
  const label = input.labelMn.trim();
  if (label === "") throw badRequest("Талбарын нэр хоосон байна.", "EMPTY_LABEL");

  const existing = await repository.fields(true);
  // A key the code can refer to, derived from the label and made unique. The
  // label is Mongolian and may be renamed tomorrow; the key never changes.
  const base = `custom_${existing.length + 1}`;
  let key = base;
  for (let n = 2; existing.some((row) => row.fieldKey === key); n += 1) key = `${base}_${n}`;

  const sortOrder = Math.max(100, ...existing.map((row) => row.sortOrder)) + 10;
  await repository.insertField({
    fieldKey: key,
    labelMn: label,
    valueKind: input.valueKind,
    sortOrder,
    selfEditable: input.selfEditable,
  });
  return repository.fields(true);
}

/**
 * Stores a photograph, replacing whatever was there.
 *
 * One file per person, named after their account, so a second upload leaves no
 * orphan behind. The extension follows the content type rather than a filename
 * the browser supplied, because that is the part the server actually checked.
 */
export async function savePhoto(
  user: AuthenticatedUser,
  teacherId: number | null,
  file: { bytes: Buffer; contentType: string },
) {
  const own = user.teacherId ?? (await repository.teacherByUser(user.id))[0]?.id ?? null;
  const wanted = teacherId ?? own;
  if (wanted === null) throw notFound("Ажилтны бүртгэл олдсонгүй.", "NO_STAFF_RECORD");
  if (wanted !== own && !isAdmin(user)) {
    throw forbidden("Өөр хүний зургийг солих эрхгүй.", "NOT_YOUR_RECORD");
  }

  const extension = PHOTO_TYPES[file.contentType];
  if (!extension) throw badRequest("Зөвхөн JPEG, PNG, WebP зураг.", "UNSUPPORTED_IMAGE");
  if (file.bytes.length === 0) throw badRequest("Зураг ирсэнгүй.", "NO_BODY");

  const [person] = await repository.staff(wanted);
  if (!person) throw notFound("Ажилтны бүртгэл олдсонгүй.", "NO_STAFF_RECORD");

  const key = path.posix.join("avatars", `${person.userId}.${extension}`);
  const target = path.resolve(storageRoot(), key);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, file.bytes);
  await repository.setPhotoKey(person.userId, key);
  return { photoUrl: `/api/staff/${wanted}/photo` };
}

/**
 * Resolves a stored photograph, refusing anything that escapes the root.
 *
 * The same rule the textbooks are served under: photo_key is a database value
 * rather than user input, but serving arbitrary files off the host is not a
 * failure worth risking on trust alone.
 */
export async function photoFile(teacherId: number) {
  const [person] = await repository.staff(teacherId);
  if (!person) return null;
  const [row] = await repository.photoKey(person.userId);
  if (!row?.photoKey) return null;

  const root = storageRoot();
  const resolved = path.resolve(root, row.photoKey);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  try {
    const info = await stat(resolved);
    if (!info.isFile()) return null;
  } catch {
    return null;
  }
  const extension = path.extname(resolved).slice(1).toLowerCase();
  const mimeType = Object.entries(PHOTO_TYPES).find(([, ext]) => ext === extension)?.[0]
    ?? "application/octet-stream";
  return { filePath: resolved, mimeType };
}

/**
 * What a child may read about their teacher.
 *
 * Narrower than the staff record on purpose. A profile carries a telephone
 * number, an address and whatever else the school has chosen to record, and a
 * class of twelve-year-olds is not the audience for any of it. This is the
 * card: the name, the face, and what the person is employed as.
 *
 * An allowlist rather than a flag on each field, because the school adds
 * fields without being asked and the safe default for a field nobody has
 * thought about is that a child does not see it.
 */
const CHILD_VISIBLE = ["job_title", "speciality", "department", "rank"];

export async function teacherCard(teacherId: number) {
  const [person] = await repository.staff(teacherId);
  if (!person) throw notFound("Багшийн бүртгэл олдсонгүй.", "NO_STAFF_RECORD");

  const [definitions, cells] = await Promise.all([
    repository.fields(false),
    repository.values(teacherId),
  ]);
  const byKey = new Map(cells.map((cell) => [cell.fieldKey, cell.value]));

  return {
    teacherId: person.teacherId,
    displayName: person.displayName,
    photoUrl: person.hasPhoto ? `/api/staff/${person.teacherId}/photo` : null,
    subjects: person.subjects,
    classes: person.classes,
    fields: definitions
      .filter((field) => CHILD_VISIBLE.includes(field.fieldKey))
      .map((field) => ({ labelMn: field.labelMn, value: byKey.get(field.fieldKey) ?? null }))
      .filter((field) => field.value !== null),
  };
}
