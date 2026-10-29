/** Port of domain/evaluator/llm/dto/LLMEvaluatorRequestDTO (JSON names). */
import { InvalidDataException } from "../../../../lib/errors";
import { type BaseLLMEvaluatorRequestDTO, validationErrors } from "../../dto/BaseLLMEvaluatorRequestDTO";
import { type OutputCategoryDTO, validateList } from "../../dto/OutputCategoryDTO";

export interface LLMEvaluatorRequestDTO extends BaseLLMEvaluatorRequestDTO {
  /** @Valid: each element's `value` must satisfy @NumberRange. */
  output_categories?: OutputCategoryDTO[] | null;
}

/** @Validated request body (MethodArgumentNotValidException format). */
export function validate(req: LLMEvaluatorRequestDTO): void {
  const errors = [...validationErrors(req), ...validateList(req.output_categories, "outputCategories")];
  if (errors.length) throw new InvalidDataException(errors.join(", "));
}
