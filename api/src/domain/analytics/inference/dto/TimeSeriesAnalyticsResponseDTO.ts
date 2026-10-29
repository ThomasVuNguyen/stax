/** Port of analytics/inference/dto/TimeSeriesAnalyticsResponseDTO. */
import type { TimeSeriesAnalyticsDTO } from "./TimeSeriesAnalyticsDTO";

export interface TimeSeriesAnalyticsResponseDTO {
  time_series_analytics: TimeSeriesAnalyticsDTO[];
  overall_inferences: number;
  /** Jackson writes NaN (0/0 when there are no inferences) as the string "NaN". */
  overall_average_latency: number | "NaN" | "Infinity" | "-Infinity";
  overall_prompt_tokens: number;
  overall_completion_tokens: number;
  overall_total_tokens: number;
}

export function fromTimeSeries(timeSeriesAnalyticsDTOs: TimeSeriesAnalyticsDTO[]): TimeSeriesAnalyticsResponseDTO {
  let overallInferences = 0;
  let overallAverageLatency = 0;
  let overallPromptTokens = 0;
  let overallCompletionTokens = 0;
  let overallTotalTokens = 0;
  for (const dto of timeSeriesAnalyticsDTOs) {
    overallInferences += dto.totalInferences;
    overallAverageLatency += dto.totalInferences * dto.average_avg_chat_latency;
    overallPromptTokens += dto.total_chat_prompt_tokens;
    overallCompletionTokens += dto.total_chat_completion_tokens;
    overallTotalTokens += dto.total_chat_total_tokens;
  }
  overallAverageLatency /= overallInferences;
  return {
    time_series_analytics: timeSeriesAnalyticsDTOs,
    overall_inferences: overallInferences,
    overall_average_latency: Number.isFinite(overallAverageLatency)
      ? overallAverageLatency
      : (String(overallAverageLatency) as "NaN" | "Infinity" | "-Infinity"),
    overall_prompt_tokens: overallPromptTokens,
    overall_completion_tokens: overallCompletionTokens,
    overall_total_tokens: overallTotalTokens,
  };
}
