/**
 * Port of domain/user/UserDataDeletionRepository (NamedParameterJdbcTemplate class).
 * - `DELETE … LIMIT n` is not available in D1/SQLite, so limited deletes use
 *   `WHERE rowid IN (SELECT rowid … LIMIT n)`.
 * - Table existence is checked in `sqlite_master` (instead of information_schema); table names are
 *   only interpolated after that check.
 * - Mapping tables without user_id (turn_inputs, llm_turn_inputs, pairwise_llm_turn_inputs) and
 *   `user` (keyed by id) are special-cased exactly like Java.
 */
import { type Param, all, chunk, first, placeholders, run, scalar, stmt } from "../../lib/db";
import { IllegalArgumentException } from "../../lib/errors";

function validateInputs(tableName: string | null, userId: string | null, limit: number | null): void {
  if (tableName == null || tableName.trim() === "") {
    throw new IllegalArgumentException("Table name cannot be null or empty");
  }
  if (userId == null || userId.trim() === "") {
    throw new IllegalArgumentException("User ID cannot be null or empty");
  }
  if (limit != null && limit <= 0) {
    throw new IllegalArgumentException("Limit must be a positive integer");
  }
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  try {
    const row = await first<{ n: number }>(
      db,
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?`,
      tableName,
    );
    if (!row || row.n <= 0) {
      console.warn(`Table '${tableName}' does not exist in the database`);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`Error checking if table '${tableName}' exists`, e);
    return false;
  }
}

/** Deletes `WHERE turn_id IN (ids)` in chunks; returns the affected row count. */
async function deleteByTurnIds(db: D1Database, table: string, turnIds: string[]): Promise<number> {
  if (!turnIds.length) return 0;
  const stmts = chunk(turnIds as Param[]).map((part) =>
    stmt(db, `DELETE FROM "${table}" WHERE turn_id IN ${placeholders(part.length)}`, ...part),
  );
  const results = await db.batch(stmts);
  return results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
}

async function deleteMappingByUser(
  db: D1Database,
  mappingTable: string,
  ownerTable: string,
  userId: string,
  limit: number,
): Promise<number> {
  const ids = await all<{ turn_id: string }>(
    db,
    `SELECT m.turn_id FROM "${mappingTable}" m INNER JOIN "${ownerTable}" o ON m.turn_id = o.id WHERE o.user_id = ? LIMIT ?`,
    userId,
    limit,
  );
  return deleteByTurnIds(
    db,
    mappingTable,
    ids.map((r) => r.turn_id),
  );
}

async function countMappingByUser(
  db: D1Database,
  mappingTable: string,
  ownerTable: string,
  userId: string,
): Promise<number> {
  return (
    (await scalar<number>(
      db,
      `SELECT COUNT(*) FROM "${mappingTable}" m INNER JOIN "${ownerTable}" o ON m.turn_id = o.id WHERE o.user_id = ?`,
      userId,
    )) ?? 0
  );
}

/** Deletes up to `limit` rows of `tableName` owned by `userId`; returns the deleted row count. */
export async function deleteByTableAndUserWithLimit(
  db: D1Database,
  tableName: string,
  userId: string,
  limit: number,
): Promise<number> {
  validateInputs(tableName, userId, limit);
  if (!(await tableExists(db, tableName))) {
    console.warn(`Skipping deletion for non-existent table: ${tableName}`);
    return 0;
  }
  if (tableName === "turn_inputs") return deleteMappingByUser(db, "turn_inputs", "chat_turns", userId, limit);
  if (tableName === "llm_turn_inputs") return deleteMappingByUser(db, "llm_turn_inputs", "llm_evaluator", userId, limit);
  if (tableName === "pairwise_llm_turn_inputs")
    return deleteMappingByUser(db, "pairwise_llm_turn_inputs", "pairwise_llm_evaluator", userId, limit);
  if (tableName === "user") {
    const res = await run(db, `DELETE FROM "user" WHERE id = ?`, userId);
    return res.meta.changes ?? 0;
  }
  const res = await run(
    db,
    `DELETE FROM "${tableName}" WHERE rowid IN (SELECT rowid FROM "${tableName}" WHERE user_id = ? LIMIT ?)`,
    userId,
    limit,
  );
  return res.meta.changes ?? 0;
}

/** Number of rows of `tableName` owned by `userId` (0 for unknown tables). */
export async function countByTableAndUser(db: D1Database, tableName: string, userId: string): Promise<number> {
  validateInputs(tableName, userId, null);
  if (!(await tableExists(db, tableName))) {
    console.warn(`Table '${tableName}' does not exist, returning count 0`);
    return 0;
  }
  if (tableName === "turn_inputs") return countMappingByUser(db, "turn_inputs", "chat_turns", userId);
  if (tableName === "llm_turn_inputs") return countMappingByUser(db, "llm_turn_inputs", "llm_evaluator", userId);
  if (tableName === "pairwise_llm_turn_inputs")
    return countMappingByUser(db, "pairwise_llm_turn_inputs", "pairwise_llm_evaluator", userId);
  if (tableName === "user") return (await scalar<number>(db, `SELECT COUNT(*) FROM "user" WHERE id = ?`, userId)) ?? 0;
  return (await scalar<number>(db, `SELECT COUNT(*) FROM "${tableName}" WHERE user_id = ?`, userId)) ?? 0;
}
