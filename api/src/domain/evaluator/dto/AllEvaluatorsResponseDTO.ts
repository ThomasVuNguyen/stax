/** Port of domain/evaluator/dto/AllEvaluatorsResponseDTO. */
import type { PointwiseHeuristicEvaluatorResponseDTO } from "../heuristic/dto/PointwiseHeuristicEvaluatorResponseDTO";
import type { LLMEvaluatorResponseDTO } from "../llm/dto/LLMEvaluatorResponseDTO";

export interface AllEvaluatorsResponseDTO {
  llm: LLMEvaluatorResponseDTO[] | null;
  heuristic: PointwiseHeuristicEvaluatorResponseDTO[] | null;
}
