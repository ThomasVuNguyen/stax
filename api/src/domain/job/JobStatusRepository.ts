/**
 * Port of domain/job/JobStatusRepository (JpaRepository<JobStatus, String>).
 * - `User user` params → `userId`.
 * - `…AndPageable` methods take a Spring-style `Pageable` (util/Page) and return a plain list,
 *   like Java (sort properties are JobStatus property names, e.g. "startTime").
 * - `deleteByUserAndProjectId`: Java declared `List<JobStatus>` on a @Modifying query (only an
 *   update count is possible); returns the deleted row count.
 * - job_status has no created_at/updated_at; `startTime` is the @CreationTimestamp.
 * - Inherited methods used by Java: findById, findAllById, save, delete(entity).
 */
import { type Param, all, allIn, first, now, run, scalar, stmt } from "../../lib/db";
import { type JobStatusEnum, JobStatusEnumKey } from "../../enums/JobStatusEnum";
import { upsertStmt } from "../../entities/EntitySupport";
import { COLUMNS, type JobStatus, TABLE, fromRow, prePersist, toRow } from "../../entities/JobStatus";
import { type Pageable, limitOffset, orderBy } from "../../util/Page";

const SORT_COLUMNS: Record<string, string> = Object.fromEntries(
  Object.entries(COLUMNS).map(([prop, col]) => [prop, `ins.${col}`]),
);

export async function updateStatusById(
  db: D1Database,
  status: JobStatusEnum,
  pending: number | null,
  inProgress: number | null,
  successful: number | null,
  failed: number | null,
  stopped: number | null,
  jobStatusId: string,
): Promise<void> {
  await run(
    db,
    `UPDATE "${TABLE}" SET status = ?, pending = ?, in_progress = ?, successful = ?, failed = ?, stopped = ? WHERE id = ?`,
    JobStatusEnumKey[status],
    pending,
    inProgress,
    successful,
    failed,
    stopped,
    jobStatusId,
  );
}

export async function updateEndTimeByJobStatusId(
  db: D1Database,
  endTime: Date | string | null,
  jobStatusId: string,
): Promise<void> {
  const t = endTime instanceof Date ? endTime.toISOString() : endTime;
  await run(db, `UPDATE "${TABLE}" SET end_time = ? WHERE id = ?`, t, jobStatusId);
}

export async function findResultsAllByUserAndPageable(
  db: D1Database,
  userId: string,
  pageable: Pageable,
): Promise<JobStatus[]> {
  const [limit, offset] = limitOffset(pageable);
  return (
    await all(
      db,
      `SELECT ins.* FROM "${TABLE}" ins WHERE ins.user_id = ? ${orderBy(pageable, SORT_COLUMNS)} LIMIT ? OFFSET ?`,
      userId,
      limit,
      offset,
    )
  ).map(fromRow);
}

export async function findResultsAllByUserAndProjectIdAndPageable(
  db: D1Database,
  userId: string,
  projectId: string,
  pageable: Pageable,
): Promise<JobStatus[]> {
  const [limit, offset] = limitOffset(pageable);
  return (
    await all(
      db,
      `SELECT ins.* FROM "${TABLE}" ins WHERE ins.user_id = ? AND ins.project_id = ? ${orderBy(pageable, SORT_COLUMNS)} LIMIT ? OFFSET ?`,
      userId,
      projectId,
      limit,
      offset,
    )
  ).map(fromRow);
}

export async function findAllByUserAndProjectIds(
  db: D1Database,
  userId: string,
  projectIds: string[],
): Promise<JobStatus[]> {
  const rows = await allIn(
    db,
    (inClause) => `SELECT * FROM "${TABLE}" WHERE project_id IN ${inClause} AND user_id = ?`,
    projectIds,
    userId,
  );
  return rows.map(fromRow);
}

export async function findCountAllByUser(db: D1Database, userId: string): Promise<number> {
  return (await scalar<number>(db, `SELECT COUNT(id) FROM "${TABLE}" WHERE user_id = ?`, userId)) ?? 0;
}

