/**
 * Port of domain/evaluation/SXSHumanFeedbackRepository (JpaRepository<SXSHumanFeedback, String>).
 *
 * - `getHumanEvalMetricsByProject(db, projectId, userId)` returns SXSRatingCount ({ rating, count }).
 * - `getHumanFeedbackExportDTOsByPairId` returns SXSHumanEvalRatingExportDTO ({ sequenceId, rating, notes }).
 * - @Modifying deletes are literal (no cascades); IN-lists are chunked.
 * - Inherited: findById, save, saveAll, saveStmt, deleteById.
 */
import { all, allIn, chunk, first, placeholders, run } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type SXSHumanFeedback, TABLE, fromRow, prePersist, toRow } from "../../entities/SXSHumanFeedback";
import type { HumanSxsRating } from "../../enums/HumanSxsRating";
import * as HumanSxsRatingConverter from "../../util/converter/HumanSxsRatingConverter";
import type { SXSHumanEvalRatingExportDTO } from "../importexport/dto/SXSHumanEvalRatingExportDTO";
import type { SXSRatingCount } from "../project/dto/SXSRatingCount";

export async function findByPairId(db: D1Database, pairId: string): Promise<SXSHumanFeedback[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE pair_id = ?`, pairId);
  return rows.map(fromRow);
}

export async function findByPairIds(db: D1Database, pairIds: string[]): Promise<SXSHumanFeedback[]> {
  const rows = await allIn(db, (inClause) => `SELECT * FROM "${TABLE}" WHERE pair_id IN ${inClause}`, pairIds);
  return rows.map(fromRow);
}

export async function findByPairIdAndChatTurns(
  db: D1Database,
  pairId: string,
  chatTurnA: string,
  chatTurnB: string,
): Promise<SXSHumanFeedback | null> {
  const row = await first(
    db,
    `SELECT * FROM "${TABLE}" WHERE pair_id = ? AND chat_turn_a = ? AND chat_turn_b = ? LIMIT 1`,
    pairId,
    chatTurnA,
    chatTurnB,
  );
  return row ? fromRow(row) : null;
}

export async function deleteByPairId(db: D1Database, pairId: string): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE pair_id = ?`, pairId);
}

export async function deleteByPairIdList(db: D1Database, pairIds: string[]): Promise<void> {
  if (!pairIds.length) return;
  await db.batch(
    chunk(pairIds).map((part) =>
      db.prepare(`DELETE FROM "${TABLE}" WHERE pair_id IN ${placeholders(part.length)}`).bind(...part),
    ),
  );
}

export async function deleteByChatTurnIdList(db: D1Database, chatTurnIds: string[]): Promise<void> {
  if (!chatTurnIds.length) return;
  // The same list is bound twice per statement, so chunk at 45.
  await db.batch(
    chunk(chatTurnIds, 45).map((part) => {
      const ph = placeholders(part.length);
      return db
        .prepare(`DELETE FROM "${TABLE}" WHERE chat_turn_a IN ${ph} OR chat_turn_b IN ${ph}`)
        .bind(...part, ...part);
    }),
  );
}

export async function deleteByChatTurnAAndChatTurnB(db: D1Database, chatTurnA: string, chatTurnB: string): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE chat_turn_a = ? AND chat_turn_b = ?`, chatTurnA, chatTurnB);
}

export async function getHumanEvalMetricsByProject(
  db: D1Database,
  projectId: string,
  userId: string,
): Promise<SXSRatingCount[]> {
  const rows = await all<{ rating: string; count: number }>(
    db,
    `SELECT human_sxs_rating AS rating, COUNT(*) AS count FROM "${TABLE}"
     WHERE project_id = ? AND user_id = ? AND human_sxs_rating IS NOT NULL
     GROUP BY human_sxs_rating`,
    projectId,
    userId,
  );
  return rows.map((r) => ({
    rating: HumanSxsRatingConverter.convertToEntityAttribute(r.rating) as HumanSxsRating,
    count: Number(r.count),
  }));
}

export async function getHumanFeedbackExportDTOsByPairId(
  db: D1Database,
  pairId: string,
): Promise<SXSHumanEvalRatingExportDTO[]> {
  const rows = await all<{ sequenceId: number | null; rating: string | null; notes: string | null }>(
    db,
    `SELECT cta.sequence_id AS sequenceId, shf.human_sxs_rating AS rating, shf.human_sxs_notes AS notes
     FROM "${TABLE}" shf JOIN chat_turns cta ON cta.id = shf.chat_turn_a
     WHERE shf.pair_id = ?`,
    pairId,
  );
  return rows.map((r) => ({
    sequenceId: r.sequenceId,
    rating: HumanSxsRatingConverter.convertToEntityAttribute(r.rating),
    notes: r.notes,
  }));
}

export async function deleteByPairIdAndChatTurns(
  db: D1Database,
  pairId: string,
  chatTurnA: string,
  chatTurnB: string,
): Promise<void> {
  await run(
    db,
    `DELETE FROM "${TABLE}" WHERE pair_id = ? AND chat_turn_a = ? AND chat_turn_b = ?`,
    pairId,
    chatTurnA,
    chatTurnB,
  );
}

export async function findById(db: D1Database, id: string): Promise<SXSHumanFeedback | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export function saveStmt(db: D1Database, e: SXSHumanFeedback): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: SXSHumanFeedback): Promise<SXSHumanFeedback> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, es: SXSHumanFeedback[]): Promise<SXSHumanFeedback[]> {
  if (es.length) await db.batch(es.map((e) => saveStmt(db, e)));
  return es;
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE id = ?`, id);
}
