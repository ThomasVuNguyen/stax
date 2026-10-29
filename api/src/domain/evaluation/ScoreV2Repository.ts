/**
 * Port of domain/evaluation/ScoreV2Repository (JpaRepository<ScoreV2, String>), table `score`.
 *
 * - `deleteByEvaluationMonitoringIn(db, evaluationMonitoringIds)` takes monitoring ids (Java: entities).
 *   Like Spring's derived delete it removes each score with its cascades.
 * - delete/deleteById/deleteAll cascade to the owned evaluation_status rows (cascade ALL +
 *   orphanRemoval), deleting score rows first because of the FK. evaluation_monitoring rows are
 *   NOT removed (cascade PERSIST/MERGE/REFRESH only).
 * - JPA cascade PERSIST of `evaluationStatus`/`evaluationMonitoring` is NOT automatic: save them
 *   first and set `evaluationStatusId`/`evaluationMonitoringId`.
 * - `saveAndFlush` / `saveAllAndFlush` are aliases of `save` / `saveAll`.
 * - Helper loader (ModelResponse.scores was EAGER): `findByModelResponseIds` (Map by response id);
 *   single response: the Java method `findByModelResponse_Id`.
 */
import { all, allIn, first, placeholders, scalar } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type ScoreV2, TABLE, fromRow, prePersist, toRow } from "../../entities/ScoreV2";

export async function findAvgScoreByEvaluatorIdAndProjectId(
  db: D1Database,
  evaluatorId: string,
  containerId: string,
): Promise<number | null> {
  return scalar<number | null>(
    db,
    `SELECT AVG(s.score) FROM "${TABLE}" s JOIN model_response mr ON mr.id = s.model_response_id
     WHERE s.llm_evaluator = ? AND mr.container_id = ?`,
    evaluatorId,
    containerId,
  );
}

export async function deleteByEvaluationMonitoringIn(db: D1Database, evaluationMonitoringIds: string[]): Promise<void> {
  const rows = await allIn(
    db,
    (inClause) => `SELECT * FROM "${TABLE}" WHERE evaluation_monitoring_id IN ${inClause}`,
    evaluationMonitoringIds,
  );
  await deleteAll(db, rows.map(fromRow));
}

export async function findByModelResponse_Id(db: D1Database, modelResponseId: string): Promise<ScoreV2[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE model_response_id = ? ORDER BY rowid`, modelResponseId);
  return rows.map(fromRow);
}

export async function findByModelResponseIds(db: D1Database, modelResponseIds: string[]): Promise<Map<string, ScoreV2[]>> {
  const rows = await allIn(
    db,
    (inClause) => `SELECT * FROM "${TABLE}" WHERE model_response_id IN ${inClause} ORDER BY rowid`,
    modelResponseIds,
  );
  const out = new Map<string, ScoreV2[]>();
  for (const r of rows.map(fromRow)) {
    const k = r.modelResponseId as string;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(r);
  }
  return out;
}

export async function findById(db: D1Database, id: string): Promise<ScoreV2 | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export function saveStmt(db: D1Database, e: ScoreV2): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: ScoreV2): Promise<ScoreV2> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, es: ScoreV2[]): Promise<ScoreV2[]> {
  if (es.length) await db.batch(es.map((e) => saveStmt(db, e)));
  return es;
}

export const saveAndFlush = save;
export const saveAllAndFlush = saveAll;

/** Deletes scores, then their owned evaluation_status rows (JPA cascade REMOVE). */
export async function deleteAll(db: D1Database, es: ScoreV2[]): Promise<void> {
  const ids = es.map((e) => e.id).filter((x): x is string => !!x);
  if (!ids.length) return;
  const rows = await allIn<{ evaluation_status: string | null }>(
    db,
    (inClause) => `SELECT evaluation_status FROM "${TABLE}" WHERE id IN ${inClause}`,
    ids,
  );
  const statusIds = rows.map((r) => r.evaluation_status).filter((x): x is string => !!x);
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    stmts.push(db.prepare(`DELETE FROM "${TABLE}" WHERE id IN ${placeholders(part.length)}`).bind(...part));
  }
  for (let i = 0; i < statusIds.length; i += 90) {
    const part = statusIds.slice(i, i + 90);
    stmts.push(db.prepare(`DELETE FROM evaluation_status WHERE id IN ${placeholders(part.length)}`).bind(...part));
  }
  await db.batch(stmts);
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  const e = await findById(db, id);
  if (e) await deleteAll(db, [e]);
}

export async function delete_(db: D1Database, e: ScoreV2): Promise<void> {
  await deleteAll(db, [e]);
}
export { delete_ as delete };
