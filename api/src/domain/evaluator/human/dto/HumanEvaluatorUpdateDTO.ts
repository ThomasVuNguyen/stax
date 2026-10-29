/** Port of domain/evaluator/human/dto/HumanEvaluatorUpdateDTO (camelCase JSON). */
import type { LinkedEntityType } from "../../../../enums/LinkedEntityType";
import type { ScoringMechanismType } from "../../../../enums/ScoringMechanismType";

export interface HumanEvaluatorUpdateDTO {
  name?: string | null;
  description?: string | null;
  scoringMechanismType?: ScoringMechanismType | null;
  comments?: string | null;
  linkedEntityType?: LinkedEntityType | null;
}
