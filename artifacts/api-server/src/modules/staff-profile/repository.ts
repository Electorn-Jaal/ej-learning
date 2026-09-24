import { pool, readRows } from "@workspace/db";

export type FieldRow = {
  id: number;
  fieldKey: string;
  labelMn: string;
  columnName: string | null;
  valueKind: string;
  sortOrder: number;
  selfEditable: boolean;
  isActive: boolean;
};

export const fields = (includeHidden: boolean) =>
  readRows<FieldRow>(
    `SELECT id::int, field_key AS "fieldKey", label_mn AS "labelMn",
            column_name AS "columnName", value_kind AS "valueKind",
            sort_order::int AS "sortOrder", self_editable AS "selfEditable",
            is_active AS "isActive"
       FROM core.staff_fields
      WHERE $1::boolean OR is_active
      ORDER BY sort_order, id`,
    [includeHidden],
  );

export type StaffRow = {
  teacherId: number;
  userId: number;
  displayName: string;
  username: string;
  teacherCode: string;
  hasPhoto: boolean;
  subjects: string[];
  classes: string[];
};

/**
 * One member of staff and the two lists a profile page shows beside the
 * fields: what they teach and where.
 *
 * Both are aggregated here rather than fetched per person, because the admin's
 * list wants thirty of these at once and a query per teacher for each is how a
 * page that lists staff becomes a page that times out.
 */
export const staff = (teacherId: number | null) =>
  readRows<StaffRow>(
    `SELECT t.id::int AS "teacherId", u.id::int AS "userId",
            u.display_name AS "displayName", u.username, t.teacher_code AS "teacherCode",
            (u.photo_key IS NOT NULL) AS "hasPhoto",
            COALESCE((
              SELECT array_agg(DISTINCT s.name_mn ORDER BY s.name_mn)
                FROM core.teacher_subjects ts
                JOIN core.subjects s ON s.id = ts.subject_id
               WHERE ts.teacher_id = t.id AND ts.is_active
            ), '{}') AS subjects,
            COALESCE((
              SELECT array_agg(DISTINCT c.name_mn ORDER BY c.name_mn)
                FROM core.class_teachers ct
                JOIN core.classes c ON c.id = ct.class_id AND c.is_active
               WHERE ct.teacher_id = t.id AND ct.is_active
            ), '{}') AS classes
       FROM core.teachers t
       JOIN core.users u ON u.id = t.user_id
      WHERE t.is_active AND u.is_active
        AND ($1::bigint IS NULL OR t.id = $1::bigint)
      ORDER BY u.display_name`,
    [teacherId],
  );

/**
 * Every field value for the staff asked about, whichever home it lives in.
 *
 * The built-in fields are columns of core.teachers and the rest are rows of
 * staff_field_values, so the union is done here in one read rather than by the
 * caller stitching two shapes together. to_jsonb turns the row into something
 * a column name can be looked up in, which is how a definition that names a
 * column finds its value without this query knowing the column list.
 */
export const values = (teacherId: number | null) =>
  readRows<{ teacherId: number; fieldKey: string; value: string | null }>(
    `WITH mine AS (
       SELECT t.id, to_jsonb(t) AS row
         FROM core.teachers t
         JOIN core.users u ON u.id = t.user_id
        WHERE t.is_active AND u.is_active
          AND ($1::bigint IS NULL OR t.id = $1::bigint)
     )
     SELECT mine.id::int AS "teacherId", f.field_key AS "fieldKey",
            CASE WHEN f.column_name IS NULL THEN v.value_text
                 ELSE mine.row ->> f.column_name END AS value
       FROM mine
       CROSS JOIN core.staff_fields f
       LEFT JOIN core.staff_field_values v
         ON v.teacher_id = mine.id AND v.field_id = f.id
      WHERE f.is_active`,
    [teacherId],
  );

export const teacherByUser = (userId: number) =>
  readRows<{ id: number }>(
    `SELECT id::int FROM core.teachers WHERE user_id = $1::bigint AND is_active`,
    [userId],
  );

/** Writes one field, into whichever home its definition names. */
export async function writeValue(teacherId: number, field: FieldRow, value: string | null) {
  if (field.columnName === null) {
    await pool.query(
      `INSERT INTO core.staff_field_values (teacher_id, field_id, value_text)
       VALUES ($1::bigint, $2::bigint, $3)
       ON CONFLICT (teacher_id, field_id)
       DO UPDATE SET value_text = EXCLUDED.value_text, updated_at = now()`,
      [teacherId, field.id, value],
    );
    return;
  }
  // The column name comes from staff_fields, which only an administrator
  // writes, and every built-in row was created by a migration - but it is
  // still interpolated into SQL, so it is checked against the catalogue
  // rather than trusted.
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM information_schema.columns
      WHERE table_schema = 'core' AND table_name = 'teachers' AND column_name = $1`,
    [field.columnName],
  );
  if (rows.length === 0) throw new Error(`No such column: ${field.columnName}`);
  await pool.query(
    `UPDATE core.teachers SET ${field.columnName} = $2 WHERE id = $1::bigint`,
    [teacherId, value],
  );
}

export async function insertField(row: {
  fieldKey: string;
  labelMn: string;
  valueKind: string;
  sortOrder: number;
  selfEditable: boolean;
}) {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO core.staff_fields (field_key, label_mn, value_kind, sort_order, self_editable)
     VALUES ($1, $2, $3, $4, $5) RETURNING id::int`,
    [row.fieldKey, row.labelMn, row.valueKind, row.sortOrder, row.selfEditable],
  );
  return rows[0]!.id;
}

export async function updateField(id: number, patch: {
  labelMn?: string;
  sortOrder?: number;
  selfEditable?: boolean;
  isActive?: boolean;
}) {
  await pool.query(
    `UPDATE core.staff_fields
        SET label_mn = COALESCE($2, label_mn),
            sort_order = COALESCE($3, sort_order),
            self_editable = COALESCE($4, self_editable),
            is_active = COALESCE($5, is_active)
      WHERE id = $1::bigint`,
    [id, patch.labelMn ?? null, patch.sortOrder ?? null,
     patch.selfEditable ?? null, patch.isActive ?? null],
  );
}

export const photoKey = (userId: number) =>
  readRows<{ photoKey: string | null }>(
    `SELECT photo_key AS "photoKey" FROM core.users WHERE id = $1::bigint`,
    [userId],
  );

export async function setPhotoKey(userId: number, key: string) {
  await pool.query(
    `UPDATE core.users SET photo_key = $2, updated_at = now() WHERE id = $1::bigint`,
    [userId, key],
  );
}
