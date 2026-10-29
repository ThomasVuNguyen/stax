/**
 * Port of domain/tags/repository/TagLinkRepository (JpaRepository<TagLink, String>).
 * - `Tag tag` params → `tagId` (the tag's PK `tag_id`); `User user` params → `userId`.
 * - Set<TagLink> results → TagLink[] (deduplicated by id).
 * - `findTargetIdAndTagIdByTargetIdsAndTypeAndUser` returns `[targetId, tagId]` tuples, mirroring
 *   the Java `Object[]` rows (`row[0]`, `row[1]`).
 * - TagLink.tag is an EAGER @ManyToOne in Java (and `findByTargetOrTag` uses JOIN FETCH): load the
 *   tags with the helper `findTagsByTagLinks(db, links)` → Map<tagId, Tag>.
 * - Inherited methods used by Java: save, saveAll, saveAllAndFlush (alias), deleteAll(entities).
 * - `(:list IS NULL OR … IN :list)` JPQL params: pass `null` to disable the filter.
 */
import { type Param, all, allIn, chunk, placeholders, run, stmt } from "../../../lib/db";
import { touch, upsertStmt } from "../../../entities/EntitySupport";
import * as TagEntity from "../../../entities/Tag";
import type { Tag } from "../../../entities/Tag";
import { TABLE, type TagLink, fromRow, prePersist, toRow } from "../../../entities/TagLink";

/** Runs a statement over a chunked IN list (ids bound first, then `extra`) in one batch. */
async function runIn(
  db: D1Database,
  sqlWithIn: (inClause: string) => string,
  ids: Param[],
  ...extra: Param[]
): Promise<number> {
  if (!ids.length) return 0;
  const stmts = chunk(ids, 90 - extra.length).map((part) =>
    stmt(db, sqlWithIn(placeholders(part.length)), ...part, ...extra),
  );
  const results = await db.batch(stmts);
  return results.reduce((n, r) => n + (r.meta.changes ?? 0), 0);
}

function dedupe(links: TagLink[]): TagLink[] {
  const seen = new Map<string | null, TagLink>();
  for (const l of links) seen.set(l.id, l);
  return [...seen.values()];
}

export async function findByTag(db: D1Database, tagId: string, userId: string): Promise<TagLink[]> {
  return (await all(db, `SELECT * FROM "${TABLE}" WHERE tag_id = ? AND user_id = ?`, tagId, userId)).map(fromRow);
}

export async function findByTagAndTargetType(
  db: D1Database,
  tagId: string,
  targetType: string,
  userId: string,
): Promise<TagLink[]> {
  return (
    await all(db, `SELECT * FROM "${TABLE}" WHERE tag_id = ? AND target_type = ? AND user_id = ?`, tagId, targetType, userId)
  ).map(fromRow);
}

export async function findByTargetIdAndTargetType(
  db: D1Database,
  targetId: string,
  targetType: string,
  userId: string,
): Promise<TagLink[]> {
  return (
    await all(
      db,
      `SELECT * FROM "${TABLE}" WHERE target_id = ? AND target_type = ? AND user_id = ?`,
      targetId,
      targetType,
      userId,
    )
  ).map(fromRow);
}

export async function findByTargetIdsAndTargetType(
  db: D1Database,
  targetIds: string[],
  targetType: string,
  userId: string,
): Promise<TagLink[]> {
  const rows = await allIn(
    db,
    (inClause) => `SELECT * FROM "${TABLE}" WHERE target_id IN ${inClause} AND target_type = ? AND user_id = ?`,
    targetIds,
    targetType,
    userId,
  );
  return rows.map(fromRow);
}

/**
 * `((:targetIds IS NULL AND :targetType IS NULL) OR (targetId IN :targetIds AND targetType = :targetType))
 *  AND (:tagIds IS NULL OR tag.id IN :tagIds) AND user = :user` (JOIN FETCH tag → use findTagsByTagLinks).
 */
