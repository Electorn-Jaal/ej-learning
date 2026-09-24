/**
 * Fills the staff register into core.teachers, creating the rows it needs.
 *
 * Dry-run (default): pnpm --filter @workspace/api-server import-teacher-details
 * Apply:             pnpm --filter @workspace/api-server import-teacher-details -- --apply --yes
 *
 * "Багш нарын бүртгэл 2026-2027.xlsx" is the school's staff list, and it is a
 * STAFF list rather than a teacher list: the director, the training manager,
 * the doctor and the accountant are on it beside the twenty-four teachers.
 * The first import took only the names of the people who teach, so everything
 * else sat in the file while a teacher's own page had nothing to show, and
 * six members of staff were not in the system at all.
 *
 * What it takes, column by column:
 *
 *   Албан тушаал            -> job_title_mn     what they are called
 *   Ажлын байрны ангилал    -> speciality_mn    what they are classified as
 *   Газар, хэлтэс           -> department_mn    which part of the school
 *   Имэйл хаяг              -> email            the first address listed
 *   Утасны дугаар           -> phone            the first number listed
 *   №                       -> teacher_code     EJ-2627-Tnnn, as before
 *
 * What it deliberately leaves behind:
 *
 *   Регистр   A national identity number. Nothing in this product needs it,
 *             and a register of children's teachers is not a place to keep
 *             one for a use nobody has named yet.
 *   Төлөв, Баталгаажилт     Every row says Идэвхтэй / Батлагдсан. A column
 *             with one value records nothing.
 *
 * Several people list two or three addresses and two numbers. The first is
 * taken and the rest dropped rather than joined with a comma: a field holding
 * "a@b, c@d" is not an email address, and nothing here can send to two anyway.
 *
 * Three things this does beyond filling columns, because the register says the
 * people exist and the system disagreed:
 *
 *   - a member of staff with an account but no core.teachers row gets one,
 *     with no subject attached. That is already a supported shape - the column
 *     is nullable for exactly this - and it is what lets the director have a
 *     profile page. It does not put them in front of a class: class lists are
 *     built from core.class_teachers, which this never writes.
 *   - a row deactivated earlier is reactivated when the register still lists
 *     the person. The register is the school's own current answer.
 *   - somebody with no account at all gets one, and the password is written to
 *     a file beside the other password lists. Their username follows the same
 *     ej26tNNN series as the rest of the staff.
 */
import path from "node:path";
import { randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pool } from "@workspace/db";
import { hashPassword } from "../src/shared/password";

const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--yes")) throw new Error("Refusing apply without --yes.");

const extracted = path.resolve(process.cwd(), "../../local-data/extracted/staff-register.json");
const generatedDir = path.resolve(process.cwd(), "../../local-data/generated");

type Row = Record<string, string>;

/** The first address or number in a cell that may list several. */
const first = (value: string | undefined) => {
  const head = (value ?? "").split(/[,;\n]/)[0]?.trim() ?? "";
  return head === "" ? null : head;
};

const clean = (value: string | undefined) => {
  const text = (value ?? "").trim();
  return text === "" ? null : text;
};

/** Same alphabet and shape as the roster reset, for the same reason. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const newPassword = () => {
  const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
  return `${group()}-${group()}-${group()}`;
};

/**
 * One name the register writes differently from the roster.
 *
 * Two staff records for the same person were merged earlier and the surviving
 * spelling is the shorter one. The register was not reissued, so the join has
 * to know about it rather than reporting a teacher who is plainly there.
 */
const ALIAS: Record<string, string> = { "Т.Эрдэнээ": "Т.Эрдэнэ" };

const rows: Row[] = JSON.parse(await readFile(extracted, "utf8"));
console.log(`${rows.length} мөр уншлаа.`);

