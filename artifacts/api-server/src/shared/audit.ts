import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

/**
 * Records who changed what.
 *
 * audit.change_logs has existed since the first migration and nothing had ever
 * written to it. The first thing that must is a teacher entering a child's
 * level by hand: that figure is a judgement rather than a measurement, and a
 * judgement with no name against it cannot be questioned later.
 *
 * `changedBy` is a username rather than a key, so the record still reads
 * correctly after the account is gone. Writing the log must never be what
 * fails the request that caused it - the change itself is the thing being
 * asked for - so a failure here is logged and swallowed.
 */
export async function recordChange(entry: {
  schemaName: string;
  tableName: string;
  recordPk: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  changedBy: string | null;
  oldData?: unknown;
  newData?: unknown;
}) {
  try {
    await db.execute(sql`
      INSERT INTO audit.change_logs
        (schema_name, table_name, record_pk, action, changed_by, old_data, new_data)
      VALUES (${entry.schemaName}, ${entry.tableName}, ${entry.recordPk}, ${entry.action},
        ${entry.changedBy},
        ${entry.oldData === undefined ? null : JSON.stringify(entry.oldData)}::jsonb,
        ${entry.newData === undefined ? null : JSON.stringify(entry.newData)}::jsonb)`);
  } catch (error) {
    const { logger } = await import("../lib/logger");
    logger.error(
      { err: error instanceof Error ? error.message : String(error), entry },
      "audit log write failed",
    );
  }
}
