/** Port of analytics/evaluation/dto/BaseEvalChartDatapointDTO (snake_case JSON). */
export interface BaseEvalChartDatapointDTO {
  category: string | null;
  score: string | null;
  count: number;
  color: string | null;
}

export function create(
  category: string | null,
  score: string | null,
  color: string | null,
  count = 0,
): BaseEvalChartDatapointDTO {
  return { category, score, count, color };
}

export function incrementCount(dp: BaseEvalChartDatapointDTO): void {
  dp.count++;
}
