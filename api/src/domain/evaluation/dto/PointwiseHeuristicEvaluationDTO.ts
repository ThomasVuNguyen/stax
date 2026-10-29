/**
 * Port of domain/evaluation/dto/PointwiseHeuristicEvaluationDTO. The Lombok getter of
 * `boolean isMatch` is `isMatch()`, so Jackson writes it as "match".
 */
export interface PointwiseHeuristicEvaluationDTO {
  evaluator_id: string | null;
  match: boolean;
  failureReason: string | null;
  evaluationStatus: string | null;
  evaluationStatusText: string | null;
}

export function create(init: Partial<PointwiseHeuristicEvaluationDTO> = {}): PointwiseHeuristicEvaluationDTO {
  return {
    evaluator_id: null,
    match: false,
    failureReason: null,
    evaluationStatus: null,
    evaluationStatusText: null,
    ...init,
  };
}
