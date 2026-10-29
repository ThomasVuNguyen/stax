/** Port of domain/evaluator/pairwise/dto/PairwiseLLMEvaluatorRequestDTO (JSON names). */
import { InvalidDataException } from "../../../../lib/errors";
import { type BaseLLMEvaluatorRequestDTO, validationErrors } from "../../dto/BaseLLMEvaluatorRequestDTO";
import type { OutputCategoryDTO } from "../../dto/OutputCategoryDTO";

export interface PairwiseLLMEvaluatorRequestDTO extends BaseLLMEvaluatorRequestDTO {
  /** Not @Valid here: category values are not range-checked. */
  output_categories?: OutputCategoryDTO[] | null;
}

/** @Valid on create only (the PATCH endpoint does not validate). */
export function validate(req: PairwiseLLMEvaluatorRequestDTO): void {
  const errors = validationErrors(req);
  if (errors.length) throw new InvalidDataException(errors.join(", "));
}
