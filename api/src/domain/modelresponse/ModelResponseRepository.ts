/**
 * Port of domain/modelresponse/ModelResponseRepository (JpaRepository<ModelResponse, String>).
 * `findByUserAndId(user, id)` → `findByUserAndId(db, userId, id)`;
 * `deleteAllByContainer(container)` → `deleteAllByContainer(db, containerId)` (bulk JPQL delete:
 * no JPA cascade, only the FK ON DELETE CASCADE of the score tables).
 * `saveAndFlush` = `save`.
 *
 * Helper loaders for the EAGER @OneToMany collections of ModelResponse (not in Java):
 * - `findScoresByModelResponseId(s)` → ScoreV2 (`scores`)
 * - `findHumanEvalScoresByModelResponseId(s)` → HumanEvalScore (`humanEvalScores`)
 * - `findPointwiseHeuristicEvaluationScoresByModelResponseId(s)` → `pointwiseHeuristicEvaluationScores`
 * The plural forms return Map<modelResponseId, T[]> with every requested id present.
 * The EAGER `model` is `ModelRepository.findById(db, response.modelId)`.
 *
 * Saving does not cascade: save the InferenceMonitoring first (cascade PERSIST in Java) and set
 * `inferenceMonitoringId`.
 *
 * `delete`/`deleteById`/`deleteAll` apply the JPA cascades: score, pointwise heuristic score and
 * human score rows of the response are removed together with the evaluation_status rows the
 * score rows own (cascade ALL), then the response itself.
 */
import { type Row, allIn, chunk, first, placeholders, run, stmt } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type ModelResponse, TABLE, fromRow, prePersist, toRow } from "../../entities/ModelResponse";
import * as HumanEvalScoreEntity from "../../entities/HumanEvalScore";
import type { HumanEvalScore } from "../../entities/HumanEvalScore";
import * as PhesEntity from "../../entities/PointwiseHeuristicEvaluationScore";
import type { PointwiseHeuristicEvaluationScore } from "../../entities/PointwiseHeuristicEvaluationScore";
import * as ScoreV2Entity from "../../entities/ScoreV2";
import type { ScoreV2 } from "../../entities/ScoreV2";

