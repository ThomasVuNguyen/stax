/**
 * Port of domain/evaluationstatus/EvaluationStatusRepository (JpaRepository<EvaluationStatus, String>).
 * `findByTurnAndEvaluatorLists(chatTurnIds, evaluatorIds: Set, userId)` takes arrays.
 * `saveAndFlush` = `save`. The Java prePersist assigns a fresh id on insert; `save` does so when
 * the id is null.
 */
import { all, chunk, first, placeholders, run, stmt } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type EvaluationStatus, TABLE, fromRow, prePersist, toRow } from "../../entities/EvaluationStatus";

export async function findById(db: D1Database, id: string): Promise<EvaluationStatus | null> {
  const row = await first(db, `SELECT * FROM evaluation_status WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllByJobIdAndUserId(db: D1Database, jobId: string, userId: string): Promise<EvaluationStatus[]> {
  return (await all(db, `SELECT * FROM evaluation_status WHERE job_id = ? AND user_id = ?`, jobId, userId)).map(fromRow);
}

/** Single result (Spring would throw on duplicates; the first row is returned here). */
export async function findByEvaluatorIdAndChatTurnIdAndUserId(
  db: D1Database,
  evaluatorId: string,
  chatTurnId: string,
  userId: string,
): Promise<EvaluationStatus | null> {
  const row = await first(
    db,
    `SELECT * FROM evaluation_status WHERE evaluator_id = ? AND chat_turn_id = ? AND user_id = ? LIMIT 1`,
    evaluatorId,
    chatTurnId,
    userId,
  );
  return row ? fromRow(row) : null;
}

/** Both lists may be large: chunks the turn ids, keeps the evaluator ids in every statement. */
export async function findByTurnAndEvaluatorLists(
  db: D1Database,
  chatTurnIds: string[],
  evaluatorIds: string[] | Set<string>,
  userId: string,
): Promise<EvaluationStatus[]> {
  const evals = [...new Set(evaluatorIds)];
  const turns = [...new Set(chatTurnIds)];
  if (!evals.length || !turns.length) return [];
  const out: EvaluationStatus[] = [];
  for (const evalPart of chunk(evals, 45)) {
    for (const turnPart of chunk(turns, 90 - evalPart.length)) {
      const rows = await all(
        db,
        `SELECT * FROM evaluation_status WHERE chat_turn_id IN ${placeholders(turnPart.length)}
         AND evaluator_id IN ${placeholders(evalPart.length)} AND user_id = ?`,
        ...turnPart,
        ...evalPart,
        userId,
      );
      out.push(...rows.map(fromRow));
    }
  }
  return out;
}

export async function updateStatusByEvaluatorIdAndChatTurnIdAndJobIdAndUserId(
  db: D1Database,
  status: number,
  evaluatorId: string,
  chatTurnId: string,
  jobId: string,
  userId: string,
  comments: string | null,
  reason: string | null,
): Promise<void> {
  await run(
    db,
    `UPDATE evaluation_status SET status = ?, comments = ?, reason = ?
     WHERE evaluator_id = ? AND chat_turn_id = ? AND job_id = ? AND user_id = ?`,
    status,
    comments,
    reason,
    evaluatorId,
    chatTurnId,
    jobId,
    userId,
  );
}

/** Returns the number of updated rows. (Despite the name, the JPQL does not filter by user.) */
export async function updateStatusByJobIdAndUserId(
  db: D1Database,
  newStatus: number,
  jobId: string,
  comments: string | null,
  oldStatus: number,
): Promise<number> {
  const res = await run(
    db,
    `UPDATE evaluation_status SET status = ?, comments = ? WHERE job_id = ? AND status = ?`,
    newStatus,
    comments,
    jobId,
    oldStatus,
  );
  return res.meta.changes ?? 0;
}

export async function existsByEvaluatorId(db: D1Database, evaluatorId: string): Promise<boolean> {
  return (await first(db, `SELECT 1 AS x FROM evaluation_status WHERE evaluator_id = ? LIMIT 1`, evaluatorId)) != null;
}

/** Statement form of save() for db.batch([...]). Mutates `e` (id, timestamps). */
export function saveStmt(db: D1Database, e: EvaluationStatus): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: EvaluationStatus): Promise<EvaluationStatus> {
  await saveStmt(db, e).run();
  return e;
}

export const saveAndFlush = save;

export async function saveAll(db: D1Database, es: EvaluationStatus[]): Promise<EvaluationStatus[]> {
  for (const part of chunk(es, 50)) if (part.length) await db.batch(part.map((e) => saveStmt(db, e)));
  return es;
}

export async function deleteAllById(db: D1Database, ids: string[]): Promise<void> {
  const ok = ids.filter((id) => id != null);
  const stmts = chunk(ok).map((part) => stmt(db, `DELETE FROM evaluation_status WHERE id IN ${placeholders(part.length)}`, ...part));
  if (stmts.length) await db.batch(stmts);
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await deleteAllById(db, [id]);
}

async function delete_(db: D1Database, e: EvaluationStatus): Promise<void> {
  if (e.id) await deleteAllById(db, [e.id]);
}
export { delete_ as delete };

export async function deleteAll(db: D1Database, es: EvaluationStatus[]): Promise<void> {
  await deleteAllById(db, es.map((e) => e.id).filter((id): id is string => id != null));
}
