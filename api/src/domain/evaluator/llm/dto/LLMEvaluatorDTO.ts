/** Port of domain/evaluator/llm/dto/LLMEvaluatorDTO (legacy DTO, unused by the API; NON_NULL). */
export interface LLMEvaluatorDTO {
  evaluator_status_id?: string;
  chat_turn_id?: string;
  user_id?: string;
  evaluator_id?: string;
  job_id?: string;
  source_api?: string;
}
