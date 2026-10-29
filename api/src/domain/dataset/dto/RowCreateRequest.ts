/** Port of domain/dataset/dto/RowCreateRequest (snake_case, NON_NULL). `model_label` is deprecated. */
export interface RowCreateRequest {
  model_prompt?: string | null;
  model_response?: string | null;
  expected_output?: string | null;
  model_id?: string | null;
  model_nickname?: string | null;
  model_label?: string | null;
  chat_id?: string | null;
  variables?: Record<string, string> | null;
  tags?: string[] | null;
  system_instruction?: string | null;
  human_score?: number | null;
}
