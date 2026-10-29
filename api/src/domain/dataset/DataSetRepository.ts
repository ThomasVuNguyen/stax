/**
 * Port of domain/dataset/DataSetRepository (JpaRepository<DataSet, String>).
 * All queries are restricted to `container_type = 'DATASET'`; `d.type` is the `dataset_type` column.
 *
 * Overload: Java has the inherited `findById(id)` and the @Query `findById(id, user)`. Both are
 * `findById(db, id, userId?)`: with `userId` it is the @Query (own USER datasets plus any
 * SYSTEM/COMMUNITY dataset), without it the plain primary-key lookup.
 * `User user` params become `userId`.
 */
import { all, first, scalar } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import { type DataSet, TABLE, fromRow, prePersist, toRow } from "../../entities/DataSet";

const IS_DATASET = `container_type = 'DATASET'`;

export async function findById(db: D1Database, id: string, userId?: string): Promise<DataSet | null> {
  const row =
    userId === undefined
      ? await first(db, `SELECT * FROM evaluation_container WHERE id = ? AND ${IS_DATASET}`, id)
      : await first(
          db,
          `SELECT * FROM evaluation_container WHERE id = ? AND ${IS_DATASET}
           AND ((user_id = ? AND dataset_type = 'USER') OR (dataset_type = 'SYSTEM' OR dataset_type = 'COMMUNITY'))`,
          id,
          userId,
        );
  return row ? fromRow(row) : null;
}

export async function findUserDataSetById(db: D1Database, id: string, userId: string): Promise<DataSet | null> {
  const row = await first(
    db,
    `SELECT * FROM evaluation_container WHERE id = ? AND user_id = ? AND dataset_type = 'USER' AND ${IS_DATASET}`,
    id,
    userId,
  );
  return row ? fromRow(row) : null;
}

/** Counts only the user's own USER datasets. */
export async function countByUser(db: D1Database, userId: string): Promise<number> {
  return (
    (await scalar<number>(
      db,
      `SELECT COUNT(*) FROM evaluation_container WHERE user_id = ? AND dataset_type = 'USER' AND ${IS_DATASET}`,
      userId,
    )) ?? 0
  );
}

/** The user's USER datasets plus all SYSTEM and COMMUNITY datasets. */
export async function findAllByUser(db: D1Database, userId: string): Promise<DataSet[]> {
  const rows = await all(
    db,
    `SELECT * FROM evaluation_container WHERE ${IS_DATASET}
     AND ((user_id = ? AND dataset_type = 'USER') OR dataset_type = 'SYSTEM' OR dataset_type = 'COMMUNITY')`,
    userId,
  );
  return rows.map(fromRow);
}

export async function findByUserAndId(db: D1Database, userId: string, dataSetId: string): Promise<DataSet | null> {
  const row = await first(
    db,
    `SELECT * FROM evaluation_container WHERE user_id = ? AND id = ? AND ${IS_DATASET}`,
    userId,
    dataSetId,
  );
  return row ? fromRow(row) : null;
}

/** Statement form of save() for db.batch([...]). Mutates `e` (id, default evaluationType, timestamps). */
export function saveStmt(db: D1Database, e: DataSet): D1PreparedStatement {
  prePersist(e); // only fills a null id / evaluationType
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: DataSet): Promise<DataSet> {
  await saveStmt(db, e).run();
  return e;
}
