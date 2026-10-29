/**
 * Port of domain/evaluation/PairwiseScoreRepository (JpaRepository<PairwiseScore, String>).
 *
 * - `saveAndFlush` / `saveAllAndFlush` are aliases of `save` / `saveAll` (D1 has no flush).
 * - JPA cascade PERSIST of `evaluationStatus` is NOT automatic: save the EvaluationStatus first
 *   (EvaluationStatusRepository.save) and set `evaluationStatusId`.
 * - delete/deleteById/deleteAll cascade to the owned evaluation_status rows (cascade ALL +
 *   orphanRemoval), deleting the score rows first because of the FK.
 * - findEvaluationStatusByPairDetailsAndEvaluators: the pair-id IN list is chunked in SQL; the
 *   other IN lists are applied in memory (same result, avoids D1's 100-parameter limit).
 * - getPairwiseEvaluationRecords returns ScorerEvaluationRecord (scorerId, scorerName, score, count).
 */
import { type Param, all, allIn, first, placeholders, scalar } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type PairwiseScore, TABLE, fromRow, prePersist, toRow } from "../../entities/PairwiseScore";
import type { ScorerEvaluationRecord } from "../analytics/evaluation/dto/ScorerEvaluationRecord";

export async function findByPairAndChatTurnsAndEvaluatorAndUser(
  db: D1Database,
  pairId: string,
  chatTurnAId: string,
  chatTurnBId: string,
  evaluatorId: string,
  userId: string,
): Promise<PairwiseScore | null> {
  const row = await first(
    db,
    `SELECT * FROM "${TABLE}" WHERE sxs_evaluation_pair = ? AND chat_turn_a = ? AND chat_turn_b = ?
     AND pairwise_llm_evaluator = ? AND user_id = ? LIMIT 1`,
    pairId,
    chatTurnAId,
    chatTurnBId,
    evaluatorId,
    userId,
  );
  return row ? fromRow(row) : null;
}

export async function findByPairAndUser(db: D1Database, pairId: string, userId: string): Promise<PairwiseScore[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE sxs_evaluation_pair = ? AND user_id = ?`, pairId, userId);
  return rows.map(fromRow);
}

export async function findEvaluationStatusByPairDetailsAndEvaluators(
  db: D1Database,
  pairIds: string[],
  chatTurnAIds: string[],
  chatTurnBIds: string[],
  evaluatorIds: Iterable<string>,
  userId: string,
): Promise<PairwiseScore[]> {
  const a = new Set(chatTurnAIds);
  const b = new Set(chatTurnBIds);
  const ev = new Set(evaluatorIds);
  if (!a.size || !b.size || !ev.size) return [];
  const rows = await allIn(
    db,
    (inClause) => `SELECT * FROM "${TABLE}" WHERE sxs_evaluation_pair IN ${inClause} AND user_id = ?`,
    pairIds,
    userId,
  );
  return rows
    .map(fromRow)
    .filter(
      (s) =>
        s.chatTurnAId != null &&
        a.has(s.chatTurnAId) &&
        s.chatTurnBId != null &&
        b.has(s.chatTurnBId) &&
        s.llmEvaluatorId != null &&
        ev.has(s.llmEvaluatorId),
    );
}

export async function getPairwiseEvaluationRecords(
  db: D1Database,
  projectId: string,
  userId: string,
): Promise<ScorerEvaluationRecord[]> {
  return all<ScorerEvaluationRecord>(
    db,
    `SELECT e.id AS scorerId, e.name AS scorerName, ps.score AS score, COUNT(ps.id) AS count
     FROM "${TABLE}" ps
     JOIN sxs_evaluation_pair p ON p.id = ps.sxs_evaluation_pair
     JOIN pairwise_llm_evaluator e ON e.id = ps.pairwise_llm_evaluator
     WHERE p.container_id = ? AND ps.user_id = ? AND ps.score IS NOT NULL
     GROUP BY e.id, e.name, ps.score
     ORDER BY e.id, ps.score`,
    projectId,
    userId,
  );
}

export async function existsByEvaluatorId(db: D1Database, evaluatorId: string, userId: string): Promise<boolean> {
  const n = await scalar<number>(
    db,
    `SELECT COUNT(*) FROM "${TABLE}" WHERE pairwise_llm_evaluator = ? AND user_id = ?`,
    evaluatorId,
    userId,
  );
  return (n ?? 0) > 0;
}

export async function findById(db: D1Database, id: string): Promise<PairwiseScore | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllById(db: D1Database, ids: string[]): Promise<PairwiseScore[]> {
  const rows = await allIn(db, (inClause) => `SELECT * FROM "${TABLE}" WHERE id IN ${inClause}`, ids);
  return rows.map(fromRow);
}

export function saveStmt(db: D1Database, e: PairwiseScore): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: PairwiseScore): Promise<PairwiseScore> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, es: PairwiseScore[]): Promise<PairwiseScore[]> {
  if (es.length) await db.batch(es.map((e) => saveStmt(db, e)));
  return es;
}

export const saveAndFlush = save;
export const saveAllAndFlush = saveAll;

/** Deletes scores, then their owned evaluation_status rows (JPA cascade REMOVE). */
export async function deleteAll(db: D1Database, es: PairwiseScore[]): Promise<void> {
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
    const part = ids.slice(i, i + 90) as Param[];
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

export async function delete_(db: D1Database, e: PairwiseScore): Promise<void> {
  await deleteAll(db, [e]);
}
export { delete_ as delete };
