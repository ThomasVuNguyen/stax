/** Port of domain/evaluator/human/dto/HumanEvaluatorResponseDTO (unused by the API). */
import type { HumanEvalRangeDataType } from "../../../../enums/HumanEvalRangeDataType";
import type { ScopeType } from "../../../../enums/ScopeType";
import type { ScoringMechanismType } from "../../../../enums/ScoringMechanismType";
import type { HumanCategoryFeedbackOptionDTO } from "./HumanCategoryFeedbackOptionDTO";

export interface HumanEvaluatorResponseDTO {
  id: string | null;
  name: string | null;
  description: string | null;
  userId: string | null;
  type: ScopeType | null;
  scoringMechanismType: ScoringMechanismType | null;
  pointScaleDataType: HumanEvalRangeDataType | null;
  minValue: number | null;
  maxValue: number | null;
  binaryOptions: HumanCategoryFeedbackOptionDTO[] | null;
  createdAt: string | null;
  updatedAt: string | null;
  deprecated: boolean;
}
