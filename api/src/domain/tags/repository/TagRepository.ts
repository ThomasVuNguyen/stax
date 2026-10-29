/**
 * Port of domain/tags/repository/TagRepository (JpaRepository<Tag, String> + TagRepositoryCustom).
 * - PK is `tag_id` (entity field `tagId`).
 * - `User user` params → `userId`.
 * - Set<Tag> results → Tag[].
 * - Inherited methods used by Java: findAllById, save, saveAll, saveAndFlush, saveAllAndFlush
 *   (the *AndFlush variants are aliases).
 * - Custom method `findWithFilters` is re-exported from TagRepositoryCustom.ts.
 */
import { type Param, all, allIn, first, run, scalar } from "../../../lib/db";
import type { TagType } from "../../../enums/TagType";
import { touch, upsertStmt } from "../../../entities/EntitySupport";
import { ID_COLUMN, TABLE, type Tag, fromRow, prePersist, toRow } from "../../../entities/Tag";
import * as TagTypeConverter from "../../../util/converter/TagTypeConverter";

export * from "./TagRepositoryCustom";

export async function findAllTagsByTagIdsAndUser(
  db: D1Database,
  tagIds: string[],
  userId: string,
): Promise<Tag[]> {
  const rows = await allIn(
    db,
    (inClause) => `SELECT * FROM "${TABLE}" WHERE tag_id IN ${inClause} AND user_id = ?`,
    tagIds,
    userId,
  );
  return rows.map(fromRow);
}

/** Count of the user's tags with this name and type, excluding `tagId` when given. */
export async function countTagBy(
  db: D1Database,
  tagId: string | null,
  tagName: string,
  type: TagType | null,
  userId: string,
): Promise<number> {
  return (
    (await scalar<number>(
      db,
      `SELECT COUNT(*) FROM "${TABLE}" WHERE (? IS NULL OR tag_id != ?) AND tag_name = ? AND user_id = ? AND type = ?`,
      tagId,
      tagId,
      tagName,
      userId,
      TagTypeConverter.convertToDatabaseColumn(type),
    )) ?? 0
  );
}

export async function findAllUserTags(db: D1Database, userId: string): Promise<Tag[]> {
  return (await all(db, `SELECT * FROM "${TABLE}" WHERE user_id = ? ORDER BY created_at DESC`, userId)).map(
    fromRow,
  );
}

export async function findByTagNameAndUser(
  db: D1Database,
  tagName: string,
  userId: string,
): Promise<Tag | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE tag_name = ? AND user_id = ? LIMIT 1`, tagName, userId);
  return row ? fromRow(row) : null;
}

export async function findByTagIdAndUser(db: D1Database, tagId: string, userId: string): Promise<Tag | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE tag_id = ? AND user_id = ?`, tagId, userId);
  return row ? fromRow(row) : null;
}

/** Derived delete; returns the number of deleted tags. Tag has no JPA cascades. */
export async function deleteByUserAndTagId(db: D1Database, userId: string, tagId: string): Promise<number> {
  const res = await run(db, `DELETE FROM "${TABLE}" WHERE user_id = ? AND tag_id = ?`, userId, tagId);
  return res.meta.changes ?? 0;
}

export async function findByIdOrNameAndUserId(
  db: D1Database,
  idOrName: string,
  userId: string,
): Promise<Tag | null> {
  const row = await first(
    db,
    `SELECT * FROM "${TABLE}" WHERE (tag_id = ? OR tag_name = ?) AND user_id = ? LIMIT 1`,
    idOrName,
    idOrName,
    userId,
  );
  return row ? fromRow(row) : null;
}

export async function countUserTags(db: D1Database, userId: string): Promise<number> {
  return (await scalar<number>(db, `SELECT COUNT(1) FROM "${TABLE}" WHERE user_id = ? AND type = 'USER'`, userId)) ?? 0;
}

export async function findById(db: D1Database, tagId: string): Promise<Tag | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE tag_id = ?`, tagId);
  return row ? fromRow(row) : null;
}

export async function findAllById(db: D1Database, tagIds: string[]): Promise<Tag[]> {
  const rows = await allIn(db, (inClause) => `SELECT * FROM "${TABLE}" WHERE tag_id IN ${inClause}`, tagIds as Param[]);
  return rows.map(fromRow);
}

export function saveStmt(db: D1Database, e: Tag): D1PreparedStatement {
  if (e.tagId == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e), ID_COLUMN);
}

export async function save(db: D1Database, e: Tag): Promise<Tag> {
  await saveStmt(db, e).run();
  return e;
}

export const saveAndFlush = save;

export async function saveAll(db: D1Database, entities: Tag[]): Promise<Tag[]> {
  if (entities.length) await db.batch(entities.map((e) => saveStmt(db, e)));
  return entities;
}

export const saveAllAndFlush = saveAll;
