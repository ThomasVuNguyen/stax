/**
 * Port of domain/model/ModelRepositoryCustom + ModelRepositoryCustomImpl (Criteria API).
 * Re-exported by ModelRepository.ts, so callers use `ModelRepository.findWithDynamicFilters`.
 *
 * Deviation: the Java subqueries referenced a non-existent `project` attribute on
 * Inference/EvaluationMonitoring (they map `container`), so any call with a projectId would have
 * failed at runtime. Here the intended filter on `container_id` is applied.
 */
import { type Param, all } from "../../lib/db";
import { type Model, TABLE, fromRow } from "../../entities/Model";
import { MonitoringType } from "../../enums/MonitoringType";

export async function findWithDynamicFilters(
  db: D1Database,
  userId: string | null,
  projectId: string | null,
  monitoringType: MonitoringType | null,
): Promise<Model[]> {
  const where = ["m.is_deprecated = 0", "(m.user_id IS ? OR m.type = 'SYSTEM')"];
  const params: Param[] = [userId];
  if (projectId != null && projectId.trim() !== "") {
    const inference = `EXISTS (SELECT 1 FROM inference_monitoring im WHERE im.model_id = m.id AND im.container_id = ?)`;
    const evaluation = `EXISTS (SELECT 1 FROM evaluation_monitoring em WHERE em.eval_model_id = m.id AND em.container_id = ?)`;
    if (monitoringType === MonitoringType.INFERENCE) {
      where.push(inference);
      params.push(projectId);
    } else if (monitoringType === MonitoringType.EVALUATION) {
      where.push(evaluation);
      params.push(projectId);
    } else {
      where.push(`(${inference} OR ${evaluation})`);
      params.push(projectId, projectId);
    }
  }
  const rows = await all(
    db,
    `SELECT m.* FROM "${TABLE}" m WHERE ${where.join(" AND ")} ORDER BY m.release_date DESC, m.label ASC`,
    ...params,
  );
  return rows.map(fromRow);
}
