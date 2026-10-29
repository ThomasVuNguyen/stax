/**
 * Port of domain/project/ProjectRepository (JpaRepository<Project, String>).
 * All queries are restricted to `container_type = 'PROJECT'` (Hibernate's discriminator filter).
 * Entity params become ids: `User user` → `userId`. `EvaluationType type` stays an enum.
 * The two `…OrderByIsDefaultDescUpdatedAtDesc(…, Pageable)` methods return a plain list (Java
 * `List<Project>`, no count query); a pageable sort is appended after the derived ORDER BY.
 * `deleteByUserAndId` returns the number of deleted rows. `saveAndFlush` = `save`.
 */
import { all, first, run, scalar } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type Project, COLUMNS, TABLE, fromRow, prePersist, toRow } from "../../entities/Project";
import type { EvaluationType } from "../../enums/EvaluationType";
import * as EvaluationTypeConverter from "../../util/converter/EvaluationTypeConverter";
import { type Pageable, limitOffset } from "../../util/Page";

const IS_PROJECT = `container_type = 'PROJECT'`;
const SORT_COLUMNS: Record<string, string> = { ...COLUMNS };

function extraSort(pageable: Pageable): string {
  return (pageable.sort ?? [])
    .filter((o) => SORT_COLUMNS[o.property])
    .map((o) => `, ${SORT_COLUMNS[o.property]} ${o.direction}`)
    .join("");
}

export async function findById(db: D1Database, id: string): Promise<Project | null> {
  const row = await first(db, `SELECT * FROM evaluation_container WHERE id = ? AND ${IS_PROJECT}`, id);
  return row ? fromRow(row) : null;
}

export async function findAllByUserOrderByIsDefaultDescUpdatedAtDesc(
  db: D1Database,
  userId: string,
  pageable: Pageable,
): Promise<Project[]> {
  const rows = await all(
    db,
    `SELECT * FROM evaluation_container WHERE user_id = ? AND ${IS_PROJECT}
     ORDER BY is_default DESC, updated_at DESC${extraSort(pageable)} LIMIT ? OFFSET ?`,
    userId,
    ...limitOffset(pageable),
  );
  return rows.map(fromRow);
}

export async function findAllByUserAndEvaluationTypeOrderByIsDefaultDescUpdatedAtDesc(
  db: D1Database,
  userId: string,
  type: EvaluationType,
  pageable: Pageable,
): Promise<Project[]> {
  const rows = await all(
    db,
    `SELECT * FROM evaluation_container WHERE user_id = ? AND evaluation_type = ? AND ${IS_PROJECT}
     ORDER BY is_default DESC, updated_at DESC${extraSort(pageable)} LIMIT ? OFFSET ?`,
    userId,
    EvaluationTypeConverter.convertToDatabaseColumn(type),
    ...limitOffset(pageable),
  );
  return rows.map(fromRow);
}

export async function findAllByUser(db: D1Database, userId: string): Promise<Project[]> {
  return (await all(db, `SELECT * FROM evaluation_container WHERE user_id = ? AND ${IS_PROJECT}`, userId)).map(fromRow);
}

export async function findByUserAndId(db: D1Database, userId: string, projectId: string): Promise<Project | null> {
  const row = await first(
    db,
    `SELECT * FROM evaluation_container WHERE user_id = ? AND id = ? AND ${IS_PROJECT}`,
    userId,
    projectId,
  );
  return row ? fromRow(row) : null;
}

export async function deleteByUserAndId(db: D1Database, userId: string, projectId: string): Promise<number> {
  const res = await run(db, `DELETE FROM evaluation_container WHERE user_id = ? AND id = ? AND ${IS_PROJECT}`, userId, projectId);
  return res.meta.changes ?? 0;
}

export async function countByUser(db: D1Database, userId: string): Promise<number> {
  return (await scalar<number>(db, `SELECT COUNT(*) FROM evaluation_container WHERE user_id = ? AND ${IS_PROJECT}`, userId)) ?? 0;
}

/** Statement form of save() for db.batch([...]). Mutates `e` (id, default evaluationType, timestamps). */
export function saveStmt(db: D1Database, e: Project): D1PreparedStatement {
  prePersist(e); // only fills a null id / evaluationType
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: Project): Promise<Project> {
  await saveStmt(db, e).run();
  return e;
}

export const saveAndFlush = save;
