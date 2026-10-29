/** Port of analytics/inference/dto/ProjectInferenceMonitoringSummaryDTO (defaults 0). */
export interface ProjectInferenceMonitoringSummaryDTO {
  total_inferences: number;
  average_turn_time_taken: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
}

export function create(init: Partial<ProjectInferenceMonitoringSummaryDTO> = {}): ProjectInferenceMonitoringSummaryDTO {
  return {
    total_inferences: 0,
    average_turn_time_taken: 0,
    total_prompt_tokens: 0,
    total_completion_tokens: 0,
    total_tokens: 0,
    ...init,
  };
}
