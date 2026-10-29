/**
 * Port of domain/user/UserDeletionStatusRepository (JpaRepository<UserDeletionStatus, String>).
 * PK is `request_id` (field `requestId`). Inherited methods used by Java: save, saveAndFlush (alias).
 */
import { all, first, now } from "../../lib/db";
import { upsertStmt } from "../../entities/EntitySupport";
import {
  ID_COLUMN,
  TABLE,
  type UserDeletionStatus,
  fromRow,
  prePersist,
  toRow,
} from "../../entities/UserDeletionStatus";

export async function findByUserId(db: D1Database, userId: string): Promise<UserDeletionStatus | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE user_id = ? LIMIT 1`, userId);
  return row ? fromRow(row) : null;
}

/** Unfinished deletions requested before `threshold` (Date or ISO string). */
export async function findStaleUserDeletions(
  db: D1Database,
  threshold: Date | string,
): Promise<UserDeletionStatus[]> {
  const t = typeof threshold === "string" ? threshold : threshold.toISOString();
  return (
    await all(db, `SELECT * FROM "${TABLE}" WHERE completed_steps < total_steps AND request_timestamp < ?`, t)
  ).map(fromRow);
}

/** Upsert; requestTimestamp is the @CreationTimestamp (kept on update). */
export function saveStmt(db: D1Database, e: UserDeletionStatus): D1PreparedStatement {
  if (e.requestId == null) prePersist(e);
  if (!e.requestTimestamp) e.requestTimestamp = now();
  return upsertStmt(db, TABLE, toRow(e), ID_COLUMN, ["request_timestamp"]);
}

export async function save(db: D1Database, e: UserDeletionStatus): Promise<UserDeletionStatus> {
  await saveStmt(db, e).run();
  return e;
}

export const saveAndFlush = save;
