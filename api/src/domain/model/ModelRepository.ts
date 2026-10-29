/**
 * Port of domain/model/ModelRepository (JpaRepository<Model, String> + ModelRepositoryCustom).
 *
 * - `user` params become `userId`; ModelType params stay enum strings.
 * - `findModelByIdAndUser` / `findModelByIdAndTypeAndNotDeprecated` return `Model | null`.
 * - `countModelsByUserAndType` returns a number.
 * - Custom methods (findWithDynamicFilters) are re-exported from ModelRepositoryCustom.ts.
 * - `saveAndFlush` is an alias of `save`.
 * - Inherited: findById, findAllById, existsById, save, saveStmt, saveAll, delete, deleteById.
 */
import { all, allIn, first, run, scalar } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type Model, TABLE, fromRow, prePersist, toRow } from "../../entities/Model";
import type { ModelType } from "../../enums/ModelType";

export * from "./ModelRepositoryCustom";

export async function findModelsByTypeAndNotDeprecated(db: D1Database, type: ModelType): Promise<Model[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE type = ? AND is_deprecated = 0`, type);
  return rows.map(fromRow);
}

export async function findModelsByUserAndNotDeprecated(db: D1Database, userId: string): Promise<Model[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE user_id = ? AND is_deprecated = 0`, userId);
  return rows.map(fromRow);
}

export async function findModelByIdAndUser(db: D1Database, id: string, userId: string): Promise<Model | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE user_id = ? AND id = ?`, userId, id);
  return row ? fromRow(row) : null;
}

export async function findModelByIdAndTypeAndNotDeprecated(
  db: D1Database,
  id: string,
  type: ModelType,
): Promise<Model | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ? AND type = ? AND is_deprecated = 0`, id, type);
  return row ? fromRow(row) : null;
}

/** User's models plus non-deprecated system models, newest release first (NULLs last), then label. */
export async function findNonDeprecatedUserAndSystemModels(db: D1Database, userId: string): Promise<Model[]> {
  const rows = await all(
    db,
    `SELECT * FROM "${TABLE}" WHERE user_id = ? OR (type = 'SYSTEM' AND is_deprecated = 0)
     ORDER BY release_date DESC NULLS LAST, label ASC`,
    userId,
  );
  return rows.map(fromRow);
}

export async function countModelsByUserAndType(db: D1Database, userId: string, type: ModelType): Promise<number> {
  return (
    (await scalar<number>(
      db,
      `SELECT COUNT(*) FROM "${TABLE}" WHERE user_id = ? AND type = ? AND is_deprecated = 0`,
      userId,
      type,
    )) ?? 0
  );
}

export async function findById(db: D1Database, id: string): Promise<Model | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllById(db: D1Database, ids: string[]): Promise<Model[]> {
  const rows = await allIn(db, (inClause) => `SELECT * FROM "${TABLE}" WHERE id IN ${inClause}`, ids);
  return rows.map(fromRow);
}

export async function existsById(db: D1Database, id: string): Promise<boolean> {
  return ((await scalar<number>(db, `SELECT COUNT(*) FROM "${TABLE}" WHERE id = ?`, id)) ?? 0) > 0;
}

export function saveStmt(db: D1Database, e: Model): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: Model): Promise<Model> {
  await saveStmt(db, e).run();
  return e;
}

export const saveAndFlush = save;

export async function saveAll(db: D1Database, es: Model[]): Promise<Model[]> {
  if (es.length) await db.batch(es.map((e) => saveStmt(db, e)));
  return es;
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE id = ?`, id);
}

export async function delete_(db: D1Database, e: Model): Promise<void> {
  if (e.id) await deleteById(db, e.id);
}
export { delete_ as delete };
