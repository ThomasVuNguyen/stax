/**
 * Port of domain/inferencestatus/InferenceStatusRepository (JpaRepository<InferenceStatus, String>).
 *
 * Helper loaders (not in Java; replace the @OneToOne ChatTurn.inferenceStatus mappedBy side):
 * - `findByChatTurnId(db, chatTurnId)` (any user) and `findAllByChatTurnIdIn(db, chatTurnIds)`.
 *
 * Note: the Java prePersist assigns a fresh "id-<uuid>" on insert; `save` does so when id is null.
 */
import { all, allIn, chunk, first, placeholders, run, stmt } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type InferenceStatus, TABLE, fromRow, prePersist, toRow } from "../../entities/InferenceStatus";

export async function findById(db: D1Database, id: string): Promise<InferenceStatus | null> {
  const row = await first(db, `SELECT * FROM inference_status WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllByJobIdAndUserId(db: D1Database, jobId: string, userId: string): Promise<InferenceStatus[]> {
  return (await all(db, `SELECT * FROM inference_status WHERE job_id = ? AND user_id = ?`, jobId, userId)).map(fromRow);
}

export async function updateStatusByChatTurnIdAndJobIdAndUserId(
  db: D1Database,
  status: number,
  chatTurnId: string,
  jobId: string,
  userId: string,
  comments: string | null,
  reason: string | null,
): Promise<void> {
  await run(
    db,
    `UPDATE inference_status SET status = ?, comments = ?, reason = ? WHERE chat_turn_id = ? AND job_id = ? AND user_id = ?`,
    status,
    comments,
    reason,
    chatTurnId,
    jobId,
    userId,
  );
}

/** Returns the number of updated rows. (Despite the name, the JPQL does not filter by user.) */
export async function updateStatusByJobIdAndUserId(
  db: D1Database,
  status: number,
  jobId: string,
  comments: string | null,
  inferenceStatus: number,
): Promise<number> {
  const res = await run(
    db,
    `UPDATE inference_status SET status = ?, comments = ? WHERE job_id = ? AND status = ?`,
    status,
    comments,
    jobId,
    inferenceStatus,
  );
  return res.meta.changes ?? 0;
}

export async function getByChatTurnId(db: D1Database, chatTurnId: string, userId: string): Promise<InferenceStatus | null> {
  const row = await first(db, `SELECT * FROM inference_status WHERE chat_turn_id = ? AND user_id = ?`, chatTurnId, userId);
  return row ? fromRow(row) : null;
}

/** Helper: ChatTurn.getInferenceStatus() (chat_turn_id is unique). */
export async function findByChatTurnId(db: D1Database, chatTurnId: string): Promise<InferenceStatus | null> {
  const row = await first(db, `SELECT * FROM inference_status WHERE chat_turn_id = ?`, chatTurnId);
  return row ? fromRow(row) : null;
}

/** Helper: inference statuses of many turns. */
export async function findAllByChatTurnIdIn(db: D1Database, chatTurnIds: string[]): Promise<InferenceStatus[]> {
  return (await allIn(db, (inn) => `SELECT * FROM inference_status WHERE chat_turn_id IN ${inn}`, chatTurnIds)).map(fromRow);
}

/** Statement form of save() for db.batch([...]). Mutates `e` (id, timestamps). */
export function saveStmt(db: D1Database, e: InferenceStatus): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: InferenceStatus): Promise<InferenceStatus> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, es: InferenceStatus[]): Promise<InferenceStatus[]> {
  for (const part of chunk(es, 50)) if (part.length) await db.batch(part.map((e) => saveStmt(db, e)));
  return es;
}

export async function deleteAllById(db: D1Database, ids: string[]): Promise<void> {
  const ok = ids.filter((id) => id != null);
  const stmts = chunk(ok).map((part) => stmt(db, `DELETE FROM inference_status WHERE id IN ${placeholders(part.length)}`, ...part));
  if (stmts.length) await db.batch(stmts);
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await deleteAllById(db, [id]);
}

async function delete_(db: D1Database, e: InferenceStatus): Promise<void> {
  if (e.id) await deleteAllById(db, [e.id]);
}
export { delete_ as delete };

export async function deleteAll(db: D1Database, es: InferenceStatus[]): Promise<void> {
  await deleteAllById(db, es.map((e) => e.id).filter((id): id is string => id != null));
}