const client = await pool.connect();
try {
  const { rows: people } = await client.query<{
    userId: string; teacherId: string | null; name: string;
    userActive: boolean; teacherActive: boolean | null;
  }>(
    `SELECT u.id::text AS "userId", t.id::text AS "teacherId", u.display_name AS name,
            u.is_active AS "userActive", t.is_active AS "teacherActive"
       FROM core.users u
       LEFT JOIN core.teachers t ON t.user_id = u.id
      WHERE u.student_id IS NULL`,
  );
  const byName = new Map<string, typeof people>();
  for (const person of people) {
    byName.set(person.name, [...(byName.get(person.name) ?? []), person]);
  }

  const { rows: [serial] } = await client.query<{ next: number }>(
    `SELECT COALESCE(max(substring(username FROM 'ej26t([0-9]+)')::int), 0) + 1 AS next
       FROM core.users WHERE username ~ '^ej26t[0-9]+$'`,
  );
  let nextSerial = serial?.next ?? 1;

  type Plan = {
    name: string;
    code: string;
    fields: Record<string, string | null>;
    action: "update" | "add-teacher-row" | "reactivate" | "create-account";
    userId: string | null;
    teacherId: string | null;
  };

  const plans: Plan[] = [];
  const ambiguous: string[] = [];

  for (const row of rows) {
    const name = clean(row["Нэр"]);
    if (!name) continue;
    const resolved = ALIAS[name] ?? name;
    const number = Number(clean(row["№"]) ?? "0");
    const code = `EJ-2627-T${String(Math.round(number)).padStart(3, "0")}`;
    const fields = {
      job_title_mn: clean(row["Албан тушаал"]),
      speciality_mn: clean(row["Ажлын байрны ангилал"]),
      department_mn: clean(row["Газар, хэлтэс"]),
      email: first(row["Имэйл хаяг"]),
      phone: first(row["Утасны дугаар"]),
    };

    const found = byName.get(resolved) ?? [];
    // Prefer the live record where a deactivated duplicate survives a merge.
    const live = found.find((person) => person.userActive && person.teacherActive)
      ?? found.find((person) => person.userActive)
      ?? found[0];

    if (found.length > 1 && found.filter((p) => p.userActive).length > 1) {
      ambiguous.push(name);
      continue;
    }

    if (!live) {
      plans.push({ name: resolved, code, fields, action: "create-account", userId: null, teacherId: null });
    } else if (live.teacherId === null) {
      plans.push({ name: resolved, code, fields, action: "add-teacher-row", userId: live.userId, teacherId: null });
    } else if (!live.teacherActive || !live.userActive) {
      plans.push({ name: resolved, code, fields, action: "reactivate", userId: live.userId, teacherId: live.teacherId });
    } else {
      plans.push({ name: resolved, code, fields, action: "update", userId: live.userId, teacherId: live.teacherId });
    }
  }

  const count = (action: Plan["action"]) => plans.filter((p) => p.action === action).length;
  console.log(`Шинэчлэх: ${count("update")}`);
  console.log(`Багшийн мөр нэмэх: ${count("add-teacher-row")}`
    + (count("add-teacher-row") ? ` — ${plans.filter((p) => p.action === "add-teacher-row").map((p) => p.name).join(", ")}` : ""));
  console.log(`Дахин идэвхжүүлэх: ${count("reactivate")}`
    + (count("reactivate") ? ` — ${plans.filter((p) => p.action === "reactivate").map((p) => p.name).join(", ")}` : ""));
  console.log(`Шинэ бүртгэл: ${count("create-account")}`
    + (count("create-account") ? ` — ${plans.filter((p) => p.action === "create-account").map((p) => p.name).join(", ")}` : ""));
  if (ambiguous.length) console.log(`Нэр давхардсан: ${ambiguous.join(", ")}`);

  if (!apply) {
    console.log("\nТуршилт. Бичихдээ --apply --yes нэм.");
  } else {
    const issued: { name: string; code: string; username: string; password: string }[] = [];
    await client.query("BEGIN");
    try {
      for (const plan of plans) {
        let teacherId = plan.teacherId;
        let userId = plan.userId;

        if (plan.action === "create-account") {
          const username = `ej26t${String(nextSerial).padStart(3, "0")}`;
          nextSerial += 1;
          const password = newPassword();
          const { rows: [created] } = await client.query<{ id: string }>(
            `INSERT INTO core.users (username, password_hash, display_name)
             VALUES ($1, $2, $3) RETURNING id::text`,
            [username, await hashPassword(password), plan.name],
          );
          userId = created!.id;
          await client.query(
            `INSERT INTO core.user_roles (user_id, role) VALUES ($1::bigint, 'TEACHER')
             ON CONFLICT DO NOTHING`, [userId]);
          issued.push({ name: plan.name, code: plan.code, username, password });
        }

        if (teacherId === null) {
          const { rows: [created] } = await client.query<{ id: string }>(
            `INSERT INTO core.teachers (user_id, teacher_code, data_origin)
             VALUES ($1::bigint, $2, 'REAL')
             ON CONFLICT (teacher_code) DO UPDATE SET user_id = EXCLUDED.user_id
             RETURNING id::text`,
            [userId, plan.code],
          );
          teacherId = created!.id;
        }

        if (plan.action === "reactivate") {
          await client.query(`UPDATE core.users SET is_active = true WHERE id = $1::bigint`, [userId]);
          await client.query(`UPDATE core.teachers SET is_active = true WHERE id = $1::bigint`, [teacherId]);
        }

        await client.query(
          `UPDATE core.teachers
              SET job_title_mn = COALESCE($2, job_title_mn),
                  speciality_mn = COALESCE($3, speciality_mn),
                  department_mn = COALESCE($4, department_mn),
                  email = COALESCE($5, email),
                  phone = COALESCE($6, phone)
            WHERE id = $1::bigint`,
          [teacherId, plan.fields.job_title_mn, plan.fields.speciality_mn,
           plan.fields.department_mn, plan.fields.email, plan.fields.phone],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }

    if (issued.length) {
      await mkdir(generatedDir, { recursive: true });
      const stamp = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date());
      const file = path.join(generatedDir, `new-staff-passwords-${stamp}.csv`);
      await writeFile(file,
        ["Багшийн код,Нэр,Нэвтрэх нэр,Нууц үг",
         ...issued.map((a) => `${a.code},${a.name},${a.username},${a.password}`)].join("\n") + "\n",
        { mode: 0o600 });
      console.log(`\nШинэ бүртгэлийн нууц үг: ${path.relative(path.resolve(process.cwd(), "../.."), file)}`);
    }
    console.log(`\nБичигдлээ: ${plans.length} ажилтан.`);
  }
} finally {
  client.release();
  await pool.end();
}
