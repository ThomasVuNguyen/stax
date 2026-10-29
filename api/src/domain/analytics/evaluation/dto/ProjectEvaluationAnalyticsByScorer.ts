/**
 * Port of analytics/evaluation/dto/ProjectEvaluationAnalyticsByScorer (snake_case JSON).
 * `new ProjectEvaluationAnalyticsByScorer()` → `create()`;
 * `new ProjectEvaluationAnalyticsByScorer(datapoints, scorerId, scorerName)` → `fromDatapoints(...)`.
 */
import { parseJavaDouble } from "../../../../util/NumberUtil";
import type { BaseEvalChartDatapointDTO } from "./BaseEvalChartDatapointDTO";
import type { EvalChartDatapointDTO } from "./EvalChartDatapointDTO";

export interface ProjectEvaluationAnalyticsByScorer {
  score_counts: BaseEvalChartDatapointDTO[];
  average_score: number | null;
  scorer_id: string | null;
  scorer_name: string | null;
}

export function create(): ProjectEvaluationAnalyticsByScorer {
  return { score_counts: [], average_score: null, scorer_id: null, scorer_name: null };
}

export function fromDatapoints(
  datapoints: EvalChartDatapointDTO[],
  scorerId: string | null,
  scorerName: string | null,
): ProjectEvaluationAnalyticsByScorer {
  const scoreCounts = datapoints.map((dp) => ({ category: dp.category, score: dp.score, count: dp.count, color: dp.color }));
  const totalCount = scoreCounts.reduce((n, dp) => n + dp.count, 0);
  const averageScore =
    totalCount > 0
      ? scoreCounts.reduce((sum, dp) => sum + parseJavaDouble(dp.score) * dp.count, 0) / totalCount
      : null;
  return { score_counts: scoreCounts, average_score: averageScore, scorer_id: scorerId, scorer_name: scorerName };
}
