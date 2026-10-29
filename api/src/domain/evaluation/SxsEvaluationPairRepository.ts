/**
 * Port of domain/evaluation/SxsEvaluationPairRepository (JpaRepository<SxsEvaluationPair, String>).
 *
 * - Entity params become ids: `user` → `userId`, `container` → `containerId`.
 * - Overloads: `findByContainer(db, containerId)` (List) and
 *   `findByContainerPaged(db, containerId, pageable)` (Page).
 * - `findByIdInWithChatAEagerFetching`: the @EntityGraph (chatA, chatA.turns, chatTurnA.modelResponse)
 *   is not reproduced; callers load those relations explicitly.
 * - `findByContainerWithLatestTurns`: fetch joins dropped (returns pairs only); sortable
 *   properties: id, createdAt, updatedAt (the service sorts by createdAt DESC).
 * - `findPairsWithOutputOnBothSides` returns SXSPairEvaluationRequest objects
 *   ({ id, chat_turn_id_a, chat_turn_id_b } — the DTO's JSON names).
 * - delete/deleteById/deleteAll emulate the JPA cascade: pairwise_score rows (also FK ON DELETE
 *   CASCADE) and their owned evaluation_status rows are removed with the pair.
 */
import { all, allIn, first, placeholders, scalar } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type SxsEvaluationPair, TABLE, fromRow, prePersist, toRow } from "../../entities/SxsEvaluationPair";
import { type Page, type Pageable, limitOffset, orderBy, pageOf } from "../../util/Page";
import type { SXSPairEvaluationRequest } from "./dto/SXSPairEvaluationRequest";

const SORT_COLUMNS: Record<string, string> = {
  id: "p.id",
  createdAt: "p.created_at",
  updatedAt: "p.updated_at",
  expectedOutput: "p.expected_output",
};

export async function findByIdAndUser(db: D1Database, id: string, userId: string): Promise<SxsEvaluationPair | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ? AND user_id = ?`, id, userId);
  return row ? fromRow(row) : null;
}

export async function findByIdsAndUser(db: D1Database, ids: string[], userId: string): Promise<SxsEvaluationPair[]> {
  const rows = await allIn(
    db,
    (inClause) => `SELECT * FROM "${TABLE}" WHERE id IN ${inClause} AND user_id = ?`,
    ids,
    userId,
  );
  return rows.map(fromRow);
}

/** Derived `findByContainer(container, pageable)`. */
export async function findByContainerPaged(
  db: D1Database,
  containerId: string,
  pageable: Pageable,
): Promise<Page<SxsEvaluationPair>> {
  const total = (await scalar<number>(db, `SELECT COUNT(*) FROM "${TABLE}" p WHERE p.container_id = ?`, containerId)) ?? 0;
  const rows = await all(
    db,
    `SELECT p.* FROM "${TABLE}" p WHERE p.container_id = ? ${orderBy(pageable, SORT_COLUMNS)} LIMIT ? OFFSET ?`,
    containerId,
    ...limitOffset(pageable),
  );
  return pageOf(rows.map(fromRow), pageable, total);
}

/** Derived `findByContainer(container)`. */
export async function findByContainer(db: D1Database, containerId: string): Promise<SxsEvaluationPair[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE container_id = ?`, containerId);
  return rows.map(fromRow);
}

export async function findIdsByContainer(db: D1Database, containerId: string): Promise<string[]> {
  const rows = await all<{ id: string }>(db, `SELECT id FROM "${TABLE}" WHERE container_id = ?`, containerId);
  return rows.map((r) => r.id);
}

export async function findByIdInWithChatAEagerFetching(db: D1Database, ids: string[]): Promise<SxsEvaluationPair[]> {
  const rows = await allIn(db, (inClause) => `SELECT * FROM "${TABLE}" WHERE id IN ${inClause}`, ids);
  return rows.map(fromRow);
}

export async function findAllByIdInAndContainer(
  db: D1Database,
  ids: string[],
  containerId: string,
): Promise<SxsEvaluationPair[]> {
  const rows = await allIn(
    db,
    (inClause) => `SELECT * FROM "${TABLE}" WHERE id IN ${inClause} AND container_id = ?`,
    ids,
    containerId,
  );
  return rows.map(fromRow);
}

const LATEST_TURNS_FROM = `
  FROM "${TABLE}" p
  LEFT JOIN chat_turns cta ON cta.id = p.chat_turn_id_a
  LEFT JOIN chat_turns ctb ON ctb.id = p.chat_turn_id_b
  WHERE p.container_id = ? AND p.user_id = ?
  AND cta.sequence_id = (SELECT MAX(ct.sequence_id) FROM chat_turns ct WHERE ct.chat_id = cta.chat_id)
  AND (ctb.id IS NULL OR ctb.sequence_id = (SELECT MAX(ct.sequence_id) FROM chat_turns ct WHERE ct.chat_id = ctb.chat_id))`;

