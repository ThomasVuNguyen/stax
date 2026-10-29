/** Port of domain/project/dto/SxsInferenceRequestDTO (snake_case JSON). */
import { InvalidDataException } from "../../../lib/errors";
import type { Prompt } from "../../../llmproviders/dto/Prompt";

export interface SxsInferenceRequestDTO {
  model_id_a?: string | null;
  model_id_b?: string | null;
  model_a_instruction?: string | null;
  model_b_instruction?: string | null;
  prompts?: Prompt[] | null;
  expected_output?: string | null;
  variables?: Record<string, string> | null;
}

/** @NotEmpty modelIdA, @NotEmpty prompts (MethodArgumentNotValidException format). */
export function validate(r: SxsInferenceRequestDTO): void {
  const errors: string[] = [];
  if (r.model_id_a == null || r.model_id_a === "") errors.push("modelIdA: At least modelIdA is required");
  if (!Array.isArray(r.prompts) || r.prompts.length === 0) errors.push("prompts: At least one prompt is required");
  if (errors.length) throw new InvalidDataException(errors.join(", "));
}
