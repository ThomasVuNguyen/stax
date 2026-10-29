/** Port of analytics/evaluation/dto/EvalChartDatapointDTO (snake_case JSON, extends the base datapoint). */
import type { BaseEvalChartDatapointDTO } from "./BaseEvalChartDatapointDTO";

export interface EvalChartDatapointDTO extends BaseEvalChartDatapointDTO {
  prompt_tokens: number;
  completion_tokens: number;
  average_latency: number;
  total_latency: number;
  average_prompt_tokens: number;
  average_completion_tokens: number;
  /** @JsonProperty getter: prompt_tokens + completion_tokens (kept in sync by updateAverages). */
  total_tokens: number;
}

export function create(category: string | null, score: string | null, color: string | null): EvalChartDatapointDTO {
  return {
    category,
    score,
    count: 0,
    color,
    prompt_tokens: 0,
    completion_tokens: 0,
    average_latency: 0,
    total_latency: 0,
    average_prompt_tokens: 0,
    average_completion_tokens: 0,
    total_tokens: 0,
  };
}

export function addPromptTokens(dp: EvalChartDatapointDTO, tokens: number): void {
  dp.prompt_tokens += tokens;
  dp.total_tokens = dp.prompt_tokens + dp.completion_tokens;
}

export function addCompletionTokens(dp: EvalChartDatapointDTO, tokens: number): void {
  dp.completion_tokens += tokens;
  dp.total_tokens = dp.prompt_tokens + dp.completion_tokens;
}

export function addTotalLatency(dp: EvalChartDatapointDTO, latency: number): void {
  dp.total_latency += latency;
}

/** Long division for the token averages, double for latency (as in Java). */
export function updateAverages(dp: EvalChartDatapointDTO): void {
  if (dp.count > 0) {
    dp.average_prompt_tokens = Math.trunc(dp.prompt_tokens / dp.count);
    dp.average_completion_tokens = Math.trunc(dp.completion_tokens / dp.count);
    dp.average_latency = dp.total_latency / dp.count;
  }
}
