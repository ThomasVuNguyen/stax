/**
 * Port of domain/evaluator/human/HumanEvaluatorRepository (JpaRepository<HumanEvaluator, String>).
 *
 * - `user` params become `userId`. Derived queries use null-safe `IS ?` like Spring's
 *   null-parameter handling (`user IS NULL`).
 * - `findByUserOrScopeType(db, userId, scopeType)`: user_id = ? OR scope_type = ?.
 * - `deleteAllByUser(db, userId)`: derived delete (no JPA cascades on HumanEvaluator).
 * - Inherited: findById, save, saveStmt, delete, deleteById.
 */
import { all, first, run } from "../../../lib/db";
import { touch, upsertStmt } from "../../../entities/EntitySupport";
import { type HumanEvaluator, TABLE, fromRow, prePersist, toRow } from "../../../entities/HumanEvaluator";
import type { LinkedEntityType } from "../../../enums/LinkedEntityType";
import type { ScopeType } from "../../../enums/ScopeType";

export async function findByAssociatedEntityId(db: D1Database, entityId: string | null): Promise<HumanEvaluator[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE associated_entity_id IS ?`, entityId);
  return rows.map(fromRow);
}

export async function findByLinkedEntityType(
  db: D1Database,
  linkedEntityType: LinkedEntityType | null,
): Promise<HumanEvaluator[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE linked_entity_type IS ?`, linkedEntityType);
  return rows.map(fromRow);
}

export async function findByUser(db: D1Database, userId: string | null): Promise<HumanEvaluator[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE user_id IS ?`, userId);
  return rows.map(fromRow);
}

export async function findByUserAndLinkedEntityType(
  db: D1Database,
  userId: string | null,
  linkedEntityType: LinkedEntityType | null,
): Promise<HumanEvaluator[]> {
  const rows = await all(
    db,
    `SELECT * FROM "${TABLE}" WHERE user_id IS ? AND linked_entity_type IS ?`,
    userId,
    linkedEntityType,
  );
  return rows.map(fromRow);
}

export async function findByIdAndUser(db: D1Database, id: string, userId: string | null): Promise<HumanEvaluator | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ? AND user_id IS ?`, id, userId);
  return row ? fromRow(row) : null;
}

export async function findByUserOrScopeType(
  db: D1Database,
  userId: string | null,
  scopeType: ScopeType | null,
): Promise<HumanEvaluator[]> {
  const rows = await all(db, `SELECT * FROM "${TABLE}" WHERE user_id IS ? OR scope_type IS ?`, userId, scopeType);
  return rows.map(fromRow);
}

export async function deleteAllByUser(db: D1Database, userId: string | null): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE user_id IS ?`, userId);
}

export async function findById(db: D1Database, id: string): Promise<HumanEvaluator | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export function saveStmt(db: D1Database, e: HumanEvaluator): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: HumanEvaluator): Promise<HumanEvaluator> {
  await saveStmt(db, e).run();
  return e;
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE id = ?`, id);
}

export async function delete_(db: D1Database, e: HumanEvaluator): Promise<void> {
  if (e.id) await deleteById(db, e.id);
}
export { delete_ as delete };
