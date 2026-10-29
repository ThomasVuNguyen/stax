/**
 * Port of domain/evaluation/HumanEvalScoreRepository (JpaRepository<HumanEvalScore, String>).
 *
 * - User-typed params become `userId`.
 * - Helper loaders (ModelResponse.humanEvalScores was EAGER): `findByModelResponseId`,
 *   `findByModelResponseIds` (Map keyed by model response id).
 * - Inherited methods: findById, save, saveAll, saveStmt, delete, deleteById.
 */
import { all, allIn, first, run } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type HumanEvalScore, TABLE, fromRow, prePersist, toRow } from "../../entities/HumanEvalScore";

export async function findByModelResponseIdAndEvaluatorId(
  db: D1Database,
  modelResponseId: string,
  evaluatorId: string,
  userId: string,
): Promise<HumanEvalScore | null> {
  const row = await first(
    db,
    `SELECT * FROM "${TABLE}" WHERE model_response_id = ? AND human_evaluator_id = ? AND user_id = ? LIMIT 1`,
    modelResponseId,
    evaluatorId,
    userId,
  );
  return row ? fromRow(row) : null;
}

/** Scores of all model responses referenced by chat turns of chats in the container. */
export async function findAllByContainerId(db: D1Database, containerId: string): Promise<HumanEvalScore[]> {
  const rows = await all(
    db,
    `SELECT hs.* FROM "${TABLE}" hs
     JOIN model_response mr ON mr.id = hs.model_response_id
     JOIN chat_turns ct ON ct.model_response_id = mr.id
     JOIN chat c ON c.id = ct.chat_id
     WHERE c.container_id = ?`,
    containerId,
  );
  return rows.map(fromRow);
}

/** Helper: scores of one model response (replaces the EAGER ModelResponse.humanEvalScores). */
export async function findByModelResponseId(db: D1Database, modelResponseId: string): Promise<HumanEvalScore[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE model_response_id = ? ORDER BY rowid`, modelResponseId);
  return rows.map(fromRow);
}

/** Helper: scores grouped by model response id. */
export async function findByModelResponseIds(
  db: D1Database,
  modelResponseIds: string[],
): Promise<Map<string, HumanEvalScore[]>> {
  const rows = await allIn(
    db,
    (inClause) => `SELECT * FROM "${TABLE}" WHERE model_response_id IN ${inClause} ORDER BY rowid`,
    modelResponseIds,
  );
  const out = new Map<string, HumanEvalScore[]>();
  for (const r of rows.map(fromRow)) {
    const k = r.modelResponseId as string;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(r);
  }
  return out;
}

export async function findById(db: D1Database, id: string): Promise<HumanEvalScore | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export function saveStmt(db: D1Database, e: HumanEvalScore): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: HumanEvalScore): Promise<HumanEvalScore> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, es: HumanEvalScore[]): Promise<HumanEvalScore[]> {
  if (es.length) await db.batch(es.map((e) => saveStmt(db, e)));
  return es;
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE id = ?`, id);
}

export async function delete_(db: D1Database, e: HumanEvalScore): Promise<void> {
  if (e.id) await deleteById(db, e.id);
}
export { delete_ as delete };
