/**
 * Port of domain/tos/TosRepository (JpaRepository<Tos, String>).
 * Only the inherited JpaRepository methods used by the Java code are exported (findById, save).
 */
import { first, run } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type Tos, TABLE, fromRow, prePersist, toRow } from "../../entities/Tos";

export async function findById(db: D1Database, id: string): Promise<Tos | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

/**
 * JPQL `… WHERE t.isActive = true AND t.type = :type ORDER BY t.createdAt DESC` returning Optional.
 * (Spring would throw on more than one row; setPreviousTosAsInactive keeps at most one active.)
 */
export async function findFirstByIsActiveTrueAndTypeOrderByCreatedAtDesc(
  db: D1Database,
  type: string,
): Promise<Tos | null> {
  const row = await first(
    db,
    `SELECT * FROM "${TABLE}" WHERE is_active = 1 AND type = ? ORDER BY created_at DESC LIMIT 1`,
    type,
  );
  return row ? fromRow(row) : null;
}

export async function setPreviousTosAsInactive(db: D1Database, type: string): Promise<void> {
  await run(db, `UPDATE "${TABLE}" SET is_active = 0 WHERE type = ?`, type);
}

/** Statement form of save() for use inside db.batch([...]). Mutates `e` (id, timestamps). */
export function saveStmt(db: D1Database, e: Tos): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: Tos): Promise<Tos> {
  await saveStmt(db, e).run();
  return e;
}
