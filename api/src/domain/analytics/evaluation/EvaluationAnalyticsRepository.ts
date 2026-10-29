/**
 * Port of domain/analytics/evaluation/EvaluationAnalyticsRepository +
 * EvaluationAnalyticsRepositoryImpl (Criteria API query; no separate Impl file).
 *
 * `getAnalyticsData(db, params, userId)` — the Java `User user` parameter becomes `userId`.
 * Returns EvaluationAnalyticsRowDTO records (score, scorer, evaluatorId, status, promptTokens,
 * completionTokens, timeTaken) for the user's scores:
 *   score s JOIN evaluation_status es (inner) LEFT JOIN evaluation_monitoring em
 *   [JOIN model_response mr when filtering by model ids or by an SxS side].
 * Filters mirror buildPredicates(): createdAt range (inclusive), scorer names, scorer (LLM
 * evaluator) ids, model ids (model_response.model_id), project (evaluation_status.container_id),
 * tag ids (the evaluation monitoring must carry ALL tags; tag_link target type is not checked,
 * as in Java), and the SxS side filter (sxsJoinColumnName "chatTurnA"/"chatTurnB" + projectId:
 * EXISTS an sxs_evaluation_pair of that project whose side turn has this model response).
 */
import { all, placeholders, type Param } from "../../../lib/db";
import type { EvaluationAnalyticsRowDTO } from "./dto/EvaluationAnalyticsRowDTO";
import type { UserEvalMonitoringParams } from "./dto/UserEvalMonitoringParams";

function toIso(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const d = v instanceof Date ? v : new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function nonEmpty(list: unknown): list is string[] {
  return Array.isArray(list) && list.length > 0;
}

interface Row {
  score: number | null;
  scorer: string | null;
  evaluator_id: string | null;
  status: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  time_taken: number | null;
}

export async function getAnalyticsData(
  db: D1Database,
  params: UserEvalMonitoringParams,
  userId: string,
): Promise<EvaluationAnalyticsRowDTO[]> {
  const p = params as unknown as Record<string, unknown>;
  const startTime = toIso(p.startTime);
  const endTime = toIso(p.endTime);
  const scorerNames = p.scorerNames;
  const scorerIds = p.scorerIds;
  const modelIds = p.modelIds;
  const tagIds = p.tagIds;
  const projectId = typeof p.projectId === "string" && p.projectId !== "" ? p.projectId : null;
  const sxsJoinColumnName =
    typeof p.sxsJoinColumnName === "string" && p.sxsJoinColumnName !== "" ? p.sxsJoinColumnName : null;

  const needsModelResponse = sxsJoinColumnName !== null || nonEmpty(modelIds);
  let sql = `SELECT s.score AS score, s.scorer AS scorer, s.llm_evaluator AS evaluator_id,
      es.status AS status, em.prompt_tokens AS prompt_tokens,
      em.completion_tokens AS completion_tokens, em.time_taken AS time_taken
    FROM score s
    JOIN evaluation_status es ON es.id = s.evaluation_status
    LEFT JOIN evaluation_monitoring em ON em.id = s.evaluation_monitoring_id
    ${needsModelResponse ? "JOIN model_response mr ON mr.id = s.model_response_id" : ""}
    WHERE s.user_id = ?`;
  const args: Param[] = [userId];

  if (startTime) {
    sql += " AND s.created_at >= ?";
    args.push(startTime);
  }
  if (endTime) {
    sql += " AND s.created_at <= ?";
    args.push(endTime);
  }
  if (nonEmpty(scorerNames)) {
    sql += ` AND s.scorer IN ${placeholders(scorerNames.length)}`;
    args.push(...scorerNames);
  }
  if (nonEmpty(scorerIds)) {
    sql += ` AND s.llm_evaluator IN ${placeholders(scorerIds.length)}`;
    args.push(...scorerIds);
  }
  if (nonEmpty(modelIds)) {
    sql += ` AND mr.model_id IN ${placeholders(modelIds.length)}`;
    args.push(...modelIds);
  }
  if (projectId) {
    sql += " AND es.container_id = ?";
    args.push(projectId);
  }
  if (nonEmpty(tagIds)) {
    sql += ` AND (SELECT COUNT(DISTINCT tl.tag_id) FROM tag_link tl
        WHERE tl.target_id = em.id AND tl.tag_id IN ${placeholders(tagIds.length)}) >= ?`;
    args.push(...tagIds, tagIds.length);
  }
  if (sxsJoinColumnName && projectId) {
    const turnColumn =
      sxsJoinColumnName === "chatTurnA" ? "chat_turn_id_a" : sxsJoinColumnName === "chatTurnB" ? "chat_turn_id_b" : null;
    if (turnColumn) {
      sql += ` AND EXISTS (SELECT p.id FROM sxs_evaluation_pair p
          JOIN chat_turns ct ON ct.id = p.${turnColumn}
          WHERE ct.model_response_id = mr.id AND p.container_id = ?)`;
      args.push(projectId);
    }
  }

  const rows = await all<Row>(db, sql, ...args);
  return rows.map((r) => ({
    score: r.score,
    scorer: r.scorer,
    evaluatorId: r.evaluator_id,
    status: r.status,
    promptTokens: r.prompt_tokens,
    completionTokens: r.completion_tokens,
    timeTaken: r.time_taken,
  }));
}
