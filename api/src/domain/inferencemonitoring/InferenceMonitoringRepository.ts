/**
 * Port of domain/inferencemonitoring/InferenceMonitoringRepository
 * (JpaRepository<InferenceMonitoring, String> + InferenceMonitoringRepositoryCustom).
 *
 * - The custom method `getAnalyticsTimeSeries` lives in InferenceMonitoringRepositoryCustom.ts
 *   and is re-exported here, so `InferenceMonitoringRepository.getAnalyticsTimeSeries(...)` works.
 * - Entity parameters become ids: `findInferenceMonitroginsByList(db, idList, userId)`,
 *   `clearEvaluationContainerReference(db, containerId)`,
 *   `getProjectInferenceMonitoringSummary(db, containerId, userId)`,
 *   `getSxSSideAInferenceMonitoringSummary(db, containerId, userId)` (same for Side B).
 * - The Java typo `findInferenceMonitroginsByList` is kept on purpose.
 * - Inherited methods used by Java: save, saveAll. findById/findAllById/deleteById are extra.
 * - Summary methods return ProjectInferenceMonitoringSummaryDTO keyed by its JSON names.
 */
import { all, allIn, first, run } from "../../lib/db";
import { touch, upsertStmt } from "../../entities/EntitySupport";
import {
  type InferenceMonitoring,
  TABLE,
  fromRow,
  prePersist,
  toRow,
} from "../../entities/InferenceMonitoring";
import type { ProjectInferenceMonitoringSummaryDTO } from "../analytics/inference/dto/ProjectInferenceMonitoringSummaryDTO";

export * from "./InferenceMonitoringRepositoryCustom";

export async function findById(db: D1Database, id: string): Promise<InferenceMonitoring | null> {
  const row = await first(db, `SELECT * FROM "${TABLE}" WHERE id = ?`, id);
  return row ? fromRow(row) : null;
}

export async function findAllById(db: D1Database, ids: string[]): Promise<InferenceMonitoring[]> {
  const rows = await allIn(db, (inC) => `SELECT * FROM "${TABLE}" WHERE id IN ${inC}`, ids);
  return rows.map(fromRow);
}

/** JPQL `SELECT im FROM InferenceMonitoring im WHERE im.id IN :idList AND im.user = :user` */
export async function findInferenceMonitroginsByList(
  db: D1Database,
  idList: string[],
  userId: string,
): Promise<InferenceMonitoring[]> {
  const rows = await allIn(
    db,
    (inC) => `SELECT * FROM "${TABLE}" WHERE id IN ${inC} AND user_id = ?`,
    idList,
    userId,
  );
  return rows.map(fromRow);
}

/** `UPDATE InferenceMonitoring im SET im.container = NULL WHERE im.container = :container` */
export async function clearEvaluationContainerReference(db: D1Database, containerId: string): Promise<void> {
  await run(db, `UPDATE "${TABLE}" SET container_id = NULL WHERE container_id = ?`, containerId);
}

const SUMMARY_SELECT = `SELECT
    COUNT(im.id) AS total_inferences,
    CAST(COALESCE(AVG(im.turn_time_taken), 0.0) AS REAL) AS average_turn_time_taken,
    CAST(COALESCE(SUM(im.turn_prompt_tokens), 0) AS INTEGER) AS total_prompt_tokens,
    CAST(COALESCE(SUM(im.turn_completion_tokens), 0) AS INTEGER) AS total_completion_tokens,
    CAST(COALESCE(SUM(im.turn_total_tokens), 0) AS INTEGER) AS total_tokens`;

interface SummaryRow {
  total_inferences: number | null;
  average_turn_time_taken: number | null;
  total_prompt_tokens: number | null;
  total_completion_tokens: number | null;
  total_tokens: number | null;
}

function toSummary(r: SummaryRow | null): ProjectInferenceMonitoringSummaryDTO {
  return {
    total_inferences: Number(r?.total_inferences ?? 0),
    average_turn_time_taken: Number(r?.average_turn_time_taken ?? 0),
    total_prompt_tokens: Number(r?.total_prompt_tokens ?? 0),
    total_completion_tokens: Number(r?.total_completion_tokens ?? 0),
    total_tokens: Number(r?.total_tokens ?? 0),
  };
}

/** Aggregate over all inference_monitoring rows of a container for a user. */
export async function getProjectInferenceMonitoringSummary(
  db: D1Database,
  containerId: string,
  userId: string,
): Promise<ProjectInferenceMonitoringSummaryDTO> {
  const r = await first<SummaryRow>(
    db,
    `${SUMMARY_SELECT} FROM "${TABLE}" im WHERE im.container_id = ? AND im.user_id = ?`,
    containerId,
    userId,
  );
  return toSummary(r);
}

function sxsSideSql(turnColumn: "chat_turn_id_a" | "chat_turn_id_b"): string {
  return `${SUMMARY_SELECT}
    FROM sxs_evaluation_pair p
    JOIN evaluation_container c ON c.id = p.container_id
    JOIN chat_turns ct ON ct.id = p.${turnColumn}
    JOIN model_response mr ON mr.id = ct.model_response_id
    JOIN "${TABLE}" im ON im.id = mr.inference_monitoring_id
    WHERE p.container_id = ? AND c.user_id = ?`;
}

/** Summary for Side A (chatTurnA → modelResponse → inferenceMonitoring) of a container's SxS pairs. */
export async function getSxSSideAInferenceMonitoringSummary(
  db: D1Database,
  containerId: string,
  userId: string,
): Promise<ProjectInferenceMonitoringSummaryDTO> {
  return toSummary(await first<SummaryRow>(db, sxsSideSql("chat_turn_id_a"), containerId, userId));
}

/** Summary for Side B (chatTurnB → modelResponse → inferenceMonitoring) of a container's SxS pairs. */
export async function getSxSSideBInferenceMonitoringSummary(
  db: D1Database,
  containerId: string,
  userId: string,
): Promise<ProjectInferenceMonitoringSummaryDTO> {
  return toSummary(await first<SummaryRow>(db, sxsSideSql("chat_turn_id_b"), containerId, userId));
}

/** Statement form of save() for use inside db.batch([...]). Mutates `e` (id, timestamps). */
export function saveStmt(db: D1Database, e: InferenceMonitoring): D1PreparedStatement {
  if (e.id == null) prePersist(e);
  touch(e);
  return upsertStmt(db, TABLE, toRow(e));
}

export async function save(db: D1Database, e: InferenceMonitoring): Promise<InferenceMonitoring> {
  await saveStmt(db, e).run();
  return e;
}

export async function saveAll(db: D1Database, es: InferenceMonitoring[]): Promise<InferenceMonitoring[]> {
  if (es.length) await db.batch(es.map((e) => saveStmt(db, e)));
  return es;
}

export async function deleteById(db: D1Database, id: string): Promise<void> {
  await run(db, `DELETE FROM "${TABLE}" WHERE id = ?`, id);
}

/** All rows (not used by Java; handy for tests). */
export async function findAll(db: D1Database): Promise<InferenceMonitoring[]> {
  return (await all(db, `SELECT * FROM "${TABLE}"`)).map(fromRow);
}
