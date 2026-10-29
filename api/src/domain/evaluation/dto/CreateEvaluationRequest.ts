/** Port of domain/evaluation/dto/CreateEvaluationRequest (unused by the API; JSON names). */
export interface CreateEvaluationRequest {
  scorers?: string[] | null;
  response_ids?: string[] | null;
  score?: Record<string, string> | null;
  response?: Record<string, string> | null;
}
