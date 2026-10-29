/**
 * Port of domain/tags/repository/TagRepositoryCustom + TagRepositoryCustomImpl (Criteria API).
 * Re-exported by TagRepository.ts, so callers use `TagRepository.findWithFilters(...)`.
 *
 * Deviation: the Java Criteria query referenced a non-existent `project` attribute on
 * InferenceMonitoring/EvaluationMonitoring (would throw when projectId was given); here it maps
 * to the `container_id` column, which is what the field represents.
 */
import { type Param, all } from "../../../lib/db";
import { MonitoringType } from "../../../enums/MonitoringType";
import type { TagType } from "../../../enums/TagType";
import { TagLinkTargetType } from "../../../enums/TagLinkTargetType";
import { type Tag, fromRow } from "../../../entities/Tag";
import * as TagTypeConverter from "../../../util/converter/TagTypeConverter";

function monitoringSubquery(
  table: string,
  modelColumn: string,
  projectId: string | null,
  modelId: string | null,
  params: Param[],
): string {
  const where: string[] = [];
  if (projectId != null) {
    where.push("m.container_id = ?");
    params.push(projectId);
  }
  if (modelId != null) {
    where.push(`m.${modelColumn} = ?`);
    params.push(modelId);
  }
  return `SELECT m.id FROM "${table}" m${where.length ? " WHERE " + where.join(" AND ") : ""}`;
}

/**
 * Tags of the user (optionally of `tagType`). When projectId or modelId is given, only tags linked
 * to inference/evaluation monitoring rows of that project/model (restricted by monitoringType;
 * both kinds when null). Ordered by createdAt DESC.
 */
export async function findWithFilters(
  db: D1Database,
  userId: string,
  tagType: TagType | null,
  projectId: string | null,
  modelId: string | null,
  monitoringType: MonitoringType | null,
): Promise<Tag[]> {
  const params: Param[] = [userId];
  let sql = `SELECT t.* FROM "tag" t WHERE t.user_id = ?`;
  if (tagType != null) {
    sql += " AND t.type = ?";
    params.push(TagTypeConverter.convertToDatabaseColumn(tagType));
  }
  if (projectId != null || modelId != null) {
    const inference = () =>
      `(tl.target_type = '${TagLinkTargetType.INFERENCE_MONITORING}' AND tl.target_id IN (${monitoringSubquery("inference_monitoring", "model_id", projectId, modelId, params)}))`;
    const evaluation = () =>
      `(tl.target_type = '${TagLinkTargetType.EVALUATION_MONITORING}' AND tl.target_id IN (${monitoringSubquery("evaluation_monitoring", "eval_model_id", projectId, modelId, params)}))`;
    let predicate: string;
    if (monitoringType === MonitoringType.INFERENCE) predicate = inference();
    else if (monitoringType === MonitoringType.EVALUATION) predicate = evaluation();
    else {
      const a = inference();
      const b = evaluation();
      predicate = `(${a} OR ${b})`;
    }
    sql += ` AND t.tag_id IN (SELECT tl.tag_id FROM "tag_link" tl WHERE ${predicate})`;
  }
  sql += " ORDER BY t.created_at DESC";
  return (await all(db, sql, ...params)).map(fromRow);
}