export async function findByTargetOrTag(
  db: D1Database,
  targetIds: string[] | null,
  targetType: string | null,
  tagIds: string[] | null,
  userId: string,
): Promise<TagLink[]> {
  const tagFilter = (params: Param[]): string => {
    if (tagIds == null) return "";
    params.push(...tagIds);
    return ` AND tag_id IN ${placeholders(tagIds.length)}`;
  };
  // Both target params null → no target filter (Java's first disjunct).
  if (targetIds == null && targetType == null) {
    const params: Param[] = [];
    const sql = `SELECT * FROM "${TABLE}" WHERE 1 = 1${tagFilter(params)} AND user_id = ?`;
    return dedupe((await all(db, sql, ...params, userId)).map(fromRow));
  }
  if (targetIds == null || !targetIds.length) return [];
  const out: TagLink[] = [];
  const room = Math.max(1, 90 - (tagIds?.length ?? 0) - 2);
  for (const part of chunk(targetIds, room)) {
    const params: Param[] = [...part, targetType];
    const sql =
      `SELECT * FROM "${TABLE}" WHERE target_id IN ${placeholders(part.length)} AND target_type = ?` +
      `${tagFilter(params)} AND user_id = ?`;
    out.push(...(await all(db, sql, ...params, userId)).map(fromRow));
  }
  return dedupe(out);
}

/** Rows of `[targetId, tagId]` (Java `List<Object[]>`). */
export async function findTargetIdAndTagIdByTargetIdsAndTypeAndUser(
  db: D1Database,
  targetIds: string[],
  targetType: string,
  userId: string,
): Promise<[string, string][]> {
  const rows = await allIn<{ target_id: string; tag_id: string }>(
    db,
    (inClause) =>
      `SELECT target_id, tag_id FROM "${TABLE}" WHERE target_id IN ${inClause} AND target_type = ? AND user_id = ?`,
    targetIds,
    targetType,
    userId,
  );
  return rows.map((r) => [r.target_id, r.tag_id]);
}

export async function findByTargetType(db: D1Database, targetType: string, userId: string): Promise<TagLink[]> {
  return (await all(db, `SELECT * FROM "${TABLE}" WHERE target_type = ? AND user_id = ?`, targetType, userId)).map(
    fromRow,
  );
}

export async function deleteByTag(db: D1Database, tagId: string, userId: string): Promise<number> {
  const res = await run(db, `DELETE FROM "${TABLE}" WHERE tag_id = ? AND user_id = ?`, tagId, userId);
  return res.meta.changes ?? 0;
}

export async function deleteByTagIds(db: D1Database, tagIds: string[], userId: string): Promise<number> {
  return runIn(db, (inClause) => `DELETE FROM "${TABLE}" WHERE tag_id IN ${inClause} AND user_id = ?`, tagIds, userId);
}

export async function deleteByTargetIdListAndTargetType(
  db: D1Database,
  targetIdList: string[],
  targetType: string,
  userId: string,
): Promise<number> {
  return runIn(
    db,
    (inClause) => `DELETE FROM "${TABLE}" WHERE target_id IN ${inClause} AND target_type = ? AND user_id = ?`,
    targetIdList,
    targetType,
    userId,
  );
}

/** Evaluation monitoring ids of the scores of the given chat turns' model responses (not distinct). */
export async function findEvaluationMonitoringIdsByChatTurnIds(
  db: D1Database,
  chatTurnIds: string[],
  userId: string,
): Promise<string[]> {
  const rows = await allIn<{ id: string }>(
    db,
    (inClause) =>
      `SELECT em.id AS id FROM "evaluation_monitoring" em
       JOIN "score" s ON s.evaluation_monitoring_id = em.id
       WHERE s.model_response_id IN (SELECT ct.model_response_id FROM "chat_turns" ct WHERE ct.id IN ${inClause})
         AND em.user_id = ?`,
    chatTurnIds,
    userId,
  );
  return rows.map((r) => r.id);
}

/** Inference monitoring ids of the given chat turns' model responses. */
export async function findInferenceMonitoringIdsByChatTurnIds(
  db: D1Database,
  chatTurnIds: string[],
  userId: string,
): Promise<string[]> {
  const rows = await allIn<{ id: string }>(
    db,
    (inClause) =>
      `SELECT im.id AS id FROM "inference_monitoring" im
       JOIN "model_response" mr ON mr.inference_monitoring_id = im.id
       JOIN "chat_turns" ct ON ct.model_response_id = mr.id
       WHERE ct.id IN ${inClause} AND im.user_id = ?`,
    chatTurnIds,
    userId,
  );
  return rows.map((r) => r.id);
}

