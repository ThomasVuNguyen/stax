import type { Model } from "../../../entities/Model";
import type { InferenceDTO } from "./InferenceDTO";

/**
 * Port of `record InferenceContext(Model model, String payloadJson)`. The Java payload was the
 * InferenceDTO serialised at preparation time; here it is a snapshot copy of the DTO (later
 * mutations of the DTO, e.g. inference_status_id, are not part of the message, as in Java).
 */
export interface InferenceContext {
  model: Model;
  payload: InferenceDTO;
}

export function newInferenceContext(model: Model, dto: InferenceDTO): InferenceContext {
  return { model, payload: { ...dto } };
}
