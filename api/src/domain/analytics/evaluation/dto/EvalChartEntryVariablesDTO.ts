/** Port of analytics/evaluation/dto/EvalChartEntryVariablesDTO (snake_case JSON). */
export interface EvalChartEntryVariablesDTO {
  failed: number;
  in_progress: number;
  pending: number;
  unknown: number;
}

export function create(): EvalChartEntryVariablesDTO {
  return { failed: 0, in_progress: 0, pending: 0, unknown: 0 };
}
