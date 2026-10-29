import type { Prompt } from "../../../llmproviders/dto/Prompt";

/**
 * Port of domain/inference/dto/QuickCompareInferenceRequest (JSON names). The bean-validation
 * annotations (@NotEmpty model_id, @AtLeastOneFieldRequired) are not enforced: the controller
 * does not use @Valid.
 */
export interface QuickCompareInferenceRequest {
  model_id?: string | null;
  previous_chat_turn_id?: string | null;
  prompts?: Prompt[] | null;
  variables?: Record<string, string> | null;
}
