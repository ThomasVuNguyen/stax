/** Port of domain/workbook/dto/ChatTurnUpdateRequest (snake_case JSON). */
import { validateAtLeastOneField } from "../../../annotation/AtLeastOneFieldRequired";
import type { Prompt } from "../../../llmproviders/dto/Prompt";

export interface ChatTurnUpdateRequest {
  prompt?: Prompt | null;
  model_response?: string | null;
  model_id?: string | null;
  expected_output?: string | null;
}

/** @AtLeastOneFieldRequired(fields = {"prompt", "modelId"}), a class-level (global) error. */
export function validate(r: ChatTurnUpdateRequest): void {
  validateAtLeastOneField(r, ["prompt", "model_id"], "chatTurnUpdateRequest", "Either prompt or modelId must be present");
}
