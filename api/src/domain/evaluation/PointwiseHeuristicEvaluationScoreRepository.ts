/**
 * Port of domain/evaluation/PointwiseHeuristicEvaluationScoreRepository
 * (JpaRepository<PointwiseHeuristicEvaluationScore, String>, no custom methods).
 *
 * - Inherited methods: findById, save, saveAll, saveAndFlush/saveAllAndFlush (aliases), delete,
 *   deleteById, deleteAll (cascade to the owned evaluation_status rows).
 * - JPA cascade PERSIST of `evaluationStatus` is NOT automatic: save the EvaluationStatus first.
 * - Helper loaders (ModelResponse.pointwiseHeuristicEvaluationScores was EAGER):
 *   `findByModelResponseId`, `findByModelResponseIds` (Map keyed by model response id).
 */
import { all, allIn, first, placeholders } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import {
  type PointwiseHeuristicEvaluationScore,
  TABLE,
  fromRow,
  prePersist,
  toRow,
} from "../../entities/PointwiseHeuristicEvaluationScore";

export async function findById(db: D1Database, id: string): Promise<PointwiseHeuristicEvaluationScore | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findByModelResponseId(
  db: D1Database,
  modelResponseId: string,
): Promise<PointwiseHeuristicEvaluationScore[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE model_response_id = ? ORDER BY rowid`, modelResponseId);
  return rows.map(fromRow);
}

export async function findByModelResponseIds(
  db: D1Database,
  modelResponseIds: string[],
): Promise<Map<string, PointwiseHeuristicEvaluationScore[]>> {
  const rows = await allIn(
    db,
    (inClause) => `SELECT * FROM "${TABLE}" WHERE model_response_id IN ${inClause} ORDER BY rowid`,
    modelResponseIds,
  );
  const out = new Map<string, PointwiseHeuristicEvaluationScore[]>();
  for (const r of rows.map(fromRow)) {
    const k = r.modelResponseId as string;
    if (!out.has(k)) out.set(k, []);
    out.get(k)!.push(r);
  }
  return out;
}

export function saveStmt(db: D1Database, e: PointwiseHeuristicEvaluationScore): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(
  db: D1Database,
  e: PointwiseHeuristicEvaluationScore,
): Promise<PointwiseHeuristicEvaluationScore> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(
  db: D1Database,
  es: PointwiseHeuristicEvaluationScore[],
): Promise<PointwiseHeuristicEvaluationScore[]> {
  if (es.length) await db.batch(es.map((e) => saveStmt(db, e)));
  return es;
}

export const saveAndFlush = save;
export const saveAllAndFlush = saveAll;

/** Deletes scores, then their owned evaluation_status rows (JPA cascade REMOVE). */
export async function deleteAll(db: D1Database, es: PointwiseHeuristicEvaluationScore[]): Promise<void> {
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

export async function delete_(db: D1Database, e: PointwiseHeuristicEvaluationScore): Promise<void> {
  await deleteAll(db, [e]);
}
export { delete_ as delete };