async function findMonitoringTagLinks(
  db: D1Database,
  targetType: "EVALUATION_MONITORING" | "INFERENCE_MONITORING",
  targetSubquery: (inClause: string) => string,
  chatTurnIds: string[],
  tagIds: string[] | null,
  userId: string,
): Promise<TagLink[]> {
  if (!chatTurnIds.length) return [];
  const out: TagLink[] = [];
  const room = Math.max(1, 90 - (tagIds?.length ?? 0) - 1);
  for (const part of chunk(chatTurnIds, room)) {
    const params: Param[] = [userId];
    let sql = `SELECT tl.* FROM "${TABLE}" tl WHERE tl.target_type = '${targetType}' AND tl.user_id = ?`;
    if (tagIds != null) {
      sql += ` AND tl.tag_id IN ${placeholders(tagIds.length)}`;
      params.push(...tagIds);
    }
    sql += ` AND tl.target_id IN (${targetSubquery(placeholders(part.length))})`;
    params.push(...part);
    out.push(...(await all(db, sql, ...params)).map(fromRow));
  }
  return dedupe(out);
}

export async function findEvaluationTagLinksByChatTurnIdsAndTagIds(
  db: D1Database,
  chatTurnIds: string[],
  tagIds: string[] | null,
  userId: string,
): Promise<TagLink[]> {
  return findMonitoringTagLinks(
    db,
    "EVALUATION_MONITORING",
    (inClause) =>
      `SELECT DISTINCT s.evaluation_monitoring_id FROM "score" s
       WHERE s.model_response_id IN (SELECT ct.model_response_id FROM "chat_turns" ct WHERE ct.id IN ${inClause})`,
    chatTurnIds,
    tagIds,
    userId,
  );
}

export async function findInferenceTagLinksByChatTurnIds(
  db: D1Database,
  chatTurnIds: string[],
  tagIds: string[] | null,
  userId: string,
): Promise<TagLink[]> {
  return findMonitoringTagLinks(
    db,
    "INFERENCE_MONITORING",
    (inClause) =>
      `SELECT DISTINCT im.id FROM "inference_monitoring" im
       JOIN "model_response" mr ON mr.inference_monitoring_id = im.id
       JOIN "chat_turns" ct ON ct.model_response_id = mr.id
       WHERE ct.id IN ${inClause}`,
    chatTurnIds,
    tagIds,
    userId,
  );
}

/** Distinct tags linked (CHAT_TURN) to the chat turns whose responses were scored by this evaluation monitoring. */
export async function findTagsForEvaluationMonitoring(
  db: D1Database,
  evaluationMonitoringId: string,
  userId: string,
): Promise<Tag[]> {
  const rows = await all(
    db,
    `SELECT DISTINCT t.* FROM "score" s
     JOIN "chat_turns" ct ON s.model_response_id = ct.model_response_id
     JOIN "${TABLE}" ctl ON ctl.target_id = ct.id
     JOIN "tag" t ON t.tag_id = ctl.tag_id
     WHERE s.evaluation_monitoring_id = ? AND ctl.target_type = 'CHAT_TURN' AND ctl.user_id = ?`,
    evaluationMonitoringId,
    userId,
  );
  return rows.map(TagEntity.fromRow);
}

export async function findAllByUser(db: D1Database, userId: string): Promise<TagLink[]> {
  return (await all(db, `SELECT * FROM "${TABLE}" WHERE user_id = ?`, userId)).map(fromRow);
}

export async function deleteByIdsAndUser(db: D1Database, ids: string[], userId: string): Promise<void> {
  await runIn(db, (inClause) => `DELETE FROM "${TABLE}" WHERE id IN ${inClause} AND user_id = ?`, ids, userId);
}

/** Helper loader for the EAGER `tag` relation: Map<tagId, Tag> for the given links. */
export async function findTagsByTagLinks(db: D1Database, links: TagLink[]): Promise<Map<string, Tag>> {
  const ids = [...new Set(links.map((l) => l.tagId).filter((id): id is string => id != null))];
  const rows = await allIn(db, (inClause) => `SELECT * FROM "tag" WHERE tag_id IN ${inClause}`, ids);
  return new Map(rows.map((r) => [String(r.tag_id), TagEntity.fromRow(r)]));
}

export function saveStmt(db: D1Database, e: TagLink): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: TagLink): Promise<TagLink> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, entities: TagLink[]): Promise<TagLink[]> {
  if (entities.length) await db.batch(entities.map((e) => saveStmt(db, e)));
  return entities;
}

export const saveAllAndFlush = saveAll;

/** Inherited deleteAll(Iterable): deletes the given links by id. */
export async function deleteAll(db: D1Database, entities: TagLink[]): Promise<void> {
  await runIn(
    db,
    (inClause) => `DELETE FROM "${TABLE}" WHERE id IN ${inClause}`,
    entities.map((e) => e.id).filter((id): id is string => id != null),
  );
}
