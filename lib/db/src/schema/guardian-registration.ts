import { sql } from 'drizzle-orm';
import { bigint, check, index, text, timestamp, uniqueIndex, varchar } from 'drizzle-orm/pg-core';
import { core, studentsInCore } from './database';
import { usersInCore } from './identity';

/**
 * A parent signing themselves up (UC18, FR27).
 *
 * The school hands a parent a one-time code for one child; the parent uses it
 * to ask for an account; an administrator checks the request and approves it.
 * The code is what keeps the public form from being anyone's to fill in, and
 * only its hash is kept, like a password.
 */
export const guardianInvites = core.table('guardian_invites', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  studentId: bigint('student_id', { mode: 'number' }).notNull().references(() => studentsInCore.id),
  codeHash: varchar('code_hash', { length: 64 }).notNull(),
  createdBy: bigint('created_by', { mode: 'number' }).notNull().references(() => usersInCore.id),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'string' }),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
}, (t) => [
  uniqueIndex('guardian_invites_code_hash_key').on(t.codeHash),
  index('idx_guardian_invites_student').on(t.studentId),
]);

/**
 * What the parent asked for, waiting for an administrator. The password is
 * held as a hash from the moment it arrives; approving creates the account
 * with it, so nobody ever reads or resets it on the parent's behalf.
 */
export const guardianRequests = core.table('guardian_requests', {
  id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  inviteId: bigint('invite_id', { mode: 'number' }).notNull().references(() => guardianInvites.id),
  studentId: bigint('student_id', { mode: 'number' }).notNull().references(() => studentsInCore.id),
  username: varchar({ length: 50 }).notNull(),
  displayName: varchar('display_name', { length: 300 }).notNull(),
  relationMn: varchar('relation_mn', { length: 40 }),
  passwordHash: text('password_hash').notNull(),
  status: varchar({ length: 10 }).default('PENDING').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  decidedBy: bigint('decided_by', { mode: 'number' }).references(() => usersInCore.id),
  decidedAt: timestamp('decided_at', { withTimezone: true, mode: 'string' }),
  decisionNote: text('decision_note').default('').notNull(),
  userId: bigint('user_id', { mode: 'number' }).references(() => usersInCore.id),
}, (t) => [
  check('guardian_requests_status_check', sql`status IN ('PENDING','APPROVED','REJECTED')`),
  index('idx_guardian_requests_status').on(t.status),
]);