/** Pairs of a container whose turn A (and B, if any) are the latest turns of their chats. */
export async function findByContainerWithLatestTurns(
  db: D1Database,
  containerId: string,
  userId: string,
  pageable: Pageable,
): Promise<Page<SxsEvaluationPair>> {
  const total =
    (await scalar<number>(db, `SELECT COUNT(DISTINCT p.id) ${LATEST_TURNS_FROM}`, containerId, userId)) ?? 0;
  const rows = await all(
    db,
    `SELECT DISTINCT p.* ${LATEST_TURNS_FROM} ${orderBy(pageable, SORT_COLUMNS)} LIMIT ? OFFSET ?`,
    containerId,
    userId,
    ...limitOffset(pageable),
  );
  return pageOf(rows.map(fromRow), pageable, total);
}

export async function findPairsWithOutputOnBothSides(
  db: D1Database,
  ids: string[],
  userId: string,
): Promise<SXSPairEvaluationRequest[]> {
  return allIn<SXSPairEvaluationRequest>(
    db,
    (inClause) => `SELECT p.id AS id, p.chat_turn_id_a AS chat_turn_id_a, p.chat_turn_id_b AS chat_turn_id_b
      FROM "${TABLE}" p
      LEFT JOIN chat_turns cta ON cta.id = p.chat_turn_id_a
      LEFT JOIN model_response mra ON mra.id = cta.model_response_id
      LEFT JOIN chat_turns ctb ON ctb.id = p.chat_turn_id_b
      LEFT JOIN model_response mrb ON mrb.id = ctb.model_response_id
      WHERE p.id IN ${inClause} AND p.user_id = ?
      AND mra.text IS NOT NULL AND TRIM(mra.text) <> ''
      AND (p.chat_turn_id_b IS NULL OR (mrb.text IS NOT NULL AND TRIM(mrb.text) <> ''))`,
    ids,
    userId,
  );
}

export async function findById(db: D1Database, id: string): Promise<SxsEvaluationPair | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllById(db: D1Database, ids: string[]): Promise<SxsEvaluationPair[]> {
  const rows = await allIn(db, (inClause) => `SELECT * FROM "${TABLE}" WHERE id IN ${inClause}`, ids);
  return rows.map(fromRow);
}

export function saveStmt(db: D1Database, e: SxsEvaluationPair): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: SxsEvaluationPair): Promise<SxsEvaluationPair> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, es: SxsEvaluationPair[]): Promise<SxsEvaluationPair[]> {
  if (es.length) await db.batch(es.map((e) => saveStmt(db, e)));
  return es;
}

/** Deletes pairs with their pairwise scores and the scores' evaluation_status rows. */
export async function deleteAllById(db: D1Database, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const statusRows = await allIn<{ evaluation_status: string | null }>(
    db,
    (inClause) => `SELECT evaluation_status FROM pairwise_score WHERE sxs_evaluation_pair IN ${inClause}`,
    ids,
  );
  const statusIds = statusRows.map((r) => r.evaluation_status).filter((x): x is string => !!x);
  const stmts: D1PreparedStatement[] = [];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    const ph = placeholders(part.length);
    stmts.push(db.prepare(`DELETE FROM pairwise_score WHERE sxs_evaluation_pair IN ${ph}`).bind(...part));
    stmts.push(db.prepare(`DELETE FROM "${TABLE}" WHERE id IN ${ph}`).bind(...part));
  }
  for (let i = 0; i < statusIds.length; i += 90) {
    const part = statusIds.slice(i, i + 90);
    stmts.push(db.prepare(`DELETE FROM evaluation_status WHERE id IN ${placeholders(part.length)}`).bind(...part));
  }
  await db.batch(stmts);
}

export async function deleteAll(db: D1Database, es: SxsEvaluationPair[]): Promise<void> {
  await deleteAllById(db, es.map((e) => e.id).filter((x): x is string => !!x));
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await deleteAllById(db, [id]);
}

export async function delete_(db: D1Database, e: SxsEvaluationPair): Promise<void> {
  if (e.id) await deleteAllById(db, [e.id]);
}
export { delete_ as delete };

export async function existsById(db: D1Database, id: string): Promise<boolean> {
  return (await scalar<number>(db, `SELECT COUNT(*) FROM "${TABLE}" WHERE id = ?`, id) ?? 0) > 0;
}

