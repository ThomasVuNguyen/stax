/**
 * Port of domain/job/ScoreStatusRepository (JpaRepository<ScoreStatus, String>).
 * Inherited methods: deleteAll(entities) (used), save/saveAll/findById (included for completeness).
 * Note: ScoreStatus's Java @PrePersist always assigns a new id; save() only does so when id is null.
 */
import { type Param, all, chunk, first, placeholders, stmt } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type ScoreStatus, TABLE, fromRow, prePersist, toRow } from "../../entities/ScoreStatus";

/** JPQL `t.jobStatusId = :jobId AND t.user.id = :userId`. */
export async function findAllByUserAndJobId(db: D1Database, jobId: string, userId: string): Promise<ScoreStatus[]> {
  return (await all(db, `SELECT * FROM "${TABLE}" WHERE job_status_id = ? AND user_id = ?`, jobId, userId)).map(fromRow);
}

export async function findById(db: D1Database, id: string): Promise<ScoreStatus | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export function saveStmt(db: D1Database, e: ScoreStatus): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: ScoreStatus): Promise<ScoreStatus> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, entities: ScoreStatus[]): Promise<ScoreStatus[]> {
  if (entities.length) await db.batch(entities.map((e) => saveStmt(db, e)));
  return entities;
}

export async function deleteAll(db: D1Database, entities: ScoreStatus[]): Promise<void> {
  const ids = entities.map((e) => e.id).filter((id): id is string => id != null) as Param[];
  if (!ids.length) return;
  await db.batch(chunk(ids).map((part) => stmt(db, `DELETE FROM "${TABLE}" WHERE id IN ${placeholders(part.length)}`, ...part)));
}
