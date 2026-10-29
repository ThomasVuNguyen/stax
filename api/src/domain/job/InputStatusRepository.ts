/**
 * Port of domain/job/InputStatusRepository (JpaRepository<InputStatus, String>).
 * Inherited methods: deleteAll(entities) (used), save/saveAll/findById (included for completeness).
 * Note: InputStatus's Java @PrePersist always assigns a new id; save() only does so when id is null.
 */
import { type Param, all, chunk, first, placeholders, stmt } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type InputStatus, TABLE, fromRow, prePersist, toRow } from "../../entities/InputStatus";

/** JPQL `t.jobStatusId = :jobStatusId AND t.user.id = :userId`. */
export async function findAllByUserAndJobStatusId(
  db: D1Database,
  jobStatusId: string,
  userId: string,
): Promise<InputStatus[]> {
  return (await all(db, `SELECT * FROM "${TABLE}" WHERE job_status_id = ? AND user_id = ?`, jobStatusId, userId)).map(
    fromRow,
  );
}

export async function findById(db: D1Database, id: string): Promise<InputStatus | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export function saveStmt(db: D1Database, e: InputStatus): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: InputStatus): Promise<InputStatus> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, entities: InputStatus[]): Promise<InputStatus[]> {
  if (entities.length) await db.batch(entities.map((e) => saveStmt(db, e)));
  return entities;
}

export async function deleteAll(db: D1Database, entities: InputStatus[]): Promise<void> {
  const ids = entities.map((e) => e.id).filter((id): id is string => id != null) as Param[];
  if (!ids.length) return;
  await db.batch(chunk(ids).map((part) => stmt(db, `DELETE FROM "${TABLE}" WHERE id IN ${placeholders(part.length)}`, ...part)));
}

// ---- Added for the job services (not in the Java repository) ----

/** `findAllByUserAndJobStatusId` for many jobs at once (one chunked IN query instead of N). */
export async function findAllByUserAndJobStatusIdIn(
  db: D1Database,
  jobStatusIds: string[],
  userId: string,
): Promise<InputStatus[]> {
  if (!jobStatusIds.length) return [];
  const out: InputStatus[] = [];
  for (const part of chunk(jobStatusIds as Param[], 90)) {
    const rows = await all(
      db,
      `SELECT * FROM "${TABLE}" WHERE job_status_id IN ${placeholders(part.length)} AND user_id = ?`,
      ...part,
      userId,
    );
    out.push(...rows.map(fromRow));
  }
  return out;
}

/** status key -> row count for one job and user (aggregated in SQL; used by the polled endpoint). */
export async function countByStatusForUserAndJobStatusId(
  db: D1Database,
  jobStatusId: string,
  userId: string,
): Promise<Map<number, number>> {
  const rows = await all<{ status: number | null; n: number }>(
    db,
    `SELECT status, COUNT(*) AS n FROM "${TABLE}" WHERE job_status_id = ? AND user_id = ? GROUP BY status`,
    jobStatusId,
    userId,
  );
  return new Map(rows.filter((r) => r.status != null).map((r) => [Number(r.status), Number(r.n)]));
}

/** Same rows as `deleteAll(findAllByUserAndJobStatusId(jobStatusId, userId))`, as one statement. */
export function deleteAllByUserAndJobStatusIdStmt(db: D1Database, jobStatusId: string, userId: string): D1PreparedStatement {
  return stmt(db, `DELETE FROM "${TABLE}" WHERE job_status_id = ? AND user_id = ?`, jobStatusId, userId);
}
