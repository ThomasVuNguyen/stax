/** Port of domain/project/dto/SXSPointwiseHeuristicEvaluationDTO. */
import type { PointwiseHeuristicEvaluationDTO } from "../../evaluation/dto/PointwiseHeuristicEvaluationDTO";

export interface SXSPointwiseHeuristicEvaluationDTO {
  chatTurnA: PointwiseHeuristicEvaluationDTO | null;
  chatTurnB: PointwiseHeuristicEvaluationDTO | null;
}

export function create(
  chatTurnA: PointwiseHeuristicEvaluationDTO | null,
  chatTurnB: PointwiseHeuristicEvaluationDTO | null,
): SXSPointwiseHeuristicEvaluationDTO {
  return { chatTurnA, chatTurnB };
}
