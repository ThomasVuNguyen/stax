/**
 * Port of domain/evaluator/heuristic/PointwiseHeuristicEvaluatorRepository
 * (JpaRepository<PointwiseHeuristicEvaluator, String>).
 *
 * - `user` params become `userId`.
 * - Inherited: findById, save, saveStmt, delete, deleteById. Deleting an evaluator removes its
 *   scores through the FK ON DELETE CASCADE (as in MySQL); no JPA cascade exists.
 */
import { all, first, run, scalar } from "../../../lib/db";
import { touch, upsertStmt } from "../../../entities/EntitySupport";
import {
  type PointwiseHeuristicEvaluator,
  TABLE,
  fromRow,
  prePersist,
  toRow,
} from "../../../entities/PointwiseHeuristicEvaluator";

/** Derived `findAllByUser(user)`. */
export async function findAllByUser(db: D1Database, userId: string | null): Promise<PointwiseHeuristicEvaluator[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE user_id IS ?`, userId);
  return rows.map(fromRow);
}

export async function checkIfPointwiseHeuristicEvaluatorNameExists(
  db: D1Database,
  name: string,
  userId: string,
): Promise<boolean> {
  const n = await scalar<number>(db, `SELECT COUNT(*) FROM "${TABLE}" WHERE name = ? AND user_id = ?`, name, userId);
  return (n ?? 0) > 0;
}

export async function findAllNonDeprecatedByUser(db: D1Database, userId: string): Promise<PointwiseHeuristicEvaluator[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE user_id = ? AND is_deprecated = 0`, userId);
  return rows.map(fromRow);
}

export async function findByIdAndUser(
  db: D1Database,
  id: string,
  userId: string,
): Promise<PointwiseHeuristicEvaluator | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ? AND user_id = ?`, id, userId);
  return row ? fromRow(row) : null;
}

export async function findById(db: D1Database, id: string): Promise<PointwiseHeuristicEvaluator | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export function saveStmt(db: D1Database, e: PointwiseHeuristicEvaluator): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: PointwiseHeuristicEvaluator): Promise<PointwiseHeuristicEvaluator> {
  await saveStmt(db, e).run();
  return e;
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE id = ?`, id);
}

export async function delete_(db: D1Database, e: PointwiseHeuristicEvaluator): Promise<void> {
  if (e.id) await deleteById(db, e.id);
}
export { delete_ as delete };