export async function findCountAllByUserAndProjectId(
  db: D1Database,
  userId: string,
  projectId: string,
): Promise<number> {
  return (
    (await scalar<number>(db, `SELECT COUNT(id) FROM "${TABLE}" WHERE user_id = ? AND project_id = ?`, userId, projectId)) ??
    0
  );
}

/** Derived delete (JobStatus has no JPA cascades). */
export async function deleteByUser(db: D1Database, userId: string): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE user_id = ?`, userId);
}

export async function deleteByUserAndProjectId(db: D1Database, userId: string, projectId: string): Promise<number> {
  const res = await run(db, `DELETE FROM "${TABLE}" WHERE user_id = ? AND project_id = ?`, userId, projectId);
  return res.meta.changes ?? 0;
}

export async function existsByUserAndProjectIdAndStatusIn(
  db: D1Database,
  userId: string,
  projectId: string,
  statuses: number[],
): Promise<boolean> {
  if (!statuses.length) return false;
  const rows = await allIn(
    db,
    (inClause) => `SELECT 1 FROM "${TABLE}" WHERE status IN ${inClause} AND user_id = ? AND project_id = ? LIMIT 1`,
    statuses,
    userId,
    projectId,
  );
  return rows.length > 0;
}

export async function findIdsByUserAndProjectIdAndStatus(
  db: D1Database,
  userId: string,
  projectId: string,
  status: number,
): Promise<string[]> {
  const rows = await all<{ id: string }>(
    db,
    `SELECT id FROM "${TABLE}" WHERE user_id = ? AND project_id = ? AND status = ?`,
    userId,
    projectId,
    status,
  );
  return rows.map((r) => r.id);
}

/** Sets STOPPED (5) on the user's PENDING (1) / IN_PROGRESS (2) jobs. */
export async function stopAllOngoingJobsByUser(db: D1Database, userId: string): Promise<void> {
  await run(db, `UPDATE "${TABLE}" SET status = 5 WHERE user_id = ? AND status IN (1, 2)`, userId);
}

export async function findById(db: D1Database, id: string): Promise<JobStatus | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllById(db: D1Database, ids: string[]): Promise<JobStatus[]> {
  const rows = await allIn(db, (inClause) => `SELECT * FROM "${TABLE}" WHERE id IN ${inClause}`, ids as Param[]);
  return rows.map(fromRow);
}

/** Upsert; startTime is the @CreationTimestamp (kept on update). */
export function saveStmt(db: D1Database, e: JobStatus): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  if (!e.startTime) e.startTime = now();
  return upsertStmt(db, TABLE, toRow(e), "id", ["start_time"]);
}

export async function save(db: D1Database, e: JobStatus): Promise<JobStatus> {
  await saveStmt(db, e).run();
  return e;
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE id = ?`, id);
}

export async function delete_(db: D1Database, e: JobStatus): Promise<void> {
  if (e.id != null) await deleteById(db, e.id);
}

export { delete_ as delete };

// ---- Added for the job services (not in the Java repository) ----

export function deleteByIdStmt(db: D1Database, id: string): D1PreparedStatement {
  return stmt(db, `DELETE FROM "${TABLE}" WHERE id = ?`, id);
}

/** `findIdsByUserAndProjectIdAndStatus` for several statuses in one query: rows of (id, status). */
export async function findIdsAndStatusByUserAndProjectIdAndStatusIn(
  db: D1Database,
  userId: string,
  projectId: string,
  statuses: number[],
): Promise<{ id: string; status: number }[]> {
  if (!statuses.length) return [];
  return all<{ id: string; status: number }>(
    db,
    `SELECT id, status FROM "${TABLE}" WHERE user_id = ? AND project_id = ? AND status IN (${statuses.map(() => "?").join(", ")})`,
    userId,
    projectId,
    ...statuses,
  );
}
