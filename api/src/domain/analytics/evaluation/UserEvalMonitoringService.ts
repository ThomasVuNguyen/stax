/**
 * Port of analytics/evaluation/UserEvalMonitoringService + UserEvalMonitoringServiceImpl.
 * Returns the Java `Map<String, UserEvalChartEntryDTO>` (keyed by evaluator name) as a plain object
 * in insertion order. Evaluators are grouped in first-seen order (Java used a HashMap).
 */
import type { Ctx } from "../../../lib/ctx";
import { allIn } from "../../../lib/db";
import * as LLMEvaluatorEntity from "../../../entities/LLMEvaluator";
import type { LLMEvaluator } from "../../../entities/LLMEvaluator";
import * as EvaluationAnalyticsRepository from "./EvaluationAnalyticsRepository";
import type { EvaluationAnalyticsRowDTO } from "./dto/EvaluationAnalyticsRowDTO";
import * as UserEvalChartBuilder from "./dto/UserEvalChartBuilder";
import type { UserEvalChartEntryDTO } from "./dto/UserEvalChartEntryDTO";
import type { UserEvalMonitoringParams } from "./dto/UserEvalMonitoringParams";

/** LLMEvaluatorRepository.findAllById (missing from the ported repository, so done locally). */
async function findLlmEvaluatorsById(db: D1Database, ids: string[]): Promise<LLMEvaluator[]> {
  const rows = await allIn(db, (inC) => `SELECT * FROM "${LLMEvaluatorEntity.TABLE}" WHERE id IN ${inC}`, ids);
  return rows.map(LLMEvaluatorEntity.fromRow);
}

export async function getAnalyticsMonitoringData(
  ctx: Ctx,
  user: { id: string | null },
  params: UserEvalMonitoringParams,
): Promise<Record<string, UserEvalChartEntryDTO>> {
  console.info("Get analytics eval monitoring data");
  const results = await EvaluationAnalyticsRepository.getAnalyticsData(ctx.db, params, user.id!);

  const groupedByEvaluator = new Map<string, EvaluationAnalyticsRowDTO[]>();
  for (const row of results) {
    if (row.evaluatorId == null) continue;
    const list = groupedByEvaluator.get(row.evaluatorId);
    if (list) list.push(row);
    else groupedByEvaluator.set(row.evaluatorId, [row]);
  }

  const evaluators = await findLlmEvaluatorsById(ctx.db, [...groupedByEvaluator.keys()]);
  const evaluatorMap = new Map(evaluators.map((e) => [e.id!, e]));

  const chartMap: Record<string, UserEvalChartEntryDTO> = {};
  for (const [evaluatorId, rows] of groupedByEvaluator) {
    const evaluator = evaluatorMap.get(evaluatorId);
    if (!evaluator) continue;
    const chartEntry = UserEvalChartBuilder.build(rows, evaluator);
    chartEntry.scorerId = evaluator.id;
    chartEntry.scorerName = evaluator.name;
    chartMap[String(evaluator.name)] = chartEntry;
  }
  return chartMap;
}
