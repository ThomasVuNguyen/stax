/**
 * Port of domain/project/EvaluationContainerRepository (JpaRepository<EvaluationContainer, String>).
 * Polymorphic over the single table `evaluation_container`: rows are returned as Project or
 * DataSet according to `container_type` (see entities/EvaluationContainer).
 * `findByIdAndUser(id, user)` → `(db, id, userId)`; `deleteByUserAndId(user, id)` → `(db, userId, id)`
 * returns the number of deleted rows (EvaluationContainer declares no JPA cascades).
 */
import { all, first, run } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import {
  type EvaluationContainer,
  TABLE,
  fromRow,
  prePersist,
  toRow,
} from "../../entities/EvaluationContainer";

export async function findById(db: D1Database, id: string): Promise<EvaluationContainer | null> {
  const row = await first(db, `SELECT * FROM evaluation_container WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function existsById(db: D1Database, id: string): Promise<boolean> {
  return (await first(db, `SELECT 1 AS x FROM evaluation_container WHERE id = ?`, id)) != null;
}

export async function findAll(db: D1Database): Promise<EvaluationContainer[]> {
  return (await all(db, `SELECT * FROM evaluation_container`)).map(fromRow);
}

export async function findByIdAndUser(db: D1Database, id: string, userId: string): Promise<EvaluationContainer | null> {
  const row = await first(db, `SELECT * FROM evaluation_container WHERE id = ? AND user_id = ?`, id, userId);
  return row ? fromRow(row) : null;
}

export async function deleteByUserAndId(db: D1Database, userId: string, containerId: string): Promise<number> {
  const res = await run(db, `DELETE FROM evaluation_container WHERE user_id = ? AND id = ?`, userId, containerId);
  return res.meta.changes ?? 0;
}

/** Statement form of save() for db.batch([...]). Mutates `e` (id, default evaluationType, timestamps). */
export function saveStmt(db: D1Database, e: EvaluationContainer): D1PreparedStatement {
  prePersist(e); // subclass prePersist only fills null id / evaluationType
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save<T extends EvaluationContainer>(db: D1Database, e: T): Promise<T> {
  await saveStmt(db, e).run();
  return e;
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await run(db, `DELETE FROM evaluation_container WHERE id = ?`, id);
}

async function delete_(db: D1Database, e: EvaluationContainer): Promise<void> {
  if (e.id) await deleteById(db, e.id);
}
export { delete_ as delete };
