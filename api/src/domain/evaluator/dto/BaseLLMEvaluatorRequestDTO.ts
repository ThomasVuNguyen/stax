/** Port of domain/evaluator/dto/BaseLLMEvaluatorRequestDTO (JSON names). */
import type { ScoreType } from "../../../enums/ScoreType";
import type { Prompt } from "../../../llmproviders/dto/Prompt";
import type { EvaluatorVariableDTO } from "./EvaluatorVariableDTO";

export interface BaseLLMEvaluatorRequestDTO {
  name?: string | null;
  output_format_type?: ScoreType | null;
  description?: string | null;
  variables?: EvaluatorVariableDTO[] | null;
  model_id?: string | null;
  prompts?: Prompt[] | null;
}

/** Field errors of @NotNull name, @NotNull model_id, @NotEmpty prompts (Java field names). */
export function validationErrors(req: BaseLLMEvaluatorRequestDTO): string[] {
  const errors: string[] = [];
  if (req.name == null) errors.push("name: Evaluator name cannot be null");
  if (req.model_id == null) errors.push("modelId: Evaluator needs a model id");
  if (!req.prompts || !req.prompts.length) errors.push("prompts: Prompt cannot be empty");
  return errors;
}
