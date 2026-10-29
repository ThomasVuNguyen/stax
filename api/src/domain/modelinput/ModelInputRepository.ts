/**
 * Port of domain/modelinput/ModelInputRepository (JpaRepository<ModelInput, String>).
 * `findByUserAndId(user, id)` → `findByUserAndId(db, userId, id)`.
 * `role` is stored by ordinal (handled by ModelInput.fromRow/toRow).
 * `flush`/`saveAllAndFlush`: no persistence context; flush is a no-op, saveAllAndFlush = saveAll.
 * `delete` removes only the row (like Java; turn_inputs / llm_turn_inputs rows referencing it
 * make the FK fail, so callers check usage first as the Java code does).
 */
import { allIn, chunk, first, run } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type ModelInput, TABLE, fromRow, prePersist, toRow } from "../../entities/ModelInput";

export async function findById(db: D1Database, id: string): Promise<ModelInput | null> {
  const row = await first(db, `SELECT * FROM model_input WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllById(db: D1Database, ids: string[]): Promise<ModelInput[]> {
  return (await allIn(db, (inn) => `SELECT * FROM model_input WHERE id IN ${inn}`, ids)).map(fromRow);
}

export async function findByUserAndId(db: D1Database, userId: string, modelInputId: string): Promise<ModelInput | null> {
  const row = await first(db, `SELECT * FROM model_input WHERE user_id = ? AND id = ?`, userId, modelInputId);
  return row ? fromRow(row) : null;
}

/** Statement form of save() for db.batch([...]). Mutates `e` (id, timestamps). */
export function saveStmt(db: D1Database, e: ModelInput): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: ModelInput): Promise<ModelInput> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, es: ModelInput[]): Promise<ModelInput[]> {
  for (const part of chunk(es, 50)) if (part.length) await db.batch(part.map((e) => saveStmt(db, e)));
  return es;
}

export const saveAndFlush = save;
export const saveAllAndFlush = saveAll;

export async function flush(_db: D1Database): Promise<void> {}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await run(db, `DELETE FROM model_input WHERE id = ?`, id);
}

async function delete_(db: D1Database, e: ModelInput): Promise<void> {
  if (e.id) await deleteById(db, e.id);
}
export { delete_ as delete };

export async function deleteAll(db: D1Database, es: ModelInput[]): Promise<void> {
  for (const e of es) await delete_(db, e);
}
