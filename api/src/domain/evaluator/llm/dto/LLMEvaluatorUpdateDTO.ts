/** Port of domain/evaluator/llm/dto/LLMEvaluatorUpdateDTO (JSON names). */
import { InvalidDataException } from "../../../../lib/errors";
import type { ScoreType } from "../../../../enums/ScoreType";
import type { Prompt } from "../../../../llmproviders/dto/Prompt";
import type { EvaluatorVariableDTO } from "../../dto/EvaluatorVariableDTO";
import { type OutputCategoryDTO, validateList } from "../../dto/OutputCategoryDTO";

export interface LLMEvaluatorUpdateDTO {
  name?: string | null;
  output_format_type?: ScoreType | null;
  description?: string | null;
  variables?: EvaluatorVariableDTO[] | null;
  /** @Valid */
  output_categories?: OutputCategoryDTO[] | null;
  model_id?: string | null;
  prompts?: Prompt[] | null;
}

export function validate(req: LLMEvaluatorUpdateDTO): void {
  const errors = validateList(req.output_categories, "outputCategories");
  if (errors.length) throw new InvalidDataException(errors.join(", "));
}