export async function findById(db: D1Database, id: string): Promise<ModelResponse | null> {
  const row = await first(db, `SELECT * FROM model_response WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllById(db: D1Database, ids: string[]): Promise<ModelResponse[]> {
  return (await allIn(db, (inn) => `SELECT * FROM model_response WHERE id IN ${inn}`, ids)).map(fromRow);
}

export async function findByUserAndId(db: D1Database, userId: string, modelResponseId: string): Promise<ModelResponse | null> {
  const row = await first(db, `SELECT * FROM model_response WHERE user_id = ? AND id = ?`, userId, modelResponseId);
  return row ? fromRow(row) : null;
}

export async function deleteAllByContainer(db: D1Database, containerId: string): Promise<void> {
  await run(db, `DELETE FROM model_response WHERE container_id = ?`, containerId);
}

/** Statement form of save() for db.batch([...]). Mutates `e` (id, timestamps). */
export function saveStmt(db: D1Database, e: ModelResponse): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: ModelResponse): Promise<ModelResponse> {
  await saveStmt(db, e).run();
  return e;
}

export const saveAndFlush = save;

export async function saveAll(db: D1Database, es: ModelResponse[]): Promise<ModelResponse[]> {
  for (const part of chunk(es, 50)) if (part.length) await db.batch(part.map((e) => saveStmt(db, e)));
  return es;
}

/** Cascade statements for removing responses (see header). */
export async function deleteStmts(db: D1Database, ids: string[]): Promise<D1PreparedStatement[]> {
  const statusIds = (
    await allIn<{ s: string }>(
      db,
      (inn) =>
        `SELECT evaluation_status AS s FROM score WHERE model_response_id IN ${inn} AND evaluation_status IS NOT NULL
         UNION SELECT evaluation_status AS s FROM pointwise_heuristic_evaluation_score
         WHERE model_response_id IN ${inn} AND evaluation_status IS NOT NULL`,
      ids,
    )
  ).map((r) => r.s);
  const out: D1PreparedStatement[] = [];
  for (const part of chunk(ids, 45)) {
    const inn = placeholders(part.length);
    out.push(
      stmt(db, `DELETE FROM score WHERE model_response_id IN ${inn}`, ...part),
      stmt(db, `DELETE FROM pointwise_heuristic_evaluation_score WHERE model_response_id IN ${inn}`, ...part),
      stmt(db, `DELETE FROM human_scores WHERE model_response_id IN ${inn}`, ...part),
      stmt(db, `DELETE FROM model_response WHERE id IN ${inn}`, ...part),
    );
  }
  for (const part of chunk([...new Set(statusIds)])) {
    out.push(stmt(db, `DELETE FROM evaluation_status WHERE id IN ${placeholders(part.length)}`, ...part));
  }
  return out;
}

export async function deleteAllById(db: D1Database, ids: string[]): Promise<void> {
  const ok = ids.filter((id) => id != null);
  if (!ok.length) return;
  await db.batch(await deleteStmts(db, ok));
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await deleteAllById(db, [id]);
}

async function delete_(db: D1Database, e: ModelResponse): Promise<void> {
  if (e.id) await deleteAllById(db, [e.id]);
}
export { delete_ as delete };

export async function deleteAll(db: D1Database, es: ModelResponse[]): Promise<void> {
  await deleteAllById(db, es.map((e) => e.id).filter((id): id is string => id != null));
}

// ---------------------------------------------------------------------------------------------
// Helper loaders for the EAGER collections

async function groupByResponse<T>(
  db: D1Database,
  table: string,
  ids: string[],
  map: (row: Row) => T,
): Promise<Map<string, T[]>> {
  const out = new Map<string, T[]>(ids.map((id) => [id, []]));
  const rows = await allIn(db, (inn) => `SELECT * FROM ${table} WHERE model_response_id IN ${inn} ORDER BY rowid`, [
    ...new Set(ids),
  ]);
  for (const r of rows) {
    const key = String(r.model_response_id);
    const list = out.get(key) ?? [];
    list.push(map(r));
    out.set(key, list);
  }
  return out;
}

export async function findScoresByModelResponseIds(db: D1Database, ids: string[]): Promise<Map<string, ScoreV2[]>> {
  return groupByResponse(db, ScoreV2Entity.TABLE, ids, ScoreV2Entity.fromRow);
}

export async function findScoresByModelResponseId(db: D1Database, id: string): Promise<ScoreV2[]> {
  return (await findScoresByModelResponseIds(db, [id])).get(id) ?? [];
}

export async function findHumanEvalScoresByModelResponseIds(
  db: D1Database,
  ids: string[],
): Promise<Map<string, HumanEvalScore[]>> {
  return groupByResponse(db, HumanEvalScoreEntity.TABLE, ids, HumanEvalScoreEntity.fromRow);
}

export async function findHumanEvalScoresByModelResponseId(db: D1Database, id: string): Promise<HumanEvalScore[]> {
  return (await findHumanEvalScoresByModelResponseIds(db, [id])).get(id) ?? [];
}

export async function findPointwiseHeuristicEvaluationScoresByModelResponseIds(
  db: D1Database,
  ids: string[],
): Promise<Map<string, PointwiseHeuristicEvaluationScore[]>> {
  return groupByResponse(db, PhesEntity.TABLE, ids, PhesEntity.fromRow);
}

export async function findPointwiseHeuristicEvaluationScoresByModelResponseId(
  db: D1Database,
  id: string,
): Promise<PointwiseHeuristicEvaluationScore[]> {
  return (await findPointwiseHeuristicEvaluationScoresByModelResponseIds(db, [id])).get(id) ?? [];
}
