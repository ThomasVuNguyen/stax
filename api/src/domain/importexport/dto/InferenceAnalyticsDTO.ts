/** Port of domain/importexport/dto/InferenceAnalyticsDTO (JSON names; nulls are serialised). */
export interface InferenceAnalyticsDTO {
  total_chat_latency: number | null;
  average_chat_latency: number | null;
  total_chat_prompt_tokens: number | null;
  total_chat_completion_tokens: number | null;
  total_chat_tokens: number | null;
}

/** Properties Jackson accepts when reading the DTO (FAIL_ON_UNKNOWN_PROPERTIES is on). */
export const JSON_PROPERTIES = [
  "total_chat_latency",
  "average_chat_latency",
  "total_chat_prompt_tokens",
  "total_chat_completion_tokens",
  "total_chat_tokens",
] as const;
