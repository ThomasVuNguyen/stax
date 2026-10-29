/** Port of domain/evaluation/dto/LLMEvaluationDTO (JSON names; nulls are serialised). */
export interface LLMEvaluationDTO {
  evaluator_id: string | null;
  score: string | null;
  llmResponse: string | null;
  reasoning: string | null;
  failureReason: string | null;
  category: string | null;
  evaluationStatus: string | null;
  evaluationStatusText: string | null;
  color: string | null;
}

export function create(init: Partial<LLMEvaluationDTO> = {}): LLMEvaluationDTO {
  return {
    evaluator_id: null,
    score: null,
    llmResponse: null,
    reasoning: null,
    failureReason: null,
    category: null,
    evaluationStatus: null,
    evaluationStatusText: null,
    color: null,
    ...init,
  };
}
