/** Port of domain/evaluator/human/dto/HumanEvaluatorCreateRequestDTO (unused by the API). */
import type { HumanEvalRangeDataType } from "../../../../enums/HumanEvalRangeDataType";
import type { ScoringMechanismType } from "../../../../enums/ScoringMechanismType";
import type { HumanCategoryFeedbackOptionDTO } from "./HumanCategoryFeedbackOptionDTO";

export interface HumanEvaluatorCreateRequestDTO {
  name?: string | null;
  description?: string | null;
  scoringMechanismType?: ScoringMechanismType | null;
  pointScaleDataType?: HumanEvalRangeDataType | null;
  minValue?: number | null;
  maxValue?: number | null;
  binaryOptions?: HumanCategoryFeedbackOptionDTO[] | null;
}
