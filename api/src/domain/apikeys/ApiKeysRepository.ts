/**
 * Port of domain/apikeys/ApiKeysRepository (JpaRepository<ApiKeys, String>).
 * - `User user` params → `userId` (api_keys.user_id is unique).
 * - Key lookups return the stored (encrypted) value or null when the user has no row.
 * - Inherited methods used by Java: saveAndFlush (alias of save); findById included.
 */
import { first, run } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type ApiKeys, TABLE, fromRow, prePersist, toRow } from "../../entities/ApiKeys";

export async function findByUser(db: D1Database, userId: string): Promise<ApiKeys | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE user_id = ?`, userId);
  return row ? fromRow(row) : null;
}

async function keyColumn(db: D1Database, column: string, userId: string): Promise<string | null> {
  const row = await first<Record<string, string | null>>(db, `SELECT ${column} AS v FROM "${TABLE}" WHERE user_id = ?`, userId);
  return row ? (row.v ?? null) : null;
}

export async function findOpenAIKeyByUser(db: D1Database, userId: string): Promise<string | null> {
  return keyColumn(db, "openai_key", userId);
}

export async function findMistralKeyByUser(db: D1Database, userId: string): Promise<string | null> {
  return keyColumn(db, "mistral_key", userId);
}

export async function findAnthropicKeyByUser(db: D1Database, userId: string): Promise<string | null> {
  return keyColumn(db, "anthropic_key", userId);
}

export async function findGoogleKeyByUser(db: D1Database, userId: string): Promise<string | null> {
  return keyColumn(db, "google_key", userId);
}

export async function findGrokKeyByUser(db: D1Database, userId: string): Promise<string | null> {
  return keyColumn(db, "grok_key", userId);
}

export async function findOllamaKeyByUser(db: D1Database, userId: string): Promise<string | null> {
  return keyColumn(db, "ollama_key", userId);
}

export async function findDeepseekKeyByUser(db: D1Database, userId: string): Promise<string | null> {
  return keyColumn(db, "deepseek_key", userId);
}

export async function findHuggingfaceKeyByUser(db: D1Database, userId: string): Promise<string | null> {
  return keyColumn(db, "huggingface_key", userId);
}

export async function findLlamaKeyByUser(db: D1Database, userId: string): Promise<string | null> {
  return keyColumn(db, "llama_key", userId);
}

/** Derived delete; returns the deleted row count. */
export async function deleteByUser(db: D1Database, userId: string): Promise<number> {
  const res = await run(db, `DELETE FROM "${TABLE}" WHERE user_id = ?`, userId);
  return res.meta.changes ?? 0;
}

export async function findById(db: D1Database, id: string): Promise<ApiKeys | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export function saveStmt(db: D1Database, e: ApiKeys): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: ApiKeys): Promise<ApiKeys> {
  await saveStmt(db, e).run();
  return e;
}

export const saveAndFlush = save;
