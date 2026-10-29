/** Port of analytics/evaluation/dto/EvalChartMonitoringStatsDTO (snake_case JSON). */
export interface EvalChartMonitoringStatsDTO {
  average_prompt_tokens: number;
  total_prompt_tokens: number;
  average_completion_tokens: number;
  total_completion_tokens: number;
  average_latency: number;
  total_latency: number;
  /** @JsonProperty getter: total_prompt_tokens + total_completion_tokens. */
  total_tokens: number;
}

export function create(): EvalChartMonitoringStatsDTO {
  return {
    average_prompt_tokens: 0,
    total_prompt_tokens: 0,
    average_completion_tokens: 0,
    total_completion_tokens: 0,
    average_latency: 0,
    total_latency: 0,
    total_tokens: 0,
  };
}
