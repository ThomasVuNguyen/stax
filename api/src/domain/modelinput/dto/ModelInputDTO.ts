/** Port of domain/modelinput/dto/ModelInputDTO (@JsonInclude(NON_NULL), snake_case). */
import type { ModelInput } from "../../../entities/ModelInput";
import type { InputRole } from "../../../enums/InputRole";
import { enrichTextForResponse } from "../../../util/PromptUtil";

export interface ModelInputDTO {
  id?: string;
  parent_input_id?: string;
  text?: string;
  raw_text?: string;
  role?: InputRole;
  expected_output?: string;
  variables?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

/** Drops null/undefined values (NON_NULL). */
function nonNull<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] == null) delete o[k];
  return o;
}

/** `new ModelInputDTO(modelInput)`: `text` is the variable-rendered text, `raw_text` the stored one. */
export function newModelInputDTO(modelInput: ModelInput): ModelInputDTO {
  return nonNull({
    id: modelInput.id ?? undefined,
    parent_input_id: modelInput.modelInputId ?? undefined,
    text: enrichTextForResponse(modelInput.text, modelInput.variables) ?? undefined,
    raw_text: modelInput.text ?? undefined,
    role: modelInput.role ?? undefined,
    expected_output: modelInput.expectedOutput ?? undefined,
    variables: modelInput.variables ?? undefined,
    created_at: modelInput.createdAt ?? undefined,
    updated_at: modelInput.updatedAt ?? undefined,
  });
}

/** `ModelInputDTO.builder()...build()`. */
export function builder(fields: ModelInputDTO = {}): ModelInputDTO {
  return nonNull({ ...fields });
}
