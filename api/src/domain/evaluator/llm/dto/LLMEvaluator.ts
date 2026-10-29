/** Port of domain/evaluator/llm/dto/LLMEvaluator (legacy DTO, unused by the API; NON_NULL). */
import type { ScopeType } from "../../../../enums/ScopeType";
import type { ScoreType } from "../../../../enums/ScoreType";
import type { EvaluatorVariableDTO } from "../../dto/EvaluatorVariableDTO";
import type { OutputCategoryDTO } from "../../dto/OutputCategoryDTO";

export interface LLMEvaluator {
  evaluator_id?: string;
  scope_type?: ScopeType;
  evaluator_name?: string;
  evaluator_prompt?: string;
  output_format_type?: ScoreType;
  score_description?: string;
  evaluator_variables?: EvaluatorVariableDTO[];
  output_categories?: OutputCategoryDTO[];
}
