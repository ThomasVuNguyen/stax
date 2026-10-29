/** Port of domain/evaluator/heuristic/dto/PointwiseHeuristicEvaluatorResponseDTO (nulls written). */
import type { PointwiseHeuristicEvaluator } from "../../../../entities/PointwiseHeuristicEvaluator";
import type { CriteriaType } from "../../../../enums/CriteriaType";

export interface PointwiseHeuristicEvaluatorResponseDTO {
  id: string | null;
  name: string | null;
  criteria: string | null;
  criteria_type: CriteriaType | null;
  deprecated: boolean;
  created_at: string | null;
  updated_at: string | null;
}

/** `new PointwiseHeuristicEvaluatorResponseDTO(evaluator)`. */
export function fromPointwiseHeuristicEvaluator(e: PointwiseHeuristicEvaluator): PointwiseHeuristicEvaluatorResponseDTO {
  return {
    id: e.id,
    name: e.name,
    criteria: e.criteria,
    criteria_type: e.criteriaType,
    deprecated: !!e.deprecated,
    created_at: e.createdAt,
    updated_at: e.updatedAt,
  };
}
