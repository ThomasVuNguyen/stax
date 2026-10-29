/**
 * Port of domain/user/UserRepository (JpaRepository<User, String>).
 * Inherited methods used by Java: save, saveAndFlush (alias of save).
 * The table is named `user` and must always be quoted.
 */
import { first, now, scalar } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { TABLE, type User, fromRow, prePersist, toRow } from "../../entities/User";

export async function findByEmail(db: D1Database, email: string): Promise<User | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE email = ?`, email);
  return row ? fromRow(row) : null;
}

export async function findById(db: D1Database, id: string): Promise<User | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function existsByEmail(db: D1Database, email: string): Promise<boolean> {
  return (await scalar<number>(db, `SELECT EXISTS(SELECT 1 FROM "${TABLE}" WHERE email = ?)`, email)) === 1;
}

/** Upsert; @CreationTimestamp on createdAt and enabledAt (kept on update). */
export function saveStmt(db: D1Database, e: User): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  if (!e.enabledAt) e.enabledAt = e.createdAt ?? now();
  return upsertStmt(db, TABLE, toRow(e), "id", ["created_at", "enabled_at"]);
}

export async function save(db: D1Database, e: User): Promise<User> {
  await saveStmt(db, e).run();
  return e;
}

export const saveAndFlush = save;
