/**
 * Port of domain/job/BulkUploadJobStatusRepository (JpaRepository<BulkUploadJobStatus, String>).
 * Inherited methods: deleteAll(entities) (used), save/saveAll/findById (included for completeness).
 */
import { type Param, all, chunk, first, placeholders, run, stmt } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import {
  type BulkUploadJobStatus,
  TABLE,
  fromRow,
  prePersist,
  toRow,
} from "../../entities/BulkUploadJobStatus";

export async function findAllByUserAndJobId(
  db: D1Database,
  jobId: string,
  userId: string,
): Promise<BulkUploadJobStatus[]> {
  return (await all(db, `SELECT * FROM "${TABLE}" WHERE job_status_id = ? AND user_id = ?`, jobId, userId)).map(fromRow);
}

export async function findAllByUserAndJobStatusId(
  db: D1Database,
  jobStatusId: string,
  userId: string,
): Promise<BulkUploadJobStatus[]> {
  return (await all(db, `SELECT * FROM "${TABLE}" WHERE job_status_id = ? AND user_id = ?`, jobStatusId, userId)).map(
    fromRow,
  );
}

/** Derived delete (no JPA cascades on this entity). */
export async function deleteByUserId(db: D1Database, userId: string): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE user_id = ?`, userId);
}

export async function findById(db: D1Database, id: string): Promise<BulkUploadJobStatus | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export function saveStmt(db: D1Database, e: BulkUploadJobStatus): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: BulkUploadJobStatus): Promise<BulkUploadJobStatus> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, entities: BulkUploadJobStatus[]): Promise<BulkUploadJobStatus[]> {
  if (entities.length) await db.batch(entities.map((e) => saveStmt(db, e)));
  return entities;
}

export async function deleteAll(db: D1Database, entities: BulkUploadJobStatus[]): Promise<void> {
  const ids = entities.map((e) => e.id).filter((id): id is string => id != null) as Param[];
  if (!ids.length) return;
  await db.batch(chunk(ids).map((part) => stmt(db, `DELETE FROM "${TABLE}" WHERE id IN ${placeholders(part.length)}`, ...part)));
}

// ---- Added for the job services (not in the Java repository) ----

/** Same rows as `deleteAll(findAllByUserAndJobStatusId(jobStatusId, userId))`, as one statement. */
export function deleteAllByUserAndJobStatusIdStmt(db: D1Database, jobStatusId: string, userId: string): D1PreparedStatement {
  return stmt(db, `DELETE FROM "${TABLE}" WHERE job_status_id = ? AND user_id = ?`, jobStatusId, userId);
}
