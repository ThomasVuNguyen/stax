/** Port of domain/project/dto/SXSPairwiseEvaluationMetricsDTO. */
import type { BaseEvalChartDatapointDTO } from "../../analytics/evaluation/dto/BaseEvalChartDatapointDTO";

export interface SXSPairwiseEvaluationMetricsDTO {
  scorer_id: string | null;
  scorer_name: string | null;
  datapoints: BaseEvalChartDatapointDTO[];
}

/** `new SXSPairwiseEvaluationMetricsDTO(scorerId, scorerName, datapoints)` (copies the list). */
export function create(
  scorerId: string | null,
  scorerName: string | null,
  datapoints: BaseEvalChartDatapointDTO[] | null,
): SXSPairwiseEvaluationMetricsDTO {
  return { scorer_id: scorerId, scorer_name: scorerName, datapoints: datapoints ? [...datapoints] : [] };
}

/** `updateCount(score, count)`: sets the count of the first datapoint with that score. */
export function updateCount(dto: SXSPairwiseEvaluationMetricsDTO, score: string, count: number): void {
  const dp = dto.datapoints.find((d) => d.score === score);
  if (dp) dp.count = count;
}
