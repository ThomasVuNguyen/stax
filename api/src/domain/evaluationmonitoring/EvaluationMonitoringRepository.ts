/**
 * Port of domain/evaluationmonitoring/EvaluationMonitoringRepository
 * (JpaRepository<EvaluationMonitoring, String>).
 *
 * - Entity parameters become ids: `findEvaluationMonitroginsByList(db, ids, userId)`,
 *   `findEvaluationMonitoringByContainerAndUser(db, containerId, userId)`.
 * - The Java method name typo `findEvaluationMonitroginsByList` is kept on purpose.
 * - Inherited methods used by Java: save, saveAll, deleteAll(entities). findById/findAllById/
 *   deleteById/delete are included for completeness.
 * - Deleting does NOT cascade: callers delete referencing score / pairwise_score rows first
 *   (Java: scoreRepository.deleteByEvaluationMonitoringIn(...) before deleteAll).
 */
import { all, allIn, first, run } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import {
  type EvaluationMonitoring,
  TABLE,
  fromRow,
  prePersist,
  toRow,
} from "../../entities/EvaluationMonitoring";

export async function findById(db: D1Database, id: string): Promise<EvaluationMonitoring | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllById(db: D1Database, ids: string[]): Promise<EvaluationMonitoring[]> {
  const rows = await allIn(db, (inC) => `SELECT * FROM "${TABLE}" WHERE id IN ${inC}`, ids);
  return rows.map(fromRow);
}

/** JPQL `SELECT em FROM EvaluationMonitoring em WHERE em.id IN :ids AND em.user = :user` */
export async function findEvaluationMonitroginsByList(
  db: D1Database,
  ids: string[],
  userId: string,
): Promise<EvaluationMonitoring[]> {
  const rows = await allIn(
    db,
    (inC) => `SELECT * FROM "${TABLE}" WHERE id IN ${inC} AND user_id = ?`,
    ids,
    userId,
  );
  return rows.map(fromRow);
}

/** Derived query: container = :container AND user = :user. */
export async function findEvaluationMonitoringByContainerAndUser(
  db: D1Database,
  containerId: string,
  userId: string,
): Promise<EvaluationMonitoring[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE container_id = ? AND user_id = ?`, containerId, userId);
  return rows.map(fromRow);
}

/** Statement form of save() for use inside db.batch([...]). Mutates `e` (id, timestamps). */
export function saveStmt(db: D1Database, e: EvaluationMonitoring): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: EvaluationMonitoring): Promise<EvaluationMonitoring> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, es: EvaluationMonitoring[]): Promise<EvaluationMonitoring[]> {
  if (es.length) await db.batch(es.map((e) => saveStmt(db, e)));
  return es;
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE id = ?`, id);
}

export async function delete_(db: D1Database, e: EvaluationMonitoring): Promise<void> {
  if (e.id != null) await deleteById(db, e.id);
}
export { delete_ as delete };

/** `deleteAll(Iterable<EvaluationMonitoring>)` */
export async function deleteAll(db: D1Database, es: EvaluationMonitoring[]): Promise<void> {
  const ids = es.map((e) => e.id).filter((id): id is string => id != null);
  if (!ids.length) return;
  await db.batch(ids.map((id) => db.prepare(`DELETE FROM "${TABLE}" WHERE id = ?`).bind(id)));
}
