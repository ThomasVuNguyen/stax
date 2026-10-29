/**
 * Port of analytics/inference/dto/TimeSeriesAnalyticsDTO (built by
 * InferenceMonitoringRepository.getAnalyticsTimeSeries). `windowStart` is formatted
 * `yyyy-MM-dd'T'HH:mm:ss'Z'` (UTC); null counters are 0.
 */
export interface TimeSeriesAnalyticsDTO {
  windowStart: string | null;
  windowStartEpochMillis: number;
  totalInferences: number;
  total_turn_time_taken: number;
  average_turn_time_taken: number;
  total_turn_prompt_tokens: number;
  total_turn_completion_tokens: number;
  total_turn_total_tokens: number;
  average_avg_chat_latency: number;
  total_chat_prompt_tokens: number;
  total_chat_completion_tokens: number;
  total_chat_total_tokens: number;
}
